-- ============================================================
-- 24: Verified payout accounts (additive, safe to run any time)
--   bank_code            Paystack's code for the bank (needed to verify and, later, to pay out)
--   payout_verified_at   set by the server after Paystack confirms the account name
--   payout_updated_at    set when a previously verified account is REPLACED (used for a withdrawal cooldown)
-- Nothing in the existing app reads these yet, so running this does not change behaviour.
-- ============================================================
alter table public.profiles add column if not exists bank_code text;
alter table public.profiles add column if not exists payout_verified_at timestamptz;
alter table public.profiles add column if not exists payout_updated_at timestamptz;
