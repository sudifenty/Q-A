import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setBusy(true); setError('');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { console.log('LOGIN ERROR', error); setError(error.message); setBusy(false); return; }
    console.log('LOGIN SUCCESS', data);
    // role check happens in App on session change; non-admins land back here.
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-sm">
        <h1 className="text-xl font-black mb-1">SmartPle Admin</h1>
        <p className="text-sm text-surface-muted mb-4">Admin accounts only.</p>
        <input className="input mb-2" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <input className="input mb-3" type="password" placeholder="Password" value={password}
               onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && signIn()} />
        {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
        <button className="btn-p w-full" disabled={busy} onClick={signIn}>Sign in</button>
      </div>
    </div>
  );
}
