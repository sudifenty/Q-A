import { supabase } from './supabase';

/**
 * Shared access to the NEW schema:
 *   learning_events → normalized "Evt" rows (the old smartple_attempts)
 *   questions       → normalized "Q" rows   (the old smartple_questions)
 * learning_events was created outside this repo and is currently EMPTY, so
 * exact column names are unknown — everything is mapped defensively and all
 * filtering/sorting happens client-side (no server-side .eq on guessed names).
 */

export const pick = (r: any, keys: string[]): any => {
  for (const k of keys) if (r?.[k] !== undefined && r?.[k] !== null) return r[k];
  return undefined;
};

export type Evt = {
  uid: string;
  qid: string | null;
  subject: string;
  topic: string;
  subtopic: string | null;
  tier: number | null;
  correct: boolean | null;
  skipped: boolean;
  seconds: number | null;
  type: string | null;
  at: string;
};

export function toEvt(r: any): Evt | null {
  const evts = toEvts(r);
  return evts[0] ?? null;
}

/**
 * The live rows keep their payload in a `details` JSONB column — subject, topic,
 * correct and so on are in there, not in top-level columns. Reading only the top
 * level (as this file used to) made every attempt look blank, so the progress
 * heatmap said "No attempts yet" for students who had answered questions.
 *
 * One `exam_submitted` row carries the WHOLE paper, so it expands into one Evt
 * per question — that is what makes per-topic averages possible at all.
 */
export function toEvts(r: any): Evt[] {
  const uid = pick(r, ['user_id', 'student_id', 'profile_id', 'user']);
  const at = pick(r, ['created_at', 'timestamp', 'at', 'time']);
  if (!uid || !at) return [];
  const d = r?.details && typeof r.details === 'object' ? r.details : {};
  const src = { ...d, ...r };                    // details first; real columns win
  const etype = String(pick(src, ['event_type', 'type', 'action']) ?? '');

  const base = (over: Partial<Evt>): Evt => ({
    uid: String(uid),
    qid: pick(src, ['question_id', 'qid']) != null ? String(pick(src, ['question_id', 'qid'])) : null,
    subject: String(pick(src, ['subject', 'subject_name']) ?? ''),
    topic: String(pick(src, ['topic', 'topic_name', 'title', 'activity']) ?? etype ?? 'activity'),
    subtopic: pick(src, ['subtopic', 'sub_topic']) != null ? String(pick(src, ['subtopic', 'sub_topic'])) : null,
    tier: pick(src, ['tier', 'level', 'difficulty']) ?? null,
    correct: null,
    skipped: pick(src, ['skipped']) === true || etype === 'skipped' || etype === 'skip',
    seconds: (() => {
      const s = pick(src, ['time_spent_seconds', 'seconds', 'duration_seconds', 'duration', 'time_spent']);
      return s !== undefined && s !== null && !isNaN(Number(s)) ? Number(s) : null;
    })(),
    type: etype || null,
    at: String(at),
    ...over
  });

  const correctOf = (raw: any, result: any): boolean | null =>
    typeof raw === 'boolean' ? raw
      : result === 'correct' ? true
      : (result === 'incorrect' || result === 'wrong') ? false : null;

  if (etype === 'exam_submitted' && Array.isArray(d.answers)) {
    const title = String(d.title ?? 'exam');
    return d.answers.map((a: any, i: number) => base({
      topic: title,
      qid: a?.qid != null ? String(a.qid) : null,
      correct: correctOf(a?.ok, a?.result),
      type: `${etype}#${i + 1}`
    }));
  }

  return [base({ correct: correctOf(pick(src, ['is_correct', 'correct']), pick(src, ['result', 'outcome'])) })];
}

/** Newest-first normalized events. Client-side sort (column names untrusted).
 *  One row can expand to several Evt (an exam paper holds many answers). */
export async function fetchEvents(limit = 1500): Promise<Evt[]> {
  const { data } = await supabase.from('learning_events').select('*').limit(limit);
  const evts = ((data as any[]) || []).flatMap(toEvts);
  evts.sort((a, b) => (a.at < b.at ? 1 : -1));
  return evts;
}

export const eventsFor = (evts: Evt[], uid: string) => evts.filter(e => e.uid === uid);

export type Q = {
  id: any; klass: string | null; subject: string | null; topic: string | null;
  subtopic: string | null; tier: number | null; prompt: string; options: any; answer: any;
};

export function toQ(r: any): Q {
  return {
    id: r.id,
    klass: pick(r, ['class', 'class_level', 'grade']) ?? null,
    subject: pick(r, ['subject', 'subject_name']) ?? null,
    topic: pick(r, ['topic', 'topic_name']) ?? null,
    subtopic: pick(r, ['subtopic', 'sub_topic']) ?? null,
    tier: pick(r, ['tier', 'level', 'difficulty']) ?? null,
    prompt: String(pick(r, ['prompt', 'question', 'text', 'body']) ?? ''),
    options: pick(r, ['options', 'choices']) ?? null,
    answer: pick(r, ['answer', 'correct_answer', 'answer_text']) ?? null
  };
}

export async function fetchQuestions(limit = 800): Promise<Q[]> {
  const { data } = await supabase.from('questions').select('*').limit(limit);
  return ((data as any[]) || []).map(toQ);
}

/** profiles.last_seen map: { user_id: iso } */
export async function fetchLastSeen(): Promise<Record<string, string>> {
  const { data } = await supabase.from('profiles').select('*').limit(300);
  const ls: Record<string, string> = {};
  for (const r of (data as any[]) || []) if (r?.id && r?.last_seen) ls[String(r.id)] = String(r.last_seen);
  return ls;
}
