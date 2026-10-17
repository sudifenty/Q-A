/* =============================================================================
   extractRevisionBank.test.mjs — node:test, no extra dependencies.

   Run:  cd apps/admin && npm test

   The point of this suite is that the bank must contain nothing the notes do
   not contain. Test 8 re-reads the corpus and proves every extracted question
   exists in it, so a future edit that starts inventing wording fails here.
   Test 9 proves the committed JSON matches a fresh extraction, so a stale bank
   cannot ship next to newer notes.
============================================================================= */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanText, guessMarks, extractTopic, buildBank, parseArgs } from './extractRevisionBank.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL_SRC = resolve(HERE, '../../../../Uganda-spelling/ple-app/data/notes');
const BANK = resolve(HERE, '../src/data/revisionBank.json');

/* ---------------- helpers ------------------------------------------------ */

const topicWith = (sections) => ({
  id: 'P9_TEST_T01', title: 'Test Topic', slug: 'test-topic', class: 'P9', sections
});
const listSection = (title, items) => ({ title, blocks: [{ t: 'ol', start: 1, items }] });

function fixtureDir() {
  const dir = mkdtempSync(join(tmpdir(), 'revbank-'));
  writeFileSync(join(dir, 'p9-test.json'), JSON.stringify({
    class: 'P9', subject: 'TST', subject_name: 'Testcraft',
    topics: [
      topicWith([
        { title: 'About this topic', blocks: [{ t: 'p', items: ['Not a question.'] }] },
        { title: '1. First subtopic', blocks: [{ t: 'p', items: ['Main notes content.'] }] },
        { title: '2. Second subtopic', blocks: [{ t: 'p', items: ['More notes.'] }] },
        listSection('REVISION QUESTIONS', ['**What is a widget?**', 'Name two tools.']),
        listSection('ANSWERS TO REVISION QUESTIONS', ['**A small machine.**', 'Spanner and file.']),
        { title: 'P.9 QUICK REVISION', blocks: [{ t: 'ul', items: ['widget · spanner'] }] }
      ]),
      topicWith([{ title: 'No exercises here', blocks: [{ t: 'p', items: ['just prose'] }] }])
    ]
  }));
  return dir;
}

/* ---------------- 1. text hygiene ---------------------------------------- */

test('cleanText strips markdown but keeps the words', () => {
  assert.equal(cleanText('**n(M) = 4**'), 'n(M) = 4');
  assert.equal(cleanText('3. Use `x` to mean *nothing*.'), 'Use x to mean nothing.');
  assert.equal(cleanText('See [the syllabus](http://x) for details'), 'See the syllabus for details');
  assert.equal(cleanText('  a)   Lots   of    spaces  '), 'Lots of spaces');
});

test('cleanText does not eat a blank the student must fill in', () => {
  /* these are real items in the corpus: "Fill in with < or >: −3 __ 2." */
  assert.equal(cleanText('Fill in with < or >: −3 __ 2.'), 'Fill in with < or >: −3 __ 2.');
  assert.equal(cleanText('Find the missing number: 5, 11, __, 23.'), 'Find the missing number: 5, 11, __, 23.');
});

/* ---------------- 2. marks ------------------------------------------------ */

test('guessMarks: 1 for a simple question, more when it asks for more', () => {
  assert.equal(guessMarks('What is place value?'), 1);
  assert.equal(guessMarks('Give two reasons why the Nile floods.'), 2);
  assert.equal(guessMarks('Explain why the sun rises in the east.'), 2);
  assert.equal(guessMarks('Compare and explain three differences between them.'), 3);
  assert.ok(guessMarks('Explain why, describe how, compare, discuss and justify all six reasons.') <= 4,
    'marks must be capped so a wordy question cannot dominate the paper');
});

/* ---------------- 3-5. extraction ---------------------------------------- */

test('extractTopic pairs each question with its own answer, in order', () => {
  const e = extractTopic(topicWith([
    listSection('REVISION QUESTIONS', ['Alpha?', 'Beta?']),
    listSection('ANSWERS TO REVISION QUESTIONS', ['A answer.', 'B answer.'])
  ]), { file: 'x.json', class: 'P9', subject: 'TST', subject_name: 'Testcraft' });

  assert.equal(e.questions.length, 2);
  assert.deepEqual(e.questions.map(q => [q.question, q.answer]),
    [['Alpha?', 'A answer.'], ['Beta?', 'B answer.']]);
  assert.deepEqual(e.questions.map(q => q.qid), ['P9_TEST_T01-Q1', 'P9_TEST_T01-Q2']);
  assert.equal(e.questions[0].id, 1);
  assert.equal(e.source_section, 'REVISION QUESTIONS');
  assert.equal(e.questions[0].source, 'end_of_topic');
});

