import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Set these before building, e.g. in apps/admin/.env.local consumed by your host,
// or replace with your project values (the SAME Supabase project as the student app).
// HARDCODED on purpose (env vars on Vercel previously overrode the defaults
// and pointed the dashboard at the wrong project). ONE project now serves
// both the old web app and the mobile apps. The publishable key is public
// by design (it ships in every client; RLS policies are the gate).
const URL = 'https://ftykmafgfyqvniacguyi.supabase.co';
const KEY = 'sb_publishable_bmOSdzyRyFtaJhDbukpKbA_qiAqYafg';

export const supabase: SupabaseClient = createClient(URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

export type Profile = {
  user_id: string; display_name: string | null; class: string | null;
  role: 'student' | 'admin'; is_paid?: boolean;
  /* student management — all nullable, so rows created before the migration
     still type-check and simply show as unregistered */
  full_name?: string | null; student_id_unique?: string | null;
  age?: number | null; guardian_name?: string | null;
  guardian_contact?: string | null; address?: string | null;
  photo_url?: string | null; status?: string | null;
  subscription_start_date?: string | null; subscription_end_date?: string | null;
  paid_until?: string | null; created_at?: string | null;
};
export type Assignment = {
  user_id: string; forced_class: string | null; forced_subject: string | null;
  forced_topic: string | null; forced_subtopic: string | null; forced_tier: number | null;
  allow_notes: boolean; allow_practice_with_answers: boolean;
  allow_practice_no_answers: boolean; note: string | null;
};
