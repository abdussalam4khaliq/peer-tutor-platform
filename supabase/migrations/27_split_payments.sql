-- ============================================================
-- 27: Split payments (additive: safe to run now, the old site keeps working)
--
--   Instead of crediting a tutor wallet, each payment is split by Paystack at checkout:
--   the tutor's commission (and a referrer's bonus) go straight to their own bank account via a
--   Paystack subaccount, and Coursemate only receives its own share. Coursemate never holds
--   anyone else's money.
--
--   * profiles.paystack_subaccount_code : set after a payout account is verified and registered
--   * payments.split_mode               : true for payments created by the split checkout
--   * payment_split_plans               : the shares planned for each payment (server only)
--   * payment_shares                    : what each recipient was sent (readable by that recipient)
--   * plan_payment_shares()             : works out who is paid what for a payment, incl. referral slots
--   * complete_payment / process_refund : updated for split mode. Older payments behave as before.
--   Re-runnable.
-- ============================================================

alter table public.profiles add column if not exists paystack_subaccount_code text;
alter table public.payments add column if not exists split_mode boolean not null default false;

create table if not exists public.payment_split_plans (
  payment_id uuid primary key references public.payments(id) on delete cascade,
  shares jsonb not null default '[]'::jsonb,
  referrer_id uuid references public.profiles(id),
  referral_recurring boolean,
  created_at timestamptz not null default now()
);
alter table public.payment_split_plans enable row level security;
-- no policies on purpose: only the server (service role) reads or writes this table

create table if not exists public.payment_shares (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id),
  kind text not null check (kind in ('tutor_commission', 'referral_bonus')),
  enrollment_id uuid references public.enrollments(id) on delete set null,
  amount_kobo bigint not null check (amount_kobo > 0),
  subaccount_code text not null,
  status text not null default 'paid_out' check (status in ('paid_out', 'refunded')),
  created_at timestamptz not null default now()
);
create index if not exists payment_shares_recipient_idx on public.payment_shares (recipient_id, created_at desc);
create index if not exists payment_shares_payment_idx on public.payment_shares (payment_id);

alter table public.payment_shares enable row level security;
drop policy if exists "recipients see their own shares, admins see all" on public.payment_shares;
create policy "recipients see their own shares, admins see all" on public.payment_shares
  for select using (auth.uid() = recipient_id or public.current_user_role() in ('admin', 'super_admin'));

-- ------------------------------------------------------------
-- Who is paid what for a payment. Server only (service role).
-- Returns an object with: shares, missing_tutors, referrer_id, referral_recurring
-- ------------------------------------------------------------
create or replace function public.plan_payment_shares(p_student uuid, p_enrollment_ids uuid[], p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan record;
  v_commission numeric;
  v_bonus numeric;
  v_limit integer;
  v_months integer;
  v_shares jsonb := '[]'::jsonb;
  v_missing jsonb := '[]'::jsonb;
  r record;
  v_kobo bigint;
  v_referrer uuid;
  v_ref_sub text;
  v_credit public.referral_credits%rowtype;
  v_slots integer;
  v_recurring boolean := null;
  v_ref_applies boolean := false;
begin
  select * into v_plan from public.payment_plans where id = p_plan_id;
  if v_plan is null then
    raise exception 'Plan not found';
  end if;
  v_months := v_plan.duration_months;

  select tutor_commission_naira, referral_bonus_naira, referral_recurring_limit
  into v_commission, v_bonus, v_limit from public.site_settings limit 1;

  -- Tutor commissions: one share per enrolled course, paid to that course's tutor
  for r in
    select e.id as enrollment_id, c.code, c.title, c.tutor_id, p.paystack_subaccount_code as sub, p.payout_verified_at
    from public.enrollments e
    join public.courses c on c.id = e.course_id
    left join public.profiles p on p.id = c.tutor_id
    where e.id = any(p_enrollment_ids) and e.student_id = p_student
    order by e.created_at, e.id
  loop
    if r.tutor_id is null then
      continue;
    end if;

    if r.sub is null or r.payout_verified_at is null then
      v_missing := v_missing || jsonb_build_object('course_code', r.code, 'course_title', r.title, 'tutor_id', r.tutor_id);
    else
      v_kobo := round(coalesce(v_commission, 0) * v_months * 100)::bigint;
      if v_kobo > 0 then
        v_shares := v_shares || jsonb_build_object(
          'kind', 'tutor_commission', 'recipient_id', r.tutor_id, 'subaccount_code', r.sub,
          'amount_kobo', v_kobo, 'enrollment_id', r.enrollment_id);
      end if;
    end if;
  end loop;

  -- Referral bonus: only if the referrer has a verified payout account right now
  select referred_by into v_referrer from public.profiles where id = p_student;

  if v_referrer is not null and v_referrer <> p_student and coalesce(v_bonus, 0) > 0 then
    select paystack_subaccount_code into v_ref_sub
    from public.profiles where id = v_referrer and payout_verified_at is not null;

    if v_ref_sub is not null then
      perform pg_advisory_xact_lock(hashtext(v_referrer::text));

      select * into v_credit from public.referral_credits where referred_student_id = p_student;

      if found then
        if v_credit.is_recurring then
          v_recurring := true;
          v_ref_applies := true;
          v_kobo := round(v_bonus * v_months * 100)::bigint;
        end if;
      else
        -- First payment from this student: take a recurring slot if the referrer still has one.
        -- Other students' unfinished checkouts (last 2 hours) hold a slot too, so two students
        -- paying at once can't both take the last one.
        select count(*) into v_slots from public.referral_credits where referrer_id = v_referrer and is_recurring;
        v_slots := v_slots + (
          select count(distinct pay.student_id)
          from public.payment_split_plans sp
          join public.payments pay on pay.id = sp.payment_id
          where sp.referrer_id = v_referrer and sp.referral_recurring
            and pay.status = 'pending' and pay.created_at > now() - interval '2 hours'
            and pay.student_id <> p_student
        );
        v_recurring := v_slots < coalesce(v_limit, 0);
        v_ref_applies := true;
        v_kobo := round(v_bonus * (case when v_recurring then v_months else 1 end) * 100)::bigint;
      end if;

      if v_ref_applies and v_kobo > 0 then
        v_shares := v_shares || jsonb_build_object(
          'kind', 'referral_bonus', 'recipient_id', v_referrer, 'subaccount_code', v_ref_sub,
          'amount_kobo', v_kobo, 'enrollment_id', p_enrollment_ids[1]);
      else
        v_ref_applies := false;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'shares', v_shares,
    'missing_tutors', v_missing,
    'referrer_id', case when v_ref_applies then v_referrer end,
    'referral_recurring', case when v_ref_applies then v_recurring end
  );
