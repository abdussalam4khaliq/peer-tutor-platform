alter table public.topics add column if not exists hidden boolean not null default false;
alter table public.topics add column if not exists admin_reviewed_at timestamptz;
alter table public.topics add column if not exists admin_reviewed_rating_count int not null default 0;
alter table public.topics add column if not exists tutor_notified_flagged_at timestamptz;

-- Hidden topics no longer show up for students (tutor/admin policies already unaffected)
drop policy if exists "free preview topics" on public.topics;
create policy "free preview topics" on public.topics
  for select using (order_index < 2 and not hidden);

drop policy if exists "entitled students view all topics" on public.topics;
create policy "entitled students view all topics" on public.topics
  for select using (
    not hidden
    and exists (
      select 1 from public.enrollments e
      where e.course_id = topics.course_id
        and e.student_id = auth.uid()
        and (now() < e.trial_ends_at or (e.paid_until is not null and now() < e.paid_until))
    )
  );

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('tutor_application', 'forum_reply', 'league_change', 'withdrawal', 'trial_ending', 'new_topic', 'topic_flagged'));

-- Shared gate check: a topic blocks progress only if it's visible, has
-- questions, and hasn't been passed yet. A hidden (unpublished) topic
-- never blocks progress, regardless of its test status.
create or replace function public.topic_gate_passed(p_student uuid, p_prev_topic_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    p_prev_topic_id is null
    or coalesce((select hidden from public.topics where id = p_prev_topic_id), true)
    or not exists (select 1 from public.question_bank where topic_id = p_prev_topic_id)
    or exists (
      select 1 from public.test_attempts
      where student_id = p_student and topic_id = p_prev_topic_id and passed = true
    );
$$;

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

    if not public.topic_gate_passed(v_student, v_prev_topic_id) then
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

    if not public.topic_gate_passed(v_student, v_prev_topic_id) then
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

-- submit_rating: notify the tutor once when a topic newly crosses into
-- flagged territory (avg < 2.5 with 5+ ratings), reset on admin review.
create or replace function public.submit_rating(p_target_type text, p_target_id uuid, p_stars int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rater uuid := auth.uid();
  v_author uuid;
  v_course_id uuid;
  v_author_role text;
  v_delta numeric := 0;
  v_already boolean;
  v_ledger_source text;
  v_new_avg numeric;
  v_new_count int;
  v_already_notified timestamptz;
begin
  if v_rater is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_active_user() then
    raise exception 'Your account is suspended.';
  end if;

  if p_stars < 1 or p_stars > 5 then
    raise exception 'Invalid rating';
  end if;
  if p_target_type not in ('question', 'reply', 'topic') then
    raise exception 'Invalid target type';
  end if;

  if p_target_type = 'question' then
    select author_id, course_id into v_author, v_course_id from public.forum_questions where id = p_target_id;
    v_ledger_source := 'rating_question';
  elsif p_target_type = 'reply' then
    select author_id, course_id into v_author, v_course_id from public.forum_replies where id = p_target_id;
    v_ledger_source := 'rating_reply';
  else
    select c.tutor_id, t.course_id into v_author, v_course_id
    from public.topics t join public.courses c on c.id = t.course_id
    where t.id = p_target_id;
    v_ledger_source := 'rating_topic';
  end if;

  if v_author is null then
    raise exception 'Target not found';
  end if;
  if v_author = v_rater then
    raise exception 'You cannot rate your own post';
  end if;
  if not public.is_entitled_to_course(v_course_id) then
    raise exception 'Not entitled to this course';
  end if;

  select exists (
    select 1 from public.forum_ratings
    where rater_id = v_rater and target_type = p_target_type and target_id = p_target_id
  ) into v_already;

  if v_already then
    raise exception 'You already rated this';
  end if;

  insert into public.forum_ratings (rater_id, target_type, target_id, stars)
  values (v_rater, p_target_type, p_target_id, p_stars);

  if p_target_type = 'reply' then
    update public.forum_replies
      set rating_count = rating_count + 1,
          avg_rating = round(((avg_rating * rating_count) + p_stars)::numeric / (rating_count + 1), 2)
      where id = p_target_id;
    v_delta := case p_stars when 1 then -10 when 2 then 0 when 3 then 5 when 4 then 10 when 5 then 15 else 0 end;
  elsif p_target_type = 'question' then
    update public.forum_questions
      set rating_count = rating_count + 1,
          avg_rating = round(((avg_rating * rating_count) + p_stars)::numeric / (rating_count + 1), 2)
      where id = p_target_id;
    v_delta := case p_stars when 4 then 10 when 5 then 15 else 0 end;
  else
    update public.topics
      set rating_count = rating_count + 1,
          avg_rating = round(((avg_rating * rating_count) + p_stars)::numeric / (rating_count + 1), 2)
      where id = p_target_id
      returning avg_rating, rating_count, tutor_notified_flagged_at into v_new_avg, v_new_count, v_already_notified;

    if v_new_count >= 5 and v_new_avg < 2.5 and v_already_notified is null then
      update public.topics set tutor_notified_flagged_at = now() where id = p_target_id;
      perform public.notify(
        v_author, 'topic_flagged', 'A topic needs attention',
        'One of your topics has dropped to ' || v_new_avg || '★ across ' || v_new_count || ' ratings. Consider reviewing it.',
        '/tutor/courses'
      );
    end if;

    v_delta := case p_stars when 1 then -10 when 2 then -5 when 3 then 5 when 4 then 10 when 5 then 15 else 0 end;
  end if;

  select role into v_author_role from public.profiles where id = v_author;

  if v_delta <> 0 then
    if v_author_role = 'student' then
      insert into public.student_stats (student_id, total_exp, period_exp)
      values (v_author, greatest(v_delta, 0), greatest(v_delta, 0))
      on conflict (student_id) do update
        set total_exp = greatest(student_stats.total_exp + v_delta, 0),
            period_exp = greatest(student_stats.period_exp + v_delta, 0);
    elsif v_author_role = 'tutor' then
      insert into public.tutor_stats (tutor_id, total_exp, period_exp)
      values (v_author, greatest(v_delta, 0), greatest(v_delta, 0))
      on conflict (tutor_id) do update
        set total_exp = greatest(tutor_stats.total_exp + v_delta, 0),
            period_exp = greatest(tutor_stats.period_exp + v_delta, 0);
    end if;

    if p_target_type = 'reply' then
      update public.forum_replies set exp_awarded = exp_awarded + v_delta where id = p_target_id;
    elsif p_target_type = 'question' then
      update public.forum_questions set exp_awarded = exp_awarded + v_delta where id = p_target_id;
    else
      update public.topics set exp_awarded = exp_awarded + v_delta where id = p_target_id;
    end if;

    insert into public.exp_ledger (profile_id, amount, source) values (v_author, v_delta, v_ledger_source);
  end if;
end;
$$;

create or replace function public.get_flagged_topics()
returns table(
  topic_id uuid, title text, avg_rating numeric, rating_count int, hidden boolean,
  course_id uuid, course_code text, course_title text, tutor_name text, tutor_email text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_role() not in ('admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;

  return query
  select t.id, t.title, t.avg_rating, t.rating_count, t.hidden,
    c.id, c.code, c.title, p.full_name, p.email
  from public.topics t
  join public.courses c on c.id = t.course_id
  join public.profiles p on p.id = c.tutor_id
  where t.rating_count >= 5
    and t.avg_rating < 2.5
    and t.rating_count > t.admin_reviewed_rating_count
  order by t.avg_rating asc;
end;
$$;

create or replace function public.dismiss_topic_flag(p_topic_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_role() not in ('admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;

  update public.topics
  set admin_reviewed_at = now(),
      admin_reviewed_rating_count = rating_count,
      tutor_notified_flagged_at = null
  where id = p_topic_id;
end;
$$;

create or replace function public.toggle_topic_hidden(p_topic_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_role() not in ('admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;

  update public.topics
  set hidden = not hidden,
      admin_reviewed_at = now(),
      admin_reviewed_rating_count = rating_count,
      tutor_notified_flagged_at = null
  where id = p_topic_id;
end;
$$;

grant execute on function public.get_flagged_topics() to authenticated;
grant execute on function public.dismiss_topic_flag(uuid) to authenticated;
grant execute on function public.toggle_topic_hidden(uuid) to authenticated;