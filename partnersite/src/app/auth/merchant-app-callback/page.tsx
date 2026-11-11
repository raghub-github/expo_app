"use client";

import { useEffect } from "react";

/**
 * Stable Supabase OAuth redirect for the merchant Expo app.
 * WebBrowser.openAuthSessionAsync captures this URL (with ?code= or #access_token=)
 * and returns control to the app — so Google sign-in never falls back to Site URL
 * (gatimitra.com). This page is a brief landing if the browser stays open.
 */
export default function MerchantAppOAuthCallbackPage() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = window.location.search || "";
    const h = window.location.hash || "";
    const deep = `gatimitra-merchant://auth/callback${q}${h}`;
    try {
      window.location.replace(deep);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 bg-[#F8FAFC]">
      <p className="text-base font-semibold text-slate-800">Returning to GatiMitra Partner…</p>
      <p className="text-sm text-slate-500 text-center max-w-sm">
        You can close this tab and continue in the merchant app.
      </p>
      <a
        href="gatimitra-merchant://auth/callback"
        className="mt-2 text-sm font-semibold text-teal-700 underline underline-offset-2"
      >
        Open merchant app
      </a>
    </main>
  );
}
