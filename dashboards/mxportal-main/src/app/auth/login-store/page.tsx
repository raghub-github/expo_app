"use client";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { LoginModal, StoreSelectionList } from "@/components";
import { signIn } from "next-auth/react";

export default function LoginStorePage() {
  const [loginModalOpen, setLoginModalOpen] = useState(true);
  const [storeList, setStoreList] = useState([]);
  const [showStoreSelect, setShowStoreSelect] = useState(false);
  const router = useRouter();

  // Handler for Phone+OTP login (after OTP verification)
  const handlePhoneLogin = async (phone: string) => {
    // Always send only the last 10 digits (no +91, 91, or 0)
    const digits = phone.replace(/\D/g, "");
    const tenDigitPhone = digits.length > 10 ? digits.slice(-10) : digits;
    const res = await fetch("/api/auth/resolve-parent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: tenDigitPhone }),
    });
    const data = await res.json();
    console.log('DEBUG /api/auth/resolve-parent response:', data); // Debug log
    if (!data.parentExists) {
      router.push("/auth/register-phone?phone=" + encodeURIComponent(tenDigitPhone));
      setLoginModalOpen(false);
      return;
    }
    // If onboardingProgress exists, resume onboarding for this parent
    if (data.onboardingProgress && !data.onboardingProgress.store_id) {
      // Not yet completed, resume onboarding
      router.push(`/auth/register-store?parent_id=${data.onboardingProgress.parent_id}`);
      setLoginModalOpen(false);
      return;
    }
    if (data.stores && data.stores.length === 1) {
      console.log('DEBUG: Single child store found, redirecting to dashboard:', data.stores[0]);
      localStorage.setItem('selectedStoreId', data.stores[0].store_id);
      setLoginModalOpen(false);
      setTimeout(() => router.push('/mx/dashboard'), 100);
      return;
    }
    if (data.stores && data.stores.length > 1) {
      setLoginModalOpen(false);
      // Store the list in localStorage for retrieval on /auth/login-store/list
      localStorage.setItem('storeList', JSON.stringify(data.stores));
      router.push('/auth/login-store/list');
      return;
    }
  };

  // Handler for Google login (Agent flow)
  const handleGoogleLogin = () => {
    signIn("google", { callbackUrl: "/auth/search" });
    setLoginModalOpen(false);
  };

  // Handle store selection
  const handleSelectStore = (storeId: string) => {
    localStorage.setItem('selectedStoreId', storeId);
    router.push('/mx/dashboard');
    setShowStoreSelect(false);
  };

  // SSR-safe portal rendering
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <>
      {/* Blurred overlay and modal rendered above current page */}
      {loginModalOpen && mounted && typeof window !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-md" />
          <div className="relative z-10">
            <LoginModal
              open={true}
              onClose={() => router.back()}
              onPhoneLogin={handlePhoneLogin}
              onGoogleLogin={handleGoogleLogin}
            />
          </div>
        </div>,
        document.body
      )}
      {/* Store selection list is now rendered only on /auth/login-store/list route */}
    </>
  );
}
