import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// SmartPle project (smart-ple). Keys are read from .env (EXPO_PUBLIC_*).
const URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://YOUR-PROJECT.supabase.co';
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'YOUR-ANON-KEY';

export const supabase = createClient(URL, KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  }
});
