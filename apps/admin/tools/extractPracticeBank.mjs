#!/usr/bin/env node
/* =============================================================================
   extractPracticeBank.mjs — the questions the STUDENT APP already uses.

   The student app ships data/practice/*.json inside its single HTML file. These
   are real, answered questions — 3,791 of them with four options and a correct
   letter, so they mark themselves on the phone. This script copies them into the
   admin so a paper can be built from work the students have already seen,
   instead of the teacher writing new questions from memory.

   Like its sister script (extractRevisionBank.mjs) it invents nothing: the
   question, every option, the correct letter and the explanation are copied as
   they are. The only thing computed here is a starting mark, and the admin can
   change it.

   WHAT IT READS
     <src>/*.json  — 23 files, one per subject+class, each:
       { class, subject, questions: [ { id, topic, subtopic, difficulty,
         questionType, question, options, correctAnswer, answers, answerValue,
         pairs, explanation } ] }

   USAGE
     node extractPracticeBank.mjs [--src DIR] [--out FILE] [--quiet]

   EXIT CODES
     0 ok · 1 bad arguments / unreadable source · 2 a question that cannot be
     represented honestly (an MCQ with no correct letter, an empty option, …).
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
  a.src = resolve(HERE, a.src || '../../../../Uganda-spelling/ple-app/data/practice');
  a.out = resolve(HERE, a.out || '../src/data/practiceBank.json');
  return a;
}

/* ---- subject names ---------------------------------------------------- */
/* practice files use short codes for some subjects and full names for others;
   the admin's subject dropdown uses SST / SCI / ENG / MATH */
const SUBJECTS = {
  SST: 'Social Studies', MATH: 'Mathematics', SCI: 'Science', ENG: 'English',
  'SOCIAL STUDIES': 'Social Studies', MATHEMATICS: 'Mathematics',
  SCIENCE: 'Science', ENGLISH: 'English'
};
export function normaliseSubject(raw) {
  const up = String(raw || '').trim().toUpperCase();
  const name = SUBJECTS[up] || String(raw || '').trim() || 'Unknown';
  const code = Object.keys(SUBJECTS).find(k => SUBJECTS[k] === name && k.length <= 4) || up.slice(0, 4);
  return { code, name };
}

/* ---- option / answer cleaning ----------------------------------------- */
/* options arrive lettered ("A. Kenya"); the admin edits the letters itself, so
   only the text is kept. Nothing else about the wording is touched. */
export function stripLetter(s) {
  return String(s == null ? '' : s).replace(/^\s*[A-Da-d]\s*[.):]\s*/, '').replace(/\s+/g, ' ').trim();
}

const firstText = (...vals) => {
  for (const v of vals) {
    if (Array.isArray(v)) { const f = firstText(...v); if (f) return f; }
    else if (typeof v === 'string' && v.trim()) return v.replace(/\s+/g, ' ').trim();
  }
  return '';
};

/* ---- one raw question -> one bank question ----------------------------- */
export function convertQuestion(q, meta) {
  const question = firstText(q.question);
  if (!question) {
    const e = new Error(`${q.id}: question text is empty`); e.code = 'BAD_QUESTION'; throw e;
  }

  const rawOptions = Array.isArray(q.options) ? q.options.map(stripLetter).filter(Boolean) : [];
  const letter = typeof q.correctAnswer === 'string' ? q.correctAnswer.trim().toUpperCase() : '';
  /* any single letter counts as a key here; whether it is a VALID key is the
     range check below. Keeping the two apart is what lets a key like "E" on a
     four-option question be reported as out of range instead of "no key". */
  const isLetter = /^[A-Z]$/.test(letter);
  const inRange = isLetter && letter.charCodeAt(0) - 65 < rawOptions.length;
  const isMcq = rawOptions.length >= 2 && inRange;

  if (rawOptions.length >= 2 && !isMcq) {
    /* Options but no usable key. We could guess from the explanation, and that
       is exactly what we must not do — fail so the source data gets fixed. */
    const e = new Error(isLetter
      ? `${q.id}: correctAnswer ${letter} is outside its ${rawOptions.length} options`
      : `${q.id}: has ${rawOptions.length} options but correctAnswer is ${JSON.stringify(q.correctAnswer)}`);
    e.code = isLetter ? 'BAD_KEY' : 'NO_KEY';
    throw e;
  }

  if (isMcq) {
    return {
      qid: q.id,
      question,
      subtopic: firstText(q.subtopic),
      difficulty: firstText(q.difficulty) || 'Unknown',
      questionType: firstText(q.questionType),
      type: 'mcq',
      options: rawOptions,
      correct: letter,
      answer: rawOptions[letter.charCodeAt(0) - 65] || '',
      marks: 1,
      explanation: firstText(q.explanation),
      source: 'student app practice'
    };
  }

  /* Written ones. matching items carry their answer as pairs — that is the
     teacher's answer, so it is rendered rather than left blank. */
  let answer = firstText(q.answers, q.answerValue, q.correctAnswer);
  let marks = 1;
  if (!answer && Array.isArray(q.pairs) && q.pairs.length) {
    answer = q.pairs.map(p => `${firstText(p[0])} → ${firstText(p[1])}`).join('; ');
    marks = q.pairs.length;
  }

  return {
    qid: q.id,
    question,
    subtopic: firstText(q.subtopic),
    difficulty: firstText(q.difficulty) || 'Unknown',
    questionType: firstText(q.questionType),
    type: 'short',
    options: null,
    correct: null,
    answer,
    /* only ever present when true: surfaced in the picker as "none supplied",
       and never guessed at */
    ...(answer ? {} : { needsAnswer: true }),
    marks,
    explanation: firstText(q.explanation),
    source: 'student app practice'
  };
}

