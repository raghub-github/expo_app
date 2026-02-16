import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "Supabase environment variables SUPABASE_URL and/or SUPABASE_ANON_KEY are not set."
  );
}

export function getSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase environment variables are not configured.");
  }

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
    },
  });
}
