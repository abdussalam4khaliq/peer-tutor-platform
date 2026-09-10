-- ============================================================
-- 04: Enrollments, tutor applications, referral credits
-- ============================================================

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  trial_ends_at timestamptz not null default (now() + interval '7 days'),
  paid_until timestamptz,
  created_at timestamptz not null default now(),
  unique (student_id, course_id)
);

alter table public.enrollments enable row level security;

create policy "student can view own enrollments" on public.enrollments
  for select using (
    auth.uid() = student_id
    or public.current_user_role() in ('admin', 'super_admin')
  );

create policy "student can enroll in own department courses" on public.enrollments
  for insert with check (
    auth.uid() = student_id
    and public.is_active_user()
    and exists (
      select 1 from public.courses c
      join public.profiles p on p.id = auth.uid()
      where c.id = course_id and c.department_id = p.department_id
    )
  );

create policy "admins can update enrollments" on public.enrollments
  for update using (public.current_user_role() in ('admin', 'super_admin'));

create table if not exists public.tutor_applications (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  sample_title text not null,
  sample_content text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.tutor_applications enable row level security;

create policy "tutor can apply" on public.tutor_applications
  for insert with check (auth.uid() = tutor_id);

create policy "view own or admin" on public.tutor_applications
  for select using (
    auth.uid() = tutor_id
    or public.current_user_role() in ('admin', 'super_admin')
  );

create policy "admins can update applications" on public.tutor_applications
  for update using (public.current_user_role() in ('admin', 'super_admin'));

create table if not exists public.referral_credits (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_student_id uuid not null references public.profiles(id) on delete cascade,
  enrollment_id uuid references public.enrollments(id) on delete set null,
  amount numeric not null default 100,
  created_at timestamptz not null default now(),
  unique (referred_student_id)
);

alter table public.referral_credits enable row level security;

create policy "referrer can view own credits" on public.referral_credits
  for select using (
    auth.uid() = referrer_id
    or public.current_user_role() in ('admin', 'super_admin')
  );

create policy "admin can insert credits" on public.referral_credits
  for insert with check (public.current_user_role() in ('admin', 'super_admin'));
