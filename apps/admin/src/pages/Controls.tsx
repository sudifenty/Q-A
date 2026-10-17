import { useEffect, useState } from 'react';
import { supabase, Profile, Assignment } from '../lib/supabase';
import topicManifest from '../data/topicManifest.json';

/* The topics and subtopics a teacher can lock a learner into.

   Sourced from the notes corpus the student app ships, via topicManifest.json.
   NOT from revisionBank.json: that bank only carries topics whose revision
   questions parse as numbered lists, so a topic written with bullets vanished
   from the picker (P.6 SST offered 2 of its 5 topics). And not from the
   `questions` table either — it is empty, which is why the original dropdown
   never offered anything at all. */
type BankTopic = {
  level: string; subject_code: string; topic: string;
  topic_id?: string; subtopics?: string[];
};
const BANK = ((topicManifest as any).items || []) as BankTopic[];
/* the phone's subject labels are not the bank's subject codes */
const CODE: Record<string, string> = { Math: 'MATH', SST: 'SST', English: 'ENG', Science: 'SCI' };
const topicsFor = (cls: string | null, subj: string | null) =>
  BANK.filter(b => (!cls || b.level === cls) && (!subj || b.subject_code === (CODE[subj] || subj)));

const CLASSES = ['P4', 'P5', 'P6', 'P7'];
const TIERS = [1, 2, 3, 4, 5];

const EMPTY = (uid: string): Assignment => ({
  user_id: uid, forced_class: null, forced_subject: null, forced_topic: null,
  forced_subtopic: null, forced_tier: null,
  allow_notes: true, allow_practice_with_answers: true,
  allow_practice_no_answers: true, note: null
});

