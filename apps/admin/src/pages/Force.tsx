import { useEffect, useMemo, useState } from 'react';
import { supabase, Profile } from '../lib/supabase';
import topicManifest from '../data/topicManifest.json';
import {
  FORCE_MODES, ForceMode, ForcedRow, forceAssign, forceClear,
  forcedStudents, listExams
} from '../lib/students';

/* =============================================================================
   Admin Override / Force Lock

   Assign any subtopic or exam to any learner, whether or not they have earned
   it through the study chain. Unlock returns them to their own chain.
   ========================================================================== */

type BankTopic = { level: string; subject_code: string; topic: string; topic_id?: string; subtopics?: string[] };
const BANK = ((topicManifest as any).items || []) as BankTopic[];
const CODE: Record<string, string> = { Math: 'MATH', SST: 'SST', English: 'ENG', Science: 'SCI' };

const UNTIL = [
  { id: '', label: 'No end date' },
  { id: '1', label: '1 day' },
  { id: '7', label: '7 days' },
  { id: '30', label: '30 days' }
];

const untilISO = (days: string): string | null =>
  days ? new Date(Date.now() + Number(days) * 86400000).toISOString() : null;

const modeBadge = (m: string, expired?: boolean) =>
  expired ? <span className="badge-mute">expired</span>
  : m === 'LOCK_ONLY' ? <span className="badge-bad">Locked</span>
  : m === 'EXTRA' ? <span className="badge-warn">Extra task</span>
  : <span className="badge-ok">Exam</span>;

