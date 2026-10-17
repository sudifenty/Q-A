import { supabase } from './supabase';

/* =============================================================================
   Student Management — the admin app's API layer.

   Every WRITE goes through a Postgres function guarded by public.is_admin(),
   so the browser never holds a secret key and a non-admin caller is refused by
   the database even if they call these directly. Reads use the same plain
   selects the rest of the dashboard already uses.
   ========================================================================== */

export type StudentRow = {
  user_id: string | null;
  id?: string;
  student_id_unique: string | null;
  full_name: string | null;
  display_name: string | null;
  age: number | null;
  class: string | null;
  guardian_name: string | null;
  guardian_contact: string | null;
  address: string | null;
  photo_url: string | null;
  status: string | null;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  paid_until: string | null;
  role: string | null;
  created_at: string | null;
};

/* ---------------------------------------------------------------- status ----
   Derived, not trusted. The stored `status` column is a cache that the daily
   job keeps correct, but a learner who expired at midnight must still show up
   red before that job runs — so the app recomputes it from the end date every
   time and only falls back to the stored value when there is no date at all. */

/** Local calendar date as YYYY-MM-DD (date-only columns compare correctly). */
export const todayISO = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The date access actually runs out. paid_until is the older column and is
    kept in step by the database functions, so honour whichever is set. */
/** Anything carrying the two date columns — a full row or a Profile. */
export type SubDates = { subscription_end_date?: string | null; paid_until?: string | null };

export const endsOn = (s: SubDates): string | null =>
  s.subscription_end_date || s.paid_until || null;

export const isExpired = (s: SubDates): boolean => {
  const end = endsOn(s);
  if (!end) return false;              // no end date = permanent, never expires
  return end.slice(0, 10) < todayISO();
};

export const statusOf = (s: SubDates): 'active' | 'expired' =>
  isExpired(s) ? 'expired' : 'active';

export const daysLeft = (s: SubDates): number | null => {
  const end = endsOn(s);
  if (!end) return null;
  const a = new Date(end.slice(0, 10) + 'T00:00:00');
  const b = new Date(todayISO() + 'T00:00:00');
  return Math.round((a.getTime() - b.getTime()) / 86400000);
};

/* ------------------------------------------------------------- credentials --
   A registered student signs in with an address derived from their Student ID,
   so SPL-2026-0007 becomes spl20260007@smartple.app. Nothing to remember and
   nothing to type at registration. */
export const LOGIN_DOMAIN = 'smartple.app';
export const loginFor = (studentId: string): string =>
  `${studentId.toLowerCase().replace(/[^a-z0-9]/g, '')}@${LOGIN_DOMAIN}`;

/* No look-alike characters (0/O, 1/l/I) — this gets read out over the phone. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const makePassword = (n = 10): string => {
  const buf = new Uint32Array(n);
  crypto.getRandomValues(buf);
  return Array.from(buf, x => ALPHABET[x % ALPHABET.length]).join('');
};

/* ------------------------------------------------------------------- reads -- */

export async function refreshStatuses(): Promise<void> {
  /* Idempotent, both directions. Safe to call on every load; if the function
     is not there yet (migration not run) we simply carry on. */
  await supabase.rpc('admin_refresh_statuses');
}

export async function listStudents(): Promise<StudentRow[]> {
  const { data, error } = await supabase
    .from('smartple_profiles')
    .select('*')
    .eq('role', 'student')
    .order('full_name', { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data || []) as StudentRow[];
}

/* ------------------------------------------------------------------ writes -- */

export type RegisterInput = {
  full_name: string;
  age: number | null;
  klass: string | null;
  guardian_name: string | null;
  guardian_contact: string | null;
  address: string | null;
  registered_on: string | null;   // YYYY-MM-DD
  days: number | null;            // null = no expiry
  photo?: File | null;            // uploaded once the login exists
};

export type RegisterResult = {
  student_id: string;
  email: string;
  password: string;
  user_id: string;
  end_date: string | null;
  photo_error?: string;   // set only if the student saved but the photo did not
};

/** Reserve the next Student ID. Done first because the login address is
    derived from it, and the auth user has to exist before the profile can. */
export async function reserveStudentId(): Promise<string> {
  const { data, error } = await supabase.rpc('admin_next_student_id');
  if (error) throw new Error(`Could not reserve a Student ID — ${error.message}`);
  return data as string;
}

/**
 * Put the admin's own session back after signUp() replaced it.
 *
 * The refresh token is used as well as the access token so that a token which
 * expired part-way through a slow registration is renewed rather than leaving
 * the admin silently signed out.
 */
async function restoreAdminSession(session: {
  access_token: string;
  refresh_token: string;
} | null): Promise<void> {
  if (!session) {
    /* There was no admin session to lose, so do not leave the new student
       signed into the dashboard. */
    await supabase.auth.signOut();
    return;
  }
  await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token
  });
}

/**
 * Register a student end to end: reserve an ID, create the login, write the
 * profile, then confirm the address so they can sign in straight away.
 *
 * The password is generated here and returned ONCE — it is never stored in
 * plain text anywhere, so the admin has to copy it down.
 */
