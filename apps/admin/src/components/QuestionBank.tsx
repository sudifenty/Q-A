import { useEffect, useMemo, useState } from 'react';
import { Draft } from '../lib/examTypes';

/* ------------------------------------------------------------------
   QuestionBank — build a paper from questions that ALREADY EXIST.

   Two sources, both copied verbatim out of the student app's own data:

     practice   ple-app/data/practice   3,869 questions, 3,791 of them
                multiple choice with a correct letter, so they mark
                themselves on the phone. These are the exact questions
                students already practise with.

     revision   ple-app/data/notes      2,116 end-of-topic exercises with
                the teacher's written answers.

   Nothing here is generated. The extractors in apps/admin/tools copy the
   wording, the options and the answers as they are; their test suites fail
   if a question appears that is not in the source files.

   Both banks are ~700 KB and ~1.7 MB, so each is imported dynamically and
   only when its tab is opened. The dashboard never downloads them.
------------------------------------------------------------------ */

type ViewQ = {
  qid: string; question: string; subtopic: string;
  type: 'mcq' | 'short'; options: string[] | null; correct: string | null;
  answer: string; marks: number; difficulty?: string; note?: string;
  needsAnswer?: boolean; origin: string;
};
type ViewGroup = {
  key: string; topic: string; subtopics: string[];
  subject: string; subject_code: string; level: string;
  questions: ViewQ[];
};
type Loaded = { counts: { questions: number; mcq?: number } | null; items: ViewGroup[] };
type Source = 'practice' | 'revision';

type Props = {
  onAdd: (drafts: Draft[], meta: { subject_code: string; subject: string; topic: string; level: string; source: Source }) => void;
  onClose: () => void;
  preferSubject?: string;
};

const LETTERS = ['A', 'B', 'C', 'D'];

/* ---- the two bank shapes, flattened into one view model ---------------- */

function fromPractice(bank: any): Loaded {
  const items: ViewGroup[] = (bank?.items || []).map((g: any) => ({
    key: `${g.subject_code}|${g.level}|${g.topic}`,
    topic: g.topic,
    subtopics: g.subtopics || [],
    subject: g.subject, subject_code: g.subject_code, level: g.level,
    questions: (g.questions || []).map((q: any) => ({
      qid: q.qid, question: q.question, subtopic: q.subtopic || '',
      type: q.type, options: q.options, correct: q.correct,
      answer: q.answer || '', marks: q.marks || 1,
      difficulty: q.difficulty, note: q.explanation || '',
      needsAnswer: !!q.needsAnswer, origin: g.subject
    }))
  }));
  return { counts: bank?.counts ?? null, items };
}

function fromRevision(bank: any): Loaded {
  const items: ViewGroup[] = (bank?.items || []).map((g: any) => ({
    key: `${g.subject_code}|${g.level}|${g.topic}`,
    topic: g.topic,
    subtopics: g.subtopics || [],
    subject: g.subject, subject_code: g.subject_code, level: g.level,
    questions: (g.questions || []).map((q: any) => ({
      qid: q.qid, question: q.question, subtopic: '',
      type: 'short' as const, options: null, correct: null,
      answer: q.answer || '', marks: q.marks || 1,
      origin: g.subject
    }))
  }));
  return { counts: bank?.counts ?? null, items };
}