export default function Force() {
  const [forced, setForced] = useState<ForcedRow[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [exams, setExams] = useState<{ id: number; title: string }[]>([]);
  const [q, setQ] = useState('');

  const [who, setWho] = useState<Profile | null>(null);
  const [mode, setMode] = useState<ForceMode>('LOCK_ONLY');
  const [openTopic, setOpenTopic] = useState<string | null>(null);
  const [pick, setPick] = useState<{ topic: string; subtopic: string; id: string } | null>(null);
  const [examId, setExamId] = useState<number | null>(null);
  const [days, setDays] = useState('7');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [flash, setFlash] = useState('');

  const load = async () => {
    /* Best effort: if the migration has not run, the RPCs are simply missing
       and the page says so rather than throwing at the owner. */
    try { setForced(await forcedStudents()); setErr(''); }
    catch (e: any) { setErr(e?.message || 'Could not load forced students.'); }
    const { data } = await supabase.from('smartple_profiles').select('*').eq('role', 'student');
    setStudents(((data as Profile[]) || []).filter(s => !!s.user_id));
    try { setExams(await listExams()); } catch { setExams([]); }
  };
  useEffect(() => { load(); }, []);

  const list = useMemo(() => students.filter(s => {
    if (!q) return true;
    const hay = `${s.display_name || ''} ${s.full_name || ''} ${s.student_id_unique || ''} ${s.class || ''}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  }), [students, q]);

  const topics = useMemo(
    () => BANK.filter(b => !who?.class || b.level === who.class),
    [who]
  );

  const say = (m: string) => { setFlash(m); setTimeout(() => setFlash(''), 4000); };

  const submit = async () => {
    setErr('');
    if (!who) return setErr('Pick a student first.');
    if (mode !== 'EXAM' && !pick) return setErr('Pick the subtopic to assign.');
    if (mode === 'EXAM' && !examId) return setErr('Pick the exam to assign.');
    setBusy(true);
    try {
      await forceAssign({
        user_id: who.user_id, mode,
        topic: mode === 'EXAM' ? null : pick!.topic,
        subtopic: mode === 'EXAM' ? null : pick!.subtopic,
        subtopic_id: mode === 'EXAM' ? null : pick!.id,
        exam_id: mode === 'EXAM' ? examId : null,
        until: untilISO(days)
      });
      say(`${who.display_name || who.full_name} → ${mode === 'EXAM' ? 'exam set' : pick!.subtopic}`);
      setPick(null); setOpenTopic(null); setWho(null);
      await load();
    } catch (e: any) {
      setErr(e?.message || 'Could not save the override.');
    } finally { setBusy(false); }
  };

  const unlock = async (r: ForcedRow) => {
    setErr('');
    try { await forceClear(r.user_id); say(`${r.student} is back on their own chain.`); await load(); }
    catch (e: any) { setErr(e?.message || 'Could not unlock.'); }
  };

  const blurb = FORCE_MODES.find(m => m.id === mode)?.blurb;

  return (
    <div className="grid lg:grid-cols-[1fr,360px] gap-4">
      {/* ---------------- currently forced ---------------------------------- */}
      <div className="card">
        <h2 className="mb-1">Currently forced</h2>
        <p className="text-sm text-surface-muted mb-4">
          These learners are off their own study chain. Unlock returns them to it.
        </p>
        {err && <div className="mb-3 text-sm font-bold text-red-700 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl p-3">{err}</div>}
        {flash && <div className="mb-3 text-sm font-bold text-brand-800 dark:text-brand-200 bg-brand-50 dark:bg-brand-900/40 border border-brand-200 dark:border-brand-800 rounded-xl p-3">✓ {flash}</div>}

        {!forced.length && !err && <div className="panel text-sm text-surface-muted">Nobody is under an override right now.</div>}

        <div className="space-y-2">
          {forced.map(r => (
            <div key={r.user_id} className="panel flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{r.student}</div>
                <div className="text-xs text-surface-faint truncate">
                  {r.class || '?'}{r.forced_topic ? ` · ${r.forced_topic}` : ''}
                  {r.forced_subtopic ? ` · ${r.forced_subtopic}` : ''}
                  {r.force_mode === 'EXAM' ? ` · exam #${r.forced_subtopic_id}` : ''}
                  {r.forced_until ? ` · until ${new Date(r.forced_until).toLocaleDateString()}` : ' · no end date'}
                </div>
              </div>
              {modeBadge(r.force_mode, r.expired)}
              <button className="btn-s" onClick={() => unlock(r)}>Unlock</button>
            </div>
          ))}
        </div>
      </div>

      {/* ---------------- force assign -------------------------------------- */}
      <div className="card">
        <h2 className="mb-3">Force assign</h2>

        <span className="label">1 · Student</span>
        {who ? (
          <div className="panel flex items-center gap-2 mb-3">
            <div className="flex-1 min-w-0">
              <div className="font-bold truncate">{who.display_name || who.full_name}</div>
              <div className="text-xs text-surface-faint">{who.class} {who.student_id_unique ? `· ${who.student_id_unique}` : ''}</div>
            </div>
            <button className="btn-ghost" onClick={() => { setWho(null); setPick(null); setOpenTopic(null); }}>Change</button>
          </div>
        ) : (
          <div className="mb-3">
            <input className="input mb-2" placeholder="Search name, ID or class…" value={q} onChange={e => setQ(e.target.value)} />
            <div className="max-h-48 overflow-auto rounded-xl border border-surface-line">
              {list.map(s => (
                <button key={s.user_id} onClick={() => { setWho(s); setOpenTopic(null); setPick(null); }}
                  className="w-full text-left px-3 py-2 text-sm row-hover border-b border-surface-line last:border-0">
                  <span className="font-semibold">{s.display_name || s.full_name || s.user_id.slice(0, 8)}</span>
                  <span className="text-surface-faint"> · {s.class || '?'}</span>
                </button>
              ))}
              {!list.length && <div className="p-3 text-sm text-surface-faint">No students match.</div>}
            </div>
          </div>
        )}

        <span className="label">2 · What to do</span>
        <div className="flex gap-1 mb-1">
          {FORCE_MODES.map(m => (
            <button key={m.id} onClick={() => setMode(m.id)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition ${mode === m.id ? 'bg-brand-600 text-white border-brand-600 dark:bg-brand-500 dark:text-brand-950' : 'bg-surface-raised text-surface-muted border-surface-line'}`}>
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-surface-muted mb-3">{blurb}</p>

        {mode === 'EXAM' ? (
          <>
            <span className="label">3 · Exam</span>
            <select className="input mb-3" value={examId ?? ''} onChange={e => setExamId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Choose a paper…</option>
              {exams.map(x => <option key={x.id} value={x.id}>#{x.id} · {x.title}</option>)}
            </select>
            {!exams.length && <p className="text-xs text-surface-faint mb-3">No exams yet — create one under Exams.</p>}
          </>
        ) : (
          <>
            <span className="label">3 · Subtopic</span>
            {pick ? (
              <div className="panel mb-3">
                <div className="font-bold text-sm">{pick.subtopic}</div>
                <div className="text-xs text-surface-faint">{pick.topic}</div>
                <button className="btn-ghost mt-2 !px-2 !py-1 text-xs" onClick={() => { setPick(null); setOpenTopic(null); }}>Choose another</button>
              </div>
            ) : !openTopic ? (
              <div className="max-h-56 overflow-auto rounded-xl border border-surface-line mb-3">
                {topics.map(b => (
                  <button key={b.topic_id || b.topic} onClick={() => setOpenTopic(b.topic_id || b.topic)}
                    className="w-full text-left px-3 py-2 text-sm row-hover border-b border-surface-line last:border-0">
                    <span className="font-semibold">{b.topic}</span>
                    <span className="text-surface-faint"> · {b.level} {b.subject_code}</span>
                  </button>
                ))}
                {!topics.length && <div className="p-3 text-sm text-surface-faint">No topics for this class.</div>}
              </div>
            ) : (
              (() => {
                const b = BANK.find(x => (x.topic_id || x.topic) === openTopic);
                return (
                  <div className="mb-3">
                    <button className="btn-ghost !px-2 !py-1 text-xs mb-2" onClick={() => setOpenTopic(null)}>← all topics</button>
                    <div className="max-h-56 overflow-auto rounded-xl border border-surface-line">
                      {((b && b.subtopics) || []).map((s: string, i: number) => (
                        <button key={s}
                          onClick={() => setPick({ topic: (b as any).topic, subtopic: s, id: `${(b as any).topic_id}#${i}` })}
                          className="w-full text-left px-3 py-2 text-sm row-hover border-b border-surface-line last:border-0">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()
            )}
          </>
        )}

        <span className="label">4 · For how long</span>
        <div className="flex gap-1 flex-wrap mb-4">
          {UNTIL.map(u => (
            <button key={u.id} onClick={() => setDays(u.id)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${days === u.id ? 'bg-surface-ink text-surface-page border-surface-ink' : 'bg-surface-raised text-surface-muted border-surface-line'}`}>
              {u.label}
            </button>
          ))}
        </div>

        <button className="btn-p btn-lg w-full" onClick={submit} disabled={busy}>
          {busy ? 'Saving…' : 'Force assign'}
        </button>
        <p className="text-xs text-surface-faint mt-2">
          The learner's own chain is untouched — this sits on top of it and lapses on its own if you set an end date.
        </p>
      </div>
    </div>
  );
}
