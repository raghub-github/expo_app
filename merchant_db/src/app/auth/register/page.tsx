"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Store, Mail, Phone, User, Loader2, ArrowRight, CheckCircle, MapPin, Image } from "lucide-react";
import { requestEmailOTP, verifyEmailOTP, requestPhoneOTP, verifyPhoneOTP } from "@/lib/auth/supabase-client";
import { ENABLE_PHONE_OTP_REGISTER } from "@/lib/auth/phone-otp-config";
import { supabase } from "@/lib/supabase";

type Step = 1 | 2 | 3;

function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
        setError(result.error || "Failed to send OTP to email.");
        return;
      }
      setEmailOtpSent(true);
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
    if (!em || emailOtp.trim().length < 4) {
      setError("Enter the code sent to your email (6–8 digits).");
      return;
    }
    setLoading(true);
    try {
      const result = await verifyEmailOTP(em, emailOtp.trim());
      if (!result.success) {
        setError(result.error || "Invalid or expired code.");
        return;
      }
      const uid = result.data?.session?.user?.id;
      if (!uid) {
        setError("Verification succeeded but session was not created. Please try again.");
        return;
      }
      setEmailUserId(uid);
      setVerifiedEmail(em);
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
    } catch {
      setError("Something went wrong. Please try again.");
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
    if (ten.length !== 10 || mobileOtp.trim().length < 4) {
      setError("Enter the 6-digit OTP sent to your mobile.");
      return;
    }
    setLoading(true);
    try {
      const result = await verifyPhoneOTP(`+91${ten}`, mobileOtp.trim());
      if (!result.success) {
        setError(result.error || "Invalid or expired OTP.");
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
        setError(data.error || "Registration failed.");
        setLoading(false);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md md:max-w-xl bg-white/95 backdrop-blur rounded-2xl shadow-xl border border-slate-200 p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="inline-flex p-3 rounded-full bg-blue-100 mb-4">
            <Store className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Merchant Registration</h1>
          <p className="text-slate-600 text-sm mt-1">
            {ENABLE_PHONE_OTP_REGISTER
              ? "Verify email and mobile with OTP, then add your details"
              : "Verify email with OTP, add your mobile, then your details"}
          </p>
          <div className="flex justify-center gap-2 mt-3">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`w-2 h-2 rounded-full ${step >= s ? "bg-blue-600" : "bg-slate-200"}`}
              />
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
            {error}
          </div>
        )}

        {/* Step 1: Email → OTP */}
        {step === 1 && (
          <div className="space-y-4">
            {!emailOtpSent ? (
              <form onSubmit={handleSendEmailOtp} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email (Gmail or any)</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">We’ll send a verification code (6 or 8 digits) to your email.</p>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Send OTP to email"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyEmailOtp} className="space-y-4">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-700">
                  Code sent to <strong>{email.trim().toLowerCase()}</strong>. Enter the code from your email (6 or 8 digits).
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email verification code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={emailOtp}
                    onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    placeholder="00000000"
                    maxLength={8}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-center text-lg tracking-widest focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setEmailOtpSent(false); setEmailOtp(""); setError(""); }}
                    className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium"
                  >
                    Change email
                  </button>
                  <button
                    type="submit"
                    disabled={loading || emailOtp.length < 4}
                    className="flex-1 py-3 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Verify & continue"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Step 2: Mobile (collect only when OTP disabled; otherwise OTP verify) */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>Email verified: {verifiedEmail}</span>
            </div>
            {!ENABLE_PHONE_OTP_REGISTER ? (
              <form onSubmit={handleMobileContinueWithoutOtp} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Mobile (10 digits)</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="tel"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="9876543210"
                      maxLength={10}
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">We’ll use this to contact you. OTP verification can be enabled later.</p>
                </div>
                <button
                  type="submit"
                  disabled={loading || mobile.replace(/\D/g, "").length !== 10}
                  className="w-full py-3 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                  Continue
                  <ArrowRight className="w-5 h-5 ml-1" />
                </button>
              </form>
            ) : !mobileOtpSent ? (
              <form onSubmit={handleSendMobileOtp} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Mobile (10 digits)</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="tel"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="9876543210"
                      maxLength={10}
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">We’ll send a 6-digit OTP via SMS (MSG91).</p>
                </div>
                <button
                  type="submit"
                  disabled={loading || mobile.replace(/\D/g, "").length !== 10}
                  className="w-full py-3 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Send OTP to mobile"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyMobileOtp} className="space-y-4">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-700">
                  OTP sent to <strong>+91 {mobile.replace(/\D/g, "").slice(-10)}</strong>. Enter the code.
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Mobile OTP</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={mobileOtp}
                    onChange={(e) => setMobileOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    placeholder="000000"
                    maxLength={8}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-center text-lg tracking-widest focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setMobileOtpSent(false); setMobileOtp(""); setError(""); }}
                    className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium"
                  >
                    Change number
                  </button>
                  <button
                    type="submit"
                    disabled={loading || mobileOtp.length < 4}
                    className="flex-1 py-3 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Verify & continue"}
                  </button>
                </div>
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

        {/* Step 3: Full parent details — responsive */}
        {step === 3 && (
          <form onSubmit={handleSubmitDetails} className="space-y-5">
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>{ENABLE_PHONE_OTP_REGISTER ? "Email & mobile verified" : "Email verified, mobile added"}</span>
            </div>

            {/* Basic info — grid on md+ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Owner / Contact Name *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={owner_name}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="Your name"
                    required
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Business / Parent Name *</label>
                <input
                  type="text"
                  value={parent_name}
                  onChange={(e) => setParentName(e.target.value)}
                  placeholder="My Restaurant / Brand"
                  required
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Merchant Type *</label>
                <select
                  value={merchant_type}
                  onChange={(e) => setMerchantType(e.target.value as "LOCAL" | "BRAND" | "CHAIN" | "FRANCHISE")}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="LOCAL">Local</option>
                  <option value="BRAND">Brand</option>
                  <option value="CHAIN">Chain</option>
                  <option value="FRANCHISE">Franchise</option>
                </select>
              </div>
              {(merchant_type === "BRAND" || merchant_type === "CHAIN" || merchant_type === "FRANCHISE") && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Brand Name</label>
                  <input
                    type="text"
                    value={brand_name}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="Brand / chain name"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Business Category</label>
                <select
                  value={business_category}
                  onChange={(e) => setBusinessCategory(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select</option>
                  <option value="RESTAURANT">Restaurant</option>
                  <option value="CLOUD_KITCHEN">Cloud Kitchen</option>
                  <option value="CAFE">Cafe</option>
                  <option value="BAKERY">Bakery</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            </div>

            {/* Contact */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Alternate Phone</label>
                <input
                  type="tel"
                  value={alternate_phone}
                  onChange={(e) => setAlternatePhone(e.target.value.replace(/\D/g, "").slice(0, 15))}
                  placeholder="+91 or 10–15 digits"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Address */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-slate-700 font-medium text-sm">
                <MapPin className="w-4 h-4" /> Address
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Address line</label>
                  <input
                    type="text"
                    value={address_line1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                    placeholder="Street, building, landmark"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="City"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="State"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Pincode</label>
                  <input
                    type="text"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="Pincode"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Store / Parent logo */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-slate-700 font-medium text-sm">
                <Image className="w-4 h-4" /> Parent / Store logo
              </div>
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <label className="cursor-pointer flex-shrink-0 rounded-xl border-2 border-dashed border-slate-300 hover:border-blue-400 bg-slate-50/50 p-4 text-center w-full sm:w-auto min-w-[140px]">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={handleLogoChange}
                  />
                  {store_logo_preview ? (
                    <img src={store_logo_preview} alt="Logo preview" className="w-24 h-24 object-contain mx-auto rounded-lg" />
                  ) : (
                    <span className="text-slate-500 text-sm">Choose image</span>
                  )}
                </label>
                {store_logo_file && (
                  <button
                    type="button"
                    onClick={() => { setStoreLogoFile(null); setStoreLogoPreview(null); }}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Remove logo
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500">JPEG, PNG or WebP. Max 5 MB. Optional.</p>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-4 pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="py-2.5 sm:py-3 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
              >
                ← Back to mobile
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-3 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Complete registration
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-slate-600">
          Already registered?{" "}
          <Link href="/auth/login" className="font-medium text-blue-600 hover:text-blue-700">
            Login
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-slate-500">
          <Link href="/auth" className="text-blue-600 hover:underline">Back to home</Link>
        </p>
      </div>
    </div>
  );
}
