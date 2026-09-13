alter table public.tutor_applications add column if not exists lesson_plan jsonb not null default '[]'::jsonb;
alter table public.tutor_applications add column if not exists posting_days jsonb not null default '[]'::jsonb;

create table if not exists public.course_lesson_plans (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null unique references public.courses(id) on delete cascade,
  tutor_id uuid not null references public.profiles(id) on delete cascade,
  lesson_plan jsonb not null default '[]'::jsonb,
  posting_days jsonb not null default '[]'::jsonb,
  weekly_quota int not null default 1,
  start_date date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.course_lesson_plans enable row level security;

create policy "tutor views own plan" on public.course_lesson_plans
  for select using (auth.uid() = tutor_id or public.current_user_role() in ('admin', 'super_admin'));

create table if not exists public.missed_posting_days_log (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  tutor_id uuid not null references public.profiles(id) on delete cascade,
  missed_date date not null,
  created_at timestamptz not null default now(),
  unique (course_id, missed_date)
);

alter table public.missed_posting_days_log enable row level security;

create policy "view own missed days or admin" on public.missed_posting_days_log
  for select using (auth.uid() = tutor_id or public.current_user_role() in ('admin', 'super_admin'));

create table if not exists public.posting_compliance_log (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  tutor_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  target_count int not null,
  actual_count int not null,
  met_quota boolean not null,
  created_at timestamptz not null default now(),
  unique (course_id, week_start)
);

alter table public.posting_compliance_log enable row level security;

create policy "view own compliance or admin" on public.posting_compliance_log
  for select using (auth.uid() = tutor_id or public.current_user_role() in ('admin', 'super_admin'));

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('tutor_application', 'forum_reply', 'league_change', 'withdrawal', 'trial_ending', 'new_topic', 'topic_flagged', 'structure_request', 'course_request', 'missed_posting_day', 'quota_not_met'));

-- Runs once daily. For each active lesson plan: (1) if today is one of the
-- tutor's chosen posting days and nothing was posted today, log + notify
-- admins (soft signal, not punitive on its own). (2) if today marks the end
-- of a full week since start_date (or since the last check), tally that
-- week's actual posts against the quota and log + notify admins if missed
-- (the real, escalation-worthy signal).
create or replace function public.run_daily_compliance_checks()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  plan record;
  admin_row record;
  today_name text;
  days_since_start int;
  week_number int;
  week_start date;
  week_end date;
  actual_count int;
  already_logged boolean;
begin
  today_name := (array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'])[extract(isodow from current_date)::int];

  for plan in select * from public.course_lesson_plans loop

    -- (1) Missed scheduled posting day
    if plan.posting_days ? today_name then
      if not exists (
        select 1 from public.topics t
        where t.course_id = plan.course_id and t.created_at::date = current_date
      ) then
        insert into public.missed_posting_days_log (course_id, tutor_id, missed_date)
        values (plan.course_id, plan.tutor_id, current_date)
        on conflict (course_id, missed_date) do nothing;

        for admin_row in select id from public.profiles where role in ('admin', 'super_admin') loop
          perform public.notify(
            admin_row.id, 'missed_posting_day', 'Tutor missed a scheduled posting day',
            'A tutor did not post on their scheduled day (' || initcap(today_name) || ') for one of their courses.',
            '/admin/tutor-compliance'
          );
        end loop;
      end if;
    end if;

    -- (2) End-of-week quota check (fires once per completed 7-day cycle)
    days_since_start := current_date - plan.start_date;
    if days_since_start > 0 and days_since_start % 7 = 0 then
      week_number := days_since_start / 7;
      week_start := plan.start_date + ((week_number - 1) * 7);
      week_end := week_start + 6;

      select count(*) into actual_count
      from public.topics t
      where t.course_id = plan.course_id
        and t.created_at::date between week_start and week_end;

      select exists (
        select 1 from public.posting_compliance_log
        where course_id = plan.course_id and week_start = week_start
      ) into already_logged;

      if not already_logged then
        insert into public.posting_compliance_log (course_id, tutor_id, week_start, week_end, target_count, actual_count, met_quota)
        values (plan.course_id, plan.tutor_id, week_start, week_end, plan.weekly_quota, actual_count, actual_count >= plan.weekly_quota);

        if actual_count < plan.weekly_quota then
          for admin_row in select id from public.profiles where role in ('admin', 'super_admin') loop
            perform public.notify(
              admin_row.id, 'quota_not_met', 'Tutor missed their weekly quota',
              'A tutor posted ' || actual_count || ' of ' || plan.weekly_quota || ' required updates this week.',
              '/admin/tutor-compliance'
            );
          end loop;
        end if;
      end if;
    end if;

  end loop;
end;
$$;

select cron.schedule('daily-compliance-check', '0 22 * * *', $$select public.run_daily_compliance_checks();$$);