import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Read-only parent share page: #/parent/<user_id>?k=<parent_code>
// The code is set by the admin: UPDATE smartple_profiles SET parent_code='123456' WHERE user_id=...
export default function Parent({ userId }: { userId: string }) {
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState('');
  const [code, setCode] = useState(new URLSearchParams(window.location.hash.split('?')[1] || '').get('k') || '');

  const load = async (k: string) => {
    const { data, error } = await supabase.rpc('parent_report', { p_user: userId, p_code: k });
    if (error) { setError(error.message); return; }
    if (!data) { setError('Wrong parent code.'); return; }
    setReport(data);
  };
  useEffect(() => { if (code) load(code); }, []);

  if (!report) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-sm">
        <h1 className="font-black mb-2">Parent view</h1>
        <input className="input mb-2" placeholder="Parent code" value={code} onChange={e => setCode(e.target.value)} />
        {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
        <button className="btn-p w-full" onClick={() => load(code)}>Open</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen p-4 max-w-md mx-auto">
      <h1 className="font-black text-lg mb-1">📚 {report.display_name} — Learning Report</h1>
      <p className="text-surface-faint text-sm mb-4">Read-only · Class {report.class || '?'}</p>
      <div className="card mb-3">
        <div className="text-3xl font-black text-brand-700 dark:text-brand-300">{report.total_minutes_today} min</div>
        <div className="text-sm text-surface-muted">studied today (offline time included)</div>
      </div>
      <div className="card mb-3">
        <h2 className="font-bold mb-2">Needs support in</h2>
        {(report.weakest || []).map((w: any, i: number) => (
          <div key={i} className="flex justify-between text-sm py-1 border-t border-surface-line">
            <span>{w.subject} · {w.topic}</span><b className="text-red-600">{w.avg_score}%</b>
          </div>
        ))}
        {!(report.weakest || []).length && <p className="text-sm text-surface-faint">No weak topics yet.</p>}
      </div>
      <p className="text-xs text-surface-faint">Share this link with the code to let a parent follow progress.</p>
    </div>
  );
}
