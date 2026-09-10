-- ============================================================
-- 09: User wallets, withdrawals, site settings, site financial ledger
-- ============================================================

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('referral_credit', 'tutor_commission')),
  amount numeric not null check (amount > 0),
  reference_id uuid,
  description text,
  created_at timestamptz not null default now()
);

alter table public.wallet_transactions enable row level security;

create policy "view own wallet transactions" on public.wallet_transactions
  for select using (auth.uid() = profile_id or public.current_user_role() in ('admin', 'super_admin'));
-- No insert policy — written only by mark_enrollment_paid() below.

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric not null check (amount >= 1000),
  bank_name text not null,
  account_number text not null,
  account_name text not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'rejected')),
  admin_note text,
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.withdrawal_requests enable row level security;

create policy "view own withdrawals or admin" on public.withdrawal_requests
  for select using (auth.uid() = profile_id or public.current_user_role() in ('admin', 'super_admin'));

create policy "admin can update withdrawals" on public.withdrawal_requests
  for update using (public.current_user_role() in ('admin', 'super_admin'));
-- No insert policy — only created via request_withdrawal() below.

create table if not exists public.site_settings (
  id boolean primary key default true check (id),
  allow_admin_tutoring boolean not null default true,
  course_price_naira numeric not null default 1000,
  tutor_commission_naira numeric not null default 300,
  referral_bonus_naira numeric not null default 100,
  payment_bank_name text not null default 'Your Bank Name',
  payment_account_number text not null default '0000000000',
  payment_account_name text not null default 'Your Account Name',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

insert into public.site_settings (id) values (true) on conflict (id) do nothing;

alter table public.site_settings enable row level security;

create policy "any authenticated user can view settings" on public.site_settings
  for select to authenticated using (true);

create policy "only super admin can update settings" on public.site_settings
  for update using (public.current_user_role() = 'super_admin');

-- The site's own running P&L. Revenue and payout rows are written
-- automatically (see functions below); manual_expense/manual_income rows
-- are entered directly by admins for costs/income outside the platform
-- (hosting, ads, etc). Only starts recording from whenever this table
-- was created — no historical backfill from before that point.
create table if not exists public.site_ledger (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('revenue', 'withdrawal_payout', 'manual_expense', 'manual_income')),
  amount numeric not null,
  description text,
  reference_id uuid,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.site_ledger enable row level security;

create policy "admin can view ledger" on public.site_ledger
  for select using (public.current_user_role() in ('admin', 'super_admin'));

create policy "admin can add manual entries" on public.site_ledger
  for insert with check (
    public.current_user_role() in ('admin', 'super_admin')
    and type in ('manual_expense', 'manual_income')
  );

create or replace function public.get_wallet_balance_for(p_profile_id uuid)
returns numeric
language sql
security definer
set search_path = public
stable
as $$
  select case
    when auth.uid() = p_profile_id or public.current_user_role() in ('admin', 'super_admin') then
      coalesce((select sum(amount) from public.wallet_transactions where profile_id = p_profile_id), 0)
      - coalesce((select sum(amount) from public.withdrawal_requests where profile_id = p_profile_id and status in ('pending', 'paid')), 0)
    else null
  end;
$$;

grant execute on function public.get_wallet_balance_for(uuid) to authenticated;

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
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;
  if p_amount < 1000 then
    raise exception 'Minimum withdrawal is ₦1000';
  end if;

  select bank_name, account_number, account_name into v_bank_name, v_account_number, v_account_name
  from public.profiles where id = v_user;

  if v_bank_name is null or v_account_number is null or v_account_name is null then
    raise exception 'Please add your bank details before withdrawing';
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

-- The single trusted entry point for marking a student's payment as received.
-- Updates access, credits the tutor's commission, credits a one-time referral
-- bonus if applicable, and logs exact revenue to site_ledger at today's price
-- (a true snapshot — later price changes don't retroactively affect this row).
create or replace function public.mark_enrollment_paid(p_enrollment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_course_id uuid;
  v_tutor_id uuid;
  v_referred_by uuid;
  v_paid_until timestamptz := now() + interval '30 days';
  v_had_referral_credit boolean;
  v_commission numeric;
  v_referral_bonus numeric;
  v_course_price numeric;
begin
  if public.current_user_role() not in ('admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;

  select tutor_commission_naira, referral_bonus_naira, course_price_naira
  into v_commission, v_referral_bonus, v_course_price
  from public.site_settings limit 1;

  select student_id, course_id into v_student_id, v_course_id
  from public.enrollments where id = p_enrollment_id;

  if v_student_id is null then
    raise exception 'Enrollment not found';
  end if;

  update public.enrollments set paid_until = v_paid_until where id = p_enrollment_id;

  insert into public.site_ledger (type, amount, description, reference_id)
  values ('revenue', v_course_price, 'Course payment', p_enrollment_id);

  select tutor_id into v_tutor_id from public.courses where id = v_course_id;
  if v_tutor_id is not null then
    insert into public.wallet_transactions (profile_id, type, amount, reference_id, description)
    values (v_tutor_id, 'tutor_commission', v_commission, p_enrollment_id, 'Commission for paid student');
  end if;

  select referred_by into v_referred_by from public.profiles where id = v_student_id;

  if v_referred_by is not null then
    select exists (
      select 1 from public.referral_credits where referred_student_id = v_student_id
    ) into v_had_referral_credit;

    if not v_had_referral_credit then
      insert into public.referral_credits (referrer_id, referred_student_id, enrollment_id, amount)
      values (v_referred_by, v_student_id, p_enrollment_id, v_referral_bonus);

      insert into public.wallet_transactions (profile_id, type, amount, reference_id, description)
      values (v_referred_by, 'referral_credit', v_referral_bonus, p_enrollment_id, 'Referral bonus');
    end if;
  end if;
end;
$$;

grant execute on function public.mark_enrollment_paid(uuid) to authenticated;

-- The single trusted entry point for approving a withdrawal — marks it paid
-- and logs the outgoing payout to site_ledger in the same transaction.
create or replace function public.approve_withdrawal(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric;
  v_profile_id uuid;
  v_admin uuid := auth.uid();
begin
  if public.current_user_role() not in ('admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;

  select amount, profile_id into v_amount, v_profile_id
  from public.withdrawal_requests where id = p_request_id and status = 'pending';

  if v_amount is null then
    raise exception 'Request not found or already resolved';
  end if;

  update public.withdrawal_requests
  set status = 'paid', resolved_by = v_admin, resolved_at = now()
  where id = p_request_id;

  insert into public.site_ledger (type, amount, description, reference_id, created_by)
  values ('withdrawal_payout', -v_amount, 'Withdrawal paid out', p_request_id, v_admin);
end;
$$;

grant execute on function public.approve_withdrawal(uuid) to authenticated;
