'use client';

import { useState, useEffect, Suspense, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { signInWithGoogle, requestPhoneOTP, verifyPhoneOTP } from '@/lib/auth/supabase-client';
import { clearSupabaseClientSession } from '@/lib/auth/clear-auth-storage';
import { getOrCreateDeviceId } from '@/lib/auth/device-id-client';
import { ENABLE_PHONE_OTP_LOGIN } from '@/lib/auth/phone-otp-config';
import { clearPartnerStoreSelection } from '@/lib/partner-selected-store';
import { clearPushSessionDismissed } from '@/lib/browser-push/partner-push-state';
import { LoginPageShell } from './components/LoginPageShell';
import { LoginFormHeader } from './components/LoginFormHeader';
import { LoginToggle, type LoginTab } from './components/LoginToggle';
import { GoogleLoginButton } from './components/GoogleLoginButton';
import { PhoneLoginForm } from './components/PhoneLoginForm';
import { normalizeAuthRedirect } from '@/lib/auth/normalize-auth-redirect';
import { PARTNER_AUTH_TOAST_MS } from '@/lib/auth/partner-auth-toast';
import { toast } from 'sonner';

const RESEND_OTP_COOLDOWN_SEC = 30;

function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  return ten.length === 10 ? `+91${ten}` : '';
}

function showLoginError(msg: string) {
  if (!msg) return;
  toast.error(msg, { duration: PARTNER_AUTH_TOAST_MS });
}

