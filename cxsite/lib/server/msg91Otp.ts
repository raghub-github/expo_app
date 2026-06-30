/**
 * MSG91 OTP delivery (server-only).
 *
 * India: v5/otp often returns HTTP 200 without delivering SMS on our account.
 * Use Flow API (DLT template) → legacy sendotp.php → v2/sendsms (same order as backend).
 */

const MSG91_FLOW_URL = 'https://control.msg91.com/api/v5/flow/'
const MSG91_V5_OTP_URL = 'https://control.msg91.com/api/v5/otp'
const MSG91_LEGACY_SEND_OTP_URL = 'https://api.msg91.com/api/sendotp.php'

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

/** MSG91 dashboard IDs are hex-ish; skip obvious typos. */
function isPlausibleMsg91Id(id: string): boolean {
  const s = id.trim()
  if (s.length < 20) return false
  return /^[a-f0-9]+$/i.test(s)
}

type Msg91Attempt = { channel: string; ok: boolean; error?: string; detail?: string }

function parseMsg91Json(raw: string): { type?: string; message?: string; request_id?: string } {
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw) as { type?: string; message?: string; request_id?: string }
  } catch {
    return {}
  }
}

function isMsg91Success(res: Response, data: { type?: string }): boolean {
  return res.ok && data.type === 'success'
}

function logAttemptDev(attempt: Msg91Attempt): void {
  if (process.env.NODE_ENV === 'production') return
  console.log(
    `[MSG91] ${attempt.channel}: ${attempt.ok ? 'OK' : 'FAIL'}`,
    attempt.detail ?? attempt.error ?? ''
  )
}

async function sendViaFlowApi(args: {
  authKey: string
  sender: string
  mobileWithCountry: string
  otp: string
  otpVarName: string
  flowId: string
  templateId?: string
}): Promise<Msg91Attempt> {
  const { authKey, sender, mobileWithCountry, otp, otpVarName, flowId, templateId } = args
  const recipient: Record<string, string> = { mobiles: mobileWithCountry }
  recipient[otpVarName] = otp
  recipient.OTP = otp
  recipient.Code = otp
  if (otpVarName !== 'VAR1') recipient.VAR1 = otp

  const payload: Record<string, unknown> = {
    sender,
    short_url: '0',
    recipients: [recipient],
  }
  if (templateId) payload.template_id = templateId
  else payload.flow_id = flowId

  const res = await fetch(MSG91_FLOW_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authkey: authKey },
    body: JSON.stringify(payload),
  })
  const raw = await res.text()
  const data = parseMsg91Json(raw)
  const channel = templateId ? 'flow_template_id' : 'flow_id'

  if (!isMsg91Success(res, data)) {
    return {
      channel,
      ok: false,
      error: data.message || res.statusText || 'MSG91 Flow error',
      detail: raw.slice(0, 500),
    }
  }
  return { channel, ok: true, detail: data.request_id ?? data.message ?? raw.slice(0, 200) }
}

async function sendViaLegacyOtpApi(args: {
  authKey: string
  sender: string
  mobileWithCountry: string
  otp: string
  otpExpiryMin: number
}): Promise<Msg91Attempt> {
  const params = new URLSearchParams({
    authkey: args.authKey,
    mobile: args.mobileWithCountry,
    otp: args.otp,
    otp_length: '6',
    otp_expiry: String(Math.max(1, args.otpExpiryMin)),
    ...(args.sender ? { sender: args.sender } : {}),
  })
  const res = await fetch(`${MSG91_LEGACY_SEND_OTP_URL}?${params.toString()}`, { method: 'GET' })
  const raw = await res.text()
  const data = parseMsg91Json(raw)
  const channel = 'legacy_sendotp'

  if (!res.ok || data.type === 'error') {
    return {
      channel,
      ok: false,
      error: data.message ?? 'MSG91 sendotp error',
      detail: raw.slice(0, 500),
    }
  }
  if (data.type !== 'success') {
    return {
      channel,
      ok: false,
      error: data.message ?? `Unexpected MSG91 response type: ${data.type ?? 'unknown'}`,
      detail: raw.slice(0, 500),
    }
  }
  return { channel, ok: true, detail: data.message ?? raw.slice(0, 200) }
}

async function sendViaV2Sms(args: {
  authKey: string
  sender: string
  mobile: string
  otp: string
  templateContent?: string
}): Promise<Msg91Attempt> {
  const template =
    args.templateContent?.trim() ||
    'Dear User, your OTP for Gatimitra account verification is ##OTP##. It is valid for 10 minutes. Do not share it with anyone.'
  const message = template.replace(/##OTP##/g, args.otp)

  const res = await fetch('https://api.msg91.com/api/v2/sendsms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authkey: args.authKey },
    body: JSON.stringify({
      sender: args.sender,
      route: '4',
      country: '91',
      sms: [{ message, to: [args.mobile] }],
    }),
  })
  const raw = await res.text()
  const data = parseMsg91Json(raw)
  const channel = 'v2_sendsms'

  if (!isMsg91Success(res, data)) {
    return {
      channel,
      ok: false,
      error: data.message || res.statusText || 'MSG91 sendsms error',
      detail: raw.slice(0, 500),
    }
  }
  return { channel, ok: true, detail: data.message ?? raw.slice(0, 200) }
}

