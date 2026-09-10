"use client";

import dynamic from "next/dynamic";

/**
 * Load onboarding UI in a separate chunk to avoid Turbopack
 * "module factory is not available" on refresh (Next.js 16 + Turbopack).
 */
const RiderOnboardingClient = dynamic(
  () => import("./RiderOnboardingClient"),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[70vh] items-center justify-center bg-[#E8F5EC] p-6">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#0A2342]/20 border-t-[#0A2342]" />
          <p className="text-sm font-medium text-[#0A2342]">Loading rider onboarding…</p>
        </div>
      </div>
    ),
  }
);

export default function RiderOnboardingPage() {
  return <RiderOnboardingClient />;
}
