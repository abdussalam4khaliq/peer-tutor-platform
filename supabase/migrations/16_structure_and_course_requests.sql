create table if not exists public.structure_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  requested_school text not null,
  requested_faculty text not null,
  requested_department text not null,
  status text not null default 'pending' check (status in ('pending', 'fulfilled', 'rejected')),
  admin_note text,
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.structure_requests enable row level security;

create policy "view own structure request or admin" on public.structure_requests
  for select using (auth.uid() = requester_id or public.current_user_role() in ('admin', 'super_admin'));

create policy "user can submit own structure request" on public.structure_requests
  for insert with check (auth.uid() = requester_id);

create table if not exists public.course_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  code text not null,
  title text not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'fulfilled', 'rejected')),
  admin_note text,
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.course_requests enable row level security;

create policy "view own course request or admin" on public.course_requests
  for select using (auth.uid() = requester_id or public.current_user_role() in ('admin', 'super_admin'));

create policy "user can submit own course request" on public.course_requests
  for insert with check (
    auth.uid() = requester_id
    and department_id = (select department_id from public.profiles where id = auth.uid())
  );

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('tutor_application', 'forum_reply', 'league_change', 'withdrawal', 'trial_ending', 'new_topic', 'topic_flagged', 'structure_request', 'course_request'));

create or replace function public.fulfill_structure_request(p_request_id uuid, p_department_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester uuid;
  v_admin uuid := auth.uid();
begin
  if public.current_user_role() not in ('admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;

  select requester_id into v_requester from public.structure_requests where id = p_request_id;
  if v_requester is null then
    raise exception 'Request not found';
  end if;

  update public.profiles set department_id = p_department_id where id = v_requester;

  update public.structure_requests
  set status = 'fulfilled', resolved_by = v_admin, resolved_at = now()
  where id = p_request_id;

  perform public.notify(
    v_requester, 'structure_request', 'Your school is set up!',
    'You can now browse courses in your department.', '/courses'
  );
end;
$$;

create or replace function public.reject_structure_request(p_request_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester uuid;
  v_admin uuid := auth.uid();
begin
  if public.current_user_role() not in ('admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;

  select requester_id into v_requester from public.structure_requests where id = p_request_id;
  if v_requester is null then
    raise exception 'Request not found';
  end if;

  update public.structure_requests
  set status = 'rejected', admin_note = p_note, resolved_by = v_admin, resolved_at = now()
  where id = p_request_id;

  perform public.notify(
    v_requester, 'structure_request', 'Your school request wasn''t approved',
    coalesce(p_note, 'Please contact an admin for details.'), '/dashboard'
  );
end;
$$;

create or replace function public.fulfill_course_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester uuid;
  v_department_id uuid;
  v_code text;
  v_title text;
  v_admin uuid := auth.uid();
begin
  if public.current_user_role() not in ('admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;

  select requester_id, department_id, code, title
  into v_requester, v_department_id, v_code, v_title
  from public.course_requests where id = p_request_id;

  if v_requester is null then
    raise exception 'Request not found';
  end if;

  insert into public.courses (department_id, code, title) values (v_department_id, v_code, v_title);

  update public.course_requests
  set status = 'fulfilled', resolved_by = v_admin, resolved_at = now()
  where id = p_request_id;

  perform public.notify(
    v_requester, 'course_request', 'Your course was added!',
    v_code || ' — ' || v_title || ' is now available.', '/courses'
  );
end;
$$;

create or replace function public.reject_course_request(p_request_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester uuid;
  v_admin uuid := auth.uid();
begin
  if public.current_user_role() not in ('admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;

  select requester_id into v_requester from public.course_requests where id = p_request_id;
  if v_requester is null then
    raise exception 'Request not found';
  end if;

  update public.course_requests
  set status = 'rejected', admin_note = p_note, resolved_by = v_admin, resolved_at = now()
  where id = p_request_id;

  perform public.notify(
    v_requester, 'course_request', 'Your course request wasn''t approved',
    coalesce(p_note, 'Please contact an admin for details.'), '/courses'
  );
end;
$$;

grant execute on function public.fulfill_structure_request(uuid, uuid) to authenticated;
grant execute on function public.reject_structure_request(uuid, text) to authenticated;
grant execute on function public.fulfill_course_request(uuid) to authenticated;
grant execute on function public.reject_course_request(uuid, text) to authenticated;