#!/usr/bin/env node
/* =============================================================================
   extractRevisionBank.mjs — pull the REAL exercises out of the teacher's notes.

   WHY THIS EXISTS
     Generating questions with a model produces plausible nonsense. The notes
     already end every topic with a REVISION QUESTIONS block and an ANSWERS TO
     REVISION QUESTIONS block that lines up with it one-for-one. This script
     copies those across verbatim. It never writes a question of its own and it
     never invents multiple-choice options — the corpus contains none (checked:
     all 2,116 items are written-answer questions).

   WHAT IT READS
     <src>/p4-math.json … p7-sst.json   (14 files, the built notes corpus)
     each file: { class, subject, subject_name, topics: [ { id, title, slug,
                  sections: [ { title, blocks: [ { t, items: [string] } ] } ] } ] }

   WHAT IT WRITES
     <out>/revisionBank.json — see shape below.

   USAGE
     node extractRevisionBank.mjs                        # defaults
     node extractRevisionBank.mjs --src DIR --out FILE   # explicit paths
     node extractRevisionBank.mjs --quiet

   DEFAULTS
     --src  <repo>/../../../../Uganda-spelling/ple-app/data/notes
            (the notes live in the student repo; the admin only ever sees the
             JSON this script produces, because a static site has no filesystem)
     --out  ../src/data/revisionBank.json

   EXIT CODES
     0 ok · 1 bad arguments / unreadable source · 2 a topic whose questions and
     answers do not line up, or an empty result — never emit a half-built bank.
============================================================================= */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/* ---- arguments -------------------------------------------------------- */
export function parseArgs(argv) {
  const a = { src: null, out: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--src') a.src = argv[++i];
    else if (t === '--out') a.out = argv[++i];
    else if (t === '--quiet') a.quiet = true;
    else if (t === '--help' || t === '-h') a.help = true;
    else throw new Error(`unknown argument: ${t}`);
  }
  a.src = resolve(HERE, a.src || '../../../../Uganda-spelling/ple-app/data/notes');
  a.out = resolve(HERE, a.out || '../src/data/revisionBank.json');
  return a;
}

/* ---- section recognition --------------------------------------------- */
/* Titles in the corpus are "REVISION QUESTIONS" and "ANSWERS TO REVISION
   QUESTIONS". The alternations below also catch a teacher who later writes
   "Revision Exercise", "Exercise 3" or "Answers", so the parser does not
   silently drop a block it did not anticipate. */
const RE_QUESTIONS = /^\s*(revision\s+(questions?|exercise(s)?)|exercise(s)?)\b/i;
const RE_ANSWERS = /^\s*answers?\b/i;
/* "P.5 QUICK REVISION" is a vocabulary recap, not an exercise — excluded on
   purpose, so the bank only ever contains things a student is asked to do. */
const RE_NOT_EXERCISE = /\bquick\s+revision\b/i;

/* ---- marks ------------------------------------------------------------ */
/* The notes carry no mark scheme, so this is a starting guess the admin edits.
   It only ever nudges the number; it cannot change the wording. */
const RE_MULTI_PART = /\b(two|three|four|five|six|seven|eight|2|3|4|5|6|7|8)\s+(reasons|ways|points|examples|items|advantages|disadvantages|differences|similarities|uses|benefits|causes|effects|steps|parts|members|names|types|figures)\b/i;
/* "explain / compare" genuinely needs a paragraph. "why" and "find" do not —
   "give two reasons why …" is one instruction, and letting both signals fire
   on the same clause quietly inflated a whole subject's mark scheme. */
const RE_HEAVY = /\b(explain|describe|discuss|distinguish|compare|contrast|justify|prove|show how|show that)\b/i;
const RE_LIGHT = /\b(why|find|calculate|work out|solve)\b/i;

export function guessMarks(question) {
  const multi = RE_MULTI_PART.test(question);
  const heavy = RE_HEAVY.test(question);
  const light = RE_LIGHT.test(question);
  let m = 1 + (multi || heavy || light ? 1 : 0) + (multi && heavy ? 1 : 0);
  return Math.min(m, 4);
}

/* ---- text hygiene ----------------------------------------------------- */
/* Answers arrive as markdown ("**n(M) = 4**", "1. …"). Strip the markup and
   any repeated numbering — the picker renumbers for itself — but keep the
   wording exactly as the teacher wrote it. */
