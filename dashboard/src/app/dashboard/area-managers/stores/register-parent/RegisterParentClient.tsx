"use client";

import { useState, useEffect, useCallback, useRef, type InputHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Mail,
  Phone,
  User,
  MapPin,
  Map,
  ImageIcon,
  Loader2,
  CheckCircle,
  Store,
  Building2,
  LayoutGrid,
  ChevronDown,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAppSearchParams } from "@/hooks/useAppSearchParams";
import { toast } from "sonner";
import {
  resetParentOnboardingProgress,
  resetParentOnboardingSubtitle,
  setParentOnboardingProgress,
  setParentOnboardingSubtitle,
} from "@/lib/parent-onboarding-chrome";
import { MerchantReferralCodeField, type MerchantReferralCodeFieldHandle } from "@/components/merchant/MerchantReferralCodeField";

const EMAIL_OTP_LENGTH = 8;
const PHONE_OTP_LENGTH = 6;
const RESEND_COOLDOWN_SEC = 60;
const RATE_LIMIT_COOLDOWN_SEC = 300;
const REGISTER_PARENT_DRAFT_KEY = "registerParentDraft";
const TOAST_MS = 5000;
const EMAIL_ALREADY_REGISTERED_MSG =
  "Already registered. Try with a different email.";
const PHONE_ALREADY_REGISTERED_MSG =
  "Already registered. Try with a different number.";
const EMAIL_RATE_LIMIT_MSG =
  "Email rate limit exceeded. Please wait 5 minutes before requesting a new code.";
const SESSION_EXPIRED_MSG =
  "Your dashboard session expired. Refresh the page, then complete registration again.";
const DEFAULT_RETURN = "/dashboard/area-managers/stores?filter=parent";

function registerApiErrorMessage(data: unknown, fallback: string): string {
  const rec = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const raw = typeof rec.error === "string" ? rec.error : fallback;
  if (rec.code === "SESSION_REQUIRED" || raw === "Not authenticated") {
    return SESSION_EXPIRED_MSG;
  }
  return raw;
}

async function sendParentEmailOtp(email: string): Promise<{
  ok: boolean;
  rateLimited?: boolean;
  error?: string;
}> {
  const res = await fetch("/api/area-manager/parent-merchant/send-email-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = typeof data?.error === "string" ? data.error : "Failed to send code";
    if (err === "EMAIL_RATE_LIMIT_EXCEEDED" || res.status === 429) {
      return { ok: false, rateLimited: true, error: err };
    }
    return { ok: false, error: registerApiErrorMessage(data, err) };
  }
  return { ok: true };
}
const GM_GATI = "#00A88F";

const ENABLE_PHONE_OTP =
  process.env.NEXT_PUBLIC_ENABLE_PHONE_OTP_REGISTER === "true";

const REGISTER_FIELD_CLASS =
  "w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 placeholder:text-slate-500 text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#00A88F]/30 focus:ring-offset-2 focus:border-[#00A88F] focus:bg-white hover:border-slate-300";
const REGISTER_LABEL_CLASS =
  "block text-sm font-semibold text-slate-800 mb-1.5";