test('extractTopic never invents options, and never types anything as mcq', () => {
  const e = extractTopic(topicWith([
    listSection('REVISION QUESTIONS', ['Which of the following is a prime number? A) 4 B) 9 C) 11']),
    listSection('ANSWERS TO REVISION QUESTIONS', ['C) 11'])
  ]), { file: 'x.json', class: 'P9', subject: 'TST', subject_name: 'Testcraft' });

  /* even a question that reads like an MCQ stays a written one: the notes hold
     no option list, so the picker must not pretend to have one */
  assert.equal(e.questions[0].type, 'short');
  assert.equal(e.questions[0].options, null);
  assert.equal(e.questions[0].correct, null);
  assert.ok(e.questions[0].question.includes('Which of the following'));
});

test('extractTopic records numbered subtopics, and ignores QUICK REVISION', () => {
  const e = extractTopic(topicWith([
    { title: '1. Union of sets', blocks: [] },
    { title: '2. Intersection of sets', blocks: [] },
    listSection('REVISION QUESTIONS', ['Q?']),
    listSection('ANSWERS TO REVISION QUESTIONS', ['A.'])
  ]), { file: 'x.json', class: 'P9', subject: 'TST', subject_name: 'Testcraft' });

  assert.deepEqual(e.subtopics, ['1. Union of sets', '2. Intersection of sets']);
});

test('extractTopic returns null for a topic with no exercises', () => {
  assert.equal(extractTopic(topicWith([{ title: 'Prose only', blocks: [{ t: 'p', items: ['hi'] }] }]),
    { file: 'x.json', class: 'P9', subject: 'TST', subject_name: 'Testcraft' }), null);
});

test('extractTopic refuses to guess when questions and answers disagree', () => {
  assert.throws(() => extractTopic(topicWith([
    listSection('REVISION QUESTIONS', ['One?', 'Two?']),
    listSection('ANSWERS TO REVISION QUESTIONS', ['Only one answer.'])
  ]), { file: 'x.json', class: 'P9', subject: 'TST', subject_name: 'Testcraft' }),
    (e) => e.code === 'MISALIGNED' && /do not line up/.test(e.message));
});

test('a QUICK REVISION recap is not treated as an exercise set', () => {
  const e = extractTopic(topicWith([
    { title: 'P.9 QUICK REVISION', blocks: [{ t: 'ul', items: ['widget · spanner · file'] }] }
  ]), { file: 'x.json', class: 'P9', subject: 'TST', subject_name: 'Testcraft' });
  assert.equal(e, null);
});

/* ---------------- 6-7. whole corpus, from a fixture ----------------------- */

test('buildBank over a fixture: counts, levels and subjects', () => {
  const bank = buildBank(fixtureDir());
  assert.equal(bank.counts.topics, 1, 'the topic with no exercises must be skipped');
  assert.equal(bank.counts.questions, 2);
  assert.deepEqual(bank.levels, ['P9']);
  assert.deepEqual(bank.subjects, ['Testcraft']);
  assert.equal(bank.items[0].subject_code, 'TST');
  assert.equal(bank.items[0].level, 'P9');
});

test('buildBank fails loudly on a missing or empty source', () => {
  assert.throws(() => buildBank('/no/such/notes/dir'), (e) => e.code === 'NO_SRC');
  const empty = mkdtempSync(join(tmpdir(), 'revbank-empty-'));
  assert.throws(() => buildBank(empty), (e) => e.code === 'NO_SRC');
});

test('parseArgs resolves the documented defaults', () => {
  const a = parseArgs([]);
  assert.ok(a.src.endsWith('ple-app/data/notes'), `src default: ${a.src}`);
  assert.ok(a.out.endsWith('src/data/revisionBank.json'), `out default: ${a.out}`);
  const b = parseArgs(['--src', '/tmp/x', '--out', '/tmp/y.json', '--quiet']);
  assert.equal(b.src, '/tmp/x'); assert.equal(b.out, '/tmp/y.json'); assert.equal(b.quiet, true);
  assert.throws(() => parseArgs(['--nope']), /unknown argument/);
});