export default function QuestionBank({ onAdd, onClose, preferSubject }: Props) {
  const [source, setSource] = useState<Source>('practice');
  const [banks, setBanks] = useState<{ practice: Loaded | null; revision: Loaded | null }>({ practice: null, revision: null });
  const [err, setErr] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [level, setLevel] = useState('');
  const [groupKey, setGroupKey] = useState('');
  const [subtopic, setSubtopic] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [marksFor, setMarksFor] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState('');
  const [showAnswers, setShowAnswers] = useState(true);

  /* each bank is fetched the first time its tab is opened, and only once */
  useEffect(() => {
    if (banks[source] || err) return;
    let live = true;
    const load = source === 'practice'
      ? import('../data/practiceBank.json').then(m => fromPractice(m.default))
      : import('../data/revisionBank.json').then(m => fromRevision(m.default));
    load
      .then(loaded => {
        if (live) setBanks(p => (source === 'practice' ? { ...p, practice: loaded } : { ...p, revision: loaded }));
      })
      .catch(e => { if (live) setErr(String(e?.message || e)); });
    return () => { live = false; };
  }, [source, banks, err]);

  const items: ViewGroup[] = banks[source]?.items || [];

  /* pick a sensible default subject for whichever tab is open */
  useEffect(() => {
    if (!items.length || subject) return;
    const want = (preferSubject || '').toUpperCase();
    const code = want === 'SST' ? 'Social Studies' : want === 'SCI' ? 'Science'
      : want === 'ENG' ? 'English' : want === 'MATH' ? 'Mathematics' : '';
    setSubject(items.find(i => i.subject === code)?.subject || items[0].subject);
  }, [items, subject, preferSubject]);

  const levels = useMemo(
    () => [...new Set(items.filter(i => i.subject === subject).map(i => i.level))].sort(),
    [items, subject]);

  useEffect(() => { if (levels.length && !levels.includes(level)) setLevel(levels[0]); }, [levels, level]);

  const groups = useMemo(() =>
    items.filter(i => i.subject === subject && i.level === level)
      .sort((a, b) => a.topic.localeCompare(b.topic)),
    [items, subject, level]);

  const group = useMemo(() => groups.find(g => g.key === groupKey) || null, [groups, groupKey]);

  /* a different paper starts a fresh selection */
  useEffect(() => { setPicked(new Set()); setFilter(''); setSubtopic(''); setDifficulty(''); }, [groupKey, source]);

  const shown = useMemo(() => {
    if (!group) return [];
    const f = filter.trim().toLowerCase();
    return group.questions.filter(q =>
      (!subtopic || q.subtopic === subtopic) &&
      (!difficulty || q.difficulty === difficulty) &&
      (!f || q.question.toLowerCase().includes(f) || (q.subtopic || '').toLowerCase().includes(f)));
  }, [group, subtopic, difficulty, filter]);

  const difficulties = useMemo(
    () => [...new Set((group?.questions || []).map(q => q.difficulty).filter((d): d is string => !!d))],
    [group]);

  if (err) return (
    <div className="card bg-red-50 text-red-700 text-sm space-y-2">
      <b>The question bank did not load.</b>
      <div>{err}</div>
      <div className="text-xs">Rebuild it with: <code>npm run bank</code> (in apps/admin)</div>
      <button onClick={onClose} className="text-xs underline">close</button>
    </div>
  );

  const hintOf = (id: Source) => {
    const c = banks[id]?.counts;
    if (!c) return 'loading…';
    return `${Number(c.questions).toLocaleString()} questions` +
      (id === 'practice' ? ` · ${Number(c.mcq ?? 0).toLocaleString()} mark themselves` : ' · written, from the notes');
  };
  const Src = ({ id, label }: { id: Source; label: string }) => (
    <button onClick={() => setSource(id)}
      className={`px-3 py-2 rounded-xl text-sm font-bold border text-left ${source === id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-surface-raised text-surface-muted border-surface-line'}`}>
      {label}
      <span className={`block text-[11px] font-normal ${source === id ? 'text-emerald-100' : 'text-surface-faint'}`}>{hintOf(id)}</span>
    </button>
  );

  const toggle = (qid: string) => setPicked(prev => {
    const n = new Set(prev);
    n.has(qid) ? n.delete(qid) : n.add(qid);
    return n;
  });

  const marksOf = (q: ViewQ) => marksFor[q.qid] ?? q.marks;
  const chosen = group ? group.questions.filter(q => picked.has(q.qid)) : [];
  const chosenMarks = chosen.reduce((a, q) => a + (Number(marksOf(q)) || 1), 0);
  const chosenMcq = chosen.filter(q => q.type === 'mcq').length;

  const add = () => {
    if (!group || !chosen.length) return;
    const drafts: Draft[] = chosen.map(q => q.type === 'mcq'
      ? {
        q: q.question, options: q.options || [], answer: q.correct || 'A',
        kind: 'mcq' as const, marks: Number(marksOf(q)) || 1,
        is_from_practice_bank: true, qid: q.qid, topic: group.topic,
        level: group.level, subject: group.subject,
        subtopic: q.subtopic, difficulty: q.difficulty, explanation: q.note
      }
      : {
        q: q.question, options: [], answer: q.answer,
        kind: 'short' as const, marks: Number(marksOf(q)) || 1,
        ...(source === 'revision' ? { is_from_revision_bank: true } : { is_from_practice_bank: true }),
        qid: q.qid, topic: group.topic, level: group.level,
        subject: group.subject, subtopic: q.subtopic,
        difficulty: q.difficulty, explanation: q.note
      });
    onAdd(drafts, {
      subject_code: group.subject_code, subject: group.subject,
      topic: group.topic, level: group.level, source
    });
  };

  return (
    <div className="border rounded-xl bg-surface-raised space-y-3 p-3">
      <div className="flex items-start gap-2">
        <div>
          <b className="text-sm">Question bank</b>
          <p className="text-xs text-surface-muted">
            Real questions from the student app. Nothing here is generated — pick what you want, edit anything, save.
          </p>
        </div>
        <button onClick={onClose} className="ml-auto text-xs text-surface-faint underline">close</button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Src id="practice" label="Practice questions" />
        <Src id="revision" label="Revision exercises" />
      </div>

      {!items.length && !err && <div className="text-sm text-surface-muted p-2">loading…</div>}

      {!!items.length && (
        <>
          <div className="grid md:grid-cols-4 gap-2">
            <label className="text-xs text-surface-muted">subject
              <select className="input" value={subject} onChange={e => setSubject(e.target.value)}>
                {[...new Set(items.map(i => i.subject))].map(s => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="text-xs text-surface-muted">class
              <select className="input" value={level} onChange={e => setLevel(e.target.value)}>
                {levels.map(l => <option key={l}>{l}</option>)}
              </select>
            </label>
            <label className="text-xs text-surface-muted">topic
              <select className="input" value={groupKey} onChange={e => setGroupKey(e.target.value)}>
                <option value="">choose a topic…</option>
                {groups.map(g => <option key={g.key} value={g.key}>{g.topic} ({g.questions.length})</option>)}
              </select>
            </label>
            <label className="text-xs text-surface-muted">subtopic
              <select className="input" value={subtopic} onChange={e => setSubtopic(e.target.value)}
                disabled={source === 'revision'}>
                <option value="">all</option>
                {(group?.subtopics || []).map(s => <option key={s}>{s}</option>)}
              </select>
            </label>
          </div>

          {group && (
            <>
              <div className="flex gap-2 flex-wrap items-center">
                <input className="input max-w-xs" placeholder="search these questions…"
                  value={filter} onChange={e => setFilter(e.target.value)} />
                {source === 'practice' && difficulties.length > 1 && (
                  <select className="input max-w-[9rem] text-xs" value={difficulty} onChange={e => setDifficulty(e.target.value)}>
                    <option value="">any difficulty</option>
                    {difficulties.map(d => <option key={d}>{d}</option>)}
                  </select>
                )}
                <button onClick={() => setPicked(new Set(shown.map(q => q.qid)))} className="text-xs px-2 py-1 rounded bg-surface-sunken">all shown</button>
                <button onClick={() => setPicked(new Set(shown.slice(0, 10).map(q => q.qid)))} className="text-xs px-2 py-1 rounded bg-surface-sunken">first 10</button>
                <button onClick={() => setPicked(new Set())} className="text-xs px-2 py-1 rounded bg-surface-sunken">none</button>
                <label className="text-xs text-surface-muted ml-auto flex items-center gap-1">
                  <input type="checkbox" checked={showAnswers} onChange={() => setShowAnswers(v => !v)} />
                  show the answers
                </label>
              </div>

              {source === 'revision' && (
                <p className="text-[11px] text-surface-faint">
                  One revision set sits at the end of the whole topic — the notes do not attach single questions to
                  single subtopics, so the subtopic filter is off here.
                </p>
              )}

              <div className="space-y-2 max-h-[26rem] overflow-y-auto pr-1">
                {shown.map(q => (
                  <label key={q.qid} data-qid={q.qid}
                    className={`flex gap-2 rounded-lg border p-2 text-sm ${picked.has(q.qid) ? 'bg-emerald-50 border-emerald-300' : 'bg-surface-raised border-surface-line'}`}>
                    <input type="checkbox" className="mt-1" checked={picked.has(q.qid)} onChange={() => toggle(q.qid)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        {q.subtopic && <span className="text-[11px] bg-surface-sunken text-surface-muted rounded-full px-2 py-0.5">{q.subtopic}</span>}
                        {q.difficulty && <span className="text-[11px] text-surface-faint">{q.difficulty}</span>}
                        <span>{q.question}</span>
                      </div>
                      {showAnswers && (q.type === 'mcq'
                        ? <div className="text-xs mt-0.5 flex flex-wrap gap-x-3">
                            {(q.options || []).map((o, i) => (
                              <span key={i} className={LETTERS[i] === q.correct ? 'text-emerald-700 font-semibold' : 'text-surface-muted'}>
                                {LETTERS[i]}. {o}
                              </span>
                            ))}
                          </div>
                        : <div className="text-xs text-surface-muted mt-0.5">
                            answer: {q.answer || <span className="text-amber-600">none supplied — add one</span>}
                          </div>)}
                      {showAnswers && q.note && <div className="text-[11px] text-surface-faint mt-0.5">{q.note}</div>}
                    </div>
                    <span className="text-xs text-surface-faint whitespace-nowrap">marks
                      <input type="number" min={1} max={20} className="w-14 ml-1 border rounded px-1"
                        value={marksOf(q)}
                        onChange={e => setMarksFor(p => ({ ...p, [q.qid]: Number(e.target.value) }))} />
                    </span>
                  </label>
                ))}
                {!shown.length && <p className="text-sm text-surface-faint">No question matches those filters.</p>}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-surface-muted">
                  {chosen.length} selected · {chosenMarks} marks
                  {chosenMcq ? ` · ${chosenMcq} will mark themselves` : ''}
                </span>
                <button onClick={add} disabled={!chosen.length}
                  className="ml-auto px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-bold disabled:opacity-40">
                  Add {chosen.length || ''} to the exam
                </button>
              </div>
              <p className="text-xs text-surface-faint">
                Multiple-choice questions mark themselves on the phone. Written answers come to you for marking.
                Everything you add stays editable.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