const FIELD_CLASS_COMPACT =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[15px] font-normal leading-snug text-slate-800 placeholder:font-normal placeholder:text-slate-400 outline-none transition focus:border-[#00A88F] focus:ring-2 focus:ring-[#00A88F]/15 hover:border-slate-300";
const LABEL_COMPACT =
  "mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500";
const REGISTER_PRIMARY_BTN =
  "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#00A88F] px-4 py-3.5 text-sm font-semibold text-white hover:bg-[#009078] disabled:opacity-50 disabled:cursor-not-allowed transition-all";
const REGISTER_SECONDARY_BTN =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors";

type MerchantType = "LOCAL" | "BRAND" | "CHAIN" | "FRANCHISE";
type StepType = "email" | "email_code" | "phone" | "phone_code" | "profile";

type RegisterParentFormState = {
  parent_name: string;
  merchant_type: MerchantType;
  business_category: string;
  business_category_other: string;
  brand_name: string;
  registered_phone: string;
  alternate_phone: string;
  address_line1: string;
  city: string;
  state: string;
  pincode: string;
  owner_name: string;
  owner_email: string;
  store_logo: string;
};

const initialFormState: RegisterParentFormState = {
  parent_name: "",
  merchant_type: "LOCAL",
  business_category: "",
  business_category_other: "",
  brand_name: "",
  registered_phone: "",
  alternate_phone: "",
  address_line1: "",
  city: "",
  state: "",
  pincode: "",
  owner_name: "",
  owner_email: "",
  store_logo: "",
};

function normalizePhone10(input: string): string {
  const digits = input.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function safeReturnPath(value: string | null, fallback: string): string {
  if (!value) return fallback;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const u = new URL(
      value,
      typeof window !== "undefined" ? window.location.origin : "http://localhost"
    );
    if (typeof window !== "undefined" && u.origin === window.location.origin) {
      return `${u.pathname}${u.search}${u.hash}`;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

function formatCountdownMmSs(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function progressStep(step: StepType): number {
  if (step === "email" || step === "email_code") return 1;
  if (step === "phone" || step === "phone_code") return 2;
  return 3;
}

const ONBOARDING_STEPS = [
  { n: 1, label: "Email" },
  { n: 2, label: "Mobile" },
  { n: 3, label: "Business Info" },
] as const;

function OnboardingNumberedStepper({
  active = 1,
  showLabels = true,
}: {
  active?: number;
  showLabels?: boolean;
}) {
  return (
    <ol className="flex shrink-0 items-center" aria-label="Registration steps">
      {ONBOARDING_STEPS.map((s, i) => {
        const filled = s.n <= active;
        return (
          <li key={s.n} className="flex items-center">
            <div
              className={
                showLabels
                  ? "flex w-[3.75rem] flex-col items-center sm:w-[5.25rem]"
                  : "flex flex-col items-center"
              }
            >
              <span
                className={`flex items-center justify-center rounded-full font-semibold ${
                  showLabels
                    ? "h-7 w-7 text-xs sm:h-8 sm:w-8 sm:text-sm"
                    : "h-7 w-7 text-xs"
                } ${
                  filled
                    ? "bg-[#00A88F] text-white"
                    : "border-2 border-slate-200 bg-white text-slate-400"
                }`}
              >
                {s.n}
              </span>
              {showLabels ? (
                <span
                  className={`mt-1 text-center text-[10px] font-medium leading-tight sm:mt-1.5 sm:text-[11px] ${
                    filled ? "text-[#00A88F]" : "text-slate-400"
                  }`}
                >
                  {s.label}
                </span>
              ) : null}
            </div>
            {i < ONBOARDING_STEPS.length - 1 ? (
              <div
                className={
                  showLabels
                    ? "mt-[-1.15rem] h-0.5 w-6 shrink-0 sm:mt-[-1.35rem] sm:w-10"
                    : "h-0.5 w-5 shrink-0 sm:w-7"
                }
                style={{
                  backgroundColor: s.n < active ? GM_GATI : "#e2e8f0",
                }}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function RequiredMark() {
  return <span className="ml-0.5 text-red-500 normal-case">*</span>;
}

function IconWrap({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      {children}
    </div>
  );
}

function SelectWrap({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      {children}
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

function isValidStep(s: unknown): s is StepType {
  return (
    s === "email" ||
    s === "email_code" ||
    s === "phone" ||
    s === "phone_code" ||
    s === "profile"
  );
}

function ClientMountInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) {
    return <div className={className} aria-hidden />;
  }
  return <input className={className} {...props} />;
}

function PartnerSignupHeader({
  subtitle,
  progress,
  compact = false,
  otpMode = false,
}: {
  subtitle: string;
  progress: number;
  compact?: boolean;
  otpMode?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: GM_GATI }}
          >
            <Store className="h-5 w-5 text-white" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 text-left">
            <h1 className="text-base font-bold leading-tight tracking-tight text-slate-900 sm:text-lg">
              Register{" "}
              <span style={{ color: GM_GATI }}>Gati</span>
              <span style={{ color: "#F5A623" }}>Mitra</span> Partner
            </h1>
            <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">{subtitle}</p>
          </div>
        </div>
        <OnboardingNumberedStepper active={progress} showLabels={false} />
      </div>
    );
  }

  return (
    <div className={`relative text-center px-1 sm:px-2 ${otpMode ? "mb-0" : ""}`}>
      <div className="absolute right-0 top-0">
        <OnboardingNumberedStepper active={progress} showLabels={false} />
      </div>
      <div
        className={`relative mx-auto inline-flex items-center justify-center ${
          otpMode ? "mb-3 mt-1" : "mb-5 mt-1"
        }`}
      >
        <div
          className={`flex items-center justify-center rounded-full ring-4 ${
            otpMode
              ? "h-12 w-12 sm:h-14 sm:w-14"
              : "h-16 w-16 sm:h-[4.25rem] sm:w-[4.25rem]"
          }`}
          style={{
            backgroundColor: GM_GATI,
            boxShadow: `0 0 0 4px ${GM_GATI}18`,
          }}
        >
          <Store
            className={`text-white ${
              otpMode ? "h-6 w-6 sm:h-7 sm:w-7" : "h-7 w-7 sm:h-8 sm:w-8"
            }`}
            strokeWidth={1.75}
          />
        </div>
      </div>
      <h1
        className={`mx-auto max-w-[20rem] font-bold leading-snug tracking-tight text-slate-900 sm:max-w-none ${
          otpMode ? "text-base sm:text-lg" : "text-[1.15rem] sm:text-[1.45rem]"
        }`}
      >
        Register{" "}
        <span style={{ color: GM_GATI }}>Gati</span>
        <span style={{ color: "#F5A623" }}>Mitra</span> Partner
      </h1>
      <p
        className={`text-slate-600 ${
          otpMode ? "mt-1 text-xs sm:text-sm" : "mt-2 text-sm"
        }`}
      >
        {subtitle}
      </p>
    </div>
  );
}

export function RegisterParentClient() {
  const router = useRouter();
  const searchParams = useAppSearchParams();
  const returnTo = safeReturnPath(searchParams.get("returnTo"), DEFAULT_RETURN);

  const [showDraftChoice, setShowDraftChoice] = useState(false);
  const [step, setStep] = useState<StepType>("email");
  const [email, setEmail] = useState("");
  const [otpDigits, setOtpDigits] = useState<string[]>(() =>
    Array(EMAIL_OTP_LENGTH).fill("")
  );
  const [phoneOtpDigits, setPhoneOtpDigits] = useState<string[]>(() =>
    Array(PHONE_OTP_LENGTH).fill("")
  );
  const [resendCooldown, setResendCooldown] = useState(0);
  const [phoneResendCooldown, setPhoneResendCooldown] = useState(0);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [verifiedSupabaseUserId, setVerifiedSupabaseUserId] = useState<
    string | null
  >(null);
  const [form, setForm] = useState<RegisterParentFormState>(initialFormState);
  const setError = (
    msg: string | null | ((prev: string | null) => string | null)
  ) => {
    if (typeof msg === "function" || !msg) return;
    toast.error(msg, { duration: TOAST_MS });
  };
  const [loading, setLoading] = useState(false);
  const [primaryNumberVerified, setPrimaryNumberVerified] = useState(false);
  const [storeLogoFile, setStoreLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [referralApplied, setReferralApplied] = useState(false);
  const [referralFromName, setReferralFromName] = useState<string | null>(null);
  const [referralInviteeLine, setReferralInviteeLine] = useState<string | null>(null);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [referralServiceAvailable, setReferralServiceAvailable] = useState(true);
  const referralFieldRef = useRef<MerchantReferralCodeFieldHandle>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const phoneOtpInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const successRedirectRef = useRef(false);

  // On mount: if draft exists, show continue / start new
  useEffect(() => {
    try {
      const raw =
        typeof window !== "undefined"
          ? window.sessionStorage?.getItem(REGISTER_PARENT_DRAFT_KEY)
          : null;
      const draft = raw ? JSON.parse(raw) : null;
      setShowDraftChoice(!!(draft?.verifiedEmail));
      if (draft?.supabase_user_id) {
        setVerifiedSupabaseUserId(draft.supabase_user_id);
      }
    } catch {
      setShowDraftChoice(false);
    }
  }, []);

  // Persist draft after email verification (phone / profile steps)
  useEffect(() => {
    if (
      !verifiedEmail ||
      step === "email" ||
      step === "email_code" ||
      showDraftChoice
    ) {
      return;
    }
    try {
      window.sessionStorage?.setItem(
        REGISTER_PARENT_DRAFT_KEY,
        JSON.stringify({
          verifiedEmail,
          email: email || verifiedEmail,
          registered_phone: form.registered_phone,
          primaryNumberVerified,
          step,
          form,
          supabase_user_id: verifiedSupabaseUserId,
          referralCode,
        })
      );
    } catch {
      // ignore
    }
  }, [
    verifiedEmail,
    step,
    form,
    email,
    verifiedSupabaseUserId,
    primaryNumberVerified,
    showDraftChoice,
    referralCode,
  ]);

  // Email resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // Phone resend cooldown
  useEffect(() => {
    if (phoneResendCooldown <= 0) return;
    const t = setTimeout(() => setPhoneResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phoneResendCooldown]);

  // Logo preview
  useEffect(() => {
    if (!storeLogoFile) {
      setLogoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(storeLogoFile);
    setLogoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [storeLogoFile]);

  // After success: brief pause then navigate back
  useEffect(() => {
    if (!registerSuccess || successRedirectRef.current) return;
    successRedirectRef.current = true;
    const t = setTimeout(() => {
      router.replace(returnTo);
    }, 1400);
    return () => clearTimeout(t);
  }, [registerSuccess, router, returnTo]);

  const setOtpDigit = useCallback((index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    setOtpDigits((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < EMAIL_OTP_LENGTH - 1) {
      otpInputRefs.current[index + 1]?.focus();
    }
  }, []);

  const handleOtpKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
        otpInputRefs.current[index - 1]?.focus();
        setOtpDigits((prev) => {
          const next = [...prev];
          next[index - 1] = "";
          return next;
        });
      }
    },
    [otpDigits]
  );

  const handleOtpPaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, EMAIL_OTP_LENGTH);
    const chars = pasted.split("");
    setOtpDigits((prev) => {
      const next = [...prev];
      chars.forEach((c, i) => {
        if (i < EMAIL_OTP_LENGTH) next[i] = c;
      });
      return next;
    });
    const focusIndex = Math.min(pasted.length, EMAIL_OTP_LENGTH) - 1;
    if (focusIndex >= 0) otpInputRefs.current[focusIndex]?.focus();
  }, []);

  const setPhoneOtpDigit = useCallback((index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    setPhoneOtpDigits((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < PHONE_OTP_LENGTH - 1) {
      phoneOtpInputRefs.current[index + 1]?.focus();
    }
  }, []);

  const handlePhoneOtpKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && !phoneOtpDigits[index] && index > 0) {
        phoneOtpInputRefs.current[index - 1]?.focus();
        setPhoneOtpDigits((prev) => {
          const next = [...prev];
          next[index - 1] = "";
          return next;
        });
      }
    },
    [phoneOtpDigits]
  );

  const handlePhoneOtpPaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, PHONE_OTP_LENGTH);
    const chars = pasted.split("");
    setPhoneOtpDigits((prev) => {
      const next = [...prev];
      chars.forEach((c, i) => {
        if (i < PHONE_OTP_LENGTH) next[i] = c;
      });
      return next;
    });
    const focusIndex = Math.min(pasted.length, PHONE_OTP_LENGTH) - 1;
    if (focusIndex >= 0) phoneOtpInputRefs.current[focusIndex]?.focus();
  }, []);

  const handleSendEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = email.trim().toLowerCase();
    if (!raw || !/^\S+@\S+\.\S+$/.test(raw)) {
      toast.error("Enter a valid email address", { duration: TOAST_MS });
      return;
    }
    if (resendCooldown > 0) return;
    setError(null);
    setLoading(true);
    try {
      const checkRes = await fetch(
        "/api/area-manager/parent-merchant/check-email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email: raw }),
        }
      );
      const checkData = await checkRes.json();
      if (!checkRes.ok) {
        toast.error(registerApiErrorMessage(checkData, "Could not verify email"), {
          duration: TOAST_MS,
        });
        return;
      }
      if (checkData.exists) {
        toast.error(EMAIL_ALREADY_REGISTERED_MSG, { duration: TOAST_MS });
        return;
      }
      const result = await sendParentEmailOtp(raw);
      if (!result.ok) {
        if (result.rateLimited) {
          toast.error(EMAIL_RATE_LIMIT_MSG, { duration: TOAST_MS });
          setResendCooldown(RATE_LIMIT_COOLDOWN_SEC);
        } else {
          toast.error(result.error ?? "Failed to send code", { duration: TOAST_MS });
        }
        return;
      }
      toast.success(`OTP sent to ${raw}`, { duration: TOAST_MS });
      setStep("email_code");
      setResendCooldown(RESEND_COOLDOWN_SEC);
      setOtpDigits(Array(EMAIL_OTP_LENGTH).fill(""));
      setTimeout(() => otpInputRefs.current[0]?.focus(), 100);
    } catch {
      toast.error("Network error. Please try again.", { duration: TOAST_MS });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otpDigits.join("");
    if (code.length !== EMAIL_OTP_LENGTH) {
      setError("Enter the 8-digit code from the Partner's email");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(
        "/api/area-manager/parent-merchant/verify-email-otp",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            code,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(registerApiErrorMessage(data, "Invalid or expired code"));
        return;
      }
      const ve = data.verifiedEmail ?? email.trim();
      setVerifiedEmail(ve);
      setVerifiedSupabaseUserId(data.supabase_user_id ?? null);
      setForm((prev) => ({ ...prev, owner_email: ve }));
      // BUG FIX: go to phone step (not profile)
      setStep("phone");
      try {
        window.sessionStorage?.setItem(
          REGISTER_PARENT_DRAFT_KEY,
          JSON.stringify({
            verifiedEmail: ve,
            email: email.trim(),
            registered_phone: form.registered_phone,
            primaryNumberVerified: false,
            step: "phone",
            form: { ...form, owner_email: ve },
            supabase_user_id: data.supabase_user_id ?? null,
          })
        );
      } catch {
        // ignore
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const checkPhoneUnique = async (digits: string): Promise<boolean> => {
    const res = await fetch("/api/area-manager/parent-merchant/check-phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ phone: digits }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(registerApiErrorMessage(data, "Could not verify number"), { duration: TOAST_MS });
      return false;
    }
    if (data.exists) {
      toast.error(PHONE_ALREADY_REGISTERED_MSG, { duration: TOAST_MS });
      return false;
    }
    return true;
  };

  const handleSendPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = normalizePhone10(form.registered_phone);
    if (digits.length !== 10) {
      toast.error("Enter a valid 10-digit mobile number", { duration: TOAST_MS });
      return;
    }
    if (phoneResendCooldown > 0) return;
    setError(null);
    setLoading(true);
    try {
      const ok = await checkPhoneUnique(digits);
      if (!ok) return;
      const res = await fetch(
        "/api/area-manager/parent-merchant/send-phone-otp",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ phone: digits }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(registerApiErrorMessage(data, "Failed to send OTP to mobile"), {
          duration: TOAST_MS,
        });
        return;
      }
      toast.success(`OTP sent to +91 ${digits}`, { duration: TOAST_MS });
      setForm((prev) => ({ ...prev, registered_phone: digits }));
      setStep("phone_code");
      setPhoneResendCooldown(RESEND_COOLDOWN_SEC);
      setPhoneOtpDigits(Array(PHONE_OTP_LENGTH).fill(""));
      setTimeout(() => phoneOtpInputRefs.current[0]?.focus(), 100);
    } catch {
      toast.error("Network error. Please try again.", { duration: TOAST_MS });
    } finally {
      setLoading(false);
    }
  };

  const handleResendPhoneOtp = async () => {
    if (phoneResendCooldown > 0) return;
    const digits = normalizePhone10(form.registered_phone);
    if (digits.length !== 10) return;
    setError(null);
    setLoading(true);
    try {
      const ok = await checkPhoneUnique(digits);
      if (!ok) return;
      const res = await fetch(
        "/api/area-manager/parent-merchant/send-phone-otp",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ phone: digits }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(registerApiErrorMessage(data, "Failed to resend OTP"), { duration: TOAST_MS });
        return;
      }
      toast.success(`OTP sent to +91 ${digits}`, { duration: TOAST_MS });
      setPhoneResendCooldown(RESEND_COOLDOWN_SEC);
      setPhoneOtpDigits(Array(PHONE_OTP_LENGTH).fill(""));
    } catch {
      toast.error("Failed to resend OTP", { duration: TOAST_MS });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = normalizePhone10(form.registered_phone);
    const code = phoneOtpDigits.join("");
    if (digits.length !== 10 || code.length !== PHONE_OTP_LENGTH) {
      setError("Enter the 6-digit OTP sent to the mobile");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(
        "/api/area-manager/parent-merchant/verify-phone-otp",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ phone: digits, code }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(registerApiErrorMessage(data, "Invalid or expired code"));
        return;
      }
      setForm((prev) => ({ ...prev, registered_phone: digits }));
      setPrimaryNumberVerified(true);
      setStep("profile");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /** When phone OTP is disabled: check uniqueness then mark verified → profile */
  const handlePhoneContinueWithoutOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = normalizePhone10(form.registered_phone);
    if (digits.length !== 10) {
      setError("Enter a valid 10-digit mobile number");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const ok = await checkPhoneUnique(digits);
      if (!ok) return;
      setForm((prev) => ({ ...prev, registered_phone: digits }));
      setPrimaryNumberVerified(true);
      setStep("profile");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    if (["registered_phone", "alternate_phone", "pincode"].includes(name)) {
      setForm((prev) => ({ ...prev, [name]: value.replace(/\D/g, "") }));
      if (name === "registered_phone" && step === "phone") {
        setPrimaryNumberVerified(false);
        setError((prev) =>
          prev === PHONE_ALREADY_REGISTERED_MSG ? null : prev
        );
      }
    } else if (name === "business_category") {
      setForm((prev) => ({
        ...prev,
        business_category: value,
        ...(value !== "OTHER" ? { business_category_other: "" } : {}),
      }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
    setError(null);
  };

  const validateProfile = () => {
    if (!form.owner_name?.trim()) {
      setError("Owner / Contact name is required.");
      return false;
    }
    if (!form.parent_name.trim()) {
      setError("Business / Parent name is required.");
      return false;
    }
    if (!form.registered_phone.replace(/\D/g, "").trim()) {
      setError("Primary number is required");
      return false;
    }
    if (form.registered_phone.replace(/\D/g, "").length < 10) {
      setError("Enter a valid 10-digit mobile number");
      return false;
    }
    if (!primaryNumberVerified) {
      setError("Please verify the primary number first");
      return false;
    }
    const altPhone = form.alternate_phone.trim();
    if (altPhone && !/^\+?[0-9]{10,15}$/.test(altPhone.replace(/\s/g, ""))) {
      setError("Alternate phone must be 10–15 digits (optional + prefix).");
      return false;
    }
    if (!form.business_category) {
      setError("Business category is required.");
      return false;
    }
    if (
      form.business_category === "OTHER" &&
      !form.business_category_other?.trim()
    ) {
      setError("Please specify your business category.");
      return false;
    }
    if (!form.address_line1?.trim()) {
      setError("Address is required.");
      return false;
    }
    if (!form.city?.trim()) {
      setError("City is required.");
      return false;
    }
    if (!form.state?.trim()) {
      setError("State is required.");
      return false;
    }
    if (!form.pincode?.trim() || form.pincode.length < 5) {
      setError("Valid pincode is required.");
      return false;
    }
    if (!form.owner_email?.trim()) {
      setError("Owner email is required");
      return false;
    }
    if (!/^\S+@\S+\.\S+$/.test(form.owner_email)) {
      setError("Enter a valid email address");
      return false;
    }
    setError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateProfile()) return;
    let validatedReferralCode: string | undefined;
    if (referralServiceAvailable) {
      const checked = await referralFieldRef.current?.verify();
      if (checked && !checked.ok) {
        setError("Please enter a valid referral code, or leave it blank.");
        return;
      }
      validatedReferralCode = checked?.ok ? checked.code ?? undefined : undefined;
    }
    setError(null);
    setLoading(true);
    try {
      const phone = form.registered_phone.replace(/\D/g, "").slice(-10);
      const registered_phone =
        phone.length >= 10 ? `+91${phone}` : form.registered_phone;
      const altDigits = form.alternate_phone.replace(/\D/g, "");
      const alternate_phone =
        altDigits.length >= 10
          ? `+91${altDigits.slice(-10)}`
          : undefined;
      const business_category =
        form.business_category === "OTHER"
          ? form.business_category_other.trim() || undefined
          : form.business_category || undefined;

      if (storeLogoFile) {
        const fd = new FormData();
        fd.set("parent_name", form.parent_name.trim());
        fd.set("merchant_type", form.merchant_type);
        fd.set("owner_name", form.owner_name.trim());
        fd.set("owner_email", form.owner_email.trim());
        fd.set("registered_phone", registered_phone);
        if (alternate_phone) fd.set("alternate_phone", alternate_phone);
        if (form.brand_name?.trim()) fd.set("brand_name", form.brand_name.trim());
        if (business_category) fd.set("business_category", business_category);
        fd.set("address_line1", form.address_line1?.trim() ?? "");
        fd.set("city", form.city?.trim() ?? "");
        fd.set("state", form.state?.trim() ?? "");
        fd.set("pincode", form.pincode?.trim() ?? "");
        if (verifiedSupabaseUserId)
          fd.set("supabase_user_id", verifiedSupabaseUserId);
        if (validatedReferralCode) fd.set("referralCode", validatedReferralCode);
        fd.set("store_logo", storeLogoFile);
        const res = await fetch(
          "/api/area-manager/parent-merchant/register",
          {
            method: "POST",
            credentials: "include",
            body: fd,
          }
        );
        const data = await res.json();
        if (!res.ok) {
          setError(registerApiErrorMessage(data, "Failed to register parent"));
          return;
        }
      } else {
        const payload = {
          parent_name: form.parent_name.trim(),
          merchant_type: form.merchant_type,
          owner_name: form.owner_name.trim(),
          owner_email: form.owner_email.trim(),
          registered_phone,
          registered_phone_normalized: phone || undefined,
          alternate_phone,
          brand_name: form.brand_name?.trim() || undefined,
          business_category,
          is_active: true,
          registration_status: "VERIFIED" as const,
          address_line1: form.address_line1?.trim(),
          city: form.city?.trim(),
          state: form.state?.trim(),
          pincode: form.pincode?.trim(),
          store_logo: form.store_logo?.trim() || undefined,
          supabase_user_id: verifiedSupabaseUserId ?? undefined,
          referralCode: validatedReferralCode,
        };
        const res = await fetch(
          "/api/area-manager/parent-merchant/register",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload),
          }
        );
        const data = await res.json();
        if (!res.ok) {
          setError(registerApiErrorMessage(data, "Failed to register parent"));
          return;
        }
      }
      try {
        window.sessionStorage?.removeItem(REGISTER_PARENT_DRAFT_KEY);
      } catch {
        // ignore
      }
      setRegisterSuccess(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const continueWithDraft = () => {
    try {
      const raw = window.sessionStorage?.getItem(REGISTER_PARENT_DRAFT_KEY);
      const draft = raw ? JSON.parse(raw) : null;
      if (draft?.verifiedEmail) {
        setVerifiedEmail(draft.verifiedEmail);
        setVerifiedSupabaseUserId(draft.supabase_user_id ?? null);
        setEmail(draft.email ?? draft.verifiedEmail);
        const restoredForm = {
          ...initialFormState,
          ...(draft.form ?? {}),
        } as RegisterParentFormState;
        if (draft.registered_phone && !restoredForm.registered_phone) {
          restoredForm.registered_phone = draft.registered_phone;
        }
        const knownCats = ["RESTAURANT", "CLOUD_KITCHEN", "CAFE", "BAKERY", "OTHER", ""];
        if (
          restoredForm.business_category &&
          !knownCats.includes(restoredForm.business_category)
        ) {
          restoredForm.business_category_other =
            restoredForm.business_category_other || restoredForm.business_category;
          restoredForm.business_category = "OTHER";
        }
        setForm(restoredForm);
        if (typeof draft.referralCode === "string" && draft.referralCode.trim()) {
          setReferralCode(String(draft.referralCode).trim().toUpperCase());
        }
        setPrimaryNumberVerified(!!draft.primaryNumberVerified);
        let nextStep: StepType = "phone";
        if (isValidStep(draft.step)) {
          // Legacy drafts used "code" or numeric steps → map to profile/phone
          nextStep = draft.step;
        } else if (
          draft.step === "code" ||
          draft.step === 1 ||
          draft.step === 2 ||
          draft.step === 3
        ) {
          nextStep =
            draft.primaryNumberVerified ||
            normalizePhone10(restoredForm.registered_phone).length === 10
              ? "profile"
              : "phone";
        }
        // Never land on email_code from draft without a fresh OTP
        if (nextStep === "email" || nextStep === "email_code") {
          nextStep = "phone";
        }
        if (
          nextStep === "profile" &&
          !draft.primaryNumberVerified &&
          normalizePhone10(restoredForm.registered_phone).length !== 10
        ) {
          nextStep = "phone";
        }
        setStep(nextStep);
        setShowDraftChoice(false);
      } else {
        setShowDraftChoice(false);
      }
    } catch {
      setShowDraftChoice(false);
    }
  };

  const startNewRegistration = () => {
    try {
      window.sessionStorage?.removeItem(REGISTER_PARENT_DRAFT_KEY);
    } catch {
      // ignore
    }
    setShowDraftChoice(false);
    setStep("email");
    setVerifiedEmail(null);
    setVerifiedSupabaseUserId(null);
    setForm(initialFormState);
    setEmail("");
    setError(null);
    setPrimaryNumberVerified(false);
    setOtpDigits(Array(EMAIL_OTP_LENGTH).fill(""));
    setPhoneOtpDigits(Array(PHONE_OTP_LENGTH).fill(""));
    setStoreLogoFile(null);
  };

  const stepSubtitle = showDraftChoice
    ? "Choose how to continue your registration"
    : step === "email"
      ? "Verify partner email to get started"
      : step === "email_code"
        ? "Enter the verification code from partner email"
        : step === "phone"
          ? ENABLE_PHONE_OTP
            ? "Verify partner mobile number to continue"
            : "Add partner mobile number to continue"
          : step === "phone_code"
            ? "Enter the SMS verification code"
            : "Complete the business profile";

  const currentProgress = progressStep(step);
  const otpMode =
    step === "email_code" || (step === "phone_code" && ENABLE_PHONE_OTP);

  useEffect(() => {
    setParentOnboardingSubtitle(stepSubtitle);
    setParentOnboardingProgress(showDraftChoice ? 1 : currentProgress);
  }, [stepSubtitle, showDraftChoice, currentProgress]);

  useEffect(() => {
    return () => {
      resetParentOnboardingSubtitle();
      resetParentOnboardingProgress();
    };
  }, []);

  const isProfilePlain =
    !registerSuccess && !showDraftChoice && step === "profile";

  return (
    <div
      className={`flex min-h-0 min-w-0 flex-1 flex-col ${
        isProfilePlain
          ? "bg-[#f4f6f8]"
          : "bg-gradient-to-br from-slate-50 via-white to-[#E5F5F0]/50"
      }`}
    >
      <div
        className={
          isProfilePlain
            ? "mx-auto flex h-full min-h-0 w-full flex-1 flex-col px-3 py-3 sm:px-4"
            : "flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto overscroll-contain px-4 py-6 sm:px-8 sm:py-8"
        }
      >
        <div
          className={
            isProfilePlain
              ? "relative flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:px-6 sm:py-4"
              : "relative w-full max-w-2xl rounded-2xl border-2 border-slate-200 bg-white px-6 py-8 shadow-sm sm:px-10 sm:py-10"
          }
        >
          {!registerSuccess && (
            <PartnerSignupHeader
              subtitle={stepSubtitle}
              progress={showDraftChoice ? 1 : currentProgress}
              compact={isProfilePlain}
              otpMode={otpMode && !showDraftChoice}
            />
          )}

          <div
            className={
              isProfilePlain
                ? "mt-4 flex min-h-0 flex-1 flex-col overflow-hidden"
                : otpMode && !showDraftChoice
                  ? "mt-4"
                  : "mt-6"
            }
          >
            {registerSuccess ? (
              <div className="flex flex-col items-center justify-center py-10 text-center sm:py-14">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle className="h-10 w-10" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">
                  Successfully registered
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Parent partner has been registered successfully. Redirecting…
                </p>
                <Link
                  href={returnTo}
                  className="mt-6 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-700"
                >
                  Done
                </Link>
              </div>
            ) : (
              <>
                {showDraftChoice && (
                  <div className="space-y-5">
                    <p className="text-center text-sm text-slate-600">
                      You have an incomplete registration. Continue with your
                      draft or start a new one.
                    </p>
                    <button
                      type="button"
                      onClick={continueWithDraft}
                      className={REGISTER_PRIMARY_BTN}
                    >
                      Continue with draft
                    </button>
                    <button
                      type="button"
                      onClick={startNewRegistration}
                      className={`w-full ${REGISTER_SECONDARY_BTN} py-3.5`}
                    >
                      Register a new one
                    </button>
                  </div>
                )}

                {/* Email */}
                {!showDraftChoice && step === "email" && (
                  <form onSubmit={handleSendEmailOtp} className="space-y-4">
                    <div>
                      <label className={REGISTER_LABEL_CLASS}>
                        Partner email address *
                      </label>
                      <div className="relative group">
                        <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-[#00A88F]" />
                        <ClientMountInput
                          type="email"
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            setError(null);
                          }}
                          placeholder="partner@example.com"
                          className={`${REGISTER_FIELD_CLASS} pl-11`}
                          autoComplete="email"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={loading || resendCooldown > 0}
                      className={REGISTER_PRIMARY_BTN}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          Please wait...
                        </>
                      ) : resendCooldown > 0 ? (
                        `Wait ${formatCountdownMmSs(resendCooldown)}`
                      ) : (
                        <>
                          <Mail className="h-5 w-5" />
                          Send OTP to email
                        </>
                      )}
                    </button>
                  </form>
                )}

                {/* Email OTP */}
                {!showDraftChoice && step === "email_code" && (
                  <form onSubmit={handleVerifyEmailOtp} className="space-y-4">
                    <div>
                      <label className="mb-3 block text-center text-sm font-semibold text-slate-800">
                        Verification code
                      </label>
                      <div className="mb-2 flex flex-wrap justify-center gap-1 sm:gap-1.5">
                        {Array.from({ length: EMAIL_OTP_LENGTH }).map((_, i) => (
                          <input
                            key={i}
                            ref={(el) => {
                              otpInputRefs.current[i] = el;
                            }}
                            type="text"
                            inputMode="numeric"
                            maxLength={1}
                            value={otpDigits[i]}
                            onChange={(e) => setOtpDigit(i, e.target.value)}
                            onKeyDown={(e) => handleOtpKeyDown(i, e)}
                            onPaste={i === 0 ? handleOtpPaste : undefined}
                            className="h-10 w-8 min-w-0 rounded-lg border border-slate-200 bg-white text-center font-mono text-base font-semibold text-slate-900 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/25 sm:h-11 sm:w-9"
                            aria-label={`Digit ${i + 1}`}
                          />
                        ))}
                      </div>
                      {resendCooldown > 0 && (
                        <p className="text-center text-xs text-slate-500">
                          You can request a new code in{" "}
                          <span className="font-medium text-slate-700">
                            {formatCountdownMmSs(resendCooldown)}
                          </span>
                          .
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setStep("email");
                          setError(null);
                          setOtpDigits(Array(EMAIL_OTP_LENGTH).fill(""));
                        }}
                        className={REGISTER_SECONDARY_BTN}
                      >
                        Change email
                      </button>
                      <button
                        type="button"
                        disabled={resendCooldown > 0 || loading}
                        onClick={async () => {
                          if (resendCooldown > 0) return;
                          const raw = email.trim().toLowerCase();
                          if (!raw || !/^\S+@\S+\.\S+$/.test(raw)) {
                            toast.error("Invalid email", { duration: TOAST_MS });
                            return;
                          }
                          setError(null);
                          setLoading(true);
                          try {
                            const checkRes = await fetch(
                              "/api/area-manager/parent-merchant/check-email",
                              {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                },
                                credentials: "include",
                                body: JSON.stringify({ email: raw }),
                              }
                            );
                            const checkData = await checkRes.json();
                            if (!checkRes.ok) {
                              toast.error(
                                registerApiErrorMessage(checkData, "Could not verify email"),
                                { duration: TOAST_MS }
                              );
                              return;
                            }
                            if (checkData.exists) {
                              toast.error(EMAIL_ALREADY_REGISTERED_MSG, {
                                duration: TOAST_MS,
                              });
                              return;
                            }
                            const result = await sendParentEmailOtp(raw);
                            if (!result.ok) {
                              if (result.rateLimited) {
                                toast.error(EMAIL_RATE_LIMIT_MSG, {
                                  duration: TOAST_MS,
                                });
                                setResendCooldown(RATE_LIMIT_COOLDOWN_SEC);
                              } else {
                                toast.error(result.error ?? "Resend failed", {
                                  duration: TOAST_MS,
                                });
                              }
                              return;
                            }
                            toast.success(`OTP sent to ${raw}`, {
                              duration: TOAST_MS,
                            });
                            setResendCooldown(RESEND_COOLDOWN_SEC);
                          } catch {
                            toast.error("Resend failed", { duration: TOAST_MS });
                          } finally {
                            setLoading(false);
                          }
                        }}
                        className={`${REGISTER_SECONDARY_BTN} ${
                          resendCooldown > 0
                            ? "cursor-not-allowed opacity-50"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        }`}
                      >
                        {resendCooldown > 0
                          ? `Resend OTP in ${formatCountdownMmSs(resendCooldown)}`
                          : "Resend OTP"}
                      </button>
                      <button
                        type="submit"
                        disabled={
                          loading ||
                          otpDigits.join("").length !== EMAIL_OTP_LENGTH
                        }
                        className={`min-w-[140px] flex-1 ${REGISTER_PRIMARY_BTN}`}
                      >
                        {loading ? "Verifying…" : "Verify & continue"}
                      </button>
                    </div>
                  </form>
                )}

                {/* Phone — OTP disabled */}
                {!showDraftChoice &&
                  step === "phone" &&
                  !ENABLE_PHONE_OTP && (
                    <form
                      onSubmit={handlePhoneContinueWithoutOtp}
                      className="space-y-4"
                    >
                      <div>
                        <label className={REGISTER_LABEL_CLASS}>
                          Mobile number *
                        </label>
                        <div className="relative flex items-center">
                          <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                          <span className="pointer-events-none absolute left-10 text-sm text-slate-500">
                            +91
                          </span>
                          <input
                            name="registered_phone"
                            value={form.registered_phone}
                            onChange={handleChange}
                            type="text"
                            inputMode="numeric"
                            maxLength={10}
                            placeholder="10-digit number"
                            className={`${REGISTER_FIELD_CLASS} pl-[4.75rem]`}
                            autoComplete="tel"
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={
                          loading ||
                          normalizePhone10(form.registered_phone).length !== 10
                        }
                        className={REGISTER_PRIMARY_BTN}
                      >
                        {loading ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <>
                            Continue
                            <ArrowRight className="h-4 w-4" />
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setStep("email");
                          setError(null);
                        }}
                        className="w-full py-2 text-sm text-slate-600 hover:text-slate-900"
                      >
                        ← Back to email
                      </button>
                    </form>
                  )}

                {/* Phone — OTP enabled: enter number */}
                {!showDraftChoice &&
                  step === "phone" &&
                  ENABLE_PHONE_OTP && (
                    <form onSubmit={handleSendPhoneOtp} className="space-y-4">
                      <div>
                        <label className={REGISTER_LABEL_CLASS}>
                          Mobile number *
                        </label>
                        <div className="relative flex items-center">
                          <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <span className="pointer-events-none absolute left-10 text-sm text-slate-500">
                            +91
                          </span>
                          <input
                            name="registered_phone"
                            value={form.registered_phone}
                            onChange={handleChange}
                            type="text"
                            inputMode="numeric"
                            maxLength={10}
                            placeholder="10-digit number"
                            className={`${REGISTER_FIELD_CLASS} pl-[4.75rem]`}
                            autoComplete="tel"
                          />
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          We&apos;ll send a 6-digit OTP via SMS.
                        </p>
                      </div>
                      <button
                        type="submit"
                        disabled={
                          loading ||
                          phoneResendCooldown > 0 ||
                          normalizePhone10(form.registered_phone).length !== 10
                        }
                        className={`w-full ${REGISTER_PRIMARY_BTN} py-3.5`}
                      >
                        {loading ? (
                          <>
                            <Loader2 className="h-5 w-5 animate-spin" />
                            Please wait...
                          </>
                        ) : phoneResendCooldown > 0 ? (
                          `Wait ${formatCountdownMmSs(phoneResendCooldown)}`
                        ) : (
                          <>
                            <Phone className="h-5 w-5" />
                            Send OTP to mobile
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setStep("email");
                          setError(null);
                        }}
                        className="w-full py-2 text-sm text-slate-600 hover:text-slate-900"
                      >
                        ← Back to email
                      </button>
                    </form>
                  )}

                {/* Phone OTP code */}
                {!showDraftChoice && step === "phone_code" && (
                  <form onSubmit={handleVerifyPhoneOtp} className="space-y-4">
                    <p className="text-center text-sm text-slate-600">
                      Code sent to{" "}
                      <span className="font-semibold text-slate-900">
                        +91 {normalizePhone10(form.registered_phone)}
                      </span>
                    </p>
                    <div>
                      <label className="mb-3 block text-center text-sm font-semibold text-slate-800">
                        Mobile OTP
                      </label>
                      <div className="mb-2 flex flex-wrap justify-center gap-1.5 sm:gap-2">
                        {Array.from({ length: PHONE_OTP_LENGTH }).map(
                          (_, i) => (
                            <input
                              key={i}
                              ref={(el) => {
                                phoneOtpInputRefs.current[i] = el;
                              }}
                              type="text"
                              inputMode="numeric"
                              maxLength={1}
                              value={phoneOtpDigits[i]}
                              onChange={(e) =>
                                setPhoneOtpDigit(i, e.target.value)
                              }
                              onKeyDown={(e) => handlePhoneOtpKeyDown(i, e)}
                              onPaste={
                                i === 0 ? handlePhoneOtpPaste : undefined
                              }
                              className="h-11 w-10 rounded-lg border border-slate-200 bg-white text-center font-mono text-base font-semibold text-slate-900 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/25"
                              aria-label={`OTP digit ${i + 1}`}
                            />
                          )
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setStep("phone");
                          setError(null);
                          setPhoneOtpDigits(Array(PHONE_OTP_LENGTH).fill(""));
                          setPrimaryNumberVerified(false);
                        }}
                        className={REGISTER_SECONDARY_BTN}
                      >
                        Change number
                      </button>
                      <button
                        type="submit"
                        disabled={
                          loading ||
                          phoneOtpDigits.join("").length !== PHONE_OTP_LENGTH
                        }
                        className={`min-w-[140px] flex-1 ${REGISTER_PRIMARY_BTN}`}
                      >
                        {loading ? "Verifying…" : "Verify & continue"}
                      </button>
                    </div>
                    <p className="text-center text-sm text-slate-600">
                      Didn&apos;t receive OTP?{" "}
                      {phoneResendCooldown > 0 ? (
                        <span className="text-slate-500">
                          Resend SMS in {formatCountdownMmSs(phoneResendCooldown)}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={handleResendPhoneOtp}
                          disabled={loading}
                          className="font-medium text-[#00A88F] hover:underline disabled:opacity-50"
                        >
                          Resend SMS
                        </button>
                      )}
                    </p>
                  </form>
                )}

                {/* Profile — reference layout */}
                {!showDraftChoice && step === "profile" && (
                  <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                    <div className="flex min-h-0 flex-1 flex-col justify-between gap-5 overflow-y-auto overscroll-contain py-1 pr-1">
                      <div
                        className={`grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 ${
                          form.merchant_type === "BRAND" ||
                          form.merchant_type === "CHAIN" ||
                          form.merchant_type === "FRANCHISE"
                            ? "lg:grid-cols-4"
                            : "lg:grid-cols-3"
                        }`}
                      >
                        <div>
                          <label className={LABEL_COMPACT}>
                            Owner / Contact Name
                            <RequiredMark />
                          </label>
                          <IconWrap icon={User}>
                            <input
                              name="owner_name"
                              value={form.owner_name}
                              onChange={handleChange}
                              type="text"
                              required
                              className={`${FIELD_CLASS_COMPACT} pl-10`}
                              placeholder="Owner name"
                            />
                          </IconWrap>
                        </div>
                        <div>
                          <label className={LABEL_COMPACT}>
                            Business / Parent Name
                            <RequiredMark />
                          </label>
                          <IconWrap icon={Building2}>
                            <input
                              name="parent_name"
                              value={form.parent_name}
                              onChange={handleChange}
                              type="text"
                              required
                              className={`${FIELD_CLASS_COMPACT} pl-10`}
                              placeholder="Restaurant / Brand"
                            />
                          </IconWrap>
                        </div>
                        <div>
                          <label className={LABEL_COMPACT}>
                            Merchant Type
                            <RequiredMark />
                          </label>
                          <SelectWrap icon={Store}>
                            <select
                              name="merchant_type"
                              value={form.merchant_type}
                              onChange={handleChange}
                              className={`${FIELD_CLASS_COMPACT} appearance-none pl-10 pr-9`}
                            >
                              <option value="LOCAL">Local</option>
                              <option value="BRAND">Brand</option>
                              <option value="CHAIN">Chain</option>
                              <option value="FRANCHISE">Franchise</option>
                            </select>
                          </SelectWrap>
                        </div>
                        {(form.merchant_type === "BRAND" ||
                          form.merchant_type === "CHAIN" ||
                          form.merchant_type === "FRANCHISE") && (
                          <div>
                            <label className={LABEL_COMPACT}>Brand Name</label>
                            <IconWrap icon={Building2}>
                              <input
                                name="brand_name"
                                value={form.brand_name}
                                onChange={handleChange}
                                type="text"
                                className={`${FIELD_CLASS_COMPACT} pl-10`}
                                placeholder="Brand / chain name"
                              />
                            </IconWrap>
                          </div>
                        )}
                      </div>

                      <div
                        className={`grid grid-cols-1 gap-x-4 gap-y-4 ${
                          form.business_category === "OTHER"
                            ? "sm:grid-cols-2 lg:grid-cols-4"
                            : "sm:grid-cols-2 lg:grid-cols-3"
                        }`}
                      >
                        <div>
                          <label className={LABEL_COMPACT}>
                            Business Category
                            <RequiredMark />
                          </label>
                          <SelectWrap icon={LayoutGrid}>
                            <select
                              name="business_category"
                              value={form.business_category}
                              onChange={handleChange}
                              className={`${FIELD_CLASS_COMPACT} appearance-none pl-10 pr-9`}
                            >
                              <option value="">Select category</option>
                              <option value="RESTAURANT">Restaurant</option>
                              <option value="CLOUD_KITCHEN">Cloud Kitchen</option>
                              <option value="CAFE">Cafe</option>
                              <option value="BAKERY">Bakery</option>
                              <option value="OTHER">Other</option>
                            </select>
                          </SelectWrap>
                        </div>
                        {form.business_category === "OTHER" ? (
                          <div>
                            <label className={LABEL_COMPACT}>
                              Specify Category
                              <RequiredMark />
                            </label>
                            <input
                              name="business_category_other"
                              value={form.business_category_other}
                              onChange={handleChange}
                              type="text"
                              className={FIELD_CLASS_COMPACT}
                              placeholder="Enter business type"
                            />
                          </div>
                        ) : null}
                        <div>
                          <label className={LABEL_COMPACT}>Alternate Phone</label>
                          <IconWrap icon={Phone}>
                            <input
                              name="alternate_phone"
                              value={form.alternate_phone}
                              onChange={handleChange}
                              type="tel"
                              inputMode="numeric"
                              maxLength={15}
                              className={`${FIELD_CLASS_COMPACT} pl-10`}
                              placeholder="+91 or 10-15 digits"
                            />
                          </IconWrap>
                        </div>
                        <MerchantReferralCodeField
                          ref={referralFieldRef}
                          value={referralCode}
                          onChange={setReferralCode}
                          applied={referralApplied}
                          appliedFromName={referralFromName}
                          inviteeRewardLine={referralInviteeLine}
                          error={referralError}
                          onServiceAvailableChange={(available) => {
                            setReferralServiceAvailable(available);
                            if (!available) {
                              setReferralApplied(false);
                              setReferralCode("");
                              setReferralFromName(null);
                              setReferralError(null);
                            } else {
                              setReferralError(null);
                            }
                          }}
                          onApplied={(preview) => {
                            if (!preview.ok) {
                              setReferralApplied(false);
                              setReferralFromName(null);
                              setReferralInviteeLine(null);
                              setReferralError(
                                preview.message ??
                                  "Invalid referral code. Please check the code and try again.",
                              );
                              return;
                            }
                            setReferralCode(preview.code || referralCode);
                            setReferralApplied(true);
                            setReferralFromName(preview.referrerDisplayName ?? null);
                            setReferralInviteeLine(preview.inviteeRewardLine ?? null);
                            setReferralError(null);
                          }}
                          onCleared={() => {
                            setReferralApplied(false);
                            setReferralFromName(null);
                            setReferralInviteeLine(null);
                            setReferralError(null);
                          }}
                        />
                      </div>

                      <div className="space-y-5">
                        <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-[#00A88F]">
                          <MapPin className="h-4 w-4 text-[#00A88F]" /> Address
                        </div>

                      <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div>
                          <label className={LABEL_COMPACT}>
                            Address line
                            <RequiredMark />
                          </label>
                          <input
                            name="address_line1"
                            value={form.address_line1}
                            onChange={handleChange}
                            type="text"
                            className={FIELD_CLASS_COMPACT}
                            placeholder="Street, building, landmark"
                          />
                        </div>
                        <div>
                          <label className={LABEL_COMPACT}>
                            City
                            <RequiredMark />
                          </label>
                          <IconWrap icon={Building2}>
                            <input
                              name="city"
                              value={form.city}
                              onChange={handleChange}
                              type="text"
                              className={`${FIELD_CLASS_COMPACT} pl-10`}
                              placeholder="City"
                            />
                          </IconWrap>
                        </div>
                        <div>
                          <label className={LABEL_COMPACT}>
                            State
                            <RequiredMark />
                          </label>
                          <IconWrap icon={Map}>
                            <input
                              name="state"
                              value={form.state}
                              onChange={handleChange}
                              type="text"
                              className={`${FIELD_CLASS_COMPACT} pl-10`}
                              placeholder="State"
                            />
                          </IconWrap>
                        </div>
                      </div>

                      </div>

                      <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div>
                          <label className={LABEL_COMPACT}>
                            Pincode
                            <RequiredMark />
                          </label>
                          <IconWrap icon={MapPin}>
                            <input
                              name="pincode"
                              value={form.pincode}
                              onChange={handleChange}
                              type="text"
                              inputMode="numeric"
                              maxLength={10}
                              className={`${FIELD_CLASS_COMPACT} pl-10`}
                              placeholder="Pincode"
                            />
                          </IconWrap>
                        </div>
                        <div className="sm:col-span-2">
                          <label className={LABEL_COMPACT}>Parent / Store logo</label>
                          <div className="flex min-h-[42px] flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-[#f3faf8] px-3 py-1.5">
                            <ImageIcon className="h-4 w-4 shrink-0 text-[#00A88F]" />
                            <input
                              ref={logoInputRef}
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="sr-only"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                if (file.size > 5 * 1024 * 1024) {
                                  setError("Logo must be 5 MB or smaller.");
                                  return;
                                }
                                setError(null);
                                setStoreLogoFile(file);
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => logoInputRef.current?.click()}
                              className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-[#00A88F] bg-white px-2 text-xs font-medium text-[#00A88F]"
                            >
                              {logoPreviewUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={logoPreviewUrl}
                                  alt="Logo preview"
                                  className="h-5 w-5 rounded object-contain"
                                />
                              ) : (
                                <span>Choose image</span>
                              )}
                            </button>
                            {storeLogoFile && (
                              <button
                                type="button"
                                onClick={() => {
                                  setStoreLogoFile(null);
                                  if (logoInputRef.current)
                                    logoInputRef.current.value = "";
                                }}
                                className="text-xs text-red-600 hover:underline"
                              >
                                Remove
                              </button>
                            )}
                            <span className="text-xs font-normal text-slate-500">
                              JPEG, PNG or WebP · Max 5 MB · Optional
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex shrink-0 flex-col-reverse items-stretch gap-3 border-t border-slate-100 bg-white pt-4 sm:flex-row sm:items-center">
                      <button
                        type="button"
                        onClick={() => {
                          setStep("phone");
                          setError(null);
                          setPrimaryNumberVerified(false);
                        }}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-[#00A88F] transition-colors hover:bg-[#00A88F]/5"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Back to mobile
                      </button>
                      <button
                        type="submit"
                        disabled={loading || !primaryNumberVerified}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#00A88F] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#009078] disabled:cursor-not-allowed disabled:opacity-50 sm:text-base"
                      >
                        {loading ? "Registering…" : "Complete registration"}
                        {!loading && <ArrowRight className="h-4 w-4" />}
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
