"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";

const rsbNavIdle = "text-[#121212]/75 hover:bg-white/80 hover:text-[#121212]";
const rsbNavActive = "bg-white text-[#121212] shadow-sm";

export function OnboardingFailedSummarySidebar({
  collapsed = false,
}: {
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const active = pathname.startsWith("/dashboard/area-managers/stores/onboarding-failed");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/area-manager/onboarding-failed?countOnly=1", { credentials: "include" })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled || !body?.success) return;
        const n = Number(body.count ?? 0);
        setCount(Number.isFinite(n) ? n : 0);
      })
      .catch(() => {
        if (!cancelled) setCount(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const href = "/dashboard/area-managers/stores/onboarding-failed";

  if (collapsed) {
    return (
      <Link
        href={href}
        title={count > 0 ? `Onboarding failed (${count})` : "Onboarding failed"}
        className={`group relative flex w-full cursor-pointer items-center justify-center rounded-[10px] px-2 py-2.5 transition-colors duration-200 ${
          active ? rsbNavActive : rsbNavIdle
        }`}
      >
        <AlertTriangle className="h-5 w-5 flex-shrink-0" />
        {loading ? (
          <Loader2 className="absolute h-3.5 w-3.5 animate-spin text-[#121212]/40" />
        ) : count > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-0.5 text-[9px] font-bold text-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
        <div className="pointer-events-none absolute right-full z-50 mr-2 whitespace-nowrap rounded-[10px] bg-[#121212] px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
          Onboarding failed
          {count > 0 ? (
            <div className="mt-0.5 text-[10px] font-normal text-white/70">{count} store(s) need fixes</div>
          ) : null}
          <div className="absolute right-0 top-1/2 translate-x-1 -translate-y-1/2 border-4 border-transparent border-l-[#121212]" />
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`group relative grid w-full min-w-0 cursor-pointer grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-2 rounded-[10px] px-2 py-2 text-xs font-medium transition-colors duration-200 ${
        active ? rsbNavActive : rsbNavIdle
      }`}
    >
      <span className="flex size-5 items-center justify-center justify-self-start text-current">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      </span>
      <span className="min-w-0 truncate text-left text-xs font-medium">Onboarding failed</span>
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 justify-self-end animate-spin text-[#121212]/40" aria-hidden />
      ) : count > 0 ? (
        <span className="shrink-0 justify-self-end rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800">
          {count}
        </span>
      ) : null}
    </Link>
  );
}
