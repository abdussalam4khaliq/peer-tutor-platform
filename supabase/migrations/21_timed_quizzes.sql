-- ============================================================
-- 21: Timed tutor quizzes
--
-- Tutors host quizzes for their course with an availability window
-- (opens_at -> closes_at) and a per-student time limit (duration_minutes).
-- Question types:
--   mcq    - multiple choice, auto-graded
--   short  - typed answer; auto-graded if the tutor lists accepted answers,
--            otherwise marked by hand
--   upload - student photographs their written working; always marked by hand
--
-- Security model: students never read quiz_questions directly (that table holds
-- the correct answers). They go through the RPCs below, which enforce the
-- deadline on the SERVER. All writes go through RPCs too.
-- ============================================================

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  instructions text,
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  duration_minutes int not null check (duration_minutes between 1 and 600),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closes_at > opens_at)
);
create index if not exists quizzes_course_idx on public.quizzes (course_id);

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  position int not null,
  kind text not null check (kind in ('mcq', 'short', 'upload')),
  prompt text not null,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  correct_option text check (correct_option in ('a', 'b', 'c', 'd')),
  accepted_answers text[] not null default '{}',
  points numeric not null default 1 check (points > 0 and points <= 100),
  unique (quiz_id, position)
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  submitted_at timestamptz,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'graded')),
  total_points numeric not null default 0,
  auto_points numeric not null default 0,
  manual_points numeric not null default 0,
  pending_manual int not null default 0,
  unique (quiz_id, student_id)
);
create index if not exists quiz_attempts_student_idx on public.quiz_attempts (student_id);

create table if not exists public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  selected_option text check (selected_option in ('a', 'b', 'c', 'd')),
  answer_text text,
  image_path text,
  is_correct boolean,
  needs_manual boolean not null default false,
  points_awarded numeric not null default 0,
  tutor_comment text,
  graded_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

-- ---------- helpers ----------

create or replace function public.can_manage_quiz(p_quiz_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.quizzes q
    join public.courses c on c.id = q.course_id
    where q.id = p_quiz_id and c.tutor_id = auth.uid()
  )
  or public.current_user_role() in ('admin', 'super_admin');
$$;

