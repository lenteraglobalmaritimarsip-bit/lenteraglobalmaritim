import { createClient } from '@supabase/supabase-js';

// Menggunakan casting 'any' agar TypeScript mengizinkan kompilasi tanpa komplain tipe data env
const _meta = (import.meta as any);

const supabaseUrl = _meta.env?.VITE_SUPABASE_URL || '';
const supabaseAnonKey = _meta.env?.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Peringatan: Variabel lingkungan Supabase belum terkonfigurasi di file .env');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
);
