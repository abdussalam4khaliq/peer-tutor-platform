-- ============================================================
-- 24b: Lock payout details. RUN THIS ONLY WHEN THE NEW SITE IS LIVE.
--
-- Your old live site edits bank details straight from the browser, and still
-- calls withdrawals without verification. This migration stops both, so run it
-- at the same moment the Cloudflare version (with the verified-account form)
-- becomes your production site, not before.
--
--   1. Users can no longer write bank / payout columns themselves. They can only
--      be set by the server after Paystack verifies the account (service role).
--   2. request_withdrawal() requires a VERIFIED account, and blocks withdrawals
--      for 24 hours after a verified account was replaced (so a hijacked login
--      can't swap the bank account and drain the wallet immediately).
-- Re-runnable.
-- ============================================================

create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    return new;
  end if;

  v_role := public.current_user_role();

  if tg_op = 'INSERT' then
    if v_role is null or v_role not in ('admin', 'super_admin') then
      new.tutor_status := null;
      new.status := 'active';
      new.status_reason := null;
      new.status_set_by := null;
      new.status_set_at := null;
      new.bank_name := null;
      new.bank_code := null;
      new.account_number := null;
      new.account_name := null;
      new.payout_verified_at := null;
      new.payout_updated_at := null;
    end if;
    return new;
  end if;

  if new.role is distinct from old.role and v_role is distinct from 'super_admin' then
    raise exception 'Only a super admin can change roles';
  end if;

  if v_role in ('admin', 'super_admin') then
    return new;
  end if;

  if new.tutor_status is distinct from old.tutor_status
     or new.referral_code is distinct from old.referral_code
     or new.referred_by is distinct from old.referred_by
     or new.status is distinct from old.status
     or new.status_reason is distinct from old.status_reason
     or new.status_set_by is distinct from old.status_set_by
     or new.status_set_at is distinct from old.status_set_at
     or new.bank_name is distinct from old.bank_name
     or new.bank_code is distinct from old.bank_code
     or new.account_number is distinct from old.account_number
     or new.account_name is distinct from old.account_name
     or new.payout_verified_at is distinct from old.payout_verified_at
     or new.payout_updated_at is distinct from old.payout_updated_at then
    raise exception 'Not allowed';
  end if;

  return new;
end;
$$;

create or replace function public.request_withdrawal(p_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_balance numeric;
  v_bank_name text;
  v_account_number text;
  v_account_name text;
  v_verified_at timestamptz;
  v_updated_at timestamptz;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;
  if p_amount < 1000 then
    raise exception 'Minimum withdrawal is ₦1000';
  end if;

  select bank_name, account_number, account_name, payout_verified_at, payout_updated_at
  into v_bank_name, v_account_number, v_account_name, v_verified_at, v_updated_at
  from public.profiles where id = v_user;

  if v_bank_name is null or v_account_number is null or v_account_name is null then
    raise exception 'Please add your bank details before withdrawing';
  end if;

  if v_verified_at is null then
    raise exception 'Please verify your bank account before withdrawing';
  end if;

  if v_updated_at is not null and v_updated_at > now() - interval '24 hours' then
    raise exception 'You changed your bank account recently. Withdrawals open again 24 hours after the change.';
  end if;

  v_balance := public.get_wallet_balance_for(v_user);

  if p_amount > v_balance then
    raise exception 'Amount exceeds your available balance';
  end if;

  insert into public.withdrawal_requests (profile_id, amount, bank_name, account_number, account_name)
  values (v_user, p_amount, v_bank_name, v_account_number, v_account_name)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.request_withdrawal(numeric) to authenticated;
