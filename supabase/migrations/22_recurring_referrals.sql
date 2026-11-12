-- ============================================================
-- 22: Recurring referral bonuses with a per-referrer cap
--
--   * Each referrer has N "recurring slots" (site_settings.referral_recurring_limit).
--   * A referred student's FIRST payment takes a slot if the referrer still has one.
--       - slot taken  -> recurring: the referrer earns on EVERY payment that student makes
--       - no slot left -> one-time: the referrer earns a single flat bonus on the first payment only
--   * Recurring bonus = referral_bonus_naira x months of access paid, one credit per payment.
--     One-time bonus = referral_bonus_naira, flat.
--   * The decision is stored on referral_credits.is_recurring and never flips later, so
--     changing the limit only affects students who haven't made their first payment yet.
--   * Existing referral credits are backfilled: each referrer's earliest ones become recurring,
--     up to the limit.
--   * Refunds already reverse every wallet credit tagged with the payment (migration 20).
-- ============================================================

alter table public.site_settings
  add column if not exists referral_recurring_limit integer not null default 5
  check (referral_recurring_limit >= 0);

alter table public.referral_credits add column if not exists is_recurring boolean;

with ranked as (
  select id, row_number() over (partition by referrer_id order by created_at, id) as rn
  from public.referral_credits
  where is_recurring is null
)
update public.referral_credits rc
set is_recurring = (ranked.rn <= (select referral_recurring_limit from public.site_settings limit 1))
from ranked
where rc.id = ranked.id;

alter table public.referral_credits alter column is_recurring set default false;
alter table public.referral_credits alter column is_recurring set not null;

create or replace function public.apply_bundle_payment(
  p_enrollment_ids uuid[], p_plan_id uuid, p_actor uuid, p_payment_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan record;
  v_commission numeric;
  v_referral_bonus numeric;
  v_limit integer;
  v_enrollment record;
  v_tutor_id uuid;
  v_student_id uuid;
  v_referred_by uuid;
  v_credit public.referral_credits%rowtype;
  v_slots_used integer;
  v_recurring boolean;
  v_bonus numeric;
  v_paid_until timestamptz;
  v_count int := array_length(p_enrollment_ids, 1);
  v_found int;
  v_students int;
begin
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

  select count(*), count(distinct student_id), min(student_id::text)::uuid
  into v_found, v_students, v_student_id
  from public.enrollments where id = any(p_enrollment_ids);

  if v_found <> v_count then
    raise exception 'Some enrollments were not found';
  end if;
  if v_students <> 1 then
    raise exception 'All enrollments must belong to the same student';
  end if;

  select tutor_commission_naira, referral_bonus_naira, referral_recurring_limit
  into v_commission, v_referral_bonus, v_limit
  from public.site_settings limit 1;

  insert into public.site_ledger (type, amount, description, reference_id, created_by)
  values ('revenue', v_plan.price_naira, v_plan.name || ' (' || v_count || ' course(s))', p_payment_id, p_actor);

  for v_enrollment in
    select e.id, e.student_id, e.course_id, e.paid_until
    from public.enrollments e where e.id = any(p_enrollment_ids)
  loop
    v_paid_until := greatest(now(), coalesce(v_enrollment.paid_until, now()))
                    + (v_plan.duration_months || ' months')::interval;

    update public.enrollments set paid_until = v_paid_until where id = v_enrollment.id;

    select tutor_id into v_tutor_id from public.courses where id = v_enrollment.course_id;

    if v_tutor_id is not null then
      insert into public.wallet_transactions (profile_id, type, amount, reference_id, description, payment_id)
      values (
        v_tutor_id, 'tutor_commission',
        v_commission * v_plan.duration_months,
        v_enrollment.id,
        'Commission (' || v_plan.duration_months || ' month(s))',
        p_payment_id
      );
    end if;
  end loop;

  -- ---- Referral bonus -------------------------------------------------
  select referred_by into v_referred_by from public.profiles where id = v_student_id;

  if v_referred_by is not null and v_referred_by <> v_student_id and coalesce(v_referral_bonus, 0) > 0 then
    -- Serialise this referrer's payments so two students paying at once can't both take the last slot
    perform pg_advisory_xact_lock(hashtext(v_referred_by::text));

    select * into v_credit from public.referral_credits where referred_student_id = v_student_id;

    if not found then
      select count(*) into v_slots_used
      from public.referral_credits where referrer_id = v_referred_by and is_recurring;

      v_recurring := v_slots_used < coalesce(v_limit, 0);

      insert into public.referral_credits (referrer_id, referred_student_id, enrollment_id, amount, is_recurring)
      values (v_referred_by, v_student_id, p_enrollment_ids[1], v_referral_bonus, v_recurring);

      v_bonus := v_referral_bonus * case when v_recurring then v_plan.duration_months else 1 end;
    elsif v_credit.is_recurring then
      v_bonus := v_referral_bonus * v_plan.duration_months;
    else
      v_bonus := 0;
    end if;

    if v_bonus > 0 then
      insert into public.wallet_transactions (profile_id, type, amount, reference_id, description, payment_id)
      values (v_referred_by, 'referral_credit', v_bonus, p_enrollment_ids[1],
              case when coalesce(v_credit.is_recurring, v_recurring, false) then 'Recurring referral bonus' else 'Referral bonus' end,
              p_payment_id);
    end if;
  end if;

  perform public.notify(
    v_student_id, 'payment', 'Payment confirmed',
    'Your access is active until ' || to_char(v_paid_until, 'DD Mon YYYY') || '.',
    '/courses'
  );
end;
$$;

revoke all on function public.apply_bundle_payment(uuid[], uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.apply_bundle_payment(uuid[], uuid, uuid, uuid) to service_role;