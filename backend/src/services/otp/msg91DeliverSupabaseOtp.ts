/**
 * Deliver Supabase-generated OTP via MSG91 (Flow API / DLT or v2 fallback).
 * Same behavior as partnersite `POST /api/auth/send-sms` — do not use MSG91's OTP-generate API.
 */

import type { Env } from "../../config/env.js";


function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) return digits.slice(2);
  if (digits.startsWith("91") && digits.length > 12) return digits.slice(-10);
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export async function deliverSupabaseOtpViaMsg91(
  env: Env,
  phoneRaw: string,
  otp: string
): Promise<{ ok: true } | { ok: false; error: string }> {
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
  const flowOrTemplateId = flowId || templateId;
  const otpVarName = env.MSG91_OTP_VAR_NAME?.trim() || "OTP";
  const sender = env.MSG91_SENDER_ID?.trim() || "GMMSMS";

  try {
    if (flowOrTemplateId) {
      const mobileWithCountry = mobile.length === 10 ? `91${mobile}` : mobile.startsWith("91") ? mobile : `91${mobile}`;
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
      if (flowId) payload.flow_id = flowId;
      else payload.template_id = templateId;
      const res = await fetch("https://control.msg91.com/api/v5/flow/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authkey: authKey,
        },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
      if (!res.ok || data.type === "error") {
        return { ok: false, error: data.message || res.statusText || "MSG91 Flow error" };
      }
      return { ok: true };
    }

    const template =
      process.env.MSG91_OTP_TEMPLATE_CONTENT?.trim() ||
      "Dear User, your OTP for Gatimitra account verification is ##OTP##. It is valid for 10 minutes. Do not share it with anyone.";
    const message = template.replace(/##OTP##/g, otp);
    const res = await fetch("https://api.msg91.com/api/v2/sendsms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authkey: authKey,
      },
      body: JSON.stringify({
        sender,
        route: "4",
        country: "91",
        sms: [{ message, to: [mobile] }],
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
    if (!res.ok || data.type === "error") {
      return { ok: false, error: data.message || res.statusText || "MSG91 sendsms error" };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "MSG91 request failed";
    return { ok: false, error: msg };
  }
}
