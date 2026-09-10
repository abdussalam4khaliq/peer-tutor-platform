create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('tutor_application', 'forum_reply', 'league_change', 'withdrawal', 'trial_ending')),
  title text not null,
  body text,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

create policy "view own notifications" on public.notifications
  for select using (auth.uid() = profile_id);

create policy "mark own notifications read" on public.notifications
  for update using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);
-- No insert policy for regular users — only written via notify() below,
-- which runs as security definer and bypasses RLS entirely.

create or replace function public.notify(p_profile_id uuid, p_type text, p_title text, p_body text, p_link text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (profile_id, type, title, body, link)
  values (p_profile_id, p_type, p_title, p_body, p_link);
end;
$$;

grant execute on function public.notify(uuid, text, text, text, text) to authenticated;

-- Forum reply → notify the question's author (unless they replied to themselves)
create or replace function public.notify_forum_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question_author uuid;
  v_course_id uuid;
  v_question_title text;
begin
  select author_id, course_id, title into v_question_author, v_course_id, v_question_title
  from public.forum_questions where id = new.question_id;

  if v_question_author is not null and v_question_author <> new.author_id then
    perform public.notify(
      v_question_author,
      'forum_reply',
      'New reply to your question',
      '"' || v_question_title || '" got a new reply.',
      '/courses/' || v_course_id || '/forum/' || new.question_id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_forum_reply on public.forum_replies;
create trigger trg_notify_forum_reply
  after insert on public.forum_replies
  for each row execute function public.notify_forum_reply();

-- League cycle notifications — added into both cycle functions, right after
-- their existing league_history insert. Same logic, just adds a notify step.
create or replace function public.run_league_cycle()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  create temporary table _league_calc on commit drop as
  with student_school as (
    select p.id as student_id, f.school_id,
      coalesce(ss.current_league, 'bronze') as current_league,
      coalesce(ss.period_exp, 0) as period_exp
    from public.profiles p
    join public.departments d on d.id = p.department_id
    join public.faculties f on f.id = d.faculty_id
    left join public.student_stats ss on ss.student_id = p.id
    where p.role = 'student'
  ),
  ranked as (
    select *,
      row_number() over (partition by school_id, current_league order by period_exp desc, student_id) as rnk,
      count(*) over (partition by school_id, current_league) as tier_n
    from student_school
  ),
  computed as (
    select *,
      ceil(tier_n * 0.3)::int as top_count,
      floor(tier_n * 0.5)::int as bottom_count
    from ranked
  )
  select student_id, current_league, period_exp,
    case
      when rnk <= top_count and current_league <> 'diamond' then
        (array['bronze','silver','gold','platinum','diamond'])[array_position(array['bronze','silver','gold','platinum','diamond'], current_league) + 1]
      when rnk > (tier_n - bottom_count) and current_league <> 'bronze' then
        (array['bronze','silver','gold','platinum','diamond'])[array_position(array['bronze','silver','gold','platinum','diamond'], current_league) - 1]
      else current_league
    end as next_league
  from computed;

  insert into public.league_history (student_id, old_league, new_league, period_exp)
  select student_id, current_league, next_league, period_exp
  from _league_calc
  where next_league <> current_league;

  insert into public.notifications (profile_id, type, title, body, link)
  select
    student_id,
    'league_change',
    case when next_league > current_league then 'Promoted!' else 'League changed' end,
    'You moved from ' || initcap(current_league) || ' to ' || initcap(next_league) || ' this week.',
    '/leagues'
  from _league_calc
  where next_league <> current_league;

  insert into public.student_stats (student_id, current_league, period_exp)
  select student_id, next_league, 0
  from _league_calc
  on conflict (student_id) do update
  set current_league = excluded.current_league,
      period_exp = 0;
end;
$$;

create or replace function public.run_tutor_league_cycle()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  create temporary table _tutor_league_calc on commit drop as
  with tutor_school as (
    select p.id as tutor_id, f.school_id,
      coalesce(ts.current_league, 'bronze') as current_league,
      coalesce(ts.period_exp, 0) as period_exp
    from public.profiles p
    join public.departments d on d.id = p.department_id
    join public.faculties f on f.id = d.faculty_id
    left join public.tutor_stats ts on ts.tutor_id = p.id
    where p.role = 'tutor'
  ),
  ranked as (
    select *,
      row_number() over (partition by school_id, current_league order by period_exp desc, tutor_id) as rnk,
      count(*) over (partition by school_id, current_league) as tier_n
    from tutor_school
  ),
  computed as (
    select *,
      ceil(tier_n * 0.3)::int as top_count,
      floor(tier_n * 0.5)::int as bottom_count
    from ranked
  )
  select tutor_id, current_league, period_exp,
    case
      when rnk <= top_count and current_league <> 'diamond' then
        (array['bronze','silver','gold','platinum','diamond'])[array_position(array['bronze','silver','gold','platinum','diamond'], current_league) + 1]
      when rnk > (tier_n - bottom_count) and current_league <> 'bronze' then
        (array['bronze','silver','gold','platinum','diamond'])[array_position(array['bronze','silver','gold','platinum','diamond'], current_league) - 1]
      else current_league
    end as next_league
  from computed;

  insert into public.league_history (student_id, old_league, new_league, period_exp)
  select tutor_id, current_league, next_league, period_exp
  from _tutor_league_calc
  where next_league <> current_league;

  insert into public.notifications (profile_id, type, title, body, link)
  select
    tutor_id,
    'league_change',
    case when next_league > current_league then 'Promoted!' else 'League changed' end,
    'You moved from ' || initcap(current_league) || ' to ' || initcap(next_league) || ' this week.',
    '/tutor/leagues'
  from _tutor_league_calc
  where next_league <> current_league;

  insert into public.tutor_stats (tutor_id, current_league, period_exp)
  select tutor_id, next_league, 0
  from _tutor_league_calc
  on conflict (tutor_id) do update
    set current_league = excluded.current_league,
        period_exp = 0;
end;
$$;

-- Withdrawal approval already had its own trusted function — add notification there.
create or replace function public.approve_withdrawal(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric;
  v_profile_id uuid;
  v_admin uuid := auth.uid();
begin
  if public.current_user_role() not in ('admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;

  select amount, profile_id into v_amount, v_profile_id
  from public.withdrawal_requests where id = p_request_id and status = 'pending';

  if v_amount is null then
    raise exception 'Request not found or already resolved';
  end if;

  update public.withdrawal_requests
  set status = 'paid', resolved_by = v_admin, resolved_at = now()
  where id = p_request_id;

  insert into public.site_ledger (type, amount, description, reference_id, created_by)
  values ('withdrawal_payout', -v_amount, 'Withdrawal paid out', p_request_id, v_admin);

  perform public.notify(
    v_profile_id, 'withdrawal', 'Withdrawal paid',
    'Your withdrawal of ₦' || v_amount || ' has been paid out.', '/wallet'
  );
end;
$$;

-- Trial-ending reminders: daily job, one reminder per enrollment, never repeats.
alter table public.enrollments add column if not exists trial_reminder_sent boolean not null default false;

create or replace function public.send_trial_ending_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (profile_id, type, title, body, link)
  select e.student_id, 'trial_ending', 'Your trial ends soon',
    'Your free trial for ' || c.code || ' ends within 24 hours.', '/courses/' || e.course_id
  from public.enrollments e
  join public.courses c on c.id = e.course_id
  where e.paid_until is null
    and not e.trial_reminder_sent
    and e.trial_ends_at between now() and now() + interval '24 hours';

  update public.enrollments
  set trial_reminder_sent = true
  where paid_until is null
    and not trial_reminder_sent
    and trial_ends_at between now() and now() + interval '24 hours';
end;
$$;

select cron.schedule('daily-trial-reminders', '0 9 * * *', $$select public.send_trial_ending_reminders();$$);