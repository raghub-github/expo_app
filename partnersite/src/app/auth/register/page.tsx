"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Phone, User, Loader2, ArrowRight, MapPin, Image } from "lucide-react";
import { requestEmailOTP, verifyEmailOTP, requestPhoneOTP, verifyPhoneOTP } from "@/lib/auth/supabase-client";
import { ENABLE_PHONE_OTP_REGISTER } from "@/lib/auth/phone-otp-config";
import { supabase } from "@/lib/supabase";
import { LoginPageShell } from "@/app/auth/login/components/LoginPageShell";
import { LoginInputField } from "@/app/auth/login/components/LoginInputField";
import { PrimaryButton } from "@/app/auth/login/components/PrimaryButton";
import { RegisterFormHeader } from "@/app/auth/register/components/RegisterFormHeader";
import { toast } from "sonner";
import { clearPartnerStoreSelection } from "@/lib/partner-selected-store";

type Step = 1 | 2 | 3;

const RESEND_OTP_COOLDOWN_SEC = 60;

const FIELD_CLASS =
  "w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 placeholder:text-slate-400 text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:ring-offset-2 focus:border-orange-400 focus:bg-white hover:border-slate-300";

/** Compact fields for step-3 profile — polished inputs that fill the white area. */
const FIELD_CLASS_COMPACT =
  "auth-field w-full px-3.5 py-2.5 rounded-xl border border-slate-200/90 bg-white text-slate-900 placeholder:text-slate-400 text-sm shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-orange-500/25 focus:border-orange-400 hover:border-orange-200 hover:shadow-[0_4px_14px_rgba(249,115,22,0.08)]";

const LABEL_COMPACT = "block text-xs font-medium text-slate-600 mb-1 tracking-wide";

const SECONDARY_BTN =
  "py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

const RESEND_BTN =
  "py-2.5 px-4 rounded-xl border border-orange-200 bg-orange-50 text-orange-700 text-sm font-medium hover:bg-orange-100 hover:border-orange-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** Errors go to top-right toast — never inline in the form. */
