"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getOrCreateDeviceId } from "@/lib/auth/device-id-client";
import { Loader2 } from "lucide-react";

function AppHandoffContent() {
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const token = searchParams?.get("t")?.trim() || "";
    if (!token) {
      setError("Missing handoff token. Please go back to the merchant app and try again.");
      return;
    }

    void (async () => {
      try {
        const redeemRes = await fetch("/api/merchant-auth/app-handoff", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handoffToken: token }),
        });
        const redeemJson = (await redeemRes.json().catch(() => ({}))) as {
          success?: boolean;
          access_token?: string;
          refresh_token?: string;
          next?: string;
          error?: string;
        };
        if (!redeemRes.ok || !redeemJson.access_token || !redeemJson.refresh_token) {
          throw new Error(redeemJson.error || "Handoff expired. Please try again from the app.");
        }

        const device_id = getOrCreateDeviceId();
        const cookieRes = await fetch("/api/merchant-auth/set-cookie", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: redeemJson.access_token,
            refresh_token: redeemJson.refresh_token,
            device_id,
          }),
        });
        if (!cookieRes.ok) {
          const cookieJson = (await cookieRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(cookieJson.error || "Could not start partner session.");
        }

        const next = redeemJson.next?.startsWith("/") ? redeemJson.next : "/partners/all-stores";
        window.location.replace(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not open partner portal.");
      }
    })();
  }, [searchParams]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 bg-[#F4F7F8]">
        <p className="text-center text-slate-700 max-w-md text-sm leading-relaxed">{error}</p>
        <a
          href="/auth/login"
          className="text-sm font-semibold text-teal-700 underline underline-offset-2"
        >
          Sign in on partner portal
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[#F4F7F8]">
      <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      <p className="text-sm text-slate-600">Opening partner portal…</p>
    </div>
  );
}

export default function AppHandoffPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F4F7F8]">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
        </div>
      }
    >
      <AppHandoffContent />
    </Suspense>
  );
}
