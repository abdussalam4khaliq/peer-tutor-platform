-- ============================================================
-- 21: Security hardening (run BEFORE taking live payments)
--   1. profiles: stop users editing their own role / approval / suspension /
--      referral fields (only admins may; only a super admin may change a role)
--   2. profiles: nobody can be their own referrer
--   3. enrollments: a student can no longer insert themselves a free or
--      pre-paid enrollment (paid_until / long trials)
--   Re-runnable. Server-side and cron work (no logged-in user) is unaffected.
-- ============================================================

-- ---- 1. profiles --------------------------------------------------------
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  -- No logged-in user: service role, cron jobs, the signup trigger. Trusted.
  if auth.uid() is null then
    return new;
  end if;

  v_role := public.current_user_role();

  if tg_op = 'INSERT' then
    -- A user creating their own profile can pick student/tutor (the insert policy
    -- enforces that) but cannot pre-approve themselves or pre-set moderation fields.
    if v_role is null or v_role not in ('admin', 'super_admin') then
      new.tutor_status := null;
      new.status := 'active';
      new.status_reason := null;
      new.status_set_by := null;
      new.status_set_at := null;
    end if;
    return new;
  end if;

  -- UPDATE
  if new.role is distinct from old.role and v_role is distinct from 'super_admin' then
    raise exception 'Only a super admin can change roles';
  end if;

  if v_role in ('admin', 'super_admin') then
    return new;
  end if;

  if new.tutor_status is distinct from old.tutor_status
     or new.referral_code is distinct from old.referral_code
     or new.referred_by is distinct from old.referred_by
     or new.status is distinct from old.status
     or new.status_reason is distinct from old.status_reason
     or new.status_set_by is distinct from old.status_set_by
     or new.status_set_at is distinct from old.status_set_at then
    raise exception 'Not allowed';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_columns on public.profiles;
create trigger protect_profile_columns
  before insert or update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ---- 2. no self-referral -----------------------------------------------
alter table public.profiles drop constraint if exists profiles_no_self_referral;
alter table public.profiles
  add constraint profiles_no_self_referral check (referred_by is null or referred_by <> id) not valid;

-- ---- 3. enrollments ----------------------------------------------------
create or replace function public.protect_enrollment_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and coalesce(public.current_user_role(), 'student') not in ('admin', 'super_admin') then
    new.paid_until := null;
    new.trial_ends_at := least(new.trial_ends_at, now() + interval '7 days');
  end if;
  return new;
end;
$$;

drop trigger if exists protect_enrollment_columns on public.enrollments;
create trigger protect_enrollment_columns
  before insert on public.enrollments
  for each row execute function public.protect_enrollment_columns();