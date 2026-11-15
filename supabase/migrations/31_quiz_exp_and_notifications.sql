-- ============================================================
-- 31: Quiz EXP + quiz notifications
--
-- EXP
--   * 10 EXP per question (double a topic-test question, because a quiz is one
--     timed attempt with no retake), scaled by the marks earned, capped at 100
--     per quiz. Both numbers live in site_settings so they can be tuned.
--   * Paid once the attempt is fully marked, through student_stats + exp_ledger
--     (so leagues and leaderboards pick it up). If a tutor later corrects a
--     mark, the difference is applied (a negative ledger row if it goes down).
--   * Taking a quiz counts as activity for the day's streak.
--
-- NOTIFICATIONS (uses your existing notifications table + push trigger)
--   quiz_new      students: a quiz was scheduled
--   quiz_open     students: the quiz is open now
--   quiz_closing  students who haven't started: closes within the hour (only if they were told it opened 30+ min earlier)
--   quiz_results  students: results are ready (after the quiz closes and it is marked)
--   quiz_to_mark  tutor: answers are waiting for marks (after the quiz closes)
--   pg_cron runs send_quiz_notifications() every 5 minutes. It also closes out
--   attempts whose time ran out, so results and EXP don't wait for someone to
--   open a page. Each message is sent once per quiz.
-- ============================================================

-- ---------- columns ----------
alter table public.quizzes
  add column if not exists notified_new_at timestamptz,
  add column if not exists notified_open_at timestamptz,
  add column if not exists notified_closing_at timestamptz,
  add column if not exists notified_tutor_at timestamptz;

alter table public.quiz_attempts
  add column if not exists exp_awarded numeric not null default 0,
  add column if not exists exp_awarded_at timestamptz,
  add column if not exists results_notified_at timestamptz;

alter table public.site_settings
  add column if not exists quiz_exp_per_question numeric not null default 10 check (quiz_exp_per_question >= 0),
  add column if not exists quiz_exp_cap numeric not null default 100 check (quiz_exp_cap >= 0);

-- Quizzes that already exist are grandfathered: nobody is notified about them retroactively
-- (otherwise the first cron run would announce an old or test quiz to every student).
-- Only quizzes published from now on are announced.
update public.quizzes
set notified_new_at = coalesce(notified_new_at, now()),
    notified_open_at = case when opens_at <= now() then coalesce(notified_open_at, now()) else notified_open_at end,
    notified_closing_at = case when closes_at <= now() then coalesce(notified_closing_at, now()) else notified_closing_at end,
    notified_tutor_at = case when closes_at <= now() then coalesce(notified_tutor_at, now()) else notified_tutor_at end;

update public.quiz_attempts a
set results_notified_at = coalesce(a.results_notified_at, now())
from public.quizzes q
where q.id = a.quiz_id and q.closes_at <= now();

-- ---------- allowed values: keep everything already allowed, add ours ----------
-- (reads the live list instead of hard-coding it, so nothing added since is lost)
do $$
declare
  v_def text;
  v_old text[] := '{}';
  v_new text[] := array['quiz_new', 'quiz_open', 'quiz_closing', 'quiz_results', 'quiz_to_mark'];
  v_all text[];
  v_body text;
begin
  select pg_get_constraintdef(c.oid) into v_def
  from pg_constraint c
  where c.conrelid = 'public.notifications'::regclass and c.conname = 'notifications_type_check';

  if v_def is not null then
    if v_def ~ '\{[^}]*\}' then
      -- ANY ('{a,b,c}'::text[]) form
      v_body := substring(v_def from '\{([^}]*)\}');
      v_old := string_to_array(v_body, ',');
    else
      -- ANY (ARRAY['a'::text, 'b'::text]) form
      select coalesce(array_agg(m[1]), '{}') into v_old
      from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m;
    end if;
  end if;

  select array_agg(distinct t order by t) into v_all from unnest(v_old || v_new) as t;

  alter table public.notifications drop constraint if exists notifications_type_check;
  execute format('alter table public.notifications add constraint notifications_type_check check (type = any (%L::text[]))', v_all);
end $$;

