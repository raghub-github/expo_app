import { NextRequest, NextResponse } from 'next/server';

// In-memory dummy OTP store (for demo only)
const otpStore: Record<string, string> = {};

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json();
    if (!phone) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    // Do NOT check database or parent existence here!

    // Generate dummy OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[phone] = otp;

    return NextResponse.json({ status: 'otp', otp });
  } catch (err) {
    console.error('API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
