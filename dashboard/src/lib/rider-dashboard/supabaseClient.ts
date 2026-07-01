"use client";

/**
 * Re-export the single browser Supabase client so the rider-dashboard pages
 * share the same GoTrueClient instance as the rest of the dashboard.
 *
 * Previously this file created a SECOND createClient() with the same URL +
 * anon key — that produced the browser console warning:
 *   "Multiple GoTrueClient instances detected in the same browser context"
 * and could race the session-refresh between the two clients.
 *
 * The canonical client is in `lib/supabase/client.ts`; anything under
 * `rider-dashboard/*` that used to import `supabase` from here now transparently
 * receives that same instance.
 */
export { supabase } from "@/lib/supabase/client";
