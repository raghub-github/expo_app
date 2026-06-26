/**
 * Deliver OTP via MSG91.
 *
 * India OTP must use MSG91 Send OTP APIs (v5/otp or sendotp.php), NOT the Flow/transactional
 * template API — Flow can return HTTP 200 without delivering or appearing in OTP logs.
 */

import type { Env } from "../../config/env.js";

const MSG91_FLOW_URL = "https://control.msg91.com/api/v5/flow/";
const MSG91_V5_OTP_URL = "https://control.msg91.com/api/v5/otp";
const MSG91_LEGACY_SEND_OTP_URL = "https://api.msg91.com/api/sendotp.php";

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) return digits.slice(2);
  if (digits.startsWith("91") && digits.length > 12) return digits.slice(-10);
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** MSG91 dashboard IDs are hex-ish; skip obvious typos (e.g. "werty" in flow id). */
function isPlausibleMsg91Id(id: string): boolean {
  const s = id.trim();
  if (s.length < 20) return false;
  return /^[a-f0-9]+$/i.test(s);
}

type Msg91Attempt = { channel: string; ok: boolean; error?: string; detail?: string };

function parseMsg91Json(raw: string): { type?: string; message?: string; request_id?: string } {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as { type?: string; message?: string; request_id?: string };
  } catch {
    return {};
  }
}

function isMsg91Success(res: Response, data: { type?: string }): boolean {
  return res.ok && data.type === "success";
}

function logAttemptDev(attempt: Msg91Attempt): void {
  if (process.env.NODE_ENV === "production") return;
  // eslint-disable-next-line no-console
  console.log(`[MSG91] ${attempt.channel}: ${attempt.ok ? "OK" : "FAIL"}`, attempt.detail ?? attempt.error ?? "");
}

async function sendViaV5OtpApi(args: {
  authKey: string;
  mobileWithCountry: string;
  otp: string;
  otpTemplateId: string;
  otpExpiryMin: number;
}): Promise<Msg91Attempt> {
  const url = new URL(MSG91_V5_OTP_URL);
  url.searchParams.set("template_id", args.otpTemplateId);
  url.searchParams.set("mobile", args.mobileWithCountry);
  url.searchParams.set("authkey", args.authKey);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authkey: args.authKey,
    },
    body: JSON.stringify({
      otp: args.otp,
      otp_expiry: args.otpExpiryMin,
      otp_length: 6,
    }),
  });
  const raw = await res.text();
  const data = parseMsg91Json(raw);
  const channel = "v5_otp";

  if (!isMsg91Success(res, data)) {
    return {
      channel,
      ok: false,
      error: data.message || res.statusText || "MSG91 v5 OTP error",
      detail: raw.slice(0, 500),
    };
  }
  return { channel, ok: true, detail: data.request_id ?? data.message ?? raw.slice(0, 200) };
}

async function sendViaFlowApi(args: {
  authKey: string;
  sender: string;
  mobileWithCountry: string;
  otp: string;
  otpVarName: string;
  flowId: string;
}): Promise<Msg91Attempt> {
  const { authKey, sender, mobileWithCountry, otp, otpVarName, flowId } = args;
  const recipient: Record<string, string> = { mobiles: mobileWithCountry };
  recipient[otpVarName] = otp;
  recipient.OTP = otp;
  recipient.Code = otp;
  if (otpVarName !== "VAR1") recipient.VAR1 = otp;

  const payload = {
    sender,
    short_url: "0",
    flow_id: flowId,
    recipients: [recipient],
  };
  const channel = "flow_id";

  const res = await fetch(MSG91_FLOW_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authkey: authKey,
    },
    body: JSON.stringify(payload),
  });
  const raw = await res.text();
  const data = parseMsg91Json(raw);

  if (!isMsg91Success(res, data)) {
    return {
      channel,
      ok: false,
      error: data.message || res.statusText || "MSG91 Flow error",
      detail: raw.slice(0, 500),
    };
  }
  return { channel, ok: true, detail: data.request_id ?? data.message ?? raw.slice(0, 200) };
}

async function sendViaV2Sms(args: {
  authKey: string;
  sender: string;
  mobile: string;
  otp: string;
  templateContent?: string;
}): Promise<Msg91Attempt> {
  const template =
    args.templateContent?.trim() ||
    "Dear User, your OTP for Gatimitra account verification is ##OTP##. It is valid for 10 minutes. Do not share it with anyone.";
  const message = template.replace(/##OTP##/g, args.otp);

  const res = await fetch("https://api.msg91.com/api/v2/sendsms", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authkey: args.authKey,
    },
    body: JSON.stringify({
      sender: args.sender,
      route: "4",
      country: "91",
      sms: [{ message, to: [args.mobile] }],
    }),
  });
  const raw = await res.text();
  const data = parseMsg91Json(raw);
  const channel = "v2_sendsms";

  if (!isMsg91Success(res, data)) {
    return {
      channel,
      ok: false,
      error: data.message || res.statusText || "MSG91 sendsms error",
      detail: raw.slice(0, 500),
    };
  }
  return { channel, ok: true, detail: data.message ?? raw.slice(0, 200) };
}

