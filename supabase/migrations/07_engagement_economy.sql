-- ============================================================
-- 07: Engagement economy — EXP, streaks, leaderboards, leagues
-- Requires pg_cron extension enabled (Supabase dashboard >
-- Database > Extensions > pg_cron) before the cron.schedule calls
-- at the bottom of this file will succeed.
-- ============================================================

create table if not exists public.student_stats (
  student_id uuid primary key references public.profiles(id) on delete cascade,
  total_exp numeric not null default 0,
  period_exp numeric not null default 0,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_activity_date date,
  current_league text not null default 'bronze' check (current_league in ('bronze', 'silver', 'gold', 'platinum', 'diamond'))
);

alter table public.student_stats enable row level security;

create policy "student can view own stats" on public.student_stats
  for select using (auth.uid() = student_id or public.current_user_role() in ('admin', 'super_admin'));

create table if not exists public.tutor_stats (
  tutor_id uuid primary key references public.profiles(id) on delete cascade,
  total_exp numeric not null default 0,
  period_exp numeric not null default 0,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_activity_date date,
  current_league text not null default 'bronze' check (current_league in ('bronze', 'silver', 'gold', 'platinum', 'diamond'))
);

alter table public.tutor_stats enable row level security;

create policy "tutor can view own stats" on public.tutor_stats
  for select using (auth.uid() = tutor_id or public.current_user_role() in ('admin', 'super_admin'));

create table if not exists public.league_history (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade, -- also used for tutors; name is historical
  old_league text not null,
  new_league text not null,
  period_exp numeric not null,
  created_at timestamptz not null default now()
);

alter table public.league_history enable row level security;

create policy "own league history" on public.league_history
  for select using (auth.uid() = student_id or public.current_user_role() in ('admin', 'super_admin'));

-- +25 EXP for a tutor uploading a new topic, with the same streak logic as tests.
create or replace function public.award_topic_upload_exp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tutor_id uuid;
  v_today date := current_date;
  v_last_date date;
  v_new_streak int;
begin
  select tutor_id into v_tutor_id from public.courses where id = new.course_id;
  if v_tutor_id is null then
    return new;
  end if;

  select last_activity_date into v_last_date from public.tutor_stats where tutor_id = v_tutor_id;

  if v_last_date is null then
    v_new_streak := 1;
  elsif v_last_date = v_today then
    select current_streak into v_new_streak from public.tutor_stats where tutor_id = v_tutor_id;
  elsif v_last_date = v_today - 1 then
    select current_streak + 1 into v_new_streak from public.tutor_stats where tutor_id = v_tutor_id;
  else
    v_new_streak := 1;
  end if;

  insert into public.tutor_stats (tutor_id, total_exp, period_exp, current_streak, longest_streak, last_activity_date, current_league)
  values (v_tutor_id, 25, 25, v_new_streak, v_new_streak, v_today, 'bronze')
  on conflict (tutor_id) do update
    set total_exp = tutor_stats.total_exp + 25,
        period_exp = tutor_stats.period_exp + 25,
        current_streak = v_new_streak,
        longest_streak = greatest(tutor_stats.longest_streak, v_new_streak),
        last_activity_date = v_today;

  insert into public.exp_ledger (profile_id, amount, source) values (v_tutor_id, 25, 'topic_upload');

  return new;
end;
$$;

drop trigger if exists trg_award_topic_upload_exp on public.topics;
create trigger trg_award_topic_upload_exp
  after insert on public.topics
  for each row execute function public.award_topic_upload_exp();

-- Student leaderboards (department / faculty / school / universal)
create or replace function public.get_leaderboard(p_scope text, p_scope_id uuid default null, p_limit int default 50)
returns table(student_id uuid, full_name text, total_exp numeric, current_streak int, rnk bigint)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.full_name, coalesce(s.total_exp, 0), coalesce(s.current_streak, 0),
    row_number() over (order by coalesce(s.total_exp, 0) desc, p.full_name asc)
  from public.profiles p
  left join public.student_stats s on s.student_id = p.id
  left join public.departments d on d.id = p.department_id
  left join public.faculties f on f.id = d.faculty_id
  where p.role = 'student'
    and (
      p_scope = 'universal'
      or (p_scope = 'school' and f.school_id = p_scope_id)
      or (p_scope = 'faculty' and d.faculty_id = p_scope_id)
      or (p_scope = 'department' and p.department_id = p_scope_id)
    )
  order by total_exp desc, p.full_name asc
  limit p_limit;
