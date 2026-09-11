-- ============================================================
-- 14: Notify enrolled students when their tutor adds a new topic
-- ============================================================

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('tutor_application', 'forum_reply', 'league_change', 'withdrawal', 'trial_ending', 'new_topic'));

create or replace function public.notify_new_topic()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_code text;
begin
  select code into v_course_code from public.courses where id = new.course_id;

  insert into public.notifications (profile_id, type, title, body, link)
  select e.student_id, 'new_topic', 'New topic added',
    v_course_code || ' just got a new topic: "' || new.title || '"',
    '/courses/' || new.course_id
  from public.enrollments e
  where e.course_id = new.course_id
    and (now() < e.trial_ends_at or (e.paid_until is not null and now() < e.paid_until));

  return new;
end;
$$;

drop trigger if exists trg_notify_new_topic on public.topics;
create trigger trg_notify_new_topic
  after insert on public.topics
  for each row execute function public.notify_new_topic();