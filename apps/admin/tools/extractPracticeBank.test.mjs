/* =============================================================================
   extractPracticeBank.test.mjs — node:test, no extra dependencies.

   Run:  cd apps/admin && npm test

   The bank must contain nothing the student app's own data does not contain.
   Test 12 re-reads every practice file and proves each extracted question and
   option exists in it, so any future change that starts inventing wording or
   option lists fails here rather than in front of a student.
============================================================================= */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseArgs, normaliseSubject, stripLetter, convertQuestion, buildBank
} from './extractPracticeBank.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL_SRC = resolve(HERE, '../../../../Uganda-spelling/ple-app/data/practice');
const BANK = resolve(HERE, '../src/data/practiceBank.json');
const meta = { file: 'fixture.json' };

const mcqRaw = (over = {}) => ({
  id: 'P6_SST_001', class: 'P6', subject: 'SST', topic: 'East Africa',
  subtopic: "Uganda's neighbours", difficulty: 'Easy', questionType: 'multiple_choice',
  question: 'Which East African country lies between Uganda and the Indian Ocean?',
  options: ['A. Kenya', 'B. Rwanda', 'C. South Sudan', 'D. Burundi'],
  correctAnswer: 'A', explanation: 'Kenya lies between Uganda and the sea.', ...over
});

function fixtureDir() {
  const dir = mkdtempSync(join(tmpdir(), 'pracbank-'));
  writeFileSync(join(dir, 'sst-p6.json'), JSON.stringify({
    class: 'P6', subject: 'SST',
    questions: [
      mcqRaw(),
      mcqRaw({ id: 'P6_SST_002', subtopic: 'Physical features', correctAnswer: 'C' }),
      { id: 'P6_SST_003', topic: 'East Africa', subtopic: 'Maps', difficulty: 'Medium',
        questionType: 'fill_blank', question: 'One centimetre represents ______ .',
        answers: ['500 metres'], answerValue: '500 metres', explanation: 'Scale maths.' },
      { id: 'P6_SST_004', topic: 'Workers', subtopic: 'Workers and work', difficulty: 'Easy',
        questionType: 'matching', question: 'Match each worker with the place.',
        pairs: [['Teacher', 'School'], ['Doctor', 'Health centre']] }
    ]
  }));
  return dir;
}

/* ---------------- 1-3. small pieces ------------------------------------ */

test('parseArgs resolves the documented defaults', () => {
  const a = parseArgs([]);
  assert.ok(a.src.endsWith('ple-app/data/practice'), a.src);
  assert.ok(a.out.endsWith('src/data/practiceBank.json'), a.out);
  assert.throws(() => parseArgs(['--nope']), /unknown argument/);
});

test('normaliseSubject maps both the codes and the full names onto one pair', () => {
  assert.deepEqual(normaliseSubject('SST'), { code: 'SST', name: 'Social Studies' });
  assert.deepEqual(normaliseSubject('Mathematics'), { code: 'MATH', name: 'Mathematics' });
  assert.deepEqual(normaliseSubject('Science'), { code: 'SCI', name: 'Science' });
  assert.deepEqual(normaliseSubject('English'), { code: 'ENG', name: 'English' });
});

test('stripLetter removes only the letter prefix', () => {
  assert.equal(stripLetter('A. Kenya'), 'Kenya');
  assert.equal(stripLetter('  B) South Sudan '), 'South Sudan');
  assert.equal(stripLetter('D. A is for Apple'), 'A is for Apple', 'a letter inside the text must survive');
  assert.equal(stripLetter(null), '');
});

/* ---------------- 4-8. conversion --------------------------------------- */

test('an MCQ keeps its options, its key and the text of the right answer', () => {
  const q = convertQuestion(mcqRaw(), meta);
  assert.equal(q.type, 'mcq');
  assert.deepEqual(q.options, ['Kenya', 'Rwanda', 'South Sudan', 'Burundi']);
  assert.equal(q.correct, 'A');
  assert.equal(q.answer, 'Kenya', 'the answer shown to the teacher is the option text');
  assert.equal(q.qid, 'P6_SST_001');
  assert.equal(q.subtopic, "Uganda's neighbours");
  assert.equal(q.marks, 1);
  assert.equal(q.explanation, 'Kenya lies between Uganda and the sea.');
});

