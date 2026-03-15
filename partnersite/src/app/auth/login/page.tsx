'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { signInWithGoogle, requestPhoneOTP, verifyPhoneOTP } from '@/lib/auth/supabase-client';
import { clearSupabaseClientSession } from '@/lib/auth/clear-auth-storage';
import { getOrCreateDeviceId } from '@/lib/auth/device-id-client';
import { ENABLE_PHONE_OTP_LOGIN } from '@/lib/auth/phone-otp-config';
import { LoginCard } from './components/LoginCard';
import { LoginToggle, type LoginTab } from './components/LoginToggle';
import { GoogleLoginButton } from './components/GoogleLoginButton';
import { PhoneLoginForm } from './components/PhoneLoginForm';

const RESEND_OTP_COOLDOWN_SEC = 30;

function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  return ten.length === 10 ? `+91${ten}` : '';
}

function messageFromReason(reason: string | null): string {
  if (!reason?.trim()) return '';
  switch (reason.trim().toLowerCase()) {
    case 'session_invalid':
      return 'Your session expired or was invalid. Please sign in again.';
    case 'session_expired':
      return 'Your session has expired. Please sign in again.';
    default:
      return '';
  }
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<LoginTab>('google');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const registered = searchParams?.get('registered');
  const queryError = searchParams?.get('error');
  const reason = searchParams?.get('reason');
  const redirectTo = searchParams?.get('redirect');
  const oauthCode = searchParams?.get('code');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (redirectTo) {
      sessionStorage.setItem('auth_redirect', redirectTo);
    } else {
      // Ensure after login we always go to child store list, not auth home (no stale /auth)
      sessionStorage.setItem('auth_redirect', '/auth/post-login');
    }
  }, [redirectTo]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (oauthCode) return;
    clearSupabaseClientSession();
  }, [oauthCode]);

  useEffect(() => {
    if (typeof window === 'undefined' || !oauthCode) return;
    const callbackUrl = new URL('/auth/callback', window.location.origin);
    searchParams?.forEach((value, key) => callbackUrl.searchParams.set(key, value));
    router.replace(callbackUrl.pathname + '?' + callbackUrl.searchParams.toString());
  }, [oauthCode, router, searchParams]);

  const normalizeLoginError = (raw: string) => {
    const message = (raw || '').trim();
    if (!message) return '';
    if (message === 'authentication_failed') {
      return 'Authentication failed. Please try signing in again.';
    }
    if (message.toLowerCase().includes('no merchant account found')) {
      return 'No merchant account found for this login. Please register first.';
    }
    return message;
  };

  useEffect(() => {
    if (registered === '1') setError('');
  }, [registered]);

  useEffect(() => {
    const fromError = normalizeLoginError(queryError || '');
    if (fromError) {
      setError(fromError);
      return;
    }
    const fromReason = messageFromReason(reason || null);
    if (fromReason) setError(fromReason);
    else setError('');
  }, [queryError, reason]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setInterval(() => setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1)), 1000);
      return () => clearInterval(timer);
    }
  }, [resendCooldown]);

  const setSessionAndRedirect = async (access_token: string, refresh_token: string) => {
    const device_id = getOrCreateDeviceId();
    const doSetCookie = () =>
      fetch('/api/merchant-auth/set-cookie', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token, refresh_token, device_id }),
      });

    let res = await doSetCookie();
    if (!res.ok && res.status === 502) {
      res = await doSetCookie();
    }
    if (!res.ok) {
      if (res.status === 502) {
        const check = await fetch('/api/merchant-auth/resolve-session', { credentials: 'include' });
        if (check.ok) {
          let next =
            (typeof window !== 'undefined' && sessionStorage.getItem('auth_redirect')) ||
            redirectTo ||
            '/auth/post-login';
          if (typeof window !== 'undefined' && sessionStorage.getItem('auth_redirect')) {
            sessionStorage.removeItem('auth_redirect');
          }
          if (next === '/auth' || next === '/auth/') next = '/auth/post-login';
          window.location.href = next.startsWith('/') ? next : '/auth/post-login';
          return;
        }
        throw new Error('Server temporarily unavailable (502). Please try again.');
      }
      const data = await res.json().catch(() => ({})) as { error?: string; code?: string };
      throw new Error(data.error || 'Session could not be set.');
    }
    let next =
      (typeof window !== 'undefined' && sessionStorage.getItem('auth_redirect')) ||
      redirectTo ||
      '/auth/post-login';
    if (typeof window !== 'undefined' && sessionStorage.getItem('auth_redirect')) {
      sessionStorage.removeItem('auth_redirect');
    }
    if (next === '/auth' || next === '/auth/') next = '/auth/post-login';
    window.location.href = next.startsWith('/') ? next : '/auth/post-login';
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError('');
    const result = await signInWithGoogle();
    if (!result.success) {
      setError(result.error || 'Google sign-in failed.');
      setGoogleLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const p = normalizePhone(phone);
    if (!p) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    setLoading(true);
    try {
      const checkRes = await fetch(`/api/auth/check-existing?phone=${encodeURIComponent(p)}`);
      const checkData = await checkRes.json().catch(() => ({}));
      if (checkData.exists !== true) {
        setError('No merchant account found for this mobile number. Please register first.');
        setLoading(false);
        return;
      }
      const result = await requestPhoneOTP(p);
      if (!result.success) {
        const msg = result.error || 'Failed to send OTP.';
        if (
          msg.toLowerCase().includes('unsupported phone provider') ||
          msg.toLowerCase().includes('phone provider')
        ) {
          setError('SMS is not configured. Please sign in with Google or contact support.');
        } else {
          setError(msg);
        }
        return;
      }
      setOtpSent(true);
      setResendCooldown(RESEND_OTP_COOLDOWN_SEC);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    const p = normalizePhone(phone);
    if (!p) return;
    setError('');
    setOtp('');
    setLoading(true);
    try {
      const checkRes = await fetch(`/api/auth/check-existing?phone=${encodeURIComponent(p)}`);
      const checkData = await checkRes.json().catch(() => ({}));
      if (checkData.exists !== true) {
        setError('No merchant account found for this mobile number. Please register first.');
        setLoading(false);
        return;
      }
      const result = await requestPhoneOTP(p);
      if (!result.success) {
        setError(result.error || 'Failed to resend OTP.');
        return;
      }
      setResendCooldown(RESEND_OTP_COOLDOWN_SEC);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const p = normalizePhone(phone);
    const digits = otp.replace(/\D/g, '').slice(0, 6);
    if (!p || digits.length < 6) {
      setError('Enter the 6-digit OTP you received.');
      return;
    }
    setLoading(true);
    try {
      const result = await verifyPhoneOTP(p, digits);
      if (!result.success) {
        setError(result.error || 'Invalid or expired OTP.');
        return;
      }
      if (!result.data?.session?.access_token || !result.data?.session?.refresh_token) {
        setError('Session could not be created. Try again.');
        return;
      }
      await setSessionAndRedirect(
        result.data.session.access_token,
        result.data.session.refresh_token
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeNumber = () => {
    setOtpSent(false);
    setOtp('');
    setError('');
    setResendCooldown(0);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      <div
        className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-orange-50/40"
        aria-hidden
      />
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%230f172a' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
        aria-hidden
      />
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-gradient-to-b from-orange-100/30 to-transparent rounded-full blur-3xl pointer-events-none"
        aria-hidden
      />

      <div className="relative w-full flex justify-center">
        <LoginCard>
          <div className="pt-8 pb-2 px-6 sm:px-8 text-center">
            <div className="flex justify-center mb-5">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white border border-slate-200/80 shadow-sm overflow-hidden">
                <Image
                  src="/onlylogo.png"
                  alt="GatiMitra"
                  width={64}
                  height={64}
                  className="h-12 w-12 object-contain"
                />
              </div>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Merchant Login
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Sign in with Google or use phone OTP
            </p>
          </div>

          <div className="px-6 sm:px-8 pb-8 pt-4">
            {registered === '1' && (
              <div className="mb-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-sm font-medium">
                Registration successful. Sign in below.
              </div>
            )}

            {error && (
              <div className="mb-4 p-3.5 rounded-xl bg-red-50 border border-red-200/80 text-red-800 text-sm">
                {error}
              </div>
            )}

            <LoginToggle
              value={tab}
              onChange={setTab}
              disabled={loading || googleLoading}
            />

            {/* Content area: no min-height so card height adjusts automatically with toggle/content */}
            <div className="mt-6">
              {tab === 'google' && (
                <GoogleLoginButton
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  loading={googleLoading}
                  primary
                />
              )}
              {tab === 'phone' && (
                <PhoneLoginForm
                  phone={phone}
                  onPhoneChange={setPhone}
                  otp={otp}
                  onOtpChange={setOtp}
                  otpSent={otpSent}
                  loading={loading}
                  resendCooldown={resendCooldown}
                  onSendOtp={handleSendOtp}
                  onVerifyOtp={handleVerifyOtp}
                  onResendOtp={handleResendOtp}
                  onChangeNumber={handleChangeNumber}
                  phoneOtpEnabled={ENABLE_PHONE_OTP_LOGIN}
                />
              )}
            </div>

            <p className="mt-6 text-center text-sm text-slate-600">
              Not registered?{' '}
              <Link
                href="/auth/register"
                className="font-medium text-orange-600 hover:text-orange-700 hover:underline"
              >
                Register first
              </Link>
            </p>
            <p className="mt-2 text-center text-sm text-slate-500">
              <Link href="/auth" className="text-slate-500 hover:text-slate-700 hover:underline">
                Back to home
              </Link>
            </p>
          </div>
        </LoginCard>
      </div>
    </div>
  );
}

function LoginPageFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-orange-50/20 to-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-200 p-8">
        <div className="text-center mb-6">
          <div className="inline-flex p-3 mb-4">
            <Image
              src="/onlylogo.png"
              alt="GatiMitra"
              width={48}
              height={48}
              className="h-12 w-auto object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Merchant Login</h1>
        </div>
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}
