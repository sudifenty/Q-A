/* extractTopicManifest.test.mjs — the lock picker must offer every topic the
   student can study.

   The regression this guards: the Remote Control picker read revisionBank.json,
   which only carries topics whose revision questions parse as numbered lists.
   P.6 SST topics 1–3 are written with bullets, so the picker offered 2 of 5
   topics and the owner could not lock a learner into the other three. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest } from './extractTopicManifest.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL_SRC = resolve(HERE, '../../../../Uganda-spelling/ple-app/data/notes');
const MANIFEST = resolve(HERE, '../src/data/topicManifest.json');
const hasReal = existsSync(REAL_SRC);
const skip = !hasReal && 'notes repo not present';

/* ---------- the reported bug, pinned -------------------------------------- */

test('P.6 Social Studies offers all five topics, not two', { skip }, () => {
  const m = buildManifest(REAL_SRC);
  const p6 = m.items.filter(i => i.level === 'P6' && i.subject_code === 'SST');
  assert.deepEqual(p6.map(i => i.topic_id), [
    'P6_SST_T01', 'P6_SST_T02', 'P6_SST_T03', 'P6_SST_T04', 'P6_SST_T05'
  ]);
  /* the three that used to disappear, and what locking into them now offers */
  const byId = Object.fromEntries(p6.map(i => [i.topic_id, i]));
  assert.match(byId.P6_SST_T01.topic, /East African Community/);
  assert.ok(byId.P6_SST_T02.subtopics.length > 5, 'Major Resources has subtopics');
  assert.ok(byId.P6_SST_T03.subtopics.length > 5, 'Transport has subtopics');
});

/* ---------- nothing is dropped anywhere ----------------------------------- */

test('every topic in the notes corpus reaches the picker', { skip }, () => {
  const m = buildManifest(REAL_SRC);
  let notes = 0;
  for (const f of readdirSync(REAL_SRC).filter(f => f.endsWith('.json'))) {
    const doc = JSON.parse(readFileSync(join(REAL_SRC, f), 'utf8'));
    for (const t of doc.topics) {
      notes++;
      const hit = m.items.find(i => i.topic_id === t.id);
      assert.ok(hit, `${t.id} missing from the manifest`);
      assert.equal(hit.topic, t.title, `${t.id} title changed in transit`);
    }
  }
  assert.equal(m.items.length, notes, 'manifest topic count differs from the corpus');
  assert.ok(notes > 100, `only ${notes} topics found — wrong --src?`);
});

test('subtopics are the sections the learner actually sees', { skip }, () => {
  const m = buildManifest(REAL_SRC);
  const doc = JSON.parse(readFileSync(join(REAL_SRC, 'p6-sst.json'), 'utf8'));
  const t = doc.topics[0];
  const mine = m.items.find(i => i.topic_id === t.id);
  /* the phone's noteSections() drops "About this topic", so so must we —
     otherwise the teacher would be offered a subtopic nobody can open */
  const phone = t.sections.map(s => s.title).filter(x => !/^about\s+this\s+topic\b/i.test(x));
  assert.deepEqual(mine.subtopics, phone);
  assert.ok(!mine.subtopics.some(s => /^about\s+this\s+topic\b/i.test(s)));
  assert.ok(mine.subtopics.every(s => typeof s === 'string' && s.trim().length > 0));
});

test('a topic with no extractable questions is still lockable', { skip }, () => {
  /* P6_SST_T01 has no numbered revision questions, so revisionBank drops it.
     The manifest must not inherit that blind spot. */
  const rev = JSON.parse(readFileSync(resolve(HERE, '../src/data/revisionBank.json'), 'utf8'));
  const m = buildManifest(REAL_SRC);
  assert.ok(!rev.items.some(i => i.topic_id === 'P6_SST_T01'), 'precondition: revision bank omits it');
  assert.ok(m.items.some(i => i.topic_id === 'P6_SST_T01'), 'manifest must still offer it');
});

/* ---------- the committed file is not stale ------------------------------- */

test('the committed topicManifest.json matches a fresh extraction', { skip }, () => {
  assert.ok(existsSync(MANIFEST), 'topicManifest.json is missing — run: node tools/extractTopicManifest.mjs');
  const committed = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const fresh = buildManifest(REAL_SRC);
  /* generated_at is a date, so compare the substance */
  assert.deepEqual(committed.items, fresh.items,
    'topicManifest.json is stale — run: npm run bank');
  assert.equal(committed.counts.topics, fresh.counts.topics);
});
