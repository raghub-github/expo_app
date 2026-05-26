import { createBrowserClient } from '@supabase/ssr';
import { createFetchWithTimeout } from '@/lib/auth/fetch-with-timeout';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

const browserFetch = createFetchWithTimeout(15_000);

export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    global: { fetch: browserFetch },
  });
}