$$;

create or replace function public.get_my_rank(p_scope text, p_scope_id uuid default null)
returns table(total_exp numeric, current_streak int, rnk bigint, total_participants bigint)
language sql
security definer
set search_path = public
stable
as $$
  with ranked as (
    select p.id, coalesce(s.total_exp, 0) as total_exp, coalesce(s.current_streak, 0) as current_streak,
      row_number() over (order by coalesce(s.total_exp, 0) desc, p.full_name asc) as rnk
    from public.profiles p
    left join public.student_stats s on s.student_id = p.id
    left join public.departments d on d.id = p.department_id
    left join public.faculties f on f.id = d.faculty_id
    where p.role = 'student'
      and (
        p_scope = 'universal'
        or (p_scope = 'school' and f.school_id = p_scope_id)
        or (p_scope = 'faculty' and d.faculty_id = p_scope_id)
        or (p_scope = 'department' and p.department_id = p_scope_id)
      )
  )
  select total_exp, current_streak, rnk, (select count(*) from ranked)
  from ranked where id = auth.uid();
$$;

-- Tutor leaderboards (mirror of the above, scoped to role = 'tutor')
create or replace function public.get_tutor_leaderboard(p_scope text, p_scope_id uuid default null, p_limit int default 50)
returns table(tutor_id uuid, full_name text, total_exp numeric, current_streak int, rnk bigint)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.full_name, coalesce(s.total_exp, 0), coalesce(s.current_streak, 0),
    row_number() over (order by coalesce(s.total_exp, 0) desc, p.full_name asc)
  from public.profiles p
  left join public.tutor_stats s on s.tutor_id = p.id
  left join public.departments d on d.id = p.department_id
  left join public.faculties f on f.id = d.faculty_id
  where p.role = 'tutor'
    and (
      p_scope = 'universal'
      or (p_scope = 'school' and f.school_id = p_scope_id)
      or (p_scope = 'faculty' and d.faculty_id = p_scope_id)
      or (p_scope = 'department' and p.department_id = p_scope_id)
    )
  order by total_exp desc, p.full_name asc
  limit p_limit;
$$;

create or replace function public.get_my_tutor_rank(p_scope text, p_scope_id uuid default null)
returns table(total_exp numeric, current_streak int, rnk bigint, total_participants bigint)
language sql
security definer
set search_path = public
stable
as $$
  with ranked as (
    select p.id, coalesce(s.total_exp, 0) as total_exp, coalesce(s.current_streak, 0) as current_streak,
      row_number() over (order by coalesce(s.total_exp, 0) desc, p.full_name asc) as rnk
    from public.profiles p
    left join public.tutor_stats s on s.tutor_id = p.id
    left join public.departments d on d.id = p.department_id
    left join public.faculties f on f.id = d.faculty_id
    where p.role = 'tutor'
      and (
        p_scope = 'universal'
        or (p_scope = 'school' and f.school_id = p_scope_id)
        or (p_scope = 'faculty' and d.faculty_id = p_scope_id)
        or (p_scope = 'department' and p.department_id = p_scope_id)
      )
  )
  select total_exp, current_streak, rnk, (select count(*) from ranked)
  from ranked where id = auth.uid();
$$;

grant execute on function public.get_leaderboard(text, uuid, int) to authenticated;
grant execute on function public.get_my_rank(text, uuid) to authenticated;
grant execute on function public.get_tutor_leaderboard(text, uuid, int) to authenticated;
grant execute on function public.get_my_tutor_rank(text, uuid) to authenticated;

-- Weekly promotion/demotion: top 30% of each (school, current league) group
-- moves up a tier, bottom 50% moves down, period_exp resets to 0.
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

  insert into public.student_stats (student_id, current_league, period_exp)
  select student_id, next_league, 0
  from _league_calc
  on conflict (student_id) do update
  set current_league = excluded.current_league,
      period_exp = 0;
end;
$$;

revoke all on function public.run_league_cycle() from public;

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

  insert into public.tutor_stats (tutor_id, current_league, period_exp)
  select tutor_id, next_league, 0
  from _tutor_league_calc
  on conflict (tutor_id) do update
    set current_league = excluded.current_league,
        period_exp = 0;
end;
$$;

revoke all on function public.run_tutor_league_cycle() from public;

