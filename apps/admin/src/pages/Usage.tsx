import { useEffect, useState } from 'react';
import { supabase, Profile } from '../lib/supabase';
import { fetchEvents, eventsFor, fetchLastSeen } from '../lib/events';

/**
 * Usage — derived from learning_events (the old smartple_usage table is gone):
 * activity per day over the last 7 days + last seen timestamp.
 */
export default function Usage() {
  const [students, setStudents] = useState<Profile[]>([]);
  const [sel, setSel] = useState<Profile | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [lastSeen, setLastSeen] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const [{ data: p }, evts, ls] = await Promise.all([
        supabase.from('smartple_profiles').select('*').eq('role', 'student'),
        fetchEvents(),
        fetchLastSeen()
      ]);
      setStudents(((p as Profile[]) || []).filter(s => !!s.user_id));
      setEvents(evts);
      setLastSeen(ls);
    })();
  }, []);

  const days: { d: string; n: number }[] = [];
  const mine = sel ? eventsFor(events, sel.user_id) : [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    days.push({ d, n: mine.filter(e => e.at.slice(0, 10) === d).length });
  }
  const today = days[days.length - 1];
  const max = Math.max(1, ...days.map(x => x.n));
  const seen = sel ? (lastSeen[sel.user_id] || mine[0]?.at) : null;

  return (
    <div className="card">
      <h2 className="font-black mb-2">Usage — activity per day (from learning events)</h2>
      <select className="input mb-4 max-w-xs" value={sel?.user_id || ''}
        onChange={e => setSel(students.find(s => s.user_id === e.target.value) || null)}>
        <option value="">Select student…</option>
        {students.map(s => <option key={s.user_id} value={s.user_id}>{s.display_name}</option>)}
      </select>
      {sel && (
        <>
          <div className="flex gap-4 mb-4 text-sm flex-wrap">
            <div className="px-3 py-2 rounded-xl bg-brand-50 dark:bg-brand-900/30"><b>Today:</b> {today.n} answer{today.n === 1 ? '' : 's'}</div>
            <div className="px-3 py-2 rounded-xl bg-green-50">
              Last seen: {seen ? new Date(seen).toLocaleString() : 'never'}
            </div>
            <a className="px-3 py-2 rounded-xl bg-surface-ink text-surface-page" href={`#/parent/${sel.user_id}`}>Parent view ↗</a>
          </div>
          <div className="flex items-end gap-2 h-40">
            {days.map(x => (
              <div key={x.d} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col justify-end" style={{ height: '120px' }}>
                  <div className="w-full bg-brand-50 dark:bg-brand-900/300 rounded-t" style={{ height: `${(x.n / max) * 100}%` }} title={`${x.n} answers`} />
                </div>
                <span className="text-[10px] text-surface-faint">{x.d.slice(5)}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-surface-faint mt-2">Bars = answers recorded per day in learning_events.</p>
        </>
      )}
    </div>
  );
}
