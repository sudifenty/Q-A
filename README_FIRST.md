# GitHub Desktop copy-ready package

This is a **drop-in overlay** for the existing `sudifenty/smartple-mobile` repository. The ZIP is intentionally arranged using the repo's real relative paths. It does not contain `node_modules`, build output, `.env` files, or a nested `smartple-mobile/` wrapper.

## What's inside

```text
README_FIRST.md
DAILY_QA_SETUP.md
apps/
  admin/
    src/
      App.tsx                 REPLACE the existing file (adds the Daily Q&A nav item)
      pages/
        DailyQA.tsx           ADD this page
  daily-qa-web/
    index.html                ADD the single-file student + Daily Q&A admin web app
supabase/
  daily_qa.sql                ADD and run first in Supabase
  seed_daily_qa.sql           ADD and run second in Supabase
```

The `index.html` contains the learner flow, the new feature's admin controls, the 160 embedded Q&A pairs, a local demo mode, Supabase connection settings, and a copyable SQL setup section. The existing Vite admin also gets a **Daily Q&A** page using the two files under `apps/admin`.

## Copy these files into your local GitHub Desktop repository

1. Download and extract `daily_qa_github_ready.zip` into a temporary folder.
2. In GitHub Desktop, select your `smartple-mobile` repository, then choose **Repository → Show in Explorer** (Windows) or **Show in Finder** (Mac).
3. Open the extracted package folder. Copy its **contents**—the `apps` and `supabase` folders plus the two Markdown files—into the root of your local `smartple-mobile` checkout. Do **not** copy the ZIP itself or add another `smartple-mobile` folder.
4. Allow the folders to merge. When prompted, replace `apps/admin/src/App.tsx`; all the other files in this package are new. If you have uncommitted edits to `App.tsx`, make a backup before replacing it.
5. Return to GitHub Desktop. You should see one modified admin file and new files/folders. Review the diff, then commit and push as usual.

## Before using the live app

- Run `supabase/daily_qa.sql`, then `supabase/seed_daily_qa.sql`, in the SQL Editor for the **same Supabase project** as the existing admin. The index app also includes a copyable version under **Connection / SQL**.
- Check that `smartple_profiles` has `user_id` and `role` columns and that the admin account has `role = 'admin'`.
- Open `apps/daily-qa-web/index.html` in demo mode to preview it. For live Supabase requests, host that HTML on an `http(s)` origin, configure the existing Supabase project URL and publishable/anon key, and sign in with an existing account. **Never put a service-role key in the HTML.**
- The single-file web app and the Vite admin Daily Q&A page both use the same new Supabase tables, so either admin screen sees the same settings and progress.

More detailed setup notes are in `DAILY_QA_SETUP.md`.
