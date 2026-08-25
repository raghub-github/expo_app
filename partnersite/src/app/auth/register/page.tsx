"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Phone, User, Loader2, ArrowRight, MapPin, Image } from "lucide-react";
import {
  OTP_RATE_LIMIT_USER_MESSAGE,
  requestEmailOTP,
  verifyEmailOTP,
  requestPhoneOTP,
  verifyPhoneOTP,
} from "@/lib/auth/supabase-client";
import { formatCountdownMmSs } from "@/lib/auth/format-countdown";
import { PARTNER_AUTH_TOAST_MS } from "@/lib/auth/partner-auth-toast";
import { ENABLE_PHONE_OTP_REGISTER } from "@/lib/auth/phone-otp-config";
import { supabase } from "@/lib/supabase";
import { LoginPageShell } from "@/app/auth/login/components/LoginPageShell";
import { LoginInputField } from "@/app/auth/login/components/LoginInputField";
import { PrimaryButton } from "@/app/auth/login/components/PrimaryButton";
import { RegisterFormHeader } from "@/app/auth/register/components/RegisterFormHeader";
import { OTPInputComponent } from "@/app/auth/login/components/OTPInputComponent";
import { toast } from "sonner";
import { clearPartnerStoreSelection } from "@/lib/partner-selected-store";
import {
  clearParentRegisterDraft,
  loadParentRegisterDraft,
  saveParentRegisterDraft,
} from "@/lib/auth/register-draft-storage";
import { MerchantReferralCodeField, type MerchantReferralCodeFieldHandle } from "@/components/MerchantReferralCodeField";
import { useOnboardingStoreTypes } from "@/hooks/useOnboardingStoreTypes";
import { isOtherStoreType } from "@/lib/onboarding-store-types";
import {
  parseMerchantReferralFromPath,
  peekPendingMerchantReferral,
  pickMerchantReferralCode,
  storePendingMerchantReferral,
  clearPendingMerchantReferral,
} from "@/lib/pendingMerchantReferral";
import { persistPartnerSession } from "@/lib/auth/persist-partner-session";

type Step = 1 | 2 | 3;

const RESEND_OTP_COOLDOWN_SEC = 60;

const FIELD_CLASS =
  "w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 placeholder:text-slate-500 text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-2 focus:border-emerald-400 focus:bg-white hover:border-slate-300";

/** Compact fields for step-3 profile — polished inputs that fill the white area. */
const FIELD_CLASS_COMPACT =
  "auth-field w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-[15px] font-normal leading-snug text-slate-800 placeholder:font-normal placeholder:text-slate-400 shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-400 hover:border-slate-300";

const LABEL_COMPACT =
  "mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500";

const OTP_LABEL_CLASS = "block text-center text-sm font-semibold text-slate-800 mb-3";

const SECONDARY_BTN =
  "py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

const RESEND_BTN =
  "py-2.5 px-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-medium hover:bg-emerald-100 hover:border-emerald-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** Errors go to top-right toast — never inline in the form. */
