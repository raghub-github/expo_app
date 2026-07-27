"use client";

import { useEffect } from "react";

const RIDER_APP_DEEP_LINK = "gatimitra-rider://digilocker-return";

/**
 * Dedicated rider DigiLocker return — closes Custom Tab back onto the Aadhaar screen.
 */
export default function RiderDigilockerReturnPage() {
  useEffect(() => {
    const payload = { type: "gatimitra-rider-digilocker-return" as const };
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, "*");
      }
    } catch {
      /* ignore */
    }
    try {
      window.location.replace(RIDER_APP_DEEP_LINK);
    } catch {
      /* ignore */
    }
    const t = window.setTimeout(() => {
      try {
        window.close();
      } catch {
        /* ignore */
      }
    }, 1200);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-emerald-50 px-4">
      <div className="max-w-sm w-full rounded-2xl border border-emerald-200 bg-white p-6 text-center shadow-sm">
        <p className="text-base font-semibold text-slate-900">Returning to Aadhaar verification</p>
        <p className="mt-2 text-sm text-slate-600">
          DigiLocker complete. You will stay on the Rider Aadhaar screen.
        </p>
        <a
          href={RIDER_APP_DEEP_LINK}
          className="mt-5 inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white"
        >
          Back to Rider app
        </a>
      </div>
    </main>
  );
}
