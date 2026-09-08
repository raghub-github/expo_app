/** Shown when login cannot reach the API — never leak host, env, or stack details. */
export const RIDER_HIGH_TRAFFIC_MESSAGE =
  "Please try again after some time. We're experiencing high traffic right now.";

const KEEP_USER_SAFE = [
  /invalid otp/i,
  /otp expired/i,
  /too many (otp )?attempts/i,
  /10[- ]digit/i,
  /wait an hour/i,
  /changed devices/i,
  /session on this device/i,
  /tap ["']send otp/i,
  /otp not requested/i,
  /unable to send otp\. please try again/i,
];

const LOOKS_TECHNICAL = [
  /timed out/i,
  /timeout/i,
  /expo_public/i,
  /backend is running/i,
  /econnrefused/i,
  /enotfound/i,
  /etimedout/i,
  /network request failed/i,
  /failed to fetch/i,
  /authretryable/i,
  /could not connect/i,
  /unable to reach/i,
  /supabase is not configured/i,
  /check that the backend/i,
  /invalid response from server/i,
  /unexpected otp response/i,
  /session response missing/i,
  /no session returned from supabase/i,
  /http \d{3}/i,
  /contacting https?:\/\//i,
  /https?:\/\//i,
  /\/v1\/auth/i,
  /localhost/i,
  /127\.0\.0\.1/i,
  /10\.\d+\.\d+\.\d+/,
  /:3000\b/,
  /aborted/i,
];

function rawMessage(err: unknown): string {
  if (err instanceof Error) return err.message.trim();
  if (typeof err === "string") return err.trim();
  return "";
}

export function sanitizeRiderAuthError(
  err: unknown,
  fallback: string = RIDER_HIGH_TRAFFIC_MESSAGE,
): string {
  const msg = rawMessage(err);
  if (!msg) return fallback;
  if (KEEP_USER_SAFE.some((re) => re.test(msg))) return msg;
  if (LOOKS_TECHNICAL.some((re) => re.test(msg))) return fallback;
  return msg;
}
