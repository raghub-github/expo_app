/**
 * MSG91 OTP (server-only). Credentials in env only.
 * Supports SendOTP (template) and Flow API — see isMsg91OtpConfigured().
 */

const DEFAULT_BASE = 'https://control.msg91.com'

export function getMsg91AuthKey(): string | undefined {
  const k =
    process.env.MSG91_AUTH_KEY?.trim() ||
    process.env.MSG91_AUTHKEY?.trim() ||
    process.env.MSG91_KEY?.trim()
  return k || undefined
}

function flowId(): string | undefined {
  return process.env.MSG91_FLOW_ID?.trim() || undefined
}

function templateId(): string | undefined {
  return (
    process.env.MSG91_TEMPLATE_ID?.trim() ||
    process.env.MSG91_TEMPLATEID?.trim() ||
    undefined
  )
}

export function isMsg91OtpConfigured(): boolean {
  return Boolean(getMsg91AuthKey() && (flowId() || templateId()))
}

function controlBase(): string {
  return (process.env.MSG91_API_BASE || DEFAULT_BASE).replace(/\/$/, '')
}

function authKey(): string {
  return getMsg91AuthKey()!
}

/** Prefer Flow when USE_FLOW=1, or when only FLOW_ID is set (no template). */
function useFlowApi(): boolean {
  const f = flowId()
  const t = templateId()
  if (!f) return false
  if (process.env.MSG91_USE_FLOW === '1') return true
  if (!t) return true
  return false
}

function interpretSendResponse(
  res: Response,
  j: Record<string, unknown>
): { ok: boolean; message?: string } {
  const type = String(j.type ?? '').toLowerCase()
  const msg = String(j.message ?? j.msg ?? j.error ?? '')

  if (type === 'error' || type === 'fail' || type === 'failure') {
    return { ok: false, message: msg || 'MSG91 returned an error' }
  }
  if (msg && /invalid\s*auth|authentication\s*fail|unauthori/i.test(msg)) {
    return { ok: false, message: msg }
  }
  if (type === 'success') {
    return { ok: true }
  }
  if (msg && /otp\s*sent|success/i.test(msg)) {
    return { ok: true }
  }
  if (!res.ok) {
    return { ok: false, message: msg || `HTTP ${res.status}` }
  }
  if (j.request_id != null || typeof j.message === 'string') {
    return { ok: true }
  }
  return { ok: false, message: msg || 'Unexpected MSG91 response (check server logs)' }
}

/** MSG91 expects mobile with country code, no + (e.g. 917367878981) */
export async function msg91SendOtp(
  mobileDigits: string,
  otpOverride?: string
): Promise<{ ok: boolean; message?: string }> {
  const mobile = mobileDigits.replace(/^\+/, '')
  const key = authKey()

  if (useFlowApi() && flowId()) {
    const res = await fetch('https://api.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authkey: key,
      },
      body: JSON.stringify({
        flow_id: flowId(),
        mobiles: mobile,
        ...(process.env.MSG91_SENDER_ID?.trim()
          ? { sender: process.env.MSG91_SENDER_ID.trim() }
          : {}),
      }),
    })
    const text = await res.text()
    let j: Record<string, unknown> = {}
    try {
      j = JSON.parse(text) as Record<string, unknown>
    } catch {
      j = { _raw: text }
    }
    if (process.env.NODE_ENV === 'development') {
      console.log('[MSG91] Flow send', { status: res.status, body: j })
    }
    const type = String(j.type ?? '').toLowerCase()
    if (type === 'error' || type === 'fail') {
      return { ok: false, message: String(j.message || j.error || text.slice(0, 200)) }
    }
    if (!res.ok) {
      return { ok: false, message: String(j.message || j.error || `HTTP ${res.status}`) }
    }
    return { ok: true }
  }

  const tid = templateId()
  if (!tid) {
    return {
      ok: false,
      message: 'Set MSG91_TEMPLATE_ID or MSG91_FLOW_ID in .env.local',
    }
  }

  const expirySec = Number(process.env.MSG91_OTP_EXPIRY_SEC || 600)
  const otpExpiryMinutes = Math.min(1440, Math.max(1, Math.ceil(expirySec / 60)))

  const body: Record<string, unknown> = {
    template_id: tid,
    mobile,
    otp_length: 6,
    otp_expiry: otpExpiryMinutes,
    ...(otpOverride ? { otp: otpOverride } : {}),
  }
  const sender = process.env.MSG91_SENDER_ID?.trim()
  if (sender) body.sender = sender

  const url = `${controlBase()}/api/v5/otp`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authkey: key,
    },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  let j: Record<string, unknown> = {}
  try {
    j = JSON.parse(text) as Record<string, unknown>
  } catch {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[MSG91] Non-JSON send response', text.slice(0, 500))
    }
    return { ok: false, message: text.slice(0, 200) || `HTTP ${res.status}` }
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('[MSG91] Template send', { url, status: res.status, body: j })
  }

  const out = interpretSendResponse(res, j)
  if (!out.ok && process.env.MSG91_FALLBACK_FLOW === '1' && flowId()) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[MSG91] Template failed, retrying Flow API')
    }
    const res2 = await fetch('https://api.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authkey: key },
      body: JSON.stringify({
        flow_id: flowId(),
        mobiles: mobile,
        ...(sender ? { sender } : {}),
      }),
    })
    const t2 = await res2.text()
    let j2: Record<string, unknown> = {}
    try {
      j2 = JSON.parse(t2) as Record<string, unknown>
    } catch {
      /* ignore */
    }
    if (process.env.NODE_ENV === 'development') {
      console.log('[MSG91] Flow fallback', { status: res2.status, body: j2 })
    }
    if (res2.ok && String(j2.type || '').toLowerCase() !== 'error') {
      return { ok: true }
    }
  }

  return out
}

export async function msg91VerifyOtp(
  mobileDigits: string,
  otp: string
): Promise<{ ok: boolean; message?: string }> {
  const mobile = mobileDigits.replace(/^\+/, '')
  const trimmed = otp.trim()
  if (!trimmed) return { ok: false, message: 'Missing OTP' }

  const u = new URL(`${controlBase()}/api/v5/otp/verify`)
  u.searchParams.set('otp', trimmed)
  u.searchParams.set('mobile', mobile)

  const res = await fetch(u.toString(), {
    headers: { authkey: authKey() },
  })

  const text = await res.text()
  let j: Record<string, unknown> = {}
  try {
    j = JSON.parse(text) as Record<string, unknown>
  } catch {
    return { ok: false, message: text.slice(0, 120) }
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('[MSG91] verify', { status: res.status, body: j })
  }

  if (String(j.type || '').toLowerCase() === 'error') {
    return { ok: false, message: String(j.message || 'Invalid OTP') }
  }
  if (String(j.type || '').toLowerCase() === 'success') {
    return { ok: true }
  }
  if (String(j.message || '').toLowerCase().includes('verified')) {
    return { ok: true }
  }
  if (res.ok) {
    return { ok: true }
  }
  return { ok: false, message: String(j.message || 'Verification failed') }
}