/* ---- whole corpus ------------------------------------------------------ */
export function buildBank(srcDir) {
  if (!existsSync(srcDir)) {
    const e = new Error(`practice questions not found at ${srcDir}\n` +
      `  pass the right folder:  node extractPracticeBank.mjs --src /path/to/ple-app/data/practice`);
    e.code = 'NO_SRC'; throw e;
  }
  const files = readdirSync(srcDir).filter(f => f.endsWith('.json')).sort();
  if (!files.length) { const e = new Error(`no .json files in ${srcDir}`); e.code = 'NO_SRC'; throw e; }

  const groups = new Map();          // "SST|P6|East Africa" -> entry
  const perFile = {};
  let total = 0, mcq = 0, short = 0, needsAnswer = 0;

  for (const f of files) {
    const doc = JSON.parse(readFileSync(join(srcDir, f), 'utf8'));
    const { code, name } = normaliseSubject(doc.subject);
    const level = doc.class || '';
    let n = 0;
    for (const raw of doc.questions || []) {
      const q = convertQuestion(raw, { file: f });
      const key = `${code}|${level}|${firstText(raw.topic) || 'General'}`;
      if (!groups.has(key)) {
        groups.set(key, {
          subject: name, subject_code: code, level,
          topic: firstText(raw.topic) || 'General',
          subtopics: [], questions: []
        });
      }
      const g = groups.get(key);
      g.questions.push(q);
      if (q.subtopic && !g.subtopics.includes(q.subtopic)) g.subtopics.push(q.subtopic);
      n++; total++;
      if (q.type === 'mcq') mcq++; else short++;
      if (q.needsAnswer) needsAnswer++;
    }
    perFile[f] = n;
  }

  if (!total) { const e = new Error('no practice questions found'); e.code = 'EMPTY'; throw e; }

  const items = [...groups.values()].sort((a, b) =>
    a.subject.localeCompare(b.subject) || a.level.localeCompare(b.level) || a.topic.localeCompare(b.topic));

  return {
    generated_from: 'ple-app/data/practice (the question bank the student app ships)',
    generated_by: 'apps/admin/tools/extractPracticeBank.mjs',
    generated_at: new Date().toISOString().slice(0, 10),
    counts: { topics: items.length, questions: total, mcq, short, needsAnswer, per_file: perFile },
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

  let bank;
  try { bank = buildBank(args.src); }
  catch (e) {
    console.error(`\n  practice bank NOT written: ${e.message}`);
    if (e.code === 'NO_KEY' || e.code === 'BAD_KEY') console.error('  An option list without a correct letter cannot be auto-marked.\n');
    process.exit(e.code === 'NO_SRC' ? 1 : 2);
  }

  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, JSON.stringify(bank));

  if (!args.quiet) {
    console.log(`\n  practice bank written -> ${args.out}`);
    console.log(`  ${bank.counts.questions} questions in ${bank.counts.topics} topic groups · ` +
      `${bank.counts.mcq} auto-marked MCQ · ${bank.counts.short} written` +
      (bank.counts.needsAnswer ? ` · ${bank.counts.needsAnswer} still need a model answer` : ''));
    console.log(`  levels ${bank.levels.join(', ')} · subjects ${bank.subjects.join(', ')}`);
    console.log(`  ${(readFileSync(args.out, 'utf8').length / 1024).toFixed(0)} KB\n`);
  }
}
