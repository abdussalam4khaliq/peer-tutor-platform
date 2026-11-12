-- ============================================================
-- 27b: Disable the wallet and withdrawals.   RUN THIS AT CUTOVER.
--
-- Run it when the new site (split checkout, no wallet screens) is the one your students and
-- tutors actually use, not before: your old site still shows the wallet and would start
-- showing errors.
--
-- After this migration:
--   * nobody can request or approve a withdrawal
--   * no payment can credit a wallet (mark_bundle_paid becomes "grant access" only: no revenue,
--     no commission), so Coursemate never accrues money owed to anyone
--   * the remaining old balances can be paid out ONCE by an admin and closed:
--       admin_legacy_balances()            lists who is still owed money, with bank details
--       admin_settle_legacy_balance(user)  after you've paid them by bank transfer: zeroes it
--   Re-runnable.
-- ============================================================

-- wallet_transactions: allow the final settlement entries (negative)
do $$
declare r record;
begin
  for r in select conname from pg_constraint where conrelid = 'public.wallet_transactions'::regclass and contype = 'c'
  loop
    execute format('alter table public.wallet_transactions drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.wallet_transactions
  add constraint wallet_transactions_type_amount_check
  check (
    (type in ('referral_credit', 'tutor_commission') and amount > 0)
    or (type in ('refund_reversal', 'legacy_settlement') and amount < 0)
  );

-- ---- withdrawals are off ---------------------------------------------------
create or replace function public.request_withdrawal(p_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Withdrawals have been replaced by direct payouts: your share of every payment is now sent straight to your verified bank account.';
end;
$$;

create or replace function public.approve_withdrawal(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Withdrawals have been replaced by direct payouts.';
end;
$$;

-- ---- manual payments: grant access only -------------------------------------
create or replace function public.admin_grant_access(p_enrollment_ids uuid[], p_months integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
  v_until timestamptz;
begin
  if public.current_user_role() not in ('admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;
  if p_months is null or p_months < 1 or p_months > 12 then
    raise exception 'Choose between 1 and 12 months';
  end if;
  if p_enrollment_ids is null or array_length(p_enrollment_ids, 1) is null then
    raise exception 'No enrollments provided';
  end if;

  update public.enrollments
  set paid_until = greatest(now(), coalesce(paid_until, now())) + (p_months || ' months')::interval
  where id = any (p_enrollment_ids);

  for v_student, v_until in
    select student_id, max(paid_until) from public.enrollments where id = any (p_enrollment_ids) group by student_id
  loop
    perform public.notify(v_student, 'payment', 'Access granted',
      'Your access is active until ' || to_char(v_until, 'DD Mon YYYY') || '.', '/courses');
  end loop;
end;
$$;

grant execute on function public.admin_grant_access(uuid[], integer) to authenticated;

-- The admin screen still calls mark_bundle_paid; it now only grants access for the plan's length.
create or replace function public.mark_bundle_paid(p_enrollment_ids uuid[], p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_months integer;
begin
  if public.current_user_role() not in ('admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;

  select duration_months into v_months from public.payment_plans where id = p_plan_id;
  if v_months is null then
    raise exception 'Plan not found';
  end if;

  perform public.admin_grant_access(p_enrollment_ids, v_months);
end;
$$;

grant execute on function public.mark_bundle_paid(uuid[], uuid) to authenticated;

-- ---- closing out the old balances ------------------------------------------
create or replace function public.admin_legacy_balances()
returns table (
  profile_id uuid, full_name text, email text, role text,
  bank_name text, account_number text, account_name text,
  owed numeric, pending_requests integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_role() not in ('admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;

  return query
  select p.id, p.full_name, p.email, p.role,
         p.bank_name, p.account_number, p.account_name,
         (coalesce((select sum(w.amount) from public.wallet_transactions w where w.profile_id = p.id), 0)
          - coalesce((select sum(r.amount) from public.withdrawal_requests r where r.profile_id = p.id and r.status = 'paid'), 0)) as owed,
         (select count(*)::integer from public.withdrawal_requests r where r.profile_id = p.id and r.status = 'pending')
  from public.profiles p
  where (coalesce((select sum(w.amount) from public.wallet_transactions w where w.profile_id = p.id), 0)
         - coalesce((select sum(r.amount) from public.withdrawal_requests r where r.profile_id = p.id and r.status = 'paid'), 0)) > 0
  order by 8 desc;
end;
$$;

grant execute on function public.admin_legacy_balances() to authenticated;

-- Call this AFTER paying the person their balance by bank transfer.
create or replace function public.admin_settle_legacy_balance(p_profile_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owed numeric;
begin
  if public.current_user_role() not in ('admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;

  select coalesce((select sum(amount) from public.wallet_transactions where profile_id = p_profile_id), 0)
         - coalesce((select sum(amount) from public.withdrawal_requests where profile_id = p_profile_id and status = 'paid'), 0)
  into v_owed;

  if v_owed <= 0 then
    return 0;
  end if;

  update public.withdrawal_requests set status = 'rejected'
  where profile_id = p_profile_id and status = 'pending';

  insert into public.wallet_transactions (profile_id, type, amount, description)
  values (p_profile_id, 'legacy_settlement', -v_owed, 'Final payout of remaining balance');

  perform public.notify(p_profile_id, 'withdrawal', 'Balance paid out',
    'Your remaining balance of ₦' || v_owed::text || ' has been paid to your bank account. From now on, your share of each payment is sent to you directly.',
    '/wallet');

  return v_owed;
end;
$$;

grant execute on function public.admin_settle_legacy_balance(uuid) to authenticated;
