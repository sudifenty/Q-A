import { supabase } from './supabase';

/**
 * New-schema data access for the student app:
 *   questions       → SQ rows (the old smartple_questions)
 *   learning_events → answer/note event writes (the old smartple_attempts + note_events)
 *   profiles        → last_seen heartbeat
 * All column mapping is defensive (the tables were created outside this repo)
 * and all filtering happens client-side, so a wrong column guess can never
 * break a screen. Event writes cascade through column-set fallbacks.
 */

export const pick = (r: any, keys: string[]): any => {
  for (const k of keys) if (r?.[k] !== undefined && r?.[k] !== null) return r[k];
  return undefined;
};

const normOptions = (o: any): string[] | null => {
  if (Array.isArray(o)) return o.map(x => String(x));
  if (typeof o === 'string') {
    try { const p = JSON.parse(o); return Array.isArray(p) ? p.map(String) : null; }
    catch { return o ? [o] : null; }
  }
  return null;
};

export type SQ = {
  id: any; klass: string; subject: string; topic: string; subtopic: string | null;
  tier: number; kind: 'mcq' | 'typed'; prompt: string; options: string[] | null;
  answer: string; explain: string | null;
};

export function toSQ(r: any): SQ {
  const options = normOptions(pick(r, ['options', 'choices']));
  const kindRaw = String(pick(r, ['kind', 'type', 'question_type']) ?? '');
  const kind: 'mcq' | 'typed' =
    kindRaw.includes('typed') ? 'typed' : (options && options.length ? 'mcq' : 'typed');
  return {
    id: r.id,
    klass: String(pick(r, ['class', 'class_level', 'grade']) ?? ''),
    subject: String(pick(r, ['subject', 'subject_name']) ?? ''),
    topic: String(pick(r, ['topic', 'topic_name']) ?? ''),
    subtopic: pick(r, ['subtopic', 'sub_topic']) != null ? String(pick(r, ['subtopic', 'sub_topic'])) : null,
    tier: Number(pick(r, ['tier', 'level', 'difficulty']) ?? 1) || 1,
    kind,
    prompt: String(pick(r, ['prompt', 'question', 'text', 'body']) ?? ''),
    options,
    answer: String(pick(r, ['answer', 'correct_answer', 'answer_text']) ?? ''),
    explain: pick(r, ['explain', 'explanation']) != null ? String(pick(r, ['explain', 'explanation'])) : null
  };
}

export async function fetchQuestionsFor(f: {
  klass?: string | null; subject?: string | null; topic?: string | null;
  subtopic?: string | null; tier?: number | null; kind?: 'mcq' | 'typed' | null;
} = {}): Promise<SQ[]> {
  const { data } = await supabase.from('questions').select('*').limit(1000);
  let qs = ((data as any[]) || []).map(toSQ);
  if (f.klass) qs = qs.filter(q => !q.klass || q.klass === f.klass);
  if (f.subject) qs = qs.filter(q => !q.subject || q.subject === f.subject);
  if (f.topic) qs = qs.filter(q => q.topic === f.topic);
  if (f.tier) qs = qs.filter(q => q.tier === f.tier);
  if (f.kind === 'mcq') qs = qs.filter(q => q.kind === 'mcq' && q.options?.length);
  if (f.kind === 'typed') qs = qs.filter(q => q.kind === 'typed' || !q.options?.length);
  return qs;
}

export type EventInput = {
  questionId?: any; subject?: string | null; topic?: string | null;
  subtopic?: string | null; tier?: number | null; correct?: boolean | null;
  skipped?: boolean; seconds?: number | null; type?: string;
};

/** Write one event to learning_events, cascading through column-set fallbacks. */
export async function logEvent(e: EventInput): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) return;
    const attempts: any[] = [
      {
        user_id: uid, question_id: e.questionId ?? null, subject: e.subject ?? null,
        topic: e.topic ?? null, subtopic: e.subtopic ?? null, tier: e.tier ?? null,
        is_correct: e.correct ?? null, skipped: !!e.skipped,
        time_spent_seconds: e.seconds ?? null, event_type: e.type ?? 'answer'
      },
      { user_id: uid, topic: e.topic ?? null, is_correct: e.correct ?? null, event_type: e.type ?? 'answer' },
      { user_id: uid, event_type: e.type ?? 'answer' },
      { user_id: uid },
      { student_id: uid }
    ];
    for (const row of attempts) {
      const { error } = await supabase.from('learning_events').insert(row);
      if (!error) return;
    }
  } catch { /* offline or table hiccup — never block the learner */ }
}

/** Heartbeat so the teacher's Live Activity shows "last seen". Best effort. */
export async function touchLastSeen(): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    await supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', data.user.id);
  } catch {}
}
