# SmartPle live updates — implementation and Supabase setup

## What is included

The student app now subscribes to the signed-in learner's changes and updates open screens without a manual refresh:

- **Remote course controls/visibility:** `smartple_assignments` fields `forced_class`, `forced_subject`, `forced_topic`, `forced_subtopic`, `forced_tier`, and `allow_notes` / `allow_practice_with_answers` / `allow_practice_no_answers`. The Notes, Learn, Practice, and Home screens react to changes while open.
- **Exam status and scores:** the learner's `smartple_exam_assignments` rows, including completed `score` values. Recent completed scores are shown on Home; a lock or completion change also redirects the app as appropriate.
- **Teacher messages:** `smartple_nudges` is the current announcement/message mechanism. Existing `user_id`-targeted Realtime alerts remain in place.
- **Admin Live Activity:** `learning_events`, which the Admin dashboard already subscribes to.

**Scope limit:** the current Admin/Student source has no separate course-hide/visibility table or boolean. Its represented visibility controls are the per-student forced class/subject/topic/tier filters and the three learning-mode permissions above; `forced_subtopic` is also honored when that optional database column exists (the current Admin UI already warns if the column is absent). There is no general school-wide announcement feed: teacher messages are represented by targeted `smartple_nudges` rows. The scores shown here are completed SmartPle exam-assignment scores; unrelated external marks and `is_paid` as an app-access gate are not represented by these Student screens.

## Required Supabase SQL order

The app source and SQL files are prepared, but no database connection or SQL execution was performed as part of this update. The previously successful combined setup SQL and exact-one admin authorization step are not repeated here.

1. **Deliver/review the updated project files for GitHub first**, as requested.
2. In the existing Supabase project, run `supabase/secure_smartple_profiles.sql` in the SQL Editor. It preserves rows and Auth accounts, revokes direct `anon`/`PUBLIC` profile access, and installs student-self/admin-read-update policies. It recognizes the reported legacy names `Allow all` and `allow_all_profiles` only if they are unconditional `ALL` policies; any unexpected name or different definition stops the patch. Do not bypass a stop—review the policy first.
3. Only after step 2 succeeds, run `supabase/enable_student_realtime.sql`. Its preflight verifies the profile RLS policies and grants, checks required tables and the `supabase_realtime` publication, and then adds the required tables idempotently. It makes **no** grants or RLS changes.

Do not rerun `schema.sql`, recreate Auth users, or repeat the successful admin authorization block for this Realtime setup.

## Runtime behavior and fallback

- When Supabase Realtime is connected, controls/results react as Postgres Changes arrive.
- The app retains its 15-second refresh and refresh-on-resume fallback. The Home screen displays whether Realtime is live, automatic polling is the fallback, or cached offline controls are in use.
- Remote control cache entries are separated by Auth user on a device. Realtime is inherently unavailable offline; cached controls remain usable until the network returns. Changes made while disconnected converge on the next successful refresh.
- Supabase RLS and table grants still govern Postgres Changes delivery. The profile publication migration is intentionally blocked until the selected profile-security model is verified.

## Local verification

From `apps/student`:

```bash
npm install
npm run typecheck
```

The app also requires its existing Expo environment variables as described in `README.md`. Live delivery cannot be verified until the SQL steps above are run in the correct Supabase project and the app is connected to it.
