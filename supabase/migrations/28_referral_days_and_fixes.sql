-- ============================================================
-- 28: Fixes + referral rule, on top of 27 (additive, re-runnable)
--
--  1. Notification types: migration 20 replaced the allowed list with a shorter one, which removes
--     'new_topic', 'topic_flagged', 'structure_request', 'course_request', 'missed_posting_day' and
--     'quota_not_met'. Anything that sends those would fail. This puts them back (and keeps any
--     others your live database has).
--  2. Referral rule: TUTORS are paid the referral bonus in cash (as part of the split, straight to
--     their payout account). Everyone else gets extra access days (site_settings.referral_bonus_days).
--     A tutor with no verified payout account yet also gets days, so nothing is ever held for anyone.
--     Days go onto the referrer's enrollments; if they have none yet they are banked on their profile
--     and applied to their first enrollment.
--  3. Ledger: revenue is now net of what was paid directly to tutors/referrers.
--  4. paystack_subaccount_code and bonus_access_days can only be written by the server. (Before this,
--     a signed-in user could write their own subaccount code from the browser, even after 24b.)
--
--  Open question for Paystack: on a full refund of a split payment, are the recipients' shares
--  reversed? process_refund reverses the gross revenue only. If Paystack does NOT claw the shares
--  back, the ledger correctly shows the shares as money you are out of pocket for.
-- ============================================================

-- ---- 1. notification types: make sure every type the app uses is allowed ----
-- Reads the current allowed list (Postgres prints it as ARRAY['a'::text, ...] or as '{a,b}'::text[]
-- depending on version), adds anything missing, and rebuilds the constraint. If every type is already
-- allowed (as it is on most databases), it changes nothing.
do $$
declare
  def text;
  existing text[];
  want text[] := array['tutor_application','forum_reply','league_change','withdrawal','trial_ending','payment',
                       'new_topic','topic_flagged','structure_request','course_request','missed_posting_day','quota_not_met'];
  merged text[];
begin
  select pg_get_constraintdef(oid) into def
  from pg_constraint
  where conname = 'notifications_type_check' and conrelid = 'public.notifications'::regclass;

  if def is null then
    return;
  end if;

  if def like '%{%}%' then
    existing := string_to_array(substring(def from '\{([^}]*)\}'), ',');
  else
    select array_agg(m[1]) into existing from regexp_matches(def, '''([^'']+)''::text', 'g') as m;
  end if;

  if exists (select 1 from unnest(want) w where w <> all (coalesce(existing, '{}'::text[]))) then
    select array_agg(distinct x) into merged from unnest(coalesce(existing, '{}'::text[]) || want) x;
    alter table public.notifications drop constraint notifications_type_check;
    execute 'alter table public.notifications add constraint notifications_type_check check (type in ('
      || (select string_agg(quote_literal(x), ', ') from unnest(merged) x) || '))';
  end if;
end $$;

-- ---- 2. referral by access days ----
alter table public.site_settings
  add column if not exists referral_bonus_days integer not null default 7 check (referral_bonus_days >= 0);
alter table public.referral_credits add column if not exists reward_days integer;
alter table public.profiles add column if not exists bonus_access_days integer not null default 0;

create or replace function public.grant_referral_days(p_profile uuid, p_days integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_days is null or p_days <= 0 then
    return;
  end if;

  if exists (select 1 from public.enrollments where student_id = p_profile) then
    update public.enrollments
    set paid_until = greatest(coalesce(paid_until, now()), trial_ends_at, now()) + make_interval(days => p_days)
    where student_id = p_profile;
  else
    update public.profiles set bonus_access_days = bonus_access_days + p_days where id = p_profile;
  end if;
end;
$$;

revoke all on function public.grant_referral_days(uuid, integer) from public, anon, authenticated;
grant execute on function public.grant_referral_days(uuid, integer) to service_role;

create or replace function public.apply_banked_referral_days()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer;
begin
  select bonus_access_days into v_days from public.profiles where id = new.student_id;
  if coalesce(v_days, 0) > 0 then
    update public.enrollments set trial_ends_at = trial_ends_at + make_interval(days => v_days) where id = new.id;
    update public.profiles set bonus_access_days = 0 where id = new.student_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_apply_banked_referral_days on public.enrollments;
create trigger trg_apply_banked_referral_days
  after insert on public.enrollments
  for each row execute function public.apply_banked_referral_days();

-- ---- 4. server-only columns ----
-- Direct requests from a signed-in browser run as 'authenticated'/'anon'. The service role, the SQL
-- editor and SECURITY DEFINER functions run as another role and pass.
create or replace function public.guard_server_only_profile_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.paystack_subaccount_code is distinct from old.paystack_subaccount_code
     or new.bonus_access_days is distinct from old.bonus_access_days then
    raise exception 'Not allowed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_server_only_profile_columns on public.profiles;
create trigger trg_guard_server_only_profile_columns
  before update on public.profiles
  for each row execute function public.guard_server_only_profile_columns();

-- ---- 2 + 3. the two functions, replaced (copied from 27 with the changes described above) ----
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
    from public.profiles where id = v_referrer and payout_verified_at is not null and role = 'tutor';

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
  v_referrer uuid;
  v_days integer;
  v_rows integer;
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

    -- Referral reward for anyone who is NOT paid cash above (students, admins, or a tutor who has no
    -- verified payout account yet): extra days of access, once per referred student.
    select referred_by into v_referrer from public.profiles where id = v_payment.student_id;
    select referral_bonus_days into v_days from public.site_settings limit 1;

    if v_referrer is not null and v_referrer <> v_payment.student_id and coalesce(v_days, 0) > 0
       and not exists (select 1 from public.referral_credits where referred_student_id = v_payment.student_id) then
      insert into public.referral_credits (referrer_id, referred_student_id, enrollment_id, amount, is_recurring, reward_days)
      values (v_referrer, v_payment.student_id, v_payment.enrollment_ids[1], 0, false, v_days)
      on conflict (referred_student_id) do nothing;
      get diagnostics v_rows = row_count;

      if v_rows > 0 then
        perform public.grant_referral_days(v_referrer, v_days);
        perform public.notify(v_referrer, 'payment', 'Referral reward',
          'Someone you referred just subscribed. You got ' || v_days::text || ' extra days of access.', '/courses');
      end if;
    end if;

    -- apply_bundle_payment logs the full plan price as revenue. The part Paystack sent straight to
    -- tutors and referrers was never Coursemate's, so take it back out: net revenue = what we keep.
    insert into public.site_ledger (type, amount, description, reference_id)
    select 'revenue', -(sum(amount_kobo)::numeric / 100),
           'Paid directly to tutors/referrers (' || v_payment.reference || ')', v_payment.id
    from public.payment_shares where payment_id = v_payment.id
    having sum(amount_kobo) > 0;
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