do $$
declare v_name text;
begin
  select c.conname into v_name
  from pg_constraint c
  where c.conrelid = 'public.exp_ledger'::regclass and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%topic_upload%';
  if v_name is not null then
    execute format('alter table public.exp_ledger drop constraint %I', v_name);
  end if;
  alter table public.exp_ledger drop constraint if exists exp_ledger_source_check;
  alter table public.exp_ledger add constraint exp_ledger_source_check
    check (source in ('test', 'rating_reply', 'rating_question', 'rating_topic', 'forum_post', 'topic_upload', 'quiz'));
end $$;

-- ---------- streak helper (same rules as topic tests) ----------
create or replace function public.bump_student_streak(p_student uuid, p_day date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last date;
  v_cur int;
begin
  select ss.last_activity_date, ss.current_streak into v_last, v_cur
  from public.student_stats ss where ss.student_id = p_student;

  if not found then
    insert into public.student_stats (student_id, current_streak, longest_streak, last_activity_date)
    values (p_student, 1, 1, p_day)
    on conflict (student_id) do nothing;
    return;
  end if;

  if v_last is not null and v_last >= p_day then
    return;  -- that day (or a later one) is already counted
  end if;

  v_cur := case when v_last = p_day - 1 then coalesce(v_cur, 0) + 1 else 1 end;

  update public.student_stats ss
  set current_streak = v_cur,
      longest_streak = greatest(ss.longest_streak, v_cur),
      last_activity_date = p_day
  where ss.student_id = p_student;
end;
$$;

-- ---------- EXP ----------
create or replace function public.award_quiz_exp(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
  v_quiz uuid;
  v_status text;
  v_awarded numeric;
  v_per numeric;
  v_cap numeric;
  v_n int;
  v_target numeric;
  v_delta numeric;
begin
  select a.student_id, a.quiz_id, a.status, a.exp_awarded into v_student, v_quiz, v_status, v_awarded
  from public.quiz_attempts a where a.id = p_attempt_id for update;

  if v_student is null or v_status <> 'graded' then
    return;  -- only fully marked attempts earn EXP
  end if;

  select s.quiz_exp_per_question, s.quiz_exp_cap into v_per, v_cap from public.site_settings s limit 1;
  v_per := coalesce(v_per, 10);
  v_cap := coalesce(v_cap, 100);

  select count(*) into v_n from public.quiz_questions qq where qq.quiz_id = v_quiz;
  if v_n = 0 then
    return;
  end if;

  -- the cap is shared across questions when a quiz has more than cap / per questions
  v_per := least(v_per, v_cap / v_n);

  select round(coalesce(sum(v_per * least(greatest(coalesce(qa.points_awarded, 0), 0) / qq.points, 1)), 0), 0)
  into v_target
  from public.quiz_questions qq
  left join public.quiz_answers qa on qa.question_id = qq.id and qa.attempt_id = p_attempt_id
  where qq.quiz_id = v_quiz;

  v_delta := v_target - v_awarded;
  if v_delta = 0 then
    update public.quiz_attempts a set exp_awarded_at = coalesce(a.exp_awarded_at, now()) where a.id = p_attempt_id;
    return;
  end if;

  insert into public.student_stats (student_id, total_exp, period_exp)
  values (v_student, greatest(v_delta, 0), greatest(v_delta, 0))
  on conflict (student_id) do update
  set total_exp = greatest(student_stats.total_exp + v_delta, 0),
      period_exp = greatest(student_stats.period_exp + v_delta, 0);

  insert into public.exp_ledger (profile_id, amount, source) values (v_student, v_delta, 'quiz');

  update public.quiz_attempts a
  set exp_awarded = v_target, exp_awarded_at = now()
  where a.id = p_attempt_id;
end;
$$;

create or replace function public.finalize_quiz_attempt(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quiz uuid;
  v_status text;
  v_student uuid;
  v_deadline timestamptz;
begin
  select a.quiz_id, a.status, a.student_id, a.deadline_at into v_quiz, v_status, v_student, v_deadline
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

  -- taking a quiz counts as activity for the day's streak; EXP is paid once it is fully marked
  perform public.bump_student_streak(v_student, (least(now(), v_deadline))::date);
  perform public.award_quiz_exp(p_attempt_id);
end;
$$;

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

  perform public.award_quiz_exp(v_attempt);
end;
$$;

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
        -- moving a time into the future re-arms that reminder (other edits don't re-send anything)
        notified_open_at = case when p_opens_at is distinct from opens_at and p_opens_at > now() then null else notified_open_at end,
        notified_closing_at = case when p_closes_at is distinct from closes_at and p_closes_at > now() then null else notified_closing_at end,
        notified_tutor_at = case when p_closes_at is distinct from closes_at and p_closes_at > now() then null else notified_tutor_at end,
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
-- Notifications (run by pg_cron every 5 minutes)
-- ============================================================
create or replace function public.send_quiz_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- 0. close out attempts whose time ran out (grades them and pays EXP)
  for v_id in
    select a.id from public.quiz_attempts a
    where a.status = 'in_progress' and now() > a.deadline_at + interval '15 seconds'
  loop
    perform public.finalize_quiz_attempt(v_id);
  end loop;

  -- 1. published and already open: one "open now" message (no separate "scheduled" one)
  with due as (
    update public.quizzes q
    set notified_new_at = now(), notified_open_at = now()
    where q.published and q.notified_new_at is null and q.opens_at <= now()
    returning q.id, q.course_id, q.title, q.closes_at, q.duration_minutes
  )
  insert into public.notifications (profile_id, type, title, body, link)
  select e.student_id, 'quiz_open', 'Quiz open: ' || d.title,
         d.duration_minutes || ' minutes once you start. Closes ' ||
           to_char(d.closes_at at time zone 'Africa/Lagos', 'FMDy DD Mon, FMHH12:MI AM') || '.',
         '/courses/' || d.course_id || '/quizzes/' || d.id
  from due d
  join public.enrollments e on e.course_id = d.course_id
  join public.profiles p on p.id = e.student_id and p.status = 'active'
  where d.closes_at > now()
    and (now() < e.trial_ends_at or (e.paid_until is not null and now() < e.paid_until));

  -- 2. published for later: one "scheduled" message
  with due as (
    update public.quizzes q
    set notified_new_at = now()
    where q.published and q.notified_new_at is null and q.opens_at > now()
    returning q.id, q.course_id, q.title, q.opens_at, q.closes_at, q.duration_minutes
  )
  insert into public.notifications (profile_id, type, title, body, link)
  select e.student_id, 'quiz_new', 'New quiz: ' || d.title,
         'Opens ' || to_char(d.opens_at at time zone 'Africa/Lagos', 'FMDy DD Mon, FMHH12:MI AM') ||
           ' and closes ' || to_char(d.closes_at at time zone 'Africa/Lagos', 'FMDy DD Mon, FMHH12:MI AM') ||
           '. You get ' || d.duration_minutes || ' minutes once you start.',
         '/courses/' || d.course_id || '/quizzes/' || d.id
  from due d
  join public.enrollments e on e.course_id = d.course_id
  join public.profiles p on p.id = e.student_id and p.status = 'active'
  where now() < e.trial_ends_at or (e.paid_until is not null and now() < e.paid_until);

  -- 3. a scheduled quiz has now opened
  with due as (
    update public.quizzes q
    set notified_open_at = now()
    where q.published and q.notified_open_at is null and q.notified_new_at is not null
      and q.opens_at <= now() and q.closes_at > now()
    returning q.id, q.course_id, q.title, q.closes_at, q.duration_minutes
  )
  insert into public.notifications (profile_id, type, title, body, link)
  select e.student_id, 'quiz_open', 'Quiz open: ' || d.title,
         d.duration_minutes || ' minutes once you start. Closes ' ||
           to_char(d.closes_at at time zone 'Africa/Lagos', 'FMDy DD Mon, FMHH12:MI AM') || '.',
         '/courses/' || d.course_id || '/quizzes/' || d.id
  from due d
  join public.enrollments e on e.course_id = d.course_id
  join public.profiles p on p.id = e.student_id and p.status = 'active'
  where now() < e.trial_ends_at or (e.paid_until is not null and now() < e.paid_until);

  -- (a quiz that closed before anyone was told it was open needs no "open" message)
  update public.quizzes q set notified_open_at = now()
  where q.published and q.notified_open_at is null and q.closes_at <= now();

  -- 4. closing within the hour, only for students who haven't started
  --    (skipped for quizzes whose whole window is 2 hours or less)
  with due as (
    update public.quizzes q
    set notified_closing_at = now()
    where q.published and q.notified_closing_at is null and q.notified_open_at is not null
      and q.notified_open_at <= now() - interval '30 minutes'   -- not in the same breath as "open now"
      and q.closes_at > now() and q.closes_at - now() <= interval '1 hour'
      and q.closes_at - q.opens_at > interval '2 hours'
    returning q.id, q.course_id, q.title, q.closes_at
  )
  insert into public.notifications (profile_id, type, title, body, link)
  select e.student_id, 'quiz_closing', 'Closing soon: ' || d.title,
         'This quiz closes at ' || to_char(d.closes_at at time zone 'Africa/Lagos', 'FMHH12:MI AM') ||
           ' and you haven''t started it yet.',
         '/courses/' || d.course_id || '/quizzes/' || d.id
  from due d
  join public.enrollments e on e.course_id = d.course_id
  join public.profiles p on p.id = e.student_id and p.status = 'active'
  where (now() < e.trial_ends_at or (e.paid_until is not null and now() < e.paid_until))
    and not exists (
      select 1 from public.quiz_attempts a where a.quiz_id = d.id and a.student_id = e.student_id
    );

  -- 5. results ready: the quiz has closed and the attempt is fully marked
  with due as (
    update public.quiz_attempts a
    set results_notified_at = now()
    from public.quizzes q
    where q.id = a.quiz_id and q.published and q.closes_at <= now()
      and a.status = 'graded' and a.results_notified_at is null
    returning a.student_id, a.quiz_id, q.course_id, q.title,
              a.auto_points, a.manual_points, a.total_points, a.exp_awarded
  )
  insert into public.notifications (profile_id, type, title, body, link)
  select d.student_id, 'quiz_results', 'Results ready: ' || d.title,
         'You scored ' ||
           rtrim(rtrim(to_char(d.auto_points + d.manual_points, 'FM999990.00'), '0'), '.') || ' / ' ||
           rtrim(rtrim(to_char(d.total_points, 'FM999990.00'), '0'), '.') ||
           case when d.exp_awarded > 0 then ' and earned ' || d.exp_awarded::int || ' EXP.' else '.' end,
         '/courses/' || d.course_id || '/quizzes/' || d.quiz_id
  from due d;

  -- 6. tutor: answers waiting to be marked (a minute after closing, so late submissions are in)
  with due as (
    update public.quizzes q
    set notified_tutor_at = now()
    where q.published and q.notified_tutor_at is null and q.closes_at <= now() - interval '1 minute'
    returning q.id, q.course_id, q.title
  )
  insert into public.notifications (profile_id, type, title, body, link)
  select c.tutor_id, 'quiz_to_mark', 'Quiz to mark: ' || d.title,
         n.pending || ' student' || case when n.pending = 1 then '' else 's' end ||
           ' submitted answers that need your marks.',
         '/tutor/courses/' || d.course_id || '/quizzes/' || d.id
  from due d
  join public.courses c on c.id = d.course_id and c.tutor_id is not null
  join lateral (
    select count(*) as pending from public.quiz_attempts a
    where a.quiz_id = d.id and a.pending_manual > 0
  ) n on n.pending > 0;
end;
$$;

-- internal only: the app never calls these directly
revoke all on function public.send_quiz_notifications() from public, anon, authenticated;
revoke all on function public.award_quiz_exp(uuid) from public, anon, authenticated;
revoke all on function public.bump_student_streak(uuid, date) from public, anon, authenticated;
revoke all on function public.finalize_quiz_attempt(uuid) from public, anon, authenticated;

-- ---------- schedule ----------
do $$
begin
  perform cron.unschedule('quiz-notifications');
exception when others then
  null;  -- not scheduled yet
end $$;

select cron.schedule('quiz-notifications', '*/5 * * * *', 'select public.send_quiz_notifications();');
