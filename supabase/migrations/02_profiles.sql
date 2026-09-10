-- ============================================================
-- 02: Profiles table (current full shape) + signup trigger
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null check (role in ('student', 'tutor', 'admin', 'super_admin')),
  school text,
  department_id uuid references public.departments(id),
  email text,
  tutor_status text check (tutor_status in ('pending', 'approved', 'rejected')),
  referral_code text unique,
  referred_by uuid references public.profiles(id),
  status text not null default 'active' check (status in ('active', 'suspended', 'banned')),
  status_reason text,
  status_set_by uuid references public.profiles(id),
  status_set_at timestamptz,
  bank_name text,
  account_number text,
  account_name text,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "admins can view all profiles" on public.profiles
  for select using (public.current_user_role() in ('admin', 'super_admin'));

create policy "super admins can update any profile" on public.profiles
  for update using (public.current_user_role() = 'super_admin');

-- Admins (not super_admin-only) can moderate status on students/tutors,
-- but this policy's role filter means they can never touch other admins.
create policy "admins can moderate student and tutor status" on public.profiles
  for update using (
    public.current_user_role() in ('admin', 'super_admin')
    and role in ('student', 'tutor')
  );

-- Auto-creates a profile row for email/password signups, using metadata
-- passed at signup time (full_name, role, school, department_id, referral_code).
-- Google sign-ins don't carry this metadata — those users are routed to
-- /complete-profile in the app instead, which inserts the row manually.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ref_code text;
  referrer uuid;
begin
  if new.raw_user_meta_data ->> 'role' is not null then
    ref_code := upper(substr(replace(new.id::text, '-', ''), 1, 8));

    if coalesce(new.raw_user_meta_data ->> 'referral_code', '') <> '' then
      select id into referrer
      from public.profiles
      where upper(referral_code) = upper(new.raw_user_meta_data ->> 'referral_code')
      limit 1;
    end if;

    insert into public.profiles (id, full_name, role, school, department_id, email, referral_code, referred_by)
    values (
      new.id,
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'role',
      new.raw_user_meta_data ->> 'school',
      nullif(new.raw_user_meta_data ->> 'department_id', '')::uuid,
      new.email,
      ref_code,
      referrer
    )
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
