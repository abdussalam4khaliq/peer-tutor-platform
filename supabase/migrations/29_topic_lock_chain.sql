-- ============================================================
-- 29: Topic lock chain fix
-- Before: a topic was only locked if the topic directly before it had an
-- unpassed test. A topic WITHOUT a test in the middle broke the chain, so
-- the topic after it opened even though earlier tests were unpassed.
-- Now: a topic is open only when EVERY earlier visible topic that has a
-- test has been passed. Hidden topics never block (same as migration 15).
-- The app mirrors this rule in app/courses/[id]/page.js (lib/topic-lock.js).
--
-- Also fixes a bug in submit_test_attempt: the function returns a column
-- called current_streak, so the unqualified `select current_streak ... from
-- student_stats` was ambiguous and raised "column reference current_streak is
-- ambiguous" whenever a student had already been active today or yesterday
-- (i.e. on any second attempt that day). Those selects are now qualified.
-- ============================================================

create or replace function public.topic_chain_open(p_student uuid, p_course_id uuid, p_order_index int)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (
    select 1 from public.topics tp
    where tp.course_id = p_course_id
      and tp.order_index < p_order_index
      and not tp.hidden
      and exists (select 1 from public.question_bank qb where qb.topic_id = tp.id)
      and not exists (
        select 1 from public.test_attempts ta
        where ta.student_id = p_student and ta.topic_id = tp.id and ta.passed = true
      )
  );
$$;

grant execute on function public.topic_chain_open(uuid, uuid, int) to authenticated;

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

  -- Every earlier visible topic that has a test must be passed (not just the
  -- one directly before this one), so a topic without a test can't break the chain.
  if not public.topic_chain_open(v_student, v_course_id, v_order_index) then
    raise exception 'Previous topic test not yet passed';
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

  -- Every earlier visible topic that has a test must be passed (not just the
  -- one directly before this one), so a topic without a test can't break the chain.
  if not public.topic_chain_open(v_student, v_course_id, v_order_index) then
    raise exception 'Previous topic test not yet passed';
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
    select ss.current_streak into v_new_streak from public.student_stats ss where ss.student_id = v_student;
  elsif v_last_date = v_today - 1 then
    select ss.current_streak + 1 into v_new_streak from public.student_stats ss where ss.student_id = v_student;
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
