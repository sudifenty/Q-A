# SmartPle PLE Daily Revision — Science & SST

This is the root-level single-file PWA with **Open student preview** and **Open admin preview** built into the landing page. The built-in admin chooses **Science or SST per student**; students cannot choose their own subject. The separate `admin-new` app is only a read-only feature/UI reference and is not part of this update.

## Files

```text
index.html                       Student flow, admin subject control, shared banks, and complete SQL copy panels
manifest.webmanifest              Installable PWA name, scope, colors, and icons
service-worker.js                 Offline app-shell cache; never caches Supabase/private API traffic
icons/                            192px, 512px, and Apple touch icons
content/question_bank.json       Canonical, ordered P4–P7 Science Q&A with answer guides
content/question_order.csv       Question-only P4–P7 Q&A grade/topic/order index
content/sst_questions_p3_p7.json Canonical P3–P7 SST bank; 168 distinct questions, one per learning point
content/SST_Questions_P3-P7_Only.txt Readable 168-question SST export with unmarked choices; no answer keys
supabase/setup_shared_project.sql Paste-ready schema plus 660 Science and 168 unique SST rows
supabase/setup_sql_copy.html     Visible SQL panel with copy/download controls
supabase/secure_smartple_profiles.sql Restricts shared profile access while preserving student/admin reads
supabase/secure_profiles_copy.html    Visible profile-security patch with copy/download controls
supabase/daily_qa.sql            Fresh schema for Science/SST banks and admin-assigned daily sets
supabase/assign_student_sets.sql Existing-install update: SST data, subject assignment, and shared set RPCs
supabase/assign_student_sets_copy.html  Visible migration panel with copy/download controls
supabase/authorize_qa_admin.sql  Maps an existing SmartPle admin to the protected Q-A allowlist
supabase/seed_daily_qa.sql       Canonical 660 ordered P4–P7 Science Q&A seed
supabase/seed_sst_questions.sql  168 distinct SST questions; choices unmarked, answers NULL
supabase/verify_daily_qa.sql     Read-only checks for profiles, RLS/RPCs, both banks, and subject assignment
supabase/verify_sql_copy.html    Visible verifier panel with copy/download controls
tools/build_daily_qa_assets.py   Rebuilds both bank seeds, SQL panels, SST text export, CSV, and embedded data
.env.example                     Reference for browser connection fields; not loaded at runtime
```

## Question-bank scope and order

The existing Science Q&A wording, source IDs, answers, P4–P7 order, targets, and admin controls are preserved. Its counts remain **P4: 160, P5: 180, P6: 200, P7: 120** (660 total). The original 2,040-entry SST source repeated each of 170 learning-point prompts in multiple templates. To remove those repetitions, the learner bank now keeps one distinct question per learning point, removes two exact cross-topic repeats, and contains **168 questions** in P3→P7 source order: P3 15, P4 30, P5 55, P6 44, P7 24 across 34 topics. Each retained prompt has four plain, unmarked choices. SST has no answer key; in SQL its `answer` is `NULL`.

For Science Q&A, edit `content/question_bank.json`. For SST, edit only `content/sst_questions_p3_p7.json`; preserve compact `source_number` order Q1–Q168 and increasing original `sort_order` values. Run from the repository root:

```bash
python tools/build_daily_qa_assets.py
```

The builder validates both banks and rejects repeated SST prompts or template rephrasings; it regenerates the 660 Science rows and 168 de-duplicated SST rows; rebuilds fresh setup and existing-install migration SQL with visible Copy/Download panels; creates the SST text export; and embeds the demo banks and complete SQL in `index.html`.

## Admin-assigned subject and daily sets

In the built-in Admin Preview, select a student and set **Assigned subject** to **Science** or **SST**. This is a per-student admin control; the learner sees the selected subject in their normal daily-set flow and cannot switch subjects. New sets use the same effective admin-controlled target for both subjects—**20 questions by default**. If the admin changes the target, the next set follows that value just like Science.

