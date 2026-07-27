"use client";

import { useEffect, useState } from "react";

/**
 * DigiLocker redirect landing — Cashfree requires https redirect_url.
 *
 * Surfaces:
 * - Partner onboarding popup: postMessage + close → stays on register-store docs
 * - Rider app (?app=rider): deep-link closes Custom Tab; stays on Aadhaar screen
 * - Same-tab fallback (?return=): navigate back to the page that started verify
 */
export default function DigilockerReturnPage() {
  const [copy, setCopy] = useState<{
    title: string;
    body: string;
    href?: string;
    linkLabel?: string;
  }>({
    title: "DigiLocker step complete",
    body: "You can close this window and return to where you left off. Verification will update automatically.",
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const forRider = params.get("app") === "rider";
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

    const riderDeepLink = "gatimitra-rider://digilocker-return";
    const payload = {
      type: forRider
        ? ("gatimitra-rider-digilocker-return" as const)
        : ("gatimitra-digilocker-return" as const),
    };

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

    if (forRider) {
      setCopy({
        title: "Returning to GatiMitra Rider",
        body: "DigiLocker step complete. If the app does not open, tap below — you will stay on Aadhaar verification.",
        href: riderDeepLink,
        linkLabel: "Back to Rider app",
      });
      try {
        window.location.replace(riderDeepLink);
      } catch {
        /* ignore */
      }
    } else if (returnTo) {
      setCopy({
        title: "Returning to onboarding",
        body: "DigiLocker step complete. Taking you back to the document page…",
        href: returnTo,
        linkLabel: "Continue onboarding",
      });
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
    }, forRider || returnTo ? 1500 : 800);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-emerald-50 px-4">
      <div className="max-w-sm w-full rounded-2xl border border-emerald-200 bg-white p-6 text-center shadow-sm">
        <p className="text-base font-semibold text-slate-900">{copy.title}</p>
        <p className="mt-2 text-sm text-slate-600">{copy.body}</p>
        {copy.href ? (
          <a
            href={copy.href}
            className="mt-5 inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white"
          >
            {copy.linkLabel || "Continue"}
          </a>
        ) : null}
      </div>
    </main>
  );
}