end;
$$;

revoke all on function public.plan_payment_shares(uuid, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.plan_payment_shares(uuid, uuid[], uuid) to service_role;

-- ------------------------------------------------------------
-- apply_bundle_payment gets a switch: p_credit_wallet = false for split payments
-- ------------------------------------------------------------
drop function if exists public.apply_bundle_payment(uuid[], uuid, uuid, uuid);

create or replace function public.apply_bundle_payment(
  p_enrollment_ids uuid[], p_plan_id uuid, p_actor uuid, p_payment_id uuid default null,
  p_credit_wallet boolean default true
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

    if p_credit_wallet and v_tutor_id is not null then
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

  if p_credit_wallet and v_referred_by is not null and v_referred_by <> v_student_id and coalesce(v_referral_bonus, 0) > 0 then
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

revoke all on function public.apply_bundle_payment(uuid[], uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.apply_bundle_payment(uuid[], uuid, uuid, uuid, boolean) to service_role;

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

  -- Split payments: tutors and referrers are paid directly by Paystack at checkout, so nothing is
  -- credited to an in-app wallet. Older payments (made before split mode) keep the old behaviour.
  perform public.apply_bundle_payment(v_payment.enrollment_ids, v_payment.plan_id, null, v_payment.id, not v_payment.split_mode);

  if v_payment.split_mode then
    insert into public.payment_shares (payment_id, recipient_id, kind, enrollment_id, amount_kobo, subaccount_code)
    select v_payment.id, (s->>'recipient_id')::uuid, s->>'kind', nullif(s->>'enrollment_id', '')::uuid,
           (s->>'amount_kobo')::bigint, s->>'subaccount_code'
    from public.payment_split_plans sp, jsonb_array_elements(sp.shares) s
    where sp.payment_id = v_payment.id;

    insert into public.referral_credits (referrer_id, referred_student_id, enrollment_id, amount, is_recurring)
    select sp.referrer_id, v_payment.student_id, v_payment.enrollment_ids[1],
           (select referral_bonus_naira from public.site_settings limit 1), coalesce(sp.referral_recurring, false)
    from public.payment_split_plans sp
    where sp.payment_id = v_payment.id and sp.referrer_id is not null
    on conflict (referred_student_id) do nothing;
  end if;

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

-- ------------------------------------------------------------
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

  -- Split payments were already settled by Paystack to each recipient; record that they were refunded.
  update public.payment_shares set status = 'refunded' where payment_id = v_payment.id;

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
