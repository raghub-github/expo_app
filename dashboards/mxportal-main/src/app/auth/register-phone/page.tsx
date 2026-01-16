"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPhone() {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [dummyOtp, setDummyOtp] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const validatePhone = (num: string) => {
    // Only 10 digits, no +91, no 91, no leading 0
    return /^\d{10}$/.test(num);
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!validatePhone(phone)) {
      setError("Please enter a 10-digit phone number only. Do not include +91, 91, or 0.");
      return;
    }
    const res = await fetch("/api/parent-merchant/phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json();
    if (data.status === "otp") {
      setDummyOtp(data.otp);
      setStep("otp");
    } else {
      setError(data.error || "Unknown error");
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    // For demo, accept any OTP, let backend decide
    const res = await fetch("/api/parent-merchant/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, otp }),
    });
    const data = await res.json();
    if (data.success) {
      if (data.exists) {
        router.push(`/auth/register-store?parent_id=${data.parent_merchant_id}`);
      } else {
        router.push(`/auth/register-parent?phone=${phone}`);
      }
    } else {
      setError(data.error || "Unknown error");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      <div className="w-full max-w-md p-8 rounded-3xl shadow-2xl bg-white/90 border border-blue-100 backdrop-blur-lg">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-4 rounded-full shadow-lg mb-4">
            <svg xmlns='http://www.w3.org/2000/svg' className='h-10 w-10 text-white' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M16 7a4 4 0 01-8 0M12 3v4m0 0a4 4 0 01-4 4m4-4a4 4 0 014 4m-4 4v4m0 0a4 4 0 01-4 4m4-4a4 4 0 014 4' /></svg>
          </div>
          <h2 className="text-3xl font-extrabold text-gray-800 mb-2 tracking-tight drop-shadow">Register with Phone</h2>
          <p className="text-gray-500 text-center text-sm">Start your journey with GatiMitra by verifying your phone number</p>
        </div>
        {step === "phone" && (
          <form onSubmit={handlePhoneSubmit} className="space-y-6">
            <div>
              <label className="block text-gray-700 font-medium mb-1">Phone Number</label>
              <input
                type="tel"
                name="phone"
                placeholder="Enter phone number"
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/[^\d]/g, ""))}
                required
                className="w-full border border-blue-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 rounded-lg px-4 py-3 text-lg bg-white shadow-sm transition-all"
              />
              <div className="text-gray-500 text-xs mt-1">Please enter a 10-digit phone number only. Do not include +91, 91, or 0.</div>
            </div>
            {error && <div className="text-red-600 text-sm font-medium text-center">{error}</div>}
            <button type="submit" className="w-full py-3 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 font-semibold text-white text-lg shadow-md transition-all">Send OTP</button>
          </form>
        )}
        {step === "otp" && (
          <form onSubmit={handleOtpSubmit} className="space-y-6">
            <div className="flex flex-col items-center mb-2">
              <span className="text-gray-500 text-sm mb-1">Dummy OTP (for demo):</span>
              <span className="font-mono text-2xl text-blue-700 bg-blue-50 px-4 py-1 rounded-lg tracking-widest shadow">{dummyOtp}</span>
            </div>
            <div>
              <label className="block text-gray-700 font-medium mb-1">Enter OTP</label>
              <input
                type="text"
                name="otp"
                placeholder="Enter OTP"
                value={otp}
                onChange={e => setOtp(e.target.value)}
                required
                className="w-full border border-blue-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 rounded-lg px-4 py-3 text-lg bg-white shadow-sm transition-all"
              />
            </div>
            {error && <div className="text-red-600 text-sm font-medium text-center">{error}</div>}
            <button type="submit" className="w-full py-3 rounded-lg bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 font-semibold text-white text-lg shadow-md transition-all">Verify</button>
          </form>
        )}
      </div>
    </div>
  );
}
