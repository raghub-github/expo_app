/**
 * Alias for Supabase Send SMS hook. The canonical route is /api/auth/send-sms.
 * This path exists so Supabase hook URLs like .../api/send-sms work without change.
 */
export { POST } from "@/app/api/auth/send-sms/route";