function messageFromReason(reason: string | null): string {
  if (!reason?.trim()) return '';
  switch (reason.trim().toLowerCase()) {
    case 'session_invalid':
      return 'Your session expired or was invalid. Please sign in again.';
    case 'session_expired':
      return 'Your session has expired. Please sign in again.';
    case 'device_session_invalid':
      return 'Your session is not valid for this device. Please sign in again.';
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
  const [resendCooldown, setResendCooldown] = useState(0);

  const registered = searchParams?.get('registered');
  const queryError = searchParams?.get('error');
  const reason = searchParams?.get('reason');
  const redirectTo = normalizeAuthRedirect(searchParams?.get('redirect'));
  const oauthCode = searchParams?.get('code');

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Never reuse another account's store selection across logins
    clearPartnerStoreSelection();
    clearPushSessionDismissed();
    // If opened via non-routable 0.0.0.0 (common after bad OAuth Site URL), bounce to localhost.
    const host = window.location.hostname;
    if (host === "0.0.0.0" || host === "[::]") {
      const fixed = new URL(window.location.href);
      fixed.hostname = "localhost";
      window.location.replace(fixed.toString());
      return;
    }
    // Supabase Site URL misconfig can land OAuth codes on gatimitra.com — bounce to partner portal.
    if (host === "gatimitra.com" || host === "www.gatimitra.com") {
      const partner = new URL(window.location.href);
      partner.hostname = "partner.gatimitra.com";
      partner.protocol = "https:";
      window.location.replace(partner.toString());
      return;
    }
    sessionStorage.setItem('auth_redirect', redirectTo);
    const rawRedirect = searchParams?.get('redirect');
    if (rawRedirect && normalizeAuthRedirect(rawRedirect) !== rawRedirect.trim()) {
      const fixed = new URL(window.location.href);
      fixed.searchParams.set('redirect', redirectTo);
      router.replace(fixed.pathname + fixed.search);
    }
  }, [redirectTo, router, searchParams]);

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
    if (message.toLowerCase().includes('flow state')) {
      return 'Google sign-in did not complete. Please try again.';
    }
    if (message.toLowerCase().includes('no merchant account found')) {
      return 'No merchant account found for this login. Please register first.';
    }
    return message;
  };

  useEffect(() => {
    const fromError = normalizeLoginError(queryError || '');
    if (fromError) {
      showLoginError(fromError);
      return;
    }
    const fromReason = messageFromReason(reason || null);
    if (fromReason) showLoginError(fromReason);
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
          let next = normalizeAuthRedirect(
            (typeof window !== 'undefined' && sessionStorage.getItem('auth_redirect')) ||
              redirectTo ||
              '/partners/all-stores'
          );
          if (typeof window !== 'undefined' && sessionStorage.getItem('auth_redirect')) {
            sessionStorage.removeItem('auth_redirect');
          }
          if (typeof next === 'string' && next.startsWith('/partners/') && !next.startsWith('/partners/all-stores')) {
            next = '/partners/all-stores';
          }
          clearPushSessionDismissed();
          window.location.replace(next.startsWith('/') ? next : '/partners/all-stores');
          return;
        }
        throw new Error('Server temporarily unavailable (502). Please try again.');
      }
      const data = await res.json().catch(() => ({})) as { error?: string; code?: string };
      throw new Error(data.error || 'Session could not be set.');
    }
    let next = normalizeAuthRedirect(
      (typeof window !== 'undefined' && sessionStorage.getItem('auth_redirect')) ||
        redirectTo ||
        '/partners/all-stores'
    );
    if (typeof window !== 'undefined' && sessionStorage.getItem('auth_redirect')) {
      sessionStorage.removeItem('auth_redirect');
    }
    // Never deep-link into dashboard until all-stores / gate validates ownership
    if (typeof next === 'string' && next.startsWith('/partners/') && !next.startsWith('/partners/all-stores')) {
      next = '/partners/all-stores';
    }
    clearPushSessionDismissed();
    // Replace so browser Back cannot return to Login/OTP while session is valid.
    window.location.replace(next.startsWith('/') ? next : '/partners/all-stores');
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    const result = await signInWithGoogle();
    if (!result.success) {
      showLoginError(result.error || 'Google sign-in failed.');
      setGoogleLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = normalizePhone(phone);
    if (!p) {
      showLoginError('Enter a valid 10-digit mobile number.');
      return;
    }
    setLoading(true);
    try {
      const checkRes = await fetch(`/api/auth/check-existing?phone=${encodeURIComponent(p)}`);
      const checkData = await checkRes.json().catch(() => ({}));
      if (!checkRes.ok || checkData.code === 'SERVICE_UNAVAILABLE') {
        showLoginError('Unable to verify this mobile number right now. Please try again in a moment.');
        setLoading(false);
        return;
      }
      if (checkData.exists !== true) {
        showLoginError('No merchant account found for this mobile number. Please register first.');
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
          showLoginError('SMS is not configured. Please sign in with Google or contact support.');
        } else {
          showLoginError(msg);
        }
        return;
      }
      setOtpSent(true);
      setResendCooldown(RESEND_OTP_COOLDOWN_SEC);
    } catch (err) {
      showLoginError(err instanceof Error ? err.message : 'Failed to send OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    const p = normalizePhone(phone);
    if (!p) return;
    setOtp('');
    lastVerifiedOtpRef.current = '';
    setLoading(true);
    try {
      const checkRes = await fetch(`/api/auth/check-existing?phone=${encodeURIComponent(p)}`);
      const checkData = await checkRes.json().catch(() => ({}));
      if (!checkRes.ok || checkData.code === 'SERVICE_UNAVAILABLE') {
        showLoginError('Unable to verify this mobile number right now. Please try again in a moment.');
        setLoading(false);
        return;
      }
      if (checkData.exists !== true) {
        showLoginError('No merchant account found for this mobile number. Please register first.');
        setLoading(false);
        return;
      }
      const result = await requestPhoneOTP(p);
      if (!result.success) {
        showLoginError(result.error || 'Failed to resend OTP.');
        return;
      }
      setResendCooldown(RESEND_OTP_COOLDOWN_SEC);
    } catch (err) {
      showLoginError(err instanceof Error ? err.message : 'Failed to resend OTP.');
    } finally {
      setLoading(false);
    }
  };

  const verifyInFlightRef = useRef(false);
  const lastVerifiedOtpRef = useRef('');

  const runVerifyOtp = useCallback(
    async (otpValue: string) => {
      const p = normalizePhone(phone);
      const digits = otpValue.replace(/\D/g, '').slice(0, 6);
      if (!p || digits.length < 6) return;
      if (verifyInFlightRef.current) return;
      if (lastVerifiedOtpRef.current === digits) return;

      lastVerifiedOtpRef.current = digits;
      verifyInFlightRef.current = true;
      setLoading(true);
      try {
        const result = await verifyPhoneOTP(p, digits);
        if (!result.success) {
          lastVerifiedOtpRef.current = '';
          showLoginError(result.error || 'Invalid or expired OTP.');
          return;
        }
        if (!result.data?.session?.access_token || !result.data?.session?.refresh_token) {
          lastVerifiedOtpRef.current = '';
          showLoginError('Session could not be created. Try again.');
          return;
        }
        await setSessionAndRedirect(
          result.data.session.access_token,
          result.data.session.refresh_token
        );
      } catch (err) {
        lastVerifiedOtpRef.current = '';
        showLoginError(err instanceof Error ? err.message : 'Verification failed.');
      } finally {
        setLoading(false);
        verifyInFlightRef.current = false;
      }
    },
    [phone]
  );

  const handleOtpComplete = useCallback(
    (completedOtp: string) => {
      void runVerifyOtp(completedOtp);
    },
    [runVerifyOtp]
  );

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    await runVerifyOtp(otp);
  };

  const handleChangeNumber = () => {
    setOtpSent(false);
    setOtp('');
    setResendCooldown(0);
    lastVerifiedOtpRef.current = '';
  };

  useEffect(() => {
    if (!otpSent) return;
    const timer = window.setTimeout(() => {
      document.getElementById('otp-input-section')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [otpSent]);

  return (
    <LoginPageShell>
      <LoginFormHeader compact={otpSent} />

      <div className={`w-full ${otpSent ? 'mt-5' : 'mt-8'}`}>
        {registered === '1' && (
          <div className="mb-4 p-3.5 rounded-xl bg-[#E5F5F0] border border-[#00A88F]/25 text-[#006B4F] text-sm font-medium">
            Registration successful. Sign in below.
          </div>
        )}

        <LoginToggle value={tab} onChange={setTab} disabled={loading || googleLoading} />

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
              onOtpComplete={handleOtpComplete}
              onResendOtp={handleResendOtp}
              onChangeNumber={handleChangeNumber}
              phoneOtpEnabled={ENABLE_PHONE_OTP_LOGIN}
            />
          )}
        </div>

        <p className={`text-center text-sm text-slate-600 lg:hidden ${otpSent ? 'mt-5' : 'mt-8'}`}>
          Don&apos;t have an account?{' '}
          <Link
            href="/auth/register"
            className="font-semibold text-[#00A88F] hover:text-[#009078] hover:underline"
          >
            Sign Up
          </Link>
        </p>
      </div>
    </LoginPageShell>
  );
}

function LoginPageFallback() {
  return (
    <LoginPageShell>
      <LoginFormHeader />
      <div className="text-center py-12 w-full">
        <Loader2 className="h-8 w-8 animate-spin text-[#00A88F] mx-auto" />
        <p className="mt-4 text-sm text-slate-500">Loading login…</p>
      </div>
    </LoginPageShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}
