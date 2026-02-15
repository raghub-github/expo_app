/**
 * Feature flags for phone OTP (SMS). When SMS provider (e.g. MSG91) is not yet configured,
 * registration only collects mobile number; login hides mobile OTP.
 * Set to "true" once Supabase Send SMS Hook (e.g. MSG91) is set up.
 */
export const ENABLE_PHONE_OTP_REGISTER =
  process.env.NEXT_PUBLIC_ENABLE_PHONE_OTP_REGISTER === "true";

export const ENABLE_PHONE_OTP_LOGIN =
  process.env.NEXT_PUBLIC_ENABLE_PHONE_OTP_LOGIN === "true";
