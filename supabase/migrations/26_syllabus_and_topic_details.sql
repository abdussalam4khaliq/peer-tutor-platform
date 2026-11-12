-- ============================================================
-- 26: Syllabus + lesson plan structure, topic learning objectives, safe application submit
--
--   * course_lesson_plans.scheme_of_work : the approved syllabus [{ title, overview }]
--       (the manage-content page uses it for the topic drop-down)
--   * topics.learning_objectives / subtopics / syllabus_topic : shown to students above the notes
--   * submit_tutor_application() : saves the application AND sets the applicant to 'pending' in one
--       step, refuses duplicates with a clear message, and checks the shape of the syllabus/lesson plan.
--       (The old form wrote the application, then updated the profile in a second call; if the
--       second call failed the user saw an error while the application had really been saved.)
--   Nothing here changes how the old site works: it only adds columns and a function.
--   Re-runnable.
-- ============================================================

alter table public.tutor_applications add column if not exists scheme_of_work jsonb not null default '[]'::jsonb;
alter table public.tutor_applications add column if not exists sample_title_2 text;
alter table public.tutor_applications add column if not exists sample_content_2 text;
alter table public.tutor_applications add column if not exists grade_or_result text;
alter table public.tutor_applications add column if not exists completed_session text;
alter table public.tutor_applications add column if not exists motivation text;
alter table public.course_lesson_plans add column if not exists scheme_of_work jsonb not null default '[]'::jsonb;

alter table public.topics add column if not exists learning_objectives jsonb not null default '[]'::jsonb;
alter table public.topics add column if not exists subtopics jsonb not null default '[]'::jsonb;
alter table public.topics add column if not exists syllabus_topic text;

alter table public.topics drop constraint if exists topics_objectives_is_array;
alter table public.topics add constraint topics_objectives_is_array check (jsonb_typeof(learning_objectives) = 'array');
alter table public.topics drop constraint if exists topics_subtopics_is_array;
alter table public.topics add constraint topics_subtopics_is_array check (jsonb_typeof(subtopics) = 'array');

-- Courses that were approved before this change: copy the syllabus from the approved application.
update public.course_lesson_plans p
set scheme_of_work = a.scheme_of_work
from (
  select distinct on (course_id, tutor_id) course_id, tutor_id, scheme_of_work
  from public.tutor_applications
  where status = 'approved' and jsonb_typeof(scheme_of_work) = 'array' and jsonb_array_length(scheme_of_work) > 0
  order by course_id, tutor_id, reviewed_at desc nulls last, created_at desc
) a
where a.course_id = p.course_id and a.tutor_id = p.tutor_id
  and jsonb_array_length(p.scheme_of_work) = 0;

