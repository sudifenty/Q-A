import { useState } from 'react';
import { supabase, Profile } from '../lib/supabase';
import { fetchEvents } from '../lib/events';

export default function Automations() {
  const [weak, setWeak] = useState<any[] | null>(null);
  const [students, setStudents] = useState<Profile[] | null>(null);
  const [msg, setMsg] = useState("You're doing great, keep going!");
  const [sent, setSent] = useState('');

  const scanWeak = async () => {
    // computed client-side from learning_events (old scan_weak_students RPC
    // referenced the dropped smartple_attempts table)
    const [{ data: p }, evts] = await Promise.all([
      supabase.from('smartple_profiles').select('*').eq('role', 'student'),
      fetchEvents()
    ]);
    const prof: Record<string, any> = {};
    for (const r of (p as any[]) || []) if (r.user_id) prof[r.user_id] = r;
    const acc: Record<string, { uid: string; subject: string; topic: string; sum: number; n: number }> = {};
    for (const e of evts) {
      if (e.correct === null || !e.topic) continue;
      const key = `${e.uid}|${e.subject}|${e.topic}`;
      acc[key] = acc[key] || { uid: e.uid, subject: e.subject, topic: e.topic, sum: 0, n: 0 };
      acc[key].sum += e.correct ? 100 : 0; acc[key].n += 1;
    }
    const rows = Object.values(acc)
      .map(a => {
        const avg = Math.round(a.sum / a.n);
        const pr = prof[a.uid];
        return {
          user_id: a.uid, display_name: pr?.display_name || a.uid.slice(0, 8), class: pr?.class || null,
          subject: a.subject || '—', topic: a.topic, avg_score: avg,
          suggestion: pr?.class && pr.class !== 'P4' ? 'Force to P4?' : 'Force Tier 1?'
        };
      })
      .filter(r => r.avg_score < 50)
      .sort((x, y) => x.avg_score - y.avg_score);
    setWeak(rows);
  };

  const force = async (w: any, patch: any) => {
    const payload = { user_id: w.user_id, ...patch, updated_at: new Date().toISOString() };
    // manual upsert (the table's key is `id`, not user_id — see Controls.tsx)
    const { data: existing } = await supabase.from('smartple_assignments')
      .select('user_id').eq('user_id', w.user_id).limit(1);
    const { error } = (existing && existing.length)
      ? await supabase.from('smartple_assignments').update(payload).eq('user_id', w.user_id)
      : await supabase.from('smartple_assignments').insert(payload);
    if (error) return alert('Save failed: ' + error.message);
    alert('Saved to remote control.');
  };

  const loadStudents = async () => {
    if (!students) {
      const { data } = await supabase.from('smartple_profiles').select('*').eq('role', 'student');
      setStudents((data as Profile[]) || []);
    }
  };

  const nudge = async () => {
    loadStudents();
    const uid = (document.getElementById('nudgeStudent') as HTMLSelectElement)?.value;
    if (!uid) return alert('Pick a student.');
    const { error } = await supabase.from('smartple_nudges').insert({ user_id: uid, message: msg });
    if (error) return alert(error.message);
    setSent('Nudge sent — pops up in the student app.');
    setTimeout(() => setSent(''), 2500);
  };

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center gap-3 mb-2">
          <h2 className="font-black">Auto-detect weak students</h2>
          <button className="btn-p" onClick={scanWeak}>Scan Weak Students</button>
        </div>
        <p className="text-xs text-surface-faint mb-2">avg &lt; 50% per topic, with a one-tap suggestion.</p>
        {weak && (
          <table className="w-full">
            <thead><tr><th className="th">Student</th><th className="th">Class</th><th className="th">Topic</th><th className="th">Avg</th><th className="th">Suggestion</th><th className="th"></th></tr></thead>
            <tbody>
              {weak.map((w, i) => (
                <tr key={i}>
                  <td className="td">{w.display_name}</td><td className="td">{w.class || '?'}</td>
                  <td className="td">{w.subject} · {w.topic}</td>
                  <td className="td font-bold text-red-600">{w.avg_score}%</td>
                  <td className="td">{w.suggestion}</td>
                  <td className="td text-right whitespace-nowrap">
                    <button className="text-xs underline mr-2" onClick={() => force(w, { forced_class: 'P4' })}>Force P4</button>
                    <button className="text-xs underline" onClick={() => force(w, { forced_tier: 1, forced_topic: w.topic })}>Force T1</button>
                  </td>
                </tr>
              ))}
              {!weak.length && <tr><td className="td text-surface-faint" colSpan={6}>Nobody below 50%. 🎉</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2 className="font-black mb-2">Send a nudge 💬</h2>
        <div className="flex flex-wrap gap-2">
          <select id="nudgeStudent" className="input max-w-xs" onFocus={loadStudents}>
            <option value="">Pick student…</option>
            {(students || []).map(s => <option key={s.user_id} value={s.user_id}>{s.display_name}</option>)}
          </select>
          <input className="input flex-1 min-w-[200px]" value={msg} onChange={e => setMsg(e.target.value)} />
          <button className="btn-p" onClick={nudge}>Send</button>
        </div>
        {sent && <p className="text-green-600 text-sm font-bold mt-2">{sent}</p>}
      </div>
    </div>
  );
}