function setError(msg: string) {
  if (!msg) return;
  toast.error(msg);
}

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0); // Cooldown in seconds (email)
  const [mobileResendCooldown, setMobileResendCooldown] = useState(0); // Cooldown for Resend SMS

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
      { duration: 2000 }
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
  const [alternate_phone, setAlternatePhone] = useState("");
  const [address_line1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [store_logo_file, setStoreLogoFile] = useState<File | null>(null);
  const [store_logo_preview, setStoreLogoPreview] = useState<string | null>(null);

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
          setError(
            "Email rate limit exceeded. Supabase limits email OTP requests to prevent spam. Please wait 5 minutes before requesting a new code, or try again later."
          );
          setResendCooldown(300); // 5 minute cooldown to prevent hitting Supabase rate limits
          setSuccessMessage("");
        } else {
          const errMsg = typeof result.error === "string" ? result.error : "Failed to send OTP to email.";
          setError(errMsg);
          setSuccessMessage("");
        }
        return;
      }
      setEmailOtpSent(true);
      setSuccessMessage("");
      setError("");
      setResendCooldown(RESEND_OTP_COOLDOWN_SEC);
      toast.success(`Code sent to ${em}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const em = email.trim().toLowerCase();
    if (!em || emailOtp.trim().length < 8) {
      setError("Enter the 8-digit code sent to your email.");
      return;
    }
    setLoading(true);
    try {
      const result = await verifyEmailOTP(em, emailOtp.trim());
      if (!result.success) {
        const errorMsg = result.error || "Invalid or expired code.";
        // Provide helpful message for expired tokens
        if (errorMsg.toLowerCase().includes("expired") || errorMsg.toLowerCase().includes("invalid")) {
          setError("The verification code has expired or is invalid. Please click 'Resend OTP' to get a new code.");
        } else {
          setError(errorMsg);
        }
        return;
      }
      const uid = result.data?.session?.user?.id;
      if (!uid) {
        setError("Verification succeeded but session was not created. Please try again.");
        return;
      }
      setEmailUserId(uid);
      setVerifiedEmail(em);
      toast.success(`Email verified: ${em}`, { duration: 2000 });
      setStep(2);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
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

  const handleVerifyMobileOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const ten = normalizePhone(mobile);
    if (ten.length !== 10 || mobileOtp.trim().length < 6) {
      setError("Enter the 6-digit OTP sent to your mobile.");
      return;
    }
    setLoading(true);
    try {
      const result = await verifyPhoneOTP(`+91${ten}`, mobileOtp.trim());
      if (!result.success) {
        setError(typeof result.error === "string" ? result.error : "Invalid or expired OTP.");
        return;
      }
      setStep(3);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
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
    setLoading(true);
    try {
      const payload = {
        email_user_id: emailUserId,
        email: verifiedEmail,
        mobile: ten,
        owner_name: owner_name.trim(),
        parent_name: parent_name.trim(),
        merchant_type,
        brand_name: brand_name.trim() || null,
        business_category: business_category || null,
        alternate_phone: altPhone || null,
        address_line1: address_line1.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        pincode: pincode.trim() || null,
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
      const parentId =
        data?.data?.parent_id ??
        data?.parent_id ??
        data?.data?.parent_merchant_id ??
        data?.parent_merchant_id;
      toast.success("Congratulations - Your Parent Account created Successfully", {
        duration: 4000,
      });
      if (parentId != null && String(parentId).trim()) {
        // Brief pause so toast is visible before hard navigation
        await new Promise((r) => setTimeout(r, 600));
        window.location.href = `/auth/register-store?parent_id=${encodeURIComponent(String(parentId))}&new=1`;
        return;
      }
      router.push("/auth/login?registered=1");
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

  return (
    <LoginPageShell
      contentMaxWidthClass={step === 3 ? "max-w-none" : "max-w-md"}
      headerPrompt="Have an account?"
      headerLinkLabel="Log In"
      headerLinkHref="/auth/login"
      sidebarVariant="signup"
    >
      <div className={step === 3 ? "flex min-h-0 flex-1 flex-col" : ""}>
        <RegisterFormHeader step={step} subtitle={stepSubtitle} compact={step === 3} />

        <div className={step === 3 ? "mt-4 flex min-h-0 flex-1 flex-col" : "mt-8 max-w-sm mx-auto"}>
        {/* Step 1: Email → OTP */}
        {step === 1 && (
          <div className="space-y-5">
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
                  {resendCooldown > 0 ? `Wait ${resendCooldown}s` : "Send OTP to email"}
                </PrimaryButton>
              </form>
            ) : (
              <form onSubmit={handleVerifyEmailOtp} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Verification code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={emailOtp}
                    onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    placeholder="00000000"
                    maxLength={8}
                    className={`${FIELD_CLASS} auth-num-bold text-center text-xl tracking-[0.35em]`}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => { setEmailOtpSent(false); setEmailOtp(""); setError(""); setSuccessMessage(""); setResendCooldown(0); }}
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
                      setSuccessMessage("");
                      setEmailOtp("");
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
                            setError(
                              "Email rate limit exceeded. Please wait 5 minutes before requesting a new code."
                            );
                            setResendCooldown(300);
                            setSuccessMessage("");
                          } else {
                            setError(typeof result.error === "string" ? result.error : "Failed to resend OTP. Please try again.");
                            setSuccessMessage("");
                          }
                          return;
                        }
                        setError("");
                        setResendCooldown(RESEND_OTP_COOLDOWN_SEC);
                        toast.success(`Code sent to ${em}`);
                      } catch {
                        setError("Something went wrong. Please try again.");
                        setSuccessMessage("");
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
                      `Resend OTP in ${resendCooldown}s`
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
                    You can request a new code in <span className="font-medium text-slate-700">{resendCooldown}</span> seconds.
                  </p>
                )}
              </form>
            )}
          </div>
        )}

        {/* Step 2: Mobile (collect only when OTP disabled; otherwise OTP verify) */}
        {step === 2 && (
          <div className="space-y-5">
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
              <form onSubmit={handleVerifyMobileOtp} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Mobile OTP</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={mobileOtp}
                    onChange={(e) => setMobileOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    className={`${FIELD_CLASS} auth-num-bold text-center text-lg tracking-[0.4em]`}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => { setMobileOtpSent(false); setMobileOtp(""); setError(""); setMobileResendCooldown(0); }}
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
                      className="text-orange-600 hover:underline font-medium disabled:opacity-50"
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
          <form onSubmit={handleSubmitDetails} className="flex min-h-0 flex-1 flex-col justify-between gap-5">
            <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className={LABEL_COMPACT}>Owner / Contact Name *</label>
                <div className="relative">
                  <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={owner_name}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="Your name"
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
                  placeholder="My Restaurant / Brand"
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
              <div>
                <label className={LABEL_COMPACT}>Business Category</label>
                <select
                  value={business_category}
                  onChange={(e) => setBusinessCategory(e.target.value)}
                  className={FIELD_CLASS_COMPACT}
                >
                  <option value="">Select</option>
                  <option value="RESTAURANT">Restaurant</option>
                  <option value="CLOUD_KITCHEN">Cloud Kitchen</option>
                  <option value="CAFE">Cafe</option>
                  <option value="BAKERY">Bakery</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
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

              <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-1.5 text-slate-700 font-semibold text-sm pt-1 border-t border-slate-100">
                <MapPin className="w-4 h-4 text-orange-500" /> Address
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
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

              <div className="sm:col-span-2 lg:col-span-3">
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-orange-200/80 bg-orange-50/30 px-4 py-3">
                  <div className="flex items-center gap-1.5 text-slate-700 font-medium text-sm shrink-0">
                    <Image className="w-4 h-4 text-orange-500" /> Parent / Store logo
                  </div>
                  <label className="cursor-pointer inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm hover:border-orange-400 hover:text-orange-700 transition-colors">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={handleLogoChange}
                    />
                    {store_logo_preview ? (
                      <img src={store_logo_preview} alt="Logo preview" className="w-9 h-9 object-contain rounded" />
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
                  <span className="text-xs text-slate-500">JPEG, PNG or WebP · Max 5 MB · Optional</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-2">
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
        )}

        <p className={`text-center text-sm text-slate-600 lg:hidden ${step === 3 ? "mt-3" : "mt-6"}`}>
          Have an account?{" "}
          <Link
            href="/auth/login"
            className="font-semibold text-orange-600 hover:text-orange-700 hover:underline"
          >
            Log In
          </Link>
        </p>
        </div>
      </div>
    </LoginPageShell>
  );
}
