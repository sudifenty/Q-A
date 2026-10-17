import { useSyncExternalStore } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { Assignment, ExamAssignment, Profile } from './types';

/**
 * Remote-control state is refreshed from Supabase Realtime when connected,
 * every 15 seconds as a fallback, and when the app returns to the foreground.
 * Offline values are cached per Auth user so one learner never sees another
 * learner's last-known controls or scores on a shared device.
 */
const CACHE_KEY = 'sp_remote_cache_v2';
const SEEN_NUDGES_KEY = 'sp_seen_nudges';
const cacheKeyFor = (userId: string) => `${CACHE_KEY}:${userId}`;

export type Nudge = { id: string; message: string };

export type ExamResult = {
  id: number;
  exam_id: number;
  score: number | null;
  title: string;
  subject: string | null;
  created_at: string | null;
};

export type RemoteState = {
  assignment: Assignment | null;
  lockedExam: ExamAssignment | null;
  profile: Profile | null;
  examResults: ExamResult[];
  fetchedAt: number;
};

export type RemoteSyncStatus = 'offline' | 'connecting' | 'live' | 'polling';

const emptyRemoteState = (): RemoteState => ({
  assignment: null,
  lockedExam: null,
  profile: null,
  examResults: [],
  fetchedAt: 0
});

let state: RemoteState = emptyRemoteState();
let stateUserId: string | null = null;
let lastSnapshot = '';
let requestSequence = 0;
let syncStatus: RemoteSyncStatus = 'offline';

export const getRemote = () => state;
export const getRemoteSyncStatus = () => syncStatus;

/* State listeners fire only when the remote snapshot changes (or a table
   event explicitly invalidates it), not on every successful polling request. */
const listeners = new Set<() => void>();
const statusListeners = new Set<() => void>();

function emitRemote() {
  listeners.forEach(cb => { try { cb(); } catch {} });
}

function snapshotOf(value: RemoteState) {
  return JSON.stringify([
    value.assignment,
    value.lockedExam,
    value.profile,
    value.examResults
  ]);
}

function setRemoteState(next: RemoteState, forceNotify = false) {
  const snapshot = snapshotOf(next);
  state = next;
  if (forceNotify || snapshot !== lastSnapshot) {
    lastSnapshot = snapshot;
    emitRemote();
  }
}

function setSyncStatus(next: RemoteSyncStatus) {
  if (syncStatus === next) return;
  syncStatus = next;
  statusListeners.forEach(cb => { try { cb(); } catch {} });
}

