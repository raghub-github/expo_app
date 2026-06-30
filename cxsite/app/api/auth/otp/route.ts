import { NextRequest, NextResponse } from 'next/server'
import { toMsg91MobileDigits } from '@/lib/phoneNormalize'
import { isMsg91OtpConfigured, msg91SendOtp, msg91VerifyOtp } from '@/lib/server/msg91Otp'

export const runtime = 'nodejs'

const otpStore = new Map<string, { otp: string; expiresAt: number }>()

function isTerminalOtpEnabled(): boolean {
  const raw = String(process.env.SHOW_OTP_IN_TERMINAL || '').trim().toLowerCase()
  return process.env.NODE_ENV === 'development' && ['1', 'true', 'yes', 'on'].includes(raw)
}

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

function otpExpiryMs(): number {
  const sec = Number(process.env.MSG91_OTP_EXPIRY_SEC || 600)
  return Date.now() + Math.max(60, sec) * 1000
}

export async function POST(req: NextRequest) {
  let body: { action?: string; phone?: string; otp?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const action = body.action
  const phone = body.phone
  if (!phone || typeof phone !== 'string') {
    return NextResponse.json({ error: 'phone required' }, { status: 400 })
  }

  const mobile = toMsg91MobileDigits(phone)
  if (!mobile) {
    return NextResponse.json({ error: 'invalid phone' }, { status: 400 })
  }

  if (action === 'send') {
    if (!isMsg91OtpConfigured()) {
      console.warn(
        '[api/auth/otp] SMS disabled (demo mode): set MSG91_AUTH_KEY and MSG91_TEMPLATE_ID and/or MSG91_FLOW_ID in .env.local, then restart dev server'
      )
      return NextResponse.json({
        channel: 'demo',
        configured: false,
        hint: 'Server has no MSG91 auth key + template/flow. Check .env.local and restart npm run dev.',
      })
    }

    const otp = generateOtp()
    otpStore.set(mobile, { otp, expiresAt: otpExpiryMs() })

    console.log('[api/auth/otp] sending via MSG91', {
      mobile: `${mobile.slice(0, 4)}****${mobile.slice(-2)}`,
    })

    if (process.env.NODE_ENV !== 'production' || isTerminalOtpEnabled()) {
      console.log('[api/auth/otp] OTP (dev):', { mobile, otp })
    }

    const sent = await msg91SendOtp(mobile, otp)
    if (!sent.ok) {
      otpStore.delete(mobile)
      console.error('[api/auth/otp] MSG91 send failed:', sent.message)
      return NextResponse.json(
        { channel: 'msg91', error: sent.message || 'Failed to send OTP' },
        { status: 502 }
      )
    }

    console.log('[api/auth/otp] MSG91 send accepted', { channel: sent.channel })
    return NextResponse.json({ channel: 'msg91', ok: true, configured: true })
  }

  if (action === 'verify') {
    const otp = body.otp
    if (!otp || typeof otp !== 'string') {
      return NextResponse.json({ error: 'otp required' }, { status: 400 })
    }

    const entry = otpStore.get(mobile)
    if (entry) {
      if (Date.now() > entry.expiresAt) {
        otpStore.delete(mobile)
        return NextResponse.json({ valid: false, message: 'OTP expired. Please request a new OTP.' })
      }
      if (entry.otp !== otp.trim()) {
        return NextResponse.json({ valid: false, message: 'Invalid OTP. Please try again.' })
      }
      otpStore.delete(mobile)
      return NextResponse.json({ valid: true, message: 'Verified' })
    }

    if (!isMsg91OtpConfigured()) {
      return NextResponse.json({ legacy: true }, { status: 501 })
    }

    const v = await msg91VerifyOtp(mobile, otp)
    return NextResponse.json({ valid: v.ok, message: v.message })
  }

  return NextResponse.json({ error: 'use action send or verify' }, { status: 400 })
}
