import { createBrowserClient } from '@supabase/ssr';
import { createFetchWithTimeout } from '@/lib/auth/fetch-with-timeout';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const browserFetch = createFetchWithTimeout(15_000);

export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    global: { fetch: browserFetch },
  });
}