/**
 * Send Email Hook — called by Supabase Auth when sending email OTP.
 * Sends the premium GatiMitra Partner template via Zoho SMTP.
 *
 * Supabase Dashboard → Authentication → Hooks → Send Email:
 *   URL: https://partner.gatimitra.com/api/auth/send-email
 *   Secret: SUPABASE_SEND_EMAIL_HOOK_SECRET (v1,whsec_…)
 */

import { NextRequest, NextResponse } from 'next/server';
import { Webhook, WebhookVerificationError } from 'standardwebhooks';
import { sendPartnerRegisterOtpEmail } from '@/lib/email/partner-smtp';

const SEND_EMAIL_HOOK_SECRET =
  process.env.SUPABASE_SEND_EMAIL_HOOK_SECRET || process.env.SUPABASE_SEND_SMS_HOOK_SECRET;

function getHeadersMap(req: NextRequest): Record<string, string> {
  const out: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

type HookPayload = {
  user?: { email?: string };
  email_data?: {
    token?: string;
    email_action_type?: string;
  };
};

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    let body: HookPayload;

    const hasWebhookHeaders =
      req.headers.get('webhook-id') &&
      req.headers.get('webhook-signature') &&
      req.headers.get('webhook-timestamp');

    // Signature verification is mandatory. This route sends a GatiMitra-branded
    // OTP mail to whatever address the payload names, so an unverified request
    // is an open relay: anyone could mail our template, with an arbitrary code,
    // to an arbitrary recipient — phishing under our brand plus a fast way to
    // burn the sending domain's reputation.
    //
    // It previously fell through to `JSON.parse(rawBody)` whenever the secret
    // was unset, which made the protection silently depend on an env var that
    // `.env.example` ships empty and the docs describe as optional. A missing
    // secret is now a misconfiguration to fix, not a bypass.
    if (!SEND_EMAIL_HOOK_SECRET) {
      console.error(
        '[send-email] SUPABASE_SEND_EMAIL_HOOK_SECRET is not set — refusing to send unverified OTP mail.'
      );
      return NextResponse.json({ error: 'Email hook not configured' }, { status: 500 });
    }
    if (!hasWebhookHeaders) {
      return NextResponse.json({ error: 'Hook requires authorization token' }, { status: 401 });
    }
    try {
      const secret = SEND_EMAIL_HOOK_SECRET.trim().replace(/^v1,/i, '');
      const wh = new Webhook(secret);
      body = wh.verify(rawBody, getHeadersMap(req)) as HookPayload;
    } catch (err) {
      if (err instanceof WebhookVerificationError) {
        console.warn('[send-email] webhook verification failed:', err.message);
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      throw err;
    }

    const email = String(body.user?.email || '').trim().toLowerCase();
    const token = String(body.email_data?.token || '').trim();
    const emailActionType = String(body.email_data?.email_action_type || '').trim();

    if (!email || !token) {
      return NextResponse.json({ error: 'Missing email or token' }, { status: 400 });
    }

    // Respond quickly; send in background (Supabase hook timeout ~5s).
    void sendPartnerRegisterOtpEmail({ toEmail: email, token, emailActionType }).then((result) => {
      if (!result.sent) {
        console.error('[send-email] delivery failed:', result.reason);
      }
    });

    return NextResponse.json({}, { status: 200 });
  } catch (e) {
    console.error('[send-email]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
