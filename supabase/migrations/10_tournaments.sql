-- ============================================================
-- 10: Tournaments
-- ============================================================

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  prize_description text not null,
  num_winners int not null default 1 check (num_winners > 0),
  role_context text not null check (role_context in ('student', 'tutor')),
  scope text not null check (scope in ('department', 'faculty', 'school', 'universal')),
  scope_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.tournaments enable row level security;

create policy "anyone can view tournaments" on public.tournaments
  for select to authenticated using (true);

create policy "admin can manage tournaments" on public.tournaments
  for all using (public.current_user_role() in ('admin', 'super_admin'));

create table if not exists public.tournament_prize_log (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  given_by uuid references public.profiles(id),
  given_at timestamptz not null default now(),
  unique (tournament_id, profile_id)
);

alter table public.tournament_prize_log enable row level security;

create policy "view own prize or admin" on public.tournament_prize_log
  for select using (auth.uid() = profile_id or public.current_user_role() in ('admin', 'super_admin'));

create policy "admin can log prizes given" on public.tournament_prize_log
  for insert with check (public.current_user_role() in ('admin', 'super_admin'));

-- Live standings: sums exp_ledger within the tournament's window, for the
-- eligible pool (role + scope). Works identically whether the tournament
-- is upcoming, active, or ended.
create or replace function public.get_tournament_standings(p_tournament_id uuid)
returns table(profile_id uuid, full_name text, exp_earned numeric, rnk bigint)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_role text;
  v_scope text;
  v_scope_id uuid;
  v_start timestamptz;
  v_end timestamptz;
begin
  select role_context, scope, scope_id, starts_at, ends_at
  into v_role, v_scope, v_scope_id, v_start, v_end
  from public.tournaments where id = p_tournament_id;

  if v_role is null then
    raise exception 'Tournament not found';
  end if;

  return query
  with pool as (
    select p.id
    from public.profiles p
    left join public.departments d on d.id = p.department_id
    left join public.faculties f on f.id = d.faculty_id
    where p.role = v_role
      and (
        v_scope = 'universal'
        or (v_scope = 'school' and f.school_id = v_scope_id)
        or (v_scope = 'faculty' and d.faculty_id = v_scope_id)
        or (v_scope = 'department' and p.department_id = v_scope_id)
      )
  ),
  scored as (
    select pool.id as profile_id,
      coalesce(sum(el.amount) filter (where el.created_at >= v_start and el.created_at <= v_end), 0) as exp_earned
    from pool
    left join public.exp_ledger el on el.profile_id = pool.id
    group by pool.id
  )
  select s.profile_id, pr.full_name, s.exp_earned,
    row_number() over (order by s.exp_earned desc, pr.full_name asc)
  from scored s join public.profiles pr on pr.id = s.profile_id
  order by s.exp_earned desc
  limit 100;
end;
$$;

grant execute on function public.get_tournament_standings(uuid) to authenticated;
