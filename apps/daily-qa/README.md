# SmartPle Daily Q&A companion app

A separate Expo/React Native app for guided daily revision. It reuses the existing SmartPle student Supabase accounts and project; it does not create a second login system or database.

## Learner flow

- The admin enables or pauses a plan for each student and chooses a daily target (20 by default).
- The app shows one assigned question and its answer guide together.
- The student taps **Mark studied & continue**. The app records that specific item on the server; no typed response or grading is involved.
- The app resumes an unfinished set across days. It does not create another set while one is active. Once the current day's set is complete, the next set is available on the next Kampala/Nairobi calendar day. If an overdue set is cleared, the current day's set can then be opened.
- Question IDs are not repeated for a student. After the last available item, the learner is shown a bank-exhausted message and the admin dashboard flags the student as needing more questions.

## Install and run

```sh
cd apps/daily-qa
cp .env.example .env
# Copy the same EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
# values used by apps/student/.env (never use a service-role key in the app).
npm install
npx expo start
```

The sign-in screen uses existing student email/password accounts. New account creation remains an admin task.

## Database setup

In the SQL editor for the **same Supabase project** used by the admin, apply these files in order:

1. `../../supabase/daily_qa.sql` (from this app folder; `supabase/daily_qa.sql` from the repo root)
2. `../../supabase/seed_daily_qa.sql` (from this app folder; `supabase/seed_daily_qa.sql` from the repo root)

The first file adds isolated `daily_qa_*` tables and two student RPCs; the second imports the 160 Q&A items from the uploaded guide. It does not edit the existing practice, exam, or attempt tables.

Before applying it to production, verify that `public.smartple_profiles` has `user_id` and `role` columns and that the signed-in admin account has `role = 'admin'`. The repository's app code references live `questions`/`learning_events` tables that are not described consistently in the checked-in SQL, so compare the migration against the live project first. The new feature itself uses dedicated `daily_qa_*` tables and only depends on the existing profile role for admin access.

## Admin dashboard

The cloned admin app adds a **Daily Q&A** page. It lets admins select a student, set their target, choose an imported bank, start/stop the plan, and inspect question-by-question completion. An in-progress set retains its original target; changes apply to the next set.