export function subscribeRemote(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function subscribeRemoteStatus(cb: () => void): () => void {
  statusListeners.add(cb);
  return () => { statusListeners.delete(cb); };
}

/** React hooks for screens that must react while remaining open. */
export function useRemoteState(): RemoteState {
  return useSyncExternalStore(subscribeRemote, getRemote, getRemote);
}

export function useRemoteSyncStatus(): RemoteSyncStatus {
  return useSyncExternalStore(subscribeRemoteStatus, getRemoteSyncStatus, getRemoteSyncStatus);
}

/**
 * Fetch the signed-in student's live assignment, exam state, profile and recent
 * completed exam scores. A change from any of these is visible to subscribed
 * screens immediately. The 15-second poll remains active as an offline/network
 * fallback because Realtime delivery is not guaranteed while disconnected.
 */
export async function refreshRemote(userId: string, notifyEvenIfSame = false): Promise<RemoteState> {
  if (!userId) return state;

  if (stateUserId !== userId) {
    stateUserId = userId;
    requestSequence++;
    lastSnapshot = '';
    setRemoteState(emptyRemoteState(), true);
  }

  const requestId = ++requestSequence;
  try {
    const [assignmentResult, examAssignmentsResult, profileResult] = await Promise.all([
      supabase.from('smartple_assignments').select('*').eq('user_id', userId).limit(1),
      supabase.from('smartple_exam_assignments').select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('smartple_profiles').select('*').eq('user_id', userId).limit(1)
    ]);

    if (stateUserId !== userId || requestId !== requestSequence) return state;
    if (assignmentResult.error) throw assignmentResult.error;
    if (examAssignmentsResult.error) throw examAssignmentsResult.error;

    const assignments = (examAssignmentsResult.data || []) as ExamAssignment[];
    const lockedExam = assignments.find(a => a.status === 'locked' || a.status === 'in_progress') || null;
    const completed = assignments.filter(a => a.status === 'completed').slice(0, 5);
    const examIds = [...new Set(completed.map(a => a.exam_id))];

    let examDetails: any[] = [];
    if (examIds.length) {
      const { data, error } = await supabase.from('smartple_exams').select('*').in('id', examIds);
      if (!error) examDetails = data || [];
    }
    if (stateUserId !== userId || requestId !== requestSequence) return state;

    const detailById = new Map<number, any>(examDetails.map(e => [Number(e.id), e]));
    const examResults: ExamResult[] = completed.map(a => {
      const detail = detailById.get(Number(a.exam_id));
      return {
        id: a.id,
        exam_id: a.exam_id,
        score: a.score == null ? null : Number(a.score),
        title: detail?.title || `Exam ${a.exam_id}`,
        subject: detail?.subject ?? null,
        created_at: (a as any).created_at ?? null
      };
    });

    const next: RemoteState = {
      assignment: ((assignmentResult.data as Assignment[]) || [])[0] || null,
      lockedExam,
      // Keep the last-known profile if its read failed transiently; an empty
      // successful result still means the profile row is genuinely missing.
      profile: profileResult.error
        ? state.profile
        : (((profileResult.data as Profile[]) || [])[0] || null),
      examResults,
      fetchedAt: Date.now()
    };

    setRemoteState(next, notifyEvenIfSame);
    try { await AsyncStorage.setItem(cacheKeyFor(userId), JSON.stringify(next)); } catch {}
    if (syncStartedFor === userId && syncStatus === 'offline') setSyncStatus('polling');
  } catch {
    if (stateUserId === userId && requestId === requestSequence) {
      if (syncStartedFor === userId) setSyncStatus('offline');
      // Offline → keep in-memory state; if this is a fresh launch, restore only
      // this Auth user's cache (never the previous shared-device user's cache).
      if (!state.fetchedAt) {
        try {
          const cached = await AsyncStorage.getItem(cacheKeyFor(userId));
          if (cached && stateUserId === userId && requestId === requestSequence) {
            const parsed = JSON.parse(cached);
            setRemoteState({
              ...emptyRemoteState(),
              ...parsed,
              profile: parsed.profile ?? null,
              examResults: Array.isArray(parsed.examResults) ? parsed.examResults : []
            }, true);
          }
        } catch {}
      }
    }
  }
  return state;
}

/* ------------------------------------------------------------------ */
/* AUTO-SYNC                                                          */
/* Realtime provides prompt updates; polling and AppState refreshes   */
/* remain in place as a reliable fallback.                           */
/* ------------------------------------------------------------------ */
let syncStartedFor: string | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;
let syncChannel: any = null;
let eventRefreshTimer: ReturnType<typeof setTimeout> | null = null;

function queueRemoteRefresh(userId: string) {
  if (syncStartedFor !== userId) return;
  if (eventRefreshTimer) clearTimeout(eventRefreshTimer);
  eventRefreshTimer = setTimeout(() => {
    eventRefreshTimer = null;
    if (syncStartedFor === userId) void refreshRemote(userId, true);
  }, 160);
}

export function startRemoteAutoSync(userId: string) {
  if (syncStartedFor === userId) return;
  stopRemoteAutoSync();
  syncStartedFor = userId;
  setSyncStatus('connecting');
  void refreshRemote(userId);

  // Always retain the existing polling fallback, even while Realtime is live.
  pollTimer = setInterval(() => { void refreshRemote(userId); }, 15000);
  appStateSub = AppState.addEventListener('change', (s: AppStateStatus) => {
    if (s === 'active') void refreshRemote(userId);
  });

  let channel = supabase.channel(`student-remote-state-${userId}`);
  const watch = (table: string, events: Array<'INSERT' | 'UPDATE'>, filter?: string) => {
    for (const event of events) {
      channel = channel.on('postgres_changes', {
        event,
        schema: 'public',
        table,
        ...(filter ? { filter } : {})
      }, () => queueRemoteRefresh(userId));
    }
  };

  // Do not subscribe to DELETE payloads: Postgres Changes cannot safely apply
  // per-row filters to deletes. Deletes still converge through the 15s poll.
  watch('smartple_assignments', ['INSERT', 'UPDATE'], `user_id=eq.${userId}`);
  watch('smartple_exam_assignments', ['INSERT', 'UPDATE'], `user_id=eq.${userId}`);
  // This table is included in the publication only after the profile security
  // preflight succeeds (see supabase/enable_student_realtime.sql).
  watch('smartple_profiles', ['INSERT', 'UPDATE'], `user_id=eq.${userId}`);

  syncChannel = channel.subscribe((status: string) => {
    if (syncStartedFor !== userId) return;
    if (status === 'SUBSCRIBED') {
      setSyncStatus('live');
      void refreshRemote(userId);
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      setSyncStatus('polling');
    }
  });
}

export function stopRemoteAutoSync() {
  syncStartedFor = null;
  requestSequence++;
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (appStateSub) { appStateSub.remove(); appStateSub = null; }
  if (eventRefreshTimer) { clearTimeout(eventRefreshTimer); eventRefreshTimer = null; }
  if (syncChannel) {
    const oldChannel = syncChannel;
    syncChannel = null;
    void supabase.removeChannel(oldChannel).catch(() => {});
  }
  stateUserId = null;
  lastSnapshot = '';
  setRemoteState(emptyRemoteState(), true);
  setSyncStatus('offline');
}

/* ------------------------------------------------------------------ */
/* NUDGES                                                              */
/* The live table has NO seen/is_read column, so "read" is tracked     */
/* locally (AsyncStorage) and the row is deleted server-side on        */
/* dismiss.                                                             */
/* ------------------------------------------------------------------ */

const shownIds = new Set<string>();

async function getSeenIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_NUDGES_KEY);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch { return new Set<string>(); }
}