/* ---------------- 8. the real corpus -------------------------------------- */

const hasReal = existsSync(REAL_SRC);

test('real corpus: the expected number of real questions is extracted', { skip: !hasReal && 'notes repo not present' }, () => {
  const bank = buildBank(REAL_SRC);
  /* counted independently from the notes before the parser existed */
  assert.equal(bank.counts.topics, 120);
  assert.equal(bank.counts.questions, 2189);
  assert.deepEqual(bank.levels, ['P4', 'P5', 'P6', 'P7']);
  assert.deepEqual(bank.subjects, ['English', 'Mathematics', 'Science', 'Social Studies']);
});

test('real corpus: nothing empty, nothing typed mcq, nothing with options', { skip: !hasReal && 'notes repo not present' }, () => {
  const bank = buildBank(REAL_SRC);
  for (const item of bank.items) for (const q of item.questions) {
    assert.ok(q.question.trim().length > 1, `empty question in ${item.topic_id}`);
    assert.ok(q.answer.trim().length > 0, `question with no answer in ${q.qid}`);
    assert.equal(q.type, 'short', `${q.qid} must not claim to be multiple choice`);
    assert.equal(q.options, null, `${q.qid} must not carry invented options`);
    assert.equal(q.correct, null, `${q.qid} must not carry an invented answer key`);
    assert.ok(q.marks >= 1 && q.marks <= 4, `${q.qid} marks out of range`);
    assert.ok(!/\*\*[^*]+\*\*/.test(q.question + q.answer), `${q.qid} still has bold markup`);
    assert.ok(!/`/.test(q.question + q.answer), `${q.qid} still has code markup`);
  }
});

test('real corpus: every question exists in the notes — nothing invented', { skip: !hasReal && 'notes repo not present' }, () => {
  /* Collect EVERY string in EVERY notes file, cleaned the same way. If the
     extractor ever starts writing its own wording, it will not be in this set. */
  const strings = new Set();
  const walk = (v) => {
    if (typeof v === 'string') { const c = cleanText(v); if (c) strings.add(c); }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  for (const f of readdirSync(REAL_SRC)) if (f.endsWith('.json')) walk(JSON.parse(readFileSync(join(REAL_SRC, f), 'utf8')));

  const bank = buildBank(REAL_SRC);
  let checked = 0;
  for (const item of bank.items) for (const q of item.questions) {
    assert.ok(strings.has(q.question), `NOT FOUND IN NOTES: ${q.qid} "${q.question}"`);
    assert.ok(strings.has(q.answer), `ANSWER NOT FOUND IN NOTES: ${q.qid} "${q.answer}"`);
    checked += 2;
  }
  assert.equal(checked, 2 * 2189, 'must have provenance-checked every question and answer');
});

test('real corpus: subtopics were recovered for the numbered topics', { skip: !hasReal && 'notes repo not present' }, () => {
  const bank = buildBank(REAL_SRC);
  const withSubs = bank.items.filter(i => i.subtopics.length > 0);
  assert.ok(withSubs.length > 50, `only ${withSubs.length} topics carry subtopics`);
  assert.match(bank.items.find(i => i.topic_id === 'P5_MATH_T01').subtopics[0], /^\d+\./);
});

/* ---------------- 9. the committed file is not stale ---------------------- */

test('the committed revisionBank.json matches a fresh extraction', { skip: !hasReal && 'notes repo not present' }, () => {
  assert.ok(existsSync(BANK), 'revisionBank.json is missing — run: node tools/extractRevisionBank.mjs');
  const committed = JSON.parse(readFileSync(BANK, 'utf8'));
  const fresh = buildBank(REAL_SRC);
  assert.deepEqual(
    { counts: committed.counts, questions: committed.items.map(i => [i.topic_id, i.questions.map(q => [q.qid, q.question, q.answer, q.marks])]) },
    { counts: fresh.counts, questions: fresh.items.map(i => [i.topic_id, i.questions.map(q => [q.qid, q.question, q.answer, q.marks])]) },
    'revisionBank.json is out of date with the notes — re-run the extractor and commit it'
  );
});

/* nothing below this line */
