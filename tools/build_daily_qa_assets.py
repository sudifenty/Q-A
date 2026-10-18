#!/usr/bin/env python3
"""Regenerate Q-A/SST seeds, subject-assignment SQL panels, and embedded banks.

Edit content/question_bank.json or content/sst_questions_p3_p7.json in source order, then run:
    python tools/build_daily_qa_assets.py
"""
from __future__ import annotations

import csv
import json
import re
from html import escape as html_escape
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BANK_PATH = ROOT / "content" / "question_bank.json"
SEED_PATH = ROOT / "supabase" / "seed_daily_qa.sql"
SCHEMA_PATH = ROOT / "supabase" / "daily_qa.sql"
ASSIGNMENT_PATH = ROOT / "supabase" / "assign_student_sets.sql"
ASSIGNMENT_COPY_PATH = ROOT / "supabase" / "assign_student_sets_copy.html"
SETUP_PATH = ROOT / "supabase" / "setup_shared_project.sql"
COPY_PANEL_PATH = ROOT / "supabase" / "setup_sql_copy.html"
ORDER_PATH = ROOT / "content" / "question_order.csv"
SST_BANK_PATH = ROOT / "content" / "sst_questions_p3_p7.json"
SST_TEXT_PATH = ROOT / "content" / "SST_Questions_P3-P7_Only.txt"
SST_SEED_PATH = ROOT / "supabase" / "seed_sst_questions.sql"
HTML_PATH = ROOT / "index.html"
EXPECTED_COUNTS = {"P4": 160, "P5": 180, "P6": 200, "P7": 120}
EXPECTED_SST_COUNTS = {"P3": 15, "P4": 30, "P5": 55, "P6": 44, "P7": 24}
EXPECTED_SST_TOTAL = 168


