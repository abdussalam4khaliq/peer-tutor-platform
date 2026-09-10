-- ============================================================
-- 00: Storage buckets
-- ============================================================

-- Private bucket: report/bug screenshot evidence.
-- Reporter and admins only — never publicly accessible.
insert into storage.buckets (id, name, public)
values ('report-evidence', 'report-evidence', false)
on conflict (id) do nothing;

create policy "users upload own report evidence" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'report-evidence' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users view own report evidence" on storage.objects
  for select to authenticated
  using (bucket_id = 'report-evidence' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "admins view all report evidence" on storage.objects
  for select to authenticated
  using (bucket_id = 'report-evidence' and public.current_user_role() in ('admin', 'super_admin'));

-- Public bucket: profile avatars. Anyone can view (public=true bypasses
-- select RLS for downloads); only the owner can write to their own folder.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "users upload own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users update own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users delete own avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