async function sendViaLegacyOtpApi(args: {
  authKey: string;
  sender: string;
  mobileWithCountry: string;
  otp: string;
  otpExpiryMin: number;
}): Promise<Msg91Attempt> {
  const params = new URLSearchParams({
    authkey: args.authKey,
    mobile: args.mobileWithCountry,
    otp: args.otp,
    otp_length: "6",
    otp_expiry: String(Math.max(1, args.otpExpiryMin)),
    ...(args.sender ? { sender: args.sender } : {}),
  });
  const res = await fetch(`${MSG91_LEGACY_SEND_OTP_URL}?${params.toString()}`, { method: "GET" });
  const raw = await res.text();
  const data = parseMsg91Json(raw);
  const channel = "legacy_sendotp";

  if (!res.ok || data.type === "error") {
    return {
      channel,
      ok: false,
      error: data.message ?? "MSG91 sendotp error",
      detail: raw.slice(0, 500),
    };
  }
  if (data.type !== "success") {
    return {
      channel,
      ok: false,
      error: data.message ?? `Unexpected MSG91 response type: ${data.type ?? "unknown"}`,
      detail: raw.slice(0, 500),
    };
  }
  return { channel, ok: true, detail: data.message ?? raw.slice(0, 200) };
}

export async function deliverSupabaseOtpViaMsg91(
  env: Env,
  phoneRaw: string,
  otp: string,
  options?: { preferLegacyOtpApi?: boolean },
): Promise<{ ok: true; channel: string } | { ok: false; error: string; attempts?: Msg91Attempt[] }> {
  const authKey = env.MSG91_AUTH_KEY?.trim();
  if (!authKey) {
    return { ok: false, error: "MSG91_AUTH_KEY not configured on API server" };
  }

  const mobile = normalizePhone(phoneRaw);
  if (mobile.length < 10) {
    return { ok: false, error: "Invalid phone for SMS" };
  }

  const otpTemplateId = env.MSG91_TEMPLATE_ID?.trim();
  const flowIdRaw = env.MSG91_FLOW_ID?.trim();
  const flowId = flowIdRaw && isPlausibleMsg91Id(flowIdRaw) ? flowIdRaw : undefined;
  const otpVarName = env.MSG91_OTP_VAR_NAME?.trim() || "OTP";
  const sender = env.MSG91_SENDER_ID?.trim() || "GMMSMS";
  const mobileWithCountry = mobile.length === 10 ? `91${mobile}` : mobile.startsWith("91") ? mobile : `91${mobile}`;
  const otpExpiryMin = Math.max(1, Math.ceil((env.MSG91_OTP_EXPIRY_SEC ?? 300) / 60));
  const attempts: Msg91Attempt[] = [];
  const preferLegacyOtpApi = options?.preferLegacyOtpApi === true;

  const tryChannel = async (
    attempt: Msg91Attempt,
  ): Promise<{ ok: true; channel: string } | null> => {
    attempts.push(attempt);
    logAttemptDev(attempt);
    return attempt.ok ? { ok: true, channel: attempt.channel } : null;
  };

  // v5 OTP API is configured on a DLT template that returns HTTP 200/type:"success"
  // but does NOT actually deliver SMS on our current MSG91 account. When the
  // caller passes preferLegacyOtpApi:true, skip v5 entirely and go straight to
  // the channels we have observed delivering: legacy sendotp.php → flow → v2.
  // (Supabase Send SMS Hook callers don't set this flag and continue using v5
  // first because they pass Supabase-generated OTPs that aren't in our app DB.)
  const tryV5OtpApi = async () => {
    if (!otpTemplateId || !isPlausibleMsg91Id(otpTemplateId)) return null;
    const v5 = await sendViaV5OtpApi({
      authKey,
      mobileWithCountry,
      otp,
      otpTemplateId,
      otpExpiryMin,
    });
    return tryChannel(v5);
  };

  const tryFlowApi = async () => {
    if (!flowId) return null;
    const flowAttempt = await sendViaFlowApi({
      authKey,
      sender,
      mobileWithCountry,
      otp,
      otpVarName,
      flowId,
    });
    return tryChannel(flowAttempt);
  };

  const tryLegacy = async () =>
    tryChannel(
      await sendViaLegacyOtpApi({ authKey, sender, mobileWithCountry, otp, otpExpiryMin }),
    );

  const tryV2 = async () =>
    tryChannel(
      await sendViaV2Sms({
        authKey,
        sender,
        mobile,
        otp,
        templateContent: process.env.MSG91_OTP_TEMPLATE_CONTENT,
      }),
    );

  try {
    // Order matters. Callers that already know v5 lies for their account pass
    // preferLegacyOtpApi:true to skip it.
    const channelOrder = preferLegacyOtpApi
      ? [tryFlowApi, tryLegacy, tryV2]
      : [tryV5OtpApi, tryLegacy, tryFlowApi, tryV2];

    for (const fn of channelOrder) {
      const result = await fn();
      if (result) return result;
    }

    const lastError =
      attempts.map((a) => `${a.channel}: ${a.error ?? "unknown"}`).join("; ") || "All MSG91 channels failed";
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[MSG91] All delivery attempts failed:", attempts);
    }
    return { ok: false, error: lastError, attempts };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "MSG91 request failed";
    return { ok: false, error: msg, attempts };
  }
}
