-- ============================================================
-- 03: Academic structure — schools > faculties > departments > courses
-- ============================================================

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table if not exists public.faculties (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  faculty_id uuid not null references public.faculties(id) on delete cascade,
  name text not null
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  code text not null,
  title text not null,
  tutor_id uuid references public.profiles(id),
  status text not null default 'unclaimed' check (status in ('unclaimed', 'active')),
  created_at timestamptz not null default now()
);

alter table public.schools enable row level security;
alter table public.faculties enable row level security;
alter table public.departments enable row level security;
alter table public.courses enable row level security;

-- Open to anonymous/authenticated so signup's School > Faculty > Department
-- dropdowns work before the user has a session.
create policy "anyone can view schools" on public.schools for select using (true);
create policy "anyone can view faculties" on public.faculties for select using (true);
create policy "anyone can view departments" on public.departments for select using (true);

create policy "authenticated can view courses" on public.courses
  for select using (auth.role() = 'authenticated');

-- Admin CRUD on the whole tree
create policy "admins can insert schools" on public.schools for insert with check (public.current_user_role() in ('admin', 'super_admin'));
create policy "admins can update schools" on public.schools for update using (public.current_user_role() in ('admin', 'super_admin'));
create policy "admins can delete schools" on public.schools for delete using (public.current_user_role() in ('admin', 'super_admin'));

create policy "admins can insert faculties" on public.faculties for insert with check (public.current_user_role() in ('admin', 'super_admin'));
create policy "admins can update faculties" on public.faculties for update using (public.current_user_role() in ('admin', 'super_admin'));
create policy "admins can delete faculties" on public.faculties for delete using (public.current_user_role() in ('admin', 'super_admin'));

create policy "admins can insert departments" on public.departments for insert with check (public.current_user_role() in ('admin', 'super_admin'));
create policy "admins can update departments" on public.departments for update using (public.current_user_role() in ('admin', 'super_admin'));
create policy "admins can delete departments" on public.departments for delete using (public.current_user_role() in ('admin', 'super_admin'));

create policy "admins can insert courses" on public.courses for insert with check (public.current_user_role() in ('admin', 'super_admin'));
create policy "admins can update courses" on public.courses for update using (public.current_user_role() in ('admin', 'super_admin'));
create policy "admins can delete courses" on public.courses for delete using (public.current_user_role() in ('admin', 'super_admin'));