test('a two-option true/false stays an MCQ', () => {
  const q = convertQuestion({ id: 'X', questionType: 'true_false', question: '14 is even.',
    options: ['A. True', 'B. False'], correctAnswer: 'A', answerValue: 'True' }, meta);
  assert.equal(q.type, 'mcq');
  assert.deepEqual(q.options, ['True', 'False']);
  assert.equal(q.correct, 'A');
});

test('an option list with no correct letter is refused, not guessed', () => {
  assert.throws(() => convertQuestion(mcqRaw({ correctAnswer: null }), meta),
    (e) => e.code === 'NO_KEY');
  assert.throws(() => convertQuestion(mcqRaw({ correctAnswer: 'E' }), meta),
    (e) => e.code === 'BAD_KEY', 'a key outside the options must not be shipped');
  assert.throws(() => convertQuestion({ id: 'X', question: '' }, meta),
    (e) => e.code === 'BAD_QUESTION');
});

test('fill-in-the-blank becomes a written question with its model answer', () => {
  const q = convertQuestion({ id: 'X', questionType: 'fill_blank',
    question: '61 + ___ = 73', answers: ['12'], answerValue: '12' }, meta);
  assert.equal(q.type, 'short');
  assert.equal(q.answer, '12');
  assert.equal(q.options, null);
  assert.equal(q.needsAnswer, undefined, 'it has an answer, so it is not flagged');
});

test('a matching question uses its pairs as the answer and marks one per pair', () => {
  const q = convertQuestion({ id: 'X', questionType: 'matching',
    question: 'Match each worker with the place.',
    pairs: [['Teacher', 'School'], ['Doctor', 'Health centre']] }, meta);
  assert.equal(q.type, 'short');
  assert.equal(q.answer, 'Teacher → School; Doctor → Health centre');
  assert.equal(q.marks, 2);
});

test('a question with no answer at all is flagged rather than invented', () => {
  const q = convertQuestion({ id: 'X', questionType: 'scenario', question: 'What would you do?' }, meta);
  assert.equal(q.type, 'short');
  assert.equal(q.answer, '');
  assert.equal(q.needsAnswer, true);
});

/* ---------------- 9-11. whole corpus, fixture ---------------------------- */

test('buildBank groups by subject, class and topic, and counts honestly', () => {
  const bank = buildBank(fixtureDir());
  assert.equal(bank.counts.questions, 4);
  assert.equal(bank.counts.mcq, 2);
  assert.equal(bank.counts.short, 2);
  assert.equal(bank.counts.needsAnswer, 0);
  assert.deepEqual(bank.levels, ['P6']);
  assert.deepEqual(bank.subjects, ['Social Studies']);

  const eastAfrica = bank.items.find(i => i.topic === 'East Africa');
  assert.equal(eastAfrica.subject_code, 'SST');
  assert.deepEqual(eastAfrica.subtopics, ["Uganda's neighbours", 'Physical features', 'Maps']);
  assert.equal(eastAfrica.questions.length, 3, 'the matching question is a different topic group');
  assert.equal(bank.items.find(i => i.topic === 'Workers').questions.length, 1);
});

test('buildBank fails loudly on a missing or empty source', () => {
  assert.throws(() => buildBank('/no/such/practice'), (e) => e.code === 'NO_SRC');
  assert.throws(() => buildBank(mkdtempSync(join(tmpdir(), 'pracbank-empty-'))), (e) => e.code === 'NO_SRC');
});

/* ---------------- 12-15. the real corpus -------------------------------- */

const hasReal = existsSync(REAL_SRC);
const skip = !hasReal && 'student repo not present';