Science remains the guided P4–P7 question-and-answer set. SST uses the same assignment/progress flow but provides question-only content: SST students receive the next unused distinct questions starting at P3 Q1, continuing across class boundaries through P7 Q168, with unmarked options. There is no SST answer reveal, answer key, or scoring. Studied-status tracking, Back/Next review, admin repeat, and next-unused assignment use the existing set controls. If a set was already created from the earlier 2,040-entry bank, it is left intact to preserve progress and may finish with its old variants; all new SST sets use only the de-duplicated bank.

A subject change does not rewrite history. An active set completes in its original subject, with progress unchanged; the admin’s new selection applies to the next set. A completed same-day set from the previous subject does not block a set for the newly assigned subject. Existing students and missing subject settings default to Science, preserving current behavior until the admin chooses SST. The question-bank row policy also limits direct authenticated reads to the student’s assigned subject; admins retain access to both banks.

## Shared Supabase Auth and setup

Q-A is configured to use the **same Supabase project and Auth accounts as the existing student app**. Each student signs in with the same account; the migration does not create duplicate Auth users or copy passwords. It maintains a read-only `daily_qa_profiles` mapping keyed by the same Auth `user_id`, populated from `smartple_profiles`. Existing accounts with a non-NULL `smartple_profiles.user_id` are backfilled at setup; a student syncs only their own profile at sign-in, and the Q-A admin roster refresh syncs linked new/current student profiles. Legacy source rows with NULL or nonmatching `user_id` values are left untouched and skipped because they cannot be matched to a Supabase Auth account; they remain unavailable in Q-A until linked to a real Auth user. These are guarded RPCs, not triggers: the Q-A setup SQL leaves the existing Auth signup trigger and SmartPle profile policies/grants untouched. Because the current `smartple_profiles` access is overly broad, apply the separate, reviewable profile-security patch before live student use. The Q-A mapping is metadata only, not another login.

Use these files in the existing student app project’s SQL Editor:

1. **Fresh install only:** run the complete `supabase/setup_shared_project.sql`. It includes the additive schema, existing profile mapping/RLS/RPCs, 660 Science Q&A rows, 168 unique SST question-only rows, and admin subject-assignment/daily-set functions. It reuses the existing Auth accounts. If the Q-A setup has already succeeded, do **not** rerun this full setup.
2. Run `supabase/authorize_qa_admin.sql` only if the existing admin authorization has **not** already succeeded. Do not repeat a successful authorization step.
3. **Existing Q-A install:** run the refreshed `supabase/assign_student_sets.sql` once. This idempotent feature migration adds subject/source-number columns and 168 unique SST questions. If an earlier 2,040-row SST migration was applied, it deactivates the rephrased variants without deleting their rows, preserving saved assignment/progress history; future SST sets use only the distinct bank. Existing students default to Science. It does not rerun the full setup or change the admin allowlist.
4. `supabase/secure_smartple_profiles.sql` is a separate, unchanged security patch. Review/apply it separately if still needed; it is not bundled into the subject/SST migration.
5. After setup/update and any separately required security work, `supabase/verify_daily_qa.sql` performs read-only checks for the shared profiles/admin allowlist/RLS, subject assignment, Science and SST counts, and question-only SST rows.

The existing `smartple_profiles` table and Auth trigger are not modified by the subject migration. The migration expects the already-established Q-A tables and guarded admin functions; it stops if those prerequisites are absent. Use the visible copy/download panels in `index.html`, `setup_sql_copy.html`, and `assign_student_sets_copy.html` to inspect/copy the complete SQL.

`daily_qa.sql`, `seed_daily_qa.sql`, and `seed_sst_questions.sql` are the sources used to build the combined fresh setup. The existing-install migration includes the SST seed and RPC changes as a re-runnable additive update.

Do not run an older Daily Q&A draft in place of these files or create separate student Auth accounts for Q-A. The admin-selected subject is stored in Q-A’s existing per-student settings table; it does not replace or duplicate student profiles. Before learner sign-in, check that each student's `smartple_profiles.class` is `P4`, `P5`, `P6`, or `P7`; a NULL class is treated as P4. Q-A admin access requires both an existing SmartPle profile with `role = 'admin'` and a matching row in `daily_qa_admins`. That allowlist is not accessible through the client API.

## Live connection and credentials