create or replace function public.get_my_league_info()
returns table(current_league text, period_exp numeric, rnk bigint, tier_size bigint, school_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
begin
  select f.school_id into v_school_id
  from public.profiles p
  join public.departments d on d.id = p.department_id
  join public.faculties f on f.id = d.faculty_id
  where p.id = auth.uid();

  return query
  with tier as (
    select p.id, coalesce(s.current_league, 'bronze') as league, coalesce(s.period_exp, 0) as pexp
    from public.profiles p
    left join public.student_stats s on s.student_id = p.id
    join public.departments d on d.id = p.department_id
    join public.faculties f on f.id = d.faculty_id
    where p.role = 'student' and f.school_id = v_school_id
  )
  select t.league, t.pexp,
    row_number() over (partition by t.league order by t.pexp desc),
    count(*) over (partition by t.league),
    v_school_id
  from tier t where t.id = auth.uid();
end;
$$;

create or replace function public.get_league_standings(p_school_id uuid, p_league text)
returns table(student_id uuid, full_name text, period_exp numeric, rnk bigint)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.full_name, coalesce(s.period_exp, 0),
    row_number() over (order by coalesce(s.period_exp, 0) desc, p.full_name asc)
  from public.profiles p
  join public.departments d on d.id = p.department_id
  join public.faculties f on f.id = d.faculty_id
  left join public.student_stats s on s.student_id = p.id
  where p.role = 'student' and f.school_id = p_school_id and coalesce(s.current_league, 'bronze') = p_league
  order by period_exp desc, p.full_name asc;
$$;

create or replace function public.get_my_tutor_league_info()
returns table(current_league text, period_exp numeric, rnk bigint, tier_size bigint, school_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
begin
  select f.school_id into v_school_id
  from public.profiles p
  join public.departments d on d.id = p.department_id
  join public.faculties f on f.id = d.faculty_id
  where p.id = auth.uid();

  return query
  with tier as (
    select p.id, coalesce(s.current_league, 'bronze') as league, coalesce(s.period_exp, 0) as pexp
    from public.profiles p
    left join public.tutor_stats s on s.tutor_id = p.id
    join public.departments d on d.id = p.department_id
    join public.faculties f on f.id = d.faculty_id
    where p.role = 'tutor' and f.school_id = v_school_id
  )
  select t.league, t.pexp,
    row_number() over (partition by t.league order by t.pexp desc),
    count(*) over (partition by t.league),
    v_school_id
  from tier t where t.id = auth.uid();
end;
$$;

create or replace function public.get_tutor_league_standings(p_school_id uuid, p_league text)
returns table(tutor_id uuid, full_name text, period_exp numeric, rnk bigint)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.full_name, coalesce(s.period_exp, 0),
    row_number() over (order by coalesce(s.period_exp, 0) desc, p.full_name asc)
  from public.profiles p
  join public.departments d on d.id = p.department_id
  join public.faculties f on f.id = d.faculty_id
  left join public.tutor_stats s on s.tutor_id = p.id
  where p.role = 'tutor' and f.school_id = p_school_id and coalesce(s.current_league, 'bronze') = p_league
  order by period_exp desc, p.full_name asc;
$$;

grant execute on function public.get_my_league_info() to authenticated;
grant execute on function public.get_league_standings(uuid, text) to authenticated;
grant execute on function public.get_my_tutor_league_info() to authenticated;
grant execute on function public.get_tutor_league_standings(uuid, text) to authenticated;

-- Requires the pg_cron extension to already be enabled.
select cron.schedule('weekly-league-cycle', '0 0 * * 1', $$select public.run_league_cycle();$$);
select cron.schedule('weekly-tutor-league-cycle', '0 0 * * 1', $$select public.run_tutor_league_cycle();$$);

-- Raw EXP event log — powers tournament windowed standings.
-- Only starts recording from whenever this table was created; it has
-- no historical backfill from before that point.
create table if not exists public.exp_ledger (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric not null,
  source text not null check (source in ('test', 'rating_reply', 'rating_question', 'rating_topic', 'forum_post', 'topic_upload')),
  created_at timestamptz not null default now()
);

alter table public.exp_ledger enable row level security;

create policy "view own ledger or admin" on public.exp_ledger
  for select using (auth.uid() = profile_id or public.current_user_role() in ('admin', 'super_admin'));
-- No insert policy — only written by the trusted functions above.