async function addSeenId(id: string) {
  shownIds.add(id);
  const seen = await getSeenIds();
  seen.add(id);
  try { await AsyncStorage.setItem(SEEN_NUDGES_KEY, JSON.stringify([...seen].slice(-200))); } catch {}
}

export function wasShown(id: string) { return shownIds.has(id); }

type NudgeUser = { id: string };

/** Latest user_id-targeted nudge that hasn't been dismissed yet (null if none). */
export async function fetchLatestNudge(user: NudgeUser): Promise<Nudge | null> {
  try {
    const { data, error } = await supabase.from('smartple_nudges')
      .select('id, message, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) return null;

    const seen = await getSeenIds();
    const fresh = (data || []).find((n: any) => !seen.has(String(n.id)) && !shownIds.has(String(n.id)));
    return fresh ? { id: String(fresh.id), message: fresh.message } : null;
  } catch {
    return null; // offline or table hiccup — never block the app
  }
}

/** Called when the student taps "Thanks!" — mark locally + delete server-side. */
export async function dismissNudge(id: string) {
  await addSeenId(id);
  try { await supabase.from('smartple_nudges').delete().eq('id', id); } catch {}
}

/** Effective class/subject/topic/subtopic/tier after the admin's forced filters. */
export function effectiveFilters(profileClass: string | null) {
  const a = state.assignment;
  return {
    klass: a?.forced_class || profileClass || 'P6',
    subject: a?.forced_subject || null,
    topic: a?.forced_topic || null,
    subtopic: a?.forced_subtopic || null,
    tier: a?.forced_tier || null,
    allowNotes: a?.allow_notes ?? true,
    allowPracticeAnswers: a?.allow_practice_with_answers ?? true,
    allowPracticeNoAnswers: a?.allow_practice_no_answers ?? true
  };
}
