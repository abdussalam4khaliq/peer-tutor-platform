-- ============================================================
-- 01: Reusable helper functions
-- These bypass RLS internally (security definer) so policies
-- can call them without triggering infinite recursion.
-- ============================================================

create extension if not exists pgcrypto;

create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_active_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select status = 'active' from public.profiles where id = auth.uid()), true);
$$;

create or replace function public.is_entitled_to_course(p_course_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.enrollments e
    where e.student_id = auth.uid() and e.course_id = p_course_id
      and (now() < e.trial_ends_at or (e.paid_until is not null and now() < e.paid_until))
  )
  or exists (
    select 1 from public.courses c where c.id = p_course_id and c.tutor_id = auth.uid()
  )
  or public.current_user_role() in ('admin', 'super_admin');
$$;

grant execute on function public.is_entitled_to_course(uuid) to authenticated;

create or replace function public.lookup_referrer(code text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.profiles where referral_code = upper(code) limit 1;
$$;

create or replace function public.lookup_user_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.profiles where lower(email) = lower(p_email) limit 1;
$$;

grant execute on function public.lookup_user_by_email(text) to authenticated;
