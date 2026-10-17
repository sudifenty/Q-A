#!/usr/bin/env node
/* =============================================================================
   extractTopicManifest.mjs — every topic and subtopic a teacher can lock a
   learner into, read straight from the notes corpus.

   WHY THIS EXISTS
     The Remote Control picker used to read revisionBank.json. That bank only
     carries topics whose REVISION QUESTIONS and ANSWERS blocks both parse as
     numbered lists, so a topic written with bullets vanished from the picker
     entirely: P.6 SST offered 2 of its 5 topics and the owner could not lock
     a learner into the other three.

     A lock picker has to list what the STUDENT can study, not what the exam
     builder happened to extract. This reads the notes the student app actually
     ships and emits all of it. It invents nothing — every string is copied.

   WHAT IT READS
     <src>/p4-math.json … p7-sst.json   (the built notes corpus)
     each file: { class, subject, subject_name, topics: [ { id, title, slug,
                  sections: [ { title } ] } ] }

   WHAT IT WRITES
     <out>/topicManifest.json — { generated_*, counts, levels, subjects, items }
     each item: { level, subject, subject_code, subject_name, topic, topic_id,
                  slug, subtopics: [section title…] }

   SUBTOPICS MATCH THE PHONE
     ple-app/index.html noteSections() drops any section titled
     "About this topic", and the lock matches on the remaining titles. This
     applies the same filter, so what the teacher clicks is exactly the list
     the learner would have seen.

   USAGE
     node extractTopicManifest.mjs [--src DIR] [--out FILE]
   ========================================================================== */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SRC = resolve(HERE, '../../../../Uganda-spelling/ple-app/data/notes');
const DEFAULT_OUT = resolve(HERE, '../src/data/topicManifest.json');

/* the same filter noteSections() applies on the phone */
const isAbout = (t) => /^about\s+this\s+topic\b/i.test(String(t || '').trim());

export function parseArgs(argv) {
  const a = { src: DEFAULT_SRC, out: DEFAULT_OUT, help: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--src') a.src = resolve(argv[++i]);
    else if (v === '--out') a.out = resolve(argv[++i]);
    else if (v === '--help' || v === '-h') a.help = true;
    else throw new Error(`unknown argument: ${v}`);
  }
  return a;
}

/* ---- whole corpus ------------------------------------------------------ */
export function buildManifest(srcDir) {
  if (!existsSync(srcDir)) {
    const e = new Error(`notes not found at ${srcDir}\n` +
      `  pass the right folder:  node extractTopicManifest.mjs --src /path/to/ple-app/data/notes`);
    e.code = 'NO_SRC';
    throw e;
  }
  const files = readdirSync(srcDir).filter(f => f.endsWith('.json')).sort();
  if (!files.length) { const e = new Error(`no .json notes in ${srcDir}`); e.code = 'NO_SRC'; throw e; }

  const items = [];
  const perFile = {};
  for (const f of files) {
    const doc = JSON.parse(readFileSync(join(srcDir, f), 'utf8'));
    const m = f.match(/^p(\d)-([a-z]+)\.json$/i);
    const level = doc.class || (m ? `P${m[1]}` : '');
    const code = String(doc.subject || (m ? m[2] : '')).toUpperCase();
    let n = 0;
    for (const t of doc.topics || []) {
      items.push({
        level,
        subject: doc.subject_name || doc.subject || code,
        subject_code: code,
        topic: t.title,
        topic_id: t.id,
        slug: t.slug || null,
        /* exactly what the learner's screen would list */
        subtopics: (t.sections || []).map(s => s.title).filter(x => x && !isAbout(x))
      });
      n++;
    }
    perFile[f] = n;
  }

  if (!items.length) { const e = new Error('no topics found anywhere'); e.code = 'EMPTY'; throw e; }

  return {
    generated_from: 'ple-app/data/notes (every topic and its sections)',
    generated_by: 'apps/admin/tools/extractTopicManifest.mjs',
    generated_at: new Date().toISOString().slice(0, 10),
    counts: {
      topics: items.length,
      subtopics: items.reduce((a, i) => a + i.subtopics.length, 0),
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
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 38).join('\n'));
    process.exit(0);
  }

  let manifest;
  try { manifest = buildManifest(args.src); }
  catch (e) { console.error(`\n  topic manifest NOT written: ${e.message}\n`); process.exit(1); }

  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, JSON.stringify(manifest));
  console.log(`  topic manifest → ${args.out}`);
  console.log(`  ${manifest.counts.topics} topics, ${manifest.counts.subtopics} subtopics`);
}