create or replace function public.normalize_quiz_text(p_text text)
returns text
language sql
immutable
as $$
  select lower(btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g')));
$$;

-- ---------- row level security (reads only; writes go through RPCs) ----------

alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_answers enable row level security;

create policy "view quizzes" on public.quizzes
  for select using (
    public.can_manage_quiz(id)
    or (published and public.is_entitled_to_course(course_id))
  );

create policy "tutor deletes own quiz" on public.quizzes
  for delete using (public.can_manage_quiz(id));

-- Only the tutor/admin can read questions directly (they contain the answers).
create policy "staff view quiz questions" on public.quiz_questions
  for select using (public.can_manage_quiz(quiz_id));

create policy "view own or managed attempts" on public.quiz_attempts
  for select using (student_id = auth.uid() or public.can_manage_quiz(quiz_id));

-- A student can read their own answers only while the attempt is in progress
-- (to restore what they typed after a refresh). After submission they use
-- get_quiz_result(), which hides correct answers until the quiz closes.
create policy "view answers" on public.quiz_answers
  for select using (
    exists (
      select 1 from public.quiz_attempts a
      where a.id = quiz_answers.attempt_id
        and (
          public.can_manage_quiz(a.quiz_id)
          or (a.student_id = auth.uid() and a.status = 'in_progress')
        )
    )
  );

-- ---------- storage: photos of written working ----------
-- Path layout: <student_id>/<attempt_id>/<file>

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quiz-answers', 'quiz-answers', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "students upload own quiz images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'quiz-answers' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "students view own quiz images" on storage.objects
  for select to authenticated
  using (bucket_id = 'quiz-answers' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "tutors and admins view quiz images" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'quiz-answers'
    and exists (
      select 1 from public.quiz_attempts a
      where a.id::text = (storage.foldername(name))[2]
        and public.can_manage_quiz(a.quiz_id)
    )
  );

-- ============================================================
-- Tutor: create or update a quiz atomically
-- p_quiz_id null  -> create. p_questions is a jsonb array:
--   [{ "kind": "mcq", "prompt": "...", "points": 1,
--      "option_a": "..", "option_b": "..", "option_c": "..", "option_d": "..",
--      "correct_option": "a" },
--    { "kind": "short", "prompt": "...", "points": 2, "accepted_answers": ["42"] },
--    { "kind": "upload", "prompt": "...", "points": 5 }]
-- Once any student has started, questions are frozen (only settings change).
-- ============================================================
create or replace function public.save_quiz(
  p_quiz_id uuid,
  p_course_id uuid,
  p_title text,
  p_instructions text,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_duration_minutes int,
  p_published boolean,
  p_questions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_quiz_id uuid := p_quiz_id;
  v_course uuid;
  v_has_attempts boolean := false;
  v_count int;
  v_q jsonb;
  v_i int := 0;
  v_kind text;
  v_prompt text;
  v_points numeric;
  v_accepted text[];
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_active_user() then
    raise exception 'Your account is suspended.';
  end if;

  if p_quiz_id is null then
    v_course := p_course_id;
  else
    select q.course_id into v_course from public.quizzes q where q.id = p_quiz_id;
    if v_course is null then
      raise exception 'Quiz not found';
    end if;
    select exists (select 1 from public.quiz_attempts a where a.quiz_id = p_quiz_id) into v_has_attempts;
  end if;

  if not exists (select 1 from public.courses c where c.id = v_course and c.tutor_id = v_user) then
    raise exception 'Only the tutor of this course can manage its quizzes';
  end if;

  if p_title is null or char_length(btrim(p_title)) = 0 then
    raise exception 'Give the quiz a title';
  end if;
  if p_opens_at is null or p_closes_at is null or p_closes_at <= p_opens_at then
    raise exception 'The closing time must be after the opening time';
  end if;
  if p_duration_minutes is null or p_duration_minutes < 1 or p_duration_minutes > 600 then
    raise exception 'Time limit must be between 1 and 600 minutes';
  end if;

  if not v_has_attempts then
    if p_questions is null or jsonb_typeof(p_questions) <> 'array' then
      raise exception 'Questions are missing';
    end if;
    v_count := jsonb_array_length(p_questions);
    if v_count > 60 then
      raise exception 'A quiz can have at most 60 questions';
    end if;
    if p_published and v_count = 0 then
      raise exception 'Add at least one question before publishing';
    end if;

    -- validate everything before writing anything
    for v_q in select * from jsonb_array_elements(p_questions) loop
      v_i := v_i + 1;
      v_kind := v_q->>'kind';
      v_prompt := btrim(coalesce(v_q->>'prompt', ''));
      if v_kind not in ('mcq', 'short', 'upload') then
        raise exception 'Question %: unknown type', v_i;
      end if;
      if v_prompt = '' or char_length(v_prompt) > 4000 then
        raise exception 'Question %: write the question (max 4000 characters)', v_i;
      end if;
      begin
        v_points := coalesce((v_q->>'points')::numeric, 1);
      exception when others then
        raise exception 'Question %: points must be a number', v_i;
      end;
      if v_points <= 0 or v_points > 100 then
        raise exception 'Question %: points must be between 0 and 100', v_i;
      end if;
      if v_kind = 'mcq' then
        if coalesce(btrim(v_q->>'option_a'), '') = '' or coalesce(btrim(v_q->>'option_b'), '') = ''
           or coalesce(btrim(v_q->>'option_c'), '') = '' or coalesce(btrim(v_q->>'option_d'), '') = '' then
          raise exception 'Question %: fill in all four options', v_i;
        end if;
        if coalesce(v_q->>'correct_option', '') not in ('a', 'b', 'c', 'd') then
          raise exception 'Question %: pick the correct option', v_i;
        end if;
      end if;
    end loop;
  end if;

  if p_quiz_id is null then
    insert into public.quizzes (course_id, created_by, title, instructions, opens_at, closes_at, duration_minutes, published)
    values (v_course, v_user, btrim(p_title), nullif(btrim(coalesce(p_instructions, '')), ''), p_opens_at, p_closes_at, p_duration_minutes, coalesce(p_published, false))
    returning id into v_quiz_id;
  else
    update public.quizzes
    set title = btrim(p_title),
        instructions = nullif(btrim(coalesce(p_instructions, '')), ''),
        opens_at = p_opens_at,
        closes_at = p_closes_at,
        duration_minutes = p_duration_minutes,
        published = coalesce(p_published, false),
        updated_at = now()
    where id = p_quiz_id;
  end if;

  if not v_has_attempts then
    delete from public.quiz_questions where quiz_id = v_quiz_id;
    v_i := 0;
    for v_q in select * from jsonb_array_elements(p_questions) loop
      v_i := v_i + 1;
      v_kind := v_q->>'kind';
      v_accepted := case
        when v_kind = 'short' and jsonb_typeof(v_q->'accepted_answers') = 'array'
          then array(select btrim(x) from jsonb_array_elements_text(v_q->'accepted_answers') x where btrim(x) <> '')
        else '{}'::text[]
      end;
      insert into public.quiz_questions
        (quiz_id, position, kind, prompt, option_a, option_b, option_c, option_d, correct_option, accepted_answers, points)
      values (
        v_quiz_id, v_i, v_kind, btrim(v_q->>'prompt'),
        case when v_kind = 'mcq' then btrim(v_q->>'option_a') end,
        case when v_kind = 'mcq' then btrim(v_q->>'option_b') end,
        case when v_kind = 'mcq' then btrim(v_q->>'option_c') end,
        case when v_kind = 'mcq' then btrim(v_q->>'option_d') end,
        case when v_kind = 'mcq' then v_q->>'correct_option' end,
        v_accepted,
        coalesce((v_q->>'points')::numeric, 1)
      );
    end loop;
  end if;

  return v_quiz_id;
end;
$$;

-- ============================================================
-- Student: start (or resume) an attempt. The deadline is fixed here, on the
-- server: the shorter of (now + time limit) and the quiz's closing time.
-- ============================================================
create or replace function public.start_quiz_attempt(p_quiz_id uuid)
returns table(out_attempt_id uuid, out_deadline timestamptz, out_server_now timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid := auth.uid();
  v_quiz public.quizzes%rowtype;
  v_attempt public.quiz_attempts%rowtype;
begin
  if v_student is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_active_user() then
    raise exception 'Your account is suspended.';
  end if;

  select * into v_quiz from public.quizzes q where q.id = p_quiz_id;
  if v_quiz.id is null or not v_quiz.published then
    raise exception 'Quiz not found';
  end if;

  if exists (select 1 from public.courses c where c.id = v_quiz.course_id and c.tutor_id = v_student) then
    raise exception 'Tutors cannot take their own quiz';
  end if;
  if not public.is_entitled_to_course(v_quiz.course_id) then
    raise exception 'You do not have access to this course';
  end if;

  select * into v_attempt from public.quiz_attempts a where a.quiz_id = p_quiz_id and a.student_id = v_student;

  if v_attempt.id is not null then
    if v_attempt.status = 'in_progress' then
      -- Resume. If the time already ran out, close it out now (no exception
      -- here, or the grading would be rolled back); the page then shows it as finished.
      if now() > v_attempt.deadline_at + interval '15 seconds' then
        perform public.finalize_quiz_attempt(v_attempt.id);
      end if;
      return query select v_attempt.id, v_attempt.deadline_at, now();
      return;
    end if;
    raise exception 'You have already taken this quiz';
  end if;

  if now() < v_quiz.opens_at then
    raise exception 'This quiz has not opened yet';
  end if;
  if now() >= v_quiz.closes_at then
    raise exception 'This quiz has closed';
  end if;

  insert into public.quiz_attempts (quiz_id, student_id, deadline_at)
  values (p_quiz_id, v_student, least(now() + make_interval(mins => v_quiz.duration_minutes), v_quiz.closes_at))
  returning * into v_attempt;

  return query select v_attempt.id, v_attempt.deadline_at, now();
end;
$$;

-- Questions for an in-progress attempt (never includes correct answers).
create or replace function public.get_quiz_questions(p_attempt_id uuid)
returns table(
  q_id uuid, q_position int, q_kind text, q_prompt text,
  q_option_a text, q_option_b text, q_option_c text, q_option_d text,
  q_points numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.quiz_attempts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_attempt from public.quiz_attempts a where a.id = p_attempt_id and a.student_id = auth.uid();
  if v_attempt.id is null then
    raise exception 'Attempt not found';
  end if;
  if v_attempt.status <> 'in_progress' or now() > v_attempt.deadline_at + interval '15 seconds' then
    raise exception 'This attempt is finished';
  end if;

  return query
  select qq.id, qq.position, qq.kind, qq.prompt, qq.option_a, qq.option_b, qq.option_c, qq.option_d, qq.points
  from public.quiz_questions qq
  where qq.quiz_id = v_attempt.quiz_id
  order by qq.position;
end;
$$;

-- Save the current answer to one question (called as the student works).
create or replace function public.save_quiz_answer(
  p_attempt_id uuid,
  p_question_id uuid,
  p_option text,
  p_text text,
  p_image_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid := auth.uid();
  v_attempt public.quiz_attempts%rowtype;
begin
  if v_student is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_attempt from public.quiz_attempts a where a.id = p_attempt_id and a.student_id = v_student;
  if v_attempt.id is null then
    raise exception 'Attempt not found';
  end if;
  if v_attempt.status <> 'in_progress' or now() > v_attempt.deadline_at + interval '15 seconds' then
    raise exception 'Time is up. Your answers can no longer be changed.';
  end if;

  if not exists (select 1 from public.quiz_questions qq where qq.id = p_question_id and qq.quiz_id = v_attempt.quiz_id) then
    raise exception 'Question not found';
  end if;
  if p_option is not null and p_option not in ('a', 'b', 'c', 'd') then
    raise exception 'Invalid option';
  end if;
  if p_text is not null and char_length(p_text) > 5000 then
    raise exception 'Answer is too long';
  end if;
  if p_image_path is not null
     and p_image_path not like v_student::text || '/' || p_attempt_id::text || '/%' then
    raise exception 'Invalid image';
  end if;

  insert into public.quiz_answers (attempt_id, question_id, selected_option, answer_text, image_path, updated_at)
  values (p_attempt_id, p_question_id, p_option, p_text, p_image_path, now())
  on conflict (attempt_id, question_id) do update
  set selected_option = excluded.selected_option,
      answer_text = excluded.answer_text,
      image_path = excluded.image_path,
      updated_at = now();
end;
$$;

-- Internal: grade everything that can be graded automatically and close the attempt.
create or replace function public.finalize_quiz_attempt(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quiz uuid;
  v_status text;
begin
  select a.quiz_id, a.status into v_quiz, v_status
  from public.quiz_attempts a where a.id = p_attempt_id for update;

  if v_quiz is null or v_status <> 'in_progress' then
    return;
  end if;

  insert into public.quiz_answers (attempt_id, question_id)
  select p_attempt_id, qq.id from public.quiz_questions qq where qq.quiz_id = v_quiz
  on conflict (attempt_id, question_id) do nothing;

  update public.quiz_answers qa
  set is_correct = case
        when qq.kind = 'mcq' then (qa.selected_option is not null and qa.selected_option = qq.correct_option)
        when qq.kind = 'short' and coalesce(array_length(qq.accepted_answers, 1), 0) > 0 then
          (public.normalize_quiz_text(qa.answer_text) <> ''
           and exists (
             select 1 from unnest(qq.accepted_answers) acc
             where public.normalize_quiz_text(acc) = public.normalize_quiz_text(qa.answer_text)
           ))
        else null
      end,
      needs_manual = case
        when qq.kind = 'upload' then (qa.image_path is not null or public.normalize_quiz_text(qa.answer_text) <> '')
        when qq.kind = 'short' and coalesce(array_length(qq.accepted_answers, 1), 0) = 0
          then public.normalize_quiz_text(qa.answer_text) <> ''
        else false
      end
  from public.quiz_questions qq
  where qa.attempt_id = p_attempt_id and qq.id = qa.question_id;

  update public.quiz_answers qa
  set points_awarded = case when qa.is_correct then qq.points else 0 end
  from public.quiz_questions qq
  where qa.attempt_id = p_attempt_id and qq.id = qa.question_id and not qa.needs_manual;

  update public.quiz_attempts a
  set total_points = (select coalesce(sum(qq.points), 0) from public.quiz_questions qq where qq.quiz_id = v_quiz),
      auto_points = (select coalesce(sum(qa.points_awarded), 0) from public.quiz_answers qa where qa.attempt_id = a.id and not qa.needs_manual),
      manual_points = 0,
      pending_manual = (select count(*) from public.quiz_answers qa where qa.attempt_id = a.id and qa.needs_manual),
      submitted_at = coalesce(a.submitted_at, now()),
      status = case
        when exists (select 1 from public.quiz_answers qa where qa.attempt_id = a.id and qa.needs_manual) then 'submitted'
        else 'graded'
      end
  where a.id = p_attempt_id;
end;
$$;

create or replace function public.submit_quiz_attempt(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from public.quiz_attempts a where a.id = p_attempt_id and a.student_id = auth.uid()) then
    raise exception 'Attempt not found';
  end if;
  perform public.finalize_quiz_attempt(p_attempt_id);
end;
$$;

-- Attempts that ran out of time without being submitted get closed out here.
-- Safe for anyone with access to the course to trigger (it is deterministic).
create or replace function public.finalize_expired_quiz_attempts(p_quiz_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course uuid;
  v_id uuid;
  v_n int := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select q.course_id into v_course from public.quizzes q where q.id = p_quiz_id;
  if v_course is null or not public.is_entitled_to_course(v_course) then
    return 0;
  end if;
  for v_id in
    select a.id from public.quiz_attempts a
    where a.quiz_id = p_quiz_id and a.status = 'in_progress'
      and now() > a.deadline_at + interval '15 seconds'
  loop
    perform public.finalize_quiz_attempt(v_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Student view of a finished attempt. Correct answers and marks are held back
-- until the quiz closes, so answers can't be passed to classmates still writing.
create or replace function public.get_quiz_result(p_attempt_id uuid)
returns table(
  r_question_id uuid, r_position int, r_kind text, r_prompt text,
  r_option_a text, r_option_b text, r_option_c text, r_option_d text,
  r_points numeric, r_selected_option text, r_answer_text text, r_image_path text,
  r_points_awarded numeric, r_needs_manual boolean, r_graded boolean,
  r_tutor_comment text, r_correct_option text, r_is_correct boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.quiz_attempts%rowtype;
  v_closes timestamptz;
  v_is_owner boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_attempt from public.quiz_attempts a where a.id = p_attempt_id;
  if v_attempt.id is null then
    raise exception 'Attempt not found';
  end if;

  v_is_owner := v_attempt.student_id = auth.uid();
  if not v_is_owner and not public.can_manage_quiz(v_attempt.quiz_id) then
    raise exception 'Attempt not found';
  end if;
  if v_attempt.status = 'in_progress' then
    raise exception 'This attempt is not finished yet';
  end if;

  select q.closes_at into v_closes from public.quizzes q where q.id = v_attempt.quiz_id;
  if v_is_owner and now() < v_closes and not public.can_manage_quiz(v_attempt.quiz_id) then
    raise exception 'Results are released when the quiz closes';
  end if;

  return query
  select qq.id, qq.position, qq.kind, qq.prompt,
         qq.option_a, qq.option_b, qq.option_c, qq.option_d,
         qq.points, qa.selected_option, qa.answer_text, qa.image_path,
         qa.points_awarded, coalesce(qa.needs_manual, false),
         (qa.graded_at is not null),
         qa.tutor_comment, qq.correct_option, qa.is_correct
  from public.quiz_questions qq
  left join public.quiz_answers qa on qa.question_id = qq.id and qa.attempt_id = p_attempt_id
  where qq.quiz_id = v_attempt.quiz_id
  order by qq.position;
end;
$$;

-- Tutor: every student's attempt with their name.
create or replace function public.get_quiz_attempts(p_quiz_id uuid)
returns table(
  a_attempt_id uuid, a_student_id uuid, a_student_name text, a_status text,
  a_started_at timestamptz, a_submitted_at timestamptz,
  a_auto_points numeric, a_manual_points numeric, a_total_points numeric, a_pending_manual int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.can_manage_quiz(p_quiz_id) then
    raise exception 'Not allowed';
  end if;

  perform public.finalize_expired_quiz_attempts(p_quiz_id);

  return query
  select a.id, a.student_id, p.full_name::text, a.status,
         a.started_at, a.submitted_at,
         a.auto_points, a.manual_points, a.total_points, a.pending_manual
  from public.quiz_attempts a
  join public.profiles p on p.id = a.student_id
  where a.quiz_id = p_quiz_id
  order by p.full_name;
end;
$$;

-- Tutor: mark one hand-marked answer.
create or replace function public.grade_quiz_answer(p_answer_id uuid, p_points numeric, p_comment text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt uuid;
  v_quiz uuid;
  v_max numeric;
  v_status text;
  v_needs boolean;
begin
  select qa.attempt_id, qa.needs_manual, qq.points, a.quiz_id, a.status
  into v_attempt, v_needs, v_max, v_quiz, v_status
  from public.quiz_answers qa
  join public.quiz_questions qq on qq.id = qa.question_id
  join public.quiz_attempts a on a.id = qa.attempt_id
  where qa.id = p_answer_id;

  if v_attempt is null then
    raise exception 'Answer not found';
  end if;
  if not public.can_manage_quiz(v_quiz) then
    raise exception 'Not allowed';
  end if;
  if v_status = 'in_progress' then
    raise exception 'The student is still working on this quiz';
  end if;
  if not v_needs then
    raise exception 'This answer is graded automatically';
  end if;
  if p_points is null or p_points < 0 or p_points > v_max then
    raise exception 'Points must be between 0 and %', v_max;
  end if;

  update public.quiz_answers
  set points_awarded = p_points,
      tutor_comment = nullif(btrim(coalesce(p_comment, '')), ''),
      graded_at = now()
  where id = p_answer_id;

  update public.quiz_attempts a
  set manual_points = (select coalesce(sum(qa.points_awarded), 0) from public.quiz_answers qa
                       where qa.attempt_id = a.id and qa.needs_manual and qa.graded_at is not null),
      pending_manual = (select count(*) from public.quiz_answers qa
                        where qa.attempt_id = a.id and qa.needs_manual and qa.graded_at is null),
      status = case
        when exists (select 1 from public.quiz_answers qa
                     where qa.attempt_id = a.id and qa.needs_manual and qa.graded_at is null) then 'submitted'
        else 'graded'
      end
  where a.id = v_attempt;
end;
$$;

-- ---------- permissions ----------
revoke all on function public.finalize_quiz_attempt(uuid) from public, anon, authenticated;

revoke all on function public.save_quiz(uuid, uuid, text, text, timestamptz, timestamptz, int, boolean, jsonb) from public, anon;
revoke all on function public.start_quiz_attempt(uuid) from public, anon;
revoke all on function public.get_quiz_questions(uuid) from public, anon;
revoke all on function public.save_quiz_answer(uuid, uuid, text, text, text) from public, anon;
revoke all on function public.submit_quiz_attempt(uuid) from public, anon;
revoke all on function public.finalize_expired_quiz_attempts(uuid) from public, anon;
revoke all on function public.get_quiz_result(uuid) from public, anon;
revoke all on function public.get_quiz_attempts(uuid) from public, anon;
revoke all on function public.grade_quiz_answer(uuid, numeric, text) from public, anon;

grant execute on function public.save_quiz(uuid, uuid, text, text, timestamptz, timestamptz, int, boolean, jsonb) to authenticated;
grant execute on function public.start_quiz_attempt(uuid) to authenticated;
grant execute on function public.get_quiz_questions(uuid) to authenticated;
grant execute on function public.save_quiz_answer(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.submit_quiz_attempt(uuid) to authenticated;
grant execute on function public.finalize_expired_quiz_attempts(uuid) to authenticated;
grant execute on function public.get_quiz_result(uuid) to authenticated;
grant execute on function public.get_quiz_attempts(uuid) to authenticated;
grant execute on function public.grade_quiz_answer(uuid, numeric, text) to authenticated;
