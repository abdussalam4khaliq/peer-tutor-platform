# Database migrations

This folder is a snapshot of Coursemate's complete database schema — every
table, RLS policy, and function — reconstructed from the full history of SQL
run in Supabase's SQL Editor over the course of this project.

## Important: this is documentation, not a guaranteed one-shot rebuild script

Files are organized **thematically** (by feature area), which is the right
structure for reading and maintaining the schema long-term. However, because
tables reference each other in complex ways that grew organically as features
were added (e.g. `submit_rating()` depends on tables from three different
themes), running these files 00 → 10 in a completely empty database **may hit
ordering errors** on some functions that reference tables defined in a later
file.

If you ever need a true from-scratch rebuild:
1. Try running the files in order (00 → 10) first — most of it will work.
2. If a `CREATE FUNCTION` fails because a table doesn't exist yet, skip it,
   continue with the rest, then come back and re-run the skipped statements
   at the end once all tables exist.
3. **Better long-term option:** once you're comfortable with it, install the
   [Supabase CLI](https://supabase.com/docs/guides/cli) and run
   `supabase db dump` against your live project. That pulls an authoritative,
   correctly-ordered schema directly from the database itself — the real
   gold standard, rather than a reconstruction from chat history like this one.

## What's actually reliable here

Even with the ordering caveat above, this folder is genuinely valuable
right now for:
- **Reading and understanding** what exists and why (every file has comments)
- **Copy-pasting individual statements** when you need to check or reference
  something specific
- **Not losing this work** — before today, none of this existed outside a
  single SQL Editor tab that kept getting overwritten

## Going forward

**Every new SQL block goes into a new numbered file** in this
folder (the next one is `31_...`) **at the same time**
it's run in Supabase — not reconstructed later. This keeps the two in sync
without ever needing another big reconstruction like this one.

## File index

| File | Covers |
|---|---|
| `00_storage_buckets.sql` | Supabase Storage buckets (`report-evidence`, `avatars`) and their policies |
| `01_helpers.sql` | Reusable security-definer functions (`current_user_role`, `is_active_user`, `is_entitled_to_course`, etc.) |
| `02_profiles.sql` | The `profiles` table (full current shape), its policies, and the signup trigger |
| `03_academic_structure.sql` | `schools`, `faculties`, `departments`, `courses` |
| `04_enrollments_and_applications.sql` | `enrollments`, `tutor_applications`, `referral_credits` |
| `05_topics_and_tests.sql` | `topics`, `question_bank`, `test_attempts`, CBT grading functions |
| `06_forums.sql` | `forum_questions`, `forum_replies`, `forum_ratings`, rating logic |
| `07_engagement_economy.sql` | `student_stats`, `tutor_stats`, `league_history`, `exp_ledger`, leaderboard/league functions, pg_cron schedules |
| `08_moderation.sql` | `reports`, `bug_reports` (suspend/ban columns live in `02_profiles.sql`) |
| `09_wallet_and_ledger.sql` | `wallet_transactions`, `withdrawal_requests`, `site_settings`, `site_ledger` |
| `10_tournaments.sql` | `tournaments`, `tournament_prize_log`, standings function |
| `11_notifications.sql` | `notifications` table and its policies |
| `12_streak_reset.sql` | `reset_stale_streaks()` |
| `13_push_subscriptions.sql` | Web push subscriptions |
| `14_new_topic_notifications.sql` | Notify enrolled students when a tutor adds a topic |
| `15_content_review.sql` | Hidden topics, rating-based content review, `topic_gate_passed()`, test RPCs |
| `16_structure_and_course_requests.sql` | Requests for new schools/faculties/departments and courses |
| `17_Lesson_plans.sql` | Tutor lesson plans, posting schedule and compliance |
| `18_bundles.sql` | `payment_plans` and bundle payments |
| `19_paystack_payments.sql` | Paystack `payments` table and completion functions |
| `20_payment_admin_refunds.sql` | Payment admin tools, Paystack fees in the ledger, refunds and disputes |
| `21_security_hardening.sql` | Locks down profile role/referral fields and self-created enrollments |
| `22_recurring_referrals.sql` | Recurring referral bonuses with a per-referrer cap |
| `24_payout_accounts.sql` | Verified payout accounts (additive) |
| `24b_lock_payout_details_AT_CUTOVER.sql` | Locks payout details. Run only when the new site is live |
| `26_syllabus_and_topic_details.sql` | Syllabus/lesson-plan structure, topic learning objectives and subtopics |
| `27_split_payments.sql` | Split payments: tutor and referrer shares go straight to their bank accounts |
| `27b_disable_wallet_AT_CUTOVER.sql` | Disables the wallet and withdrawals. Run at cutover |
| `28_referral_days_and_fixes.sql` | Referral-days rule and fixes on top of 27 |
| `29_topic_lock_chain.sql` | Topic lock checks every earlier test (`topic_chain_open()`); fixes the ambiguous `current_streak` error on repeat test submissions |
| `30_timed_quizzes.sql` | Timed tutor quizzes: tables, RLS, `quiz-answers` storage bucket and quiz RPCs |
