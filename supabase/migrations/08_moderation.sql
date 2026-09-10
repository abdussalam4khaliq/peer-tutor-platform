-- ============================================================
-- 08: Moderation — suspend/ban, account reports, bug reports
-- (profiles.status/status_reason/etc. columns already live in 02_profiles.sql)
-- ============================================================

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  screenshot_path text,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  admin_note text,
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;

create policy "reporter or admin can view reports" on public.reports
  for select using (
    auth.uid() = reporter_id
    or public.current_user_role() in ('admin', 'super_admin')
  );

create policy "user can file a report" on public.reports
  for insert with check (auth.uid() = reporter_id);

create policy "admin can update reports" on public.reports
  for update using (public.current_user_role() in ('admin', 'super_admin'));

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  category text not null default 'bug' check (category in ('bug', 'feature_request', 'other')),
  description text not null,
  page_context text,
  screenshot_path text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  admin_note text,
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.bug_reports enable row level security;

create policy "reporter or admin can view bug reports" on public.bug_reports
  for select using (
    auth.uid() = reporter_id
    or public.current_user_role() in ('admin', 'super_admin')
  );

create policy "user can file a bug report" on public.bug_reports
  for insert with check (auth.uid() = reporter_id);

create policy "admin can update bug reports" on public.bug_reports
  for update using (public.current_user_role() in ('admin', 'super_admin'));