/**
 * Deliver a server-generated OTP via MSG91 (Flow → legacy → v2).
 * Skips v5/otp — it returns success without delivery on our MSG91 account.
 */
export async function msg91SendOtp(
  mobileDigits: string,
  otp: string
): Promise<{ ok: boolean; message?: string; channel?: string }> {
  const authKey = getMsg91AuthKey()
  if (!authKey) {
    return { ok: false, message: 'MSG91_AUTH_KEY not configured' }
  }

  const trimmedOtp = otp.trim()
  if (!/^\d{4,8}$/.test(trimmedOtp)) {
    return { ok: false, message: 'Invalid OTP for SMS delivery' }
  }

  const mobileWithCountry = mobileDigits.replace(/^\+/, '')
  const mobile10 =
    mobileWithCountry.length === 12 && mobileWithCountry.startsWith('91')
      ? mobileWithCountry.slice(2)
      : mobileWithCountry.length > 10
        ? mobileWithCountry.slice(-10)
        : mobileWithCountry

  const flowIdRaw = flowId()
  const tplId = templateId()
  const flowIdPlausible = flowIdRaw && isPlausibleMsg91Id(flowIdRaw) ? flowIdRaw : undefined
  const tplIdPlausible = tplId && isPlausibleMsg91Id(tplId) ? tplId : undefined
  const otpVarName = process.env.MSG91_OTP_VAR_NAME?.trim() || 'OTP'
  const sender = process.env.MSG91_SENDER_ID?.trim() || 'GMMSMS'
  const otpExpiryMin = Math.max(
    1,
    Math.ceil(Number(process.env.MSG91_OTP_EXPIRY_SEC || 600) / 60)
  )

  const attempts: Msg91Attempt[] = []

  const tryChannel = async (
    attempt: Msg91Attempt
  ): Promise<{ ok: true; channel: string } | null> => {
    attempts.push(attempt)
    logAttemptDev(attempt)
    return attempt.ok ? { ok: true, channel: attempt.channel } : null
  }

  try {
    if (flowIdPlausible || tplIdPlausible) {
      const flowAttempt = await sendViaFlowApi({
        authKey,
        sender,
        mobileWithCountry,
        otp: trimmedOtp,
        otpVarName,
        flowId: flowIdPlausible ?? tplIdPlausible!,
        templateId: tplIdPlausible,
      })
      const flowResult = await tryChannel(flowAttempt)
      if (flowResult) return { ok: true, channel: flowResult.channel }
    }

    const legacyResult = await tryChannel(
      await sendViaLegacyOtpApi({
        authKey,
        sender,
        mobileWithCountry,
        otp: trimmedOtp,
        otpExpiryMin,
      })
    )
    if (legacyResult) return { ok: true, channel: legacyResult.channel }

    const v2Result = await tryChannel(
      await sendViaV2Sms({
        authKey,
        sender,
        mobile: mobile10,
        otp: trimmedOtp,
        templateContent: process.env.MSG91_OTP_TEMPLATE_CONTENT,
      })
    )
    if (v2Result) return { ok: true, channel: v2Result.channel }

    const lastError =
      attempts.map((a) => `${a.channel}: ${a.error ?? 'unknown'}`).join('; ') ||
      'All MSG91 channels failed'
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[MSG91] All delivery attempts failed:', attempts)
    }
    return { ok: false, message: lastError }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'MSG91 request failed'
    return { ok: false, message: msg }
  }
}

/** Legacy MSG91 verify — only used if server-side OTP store has no entry. */
export async function msg91VerifyOtp(
  mobileDigits: string,
  otp: string
): Promise<{ ok: boolean; message?: string }> {
  const mobile = mobileDigits.replace(/^\+/, '')
  const trimmed = otp.trim()
  if (!trimmed) return { ok: false, message: 'Missing OTP' }

  const authKey = getMsg91AuthKey()
  if (!authKey) return { ok: false, message: 'MSG91 not configured' }

  const base = (process.env.MSG91_API_BASE || 'https://control.msg91.com').replace(/\/$/, '')
  const u = new URL(`${base}/api/v5/otp/verify`)
  u.searchParams.set('otp', trimmed)
  u.searchParams.set('mobile', mobile)

  const res = await fetch(u.toString(), { headers: { authkey: authKey } })
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
  if (res.ok) return { ok: true }
  return { ok: false, message: String(j.message || 'Verification failed') }
}
