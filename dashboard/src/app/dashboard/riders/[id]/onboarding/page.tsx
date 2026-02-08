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
      <div className="flex items-center justify-center min-h-[60vh] p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="text-sm text-gray-600">Loading rider onboarding...</p>
        </div>
      </div>
    ),
  }
);

export default function RiderOnboardingPage() {
  return <RiderOnboardingClient />;
}
