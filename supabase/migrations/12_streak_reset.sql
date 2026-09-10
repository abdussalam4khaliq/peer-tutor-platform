create or replace function public.reset_stale_streaks()
returns void
language sql
security definer
set search_path = public
as $$
  update public.student_stats
  set current_streak = 0
  where current_streak <> 0 and last_activity_date < current_date - 1;

  update public.tutor_stats
  set current_streak = 0
  where current_streak <> 0 and last_activity_date < current_date - 1;
$$;

select cron.schedule('daily-streak-reset', '5 0 * * *', $$select public.reset_stale_streaks();$$);