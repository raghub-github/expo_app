/**
 * MSG91 OTP sender – same provider as partnersite (Supabase hook + MSG91).
 * Used by backend /v1/auth/otp/request to send SMS when MSG91_AUTH_KEY is set.
 * Production: set MSG91_AUTH_KEY and optionally MSG91_TEMPLATE_ID in backend .env.
 */

const MSG91_V5_OTP_URL = "https://api.msg91.com/api/v5/otp";
const MSG91_LEGACY_SEND_OTP_URL = "https://control.msg91.com/api/sendotp.php";
const MSG91_FLOW_URL = "https://control.msg91.com/api/v5/flow/";

export type Msg91SendOptions = {
  authKey: string;
  phoneE164: string;
  otp: string;
  templateId?: string;
  senderId?: string;
  otpExpirySec?: number;
};

/**
 * Send OTP via MSG91. Uses v5 API when template_id is set, else legacy sendotp.php.
 * phoneE164 must be digits with country code (e.g. 919876543210).
 */
export async function sendOtpViaMsg91(options: Msg91SendOptions): Promise<{ ok: boolean; error?: string }> {
  const { authKey, phoneE164, otp, templateId, senderId, otpExpirySec = 300 } = options;
  const mobileDigits = phoneE164.replace(/\D/g, "");
  // Normalize to India 10-digit local mobile when possible (MSG91 commonly expects this).
  const local10 =
    mobileDigits.length === 10
      ? mobileDigits
      : mobileDigits.startsWith("91") && mobileDigits.length >= 12
        ? mobileDigits.slice(-10)
        : mobileDigits.length > 10
          ? mobileDigits.slice(-10)
          : mobileDigits;

  if (templateId) {
    // Prefer MSG91 Flow API when a DLT template/flow id is configured.
    // The v5 OTP API has multiple variants and has caused "Please enter atleast one number to send sms."
    // Flow API is what we already use for the Supabase Send SMS hook path.
    const mobileWithCountry = local10.length === 10 ? `91${local10}` : local10;
    const recipient: Record<string, string> = { mobiles: mobileWithCountry };
    // Common variable names seen in MSG91 templates/flows.
    recipient.OTP = otp;
    recipient.Code = otp;
    recipient.VAR1 = otp;

    const res = await fetch(MSG91_FLOW_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authkey: authKey,
      },
      body: JSON.stringify({
        template_id: templateId,
        sender: senderId || "GMMSMS",
        short_url: "0",
        recipients: [recipient],
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
    if (!res.ok) {
      return { ok: false, error: (data as { message?: string }).message ?? `HTTP ${res.status}` };
    }
    if (data.type === "error") {
      return { ok: false, error: (data as { message?: string }).message ?? "MSG91 error" };
    }
    return { ok: true };
  }

  // Legacy sendotp.php (no template) – for dev/simple setups
  const params = new URLSearchParams({
    authkey: authKey,
    mobile: local10.length === 10 ? `91${local10}` : local10,
    otp,
    otp_expiry: String(otpExpirySec),
    ...(senderId ? { sender: senderId } : {}),
  });
  const res = await fetch(`${MSG91_LEGACY_SEND_OTP_URL}?${params.toString()}`, { method: "GET" });
  const text = await res.text();
  let data: { type?: string; message?: string } = {};
  try {
    data = JSON.parse(text) as { type?: string; message?: string };
  } catch {
    if (!res.ok) {
      return { ok: false, error: text || `HTTP ${res.status}` };
    }
  }
  if (data.type === "error") {
    return { ok: false, error: data.message ?? "MSG91 error" };
  }
  return { ok: true };
}