-- ------------------------------------------------------------
create or replace function public.submit_tutor_application(
  p_course_id uuid,
  p_scheme_of_work jsonb,
  p_lesson_plan jsonb,
  p_posting_days jsonb,
  p_sample_title text,
  p_sample_content text,
  p_sample_title_2 text,
  p_sample_content_2 text,
  p_grade_or_result text,
  p_completed_session text,
  p_motivation text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_status text;
  v_course public.courses%rowtype;
  v_titles text[];
  v_entry jsonb;
  v_seen text[] := '{}';
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Please log in first.';
  end if;

  select status into v_status from public.profiles where id = v_user;
  if v_status is distinct from 'active' then
    raise exception 'Your account can''t apply right now.';
  end if;

  select * into v_course from public.courses where id = p_course_id;
  if not found then
    raise exception 'That course no longer exists.';
  end if;
  if v_course.tutor_id = v_user then
    raise exception 'You already teach this course.';
  end if;

  if exists (
    select 1 from public.tutor_applications
    where tutor_id = v_user and course_id = p_course_id and status = 'pending'
  ) then
    raise exception 'You already have a pending application for this course.';
  end if;

  -- ---- syllabus: [{ title, overview }] --------------------------------
  if coalesce(jsonb_typeof(p_scheme_of_work), '') <> 'array'
     or jsonb_array_length(p_scheme_of_work) not between 5 and 60 then
    raise exception 'Your syllabus needs between 5 and 60 topics.';
  end if;

  v_titles := '{}';
  for v_entry in select * from jsonb_array_elements(p_scheme_of_work) loop
    if coalesce(jsonb_typeof(v_entry), '') <> 'object'
       or length(btrim(coalesce(v_entry->>'title', ''))) not between 3 and 120
       or length(coalesce(v_entry->>'overview', '')) > 1000 then
      raise exception 'Each syllabus topic needs a title (3 to 120 characters) and an overview.';
    end if;
    if lower(btrim(v_entry->>'title')) = any (v_titles) then
      raise exception 'Syllabus topics must have different titles.';
    end if;
    v_titles := v_titles || lower(btrim(v_entry->>'title'));
  end loop;

  -- ---- lesson plan: [{ topic, subtopics[], objectives[], content }] ----
  if coalesce(jsonb_typeof(p_lesson_plan), '') <> 'array'
     or jsonb_array_length(p_lesson_plan) not between 1 and 60 then
    raise exception 'Your lesson plan needs at least one topic.';
  end if;

  for v_entry in select * from jsonb_array_elements(p_lesson_plan) loop
    if coalesce(jsonb_typeof(v_entry), '') <> 'object'
       or coalesce(jsonb_typeof(v_entry->'subtopics'), '') <> 'array'
       or coalesce(jsonb_typeof(v_entry->'objectives'), '') <> 'array'
       or jsonb_array_length(v_entry->'subtopics') not between 1 and 15
       or jsonb_array_length(v_entry->'objectives') not between 1 and 10
       or length(btrim(coalesce(v_entry->>'content', ''))) not between 1 and 3000 then
      raise exception 'Each lesson plan entry needs a topic, subtopics, learning objectives and content.';
    end if;
    if not (lower(btrim(coalesce(v_entry->>'topic', ''))) = any (v_titles)) then
      raise exception 'Every lesson plan entry must be one of your syllabus topics.';
    end if;
    if lower(btrim(v_entry->>'topic')) = any (v_seen) then
      raise exception 'Each syllabus topic can only appear once in the lesson plan.';
    end if;
    v_seen := v_seen || lower(btrim(v_entry->>'topic'));
  end loop;

  if coalesce(jsonb_typeof(p_posting_days), '') <> 'array'
     or jsonb_array_length(p_posting_days) not between 1 and 7 then
    raise exception 'Choose at least one posting day.';
  end if;

  if length(btrim(coalesce(p_sample_title, ''))) = 0 or length(btrim(coalesce(p_sample_title_2, ''))) = 0
     or length(coalesce(p_sample_content, '')) = 0 or length(coalesce(p_sample_content_2, '')) = 0 then
    raise exception 'Both sample topics need a title and content.';
  end if;
  if length(coalesce(p_motivation, '')) > 5000 or length(coalesce(p_sample_content, '')) > 200000
     or length(coalesce(p_sample_content_2, '')) > 200000 then
    raise exception 'Some of your text is too long.';
  end if;

  insert into public.tutor_applications (
    tutor_id, course_id, scheme_of_work, lesson_plan, posting_days,
    sample_title, sample_content, sample_title_2, sample_content_2,
    grade_or_result, completed_session, motivation
  ) values (
    v_user, p_course_id, p_scheme_of_work, p_lesson_plan, p_posting_days,
    btrim(p_sample_title), p_sample_content, btrim(p_sample_title_2), p_sample_content_2,
    nullif(btrim(coalesce(p_grade_or_result, '')), ''), nullif(btrim(coalesce(p_completed_session, '')), ''),
    nullif(btrim(coalesce(p_motivation, '')), '')
  )
  returning id into v_id;

  update public.profiles
  set tutor_status = 'pending'
  where id = v_user and tutor_status is distinct from 'approved' and tutor_status is distinct from 'pending';

  return v_id;
end;
$$;

revoke all on function public.submit_tutor_application(uuid, jsonb, jsonb, jsonb, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.submit_tutor_application(uuid, jsonb, jsonb, jsonb, text, text, text, text, text, text, text) to authenticated;
