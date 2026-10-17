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
content/sst_questions_p3_p7.json Canonical P3–P7 SST questions only; 2,040 source-ordered items
content/SST_Questions_P3-P7_Only.txt Readable SST question-only export; no answer keys
supabase/setup_shared_project.sql Paste-ready schema plus 660 Science and 2,040 question-only SST rows
supabase/setup_sql_copy.html     Visible SQL panel with copy/download controls
supabase/secure_smartple_profiles.sql Restricts shared profile access while preserving student/admin reads
supabase/secure_profiles_copy.html    Visible profile-security patch with copy/download controls
supabase/daily_qa.sql            Fresh schema for Science/SST banks and admin-assigned daily sets
supabase/assign_student_sets.sql Existing-install update: SST data, subject assignment, and shared set RPCs
supabase/assign_student_sets_copy.html  Visible migration panel with copy/download controls
supabase/authorize_qa_admin.sql  Maps an existing SmartPle admin to the protected Q-A allowlist
supabase/seed_daily_qa.sql       Canonical 660 ordered P4–P7 Science Q&A seed
supabase/seed_sst_questions.sql  2,040 SST questions only; options unmarked, answers NULL
supabase/verify_daily_qa.sql     Read-only checks for profiles, RLS/RPCs, both banks, and subject assignment
supabase/verify_sql_copy.html    Visible verifier panel with copy/download controls
tools/build_daily_qa_assets.py   Rebuilds both bank seeds, SQL panels, SST text export, CSV, and embedded data
.env.example                     Reference for browser connection fields; not loaded at runtime
```

## Question-bank scope and order

The existing Science Q&A wording, source IDs, answers, P4–P7 order, targets, and admin controls are preserved. Its counts remain **P4: 160, P5: 180, P6: 200, P7: 120** (660 total). The separate SST source contains **2,040 questions** in one uninterrupted order: P3 180, P4 360, P5 660, P6 540, P7 300 (34 topics; 170 four-choice MCQs). MCQ choices are plain, unmarked text. SST contains no answer key; in SQL its `answer` is `NULL`.

For Science Q&A, edit `content/question_bank.json`. For SST, edit only `content/sst_questions_p3_p7.json` and preserve source order and Q1–Q2040 numbering. Run from the repository root:

```bash
python tools/build_daily_qa_assets.py
```

The builder validates both banks; regenerates the 660 Science rows and 2,040 SST question-only rows; rebuilds fresh setup and existing-install migration SQL with visible Copy/Download panels; creates the SST text export; and embeds the demo banks and complete SQL in `index.html`.

## Admin-assigned subject and daily sets

In the built-in Admin Preview, select a student and set **Assigned subject** to **Science** or **SST**. This is a per-student admin control; the learner sees the selected subject in their normal daily-set flow and cannot switch subjects. New sets use the same effective admin-controlled target for both subjects—**20 questions by default**. If the admin changes the target, the next set follows that value just like Science.

Science remains the guided P4–P7 question-and-answer set. SST uses the same assignment/progress flow but provides question-only content: SST students receive the next unused items starting at P3 Q1, continuing across class boundaries through P7 Q2040, with any MCQ options unmarked. There is no SST answer reveal, answer key, or scoring. Studied-status tracking, Back/Next review, admin repeat, and next-unused assignment use the existing set controls.

A subject change does not rewrite history. An active set completes in its original subject, with progress unchanged; the admin’s new selection applies to the next set. A completed same-day set from the previous subject does not block a set for the newly assigned subject. Existing students and missing subject settings default to Science, preserving current behavior until the admin chooses SST. The question-bank row policy also limits direct authenticated reads to the student’s assigned subject; admins retain access to both banks.

## Shared Supabase Auth and setup

Q-A is configured to use the **same Supabase project and Auth accounts as the existing student app**. Each student signs in with the same account; the migration does not create duplicate Auth users or copy passwords. It maintains a read-only `daily_qa_profiles` mapping keyed by the same Auth `user_id`, populated from `smartple_profiles`. Existing accounts with a non-NULL `smartple_profiles.user_id` are backfilled at setup; a student syncs only their own profile at sign-in, and the Q-A admin roster refresh syncs linked new/current student profiles. Legacy source rows with NULL or nonmatching `user_id` values are left untouched and skipped because they cannot be matched to a Supabase Auth account; they remain unavailable in Q-A until linked to a real Auth user. These are guarded RPCs, not triggers: the Q-A setup SQL leaves the existing Auth signup trigger and SmartPle profile policies/grants untouched. Because the current `smartple_profiles` access is overly broad, apply the separate, reviewable profile-security patch before live student use. The Q-A mapping is metadata only, not another login.

Use these files in the existing student app project’s SQL Editor:

1. **Fresh install only:** run the complete `supabase/setup_shared_project.sql`. It includes the additive schema, existing profile mapping/RLS/RPCs, 660 Science Q&A rows, 2,040 SST question-only rows, and admin subject-assignment/daily-set functions. It reuses the existing Auth accounts. If the Q-A setup has already succeeded, do **not** rerun this full setup.
2. Run `supabase/authorize_qa_admin.sql` only if the existing admin authorization has **not** already succeeded. Do not repeat a successful authorization step.
3. **Existing Q-A install:** run the refreshed `supabase/assign_student_sets.sql` once. This idempotent feature migration adds the subject/options columns, question-only SST rows, and subject-aware set RPCs. It preserves existing Auth users, profiles, Science questions, active assignments, and studied progress; existing students default to Science. It does not rerun the full setup or change the admin allowlist.
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
- **SST:** shown only when the admin assigns SST. The student gets a daily set from the P3 Q1→P7 Q2040 sequence, independent of profile class. It shows only questions and unmarked MCQ choices; there are no answer keys, answer reveals, or scores. Progress records studied status only.
- The built-in Admin Preview assigns **Science or SST per student** and controls global, P4–P7 class, and individual daily targets. Presets are **0, 5, 10, 20, and 50**, with a custom whole-number value from 0 to 500. Target precedence remains **student override → class rule → global default**; default is 20. A student-level 0 pauses that student.
- Clearing a student target override preserves the student’s assigned subject. The student list shows the assigned Science/SST mode and effective target.
- Science sets follow the existing P4→P7 sequence. SST sets follow P3 Q1→P7 Q2040. New sets skip questions previously assigned within that bank; active sets resume and retain their original subject and progress.
- Selecting a student shows the subject selector, target editor, latest-set progress, same-subject repeat/next-unused controls, and an expandable admin bank preview. SST previews never show answers. A subject switch applies to the next set and does not rewrite completed or active sets.
- After a student completes a set, the admin can repeat a completed set from the currently assigned subject or assign the next unused questions from that subject. New sets use the student’s effective target—20 by default—and the learner must finish an active set before another admin assignment.

## Validation status

Static checks confirmed all 660 existing Q&A items, exact source wording/order, per-grade counts, the questions-only CSV, generated seed, combined setup SQL, refreshed assignment migration and copy panel, verifier panel parity, and embedded HTML copies. SST checks confirmed the 2,040-item source-number sequence, class totals and boundaries (P3 180, P4 360, P5 660, P6 540, P7 300), 34 topics, 170 four-choice questions, question-only fields, no answer-key lines in the text export, and an embedded bank identical to the canonical JSON. JavaScript syntax and DOM smoke tests confirmed SST Q1→Q2040 across class boundaries, completion/restart behavior, and preservation of the original Q&A demo questions and answers. The admin full-bank rendering, service worker, PWA manifest, icon assets, required DOM IDs, and local asset responses were also checked. Demo tests confirmed that a P7 learner starts at P4 Q1, the sequence crosses into P5 only after P4, explicit repeats reproduce the selected set, and next-unused assignment skips previously assigned items. Student Back/Next tests confirmed previous-question review preserves studied timestamps and only unstudied items are submitted as progress. The SQL migration was statically reviewed but has not been executed or validated against a live PostgreSQL project. The owner reports the combined SQL setup and admin authorization succeeded; do not rerun the full setup for these changes. The read-only verifier stopped because the existing `smartple_profiles` table has RLS disabled and permissive grants/policies. `secure_smartple_profiles.sql` is prepared but has not been applied; student login, live assignment flow, full verification, and device-level PWA installation/offline behavior remain untested.
