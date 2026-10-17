import { lazy, Suspense, useEffect, useState } from 'react';
import { supabase, Profile } from '../lib/supabase';
/* the PDF editor carries pdf.js (~1.2 MB) — load it only when a PDF exam is opened */
const PdfBoxEditor = lazy(() => import('../components/PdfBoxEditor'));
/* the question banks are ~1.7 MB + ~700 KB of real questions — the panel
   fetches one bank at a time, and only when it is opened */
const QuestionBank = lazy(() => import('../components/QuestionBank'));
import { Box, Draft, BUCKET, boxesOf, questionsOf } from '../lib/examTypes';

/* ------------------------------------------------------------------
   Exams — build one, lock it onto students, read the results.

   Live tables (nothing to install, no extra SQL):
     smartple_exams              id, title, subject, duration_minutes, questions (jsonb)
     smartple_exam_assignments   id, exam_id, user_id, status, score
   The database constrains status to: locked | in_progress | completed.

   A student's phone polls every 15 seconds, so the exam appears — and the
   app locks around it — within seconds of pressing ASSIGN & LOCK.
------------------------------------------------------------------ */

type Exam = { id: number; title: string; subject: string | null; duration_minutes: number | null; questions: any; created_at: string };
type Asg = { id: number; exam_id: number; user_id: string; status: string; score: number | null; created_at: string };
type Sub = { id: string; user_id: string; details: any; created_at: string };

const mcq = (): Draft => ({ q: '', options: ['', '', '', ''], answer: 'A', kind: 'mcq', marks: 1 });
const written = (): Draft => ({ q: '', options: [], answer: '', kind: 'short', marks: 2 });
const qsOf = (e: Exam | null): Draft[] => (e ? questionsOf(e.questions) : []);
const isPdf = (e: Exam | null) => !!e && e.questions?.kind === 'pdf';
const boxesOfExam = (e: Exam | null): Box[] => (e ? boxesOf(e.questions) : []);
const letters = ['A', 'B', 'C', 'D'];

