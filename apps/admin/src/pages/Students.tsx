import { useEffect, useMemo, useState } from 'react';
import { supabase, Profile } from '../lib/supabase';
import { fetchEvents, eventsFor } from '../lib/events';
import StudentView from './StudentView';
import StudentAnswers from '../components/StudentAnswers';
import { statusOf, daysLeft, endsOn, renewStudent, refreshStatuses, photoUrl } from '../lib/students';

type Row = { subject: string; topic: string; subtopic: string | null; avg_score: number; n: number };
type Skip = { topic: string; tier: number | null; n: number };

const RENEW_OPTIONS = [30, 60, 90];

export default function Students() {
  const [students, setStudents] = useState<Profile[]>([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Profile | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [skips, setSkips] = useState<Skip[]>([]);
  /* Answers first: the owner's standing requirement is to read what a learner
     actually wrote. Progress is the scoreboard he keeps landing on by mistake. */
  const [view, setView] = useState<'progress' | 'answers' | 'student'>('answers');

  /* Active / Deactivated. Status is derived from the end date on every render,
     so a student who ran out at midnight shows up red before any job runs. */
  const [tab, setTab] = useState<'active' | 'expired'>('active');
  const [renewFor, setRenewFor] = useState<Profile | null>(null);
  const [renewDays, setRenewDays] = useState(30);
  const [renewBusy, setRenewBusy] = useState(false);
  const [renewErr, setRenewErr] = useState('');
  const [flash, setFlash] = useState('');

  const load = async () => {
    /* Best effort: if the migration has not run yet the function is simply
       missing, and the derived status below is still correct. */
    await refreshStatuses().catch(() => {});
    const { data } = await supabase.from('smartple_profiles').select('*').eq('role', 'student');
    setStudents(((data as Profile[]) || []).filter(s => !!s.user_id));
  };

  useEffect(() => { load(); }, []);

  /* ---- the two tabs ------------------------------------------------------ */
  const active = useMemo(() => students.filter(s => statusOf(s) === 'active'), [students]);
  const expired = useMemo(() => students.filter(s => statusOf(s) === 'expired'), [students]);
  const shown = (tab === 'active' ? active : expired).filter(s => {
    if (!q) return true;
    const hay = `${s.display_name || ''} ${s.full_name || ''} ${s.student_id_unique || ''}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  const pick = async (s: Profile) => {
    setSel(s);
    /* Tapping a student must land on what they WROTE. This used to force
       'progress' — the red/amber scoreboard — which is why the answers page
       was never seen even though it existed. */
    setView('answers');
    // weakest subtopics first (heatmap source) — from learning_events
    const attempts = eventsFor(await fetchEvents(), s.user_id);
    const acc: Record<string, Row> = {};
    const sk: Record<string, Skip> = {};
    for (const a of attempts) {
      const key = `${a.subject}|${a.topic}|${a.subtopic || '-'}`;
      acc[key] = acc[key] || { subject: a.subject, topic: a.topic, subtopic: a.subtopic, avg_score: 0, n: 0 };
      if (a.correct !== null) { acc[key].avg_score += a.correct ? 100 : 0; acc[key].n += 1; }
      if (a.skipped) {
        const k2 = `${a.topic}|${a.tier}`;
        sk[k2] = sk[k2] || { topic: a.topic, tier: a.tier, n: 0 };
        sk[k2].n += 1;
      }
    }
    const rowsOut = Object.values(acc).filter(r => r.n > 0)
      .map(r => ({ ...r, avg_score: Math.round(r.avg_score / r.n) }))
      .sort((a, b) => a.avg_score - b.avg_score);
    setRows(rowsOut);
    setSkips(Object.values(sk).sort((a, b) => b.n - a.n));
  };

  const heat = (score: number) =>
    score < 40 ? 'bg-red-100 text-red-700' : score < 60 ? 'bg-amber-100 text-amber-700'
    : score < 80 ? 'bg-yellow-50 text-yellow-700' : 'bg-green-100 text-green-700';

  /* ---- renewal ----------------------------------------------------------- */
  const openRenew = (s: Profile) => { setRenewFor(s); setRenewDays(30); setRenewErr(''); };

  const doRenew = async () => {
    if (!renewFor) return;
    setRenewBusy(true); setRenewErr('');
    try {
      const r = await renewStudent(renewFor.user_id, renewDays);
      setFlash(`${renewFor.display_name || renewFor.full_name || 'Student'} renewed to ${r.end_date}.`);
      setRenewFor(null);
      await load();
      setSel(s => (s && s.user_id === renewFor.user_id ? { ...s } : s));
      setTimeout(() => setFlash(''), 4000);
    } catch (e: any) {
      setRenewErr(e?.message || 'Renewal failed.');
    } finally {
      setRenewBusy(false);
    }
  };

  const badge = (s: Profile) => {
    const left = daysLeft(s);
    const end = endsOn(s);
    if (!end) return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-surface-sunken text-surface-muted">no expiry</span>;
    if (left === null) return null;
    if (left < 0) return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">expired {end}</span>;
    if (left <= 7) return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">{left}d left</span>;
    return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">{left}d left</span>;
  };

  return (
    <div className="grid md:grid-cols-[300px,1fr] gap-4">
      <div className="card">
        {/* ---- the two tabs ------------------------------------------------ */}
        <div className="flex gap-1 mb-2">
          <button onClick={() => setTab('active')}
            className={`flex-1 px-2 py-2 rounded-lg text-sm font-bold border ${tab === 'active' ? 'bg-green-600 text-white border-green-600' : 'bg-surface-raised text-green-700 border-green-200'}`}>
            ● Active <span className="opacity-80">({active.length})</span>
          </button>
          <button onClick={() => setTab('expired')}
            className={`flex-1 px-2 py-2 rounded-lg text-sm font-bold border ${tab === 'expired' ? 'bg-red-600 text-white border-red-600' : 'bg-surface-raised text-red-700 border-red-200'}`}>
            ● Expired <span className="opacity-80">({expired.length})</span>
          </button>
        </div>

        <input className="input mb-2" placeholder="Search name or Student ID…" value={q} onChange={e => setQ(e.target.value)} />

        <div className="max-h-[68vh] overflow-auto">
          {shown.map(s => (
            <div key={s.user_id}
              className={`w-full flex items-center gap-1 px-2 py-2 rounded-lg text-sm ${sel?.user_id === s.user_id ? 'bg-brand-50 dark:bg-brand-900/30' : 'hover:bg-surface-sunken'}`}>
              <button onClick={() => pick(s)} className="flex-1 text-left min-w-0">
                <span className={`block truncate ${sel?.user_id === s.user_id ? 'font-bold' : ''}`}>
                  {s.display_name || s.full_name || (s.user_id ? s.user_id.slice(0, 8) : '(no name)')}
                </span>
                <span className="text-xs text-surface-faint">
                  {s.class || '?'}{s.student_id_unique ? ` · ${s.student_id_unique}` : ''}
                </span>
              </button>
              {badge(s)}
            </div>
          ))}
          {!shown.length && (
            <div className="text-sm text-surface-faint px-2 py-4">
              {tab === 'active' ? 'No active students match.' : 'Nobody has expired. '}
            </div>
          )}
        </div>
      </div>

      <div>
        {flash && <div className="card mb-3 bg-green-50 border-green-300 text-green-800 font-bold text-sm">✓ {flash}</div>}

        {!sel && (
          <div className="card text-surface-muted">
            Pick a student to read what they wrote, see their progress, open their own screen, or renew their access.
          </div>
        )}

        {sel && (
          <>
            <div className="card mb-3">
              <div className="flex items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <h2 className="font-black">
                    {sel.display_name || sel.full_name} <span className="text-surface-faint font-normal">· {sel.class}</span>
                  </h2>
                  <p className="text-xs text-surface-faint">
                    {sel.student_id_unique || 'no Student ID yet'} · {sel.user_id}
                  </p>
                  <p className="text-xs text-surface-muted mt-1">
                    Guardian: {sel.guardian_name || '—'} {sel.guardian_contact ? `· ${sel.guardian_contact}` : ''}
                  </p>
                  <div className="mt-1">{badge(sel)}</div>
                </div>
                <button className={statusOf(sel) === 'expired' ? 'btn-p' : 'btn-s'} onClick={() => openRenew(sel)}>
                  {statusOf(sel) === 'expired' ? 'Reactivate / Renew' : 'Renew'}
                </button>
              </div>
              <div className="flex gap-2 mt-3 flex-wrap">
                <button className={view === 'answers' ? 'btn-p' : 'btn-s'} onClick={() => setView('answers')}>📝 What they wrote</button>
                <button className={view === 'progress' ? 'btn-p' : 'btn-s'} onClick={() => setView('progress')}>📊 Progress</button>
                <button className={view === 'student' ? 'btn-p' : 'btn-s'} onClick={() => setView('student')}>👁 Student View</button>
              </div>
            </div>
            {view === 'student' && <StudentView student={sel} />}
            {view === 'answers' && <StudentAnswers student={sel} />}
            {view === 'progress' && <>
            <div className="card mb-3">
              <h3 className="font-bold mb-2">Weakest subtopics (worst first)</h3>
              <table className="w-full">
                <thead><tr><th className="th">Subject</th><th className="th">Topic</th><th className="th">Subtopic</th><th className="th">Avg</th><th className="th">N</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="td">{r.subject}</td><td className="td">{r.topic}</td><td className="td">{r.subtopic || '-'}</td>
                      <td className="td"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${heat(r.avg_score)}`}>{r.avg_score}%</span></td>
                      <td className="td">{r.n}</td>
                    </tr>
                  ))}
                  {!rows.length && <tr><td className="td text-surface-faint" colSpan={5}>No attempts yet.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="card">
              <h3 className="font-bold mb-2">Skips = anxiety signal 😰</h3>
              <table className="w-full">
                <thead><tr><th className="th">Topic</th><th className="th">Tier</th><th className="th">Skips</th></tr></thead>
                <tbody>
                  {skips.map((s, i) => (
                    <tr key={i}><td className="td">{s.topic}</td><td className="td">T{s.tier ?? '?'}</td><td className="td font-bold">{s.n}</td></tr>
                  ))}
                  {!skips.length && <tr><td className="td text-surface-faint" colSpan={3}>No skips.</td></tr>}
                </tbody>
              </table>
            </div>
            </>}
          </>
        )}
      </div>

      {/* ---- the renewal popup --------------------------------------------- */}
      {renewFor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => !renewBusy && setRenewFor(null)}>
          <div className="card w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="font-black mb-1">Renew for how many days?</h3>
            <p className="text-sm text-surface-muted mb-3">
              {renewFor.display_name || renewFor.full_name} — access restarts today.
            </p>
            <div className="flex gap-2 mb-3">
              {RENEW_OPTIONS.map(d => (
                <button key={d}
                  className={`flex-1 py-3 rounded-lg font-black border ${renewDays === d ? 'bg-brand-600 text-white border-brand-600' : 'bg-surface-raised text-surface-ink'}`}
                  onClick={() => setRenewDays(d)}>
                  {d}
                </button>
              ))}
            </div>
            <label className="block mb-3">
              <span className="text-xs font-bold text-surface-muted">Or a custom number of days</span>
              <input className="input" type="number" min={1} max={3650} value={renewDays}
                onChange={e => setRenewDays(Math.max(1, Number(e.target.value) || 1))} />
            </label>
            <p className="text-xs text-surface-muted mb-3">
              New end date: <b>{new Date(Date.now() + renewDays * 86400000).toISOString().slice(0, 10)}</b>
            </p>
            {renewErr && <div className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded p-2 mb-3">{renewErr}</div>}
            <div className="flex gap-2">
              <button className="btn-p flex-1" onClick={doRenew} disabled={renewBusy}>
                {renewBusy ? 'Saving…' : `Confirm ${renewDays} days`}
              </button>
              <button className="btn-s" onClick={() => setRenewFor(null)} disabled={renewBusy}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* The photo is stored privately; sign a short-lived URL only when it is opened. */
export function StudentPhoto({ path, size = 40 }: { path: string | null; size?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { if (path) photoUrl(path).then(setUrl).catch(() => setUrl(null)); }, [path]);
  if (!url) return <div className="rounded-full bg-surface-sunken" style={{ width: size, height: size }} />;
  return <img src={url} alt="" className="rounded-full object-cover" style={{ width: size, height: size }} />;
}
