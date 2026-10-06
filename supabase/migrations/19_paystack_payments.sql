-- ============================================================
-- 19: Paystack payments (Phase 1: money in)
--   * payments table: one row per checkout attempt, unique reference
--   * apply_bundle_payment(): the core "unlock + credit" logic, no auth
--     check, callable ONLY by the service role (webhook / callback)
--   * complete_payment(): idempotent, amount-checked entry point for Paystack
--   * mark_bundle_paid(): still works for manual admin payments, now a
--     thin wrapper around apply_bundle_payment()
--   Behaviour fix: renewing early now EXTENDS access from the current
--   paid_until instead of resetting it to now() + duration.
-- ============================================================

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  student_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.payment_plans(id),
  enrollment_ids uuid[] not null,
  amount_kobo bigint not null check (amount_kobo > 0),
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'mismatch')),
  paystack_transaction_id text,
  channel text,
  fee_kobo bigint,
  paid_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists payments_student_idx on public.payments (student_id, created_at desc);

alter table public.payments enable row level security;

drop policy if exists "students view own payments, admins view all" on public.payments;
create policy "students view own payments, admins view all" on public.payments
  for select using (
    auth.uid() = student_id
    or public.current_user_role() in ('admin', 'super_admin')
  );
-- Intentionally NO insert/update/delete policies: only the server (service role) writes here.

-- ------------------------------------------------------------
-- Core logic: unlock access + credit tutors + referral + ledger.
-- No auth check inside, so it must never be callable by app users.
-- ------------------------------------------------------------
create or replace function public.apply_bundle_payment(p_enrollment_ids uuid[], p_plan_id uuid, p_actor uuid)
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

  select tutor_commission_naira, referral_bonus_naira into v_commission, v_referral_bonus
  from public.site_settings limit 1;

  -- Single ledger entry for the actual money received
  insert into public.site_ledger (type, amount, description, created_by)
  values ('revenue', v_plan.price_naira, v_plan.name || ' (' || v_count || ' course(s))', p_actor);

  for v_enrollment in
    select e.id, e.student_id, e.course_id, e.paid_until
    from public.enrollments e where e.id = any(p_enrollment_ids)
  loop
    -- Extend from whichever is later: now, or the access they already have
    v_paid_until := greatest(now(), coalesce(v_enrollment.paid_until, now()))
                    + (v_plan.duration_months || ' months')::interval;

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

  perform public.notify(
    v_student_id, 'trial_ending', 'Payment confirmed',
    'Your access is active until ' || to_char(v_paid_until, 'DD Mon YYYY') || '.',
    '/courses'
  );
end;
$$;

-- Supabase grants execute to anon/authenticated by default: take it away.
revoke all on function public.apply_bundle_payment(uuid[], uuid, uuid) from public, anon, authenticated;
grant execute on function public.apply_bundle_payment(uuid[], uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- Manual admin path (bank-transfer payments etc.) keeps working.
-- ------------------------------------------------------------
create or replace function public.mark_bundle_paid(p_enrollment_ids uuid[], p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_role() not in ('admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;

  perform public.apply_bundle_payment(p_enrollment_ids, p_plan_id, auth.uid());
end;
$$;

grant execute on function public.mark_bundle_paid(uuid[], uuid) to authenticated;

-- ------------------------------------------------------------
-- Paystack entry point. Safe to call any number of times for the same
-- reference (webhook retries, callback page + webhook racing, etc.).
-- Returns: success | already_processed | unknown_reference |
--          amount_mismatch | invalid_enrollments
-- ------------------------------------------------------------
create or replace function public.complete_payment(
  p_reference text,
  p_amount_kobo bigint,
  p_currency text,
  p_transaction_id text,
  p_channel text,
  p_fee_kobo bigint
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_valid int;
begin
  -- Row lock: a concurrent call for the same reference waits here, then sees 'success'
  select * into v_payment from public.payments where reference = p_reference for update;

  if not found then
    return 'unknown_reference';
  end if;

  if v_payment.status = 'success' then
    return 'already_processed';
  end if;

  if p_currency is distinct from 'NGN' or p_amount_kobo < v_payment.amount_kobo then
    update public.payments
    set status = 'mismatch',
        paystack_transaction_id = p_transaction_id,
        note = 'Paystack reported ' || coalesce(p_amount_kobo::text, '?') || ' ' || coalesce(p_currency, '?')
               || ' (kobo), expected ' || v_payment.amount_kobo::text || ' NGN (kobo)'
    where id = v_payment.id;
    return 'amount_mismatch';
  end if;

  select count(*) into v_valid
  from public.enrollments
  where id = any(v_payment.enrollment_ids) and student_id = v_payment.student_id;

  if v_valid <> array_length(v_payment.enrollment_ids, 1) then
    update public.payments
    set status = 'failed',
        paystack_transaction_id = p_transaction_id,
        note = 'Money received but enrollments are no longer valid. Needs manual review.'
    where id = v_payment.id;
    return 'invalid_enrollments';
  end if;

  perform public.apply_bundle_payment(v_payment.enrollment_ids, v_payment.plan_id, null);

  update public.payments
  set status = 'success',
      paystack_transaction_id = p_transaction_id,
      channel = p_channel,
      fee_kobo = p_fee_kobo,
      paid_at = now(),
      note = null
  where id = v_payment.id;

  return 'success';
end;
$$;

revoke all on function public.complete_payment(text, bigint, text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.complete_payment(text, bigint, text, text, text, bigint) to service_role;