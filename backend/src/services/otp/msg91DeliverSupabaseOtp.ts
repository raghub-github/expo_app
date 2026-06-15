/**
 * Deliver OTP via MSG91 (Flow API / DLT or v2 fallback).
 * Same behavior as partnersite `POST /api/auth/send-sms`.
 */

import type { Env } from "../../config/env.js";

const MSG91_FLOW_URL = "https://control.msg91.com/api/v5/flow/";
const MSG91_LEGACY_SEND_OTP_URL = "https://control.msg91.com/api/sendotp.php";

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) return digits.slice(2);
  if (digits.startsWith("91") && digits.length > 12) return digits.slice(-10);
  return digits.length > 10 ? digits.slice(-10) : digits;
}

type Msg91Attempt = { channel: string; ok: boolean; error?: string; detail?: string };

async function sendViaFlowApi(args: {
  authKey: string;
  sender: string;
  mobileWithCountry: string;
  otp: string;
  otpVarName: string;
  templateId?: string;
  flowId?: string;
}): Promise<Msg91Attempt> {
  const { authKey, sender, mobileWithCountry, otp, otpVarName, templateId, flowId } = args;
  const recipient: Record<string, string> = { mobiles: mobileWithCountry };
  recipient[otpVarName] = otp;
  recipient.OTP = otp;
  recipient.Code = otp;
  if (otpVarName !== "VAR1") recipient.VAR1 = otp;

  const payload: Record<string, unknown> = {
    sender,
    short_url: "0",
    recipients: [recipient],
  };
  const channel = templateId ? "flow_template" : "flow_id";
  // Match partnersite: prefer template_id when both are configured (DLT-approved template).
  if (templateId) payload.template_id = templateId;
  else if (flowId) payload.flow_id = flowId;
  else return { channel, ok: false, error: "No template_id or flow_id" };

  const res = await fetch(MSG91_FLOW_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authkey: authKey,
    },
    body: JSON.stringify(payload),
  });
  const raw = await res.text();
  let data: { type?: string; message?: string; request_id?: string } = {};
  try {
    data = raw ? (JSON.parse(raw) as typeof data) : {};
  } catch {
    if (!res.ok) {
      return { channel, ok: false, error: raw || `HTTP ${res.status}`, detail: raw };
    }
  }
  if (!res.ok || data.type === "error") {
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
  let data: { type?: string; message?: string } = {};
  try {
    data = raw ? (JSON.parse(raw) as typeof data) : {};
  } catch {
    if (!res.ok) {
      return { channel: "v2_sendsms", ok: false, error: raw || `HTTP ${res.status}`, detail: raw };
    }
  }
  if (!res.ok || data.type === "error") {
    return {
      channel: "v2_sendsms",
      ok: false,
      error: data.message || res.statusText || "MSG91 sendsms error",
      detail: raw.slice(0, 500),
    };
  }
  return { channel: "v2_sendsms", ok: true, detail: data.message ?? raw.slice(0, 200) };
}

async function sendViaLegacyOtpApi(args: {
  authKey: string;
  sender: string;
  mobileWithCountry: string;
  otp: string;
  otpExpirySec: number;
}): Promise<Msg91Attempt> {
  const params = new URLSearchParams({
    authkey: args.authKey,
    mobile: args.mobileWithCountry,
    otp: args.otp,
    otp_expiry: String(args.otpExpirySec),
    ...(args.sender ? { sender: args.sender } : {}),
  });
  const res = await fetch(`${MSG91_LEGACY_SEND_OTP_URL}?${params.toString()}`, { method: "GET" });
  const raw = await res.text();
  let data: { type?: string; message?: string } = {};
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    return {
      channel: "legacy_sendotp",
      ok: false,
      error: raw?.trim() ? raw.slice(0, 200) : `Non-JSON response (HTTP ${res.status})`,
      detail: raw.slice(0, 500),
    };
  }
  if (!res.ok || data.type === "error") {
    return {
      channel: "legacy_sendotp",
      ok: false,
      error: data.message ?? "MSG91 sendotp error",
      detail: raw.slice(0, 500),
    };
  }
  if (data.type !== "success") {
    return {
      channel: "legacy_sendotp",
      ok: false,
      error: data.message ?? `Unexpected MSG91 response type: ${data.type ?? "unknown"}`,
      detail: raw.slice(0, 500),
    };
  }
  return { channel: "legacy_sendotp", ok: true, detail: data.message ?? raw.slice(0, 200) };
}

export async function deliverSupabaseOtpViaMsg91(
  env: Env,
  phoneRaw: string,
  otp: string,
  options?: { preferLegacyOtpApi?: boolean }
): Promise<{ ok: true; channel: string } | { ok: false; error: string; attempts?: Msg91Attempt[] }> {
  const authKey = env.MSG91_AUTH_KEY?.trim();
  if (!authKey) {
    return { ok: false, error: "MSG91_AUTH_KEY not configured on API server" };
  }

  const mobile = normalizePhone(phoneRaw);
  if (mobile.length < 10) {
    return { ok: false, error: "Invalid phone for SMS" };
  }

  const templateId = env.MSG91_TEMPLATE_ID?.trim();
  const flowId = env.MSG91_FLOW_ID?.trim();
  const otpVarName = env.MSG91_OTP_VAR_NAME?.trim() || "OTP";
  const sender = env.MSG91_SENDER_ID?.trim() || "GMMSMS";
  const mobileWithCountry = mobile.length === 10 ? `91${mobile}` : mobile.startsWith("91") ? mobile : `91${mobile}`;
  const attempts: Msg91Attempt[] = [];

  const tryLegacyFirst = async (): Promise<{ ok: true; channel: string } | null> => {
    const legacy = await sendViaLegacyOtpApi({
      authKey,
      sender,
      mobileWithCountry,
      otp,
      otpExpirySec: env.MSG91_OTP_EXPIRY_SEC ?? 300,
    });
    attempts.push(legacy);
    return legacy.ok ? { ok: true, channel: legacy.channel } : null;
  };

  try {
    if (options?.preferLegacyOtpApi) {
      const legacyOk = await tryLegacyFirst();
      if (legacyOk) return legacyOk;
    }

    // Flow API (DLT) — same as partnersite supabase-send-sms hook.
    if (templateId) {
      const primary = await sendViaFlowApi({
        authKey,
        sender,
        mobileWithCountry,
        otp,
        otpVarName,
        templateId,
      });
      attempts.push(primary);
      if (primary.ok) {
        return { ok: true, channel: primary.channel };
      }
    }

    if (flowId && flowId !== templateId) {
      const flowAttempt = await sendViaFlowApi({
        authKey,
        sender,
        mobileWithCountry,
        otp,
        otpVarName,
        flowId,
      });
      attempts.push(flowAttempt);
      if (flowAttempt.ok) {
        return { ok: true, channel: flowAttempt.channel };
      }
    }

    if (flowId && !templateId) {
      const flowAttempt = await sendViaFlowApi({
        authKey,
        sender,
        mobileWithCountry,
        otp,
        otpVarName,
        flowId,
      });
      attempts.push(flowAttempt);
      if (flowAttempt.ok) {
        return { ok: true, channel: flowAttempt.channel };
      }
    }

    const v2 = await sendViaV2Sms({
      authKey,
      sender,
      mobile,
      otp,
      templateContent: process.env.MSG91_OTP_TEMPLATE_CONTENT,
    });
    attempts.push(v2);
    if (v2.ok) {
      return { ok: true, channel: v2.channel };
    }

    const legacyOk = await tryLegacyFirst();
    if (legacyOk) return legacyOk;

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