export function cleanText(s) {
  if (typeof s !== 'string') return '';
  return s
    .replace(/```[\s\S]*?```/g, ' ')          // fenced code
    .replace(/`([^`]*)`/g, '$1')              // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')    // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')  // links -> their text
    .replace(/\*\*([^*]*)\*\*/g, '$1')        // bold
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')// italic
    .replace(/_{2,}([^_]*)_{2,}/g, '$1')      // __underline__
    .replace(/^\s*(?:\d+[\).]|[-*•]|[a-zA-Z][\).])\s+/, '') // list numbering
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---- the notes shape -------------------------------------------------- */
function textItems(section) {
  const out = [];
  for (const b of section?.blocks || []) {
    for (const it of b?.items || []) {
      const t = cleanText(it);
      if (t) out.push(t);
    }
  }
  return out;
}

/* Numbered section headings ("1. WHAT A SET IS") are the subtopics the
   revision set at the end covers. They are recorded for context only — the
   corpus does not attach individual questions to individual subtopics, and
   pretending otherwise would be a lie in the picker. */
const RE_SUBTOPIC = /^\s*\d+\s*[.).]\s*\S/;
function subtopicsOf(topic) {
  /* NOT cleanText(): that strips leading numbering, which is the very thing
     this test looks for, and "1. Union of sets" reads better in a picker. */
  return (topic.sections || [])
    .map(s => String(s?.title || '').replace(/\s+/g, ' ').trim())
    .filter(t => RE_SUBTOPIC.test(t) && !RE_NOT_EXERCISE.test(t));
}

/* ---- one topic -> one bank entry -------------------------------------- */
export function extractTopic(topic, meta) {
  const sections = topic.sections || [];
  const qSections = sections.filter(s => RE_QUESTIONS.test(s.title || '') && !RE_NOT_EXERCISE.test(s.title || ''));
  const aSections = sections.filter(s => RE_ANSWERS.test(s.title || ''));
  if (!qSections.length) return null;

  const questions = qSections.flatMap(textItems);
  const answers = aSections.flatMap(textItems);
  if (!questions.length) return null;

  /* The corpus pairs these one-for-one. If that ever stops being true the
     build must fail loudly rather than match question 7 to answer 9. */
  if (questions.length !== answers.length) {
    const e = new Error(
      `questions and answers do not line up in "${topic.title}" ` +
      `(${meta.file}): ${questions.length} questions, ${answers.length} answers`);
    e.code = 'MISALIGNED';
    throw e;
  }

  return {
    subject: meta.subject_name,
    subject_code: meta.subject,
    level: topic.class || meta.class,
    topic: topic.title,
    topic_id: topic.id,
    slug: topic.slug,
    subtopics: subtopicsOf(topic),
    source_section: qSections[0].title,
    questions: questions.map((question, i) => ({
      id: i + 1,
      qid: `${topic.id}-Q${i + 1}`,
      question,
      /* always 'short': the notes contain no option lists, and inventing them
         is the exact hallucination this bank exists to avoid */
      type: 'short',
      options: null,
      correct: null,
      answer: answers[i],
      marks: guessMarks(question),
      source: 'end_of_topic',
      source_section: qSections[0].title
    }))
  };
}

/* ---- whole corpus ------------------------------------------------------ */
export function buildBank(srcDir) {
  if (!existsSync(srcDir)) {
    const e = new Error(`notes not found at ${srcDir}\n` +
      `  pass the right folder:  node extractRevisionBank.mjs --src /path/to/ple-app/data/notes`);
    e.code = 'NO_SRC';
    throw e;
  }
  const files = readdirSync(srcDir).filter(f => f.endsWith('.json')).sort();
  if (!files.length) { const e = new Error(`no .json notes in ${srcDir}`); e.code = 'NO_SRC'; throw e; }

  const items = [];
  const perFile = {};
  for (const f of files) {
    const doc = JSON.parse(readFileSync(join(srcDir, f), 'utf8'));
    const meta = {
      file: f,
      class: doc.class || (f.match(/^p(\d)/i)?.[1] ? `P${f.match(/^p(\d)/i)[1]}` : ''),
      subject: (doc.subject || f.replace(/^p\d-|\.json$/g, '')).toUpperCase(),
      subject_name: doc.subject_name || doc.subject || f
    };
    let n = 0;
    for (const topic of doc.topics || []) {
      const entry = extractTopic(topic, meta);
      if (entry) { items.push(entry); n += entry.questions.length; }
    }
    perFile[f] = n;
  }

  if (!items.length) { const e = new Error('no revision questions found anywhere'); e.code = 'EMPTY'; throw e; }

  const total = items.reduce((a, e) => a + e.questions.length, 0);
  return {
    generated_from: 'ple-app/data/notes (REVISION QUESTIONS + ANSWERS TO REVISION QUESTIONS)',
    generated_by: 'apps/admin/tools/extractRevisionBank.mjs',
    generated_at: new Date().toISOString().slice(0, 10),
    counts: {
      topics: items.length,
      questions: total,
      subjects: [...new Set(items.map(i => i.subject))].length,
      per_file: perFile
    },
    levels: [...new Set(items.map(i => i.level))].sort(),
    subjects: [...new Set(items.map(i => i.subject))].sort(),
    items
  };
}

/* ---- entry point ------------------------------------------------------- */
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  let args;
  try { args = parseArgs(process.argv.slice(2)); }
  catch (e) { console.error(e.message); process.exit(1); }

  if (args.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 30).join('\n'));
    process.exit(0);
  }

  let bank;
  try { bank = buildBank(args.src); }
  catch (e) {
    console.error(`\n  revision bank NOT written: ${e.message}`);
    if (e.code === 'MISALIGNED') console.error('  Fix the notes, or the exam would mark against the wrong answer.\n');
    process.exit(e.code === 'MISALIGNED' ? 2 : 1);
  }

  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, JSON.stringify(bank));

  if (!args.quiet) {
    console.log(`\n  revision bank written -> ${args.out}`);
    console.log(`  ${bank.counts.topics} topics · ${bank.counts.questions} real questions · ` +
      `${bank.counts.subjects} subjects · levels ${bank.levels.join(', ')}`);
    console.log(`  ${(readFileSync(args.out, 'utf8').length / 1024).toFixed(0)} KB\n`);
    for (const [f, n] of Object.entries(bank.counts.per_file)) console.log(`    ${n.toString().padStart(5)}  ${f}`);
    console.log();
  }
}
