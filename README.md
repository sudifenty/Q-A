# SmartPle Daily Q&A

A single-file browser app for guided revision. Students see one question at a time with its answer immediately below it, then mark it studied to continue. The same app includes Daily Q&A admin controls for setting targets and enabling or pausing assignments.

## Repository layout

```text
README.md
index.html                  Complete student + Daily Q&A admin app
supabase/
  daily_qa.sql               Database migration; run first
  seed_daily_qa.sql          Imports the 160 supplied Primary 4 Science items; run second
```

There is no build step or JavaScript package installation. The question bank, app logic, styling, and copyable SQL are embedded in `index.html`.

## Preview

Open `index.html` in a browser and choose a demo preview. Demo mode stores its sample progress in that browser only; it does not connect to Supabase.

For live use, host the root `index.html` on an HTTPS site (GitHub Pages is suitable), then use **Connection / SQL** in the app to enter the existing Supabase project URL and publishable/anon key. Sign in with an existing account. Never place a Supabase service-role key in this client-side app.

## Supabase setup

In the SQL Editor for the same Supabase project used by SmartPle:

1. Run `supabase/daily_qa.sql`.
2. Run `supabase/seed_daily_qa.sql`.
3. Verify the existing `smartple_profiles` table has `user_id` and `role` columns and that the administrator account has `role = 'admin'`.

The migration and seed script are also available to copy inside the app's **Connection / SQL** section. These SQL files have not been applied to any live database by this repository package.

## Guided-revision behavior

- Shows each question with its answer; there is no quiz input or automatic grading.
- Tracks each question marked studied and shows progress toward the configured target (20 by default).
- Does not stack a new set while the current set is unfinished, and does not repeat a student's assigned questions when the bank is exhausted.
- The admin can set the daily target and enable or pause assignments.

## Deploy on GitHub Pages

In the GitHub repository, open **Settings → Pages**, choose **Deploy from a branch**, select `main` and the `/ (root)` folder, then save. The root `index.html` is the site entry point. Allow a short time for Pages to publish it.
