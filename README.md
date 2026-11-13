# Coursemate (peer-tutor-platform)

Learn from the classmate who already aced it. Students get department-specific
courses built from top students' notes; tutors earn from the students they teach.

Live at https://virtualcoursemate.com.ng

## Stack

- **Next.js 14** (App Router, plain JavaScript) deployed on Vercel
- **Supabase**: Postgres + Row Level Security, Auth, Storage
- **Paystack** for payments, **PostHog** for analytics, **web-push** for notifications

## Run it locally

```
npm install
cp .env.local.example .env.local   # then fill in the values
npm run dev
```

Open http://localhost:3000.

## Project layout

| Folder | What lives there |
|---|---|
| `app/` | Pages and routes (student, tutor, admin, API routes) |
| `components/` | Shared UI (header, course reader, rating widget, editors) |
| `lib/` | Supabase clients, Paystack, helpers (`topic-lock.js`, `quiz.js`, `progress.js`, `format.js`) |
| `supabase/migrations/` | The database schema. Read `supabase/migrations/README.md` first. |
| `middleware.js` | Session refresh and redirect of suspended accounts |

## Features at a glance

- Courses by school / faculty / department, free preview of the first two topics, 7-day trial
- Course reader: one topic per page (swipe, arrow keys or buttons) with a topics sidebar
- Topic tests (CBT): 80% to pass, each test unlocks the next topic, retakes allowed (reduced EXP after the first pass)
- Timed tutor quizzes: availability window + per-student time limit, auto-marked and hand-marked questions, photo upload for written working
- Student progress pages (`/progress`)
- Forums, ratings, leaderboards, leagues, tournaments, referral credits
- Wallet, withdrawals, tutor commissions, Paystack checkout
- Admin tools: applications, content review, reports, ledger, withdrawals, tutor compliance

## Database changes

Every change to the database goes in a **new numbered file** in `supabase/migrations/`
and is run in the Supabase SQL Editor at the same time. See the README in that folder.

## Deploying

Pushing to the main branch deploys through Vercel. Set the same environment
variables from `.env.local.example` in the Vercel project settings.
