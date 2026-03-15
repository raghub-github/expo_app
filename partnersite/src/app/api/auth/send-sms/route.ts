/**
 * Send SMS Hook - Called by Supabase Auth when sending phone OTP.
 *
 * Supabase generates the 6-digit OTP and calls this hook with Standard Webhooks
 * signing (webhook-id, webhook-signature, webhook-timestamp). We verify the
 * signature then send the OTP via MSG91.
 *
 * IMPORTANT: Supabase requires the hook to respond within 5 seconds. We respond 200
 * immediately after validation and send SMS in the background to avoid timeout.
 */

import { NextRequest, NextResponse } from "next/server";
import { Webhook, WebhookVerificationError } from "standardwebhooks";

const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY;
const SEND_SMS_HOOK_SECRET = process.env.SUPABASE_SEND_SMS_HOOK_SECRET;

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) return digits.slice(2);
  if (digits.startsWith("91") && digits.length > 12) return digits.slice(-10);
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** Build headers object for Standard Webhooks (lowercase keys). */
function getHeadersMap(req: NextRequest): Record<string, string> {
  const out: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

/**
 * Send OTP via MSG91. Uses Flow API (v5/flow) when MSG91_TEMPLATE_ID is set (required for
 * India DLT). Otherwise falls back to v2/sendsms with raw message.
 * Flow API: template_id + recipients with variable (e.g. OTP) so content matches DLT template.
 */
async function sendSmsViaMsg91(mobile: string, otp: string): Promise<void> {
  if (!MSG91_AUTH_KEY) return;
  const templateId = process.env.MSG91_TEMPLATE_ID?.trim();
  const flowId = process.env.MSG91_FLOW_ID?.trim();
  const flowOrTemplateId = flowId || templateId;
  const otpVarName = process.env.MSG91_OTP_VAR_NAME?.trim() || "OTP";
  const sender = process.env.MSG91_SENDER_ID || "GMMSMS";

  try {
    if (flowOrTemplateId) {
      // Flow API (v5/flow) – required for India DLT; use flow_id or template_id per MSG91 dashboard
      const mobileWithCountry = mobile.length === 10 ? `91${mobile}` : mobile.startsWith("91") ? mobile : `91${mobile}`;
      // Pass OTP under multiple variable names so ##OTP## placeholder gets the value (MSG91 may expect OTP, Code, or VAR1)
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
          authkey: MSG91_AUTH_KEY,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data.type && data.type === "error")) {
        console.error("[send-sms] MSG91 Flow error:", data.message || res.statusText, data);
      }
    } else {
      // Fallback: v2/sendsms with raw message (may fail DLT if content doesn’t match template)
      const template =
        process.env.MSG91_OTP_TEMPLATE_CONTENT?.trim() ||
        "Dear User, your OTP for Gatimitra account verification is ##OTP##. It is valid for 10 minutes. Do not share it with anyone.";
      const message = template.replace(/##OTP##/g, otp);
      const res = await fetch("https://api.msg91.com/api/v2/sendsms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authkey: MSG91_AUTH_KEY,
        },
        body: JSON.stringify({
          sender,
          route: "4",
          country: "91",
          sms: [{ message, to: [mobile] }],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data.type && data.type === "error")) {
        console.error("[send-sms] MSG91 error:", data.message || res.statusText, data);
      }
    }
  } catch (e) {
    console.error("[send-sms] MSG91 request failed:", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!MSG91_AUTH_KEY) {
      console.error("[send-sms] MSG91_AUTH_KEY not configured");
      return NextResponse.json({ error: "SMS not configured" }, { status: 500 });
    }

    const rawBody = await req.text();
    let body: Record<string, unknown>;

    const hasWebhookHeaders =
      req.headers.get("webhook-id") &&
      req.headers.get("webhook-signature") &&
      req.headers.get("webhook-timestamp");

    if (SEND_SMS_HOOK_SECRET && hasWebhookHeaders) {
      try {
        // Library expects "whsec_<base64>" and strips "whsec_". Supabase sends "v1,whsec_<base64>".
        const secret = SEND_SMS_HOOK_SECRET.trim().replace(/^v1,/i, "");
        const wh = new Webhook(secret);
        body = wh.verify(rawBody, getHeadersMap(req)) as Record<string, unknown>;
      } catch (err) {
        if (err instanceof WebhookVerificationError) {
          console.warn("[send-sms] Standard Webhooks verification failed:", err.message);
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        throw err;
      }
    } else if (SEND_SMS_HOOK_SECRET && !hasWebhookHeaders) {
      return NextResponse.json(
        { error: "Hook requires authorization token" },
        { status: 401 }
      );
    } else {
      try {
        body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
      } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
      }
    }

    const phone = (body?.user as { phone?: string } | undefined)?.phone ?? (body?.phone as string | undefined) ?? "";
    const otp = (body?.sms as { otp?: string } | undefined)?.otp ?? (body?.otp as string | undefined) ?? (body?.token as string | undefined) ?? "";

    const phoneTrimmed = String(phone).trim();
    const otpTrimmed = String(otp).trim();

    if (!phoneTrimmed || !otpTrimmed) {
      return NextResponse.json({ error: "Missing phone or otp" }, { status: 400 });
    }

    const mobile = normalizePhone(phoneTrimmed);
    if (mobile.length < 10) {
      return NextResponse.json({ error: "Invalid phone" }, { status: 400 });
    }

    // Respond immediately so Supabase does not hit the 5-second hook timeout.
    sendSmsViaMsg91(mobile, otpTrimmed).catch(() => {});

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e) {
    console.error("[send-sms]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
