-- ============================================================
-- 13: Push notification subscriptions
-- ============================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "manage own push subscriptions" on public.push_subscriptions
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
-- No admin/service-role policy needed — the webhook handler uses the
-- service role key, which bypasses RLS entirely by design.