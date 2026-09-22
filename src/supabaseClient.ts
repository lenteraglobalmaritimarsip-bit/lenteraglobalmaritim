import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const explicitEnable = String(import.meta.env.VITE_SUPABASE_ENABLE || '').toLowerCase();
const supabaseEnabled = explicitEnable === 'false'
  ? false
  : Boolean(supabaseUrl && supabaseAnonKey);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey && supabaseEnabled);

if (!isSupabaseConfigured) {
  console.info('Supabase di nonaktifkan sementara. Aplikasi berjalan dalam mode demo lokal.');
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