This is a static HTML app, so it does **not** load `.env` files at runtime. It is preconfigured with the student app's Supabase project URL and publishable key that you provided; you can review or change them under **Connection / SQL**. Any saved overrides are stored in this browser's local storage. The publishable key is intended for client use; never enter a service-role/secret key, and never store passwords in the app or database. Student and admin passwords are handled by the existing Supabase Auth project.

Serve the file from an `http(s)` site for live requests; some browsers block API requests from a `file://` URL. Demo previews work locally without a Supabase connection.

## PWA install and offline behavior

The app includes a web manifest, app icons, an install prompt where supported, and a service worker. Serve it from **HTTPS** (or `localhost` for testing); PWA installation/service workers do not work from `file://`. On iPhone/iPad, use **Share → Add to Home Screen**.

After the first visit, the service worker can reopen the app shell and embedded demo banks offline. Live student assignments—including the admin-selected subject—and saved progress come from Supabase; sign-in and live revision need internet. Supabase Auth/API responses and live learner progress are never cached, and offline actions are not queued for later sync.

## Behavior

- **Science:** guided revision shows one question with its answer/explanation. **NEXT** marks an unstudied question and advances; **BACK** reviews the previous question without undoing studied status.
- **SST:** shown only when the admin assigns SST. The student gets a daily set from the 168-question P3 Q1→P7 Q168 sequence, independent of profile class. It shows only questions and unmarked MCQ choices; there are no answer keys, answer reveals, or scores. Progress records studied status only.
- The built-in Admin Preview assigns **Science or SST per student** and controls global, P4–P7 class, and individual daily targets. Presets are **0, 5, 10, 20, and 50**, with a custom whole-number value from 0 to 500. Target precedence remains **student override → class rule → global default**; default is 20. A student-level 0 pauses that student.
- Clearing a student target override preserves the student’s assigned subject. The student list shows the assigned Science/SST mode and effective target.
- Science sets follow the existing P4→P7 sequence. SST sets follow the unique P3 Q1→P7 Q168 sequence. New sets skip questions previously assigned within that bank; active sets resume and retain their original subject and progress.
- Selecting a student shows the subject selector, target editor, latest-set progress, same-subject repeat/next-unused controls, and an expandable admin bank preview. SST previews never show answers. A subject switch applies to the next set and does not rewrite completed or active sets.
- After a student completes a set, the admin can repeat a completed set from the currently assigned subject or assign the next unused questions from that subject. New sets use the student’s effective target—20 by default—and the learner must finish an active set before another admin assignment.

## Validation status

The asset builder passes `py_compile`, and a repeat build produced byte-identical outputs for the SST export, CSV, seeds, setup/migration SQL and panels, and embedded app. Content checks confirm 660 ordered Science items (P4 160/P5 180/P6 200/P7 120) and 168 unique SST prompts across 34 topics (P3 15/P4 30/P5 55/P6 44/P7 24), in compact P3 Q1→P7 Q168 order, each with four unmarked choices and no answer key. The existing-install cleanup retires noncanonical SST rows without deleting history. The in-app setup and migration textareas and all three visible SQL copy/download panels match their source SQL exactly. JavaScript syntax checks and DOM-flow tests confirm Science remains the default with its answer view, admins alone can assign SST, a P7 learner still begins SST at P3 Q1, 20-question sets render SST without answers, Back preserves studied status, repeats reproduce a completed current-bank set, and the next unused set starts at source Q21. Historic retired-set prompts remain visible in progress but cannot be assigned again. `pglast` parsed the outer syntax of eight SQL files (fresh schema/setup, seeds, existing-install migration, verifier, authorization, and profile-security SQL); this does not execute PL/pgSQL function bodies or validate against a database. No Supabase SQL was executed during this refresh. The combined setup and admin authorization were reported successful earlier, so do not rerun them. Whether the refreshed existing-install migration has been applied is unconfirmed. The earlier read-only verifier stopped because the existing `smartple_profiles` table has RLS disabled and permissive grants/policies; `secure_smartple_profiles.sql` is prepared but has not been applied. Live sign-in/progress, full live verification, and device-level PWA installation/offline behavior remain untested.
