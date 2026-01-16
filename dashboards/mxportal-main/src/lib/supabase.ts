
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types/supabase';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error('Supabase environment variables are missing. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file.');
}

// Only use anon key for frontend
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

// Remove service key usage from frontend
export const supabaseAdmin = supabase;
