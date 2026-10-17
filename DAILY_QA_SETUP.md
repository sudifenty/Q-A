# Daily Q&A setup and handoff

The Daily Q&A feature lives beside the existing student app as a separate Expo app, `apps/daily-qa/`, and uses the same Supabase project and student login accounts. The existing admin dashboard gains a **Daily Q&A** page.

## Apply the feature

1. In the SQL editor for the same Supabase project as the existing admin, run `supabase/daily_qa.sql`.
2. Run `supabase/seed_daily_qa.sql` to import the uploaded guide's 160 Primary 4 Science Q&A entries.
3. Confirm `smartple_profiles` has `user_id` and `role` columns, and the admin account's role is `admin`.
4. In `apps/daily-qa`, copy `.env.example` to `.env` and set the same Supabase URL and publishable/anon key used by the student app. Do not use a service-role key in a client app.
5. Run `npm install` and `npx expo start` from `apps/daily-qa`.
6. Build/redeploy `apps/admin` with the new Daily Q&A page.
7. In admin, select a student, choose a question bank, set the target (20 by default), and turn the plan on.

## Behavior

- Q&A is presented one item at a time, with the answer shown directly below the question.
- Tapping **Mark studied & continue** records completion for that exact question. No answer-entry or correctness scoring is used.
- An incomplete set is resumed, and another set is not created while it remains active. The next set becomes available when the current set is finished and a new local calendar day is due.
- If an overdue set is cleared, the student can check for the current day's set.
- Questions are not repeated for an individual student. When all available items in the selected bank have been used, the student app stops and the admin page reports that the bank is exhausted.
- A target edit applies to the next set; an already-started set keeps its assigned count.

## Important live-database check

The repo's checked-in SQL and the live schema referenced by app code are not fully aligned. Before production migration, inspect the existing Supabase project and confirm the profile table columns and admin role. The new feature uses its own `daily_qa_*` tables and RPCs to avoid changing existing practice/exam records.
