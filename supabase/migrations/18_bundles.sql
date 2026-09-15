create table if not exists public.payment_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  course_count int not null check (course_count > 0),
  duration_months int not null check (duration_months > 0),
  price_naira numeric not null check (price_naira > 0),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.payment_plans enable row level security;

create policy "anyone authenticated can view active plans" on public.payment_plans
  for select to authenticated using (true);

create policy "super admin manages plans" on public.payment_plans
  for all using (public.current_user_role() = 'super_admin');

insert into public.payment_plans (name, description, course_count, duration_months, price_naira, sort_order)
values
  ('Single course — monthly', 'One course, one month of full access.', 1, 1, 1500, 1),
  ('Single course — semester', 'One course, a full 4-month semester.', 1, 4, 5000, 2),
  ('5 courses — monthly', 'Up to 5 courses, one month of full access.', 5, 1, 6000, 3),
  ('5 courses — semester', 'Up to 5 courses, a full 4-month semester.', 5, 4, 22500, 4)
on conflict do nothing;

-- One trusted entry point for ALL payments, single or bundle.
-- Credits each course's tutor the full per-month commission × duration,
-- so a tutor never loses money because a student bought a longer plan.
-- Referral bonus still fires once per student, ever.
create or replace function public.mark_bundle_paid(p_enrollment_ids uuid[], p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan record;
  v_commission numeric;
  v_referral_bonus numeric;
  v_enrollment record;
  v_tutor_id uuid;
  v_student_id uuid;
  v_referred_by uuid;
  v_had_referral_credit boolean;
  v_paid_until timestamptz;
  v_count int := array_length(p_enrollment_ids, 1);
begin
  if public.current_user_role() not in ('admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;

  if v_count is null or v_count = 0 then
    raise exception 'No enrollments provided';
  end if;

  select * into v_plan from public.payment_plans where id = p_plan_id;
  if v_plan is null then
    raise exception 'Plan not found';
  end if;

  if v_count > v_plan.course_count then
    raise exception 'This plan covers up to % courses, but % were selected', v_plan.course_count, v_count;
  end if;

  select tutor_commission_naira, referral_bonus_naira into v_commission, v_referral_bonus
  from public.site_settings limit 1;

  v_paid_until := now() + (v_plan.duration_months || ' months')::interval;

  -- Single ledger entry for the actual money received
  insert into public.site_ledger (type, amount, description, created_by)
  values ('revenue', v_plan.price_naira, v_plan.name || ' (' || v_count || ' course(s))', auth.uid());

  for v_enrollment in
    select e.id, e.student_id, e.course_id from public.enrollments e where e.id = any(p_enrollment_ids)
  loop
    update public.enrollments set paid_until = v_paid_until where id = v_enrollment.id;

    select tutor_id into v_tutor_id from public.courses where id = v_enrollment.course_id;

    if v_tutor_id is not null then
      insert into public.wallet_transactions (profile_id, type, amount, reference_id, description)
      values (
        v_tutor_id, 'tutor_commission',
        v_commission * v_plan.duration_months,
        v_enrollment.id,
        'Commission (' || v_plan.duration_months || ' month(s))'
      );
    end if;

    v_student_id := v_enrollment.student_id;
  end loop;

  -- Referral bonus: once per student, ever
  select referred_by into v_referred_by from public.profiles where id = v_student_id;

  if v_referred_by is not null then
    select exists (select 1 from public.referral_credits where referred_student_id = v_student_id)
    into v_had_referral_credit;

    if not v_had_referral_credit then
      insert into public.referral_credits (referrer_id, referred_student_id, enrollment_id, amount)
      values (v_referred_by, v_student_id, p_enrollment_ids[1], v_referral_bonus);

      insert into public.wallet_transactions (profile_id, type, amount, reference_id, description)
      values (v_referred_by, 'referral_credit', v_referral_bonus, p_enrollment_ids[1], 'Referral bonus');
    end if;
  end if;

  -- Notify the student
  perform public.notify(
    v_student_id, 'trial_ending', 'Payment confirmed',
    'Your access is active until ' || to_char(v_paid_until, 'DD Mon YYYY') || '.',
    '/courses'
  );
end;
$$;

grant execute on function public.mark_bundle_paid(uuid[], uuid) to authenticated;