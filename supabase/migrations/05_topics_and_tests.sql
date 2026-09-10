-- ============================================================
-- 05: Topics, question bank, CBT tests
-- ============================================================

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  content text not null,
  order_index int not null default 0,
  questions_per_test int not null default 5 check (questions_per_test > 0),
  question_count int not null default 0,
  avg_rating numeric not null default 0,
  rating_count int not null default 0,
  exp_awarded numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.topics enable row level security;

create policy "tutor can view own course topics" on public.topics
  for select using (
    exists (select 1 from public.courses c where c.id = topics.course_id and c.tutor_id = auth.uid())
  );

create policy "admin can view all topics" on public.topics
  for select using (public.current_user_role() in ('admin', 'super_admin'));

-- First two topics of any course are always visible (free preview)
create policy "free preview topics" on public.topics
  for select using (order_index < 2);

-- Entitled (trial/paid/admin) students see everything
create policy "entitled students view all topics" on public.topics
  for select using (
    exists (
      select 1 from public.enrollments e
      where e.course_id = topics.course_id
        and e.student_id = auth.uid()
        and (now() < e.trial_ends_at or (e.paid_until is not null and now() < e.paid_until))
    )
  );

create policy "tutor can insert own course topics" on public.topics
  for insert with check (
    exists (select 1 from public.courses c where c.id = course_id and c.tutor_id = auth.uid())
  );

create policy "tutor can update own course topics" on public.topics
  for update using (
    exists (select 1 from public.courses c where c.id = course_id and c.tutor_id = auth.uid())
  );

create policy "tutor can delete own course topics" on public.topics
  for delete using (
    exists (select 1 from public.courses c where c.id = course_id and c.tutor_id = auth.uid())
  );

create table if not exists public.question_bank (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  question_text text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct_option text not null check (correct_option in ('a', 'b', 'c', 'd')),
  exp_value int not null default 5 check (exp_value > 0),
  created_at timestamptz not null default now()
);

alter table public.question_bank enable row level security;

create policy "tutor manages own question bank" on public.question_bank
  for all using (
    exists (
      select 1 from public.topics t join public.courses c on c.id = t.course_id
      where t.id = question_bank.topic_id and c.tutor_id = auth.uid()
    )
    or public.current_user_role() in ('admin', 'super_admin')
  );

create table if not exists public.test_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  score_percent numeric not null,
  passed boolean not null,
  created_at timestamptz not null default now()
);

alter table public.test_attempts enable row level security;

create policy "view own attempts or teaching tutor or admin" on public.test_attempts
  for select using (
    auth.uid() = student_id
    or public.current_user_role() in ('admin', 'super_admin')
    or exists (
      select 1 from public.topics t join public.courses c on c.id = t.course_id
      where t.id = test_attempts.topic_id and c.tutor_id = auth.uid()
    )
  );

-- Keeps topics.question_count in sync automatically (used by students'
-- client to decide whether a topic has a test, without needing to
-- read question_bank directly, which they have no SELECT access to).
create or replace function public.sync_topic_question_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.topics set question_count = question_count + 1 where id = new.topic_id;
  elsif tg_op = 'DELETE' then
    update public.topics set question_count = greatest(question_count - 1, 0) where id = old.topic_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_sync_question_count on public.question_bank;
create trigger trg_sync_question_count
  after insert or delete on public.question_bank
  for each row execute function public.sync_topic_question_count();

