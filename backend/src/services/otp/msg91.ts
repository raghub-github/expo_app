/**
 * Legacy wrapper — delegates to the shared MSG91 delivery used by Supabase hook + /otp/request.
 */
import { getEnv } from "../../config/env.js";
import { deliverSupabaseOtpViaMsg91 } from "./msg91DeliverSupabaseOtp.js";

export type Msg91SendOptions = {
  authKey: string;
  phoneE164: string;
  otp: string;
  templateId?: string;
  senderId?: string;
  otpExpirySec?: number;
};

export async function sendOtpViaMsg91(options: Msg91SendOptions): Promise<{ ok: boolean; error?: string }> {
  const result = await deliverSupabaseOtpViaMsg91(getEnv(), options.phoneE164, options.otp);
  if (result.ok) return { ok: true };
  return { ok: false, error: result.error };
}