export default function Controls() {
  const [students, setStudents] = useState<Profile[]>([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Profile | null>(null);
  const [a, setA] = useState<Assignment | null>(null);
  /* which topic's subtopics are open in the picker */
  const [openTopic, setOpenTopic] = useState<string | null>(null);
  const [lockOpen, setLockOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase.from('smartple_profiles').select('*').eq('role', 'student')
      .then(({ data }) => setStudents(((data as Profile[]) || []).filter(s => !!s.user_id)));
  }, []);

  const pick = async (s: Profile) => {
    setSel(s); setSaved(false);
    const { data } = await supabase.from('smartple_assignments').select('*')
      .eq('user_id', s.user_id).limit(1);
    const row = ((data as Assignment[]) || [])[0];
    setA(row ? { ...row, note: row.note ?? null } : EMPTY(s.user_id));
  };

  const set = (patch: Partial<Assignment>) => setA(prev => prev ? { ...prev, ...patch } : prev);

  const save = async () => {
    if (!a) return;
    const payload = { ...a, updated_at: new Date().toISOString() };
    // Manual upsert: the live table's key is its own `id` column, not
    // user_id — so an on-conflict upsert targeting user_id is rejected.
    const { data: existing } = await supabase.from('smartple_assignments')
      .select('user_id').eq('user_id', a.user_id).limit(1);
    const isUpdate = !!(existing && existing.length);
    const write = (body: Record<string, unknown>) => isUpdate
      ? supabase.from('smartple_assignments').update(body).eq('user_id', a.user_id)
      : supabase.from('smartple_assignments').insert(body);
    let { error } = await write(payload);
    /* The subtopic lock needs the forced_subtopic column. Until the owner has
       run the migration, retry without it so the rest of the remote control
       still saves instead of failing outright. */
    if (error && /forced_subtopic/.test(error.message)) {
      const { forced_subtopic: _drop, ...rest } = payload;
      ({ error } = await write(rest));
      if (!error) return alert(
        'Saved — but the SUBTOPIC lock was not.\n\n' +
        'The database still needs one column. Run this in the Supabase SQL Editor:\n\n' +
        'ALTER TABLE smartple_assignments ADD COLUMN IF NOT EXISTS forced_subtopic text;'
      );
    }
    if (error) return alert(`Save FAILED — the student got nothing.\n\n${error.message}`);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const Toggle = ({ label, val, on }: { label: string; val: boolean; on: () => void }) => (
    <button onClick={on}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold ${val ? 'border-green-300 bg-green-50 text-green-700' : 'border-red-300 bg-red-50 text-red-600'}`}>
      <span>{val ? '✓' : '✕'}</span> {label}
    </button>
  );

  const list = students.filter(s => !q || (s.display_name || '').toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="grid md:grid-cols-[280px,1fr] gap-4">
      <div className="card">
        <input className="input mb-2" placeholder="Search student…" value={q} onChange={e => setQ(e.target.value)} />
        {list.map(s => (
          <button key={s.user_id} onClick={() => pick(s)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm ${sel?.user_id === s.user_id ? 'bg-brand-50 dark:bg-brand-900/30 font-bold' : 'hover:bg-surface-sunken'}`}>
            {s.display_name || (s.user_id ? s.user_id.slice(0, 8) : '(no name)')} <span className="text-surface-faint">· {s.class || '?'}</span>
          </button>
        ))}
      </div>
      <div>
        {!a && <div className="card text-surface-muted">Pick a student to control their app remotely.</div>}
        {a && sel && (
          <div className="card">
            <h2 className="font-black mb-3">{sel.display_name} — Remote Control</h2>
            <div className="flex flex-wrap gap-2 mb-4">
              <Toggle label="Notes" val={a.allow_notes} on={() => set({ allow_notes: !a.allow_notes })} />
              <Toggle label="Practice with answers" val={a.allow_practice_with_answers} on={() => set({ allow_practice_with_answers: !a.allow_practice_with_answers })} />
              <Toggle label="Practice no answers" val={a.allow_practice_no_answers} on={() => set({ allow_practice_no_answers: !a.allow_practice_no_answers })} />
            </div>
            <div className="grid sm:grid-cols-4 gap-2 mb-3">
              <select className="input" value={a.forced_class || ''}
                onChange={e => { set({ forced_class: e.target.value || null, forced_topic: null, forced_subtopic: null }); setOpenTopic(null); }}>
                <option value="">Class: (free)</option>
                {CLASSES.map(c => <option key={c} value={c}>Force {c}</option>)}
              </select>
              <select className="input" value={a.forced_subject || ''}
                onChange={e => { set({ forced_subject: e.target.value || null, forced_topic: null, forced_subtopic: null }); setOpenTopic(null); }}>
                <option value="">Subject: (free)</option>
                {['Math', 'SST', 'English', 'Science'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button className="input text-left" onClick={() => setLockOpen(true)}>
                {a.forced_subtopic
                  ? <>Locked: <b>{a.forced_subtopic}</b></>
                  : a.forced_topic
                    ? <>Locked: <b>{a.forced_topic}</b> (whole topic)</>
                    : 'Content: (free) — tap to lock a topic or subtopic'}
              </button>
              <select className="input" value={a.forced_tier || ''}
                onChange={e => set({ forced_tier: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Tier: (free)</option>
                {TIERS.map(t => <option key={t} value={t}>Force T{t}</option>)}
              </select>
            </div>
            {lockOpen && (
              <div className="border rounded-lg p-3 mb-3 bg-surface-sunken">
                <div className="flex items-center gap-2 mb-2">
                  <b className="text-sm">Lock {sel.display_name} into content</b>
                  <button className="ml-auto btn-s" onClick={() => setLockOpen(false)}>Close</button>
                </div>
                {!openTopic ? (
                  <>
                    <p className="text-xs text-surface-muted mb-2">
                      Pick a topic. You can then lock the whole topic, or one subtopic inside it.
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {topicsFor(a.forced_class, a.forced_subject).map(b => (
                        <button key={b.topic_id || b.topic} className="btn-s"
                          onClick={() => setOpenTopic(b.topic_id || b.topic)}>{b.topic}</button>
                      ))}
                      {!topicsFor(a.forced_class, a.forced_subject).length && (
                        <span className="text-xs text-surface-muted">
                          No topics under this class and subject — release the class or subject lock to browse them all.
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  (() => {
                    const b = BANK.find(x => (x.topic_id || x.topic) === openTopic);
                    const subs = (b && b.subtopics) || [];
                    const title = (b && b.topic) || openTopic;
                    return (
                      <>
                        <button className="btn-s mb-2" onClick={() => setOpenTopic(null)}>← all topics</button>
                        <b className="text-sm block mb-2">{title}</b>
                        <button className="btn-p mb-3"
                          onClick={() => { set({ forced_topic: title, forced_subtopic: null }); setLockOpen(false); }}>
                          Lock the whole topic
                        </button>
                        <p className="text-xs text-surface-muted mb-1">
                          Or lock one subtopic — they will see nothing else at all.
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {subs.map(s => (
                            <button key={s} className="btn-s"
                              onClick={() => { set({ forced_topic: title, forced_subtopic: s }); setLockOpen(false); }}>
                              {s}
                            </button>
                          ))}
                          {!subs.length && <span className="text-xs text-surface-muted">This topic has no subtopics.</span>}
                        </div>
                      </>
                    );
                  })()
                )}
                {(a.forced_topic || a.forced_subtopic) && (
                  <button className="btn-s mt-3"
                    onClick={() => { set({ forced_topic: null, forced_subtopic: null }); setOpenTopic(null); }}>
                    Release the lock — let them roam freely
                  </button>
                )}
              </div>
            )}
            <textarea className="input mb-3" rows={2} placeholder="Private note to yourself about this student…"
              value={a.note || ''} onChange={e => set({ note: e.target.value })} />
            <div className="flex items-center gap-3">
              <button className="btn-p" onClick={save}>Save</button>
              {saved && <span className="text-green-600 text-sm font-bold">Saved — student app picks this up on next fetch.</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