test('real corpus: every question the student app ships is extracted', { skip }, () => {
  const bank = buildBank(REAL_SRC);
  /* counted independently from data/practice before this parser existed */
  assert.equal(bank.counts.questions, 5067);
  assert.equal(bank.counts.mcq, 4989);
  assert.equal(bank.counts.short, 78);
  assert.equal(bank.counts.needsAnswer, 0, 'no question may arrive without an answer');
  assert.deepEqual(bank.levels, ['P4', 'P5', 'P6', 'P7']);
  assert.deepEqual(bank.subjects, ['English', 'Mathematics', 'Science', 'Social Studies']);
});

test('real corpus: every MCQ is markable — options, key and answer all line up', { skip }, () => {
  const bank = buildBank(REAL_SRC);
  for (const g of bank.items) for (const q of g.questions) {
    assert.ok(q.question.trim().length > 1, `empty question ${q.qid}`);
    if (q.type === 'mcq') {
      assert.ok(q.options.length >= 2 && q.options.length <= 4, `${q.qid} has ${q.options.length} options`);
      assert.ok(q.options.every(o => o.length > 0), `${q.qid} has a blank option`);
      assert.ok(/^[A-D]$/.test(q.correct), `${q.qid} key is ${q.correct}`);
      assert.ok(q.correct.charCodeAt(0) - 65 < q.options.length, `${q.qid} key outside its options`);
      assert.equal(q.answer, q.options[q.correct.charCodeAt(0) - 65], `${q.qid} answer does not match its key`);
      assert.ok(!q.options.some(o => /^\s*[A-D]\s*[.):]/.test(o)), `${q.qid} still carries a letter prefix`);
    } else {
      assert.equal(q.options, null, `${q.qid} is written but carries options`);
      assert.ok(q.answer.trim().length > 0, `${q.qid} has no model answer`);
    }
  }
});

test('real corpus: nothing invented — every string exists in the source files', { skip }, () => {
  const raw = new Set();          // exactly as written in the JSON
  const stripped = new Set();     // options after the letter prefix is removed
  const walk = (v) => {
    if (typeof v === 'string') {
      const t = v.replace(/\s+/g, ' ').trim();
      if (t) { raw.add(t); stripped.add(stripLetter(t)); }
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  for (const f of readdirSync(REAL_SRC)) {
    if (f.endsWith('.json')) walk(JSON.parse(readFileSync(join(REAL_SRC, f), 'utf8')));
  }

  const bank = buildBank(REAL_SRC);
  let checked = 0;
  for (const g of bank.items) for (const q of g.questions) {
    assert.ok(raw.has(q.question), `QUESTION NOT IN SOURCE: ${q.qid} "${q.question}"`);
    checked++;
    for (const o of q.options || []) {
      assert.ok(stripped.has(o), `OPTION NOT IN SOURCE: ${q.qid} "${o}"`);
      checked++;
    }
    if (q.type === 'short' && q.answer) {
      /* matching answers are rendered from the source's pairs, so allow either */
      const parts = q.answer.split('; ').flatMap(p => p.split(' → '));
      for (const p of parts) { assert.ok(raw.has(p), `ANSWER NOT IN SOURCE: ${q.qid} "${p}"`); checked++; }
    }
  }
  assert.ok(checked > 15000, `only ${checked} strings provenance-checked`);
});

test('the committed practiceBank.json matches a fresh extraction', { skip }, () => {
  assert.ok(existsSync(BANK), 'practiceBank.json is missing — run: npm run bank');
  const committed = JSON.parse(readFileSync(BANK, 'utf8'));
  const fresh = buildBank(REAL_SRC);
  const shape = (b) => b.items.map(i => [i.subject_code, i.level, i.topic,
    i.questions.map(q => [q.qid, q.question, q.type, q.options, q.correct, q.answer, q.marks])]);
  assert.deepEqual(shape(committed), shape(fresh),
    'practiceBank.json is out of date with the student app — re-run npm run bank and commit it');
});
