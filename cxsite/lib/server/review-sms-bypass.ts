/**
 * Same review-SMS suppress rules as partnersite/backend (env-driven, no hardcoding).
 */

function truthy(raw: string | undefined): boolean {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

export function canonicalSubscriberDigits(phone: string | null | undefined): string | null {
  let d = String(phone ?? '').replace(/\D/g, '')
  if (!d) return null
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  if (d.length === 10) return d
  if (d.length > 10) {
    const last10 = d.slice(-10)
    return last10.length === 10 ? last10 : null
  }
  return null
}

export function maskReviewPhone(phone: string | null | undefined): string {
  const c = canonicalSubscriberDigits(phone)
  if (!c) return '****'
  return `${c.slice(0, 3)}*****${c.slice(-3)}`
}

type Env = Record<string, string | undefined>

function armedPhoneKeys(env: Env): Map<string, string> {
  const map = new Map<string, string>()
  const add = (enabled: boolean, phone: string | undefined, otp: string | undefined) => {
    if (!enabled || !phone?.trim() || !otp?.trim()) return
    const key = canonicalSubscriberDigits(phone)
    if (key) map.set(key, otp.trim())
  }
  add(truthy(env.GOOGLE_REVIEW_MODE), env.GOOGLE_REVIEW_PHONE, env.GOOGLE_REVIEW_OTP)
  add(
    truthy(env.REVIEW_LOGIN_BYPASS_ENABLED),
    env.REVIEW_LOGIN_PHONE,
    env.REVIEW_LOGIN_FIXED_OTP
  )
  add(
    truthy(env.RIDER_REVIEW_LOGIN_BYPASS_ENABLED),
    env.RIDER_REVIEW_LOGIN_PHONE,
    env.RIDER_REVIEW_LOGIN_FIXED_OTP
  )
  return map
}

export function shouldSuppressMsg91Sms(
  phone: string,
  env: Env = process.env
): { suppress: true; reason: 'review_bypass' | 'sms_blocked'; otp?: string } | { suppress: false } {
  const key = canonicalSubscriberDigits(phone)
  if (!key) return { suppress: false }

  const armed = armedPhoneKeys(env)
  if (armed.has(key)) {
    return { suppress: true, reason: 'review_bypass', otp: armed.get(key) }
  }

  for (const part of String(env.SMS_BLOCKED_PHONES ?? '').split(',')) {
    const bk = canonicalSubscriberDigits(part)
    if (bk && bk === key) return { suppress: true, reason: 'sms_blocked' }
  }
  return { suppress: false }
}

/**
 * Cxsite customer `/api/auth/otp` — only Google Play review phone gets fixed OTP.
 * Merchant/rider review numbers still receive real MSG91 SMS on the website.
 */
export function shouldSuppressCxCustomerOtp(
  phone: string,
  env: Env = process.env
): { suppress: true; reason: 'review_bypass' | 'sms_blocked'; otp?: string } | { suppress: false } {
  const key = canonicalSubscriberDigits(phone)
  if (!key) return { suppress: false }

  if (truthy(env.GOOGLE_REVIEW_MODE)) {
    const reviewKey = canonicalSubscriberDigits(env.GOOGLE_REVIEW_PHONE)
    const reviewOtp = env.GOOGLE_REVIEW_OTP?.trim()
    if (reviewKey && reviewOtp && reviewKey === key) {
      return { suppress: true, reason: 'review_bypass', otp: reviewOtp }
    }
  }

  for (const part of String(env.SMS_BLOCKED_PHONES ?? '').split(',')) {
    const bk = canonicalSubscriberDigits(part)
    if (bk && bk === key) return { suppress: true, reason: 'sms_blocked' }
  }
  return { suppress: false }
}
