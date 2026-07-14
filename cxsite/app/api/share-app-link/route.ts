/**
 * POST /api/share-app-link
 * Emails (or SMSes) the GatiMitra customer app download link.
 * Email uses Zoho SMTP (EMAIL_ID + EMAIL_APP_PASSWORD).
 * Phone uses MSG91 plain SMS when configured.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  APP_LINK_EMAIL_BRAND,
  CUSTOMER_PLAY_STORE_URL,
  resolveAndroidDownloadUrl,
  resolveIosDownloadUrl,
} from '@/lib/appDownload'
import { createSmtpTransporter, formatSmtpFrom, getSmtpConfig } from '@/lib/server/smtp-config'

export const runtime = 'nodejs'

type Body = {
  mode?: 'email' | 'phone'
  value?: string
}

const RATE: Map<string, { count: number; resetAt: number }> = new Map()
const WINDOW_MS = 60 * 60 * 1000
const LIMIT = 8

function rateLimit(ip: string): boolean {
  const now = Date.now()
  const cur = RATE.get(ip)
  if (!cur || cur.resetAt < now) {
    RATE.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  cur.count++
  return cur.count <= LIMIT
}

function validEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

function normalizeIndianPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`
  if (digits.length === 12 && digits.startsWith('91') && /^91[6-9]/.test(digits)) return digits
  if (digits.length === 11 && digits.startsWith('0') && /^0[6-9]/.test(digits)) {
    return `91${digits.slice(1)}`
  }
  return null
}

function buildAppLinkEmailHtml(playUrl: string, iosUrl: string): string {
  const brand = APP_LINK_EMAIL_BRAND
  const year = new Date().getFullYear()
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>GatiMitra App</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:4px;overflow:hidden;">
          <tr>
            <td align="center" style="background:${brand};padding:22px 24px;">
              <span style="display:inline-block;font-size:26px;font-weight:700;letter-spacing:-0.02em;color:#ffffff;">GatiMitra</span>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:36px 28px 12px;">
              <p style="margin:0 0 14px;font-size:22px;font-weight:700;color:#111;">Hey There,</p>
              <p style="margin:0 0 10px;font-size:15px;line-height:1.55;color:#333;">
                Here's the link you requested to download the GatiMitra app.
              </p>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.55;color:#111;font-weight:700;">
                Open this email on your phone and tap on the button below.
              </p>
              <a href="${playUrl}"
                style="display:inline-block;background:${brand};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;">
                Get the GatiMitra App
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 36px 8px;">
              <ul style="margin:0;padding:0 0 0 18px;color:#333;font-size:14px;line-height:1.7;">
                <li style="margin-bottom:8px;">Order food from nearby restaurants and track live delivery.</li>
                <li style="margin-bottom:8px;">Book Bike, Auto, or Cab rides with trusted Captains.</li>
                <li style="margin-bottom:8px;">Send parcels and unlock exclusive offers in one app.</li>
              </ul>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 8px;">
              <hr style="border:none;border-top:1px solid #e8e8ec;margin:0;" />
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 28px 28px;">
              <a href="${iosUrl}" style="display:inline-block;margin:0 6px 10px;text-decoration:none;vertical-align:middle;">
                <img
                  src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83&amp;releaseDate=1288483200"
                  alt="Download on the App Store"
                  width="120"
                  height="40"
                  style="display:block;width:120px;height:auto;border:0;"
                />
              </a>
              <a href="${playUrl}" style="display:inline-block;margin:0 6px 10px;text-decoration:none;vertical-align:middle;">
                <img
                  src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
                  alt="Get it on Google Play"
                  width="155"
                  height="60"
                  style="display:block;width:140px;height:auto;border:0;"
                />
              </a>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 28px 28px;">
              <p style="margin:0 0 6px;font-size:11px;line-height:1.5;color:#888;">
                ©${year} GatiMitra, All rights reserved.
              </p>
              <p style="margin:0;font-size:11px;line-height:1.5;color:#888;">
                GATIMITRA ON DEMAND SERVICES PRIVATE LIMITED
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

async function sendAppLinkEmail(to: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const cfg = getSmtpConfig()
  if (!cfg.ok) {
    return {
      ok: false,
      error: 'Email is not configured. Set EMAIL_ID and EMAIL_APP_PASSWORD (Zoho) on the server.',
    }
  }

  const transporter = await createSmtpTransporter()
  const from = formatSmtpFrom()
  if (!transporter || !from) {
    return { ok: false, error: 'Email service could not start.' }
  }

  const androidUrl = resolveAndroidDownloadUrl()
  const iosUrl = resolveIosDownloadUrl()
  const playUrl = androidUrl.includes('play.google.com') ? androidUrl : CUSTOMER_PLAY_STORE_URL

  const subject = 'Your GatiMitra app download link'
  const text = [
    'Hey There,',
    '',
    "Here's the link you requested to download the GatiMitra app.",
    'Open this email on your phone and tap the link below.',
    '',
    `Get the GatiMitra App: ${playUrl}`,
    `App Store: ${iosUrl}`,
    '',
    '• Order food from nearby restaurants and track live delivery.',
    '• Book Bike, Auto, or Cab rides with trusted Captains.',
    '• Send parcels and unlock exclusive offers in one app.',
    '',
    '— Team GatiMitra',
  ].join('\n')

  const html = buildAppLinkEmailHtml(playUrl, iosUrl)

  try {
    await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    })
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[share-app-link] SMTP failed:', msg)
    if (/535|Invalid login|authentication/i.test(msg)) {
      return {
        ok: false,
        error: 'Zoho rejected SMTP login. Check EMAIL_ID / EMAIL_APP_PASSWORD (app password).',
      }
    }
    return { ok: false, error: 'Failed to send email. Please try again.' }
  }
}

async function sendAppLinkSms(
  mobileWithCountry: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const authKey = process.env.MSG91_AUTH_KEY?.trim()
  const sender = process.env.MSG91_SENDER_ID?.trim() || process.env.MSG91_SENDER?.trim() || 'GATIMT'
  if (!authKey) {
    return {
      ok: false,
      error: 'SMS is not configured. Switch to Email to receive the app link.',
    }
  }

  const playUrl = resolveAndroidDownloadUrl()
  const message = `Almost there! Download GatiMitra: ${playUrl}`

  try {
    const res = await fetch('https://api.msg91.com/api/v2/sendsms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authkey: authKey,
      },
      body: JSON.stringify({
        sender,
        route: '4',
        country: '91',
        sms: [{ message, to: [mobileWithCountry] }],
      }),
    })
    const data = (await res.json().catch(() => ({}))) as { type?: string; message?: string }
    if (!res.ok || (data.type && data.type !== 'success')) {
      console.error('[share-app-link] MSG91 failed:', data)
      return { ok: false, error: data.message || 'Failed to send SMS. Try Email instead.' }
    }
    return { ok: true }
  } catch (e) {
    console.error('[share-app-link] MSG91 error:', e)
    return { ok: false, error: 'Failed to send SMS. Try Email instead.' }
  }
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'

  if (!rateLimit(ip)) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests. Please try again later.' },
      { status: 429 }
    )
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 })
  }

  const mode = body.mode === 'email' ? 'email' : body.mode === 'phone' ? 'phone' : null
  const value = (body.value ?? '').trim()
  if (!mode) {
    return NextResponse.json({ ok: false, error: 'mode must be email or phone.' }, { status: 400 })
  }
  if (!value) {
    return NextResponse.json(
      { ok: false, error: mode === 'email' ? 'Enter your email address.' : 'Enter your phone number.' },
      { status: 400 }
    )
  }

  if (mode === 'email') {
    if (!validEmail(value)) {
      return NextResponse.json({ ok: false, error: 'Enter a valid email address.' }, { status: 400 })
    }
    const result = await sendAppLinkEmail(value)
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 503 })
    }
    return NextResponse.json({ ok: true, channel: 'email' })
  }

  const mobile = normalizeIndianPhone(value)
  if (!mobile) {
    return NextResponse.json(
      { ok: false, error: 'Enter a valid 10-digit Indian mobile number.' },
      { status: 400 }
    )
  }

  const result = await sendAppLinkSms(mobile)
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 503 })
  }
  return NextResponse.json({ ok: true, channel: 'sms' })
}
