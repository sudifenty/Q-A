import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  URL && KEY && !URL.includes('YOUR-PROJECT') && !KEY.includes('YOUR-')
);

// Placeholders allow the app bundle to compile before local Supabase settings are supplied.
export const supabase = createClient(
  URL || 'https://example.supabase.co',
  KEY || 'replace-with-supabase-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false
    }
  }
);