def sql_text(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def grade_code(label: str) -> str:
    match = re.fullmatch(r"Primary ([4-7])", label)
    if not match:
        raise ValueError(f"Unsupported grade label: {label!r}")
    return "P" + match.group(1)


def load_and_validate() -> list[dict]:
    items = json.loads(BANK_PATH.read_text(encoding="utf-8"))
    if not isinstance(items, list):
        raise ValueError("The canonical question bank must be a JSON array.")
    counts = Counter(grade_code(item["grade"]) for item in items)
    if dict(counts) != EXPECTED_COUNTS:
        raise ValueError(f"Unexpected per-grade counts: {dict(counts)}")
    ids = [item["id"] for item in items]
    if len(ids) != len(set(ids)):
        raise ValueError("Question IDs must be unique.")
    for code, count in EXPECTED_COUNTS.items():
        grade_items = [item for item in items if grade_code(item["grade"]) == code]
        if [item["number"] for item in grade_items] != list(range(1, count + 1)):
            raise ValueError(f"{code} question numbers must be sequential and source-ordered.")
        for item in grade_items:
            if item.get("subject") != "Science":
                raise ValueError(f"Only Science is supported in the current Q-A app: {item['id']}")
            if not item.get("question", "").strip() or not item.get("answer", "").strip():
                raise ValueError(f"Question and answer are required: {item['id']}")
    return items




def load_and_validate_sst() -> list[dict]:
    """Load the curated P3–P7 SST source, rejecting repeated/rephrased prompts."""
    items = json.loads(SST_BANK_PATH.read_text(encoding="utf-8"))
    if not isinstance(items, list):
        raise ValueError("The SST bank must be a JSON array.")
    counts = Counter(item.get("class") for item in items)
    if dict(counts) != EXPECTED_SST_COUNTS:
        raise ValueError(f"Unexpected deduplicated SST class counts: {dict(counts)}")
    if len(items) != EXPECTED_SST_TOTAL:
        raise ValueError(f"Expected {EXPECTED_SST_TOTAL} distinct SST questions; found {len(items)}")
    expected_keys = {"id", "source_number", "sort_order", "class", "subject", "topic", "prompt", "options"}
    ids = [item.get("id") for item in items]
    if len(ids) != len(set(ids)):
        raise ValueError("SST question IDs must be unique.")
    seen_prompts: set[str] = set()
    previous_class = 0
    previous_sort_order = 0
    mcq_count = 0
    class_codes = {f"P{n}": n for n in range(3, 8)}
    template_prefix = re.compile(
        r"^(?:answer in one or two sentences|explain briefly|state the correct answer|"
        r"answer orally|write a clear SST answer|choose the best answer|true or false|"
        r"complete this revision statement|give a brief explanation|apply what you know|challenge)\b",
        re.I,
    )
    for number, item in enumerate(items, start=1):
        if set(item) != expected_keys:
            raise ValueError(f"SST item {number} must contain only question fields; found keys {sorted(item)}")
        if item["source_number"] != number:
            raise ValueError(f"Deduplicated SST order must be Q1–Q{EXPECTED_SST_TOTAL}; position {number} has {item['source_number']}")
        if not isinstance(item["sort_order"], int) or item["sort_order"] <= previous_sort_order or item["sort_order"] > 2040:
            raise ValueError(f"Original SST source order must be strictly increasing at Q{number}")
        previous_sort_order = item["sort_order"]
        if item["subject"] != "SST" or item["class"] not in EXPECTED_SST_COUNTS:
            raise ValueError(f"Invalid SST class/subject at Q{number}")
        class_number = class_codes[item["class"]]
        if class_number < previous_class:
            raise ValueError(f"SST class order goes backwards at Q{number}")
        previous_class = class_number
        if not item["prompt"].strip() or not item["topic"].strip():
            raise ValueError(f"SST prompt/topic is empty at Q{number}")
        if template_prefix.search(item["prompt"].strip()):
            raise ValueError(f"Repetitive prompt template found at SST Q{number}: {item['prompt']}")
        normalized_prompt = re.sub(r"[^a-z0-9]+", " ", item["prompt"].casefold()).strip()
        if normalized_prompt in seen_prompts:
            raise ValueError(f"Repeated SST prompt found at Q{number}: {item['prompt']}")
        seen_prompts.add(normalized_prompt)
        options = item["options"]
        if not isinstance(options, list) or len(options) != 4 or not all(isinstance(option, str) and option.strip() for option in options):
            raise ValueError(f"SST MCQ options must be four unmarked strings at Q{number}")
        if any(re.match(r"^\s*(?:[A-D][.)]|\([A-D]\)|✓|✔|☑|correct\b)", option, re.I) for option in options):
            raise ValueError(f"SST option text must not contain answer markers at Q{number}")
        mcq_count += 1
    if len(seen_prompts) != EXPECTED_SST_TOTAL:
        raise ValueError("Every SST learning-point prompt must be unique.")
    if len({item["topic"] for item in items}) != 34:
        raise ValueError("The deduplicated SST bank must retain all 34 topics.")
    if mcq_count != EXPECTED_SST_TOTAL:
        raise ValueError(f"Expected {EXPECTED_SST_TOTAL} unique four-choice SST questions; found {mcq_count}")
    return items

def build_sst_text(items: list[dict]) -> str:
    """Create a readable question-only copy; never serialize answer keys."""
    lines = ["Uganda Primary SST Revision — Questions Only", f"P3 to P7 · {len(items)} unique questions · one per learning point · source order", ""]
    current_class = None
    current_topic = None
    for item in items:
        if item["class"] != current_class:
            current_class = item["class"]
            current_topic = None
            lines.extend(["", f"{current_class} SST", "=" * (len(current_class) + 4), ""])
        if item["topic"] != current_topic:
            current_topic = item["topic"]
            lines.extend([current_topic, "-" * len(current_topic)])
        lines.append(f"Q{item['source_number']}. {item['prompt']}")
        if item["options"]:
            lines.extend(f"{chr(65 + index)}. {option}" for index, option in enumerate(item["options"]))
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def build_seed(items: list[dict]) -> str:
    lines = [
        "-- Existing question/answer wording and source order are preserved for P4-P7 Science.",
        "-- Counts: P4 160, P5 180, P6 200, P7 120 (660 total).",
        "-- Run after supabase/daily_qa.sql. The matching question-only order index is content/question_order.csv.",
        "insert into public.daily_qa_questions",
        "  (id, grade, subject, topic, sort_order, prompt, answer, source_file, is_active)",
        "values",
    ]
    rows = []
    for item in items:
        values = [
            sql_text(item["id"]),
            sql_text(grade_code(item["grade"])),
            sql_text(item["subject"]),
            sql_text(item["topic"]),
            str(int(item["number"])),
            sql_text(item["question"]),
            sql_text(item["answer"]),
            sql_text(item.get("source_file", "")),
            "true",
        ]
        rows.append("  (" + ", ".join(values) + ")")
    lines.append(",\n".join(rows))
    lines.extend([
        "on conflict (id) do update set",
        "  grade = excluded.grade,",
        "  subject = excluded.subject,",
        "  topic = excluded.topic,",
        "  sort_order = excluded.sort_order,",
        "  prompt = excluded.prompt,",
        "  answer = excluded.answer,",
        "  source_file = excluded.source_file,",
        "  is_active = excluded.is_active;",
        "",
    ])
    return "\n".join(lines)


def build_sst_seed(items: list[dict]) -> str:
    """Build SQL rows without any SST answer key; MCQ choices stay unmarked JSON."""
    lines = [
        f"-- {len(items)} unique P3-P7 SST questions; answer is NULL for every row.",
        f"-- One question per learning point, compact source order P3 Q1 through P7 Q{len(items)}; choices are unmarked.",
        "insert into public.daily_qa_questions",
        "  (id, grade, subject, topic, sort_order, source_number, prompt, answer, options, source_file, is_active)",
        "values",
    ]
    rows = []
    for item in items:
        options = item["options"]
        options_sql = "NULL" if options is None else sql_text(json.dumps(options, ensure_ascii=False, separators=(",", ":"))) + "::jsonb"
        values = [
            sql_text(item["id"]),
            sql_text(item["class"]),
            sql_text("SST"),
            sql_text(item["topic"]),
            str(int(item["sort_order"])),
            str(int(item["source_number"])),
            sql_text(item["prompt"]),
            "NULL",
            options_sql,
            sql_text("content/sst_questions_p3_p7.json"),
            "true",
        ]
        rows.append("  (" + ", ".join(values) + ")")
    lines.append(",\n".join(rows))
    lines.extend([
        "on conflict (id) do update set",
        "  grade = excluded.grade,",
        "  subject = excluded.subject,",
        "  topic = excluded.topic,",
        "  sort_order = excluded.sort_order,",
        "  source_number = excluded.source_number,",
        "  prompt = excluded.prompt,",
        "  answer = excluded.answer,",
        "  options = excluded.options,",
        "  source_file = excluded.source_file,",
        "  is_active = excluded.is_active;",
        "",
    ])
    return "\n".join(lines)


def build_sst_dedupe_cleanup(items: list[dict]) -> str:
    """Deactivate only obsolete SST paraphrases; keep rows for historical assignments."""
    ids = ",\n  ".join(sql_text(item["id"]) for item in items)
    return (
        "-- Retire earlier templated paraphrases without deleting rows or breaking saved progress.\n"
        "update public.daily_qa_questions\n"
        "set is_active = false\n"
        "where subject = 'SST' and is_active\n"
        f"  and id not in (\n  {ids}\n  );\n"
    )


def replace_generated_block(sql: str, start_marker: str, end_marker: str, replacement: str) -> str:
    pattern = re.compile(re.escape(start_marker) + r".*?" + re.escape(end_marker), re.S)
    start_line = start_marker + "\n"
    end_line = "\n" + end_marker
    value = start_line + replacement.rstrip() + end_line
    updated, count = pattern.subn(lambda _: value, sql, count=1)
    if count != 1:
        raise ValueError(f"Could not find generated SQL block {start_marker!r}..{end_marker!r}")
    return updated


def build_order_csv(items: list[dict]) -> str:
    from io import StringIO

    output = StringIO(newline="")
    fields = ["grade", "grade_code", "sort_order", "topic_order", "topic_id", "topic", "question_id", "question"]
    writer = csv.DictWriter(output, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    topic_orders: dict[str, dict[str, int]] = {}
    for item in items:
        code = grade_code(item["grade"])
        mapping = topic_orders.setdefault(code, {})
        topic_key = item.get("topic_id") or item["topic"]
        if topic_key not in mapping:
            mapping[topic_key] = len(mapping) + 1
        writer.writerow({
            "grade": item["grade"],
            "grade_code": code,
            "sort_order": item["number"],
            "topic_order": mapping[topic_key],
            "topic_id": item.get("topic_id") or "",
            "topic": item["topic"],
            "question_id": item["id"],
            "question": item["question"],
        })
    return output.getvalue()


def build_sql_copy_panel(setup_sql: str, sst_count: int) -> str:
    """Create a browser-viewable copy/download panel for the complete setup SQL."""
    template = r'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Q-A Supabase setup SQL</title>
<style>
:root{color-scheme:light;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#18241d;background:#f4f7f4}
*{box-sizing:border-box}body{margin:0;padding:20px}main{max-width:1100px;margin:0 auto;background:#fff;border:1px solid #dbe4dc;border-radius:16px;overflow:hidden;box-shadow:0 8px 28px #1a392414}
header{padding:22px 24px;border-bottom:1px solid #e4ebe4}h1{margin:0 0 8px;font-size:22px}p{margin:6px 0;color:#526157;font-size:14px;line-height:1.5}.note{padding:13px 24px;background:#fff7df;border-bottom:1px solid #f0e3bd;color:#654d1a;font-size:13px;line-height:1.5}
.toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:14px 24px;border-bottom:1px solid #e4ebe4}button{display:inline-flex;align-items:center;gap:8px;border:1px solid #cfdacf;border-radius:9px;background:#fff;color:#1c3525;font:700 14px system-ui,sans-serif;padding:10px 14px;cursor:pointer}button.primary{background:#176b42;border-color:#176b42;color:#fff}button:hover{filter:brightness(.96)}svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}#status{font-size:13px;color:#24633f;min-height:1.4em}
textarea{display:block;width:100%;height:min(70vh,900px);min-height:460px;resize:vertical;border:0;background:#111a17;color:#e3f2e9;padding:20px 22px;font:12px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre;tab-size:2;outline:none}footer{padding:12px 24px;color:#647166;font-size:12px}
@media(max-width:600px){body{padding:8px}header{padding:18px}.note,.toolbar,footer{padding-left:18px;padding-right:18px}textarea{font-size:11px;height:68vh}}
</style>
</head>
<body>
<main>
<header>
<h1>Q-A — Supabase setup SQL</h1>
<p>This is the full, additive schema-plus-seed script for the existing SmartPle student-app project: <strong>__LINE_COUNT__ lines, __TOTAL_COUNT__ questions (660 Science + __SST_COUNT__ unique SST)</strong>.</p>
<p>For a fresh project, this includes the guided P4→P7 Science bank, question-only P3→P7 SST bank, and admin-assigned student subject with the shared daily target/set flow. On an already-set-up project, do not rerun this full setup; apply the refreshed <code>assign_student_sets.sql</code> migration.</p>
<p>The assignment migration is safe to reapply if you already ran an earlier copy. Then run <code>authorize_qa_admin.sql</code> if needed, review/apply <code>secure_smartple_profiles.sql</code>, and finish with <code>verify_daily_qa.sql</code>.</p>
</header>
<div class="note"><strong>Before running:</strong> make sure Supabase is open to project <code>ftykmafgfyqvniacguyi</code>. The script checks for the expected <code>smartple_profiles</code> table/columns and stops if they are missing. This panel does not run SQL or contact Supabase.</div>
<div class="toolbar">
<button class="primary" id="copy" type="button" aria-label="Copy the complete SQL"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"></path></svg>Copy SQL</button>
<button id="download" type="button" aria-label="Download the SQL file"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path></svg>Download .sql</button>
<span id="status" role="status" aria-live="polite"></span>
</div>
<textarea id="sql" readonly spellcheck="false" aria-label="Complete copy-paste-ready Supabase setup SQL">__ESCAPED_SQL__</textarea>
<footer>Tip: if clipboard access is blocked, click inside the SQL box, press Ctrl+A (or ⌘A), then Ctrl+C (or ⌘C).</footer>
</main>
<script>
const box=document.getElementById('sql');
const status=document.getElementById('status');
function say(text){status.textContent=text;}
document.getElementById('copy').addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(box.value);say('Copied the full setup SQL. Paste it into Supabase SQL Editor.');}
  catch(_){box.focus();box.select();box.setSelectionRange(0,box.value.length);try{if(document.execCommand('copy'))say('Copied the full setup SQL. Paste it into Supabase SQL Editor.');else say('SQL selected; press Ctrl+C or ⌘C to copy.');}catch(__){say('SQL selected; press Ctrl+C or ⌘C to copy.');}}
});
document.getElementById('download').addEventListener('click',()=>{
  const blob=new Blob([box.value],{type:'text/sql;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='setup_shared_project.sql';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);say('Download started.');
});
</script>
</body>
</html>'''
    return (template
            .replace("__LINE_COUNT__", f"{len(setup_sql.splitlines()):,}")
            .replace("__SST_COUNT__", f"{sst_count:,}")
            .replace("__TOTAL_COUNT__", f"{660 + sst_count:,}")
            .replace("__ESCAPED_SQL__", html_escape(setup_sql, quote=False)))



def build_assignment_copy_panel(sql_text: str, sst_count: int) -> str:
    # Visible, standalone Copy/Download panel for the existing-install migration.
    template = r'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Q-A shared sequence and admin set update SQL</title>
<style>
:root{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#18241d;background:#f4f7f4}*{box-sizing:border-box}body{margin:0;padding:20px}main{max-width:1100px;margin:0 auto;background:#fff;border:1px solid #dbe4dc;border-radius:16px;overflow:hidden;box-shadow:0 8px 28px #1a392414}header{padding:22px 24px;border-bottom:1px solid #e4ebe4}h1{margin:0 0 8px;font-size:22px}p{margin:6px 0;color:#526157;font-size:14px;line-height:1.5}.note{padding:13px 24px;background:#fff7df;border-bottom:1px solid #f0e3bd;color:#654d1a;font-size:13px;line-height:1.5}.toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:14px 24px;border-bottom:1px solid #e4ebe4}button{display:inline-flex;align-items:center;gap:8px;border:1px solid #cfdacf;border-radius:9px;background:#fff;color:#1c3525;font:700 14px system-ui,sans-serif;padding:10px 14px;cursor:pointer}button.primary{background:#176b42;border-color:#176b42;color:#fff}#status{font-size:13px;color:#24633f;min-height:1.4em}textarea{display:block;width:100%;height:min(70vh,900px);min-height:460px;resize:vertical;border:0;background:#111a17;color:#e3f2e9;padding:20px 22px;font:12px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre;outline:none}footer{padding:12px 24px;color:#647166;font-size:12px}@media(max-width:600px){body{padding:8px}header{padding:18px}.note,.toolbar,footer{padding-left:18px;padding-right:18px}textarea{font-size:11px;height:68vh}}
</style>
</head>
<body><main>
<header><h1>Q-A — Shared sequence and admin set update SQL</h1>
<p>This re-runnable migration deactivates the old paraphrase variants, keeps one unique question per SST learning point, and preserves the daily set flow. The active bank follows P3 Q1 through P7 Q__SST_COUNT__. New sets use the student's effective daily target (20 by default); existing Auth/profile rows and saved progress are retained.</p>
<p>Run it in the existing SmartPle project’s SQL Editor after the Q-A setup. It is safe to reapply; fresh setup already includes the current behavior.</p></header>
<div class="note"><strong>Safe scope:</strong> adds Q-A bank columns/rows and updates subject-aware assignment RPCs. It does not create accounts, modify profile rows, replace Auth/security setup, or change existing progress. A subject change applies to the next set; an active set is finished unchanged.</div>
<div class="toolbar"><button class="primary" id="copy" type="button">Copy SQL</button><button id="download" type="button">Download .sql</button><span id="status" role="status" aria-live="polite"></span></div>
<textarea id="sql" readonly spellcheck="false" aria-label="Complete admin set assignment update SQL">__ESCAPED_SQL__</textarea>
<footer>Tip: if clipboard access is blocked, click inside the SQL box, press Ctrl+A (or ⌘A), then Ctrl+C (or ⌘C).</footer>
</main><script>
const box=document.getElementById('sql'),status=document.getElementById('status');
function say(text){status.textContent=text;}
document.getElementById('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(box.value);say('Copied. Paste the migration into Supabase SQL Editor.');}catch(_){box.focus();box.select();box.setSelectionRange(0,box.value.length);try{if(document.execCommand('copy'))say('Copied. Paste the migration into Supabase SQL Editor.');else say('SQL selected; press Ctrl+C or ⌘C to copy.');}catch(__){say('SQL selected; press Ctrl+C or ⌘C to copy.');}}});
document.getElementById('download').addEventListener('click',()=>{const blob=new Blob([box.value],{type:'text/sql;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='assign_student_sets.sql';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);say('Download started.');});
</script></body></html>'''
    return (template
            .replace("__SST_COUNT__", f"{sst_count:,}")
            .replace("__ESCAPED_SQL__", html_escape(sql_text, quote=False)))


def embed_json(html: str, script_id: str, value: str | list[dict]) -> str:
    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    # Prevent question text from ever closing the surrounding script element.
    encoded = encoded.replace("</", "<\\/")
    pattern = rf'(<script id="{re.escape(script_id)}" type="application/json">)(.*?)(</script>)'
    updated, count = re.subn(pattern, lambda m: m.group(1) + encoded + m.group(3), html, count=1, flags=re.S)
    if count != 1:
        raise ValueError(f"Could not find embedded JSON script #{script_id} in index.html")
    return updated


def main() -> None:
    items = load_and_validate()
    sst_items = load_and_validate_sst()
    seed_sql = build_seed(items)
    sst_seed_sql = build_sst_seed(sst_items)
    SST_TEXT_PATH.write_text(build_sst_text(sst_items), encoding="utf-8")
    SST_SEED_PATH.write_text(sst_seed_sql, encoding="utf-8")
    SEED_PATH.write_text(seed_sql, encoding="utf-8")
    schema_sql = SCHEMA_PATH.read_text(encoding="utf-8")
    assignment_sql = ASSIGNMENT_PATH.read_text(encoding="utf-8")
    assignment_sql = replace_generated_block(
        assignment_sql,
        "-- BEGIN GENERATED SST QUESTION-ONLY BANK",
        "-- END GENERATED SST QUESTION-ONLY BANK",
        sst_seed_sql,
    )
    assignment_sql = replace_generated_block(
        assignment_sql,
        "-- BEGIN GENERATED SST DEDUPLICATION FILTER",
        "-- END GENERATED SST DEDUPLICATION FILTER",
        build_sst_dedupe_cleanup(sst_items),
    )
    ASSIGNMENT_PATH.write_text(assignment_sql, encoding="utf-8")
    setup_sql = (
        "-- COPY/PASTE THIS ENTIRE FILE into the SQL Editor of the existing SmartPle project.\n"
        f"-- Fresh setup: 660 guided Science Q&A questions plus {len(sst_items)} unique SST questions.\n"
        "-- Admin assigns Science or SST per student; both use the same daily target (20 by default).\n"
        "-- After setup, run authorize_qa_admin.sql only if not already successful, then review the\n"
        "-- separate profile-security patch and finish with verify_daily_qa.sql.\n"
        "-- If setup already succeeded, do not rerun it; apply the refreshed assign_student_sets.sql migration once.\n"
        "-- Never put a service-role key in the client.\n\n"
        + schema_sql.rstrip()
        + "\n\n-- Ordered P4-P7 Science Q&A seed (660 items).\n"
        + seed_sql.rstrip()
        + f"\n\n-- Unique question-only P3-P7 SST bank ({len(sst_items)} items; answers are NULL).\n"
        + sst_seed_sql.rstrip()
        + "\n"
    )
    SETUP_PATH.write_text(setup_sql, encoding="utf-8")
    COPY_PANEL_PATH.write_text(build_sql_copy_panel(setup_sql, len(sst_items)), encoding="utf-8")
    ASSIGNMENT_COPY_PATH.write_text(build_assignment_copy_panel(assignment_sql, len(sst_items)), encoding="utf-8")
    ORDER_PATH.write_text(build_order_csv(items), encoding="utf-8")
    html = HTML_PATH.read_text(encoding="utf-8")
    html = embed_json(html, "question-bank", items)
    html = embed_json(html, "sst-question-bank", sst_items)
    html = embed_json(html, "schema-sql", schema_sql)
    html = embed_json(html, "assignment-sql", assignment_sql)
    html = embed_json(html, "seed-sql", seed_sql)
    html = embed_json(html, "sst-seed-sql", sst_seed_sql)
    HTML_PATH.write_text(html, encoding="utf-8")
    print("Generated 660 ordered Q&A items:", dict(Counter(grade_code(item["grade"]) for item in items)))
    print(f"Wrote {SEED_PATH.relative_to(ROOT)}")
    print(f"Wrote {SST_SEED_PATH.relative_to(ROOT)} ({len(sst_items)} unique question-only SST rows; NULL answers)")
    print(f"Wrote {SETUP_PATH.relative_to(ROOT)} (schema + seed, ready to copy/paste)")
    print(f"Wrote {COPY_PANEL_PATH.relative_to(ROOT)} (visible setup SQL with Copy and Download controls)")
    print(f"Wrote {ASSIGNMENT_COPY_PATH.relative_to(ROOT)} (visible existing-install migration with Copy and Download controls)")
    print(f"Wrote {ORDER_PATH.relative_to(ROOT)} (questions only; no answers)")
    print(f"Wrote {SST_TEXT_PATH.relative_to(ROOT)} (questions only; no answers)")
    print(f"Validated 660 Science and {len(sst_items)} unique question-only SST rows")
    print("Synchronized embedded banks and complete setup/upgrade SQL")


if __name__ == "__main__":
    main()