function setError(msg: string) {
  if (!msg) return;
  toast.error(msg, { duration: PARTNER_AUTH_TOAST_MS });
}

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0); // Cooldown in seconds (email)
  const [mobileResendCooldown, setMobileResendCooldown] = useState(0); // Cooldown for Resend SMS

  useEffect(() => {
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    if (u.searchParams.get("reason") !== "parent_removed") return;
    toast.error("That merchant account is no longer available. Register again to continue.", {
      duration: PARTNER_AUTH_TOAST_MS,
    });
    u.searchParams.delete("reason");
    const qs = u.searchParams.toString();
    window.history.replaceState({}, "", `${u.pathname}${qs ? `?${qs}` : ""}`);
  }, []);

  // Cooldown timer effect (email)
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [resendCooldown]);

  // Cooldown timer for mobile Resend SMS
  useEffect(() => {
    if (mobileResendCooldown > 0) {
      const timer = setInterval(() => {
        setMobileResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [mobileResendCooldown]);

  // Step-3 verified notice as top-right toast (not in form)
  useEffect(() => {
    if (step !== 3) return;
    toast.success(
      ENABLE_PHONE_OTP_REGISTER ? "Email & mobile verified" : "Email verified, mobile added",
      { duration: PARTNER_AUTH_TOAST_MS }
    );
  }, [step]);
  // Step 1: email OTP
  const [email, setEmail] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailUserId, setEmailUserId] = useState<string | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState("");

  // Step 2: mobile OTP
  const [mobile, setMobile] = useState("");
  const [mobileOtp, setMobileOtp] = useState("");
  const [mobileOtpSent, setMobileOtpSent] = useState(false);

  // Step 3: other details (no password)
  const [owner_name, setOwnerName] = useState("");
  const [parent_name, setParentName] = useState("");
  const [merchant_type, setMerchantType] = useState<"LOCAL" | "BRAND" | "CHAIN" | "FRANCHISE">("LOCAL");
  const [brand_name, setBrandName] = useState("");
  const [business_category, setBusinessCategory] = useState("");
  const [business_category_other, setBusinessCategoryOther] = useState("");
  const [alternate_phone, setAlternatePhone] = useState("");
  const [address_line1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [store_logo_file, setStoreLogoFile] = useState<File | null>(null);
  const [store_logo_preview, setStoreLogoPreview] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState("");
  const [referralApplied, setReferralApplied] = useState(false);
  const [referralFromName, setReferralFromName] = useState<string | null>(null);
  const [referralInviteeLine, setReferralInviteeLine] = useState<string | null>(null);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [referralSource, setReferralSource] = useState<"deep_link" | "manual">("manual");
  const [referralServiceAvailable, setReferralServiceAvailable] = useState(true);

  const emailVerifyInFlightRef = useRef(false);
  const lastEmailOtpRef = useRef("");
  const sessionTokensRef = useRef<{ access_token: string; refresh_token: string } | null>(null);
  const mobileVerifyInFlightRef = useRef(false);
  const lastMobileOtpRef = useRef("");
  const restoreAttemptedRef = useRef(false);
  const referralHydratedRef = useRef(false);
  const referralFieldRef = useRef<MerchantReferralCodeFieldHandle>(null);
  const { options: businessCategoryOptions } = useOnboardingStoreTypes("OTHER");

  // Capture deep-link / pending referral before any auth step so refresh and login keep it.
  useEffect(() => {
    if (referralHydratedRef.current) return;
    referralHydratedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    if (params.get("referralUnavailable") === "1") {
      setReferralServiceAvailable(false);
      setReferralApplied(false);
      setReferralError("This referral code is no longer available.");
      return;
    }
    const fromUrl = parseMerchantReferralFromPath(
      window.location.pathname,
      window.location.search,
    );
    const stored = peekPendingMerchantReferral();
    const draft = loadParentRegisterDraft();
    if (fromUrl?.code) {
      storePendingMerchantReferral({
        code: fromUrl.code,
        clickToken: fromUrl.clickToken,
        source: "deep_link",
      });
      setReferralSource("deep_link");
    }
    const resolved = pickMerchantReferralCode({
      explicit: draft?.referralCode,
      deepLink: fromUrl?.code,
      stored: stored?.code,
    });
    if (!resolved) return;
    setReferralCode(resolved);
    void (async () => {
      try {
        const res = await fetch(
          `/api/referral/preview?referralCode=${encodeURIComponent(resolved)}&userType=merchant`,
          { cache: "no-store" },
        );
        const data = await res.json().catch(() => ({}));
        if (res.status === 409 || data?.code === "REFERRAL_SERVICE_DISABLED" || data?.error === "REFERRAL_SERVICE_DISABLED") {
          setReferralApplied(false);
          setReferralCode("");
          setReferralError(null);
          setReferralServiceAvailable(false);
          clearPendingMerchantReferral();
          return;
        }
        if (res.ok && data?.ok && data.valid !== false) {
          setReferralApplied(true);
          setReferralFromName(data.referrerDisplayName ?? null);
          setReferralInviteeLine(data.inviteeRewardLine ?? null);
          setReferralError(null);
        }
      } catch {
        /* user can Apply manually */
      }
    })();
  }, []);

  // After refresh: restore verified email/phone progress (session + sessionStorage draft).
  useEffect(() => {
    if (restoreAttemptedRef.current) return;
    restoreAttemptedRef.current = true;

    let cancelled = false;
    void (async () => {
      try {
        const draft = loadParentRegisterDraft();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (cancelled) return;

        const sessionEmail = session?.user?.email?.trim().toLowerCase() ?? "";
        const sessionUserId = session?.user?.id ?? "";
        const sessionPhone = session?.user?.phone
          ? normalizePhone(session.user.phone)
          : "";
        if (session?.access_token && session.refresh_token) {
          sessionTokensRef.current = {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          };
        }

        if (!sessionUserId && !draft?.emailUserId) return;

        const resolvedEmail = draft?.verifiedEmail || sessionEmail;
        if (resolvedEmail) {
          const checkRes = await fetch(
            `/api/auth/check-existing?email=${encodeURIComponent(resolvedEmail)}`
          );
          const checkData = await checkRes.json();
          if (cancelled) return;
          if (checkData.exists) {
            sessionTokensRef.current = null;
            return;
          }
        }

        const uid = draft?.emailUserId || sessionUserId;
        const verified = draft?.verifiedEmail || sessionEmail;
        if (!uid || !verified) return;

        setEmail(verified);
        setVerifiedEmail(verified);
        setEmailUserId(uid);
        setEmailOtpSent(true);

        const mobileTen = draft?.mobile || sessionPhone;
        if (mobileTen.length === 10) {
          setMobile(mobileTen);
        }

        if (draft) {
          if (draft.owner_name) setOwnerName(draft.owner_name);
          if (draft.parent_name) setParentName(draft.parent_name);
          if (draft.merchant_type) setMerchantType(draft.merchant_type);
          if (draft.brand_name) setBrandName(draft.brand_name);
          if (draft.business_category) {
            const code = draft.business_category.trim();
            const upper = code.toUpperCase();
            if (isOtherStoreType(upper)) {
              setBusinessCategory("OTHER");
              if (draft.business_category_other) {
                setBusinessCategoryOther(draft.business_category_other);
              }
            } else if (/^[A-Z][A-Z0-9_]*$/.test(upper)) {
              setBusinessCategory(upper);
              if (draft.business_category_other) {
                setBusinessCategoryOther(draft.business_category_other);
              }
            } else {
              setBusinessCategory("OTHER");
              setBusinessCategoryOther(
                draft.business_category_other || draft.business_category
              );
            }
          } else if (draft.business_category_other) {
            setBusinessCategory("OTHER");
            setBusinessCategoryOther(draft.business_category_other);
          }
          if (draft.alternate_phone) setAlternatePhone(draft.alternate_phone);
          if (draft.address_line1) setAddressLine1(draft.address_line1);
          if (draft.city) setCity(draft.city);
          if (draft.state) setState(draft.state);
          if (draft.pincode) setPincode(draft.pincode);
          if (draft.referralCode) setReferralCode(draft.referralCode);
        }

        const restoredStep: Step =
          draft?.step ??
          (mobileTen.length === 10 || !ENABLE_PHONE_OTP_REGISTER ? 3 : 2);
        setStep(restoredStep);
      } catch {
        // stay on step 1
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist registration progress so refresh keeps step 3 form data.
  useEffect(() => {
    if (!emailUserId || !verifiedEmail) return;
    saveParentRegisterDraft({
      step,
      email: verifiedEmail,
      verifiedEmail,
      emailUserId,
      mobile: normalizePhone(mobile),
      owner_name,
      parent_name,
      merchant_type,
      brand_name,
      business_category,
      business_category_other,
      alternate_phone,
      address_line1,
      city,
      state,
      pincode,
      referralCode,
    });
  }, [
    step,
    emailUserId,
    verifiedEmail,
    mobile,
    owner_name,
    parent_name,
    merchant_type,
    brand_name,
    business_category,
    business_category_other,
    alternate_phone,
    address_line1,
    city,
    state,
    pincode,
    referralCode,
  ]);

  const handleSendEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const em = email.trim().toLowerCase();
    if (!em || !/^\S+@\S+\.\S+$/.test(em)) {
      setError("Enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      const checkRes = await fetch(`/api/auth/check-existing?email=${encodeURIComponent(em)}`);
      const checkData = await checkRes.json();
      if (checkData.exists) {
        await supabase.auth.signOut();
        setError("This email is already registered. Please login to proceed.");
        setLoading(false);
        return;
      }
      const result = await requestEmailOTP(em);
      if (!result.success) {
        if (result.error === "EMAIL_RATE_LIMIT_EXCEEDED") {
          setError(OTP_RATE_LIMIT_USER_MESSAGE);
          setResendCooldown(300); // 5 minute cooldown to prevent hitting Supabase rate limits
        } else {
          const errMsg = typeof result.error === "string" ? result.error : "Failed to send OTP to email.";
          setError(errMsg);
        }
        return;
      }
      setEmailOtpSent(true);
      setError("");
      setResendCooldown(RESEND_OTP_COOLDOWN_SEC);
      toast.success(`Code sent to ${em}`, { duration: PARTNER_AUTH_TOAST_MS });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const runVerifyEmailOtp = useCallback(
    async (otpValue: string) => {
      setError("");
      const em = email.trim().toLowerCase();
      const code = otpValue.replace(/\D/g, "").slice(0, 8);
      if (!em || code.length < 8) {
        setError("Enter the 8-digit code sent to your email.");
        return;
      }
      if (emailVerifyInFlightRef.current) return;
      if (lastEmailOtpRef.current === code) return;

      lastEmailOtpRef.current = code;
      emailVerifyInFlightRef.current = true;
      setLoading(true);
      try {
        const result = await verifyEmailOTP(em, code);
        if (!result.success) {
          lastEmailOtpRef.current = "";
          const errorMsg = result.error || "Invalid or expired code.";
          if (errorMsg.toLowerCase().includes("expired") || errorMsg.toLowerCase().includes("invalid")) {
            setError("The verification code has expired or is invalid. Please click 'Resend OTP' to get a new code.");
          } else {
            setError(errorMsg);
          }
          return;
        }
        const uid = result.data?.session?.user?.id;
        const access_token = result.data?.session?.access_token;
        const refresh_token = result.data?.session?.refresh_token;
        if (!uid) {
          lastEmailOtpRef.current = "";
          setError("Verification succeeded but session was not created. Please try again.");
          return;
        }
        if (access_token && refresh_token) {
          sessionTokensRef.current = { access_token, refresh_token };
        }
        setEmailUserId(uid);
        setVerifiedEmail(em);
        toast.success(`Email verified: ${em}`, { duration: PARTNER_AUTH_TOAST_MS });
        setStep(2);
      } catch {
        lastEmailOtpRef.current = "";
        setError("Something went wrong. Please try again.");
      } finally {
        setLoading(false);
        emailVerifyInFlightRef.current = false;
      }
    },
    [email]
  );

  const handleEmailOtpComplete = useCallback(
    (otp: string) => {
      void runVerifyEmailOtp(otp);
    },
    [runVerifyEmailOtp]
  );

  const handleVerifyEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    await runVerifyEmailOtp(emailOtp);
  };

  const handleSendMobileOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const ten = normalizePhone(mobile);
    if (ten.length !== 10) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    setLoading(true);
    try {
      const checkRes = await fetch(`/api/auth/check-existing?phone=${encodeURIComponent(ten)}`);
      const checkData = await checkRes.json();
      if (checkData.exists) {
        await supabase.auth.signOut();
        setError("This mobile number is already registered. Please login to proceed.");
        setLoading(false);
        return;
      }
      const result = await requestPhoneOTP(`+91${ten}`);
      if (!result.success) {
        const msg = result.error || "Failed to send OTP to mobile.";
        // Supabase returns this when no SMS provider (e.g. Twilio) is configured
        if (msg.toLowerCase().includes("unsupported phone provider") || msg.toLowerCase().includes("phone provider")) {
          setError(
            "SMS is not configured for this app. The administrator needs to set up an SMS provider (e.g. Twilio) in Supabase Dashboard → Authentication → Providers → Phone. Please contact support or try again later."
          );
        } else {
          setError(msg);
        }
        return;
      }
      setMobileOtpSent(true);
      setMobileResendCooldown(RESEND_OTP_COOLDOWN_SEC);
      toast.success(`Code sent to +91 ${ten}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendMobileOtp = async () => {
    if (mobileResendCooldown > 0) return;
    const ten = normalizePhone(mobile);
    if (ten.length !== 10) return;
    setError("");
    setLoading(true);
    try {
      const result = await requestPhoneOTP(`+91${ten}`);
      if (!result.success) {
        setError(result.error || "Failed to resend OTP. Please try again.");
        return;
      }
      setMobileResendCooldown(RESEND_OTP_COOLDOWN_SEC);
      toast.success(`Code sent to +91 ${ten}`);
    } catch {
      setError("Failed to resend OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /** When phone OTP is disabled, just collect mobile and go to step 3. */
  const handleMobileContinueWithoutOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const ten = normalizePhone(mobile);
    if (ten.length !== 10) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    setLoading(true);
    try {
      const checkRes = await fetch(`/api/auth/check-existing?phone=${encodeURIComponent(ten)}`);
      const checkData = await checkRes.json();
      if (checkData.exists) {
        await supabase.auth.signOut();
        setError("This mobile number is already registered. Please login to proceed.");
        setLoading(false);
        return;
      }
      setStep(3);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const runVerifyMobileOtp = useCallback(
    async (otpValue: string) => {
      setError("");
      const ten = normalizePhone(mobile);
      const code = otpValue.replace(/\D/g, "").slice(0, 6);
      if (ten.length !== 10 || code.length < 6) {
        setError("Enter the 6-digit OTP sent to your mobile.");
        return;
      }
      if (mobileVerifyInFlightRef.current) return;
      if (lastMobileOtpRef.current === code) return;

      lastMobileOtpRef.current = code;
      mobileVerifyInFlightRef.current = true;
      setLoading(true);
      try {
        const result = await verifyPhoneOTP(`+91${ten}`, code);
        if (!result.success) {
          lastMobileOtpRef.current = "";
          setError(typeof result.error === "string" ? result.error : "Invalid or expired OTP.");
          return;
        }
        const access_token = result.data?.session?.access_token;
        const refresh_token = result.data?.session?.refresh_token;
        if (access_token && refresh_token) {
          sessionTokensRef.current = { access_token, refresh_token };
        }
        setStep(3);
      } catch {
        lastMobileOtpRef.current = "";
        setError("Something went wrong. Please try again.");
      } finally {
        setLoading(false);
        mobileVerifyInFlightRef.current = false;
      }
    },
    [mobile]
  );

  const handleMobileOtpComplete = useCallback(
    (otp: string) => {
      void runVerifyMobileOtp(otp);
    },
    [runVerifyMobileOtp]
  );

  const handleVerifyMobileOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    await runVerifyMobileOtp(mobileOtp);
  };

  const handleSubmitDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!owner_name.trim()) {
      setError("Owner / Contact name is required.");
      return;
    }
    if (!parent_name.trim()) {
      setError("Business / Parent name is required.");
      return;
    }
    if (!emailUserId || !verifiedEmail) {
      setError("Session expired. Please start registration again.");
      return;
    }
    const ten = normalizePhone(mobile);
    if (ten.length !== 10) {
      setError("Valid mobile number is required.");
      return;
    }
    const altPhone = alternate_phone.trim();
    if (altPhone && !/^\+?[0-9]{10,15}$/.test(altPhone.replace(/\s/g, ""))) {
      setError("Alternate phone must be 10–15 digits (optional + prefix).");
      return;
    }
    if (!business_category.trim()) {
      setError("Business category is required.");
      return;
    }
    if (business_category === "OTHER" && !business_category_other.trim()) {
      setError("Please specify your business category.");
      return;
    }
    let validatedReferralCode: string | null = null;
    if (referralServiceAvailable) {
      const checked = await referralFieldRef.current?.verify();
      if (checked && !checked.ok) {
        setError("Please enter a valid referral code, or leave it blank.");
        return;
      }
      validatedReferralCode = checked?.ok ? checked.code : null;
    }
    setLoading(true);
    try {
      const resolvedCategory =
        business_category === "OTHER"
          ? business_category_other.trim()
          : business_category || null;
      const payload = {
        email_user_id: emailUserId,
        email: verifiedEmail,
        mobile: ten,
        owner_name: owner_name.trim(),
        parent_name: parent_name.trim(),
        merchant_type,
        brand_name: brand_name.trim() || null,
        business_category: resolvedCategory,
        alternate_phone: altPhone || null,
        address_line1: address_line1.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        pincode: pincode.trim() || null,
        referralCode: validatedReferralCode,
        referralSource,
      };
      let res: Response;
      if (store_logo_file) {
        const formData = new FormData();
        Object.entries(payload).forEach(([k, v]) => {
          if (v != null && v !== "") formData.set(k, String(v));
        });
        formData.set("store_logo", store_logo_file);
        res = await fetch("/api/auth/register", { method: "POST", body: formData });
      } else {
        res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Registration failed.");
        setLoading(false);
        return;
      }
      // Never carry another account's selected store into this session
      clearPartnerStoreSelection();
      clearParentRegisterDraft();
      const parentPk = data?.data?.parent_id ?? data?.parent_id;
      const parentPublicId = data?.data?.parent_merchant_id ?? data?.parent_merchant_id;
      const parentId = parentPk ?? parentPublicId;
      toast.success("Congratulations - Your Parent Account created Successfully", {
        duration: 4000,
      });
      if (parentId != null && String(parentId).trim()) {
        const tokens = sessionTokensRef.current;
        const sessionOk = await persistPartnerSession({
          parentId: parentPk ?? parentId,
          loginMethod: "register",
          accessToken: tokens?.access_token,
          refreshToken: tokens?.refresh_token,
        });
        await new Promise((r) => setTimeout(r, 600));
        if (sessionOk) {
          window.location.replace("/partners/all-stores?picker=1");
        } else {
          try {
            const { partnerLogoutLocal } = await import("@/lib/auth/partner-logout");
            await partnerLogoutLocal({ redirectToLogin: false, clearStoreSelection: true });
          } catch {
            /* ignore */
          }
          window.location.replace("/auth?registered=1");
        }
        return;
      }
      router.push("/auth?registered=1");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setStoreLogoFile(null);
      setStoreLogoPreview(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file (JPEG, PNG, WebP).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Logo must be under 5 MB.");
      return;
    }
    setError("");
    setStoreLogoFile(file);
    setStoreLogoPreview(URL.createObjectURL(file));
  };

  const stepSubtitle =
    step === 1
      ? "Verify your business email to get started"
      : step === 2
        ? ENABLE_PHONE_OTP_REGISTER
          ? "Verify your mobile number to continue"
          : "Add your mobile number to continue"
        : "Complete your business profile";

  const showOtpForm =
    (step === 1 && emailOtpSent) || (step === 2 && mobileOtpSent && ENABLE_PHONE_OTP_REGISTER);

  return (
    <LoginPageShell
      contentMaxWidthClass={step === 3 ? "max-w-none" : undefined}
      headerPrompt="Have an account?"
      headerLinkLabel="Log In"
      headerLinkHref="/auth"
      sidebarVariant="signup"
    >
      <>
        {step !== 3 ? (
          <RegisterFormHeader step={step} subtitle={stepSubtitle} otpMode={showOtpForm} />
        ) : null}

        <div className={step === 3 ? "mt-0 flex h-full min-h-0 w-full flex-col" : showOtpForm ? "mt-3 w-full" : "mt-5 w-full"}>
        {/* Step 1: Email → OTP */}
        {step === 1 && (
          <div className={showOtpForm ? "space-y-4" : "space-y-5"}>
            {!emailOtpSent ? (
              <form onSubmit={handleSendEmailOtp} className="space-y-5">
                <LoginInputField
                  type="email"
                  label="Business email address"
                  value={email}
                  onChange={setEmail}
                  placeholder="you@business.com"
                  icon={<Mail className="w-5 h-5" />}
                  autoComplete="email"
                />
                <PrimaryButton
                  type="submit"
                  loading={loading}
                  disabled={resendCooldown > 0}
                >
                  {resendCooldown > 0 ? `Wait ${formatCountdownMmSs(resendCooldown)}` : "Send OTP to email"}
                </PrimaryButton>
              </form>
            ) : (
              <form onSubmit={handleVerifyEmailOtp} className="space-y-4">
                <div>
                  <label className={OTP_LABEL_CLASS}>Verification code</label>
                  <OTPInputComponent
                    length={8}
                    value={emailOtp}
                    onChange={setEmailOtp}
                    onComplete={handleEmailOtpComplete}
                    disabled={loading}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEmailOtpSent(false);
                      setEmailOtp("");
                      setError("");
                      setResendCooldown(0);
                      lastEmailOtpRef.current = "";
                    }}
                    className={SECONDARY_BTN}
                  >
                    Change email
                  </button>
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.preventDefault();
                      if (resendCooldown > 0) return;
                      setError("");
                      setEmailOtp("");
                      lastEmailOtpRef.current = "";
                      setLoading(true);
                      try {
                        const em = email.trim().toLowerCase();
                        if (!em || !/^\S+@\S+\.\S+$/.test(em)) {
                          setError("Invalid email address.");
                          setLoading(false);
                          return;
                        }
                        const result = await requestEmailOTP(em);
                        if (!result.success) {
                          if (result.error === "EMAIL_RATE_LIMIT_EXCEEDED") {
                            setError(OTP_RATE_LIMIT_USER_MESSAGE);
                            setResendCooldown(300);
                          } else {
                            setError(typeof result.error === "string" ? result.error : "Failed to resend OTP. Please try again.");
                          }
                          return;
                        }
                        setError("");
                        setResendCooldown(RESEND_OTP_COOLDOWN_SEC);
                        toast.success(`Code sent to ${em}`, { duration: PARTNER_AUTH_TOAST_MS });
                      } catch {
                        setError("Something went wrong. Please try again.");
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading || resendCooldown > 0}
                    className={resendCooldown > 0 ? SECONDARY_BTN : RESEND_BTN}
                  >
                    {loading ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Sending…
                      </span>
                    ) : resendCooldown > 0 ? (
                      `Resend OTP in ${formatCountdownMmSs(resendCooldown)}`
                    ) : (
                      "Resend OTP"
                    )}
                  </button>
                  <PrimaryButton
                    type="submit"
                    loading={loading}
                    disabled={emailOtp.length < 8}
                    className="flex-1 min-w-[140px]"
                  >
                    Verify & continue
                  </PrimaryButton>
                </div>
                {resendCooldown > 0 && (
                  <p className="text-xs text-slate-500 text-center">
                    You can request a new code in{' '}
                    <span className="font-medium text-slate-700">{formatCountdownMmSs(resendCooldown)}</span>.
                  </p>
                )}
              </form>
            )}
          </div>
        )}

        {/* Step 2: Mobile (collect only when OTP disabled; otherwise OTP verify) */}
        {step === 2 && (
          <div className={mobileOtpSent && ENABLE_PHONE_OTP_REGISTER ? "space-y-4" : "space-y-5"}>
            {!ENABLE_PHONE_OTP_REGISTER ? (
              <form onSubmit={handleMobileContinueWithoutOtp} className="space-y-5">
                <LoginInputField
                  type="tel"
                  label="Mobile number"
                  value={mobile}
                  onChange={(v) => setMobile(v.replace(/\D/g, "").slice(0, 10))}
                  placeholder="9876543210"
                  helperText="We'll use this to contact you. OTP verification can be enabled later."
                  icon={<Phone className="w-5 h-5" />}
                  maxLength={10}
                  inputMode="numeric"
                  autoComplete="tel"
                />
                <PrimaryButton
                  type="submit"
                  loading={loading}
                  disabled={mobile.replace(/\D/g, "").length !== 10}
                >
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </PrimaryButton>
              </form>
            ) : !mobileOtpSent ? (
              <form onSubmit={handleSendMobileOtp} className="space-y-5">
                <LoginInputField
                  type="tel"
                  label="Mobile number"
                  value={mobile}
                  onChange={(v) => setMobile(v.replace(/\D/g, "").slice(0, 10))}
                  placeholder="9876543210"
                  helperText="We'll send a 6-digit OTP via SMS."
                  icon={<Phone className="w-5 h-5" />}
                  maxLength={10}
                  inputMode="numeric"
                  autoComplete="tel"
                />
                <PrimaryButton
                  type="submit"
                  loading={loading}
                  disabled={mobile.replace(/\D/g, "").length !== 10}
                >
                  Send OTP to mobile
                </PrimaryButton>
              </form>
            ) : (
              <form onSubmit={handleVerifyMobileOtp} className="space-y-4">
                <div>
                  <label className={OTP_LABEL_CLASS}>Mobile OTP</label>
                  <OTPInputComponent
                    value={mobileOtp}
                    onChange={setMobileOtp}
                    onComplete={handleMobileOtpComplete}
                    disabled={loading}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileOtpSent(false);
                      setMobileOtp("");
                      setError("");
                      setMobileResendCooldown(0);
                      lastMobileOtpRef.current = "";
                    }}
                    className={SECONDARY_BTN}
                  >
                    Change number
                  </button>
                  <PrimaryButton
                    type="submit"
                    loading={loading}
                    disabled={mobileOtp.length < 6}
                    className="flex-1 min-w-[140px]"
                  >
                    Verify & continue
                  </PrimaryButton>
                </div>
                <p className="text-sm text-slate-600 text-center">
                  Didn&apos;t receive OTP?{" "}
                  {mobileResendCooldown > 0 ? (
                    <span className="text-slate-500">Resend SMS in {mobileResendCooldown}s</span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendMobileOtp}
                      disabled={loading}
                      className="text-emerald-600 hover:underline font-medium disabled:opacity-50"
                    >
                      Resend SMS
                    </button>
                  )}
                </p>
              </form>
            )}
            <button
              type="button"
              onClick={() => setStep(1)}
              className="w-full py-2 text-sm text-slate-600 hover:text-slate-900"
            >
              ← Back to email
            </button>
          </div>
        )}

        {/* Step 3: Full parent details — wide compact grid (2–3 fields / row) */}
        {step === 3 && (
          <div className="flex h-full min-h-0 w-full flex-col">
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-2xl border-2 border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-7 sm:py-6">
              <RegisterFormHeader step={step} subtitle={stepSubtitle} compact />
              <div className="mt-3">
          <form onSubmit={handleSubmitDetails} className="space-y-5">
            <div
              className={`grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 ${
                merchant_type === "BRAND" || merchant_type === "CHAIN" || merchant_type === "FRANCHISE"
                  ? "lg:grid-cols-4"
                  : "lg:grid-cols-3"
              }`}
            >
              <div>
                <label className={LABEL_COMPACT}>Owner / Contact Name *</label>
                <div className="relative">
                  <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={owner_name}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="Owner name"
                    required
                    className={`${FIELD_CLASS_COMPACT} pl-9`}
                  />
                </div>
              </div>
              <div>
                <label className={LABEL_COMPACT}>Business / Parent Name *</label>
                <input
                  type="text"
                  value={parent_name}
                  onChange={(e) => setParentName(e.target.value)}
                  placeholder="Restaurant / Brand"
                  required
                  className={FIELD_CLASS_COMPACT}
                />
              </div>
              <div>
                <label className={LABEL_COMPACT}>Merchant Type *</label>
                <select
                  value={merchant_type}
                  onChange={(e) => setMerchantType(e.target.value as "LOCAL" | "BRAND" | "CHAIN" | "FRANCHISE")}
                  className={FIELD_CLASS_COMPACT}
                >
                  <option value="LOCAL">Local</option>
                  <option value="BRAND">Brand</option>
                  <option value="CHAIN">Chain</option>
                  <option value="FRANCHISE">Franchise</option>
                </select>
              </div>
              {(merchant_type === "BRAND" || merchant_type === "CHAIN" || merchant_type === "FRANCHISE") && (
                <div>
                  <label className={LABEL_COMPACT}>Brand Name</label>
                  <input
                    type="text"
                    value={brand_name}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="Brand / chain name"
                    className={FIELD_CLASS_COMPACT}
                  />
                </div>
              )}
            </div>

            <div
              className={`grid grid-cols-1 gap-x-4 gap-y-4 ${
                business_category === "OTHER" ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3"
              }`}
            >
              <div>
                <label className={LABEL_COMPACT}>
                  Business Category <span className="text-red-500">*</span>
                </label>
                <select
                  value={business_category}
                  required
                  onChange={(e) => {
                    const next = e.target.value;
                    setBusinessCategory(next);
                    if (next !== "OTHER") setBusinessCategoryOther("");
                  }}
                  className={FIELD_CLASS_COMPACT}
                >
                  <option value="">Select</option>
                  {businessCategoryOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                  {business_category &&
                  !businessCategoryOptions.some((o) => o.value === business_category) ? (
                    <option value={business_category}>{business_category}</option>
                  ) : null}
                </select>
              </div>
              {business_category === "OTHER" ? (
                <div>
                  <label className={LABEL_COMPACT}>Specify Category *</label>
                  <input
                    type="text"
                    value={business_category_other}
                    onChange={(e) => setBusinessCategoryOther(e.target.value)}
                    placeholder="Enter business type"
                    className={FIELD_CLASS_COMPACT}
                  />
                </div>
              ) : null}
              <div>
                <label className={LABEL_COMPACT}>Alternate Phone</label>
                <input
                  type="tel"
                  value={alternate_phone}
                  onChange={(e) => setAlternatePhone(e.target.value.replace(/\D/g, "").slice(0, 15))}
                  placeholder="+91 or 10–15 digits"
                  inputMode="numeric"
                  className={`${FIELD_CLASS_COMPACT} auth-num`}
                />
              </div>
              <MerchantReferralCodeField
                ref={referralFieldRef}
                value={referralCode}
                onChange={(code) => {
                  setReferralCode(code);
                  setReferralSource("manual");
                  if (code) {
                    storePendingMerchantReferral({ code, source: "manual" });
                  } else {
                    clearPendingMerchantReferral();
                  }
                }}
                applied={referralApplied}
                appliedFromName={referralFromName}
                inviteeRewardLine={referralInviteeLine}
                error={referralError}
                inputClassName={FIELD_CLASS_COMPACT}
                onServiceAvailableChange={(available) => {
                  setReferralServiceAvailable(available);
                  if (!available) {
                    setReferralApplied(false);
                    setReferralCode("");
                    setReferralFromName(null);
                    setReferralError(null);
                    clearPendingMerchantReferral();
                  } else {
                    setReferralError(null);
                  }
                }}
                onApplied={(preview) => {
                  if (!preview.ok) {
                    setReferralApplied(false);
                    setReferralFromName(null);
                    setReferralInviteeLine(null);
                    setReferralError(preview.message ?? "Invalid referral code. Please check the code and try again.");
                    return;
                  }
                  const code = preview.code || referralCode;
                  setReferralCode(code);
                  setReferralApplied(true);
                  setReferralFromName(preview.referrerDisplayName ?? null);
                  setReferralInviteeLine(preview.inviteeRewardLine ?? null);
                  setReferralError(null);
                  storePendingMerchantReferral({
                    code,
                    source: referralSource,
                  });
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
            <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-emerald-600 border-t border-slate-100 pt-2">
              <MapPin className="w-4 h-4 text-emerald-500" /> Address
            </div>

            <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className={LABEL_COMPACT}>Address line</label>
                <input
                  type="text"
                  value={address_line1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  placeholder="Street, building, landmark"
                  className={FIELD_CLASS_COMPACT}
                />
              </div>
              <div>
                <label className={LABEL_COMPACT}>City</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                  className={FIELD_CLASS_COMPACT}
                />
              </div>
              <div>
                <label className={LABEL_COMPACT}>State</label>
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="State"
                  className={FIELD_CLASS_COMPACT}
                />
              </div>
            </div>
            </div>

            <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className={LABEL_COMPACT}>Pincode</label>
                <input
                  type="text"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="Pincode"
                  inputMode="numeric"
                  className={`${FIELD_CLASS_COMPACT} auth-num`}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={LABEL_COMPACT}>Parent / Store logo</label>
                <div className="flex min-h-[42px] flex-wrap items-center gap-2 rounded-xl border border-dashed border-emerald-200/80 bg-emerald-50/40 px-3 py-1.5">
                  <Image className="w-4 h-4 shrink-0 text-emerald-500" />
                  <label className="cursor-pointer inline-flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-normal text-slate-600 shadow-sm hover:border-emerald-400 hover:text-emerald-700 transition-colors">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={handleLogoChange}
                    />
                    {store_logo_preview ? (
                      <img src={store_logo_preview} alt="Logo preview" className="w-6 h-6 object-contain rounded" />
                    ) : (
                      <span>Choose image</span>
                    )}
                  </label>
                  {store_logo_file && (
                    <button
                      type="button"
                      onClick={() => { setStoreLogoFile(null); setStoreLogoPreview(null); }}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                  <span className="text-xs font-normal text-slate-500">JPEG, PNG or WebP · Max 5 MB · Optional</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="py-2.5 px-5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-colors"
              >
                ← Back to mobile
              </button>
              <PrimaryButton type="submit" loading={loading} className="flex-1 py-2.5 text-base">
                Complete registration
                <ArrowRight className="w-4 h-4" />
              </PrimaryButton>
            </div>
          </form>
              </div>
            </div>
          </div>
        )}

        {step !== 3 && (
        <p className={`text-center text-sm text-slate-600 lg:hidden mt-6`}>
          Have an account?{" "}
          <Link
            href="/auth"
            className="font-semibold text-emerald-600 hover:text-emerald-700 hover:underline"
          >
            Log In
          </Link>
        </p>
        )}
        </div>
      </>
    </LoginPageShell>
  );
}