export default function Exams() {
  const [tab, setTab] = useState<'create' | 'assign' | 'results'>('create');
  const [students, setStudents] = useState<Profile[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [asgs, setAsgs] = useState<Asg[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // create form
  const [kind, setKind] = useState<'topic' | 'pdf'>('topic');
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('SST');
  const [duration, setDuration] = useState(10);
  const [qs, setQs] = useState<Draft[]>([mcq()]);
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [busy, setBusy] = useState(false);
  const [showBank, setShowBank] = useState(false);

  // assign form
  const [examId, setExamId] = useState<number | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<number | null>(null);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 3500); };

  const reload = async () => {
    const [{ data: s }, { data: e, error: ee }, { data: a }, { data: sub }] = await Promise.all([
      supabase.from('smartple_profiles').select('*'),
      supabase.from('smartple_exams').select('*').order('id', { ascending: false }),
      supabase.from('smartple_exam_assignments').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('learning_events').select('*').eq('event_type', 'exam_submitted')
        .order('created_at', { ascending: false }).limit(200)
    ]);
    setErr(ee ? String(ee.message) : null);
    setStudents((s || []) as Profile[]);
    setExams((e || []) as Exam[]);
    setAsgs((a || []) as Asg[]);
    setSubs((sub || []) as Sub[]);
    if (!examId && e && e.length) setExamId((e[0] as Exam).id);
  };
  useEffect(() => { reload(); }, []);

  const name = (uid: string) => {
    const p = students.find(x => x.user_id === uid);
    return p?.display_name || (uid ? uid.slice(0, 8) : '?');
  };
  const examTitle = (id: number) => exams.find(e => e.id === id)?.title || `exam ${id}`;
  const totalMarks = qs.reduce((a, q) => a + (Number(q.marks) || 0), 0);
  const setQ = (i: number, patch: Partial<Draft>) =>
    setQs(prev => prev.map((q, j) => j === i ? { ...q, ...patch } : q));

  /* Questions arrive already answered: practice MCQs carry their options and
     the correct letter, so they will mark themselves on the phone. Empty drafts
     (the blank MCQ the form starts with) are dropped so they do not sit in the
     middle of the paper. */
  const addFromBank = (drafts: Draft[], meta: { subject_code: string; topic: string; level: string; source: string }) => {
    setKind('topic');
    setQs(prev => [...prev.filter(q => q.q.trim()), ...drafts]);
    if (meta.subject_code) setSubject(meta.subject_code);
    setShowBank(false);
    const mcqs = drafts.filter(d => d.kind === 'mcq').length;
    flash(`Added ${drafts.length} question${drafts.length > 1 ? 's' : ''} from ${meta.level} ${meta.topic}` +
      (mcqs ? ` — ${mcqs} will mark themselves` : '') + `. Edit anything before you save.`);
  };
  const fromBankCount = qs.filter(q => (q.is_from_revision_bank || q.is_from_practice_bank) && q.q.trim()).length;

  const uploadPdf = async (f: File) => {
    setBusy(true);
    const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
    const { error } = await supabase.storage.from(BUCKET)
      .upload(path, f, { contentType: 'application/pdf', upsert: false });
    setBusy(false);
    if (error) return alert(`Upload FAILED — nothing was stored.\n\n${error.message}\n\n` +
      `If the bucket does not exist yet, run the storage SQL from the assistant in the Supabase SQL editor, then try again.`);
    setPdfPath(path);
    flash(`Uploaded ${f.name} — now drag answer boxes onto it.`);
  };

  const saveExam = async () => {
    if (!title.trim()) return alert('Give the exam a title.');
    let paper: any;
    if (kind === 'pdf') {
      if (!pdfPath) return alert('Upload the PDF first.');
      if (!boxes.length) return alert('Place at least one answer box on the PDF.');
      const badBox = boxes.find(b => b.type === 'mcq' && (b.options || []).filter(o => (o || '').trim()).length < 2);
      if (badBox) return alert(`Box Q${badBox.n}: a multiple-choice box needs at least two options.`);
      paper = { kind: 'pdf', pdf_path: pdfPath, boxes: boxes.map(b => ({
        ...b, options: b.type === 'mcq' ? (b.options || []).filter(o => (o || '').trim()) : undefined })) };
    } else {
      const clean = qs.filter(q => q.q.trim());
      if (!clean.length) return alert('Add at least one question.');
      const bad = clean.find(q => q.kind === 'mcq' && q.options.filter(o => o.trim()).length < 2);
      if (bad) return alert('Every multiple-choice question needs at least two options.');
      /* provenance travels with the question, whichever bank it came from */
      const prov = (q: Draft) => (q.is_from_revision_bank || q.is_from_practice_bank)
        ? { ...(q.is_from_revision_bank ? { is_from_revision_bank: true } : { is_from_practice_bank: true }),
            qid: q.qid, topic: q.topic, subtopic: q.subtopic, level: q.level, subject: q.subject,
            ...(q.explanation ? { explanation: q.explanation } : {}) }
        : {};
      paper = { kind: 'topic', questions: clean.map(q => q.kind === 'mcq'
        ? { ...q, options: q.options.filter(o => o.trim()), ...prov(q) }
        : { q: q.q, options: [], answer: q.answer, kind: 'short', marks: Number(q.marks) || 1, ...prov(q) }) };
    }
    const marks = kind === 'pdf' ? boxes.reduce((a, b) => a + (Number(b.marks) || 0), 0) : totalMarks;
    const payload = { title: title.trim(), subject, duration_minutes: Number(duration) || 10, questions: paper };
    const { data, error } = await supabase.from('smartple_exams').insert(payload)
      .select('*');
    if (error) return alert(`Save FAILED — nothing was stored.\n\n${error.message}`);
    flash(`Saved "${title.trim()}" · ${kind === 'pdf' ? `${boxes.length} answer boxes` : `${paper.questions.length} questions`}` +
      (kind === 'topic' && fromBankCount ? ` (${fromBankCount} from the question bank)` : '') + ` · ${marks} marks`);
    setTitle(''); setQs([mcq()]); setPdfPath(null); setBoxes([]);
    await reload();
    if (data && data[0]) { setExamId(data[0].id); setTab('assign'); }
  };

  const assign = async () => {
    if (!examId) return alert('Pick an exam.');
    if (!chosen.size) return alert('Tick at least one student.');
    const rows = [...chosen].map(user_id => ({ exam_id: examId, user_id, status: 'locked' }));
    const { error } = await supabase.from('smartple_exam_assignments').insert(rows);
    if (error) return alert(`Assign FAILED.\n\n${error.message}`);
    flash(`Locked "${examTitle(examId)}" onto ${rows.length} student${rows.length > 1 ? 's' : ''} — it reaches their phone within 15 s.`);
    setChosen(new Set());
    await reload();
    setTab('results');
  };

  const release = async (a: Asg) => {
    if (!confirm(`Hide "${examTitle(a.exam_id)}" from ${name(a.user_id)}? The exam disappears from their phone within 15 seconds.`)) return;
    const { error } = await supabase.from('smartple_exam_assignments').delete().eq('id', a.id);
    if (error) return alert(`Release FAILED.\n\n${error.message}`);
    flash('Hidden — the exam is off that phone within 15 seconds.');
    await reload();
  };

  const badge = (s: string) => {
    const c = s === 'completed' ? 'bg-green-100 text-green-700'
      : s === 'in_progress' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
    return <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${c}`}>{s}</span>;
  };

  const Tab = ({ id, label }: { id: typeof tab; label: string }) => (
    <button onClick={() => setTab(id)}
      className={`px-4 py-2 rounded-xl text-sm font-bold ${tab === id ? 'bg-brand-600 text-white' : 'bg-surface-sunken text-surface-muted'}`}>
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center">
        <Tab id="create" label="1 · Create exam" />
        <Tab id="assign" label="2 · Assign" />
        <Tab id="results" label="3 · Results" />
        <button onClick={reload} className="ml-auto text-sm text-surface-muted underline">refresh</button>
      </div>
      {msg && <div className="card bg-green-50 text-green-800 text-sm font-semibold">{msg}</div>}
      {err && <div className="card bg-red-50 text-red-700 text-sm">{err}</div>}

      {/* ---------------- CREATE ---------------- */}
      {tab === 'create' && (
        <div className="card space-y-3">
          <div className="grid md:grid-cols-[2fr,1fr,1fr] gap-2">
            <input className="input" placeholder="Exam title, e.g. P6 SST · East African Community · Test 1"
              value={title} onChange={e => setTitle(e.target.value)} />
            <select className="input" value={subject} onChange={e => setSubject(e.target.value)}>
              {['SST', 'SCI', 'ENG', 'MATH'].map(s => <option key={s}>{s}</option>)}
            </select>
            <label className="input flex items-center gap-2">minutes
              <input type="number" min={1} className="w-20 border rounded px-2 py-1"
                value={duration} onChange={e => setDuration(Number(e.target.value))} />
            </label>
          </div>

          <div className="flex gap-2 items-center">
            <button onClick={() => setKind('topic')}
              className={`px-3 py-2 rounded-xl text-sm font-bold border ${kind === 'topic' ? 'bg-brand-600 text-white border-brand-600' : 'bg-surface-raised text-surface-muted border-surface-line'}`}>
              From questions</button>
            <button onClick={() => setKind('pdf')}
              className={`px-3 py-2 rounded-xl text-sm font-bold border ${kind === 'pdf' ? 'bg-brand-600 text-white border-brand-600' : 'bg-surface-raised text-surface-muted border-surface-line'}`}>
              From a PDF paper</button>
            <span className="text-xs text-surface-faint ml-auto">an exam is invisible on every phone until you assign it</span>
          </div>

          {kind === 'pdf' && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm border border-dashed rounded-xl p-3 cursor-pointer bg-surface-sunken">
                <input type="file" accept="application/pdf" className="text-xs" disabled={busy}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadPdf(f); }} />
                <span className="text-surface-muted">{busy ? 'uploading…' : pdfPath ? `uploaded: ${pdfPath.split('-').pop()}` : 'choose a UNEB paper (PDF)'}</span>
              </label>
              {pdfPath && <Suspense fallback={<div className="text-sm text-surface-muted p-3">loading the PDF editor…</div>}>
                <PdfBoxEditor path={pdfPath} boxes={boxes} onChange={setBoxes} />
              </Suspense>}
            </div>
          )}

          {kind === 'topic' && qs.map((q, i) => (
            <div key={i} className="border rounded-xl p-3 space-y-2 bg-surface-sunken">
              <div className="flex items-center gap-2">
                <b className="text-sm">Q{i + 1}</b>
                <button onClick={() => setQ(i, { kind: q.kind === 'mcq' ? 'short' : 'mcq', options: q.kind === 'mcq' ? ['', '', '', ''] : [] })}
                  className="text-xs px-2 py-1 rounded bg-surface-raised border">
                  {q.kind === 'mcq' ? 'multiple choice' : 'written answer'}
                </button>
                {(q.is_from_revision_bank || q.is_from_practice_bank) && (
                  <span title={`From the ${q.is_from_revision_bank ? 'notes' : "student app's practice bank"}: ${q.level} ${q.topic}${q.subtopic ? ' · ' + q.subtopic : ''} · ${q.qid}`}
                    className="text-[11px] bg-emerald-100 text-emerald-800 rounded-full px-2 py-0.5 whitespace-nowrap">
                    from the {q.is_from_revision_bank ? 'notes' : 'app'} · {q.qid}
                  </span>
                )}
                <label className="text-xs text-surface-muted ml-auto">marks
                  <input type="number" min={1} className="w-14 ml-1 border rounded px-1"
                    value={q.marks} onChange={e => setQ(i, { marks: Number(e.target.value) })} />
                </label>
                <button onClick={() => setQs(p => p.filter((_, j) => j !== i))} className="text-xs text-red-500">delete</button>
              </div>
              <input className="input" placeholder="The question…" value={q.q} onChange={e => setQ(i, { q: e.target.value })} />
              {q.kind === 'mcq'
                ? q.options.map((o, k) => (
                  <div key={k} className="flex items-center gap-2">
                    <input type="radio" name={`c${i}`} checked={q.answer === letters[k]}
                      onChange={() => setQ(i, { answer: letters[k] })} />
                    <span className="text-xs w-4">{letters[k]}</span>
                    <input className="input" placeholder={`Option ${letters[k]}`} value={o}
                      onChange={e => setQ(i, { options: q.options.map((x, j) => j === k ? e.target.value : x) })} />
                  </div>
                ))
                : <input className="input" placeholder="Model answer (for your marking — the student never sees it)"
                    value={q.answer} onChange={e => setQ(i, { answer: e.target.value })} />}
            </div>
          ))}

          {kind === 'topic' && showBank && (
            <Suspense fallback={<div className="text-sm text-surface-muted p-3">loading the question bank…</div>}>
              <QuestionBank preferSubject={subject} onClose={() => setShowBank(false)} onAdd={addFromBank} />
            </Suspense>
          )}

          <div className="flex gap-2 flex-wrap items-center">
            <button onClick={() => setShowBank(v => !v)}
              className={`px-3 py-2 rounded-lg text-sm font-bold border ${showBank ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-emerald-50 text-emerald-800 border-emerald-300'}`}>
              {showBank ? 'close the question bank' : 'Pick from the question bank'}
            </button>
            <button onClick={() => setQs(p => [...p, mcq()])} className="btn-soft text-sm px-3 py-2 rounded-lg bg-surface-sunken">+ multiple choice</button>
            <button onClick={() => setQs(p => [...p, written()])} className="btn-soft text-sm px-3 py-2 rounded-lg bg-surface-sunken">+ written question</button>
            <span className="text-sm text-surface-muted">{kind === 'pdf'
              ? `${boxes.length} answer boxes · ${boxes.reduce((a, b) => a + (Number(b.marks) || 0), 0)} marks`
              : `${qs.filter(q => q.q.trim()).length} questions · ${totalMarks} marks` +
                (fromBankCount ? ` · ${fromBankCount} from the question bank` : '')}</span>
            <button onClick={saveExam}
              className="ml-auto px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-bold">Save exam</button>
          </div>
          <p className="text-xs text-surface-faint">Multiple choice is marked automatically on the phone. Written answers — including anything typed into a PDF box — are sent to you for marking.</p>
        </div>
      )}

      {/* ---------------- ASSIGN ---------------- */}
      {tab === 'assign' && (
        <div className="grid md:grid-cols-[1fr,320px] gap-4">
          <div className="card space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <b className="text-sm">Who can see this exam?</b>
              <button onClick={() => setChosen(new Set(students.map(s => s.user_id)))}
                className="text-xs px-2 py-1 rounded bg-surface-sunken">all students</button>
              {['P4', 'P5', 'P6', 'P7'].map(c => (
                <button key={c} onClick={() => setChosen(new Set(students.filter(s => s.class === c).map(s => s.user_id)))}
                  className="text-xs px-2 py-1 rounded bg-surface-sunken">{c}</button>
              ))}
              <button onClick={() => setChosen(new Set())} className="text-xs px-2 py-1 rounded bg-surface-sunken">none</button>
            </div>
            {students.map(s => (
              <label key={s.user_id} className="flex items-center gap-2 text-sm py-1">
                <input type="checkbox" checked={chosen.has(s.user_id)}
                  onChange={() => setChosen(prev => {
                    const n = new Set(prev);
                    n.has(s.user_id) ? n.delete(s.user_id) : n.add(s.user_id);
                    return n;
                  })} />
                {s.display_name || s.user_id.slice(0, 8)} <span className="text-surface-faint">· {s.class || '?'}</span>
              </label>
            ))}
            {!students.length && <p className="text-sm text-surface-faint">No students found.</p>}
          </div>
          <div className="card space-y-3">
            <b className="text-sm">The exam</b>
            <select className="input" value={examId ?? ''} onChange={e => setExamId(Number(e.target.value))}>
              {exams.map(e => <option key={e.id} value={e.id}>
                {e.title} ({isPdf(e) ? `PDF · ${boxesOfExam(e).length} boxes` : `${qsOf(e).length} q`})
              </option>)}
            </select>
            <button onClick={assign}
              className="w-full px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold">
              Make visible &amp; lock ({chosen.size})
            </button>
            <p className="text-xs text-surface-faint">
              Nobody sees this exam until you press this. It then appears on those phones within 15 seconds and
              the app opens straight into it — no back, no home — until they submit or the time runs out.
              Unassign from the Results tab to hide it again instantly.</p>
          </div>
        </div>
      )}

      {/* ---------------- RESULTS ---------------- */}
      {tab === 'results' && (
        <div className="card space-y-2">
          {asgs.map(a => {
            const sub = subs.find(s => s.user_id === a.user_id && Number(s.details?.exam_id) === Number(a.exam_id));
            const answers: any[] = sub?.details?.answers || [];
            return (
              <div key={a.id} className="border rounded-xl p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <b className="text-sm">{name(a.user_id)}</b>
                  <span className="text-surface-muted text-sm">{examTitle(a.exam_id)}</span>
                  {badge(a.status)}
                  {a.score != null && <span className="text-sm font-bold text-green-700">{a.score}%</span>}
                  {a.status !== 'completed' &&
                    <button onClick={() => release(a)} className="ml-auto text-xs text-red-500 underline">unassign / hide</button>}
                  {answers.length > 0 &&
                    <button onClick={() => setOpen(open === a.id ? null : a.id)}
                      className="text-xs text-brand-600 dark:text-brand-300 underline">{open === a.id ? 'hide answers' : 'review answers'}</button>}
                </div>
                {open === a.id && (
                  <div className="mt-2 space-y-2">
                    {answers.map((d: any, i: number) => (
                      <div key={i} className="text-sm bg-surface-sunken rounded-lg p-2">
                        <b>Q{i + 1}. {d.q}</b>
                        <div>Answer given: <b>{d.given || '—'}</b></div>
                        {d.ok === null
                          ? <div className="text-amber-700">needs your marking · model answer: {d.answer}</div>
                          : <div className={d.ok ? 'text-green-700' : 'text-red-600'}>
                              {d.ok ? 'correct' : 'not correct'} · correct answer: {d.answer}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {!asgs.length && <p className="text-sm text-surface-faint">Nothing assigned yet.</p>}
        </div>
      )}
    </div>
  );
}
