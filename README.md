# Daily Q&A — standalone guided revision

This repository contains an independent one-file browser app. It does **not** require the SmartPle admin dashboard. The app has student and Daily Q&A admin screens of its own, and uses a dedicated Supabase project for sign-in, assignment settings, and progress.

## Files

```text
README.md
index.html                  Student + Daily Q&A admin app (all-in-one)
supabase/
  daily_qa.sql               Schema, role setup, RLS, and RPCs
  seed_daily_qa.sql          160 Primary 4 Science question-and-answer items
```

No build system, npm install, or external JavaScript library is required. The question bank and app logic are embedded in `index.html`. The UI uses a child-friendly cream, yellow, blue, and green theme with a Nunito font link; the hosted page needs network access to load Nunito from Google Fonts.

## 1. Create a dedicated Supabase project

Use a new project for Q-A. This setup creates its own `daily_qa_profiles` table and does not read `smartple_profiles`. Auth users in this project are students by default. Admin roles are assigned by the project owner in SQL Editor; users cannot assign themselves admin access.

## 2. Set up the database and first admin

In the new project's Supabase SQL Editor, run these files in order:

1. `supabase/daily_qa.sql`
2. `supabase/seed_daily_qa.sql`

Then create an Auth user for the administrator in **Authentication → Users**. Promote that account in SQL Editor, replacing the email with the admin's exact email:

```sql
update public.daily_qa_profiles
set role = 'admin'
where user_id = (select id from auth.users where email = 'admin@example.com');
```

Create student accounts in the same project's **Authentication → Users**. New accounts receive the `student` role automatically. To confirm profiles and the seeded bank:

```sql
select user_id, display_name, class, role from public.daily_qa_profiles;
select grade, subject, count(*) from public.daily_qa_questions group by grade, subject;
```

## 3. Run the app

Open `index.html` in a browser and choose a demo preview to test locally; demo data stays in that browser and does not use Supabase. For live use, host the root `index.html` on an HTTPS site (GitHub Pages is suitable). In **Connection / SQL**, enter the new project's URL and publishable/anon key, then sign in with one of the Auth accounts. **Never put a service-role key in this file.**

## Behavior

- The learner starts with one large START button, then sees one question with its answer directly below. NEXT marks the item studied and advances; there are no A–D options or correctness scores.
- Records each studied question and progress toward the admin-set target (20 by default).
- Resumes unfinished sets, avoids stacking a new set while one is active, and does not repeat a student's assigned questions when the bank is exhausted.
- Admins can set a student's target and enable or pause their plan.

The SQL is designed for this standalone project and has not yet been applied to a live Supabase database.
