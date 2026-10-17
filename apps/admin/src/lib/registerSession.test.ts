/* The "admin only" failure during registration, reproduced.

   supabase.auth.signUp() signs the NEW user in and replaces the caller's
   session. Every write in registerStudent() goes through a Postgres function
   guarded by is_admin(), so the moment signUp ran, the admin was no longer the
   caller and the very next call came back "admin only" — with a login already
   created and no profile behind it.

   The mock below is stateful on purpose: it holds one current session, signUp
   overwrites it exactly as supabase-js does, and rpc() refuses anything
   admin-only unless the admin session is current — which is what the database
   does. A test that passed against a stateless mock would prove nothing. */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const ADMIN = { access_token: 'admin-access', refresh_token: 'admin-refresh' };
const STUDENT = { access_token: 'student-access', refresh_token: 'student-refresh' };

let current: { access_token: string; refresh_token: string } | null = null;
let calls: string[] = [];
let updates: string[] = [];

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: current }, error: null }),
      /* the behaviour that caused the bug: the new user becomes the session */
      signUp: async () => {
        current = STUDENT;
        return { data: { user: { id: 'new-student-id' } }, error: null };
      },
      setSession: async (s: { access_token: string }) => {
        current = s.access_token === ADMIN.access_token ? ADMIN : STUDENT;
        return { data: { session: current }, error: null };
      },
      signOut: async () => { current = null; return { error: null }; }
    },
    rpc: async (name: string) => {
      calls.push(`${name}@${current?.access_token ?? 'signed-out'}`);
      if (name === 'admin_next_student_id') {
        return current?.access_token === ADMIN.access_token
          ? { data: 'SPL-2026-0001', error: null }
          : { data: null, error: { message: 'admin only' } };
      }
      /* the same guard the real functions carry */
      if (current?.access_token !== ADMIN.access_token) {
        return { data: null, error: { message: 'admin only' } };
      }
      return { data: { student_id: 'SPL-2026-0001', end_date: null }, error: null };
    },
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
    from: (table: string) => ({
      update: (patch: any) => ({
        eq: async (_col: string, val: string) => {
          updates.push(`${table} ${JSON.stringify(patch)} where=${val}`);
          return { error: null };
        }
      })
    })
  }
}));

import { registerStudent } from './students';

const INPUT = {
  full_name: 'Nakato Sarah', klass: 'P5', age: 11,
  guardian_name: null, guardian_contact: null, address: null,
  registered_on: null, days: 30, photo: null
} as any;

describe('registering a student must not lose the admin session', () => {
  beforeEach(() => { current = ADMIN; calls = []; updates = []; });

  it('signUp really does steal the session — the mock is not vacuous', async () => {
    const { supabase } = await import('./supabase');
    await supabase.auth.signUp({ email: 'x@y.z', password: 'p' } as any);
    expect(current).toEqual(STUDENT);
    /* and an admin-only call in that state is refused, exactly as the DB does */
    const r = await supabase.rpc('admin_register_student', {} as any);
    expect(r.error?.message).toBe('admin only');
  });

  it('completes the registration instead of failing with "admin only"', async () => {
    const res = await registerStudent(INPUT);
    expect(res.student_id).toBe('SPL-2026-0001');
    expect(res.user_id).toBe('new-student-id');
  });

  it('every admin-only call runs as the admin, not as the new student', async () => {
    await registerStudent(INPUT);
    const adminCalls = calls.filter(c => c.startsWith('admin_register_student')
      || c.startsWith('admin_confirm_user'));
    expect(adminCalls.length).toBe(2);
    adminCalls.forEach(c => expect(c).toBe(`${c.split('@')[0]}@admin-access`));
  });

  it('leaves the admin signed in, not the student they just created', async () => {
    await registerStudent(INPUT);
    expect(current).toEqual(ADMIN);
  });

  it('opens access — the phone gate is is_paid && paid_until > now, and the RPC writes no is_paid', async () => {
    await registerStudent(INPUT);
    expect(updates.some(u => u.startsWith('smartple_profiles') && u.includes('"is_paid":true')))
      .toBe(true);
  });
});