-- Returns a random set of questions WITHOUT the correct answer, and
-- enforces entitlement + sequential-topic gating before handing anything out.
create or replace function public.get_test_questions(p_topic_id uuid)
returns table(id uuid, question_text text, option_a text, option_b text, option_c text, option_d text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid := auth.uid();
  v_course_id uuid;
  v_order_index int;
  v_prev_topic_id uuid;
  v_entitled boolean := false;
begin
  if v_student is null then
    raise exception 'Not authenticated';
  end if;

  select t.course_id, t.order_index into v_course_id, v_order_index
  from public.topics t where t.id = p_topic_id;

  if v_course_id is null then
    raise exception 'Topic not found';
  end if;

  if v_order_index < 2 then
    v_entitled := true;
  else
    select true into v_entitled
    from public.enrollments e
    where e.student_id = v_student and e.course_id = v_course_id
      and (now() < e.trial_ends_at or (e.paid_until is not null and now() < e.paid_until))
    limit 1;
  end if;

  if not coalesce(v_entitled, false) then
    raise exception 'You do not have access to this course';
  end if;

  if v_order_index > 0 then
    select tp.id into v_prev_topic_id
    from public.topics tp
    where tp.course_id = v_course_id and tp.order_index = v_order_index - 1
    limit 1;

    if v_prev_topic_id is not null
       and exists (select 1 from public.question_bank qb where qb.topic_id = v_prev_topic_id)
       and not exists (
         select 1 from public.test_attempts ta
         where ta.student_id = v_student and ta.topic_id = v_prev_topic_id and ta.passed = true
       )
    then
      raise exception 'Previous topic test not yet passed';
    end if;
  end if;

  return query
  select qb.id, qb.question_text, qb.option_a, qb.option_b, qb.option_c, qb.option_d
  from public.question_bank qb
  where qb.topic_id = p_topic_id
  order by random()
  limit (select t.questions_per_test from public.topics t where t.id = p_topic_id);
end;
$$;

grant execute on function public.get_test_questions(uuid) to authenticated;

-- Grades a submitted attempt server-side (correct answers never leave the DB),
-- awards per-question EXP, updates the daily streak, and logs to exp_ledger.
-- NOTE: depends on student_stats (06) and exp_ledger (06) — run 06 first if
-- rebuilding from scratch, or re-run this function after 06.
create or replace function public.submit_test_attempt(
  p_topic_id uuid,
  p_question_ids uuid[],
  p_selected_options text[]
)
returns table(score_percent numeric, passed boolean, earned_exp numeric, reduced boolean, current_streak int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid := auth.uid();
  v_course_id uuid;
  v_order_index int;
  v_prev_topic_id uuid;
  v_entitled boolean := false;
  v_recent_count int;
  v_total int := array_length(p_question_ids, 1);
  v_correct int := 0;
  i int;
  v_qid uuid;
  v_correct_option text;
  v_exp_value int;
  v_score numeric;
  v_passed boolean;
  v_had_prior_pass boolean;
  v_multiplier numeric;
  v_earned_exp numeric := 0;
  v_today date := current_date;
  v_last_date date;
  v_new_streak int;
begin
  if v_student is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_active_user() then
    raise exception 'Your account is suspended.';
  end if;

  if v_total is null or v_total = 0 or v_total <> array_length(p_selected_options, 1) then
    raise exception 'Invalid submission';
  end if;

  select t.course_id, t.order_index into v_course_id, v_order_index
  from public.topics t where t.id = p_topic_id;

  if v_course_id is null then
    raise exception 'Topic not found';
  end if;

  if v_order_index < 2 then
    v_entitled := true;
  else
    select true into v_entitled
    from public.enrollments e
    where e.student_id = v_student and e.course_id = v_course_id
      and (now() < e.trial_ends_at or (e.paid_until is not null and now() < e.paid_until))
    limit 1;
  end if;

  if not coalesce(v_entitled, false) then
    raise exception 'You do not have access to this course';
  end if;

  if v_order_index > 0 then
    select tp.id into v_prev_topic_id
    from public.topics tp
    where tp.course_id = v_course_id and tp.order_index = v_order_index - 1
    limit 1;

    if v_prev_topic_id is not null
       and exists (select 1 from public.question_bank qb where qb.topic_id = v_prev_topic_id)
       and not exists (
         select 1 from public.test_attempts ta
         where ta.student_id = v_student and ta.topic_id = v_prev_topic_id and ta.passed = true
       )
    then
      raise exception 'Previous topic test not yet passed';
    end if;
  end if;

  select count(*) into v_recent_count
  from public.test_attempts
  where student_id = v_student and topic_id = p_topic_id and created_at > now() - interval '1 hour';

  if v_recent_count >= 5 then
    raise exception 'Too many attempts. Please wait before trying again.';
  end if;

  select exists (
    select 1 from public.test_attempts ta
    where ta.student_id = v_student and ta.topic_id = p_topic_id and ta.passed = true
  ) into v_had_prior_pass;

  v_multiplier := case when v_had_prior_pass then 0.2 else 1.0 end;

  for i in 1 .. v_total loop
    v_qid := p_question_ids[i];
    select correct_option, exp_value into v_correct_option, v_exp_value
    from public.question_bank where id = v_qid and topic_id = p_topic_id;

    if v_correct_option is not null and v_correct_option = p_selected_options[i] then
      v_correct := v_correct + 1;
      v_earned_exp := v_earned_exp + (coalesce(v_exp_value, 0) * v_multiplier);
    end if;
  end loop;

  v_earned_exp := round(v_earned_exp, 0);
  v_score := round((v_correct::numeric / v_total::numeric) * 100, 1);
  v_passed := v_score >= 80;

  insert into public.test_attempts (student_id, topic_id, score_percent, passed)
  values (v_student, p_topic_id, v_score, v_passed);

  select last_activity_date into v_last_date from public.student_stats where student_id = v_student;

  if v_last_date is null then
    v_new_streak := 1;
  elsif v_last_date = v_today then
    select current_streak into v_new_streak from public.student_stats where student_id = v_student;
  elsif v_last_date = v_today - 1 then
    select current_streak + 1 into v_new_streak from public.student_stats where student_id = v_student;
  else
    v_new_streak := 1;
  end if;

  insert into public.student_stats (student_id, total_exp, period_exp, current_streak, longest_streak, last_activity_date, current_league)
  values (v_student, v_earned_exp, v_earned_exp, v_new_streak, v_new_streak, v_today, 'bronze')
  on conflict (student_id) do update
  set total_exp = student_stats.total_exp + v_earned_exp,
      period_exp = student_stats.period_exp + v_earned_exp,
      current_streak = v_new_streak,
      longest_streak = greatest(student_stats.longest_streak, v_new_streak),
      last_activity_date = v_today;

  if v_earned_exp > 0 then
    insert into public.exp_ledger (profile_id, amount, source) values (v_student, v_earned_exp, 'test');
  end if;

  return query select v_score, v_passed, v_earned_exp, v_had_prior_pass, v_new_streak;
end;
$$;

grant execute on function public.submit_test_attempt(uuid, uuid[], text[]) to authenticated;