export async function registerStudent(input: RegisterInput): Promise<RegisterResult> {
  const studentId = await reserveStudentId();
  const email = loginFor(studentId);
  const password = makePassword();

  /* signUp() SIGNS THE NEW STUDENT IN and replaces our session. Everything
     below — the profile write, the photo upload and the confirmation — goes
     through functions guarded by is_admin(), so the admin session has to be
     put back first or every one of them refuses with "admin only". Captured
     before signUp because afterwards it is already gone. */
  const { data: current } = await supabase.auth.getSession();
  const adminSession = current.session;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: input.full_name, role: 'student' } }
  });
  /* Restored whatever happened: signUp swaps the session on success and leaves
     it alone on failure, and restoring an unchanged session is harmless. */
  await restoreAdminSession(adminSession);
  if (error) throw new Error(`Could not create the login — ${error.message}`);
  const user = data.user;
  if (!user) throw new Error('The login was not created. Check that this email is not already registered.');

  const { data: res, error: rpcErr } = await supabase.rpc('admin_register_student', {
    p_user_id: user.id,
    p_full_name: input.full_name,
    p_age: input.age,
    p_class: input.klass,
    p_guardian_name: input.guardian_name,
    p_guardian_contact: input.guardian_contact,
    p_address: input.address,
    /* filled in below, once the login exists and the file has been uploaded */
    p_photo_url: null,
    p_registered_on: input.registered_on,
    p_days: input.days,
    p_student_id: studentId
  });
  if (rpcErr) throw new Error(`Login created but the profile was not saved — ${rpcErr.message}`);

  /* admin_register_student writes the subscription dates but not is_paid, and
     the phone app's gate is `is_paid && paid_until > now`. Without this a
     student registered with a period had an expiry date and no access at all —
     they would have opened the app and found everything locked. */
  await supabase.from('smartple_profiles').update({ is_paid: true }).eq('user_id', user.id);

  /* The photo can only be filed once the login exists, because the storage
     path is keyed on the user id. A failure here must not lose the student —
     they are registered either way, and the photo can be added later. */
  let photoErr = '';
  if (input.photo) {
    try {
      const path = await uploadPhoto(user.id, input.photo);
      await supabase.rpc('admin_set_student_photo', { p_user_id: user.id, p_photo_url: path });
    } catch (e: any) {
      photoErr = e?.message || 'photo upload failed';
    }
  }

  /* Without this the student would have to click a confirmation email that
     nobody is going to send them. */
  await supabase.rpc('admin_confirm_user', { p_user_id: user.id });

  return {
    student_id: (res as any)?.student_id || studentId,
    email,
    password,
    user_id: user.id,
    end_date: (res as any)?.end_date || null,
    photo_error: photoErr || undefined
  };
}

/** One call serves both buttons — an expired student coming back and an active
    student extending early mean the same thing: start today, run N days. */
export async function renewStudent(userId: string, days: number): Promise<{ end_date: string }> {
  const { data, error } = await supabase.rpc('admin_renew_student', {
    p_user_id: userId,
    p_days: days
  });
  if (error) throw new Error(error.message);
  /* same reason as registration: renewing the dates has to reopen access too */
  await supabase.from('smartple_profiles').update({ is_paid: true }).eq('user_id', userId);
  return { end_date: (data as any)?.end_date || null };
}

/* ------------------------------------------------------------------- photo -- */

export async function uploadPhoto(userId: string, file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${userId}.${ext === 'jpeg' ? 'jpg' : ext}`;
  const { error } = await supabase.storage
    .from('student-photos')
    .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });
  if (error) throw new Error(error.message);
  /* The bucket is private, so what gets stored is the object path; photoUrl()
     below turns it into a short-lived signed URL when the admin wants to see it. */
  return path;
}

export async function photoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from('student-photos').createSignedUrl(path, 60 * 60);
  return data?.signedUrl || null;
}

/* ==========================================================================
   Admin override / force lock

   Sits on top of the learner's own study chain rather than replacing it.
   LOCK_ONLY hides everything but the target, EXTRA only adds a task, EXAM
   hands over a paper through the assignment the phone already watches.
   ======================================================================== */

export type ForceMode = 'LOCK_ONLY' | 'EXTRA' | 'EXAM';

export const FORCE_MODES: { id: ForceMode; label: string; blurb: string }[] = [
  { id: 'LOCK_ONLY', label: 'Lock to this',
    blurb: 'They see only this subtopic. Everything else is hidden until you unlock it.' },
  { id: 'EXTRA', label: 'Extra task',
    blurb: 'Added on top of their normal work. Hides nothing.' },
  { id: 'EXAM', label: 'Set an exam',
    blurb: 'Opens the paper directly, bypassing the study chain.' }
];

export type ForcedRow = {
  user_id: string; student: string | null; class: string | null;
  force_mode: ForceMode; forced_subtopic_id: string | null;
  forced_until: string | null; forced_topic: string | null;
  forced_subtopic: string | null; expired: boolean;
};

export type ForceInput = {
  user_id: string;
  mode: ForceMode;
  topic?: string | null;
  subtopic?: string | null;
  subtopic_id?: string | null;
  exam_id?: number | null;
  until?: string | null;   // ISO timestamp, null = no expiry
};

export async function forceAssign(i: ForceInput): Promise<void> {
  const { error } = await supabase.rpc('admin_force_assign', {
    p_user_id: i.user_id, p_mode: i.mode,
    p_topic: i.topic ?? null, p_subtopic: i.subtopic ?? null,
    p_subtopic_id: i.subtopic_id ?? null, p_exam_id: i.exam_id ?? null,
    p_until: i.until ?? null
  });
  if (error) throw new Error(error.message);
}

export async function forceClear(userId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_force_clear', { p_user_id: userId });
  if (error) throw new Error(error.message);
}

export async function forcedStudents(): Promise<ForcedRow[]> {
  const { data, error } = await supabase.rpc('admin_forced_students');
  if (error) throw new Error(error.message);
  return (data || []) as ForcedRow[];
}

export async function listExams(): Promise<{ id: number; title: string; subject: string | null }[]> {
  const { data, error } = await supabase.from('smartple_exams')
    .select('id,title,subject').order('id', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as any[];
}
