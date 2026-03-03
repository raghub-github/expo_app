/**
 * MSG91 OTP sender – same provider as partnersite (Supabase hook + MSG91).
 * Used by backend /v1/auth/otp/request to send SMS when MSG91_AUTH_KEY is set.
 * Production: set MSG91_AUTH_KEY and optionally MSG91_TEMPLATE_ID in backend .env.
 */

const MSG91_V5_OTP_URL = "https://api.msg91.com/api/v5/otp";
const MSG91_LEGACY_SEND_OTP_URL = "https://control.msg91.com/api/sendotp.php";

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
  const mobile = phoneE164.replace(/\D/g, "");

  if (templateId) {
    // MSG91 v5 OTP API (template-based, DLT compliant)
    const res = await fetch(MSG91_V5_OTP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authkey: authKey,
      },
      body: JSON.stringify({
        template_id: templateId,
        shorturl: "0",
        recipients: [{ mobiles: `91${mobile.replace(/^91/, "")}`, otp }],
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
    mobile: mobile.replace(/^91/, "91"),
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
