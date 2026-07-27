"use client";

import { useEffect, useState } from "react";

/**
 * DigiLocker redirect landing for AM dashboard onboarding.
 * Notifies the opener tab and, when opened in the same tab, returns to the
 * page that started verification via ?return=.
 */
export default function DigilockerReturnPage() {
  const [returnHref, setReturnHref] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returnToRaw = params.get("return") || "";
    let returnTo: string | null = null;
    if (returnToRaw) {
      try {
        const u = new URL(returnToRaw);
        if (u.origin === window.location.origin) returnTo = u.toString();
      } catch {
        /* ignore */
      }
    }
    setReturnHref(returnTo);

    const payload = { type: "gatimitra-digilocker-return" as const };
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, "*");
        try {
          window.opener.focus();
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(payload, "*");
      }
    } catch {
      /* ignore */
    }

    if (returnTo) {
      window.setTimeout(() => {
        try {
          window.location.replace(returnTo);
        } catch {
          /* ignore */
        }
      }, 250);
    }

    const t = window.setTimeout(() => {
      try {
        window.close();
      } catch {
        /* ignore */
      }
    }, returnTo ? 1500 : 800);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-sm w-full rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-base font-semibold text-slate-900">DigiLocker step complete</p>
        <p className="mt-2 text-sm text-slate-600">
          {returnHref
            ? "Taking you back to store onboarding…"
            : "You can close this window and return to store onboarding. Verification will update automatically."}
        </p>
        {returnHref ? (
          <a
            href={returnHref}
            className="mt-5 inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Back to onboarding
          </a>
        ) : null}
      </div>
    </main>
  );
}
