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

From today, **every new SQL block goes into a new numbered file** in this
folder (`11_whatever_comes_next.sql`, `12_...`, etc.) **at the same time**
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
