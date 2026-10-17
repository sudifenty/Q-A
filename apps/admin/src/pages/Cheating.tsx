import { useEffect, useState } from 'react';
import { supabase, Profile } from '../lib/supabase';
import { fetchEvents, eventsFor, Evt } from '../lib/events';

type TL = {
  subtopic: string; viewed_answer: string | null;
  started_typing: string | null; submitted: string | null; flag: string;
};

/** seconds for an event: its own duration field, else gap to the previous event */
const secondsOf = (e: Evt, prev: Evt | undefined): number | null => {
  if (e.seconds !== null) return e.seconds;
  if (!prev) return null;
  const d = (new Date(e.at).getTime() - new Date(prev.at).getTime()) / 1000;
  return d >= 0 && d < 3600 ? d : null;
};

export default function Cheating() {
  const [students, setStudents] = useState<Profile[]>([]);
  const [sel, setSel] = useState<Profile | null>(null);
  const [timeline, setTimeline] = useState<TL[]>([]);
  const [guessers, setGuessers] = useState<any[]>([]);
  const [randomGuess, setRandomGuess] = useState<number>(0);
  const [allEvents, setAllEvents] = useState<Evt[]>([]);

  const nameOf = (uid: string) =>
    students.find(s => s.user_id === uid)?.display_name || uid.slice(0, 8);

  const analyse = (evts: Evt[], studs: Profile[]) => {
    const nOf = (uid: string) => studs.find(s => s.user_id === uid)?.display_name || uid.slice(0, 8);
    const dayAgo = Date.now() - 864e5;
    const flags: any[] = [];
    const byUid: Record<string, Evt[]> = {};
    for (const e of evts) (byUid[e.uid] = byUid[e.uid] || []).push(e);
    for (const [uid, list] of Object.entries(byUid)) {
      // oldest→newest so gaps make sense
      const asc = [...list].sort((a, b) => (a.at > b.at ? 1 : -1));
      // hour buckets, answers only
      const buckets: Record<string, { n: number; secs: number }> = {};
      asc.forEach((e, i) => {
        if (e.skipped || new Date(e.at).getTime() < dayAgo) return;
        const hour = e.at.slice(0, 13);
        buckets[hour] = buckets[hour] || { n: 0, secs: 0 };
        buckets[hour].n += 1;
        buckets[hour].secs += secondsOf(e, asc[i - 1]) ?? 0;
      });
      for (const b of Object.values(buckets))
        if (b.n >= 5 && b.secs < 15)
          flags.push({ uid, display_name: nOf(uid), n_questions: b.n, total_seconds: Math.round(b.secs) });
    }
    setGuessers(flags);
  };

  useEffect(() => {
    (async () => {
      const [{ data: p }, evts] = await Promise.all([
        supabase.from('smartple_profiles').select('*').eq('role', 'student'),
        fetchEvents()
      ]);
      const studs = ((p as Profile[]) || []).filter(s => !!s.user_id);
      setStudents(studs);
      setAllEvents(evts);
      analyse(evts, studs);
    })();
  }, []);

  const pick = (s: Profile) => {
    setSel(s);
    const mine = eventsFor(allEvents, s.user_id);

    // random guessing: answered wrong in under 3 seconds, repeatedly
    const asc = [...mine].sort((a, b) => (a.at > b.at ? 1 : -1));
    let fast = 0;
    asc.forEach((e, i) => {
      const secs = secondsOf(e, asc[i - 1]);
      if (e.correct === false && secs !== null && secs < 3) fast += 1;
    });
    setRandomGuess(fast);

    // notes cheating timeline from view/typing/submit event types
    const groups: Record<string, TL> = {};
    for (const e of mine) {
      const t = (e.type || '').toLowerCase();
      const viewed = t.includes('view');
      const typing = t.includes('typ');
      const submitted = t === 'submitted' || t === 'submit';
      if (!viewed && !typing && !submitted) continue;
      const key = `${e.subtopic || e.topic}|${e.qid || ''}`;
      groups[key] = groups[key] || { subtopic: e.subtopic || e.topic, viewed_answer: null, started_typing: null, submitted: null, flag: '' };
      const g = groups[key];
      if (viewed && (!g.viewed_answer || e.at > g.viewed_answer)) g.viewed_answer = e.at;
      if (typing && (!g.started_typing || e.at > g.started_typing)) g.started_typing = e.at;
      if (submitted && (!g.submitted || e.at > g.submitted)) g.submitted = e.at;
    }
    const tl = Object.values(groups).map(g => {
      let flag = 'IN_PROGRESS';
      if (g.viewed_answer && g.started_typing && g.viewed_answer < g.started_typing) flag = 'VIEWED_BEFORE_ATTEMPT';
      else if (g.viewed_answer && g.submitted &&
        (new Date(g.submitted).getTime() - new Date(g.viewed_answer).getTime()) / 1000 < 15) flag = 'COPIED';
      else if (g.submitted) flag = 'GENUINE';
      return { ...g, flag };
    });
    tl.sort((a, b) => ((b.submitted || b.viewed_answer || '') < (a.submitted || a.viewed_answer || '') ? -1 : 1));
    setTimeline(tl);
  };

  const badge = (flag: string) =>
    flag === 'COPIED' ? '🚩 COPIED' :
    flag === 'VIEWED_BEFORE_ATTEMPT' ? '⚠️ Viewed before attempting' :
    flag === 'GENUINE' ? '✅ Genuine' : '…';
  const badgeCls = (flag: string) =>
    flag === 'COPIED' ? 'bg-red-100 text-red-700' :
    flag === 'VIEWED_BEFORE_ATTEMPT' ? 'bg-amber-100 text-amber-700' :
    'bg-green-100 text-green-700';

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="font-black mb-2">Speed-guessing alerts (5+ answers &lt; 15s total, last 24h)</h2>
        {guessers.length === 0 && <p className="text-sm text-surface-faint">None right now. 🎉</p>}
        {guessers.map((g, i) => (
          <div key={i} className="text-sm py-1">🚩 <b>{g.display_name}</b> — {g.n_questions} questions in {g.total_seconds}s → flagged “Guessing”</div>
        ))}
      </div>

      <div className="card">
        <h2 className="font-black mb-2">Notes cheating timeline</h2>
        <select className="input mb-3 max-w-xs" value={sel?.user_id || ''}
          onChange={e => { const s = students.find(x => x.user_id === e.target.value); if (s) pick(s); }}>
          <option value="">Select student…</option>
          {students.map(s => <option key={s.user_id} value={s.user_id}>{s.display_name}</option>)}
        </select>
        {sel && randomGuess >= 3 && (
          <div className="mb-3 px-3 py-2 rounded-xl bg-orange-100 text-orange-700 text-sm font-bold">
            ⚠️ Random Guessing pattern: {randomGuess} answers under 3 seconds and wrong.
          </div>
        )}
        {sel && (
          <table className="w-full">
            <thead><tr><th className="th">Subtopic</th><th className="th">Viewed</th><th className="th">Typed</th><th className="th">Submitted</th><th className="th">Verdict</th></tr></thead>
            <tbody>
              {timeline.map((t, i) => (
                <tr key={i}>
                  <td className="td">{t.subtopic}</td>
                  <td className="td text-xs">{t.viewed_answer ? new Date(t.viewed_answer).toLocaleTimeString() : '—'}</td>
                  <td className="td text-xs">{t.started_typing ? new Date(t.started_typing).toLocaleTimeString() : '—'}</td>
                  <td className="td text-xs">{t.submitted ? new Date(t.submitted).toLocaleTimeString() : '—'}</td>
                  <td className="td"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${badgeCls(t.flag)}`}>{badge(t.flag)}</span></td>
                </tr>
              ))}
              {!timeline.length && <tr><td className="td text-surface-faint" colSpan={5}>No view/typing/submit events for this student.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
