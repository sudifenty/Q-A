import { useState } from 'react';
import { registerStudent, RegisterResult, todayISO } from '../lib/students';

/* =============================================================================
   Register New Student

   Replaces typing students into the SQL editor. Everything here is one API
   call per action, and every write is refused by the database unless the
   signed-in user is an admin.
   ========================================================================== */

const CLASSES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'];
const DAY_OPTIONS = [30, 60, 90, 180, 365];

type Form = {
  full_name: string; age: string; klass: string;
  guardian_name: string; guardian_contact: string; address: string;
  registered_on: string; days: string;
};

const blank = (): Form => ({
  full_name: '', age: '', klass: 'P4', guardian_name: '',
  guardian_contact: '', address: '', registered_on: todayISO(), days: '30'
});

export default function Register() {
  const [f, setF] = useState<Form>(blank);
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<RegisterResult | null>(null);
  const [copied, setCopied] = useState('');

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF(s => ({ ...s, [k]: e.target.value }));

  const submit = async () => {
    setErr('');
    if (!f.full_name.trim()) return setErr('The student needs a name.');
    setBusy(true);
    try {
      const r = await registerStudent({
        full_name: f.full_name.trim(),
        age: f.age ? Number(f.age) : null,
        klass: f.klass || null,
        guardian_name: f.guardian_name.trim() || null,
        guardian_contact: f.guardian_contact.trim() || null,
        address: f.address.trim() || null,
        registered_on: f.registered_on || null,
        days: f.days ? Number(f.days) : null,
        photo
      });
      setDone(r);
      setF(blank());
      setPhoto(null);
    } catch (e: any) {
      setErr(e?.message || 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (label: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(''), 1500); }
    catch { setCopied(''); }
  };

  /* ---- the credentials card is the whole point of the page --------------- */
  if (done) return (
    <div className="max-w-xl mx-auto">
      <div className="card border-green-300 bg-green-50">
        <h2 className="font-black text-green-800 mb-1">✓ Student registered</h2>
        <p className="text-sm text-green-900 mb-3">
          Write these down now — the password is generated for you and is
          <b> never stored anywhere</b>, so it cannot be looked up later.
        </p>
        <dl className="text-sm space-y-2">
          {([['Student ID', done.student_id], ['Login email', done.email], ['Password', done.password]] as const).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <dt className="w-24 text-green-800 font-semibold">{k}</dt>
              <dd className="font-mono bg-surface-raised border rounded px-2 py-1 flex-1 break-all">{v}</dd>
              <button className="btn-s" onClick={() => copy(k, v)}>{copied === k ? '✓' : 'Copy'}</button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <dt className="w-24 text-green-800 font-semibold">Access until</dt>
            <dd className="font-mono bg-surface-raised border rounded px-2 py-1 flex-1">
              {done.end_date || 'no expiry'}
            </dd>
          </div>
        </dl>
        <button className="btn-p mt-4" onClick={() => setDone(null)}>Register another student</button>
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto">
      <div className="card">
        <h2 className="font-black text-lg mb-1">Register New Student</h2>
        <p className="text-sm text-surface-muted mb-4">
          Creates their login, their profile and their subscription in one go. No SQL.
        </p>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block sm:col-span-2">
            <span className="text-xs font-bold text-surface-muted">Full name *</span>
            <input className="input" value={f.full_name} onChange={set('full_name')} placeholder="e.g. Nakato Sarah" />
          </label>

          <label className="block">
            <span className="text-xs font-bold text-surface-muted">Age</span>
            <input className="input" type="number" min={4} max={20} value={f.age} onChange={set('age')} placeholder="10" />
          </label>

          <label className="block">
            <span className="text-xs font-bold text-surface-muted">Class</span>
            <select className="input" value={f.klass} onChange={set('klass')}>
              {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-bold text-surface-muted">Guardian name</span>
            <input className="input" value={f.guardian_name} onChange={set('guardian_name')} />
          </label>

          <label className="block">
            <span className="text-xs font-bold text-surface-muted">Guardian contact</span>
            <input className="input" type="tel" value={f.guardian_contact} onChange={set('guardian_contact')} placeholder="07xx xxx xxx" />
          </label>

          <label className="block sm:col-span-2">
            <span className="text-xs font-bold text-surface-muted">Address</span>
            <textarea className="input" rows={2} value={f.address} onChange={set('address')} />
          </label>

          <label className="block">
            <span className="text-xs font-bold text-surface-muted">Registration date</span>
            <input className="input" type="date" value={f.registered_on} onChange={set('registered_on')} />
          </label>

          <label className="block">
            <span className="text-xs font-bold text-surface-muted">Photo</span>
            <input className="input" type="file" accept="image/jpeg,image/png,image/webp"
              onChange={e => setPhoto(e.target.files?.[0] || null)} />
          </label>
        </div>

        {/* ---- subscription ------------------------------------------------ */}
        <div className="mt-4 border-t pt-3">
          <span className="text-xs font-bold text-surface-muted block mb-1">Paid for</span>
          <div className="flex flex-wrap gap-1">
            {DAY_OPTIONS.map(d => (
              <button key={d} type="button"
                className={`px-3 py-1.5 rounded-lg text-sm font-bold border ${f.days === String(d) ? 'bg-brand-600 text-white border-brand-600' : 'bg-surface-raised text-surface-muted'}`}
                onClick={() => setF(s => ({ ...s, days: String(d) }))}>
                {d} days
              </button>
            ))}
            <button type="button"
              className={`px-3 py-1.5 rounded-lg text-sm font-bold border ${f.days === '' ? 'bg-surface-ink text-surface-page border-surface-ink' : 'bg-surface-raised text-surface-muted'}`}
              onClick={() => setF(s => ({ ...s, days: '' }))}>
              No expiry
            </button>
          </div>
          <p className="text-xs text-surface-muted mt-2">
            Access starts on the registration date and runs to{' '}
            <b>{f.registered_on && f.days
              ? new Date(new Date(f.registered_on).getTime() + Number(f.days) * 86400000).toISOString().slice(0, 10)
              : 'no end date'}</b>.
          </p>
        </div>

        {err && <div className="mt-3 text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded p-2">{err}</div>}

        <div className="flex items-center gap-3 mt-4">
          <button className="btn-p" onClick={submit} disabled={busy}>
            {busy ? 'Registering…' : 'Register'}
          </button>
          {photo && <span className="text-xs text-surface-muted">Photo ready: {photo.name}</span>}
        </div>
      </div>
    </div>
  );
}
