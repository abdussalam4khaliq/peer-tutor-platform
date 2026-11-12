-- ============================================================
-- 20: Payment admin tools, Paystack fees in the ledger, refunds, disputes
--   * payments gets 'refunded' and 'dismissed' statuses
--   * wallet_transactions can hold negative 'refund_reversal' rows and is
--     linked to the payment that created each credit (payment_id)
--   * complete_payment() now also logs Paystack's fee as an expense
--   * process_refund(): takes access back, reverses revenue, tutor commission
--     and referral bonus for ONE payment (service role / admin only)
--   * flag_payment(): attaches a note (disputes, partial refunds) for review
--   * admin_resolve_payment() / admin_refund_payment(): buttons for the admin screen
--   Re-runnable: constraints are dropped by lookup, functions are replaced.
-- ============================================================

-- ---- 1. payments: new statuses --------------------------------
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.payments'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.payments drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.payments
  add constraint payments_status_check
  check (status in ('pending', 'success', 'failed', 'mismatch', 'refunded', 'dismissed'));

alter table public.payments add column if not exists refunded_at timestamptz;

-- ---- 2. wallet_transactions: link to payment + refund reversals --
alter table public.wallet_transactions
  add column if not exists payment_id uuid references public.payments(id);

create index if not exists wallet_transactions_payment_idx on public.wallet_transactions (payment_id);

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.wallet_transactions'::regclass and contype = 'c'
  loop
    execute format('alter table public.wallet_transactions drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.wallet_transactions
  add constraint wallet_transactions_type_amount_check
  check (
    (type in ('referral_credit', 'tutor_commission') and amount > 0)
    or (type = 'refund_reversal' and amount < 0)
  );

-- ---- 3. notifications: allow a 'payment' type -------------------
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.notifications'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%type%'
  loop
    execute format('alter table public.notifications drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.notifications
  add constraint notifications_type_check
  check (type in ('tutor_application', 'forum_reply', 'league_change', 'withdrawal', 'trial_ending', 'payment'));

-- ---- 4. apply_bundle_payment: now tags rows with the payment ----
drop function if exists public.apply_bundle_payment(uuid[], uuid, uuid);

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

  select referred_by into v_referred_by from public.profiles where id = v_student_id;

  if v_referred_by is not null then
    select exists (select 1 from public.referral_credits where referred_student_id = v_student_id)
    into v_had_referral_credit;

    if not v_had_referral_credit then
      insert into public.referral_credits (referrer_id, referred_student_id, enrollment_id, amount)
      values (v_referred_by, v_student_id, p_enrollment_ids[1], v_referral_bonus);

      insert into public.wallet_transactions (profile_id, type, amount, reference_id, description, payment_id)
      values (v_referred_by, 'referral_credit', v_referral_bonus, p_enrollment_ids[1], 'Referral bonus', p_payment_id);
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

-- ---- 5. complete_payment: logs the Paystack fee, ignores late duplicates --
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
  select * into v_payment from public.payments where reference = p_reference for update;

  if not found then
    return 'unknown_reference';
  end if;

  -- success / refunded / dismissed are all final: a late or duplicate webhook must never re-apply
  if v_payment.status in ('success', 'refunded', 'dismissed') then
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

  perform public.apply_bundle_payment(v_payment.enrollment_ids, v_payment.plan_id, null, v_payment.id);

  if coalesce(p_fee_kobo, 0) > 0 then
    insert into public.site_ledger (type, amount, description, reference_id)
    values ('manual_expense', -(p_fee_kobo::numeric / 100), 'Paystack fee (' || v_payment.reference || ')', v_payment.id);
  end if;

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

-- ---- 6. process_refund -----------------------------------------
-- Undoes ONE payment: takes the access back, logs a negative revenue entry,
-- and reverses the tutor commission / referral bonus that payment created.
-- Reversals can push a wallet below zero if the money was already withdrawn;
-- request_withdrawal() blocks withdrawing until the balance is positive again.
-- The Paystack fee is not reversed (Paystack keeps it).
-- Returns: success | already_processed | refunded_unapplied | unknown_reference
create or replace function public.process_refund(p_reference text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_plan record;
  v_row record;
  v_revenue numeric;
begin
  select * into v_payment from public.payments where reference = p_reference for update;

  if not found then
    return 'unknown_reference';
  end if;

  if v_payment.status = 'refunded' then
    return 'already_processed';
  end if;

  -- Money came in but access was never granted (pending / mismatch / failed / dismissed)
  if v_payment.status <> 'success' then
    update public.payments
    set status = 'refunded', refunded_at = now(),
        note = coalesce(p_note, 'Refunded before access was applied')
    where id = v_payment.id;
    return 'refunded_unapplied';
  end if;

  select * into v_plan from public.payment_plans where id = v_payment.plan_id;

  -- 1. Take the access this payment gave back
  update public.enrollments
  set paid_until = paid_until - (v_plan.duration_months || ' months')::interval
  where id = any(v_payment.enrollment_ids) and paid_until is not null;

  -- 2. Reverse the revenue at the amount that was actually logged
  select amount into v_revenue from public.site_ledger
  where reference_id = v_payment.id and type = 'revenue' and amount > 0
  order by created_at limit 1;

  insert into public.site_ledger (type, amount, description, reference_id)
  values ('revenue', -coalesce(v_revenue, v_payment.amount_kobo::numeric / 100),
          'Refund (' || v_payment.reference || ')', v_payment.id);

  -- 3. Reverse every wallet credit this payment created
  for v_row in
    select profile_id, amount, reference_id, type
    from public.wallet_transactions
    where payment_id = v_payment.id and amount > 0
  loop
    insert into public.wallet_transactions (profile_id, type, amount, reference_id, description, payment_id)
    values (v_row.profile_id, 'refund_reversal', -v_row.amount, v_row.reference_id,
            'Refund reversal (' || v_row.type || ')', v_payment.id);
  end loop;

  update public.payments
  set status = 'refunded', refunded_at = now(), note = p_note
  where id = v_payment.id;

  perform public.notify(
    v_payment.student_id, 'payment', 'Payment refunded',
    'Your payment was refunded and the access it gave has been removed.', '/payment-info'
  );

  return 'success';
end;
$$;

revoke all on function public.process_refund(text, text) from public, anon, authenticated;
grant execute on function public.process_refund(text, text) to service_role;

-- ---- 7. flag_payment: attach a note for admin review ------------
create or replace function public.flag_payment(p_reference text, p_note text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.payments
  set note = left(coalesce(note || E'\n', '') || p_note, 1000)
  where reference = p_reference;

  if not found then
    return 'unknown_reference';
  end if;
  return 'ok';
end;
$$;

revoke all on function public.flag_payment(text, text) from public, anon, authenticated;
grant execute on function public.flag_payment(text, text) to service_role;

-- ---- 8. Admin buttons -------------------------------------------
-- approve: accept a mismatch/failed payment and unlock access
-- dismiss: close out a mismatch/failed/pending payment without unlocking
-- clear_note: acknowledge a dispute / partial-refund flag on any payment
create or replace function public.admin_resolve_payment(p_payment_id uuid, p_action text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
begin
  if public.current_user_role() not in ('admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment not found';
  end if;

  if p_action = 'approve' then
    if v_payment.status not in ('mismatch', 'failed') then
      raise exception 'Only mismatch or failed payments can be approved';
    end if;

    perform public.apply_bundle_payment(v_payment.enrollment_ids, v_payment.plan_id, auth.uid(), v_payment.id);

    update public.payments
    set status = 'success', paid_at = now(),
        note = left(coalesce(note || E'\n', '') || 'Approved by admin', 1000)
    where id = v_payment.id;

  elsif p_action = 'dismiss' then
    if v_payment.status not in ('mismatch', 'failed', 'pending') then
      raise exception 'Only pending, mismatch or failed payments can be dismissed';
    end if;

    update public.payments
    set status = 'dismissed',
        note = left(coalesce(note || E'\n', '') || 'Dismissed by admin', 1000)
    where id = v_payment.id;

  elsif p_action = 'clear_note' then
    update public.payments set note = null where id = v_payment.id;

  else
    raise exception 'Unknown action';
  end if;

  return 'ok';
end;
$$;

grant execute on function public.admin_resolve_payment(uuid, text) to authenticated;

create or replace function public.admin_refund_payment(p_payment_id uuid, p_note text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reference text;
begin
  if public.current_user_role() not in ('admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;

  select reference into v_reference from public.payments where id = p_payment_id;
  if v_reference is null then
    raise exception 'Payment not found';
  end if;

  return public.process_refund(v_reference, 'Marked refunded by admin' || coalesce(': ' || nullif(p_note, ''), ''));
end;
$$;

grant execute on function public.admin_refund_payment(uuid, text) to authenticated;
