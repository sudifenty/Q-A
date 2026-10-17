import { useEffect, useMemo, useState } from 'react';
import { supabase, Profile } from '../lib/supabase';

type Setting = {
  user_id: string;
  enabled: boolean;
  target_per_day: number;
  grade: string;
  subject: string;
  updated_at?: string;
};
type Assignment = {
  id: string;
  user_id: string;
  set_number: number;
  assigned_date: string;
  requested_target: number;
  target_count: number;
  completed_count: number;
  status: 'active' | 'completed';
  completed_at: string | null;
};
type AssignmentItem = {
  question_id: string;
  position: number;
  completed_at: string | null;
  grade?: string;
  subject?: string;
  topic?: string;
  prompt?: string;
  answer?: string;
};
type BankQuestion = { id: string; grade: string; subject: string; is_active: boolean };
type Draft = { enabled: boolean; target_per_day: string; grade: string; subject: string };

const asLocalDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const displayName = (s: Profile) => s.display_name || s.full_name || s.user_id.slice(0, 8);
const latestFor = (rows: Assignment[], userId: string) => rows
  .filter(a => a.user_id === userId)
  .sort((a, b) => b.set_number - a.set_number)[0] || null;

export default function DailyQA() {
  const [students, setStudents] = useState<Profile[]>([]);
  const [settings, setSettings] = useState<Setting[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [bank, setBank] = useState<BankQuestion[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [items, setItems] = useState<AssignmentItem[]>([]);
  const [bankRemaining, setBankRemaining] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>({ enabled: false, target_per_day: '20', grade: 'P4', subject: 'Science' });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    const [studentRes, settingsRes, assignmentRes, bankRes] = await Promise.all([
      supabase.from('smartple_profiles').select('user_id,display_name,class,role').eq('role', 'student').limit(1000),
      supabase.from('daily_qa_settings').select('*').limit(1000),
      supabase.from('daily_qa_assignments').select('*').order('set_number', { ascending: false }).limit(5000),
      supabase.from('daily_qa_questions').select('id,grade,subject,is_active').limit(5000)
    ]);
    if (studentRes.error) setError(`Could not load student accounts: ${studentRes.error.message}`);
    else setStudents(((studentRes.data as Profile[]) || []).filter(s => !!s.user_id));
    if (settingsRes.error || assignmentRes.error || bankRes.error) {
      const e = settingsRes.error || assignmentRes.error || bankRes.error;
      setError(`Daily Q&A tables are not ready yet. Run supabase/daily_qa.sql, then supabase/seed_daily_qa.sql. ${e?.message || ''}`.trim());
    }
    setSettings((settingsRes.data as Setting[]) || []);
    setAssignments((assignmentRes.data as Assignment[]) || []);
    setBank((bankRes.data as BankQuestion[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const selected = useMemo(() => students.find(s => s.user_id === selectedId) || null, [students, selectedId]);
  const availableBanks = useMemo(() => {
    const pairs = new Map<string, { grade: string; subject: string }>();
    for (const q of bank) if (q.is_active) pairs.set(`${q.grade}|${q.subject}`, { grade: q.grade, subject: q.subject });
    return [...pairs.values()].sort((a, b) => `${a.grade} ${a.subject}`.localeCompare(`${b.grade} ${b.subject}`));
  }, [bank]);
  const setting = useMemo(() => settings.find(s => s.user_id === selectedId) || null, [settings, selectedId]);
  const latest = useMemo(() => selectedId ? latestFor(assignments, selectedId) : null, [assignments, selectedId]);
  const filteredStudents = useMemo(() => students.filter(s => {
    const text = `${displayName(s)} ${s.class || ''} ${s.user_id}`.toLowerCase();
    return !search.trim() || text.includes(search.trim().toLowerCase());
  }), [students, search]);

  useEffect(() => {
    if (!selectedId) {
      setItems([]);
      setBankRemaining(null);
      return;
    }
    const chosenSetting = setting;
    setDraft({
      enabled: chosenSetting?.enabled ?? false,
      target_per_day: String(chosenSetting?.target_per_day ?? 20),
      grade: chosenSetting?.grade ?? availableBanks[0]?.grade ?? 'P4',
      subject: chosenSetting?.subject ?? availableBanks[0]?.subject ?? 'Science'
    });
  }, [selectedId, setting, availableBanks]);

  useEffect(() => {
    if (!selectedId) {
      setItems([]);
      setBankRemaining(null);
      return;
    }
    let live = true;
    setDetailLoading(Boolean(latest));
    (async () => {
      let joined: AssignmentItem[] = [];
      if (latest) {
        const itemRes = await supabase.from('daily_qa_assignment_items')
          .select('question_id,position,completed_at')
          .eq('assignment_id', latest.id).order('position', { ascending: true });
        if (itemRes.error) throw itemRes.error;
        const rows = (itemRes.data as AssignmentItem[]) || [];
        const questionIds = rows.map(r => r.question_id);
        const questionRes = questionIds.length
          ? await supabase.from('daily_qa_questions').select('id,grade,subject,topic,prompt,answer').in('id', questionIds)
          : { data: [], error: null } as any;
        if (questionRes.error) throw questionRes.error;
        const questionById = new Map(((questionRes.data as any[]) || []).map(q => [q.id, q]));
        joined = rows.map(r => ({ ...r, ...questionById.get(r.question_id) }))
          .sort((a, b) => a.position - b.position) as AssignmentItem[];
      }

      const usedAssignments = await supabase.from('daily_qa_assignments')
        .select('id').eq('user_id', selectedId).limit(5000);
      if (usedAssignments.error) throw usedAssignments.error;
      const activeIds = bank.filter(q => q.is_active && q.grade === draft.grade && q.subject === draft.subject).map(q => q.id);
      const assignmentIds = ((usedAssignments.data as { id: string }[]) || []).map(a => a.id);
      let remaining = 0;
      if (activeIds.length && assignmentIds.length) {
        const usedRes = await supabase.from('daily_qa_assignment_items').select('question_id')
          .in('assignment_id', assignmentIds).limit(10000);
        if (usedRes.error) throw usedRes.error;
        const used = new Set(((usedRes.data as { question_id: string }[]) || []).map(r => r.question_id));
        remaining = activeIds.filter(id => !used.has(id)).length;
      } else if (activeIds.length) {
        remaining = activeIds.length;
      }
      if (live) {
        setItems(joined);
        setBankRemaining(remaining);
        setDetailLoading(false);
      }
    })().catch((e: any) => {
      if (live) {
        setItems([]);
        setDetailLoading(false);
        setError(`Could not load this student's Q&A progress: ${e?.message || e}`);
      }
    });
    return () => { live = false; };
  }, [selectedId, latest?.id, bank, draft.grade, draft.subject]);

  const chooseStudent = (s: Profile) => setSelectedId(s.user_id);
  const patch = (p: Partial<Draft>) => setDraft(current => ({ ...current, ...p }));

  const save = async () => {
    if (!selected) return;
    const target = Number(draft.target_per_day);
    if (!Number.isInteger(target) || target < 1 || target > 500) {
      setError('Daily target must be a whole number from 1 to 500.');
      return;
    }
    if (!draft.grade || !draft.subject) {
      setError('Choose an active question bank first.');
      return;
    }
    setSaving(true);
    setError('');
    setFlash('');
    const { data: { user } } = await supabase.auth.getUser();
    const { error: saveError } = await supabase.from('daily_qa_settings').upsert({
      user_id: selected.user_id,
      enabled: draft.enabled,
      target_per_day: target,
      grade: draft.grade,
      subject: draft.subject,
      updated_by: user?.id || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
    setSaving(false);
    if (saveError) { setError(`Could not save this student's daily plan: ${saveError.message}`); return; }
    setSettings(rows => {
      const next = { user_id: selected.user_id, enabled: draft.enabled, target_per_day: target, grade: draft.grade, subject: draft.subject } as Setting;
      return [...rows.filter(r => r.user_id !== selected.user_id), next];
    });
    setFlash(`${displayName(selected)}’s daily Q&A plan has been saved.`);
    setTimeout(() => setFlash(''), 3500);
    await load();
  };

  const statusFor = (s: Profile) => {
    const cfg = settings.find(x => x.user_id === s.user_id);
    const a = latestFor(assignments, s.user_id);
    if (!cfg?.enabled) return { text: 'Paused', style: 'bg-surface-sunken text-surface-muted' };
    if (a?.status === 'active') return { text: `${a.completed_count}/${a.target_count}`, style: 'bg-amber-100 text-amber-800' };
    if (a?.status === 'completed' && a.assigned_date === asLocalDate()) return { text: 'Done today', style: 'bg-green-100 text-green-700' };
    return { text: 'Enabled', style: 'bg-blue-100 text-blue-700' };
  };

  const currentStatus = () => {
    if (!setting?.enabled) return 'Paused by admin';
    if (bankRemaining === 0) return 'Question bank exhausted';
    if (!latest) return 'Waiting for student to open the app';
    if (latest.status === 'active') return `In progress · ${latest.completed_count} of ${latest.target_count}`;
    if (latest.assigned_date === asLocalDate()) return 'Completed today';
    return 'Ready for the next daily set';
  };

  const bankTotal = bank.filter(q => q.is_active && q.grade === draft.grade && q.subject === draft.subject).length;
  const currentSetComplete = latest?.status === 'completed';

  return (
    <div className="grid gap-4 lg:grid-cols-[290px,minmax(0,1fr)]">
      <section className="card p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="font-black text-lg">Daily Q&amp;A</h2>
            <p className="text-xs text-surface-muted">Student plans and set progress</p>
          </div>
          <button className="btn-s !px-3 !py-2 text-xs" onClick={load} disabled={loading}>↻ Refresh</button>
        </div>
        <input className="input mb-2" placeholder="Search student…" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="max-h-[65vh] overflow-auto space-y-1">
          {loading && <p className="p-3 text-sm text-surface-muted">Loading students…</p>}
          {!loading && filteredStudents.map(s => {
            const tag = statusFor(s);
            return (
              <button key={s.user_id} onClick={() => chooseStudent(s)}
                className={`w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-left transition ${selectedId === s.user_id ? 'bg-brand-50 ring-1 ring-brand-200 dark:bg-brand-900/30 dark:ring-brand-700' : 'hover:bg-surface-sunken'}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-surface-ink">{displayName(s)}</span>
                  <span className="block truncate text-[11px] text-surface-faint">{s.class || 'Class not set'}</span>
                </span>
                <span className={`rounded-full px-2 py-1 text-[10px] font-extrabold whitespace-nowrap ${tag.style}`}>{tag.text}</span>
              </button>
            );
          })}
          {!loading && !filteredStudents.length && <p className="p-3 text-sm text-surface-muted">No matching students.</p>}
        </div>
      </section>

      <section className="space-y-4">
        {error && <div className="card border border-red-200 bg-red-50 text-sm text-red-800">{error}</div>}
        {flash && <div className="card border border-green-200 bg-green-50 text-sm font-bold text-green-800">✓ {flash}</div>}
        {!selected && <div className="card text-sm text-surface-muted">Choose a student to set their daily question target and see completion.</div>}
        {selected && (
          <>
            <div className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs uppercase tracking-widest font-black text-brand-700 dark:text-brand-300">Per-student plan</p>
                  <h2 className="text-xl font-black mt-1">{displayName(selected)}</h2>
                  <p className="text-xs text-surface-muted mt-1">{selected.class || 'Class not set'} · {selected.user_id}</p>
                </div>
                <span className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${draft.enabled ? 'bg-green-100 text-green-700' : 'bg-surface-sunken text-surface-muted'}`}>
                  {draft.enabled ? '● Active' : 'Ⅱ Paused'}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-surface-muted">Questions per set</span>
                  <input className="input w-full" type="number" min="1" max="500" step="1" value={draft.target_per_day}
                    onChange={e => patch({ target_per_day: e.target.value })} />
                  <span className="mt-1 block text-[10px] text-surface-faint">Default is 20. Takes effect on the next set.</span>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-surface-muted">Question bank</span>
                  <select className="input w-full" value={`${draft.grade}|${draft.subject}`} onChange={e => {
                    const [grade, subject] = e.target.value.split('|');
                    patch({ grade, subject });
                  }}>
                    {availableBanks.map(b => <option key={`${b.grade}|${b.subject}`} value={`${b.grade}|${b.subject}`}>{b.grade} · {b.subject}</option>)}
                    {!availableBanks.length && <option value="P4|Science">P4 · Science (no questions imported)</option>}
                  </select>
                  <span className="mt-1 block text-[10px] text-surface-faint">Only active question banks are listed.</span>
                </label>
                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-3 rounded-xl border border-surface-line bg-surface-raised px-3 py-3 cursor-pointer">
                    <input type="checkbox" checked={draft.enabled} onChange={e => patch({ enabled: e.target.checked })} className="h-4 w-4 accent-emerald-600" />
                    <span>
                      <span className="block text-sm font-extrabold">Daily plan active</span>
                      <span className="block text-[10px] text-surface-muted">Turn off to pause this student</span>
                    </span>
                  </label>
                </div>
              </div>
              {latest?.status === 'active' && Number(draft.target_per_day) !== latest.requested_target && (
                <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  This set is already in progress and keeps its original target of {latest.requested_target} questions. The new target applies to the next set.
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button className="btn-p" onClick={save} disabled={saving || !availableBanks.length}>
                  {saving ? 'Saving…' : 'Save daily plan'}
                </button>
                <span className="text-xs text-surface-faint">Default daily target: 20 questions</span>
              </div>
            </div>

            <div className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-widest font-black text-surface-muted">Latest set</p>
                  <h3 className="text-lg font-black mt-1">{currentStatus()}</h3>
                  {latest && <p className="text-xs text-surface-muted mt-1">Set {latest.set_number} · assigned {latest.assigned_date} · {latest.completed_count}/{latest.target_count} completed</p>}
                </div>
                <div className="rounded-xl bg-surface-sunken px-3 py-2 text-right">
                  <div className="text-xl font-black">{bankRemaining === null ? '—' : bankRemaining}</div>
                  <div className="text-[10px] text-surface-muted">of {bankTotal} bank questions remaining</div>
                </div>
              </div>
              {bankRemaining === 0 && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">Question bank exhausted for this student. Add more Q&amp;A items before the next set can start.</div>}
              {!latest && setting?.enabled && bankTotal > 0 && <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">The set is created when the student opens the Daily Q&amp;A app.</p>}
              {detailLoading && <p className="mt-4 text-sm text-surface-muted">Loading question progress…</p>}
              {!detailLoading && latest && (
                <div className="mt-4 divide-y divide-surface-line rounded-xl border border-surface-line overflow-hidden">
                  {items.map(item => (
                    <div key={item.question_id} className="flex items-start gap-3 p-3 sm:p-3.5">
                      <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-black ${item.completed_at ? 'bg-green-100 text-green-700' : 'bg-surface-sunken text-surface-muted'}`}>
                        {item.completed_at ? '✓' : item.position}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[10px] font-bold uppercase tracking-wide text-surface-faint">{item.topic || selected.class || 'Question'} · {item.question_id}</span>
                        <span className="mt-1 block text-sm font-bold text-surface-ink">{item.prompt}</span>
                        {item.answer && <span className="mt-1 block text-xs leading-relaxed text-surface-muted"><b>Answer:</b> {item.answer}</span>}
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-extrabold ${item.completed_at ? 'bg-green-100 text-green-700' : 'bg-surface-sunken text-surface-muted'}`}>
                        {item.completed_at ? 'Studied' : 'Not yet'}
                      </span>
                    </div>
                  ))}
                  {!items.length && <div className="p-4 text-sm text-surface-muted">No questions have been assigned yet.</div>}
                </div>
              )}
              {currentSetComplete && <p className="mt-3 text-xs font-bold text-green-700">✓ All questions in this set were marked studied. The admin can see the completion timestamp.</p>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
