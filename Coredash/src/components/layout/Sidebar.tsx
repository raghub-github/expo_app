"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { poppinsUi } from "@/lib/fonts";
import { NAV } from "@/lib/nav";
import { wipeCoredashBrowserAuth } from "@/lib/auth/browser-wipe";
import { logAuthEvent } from "@/lib/auth/log";

export function Sidebar({
  userName,
  userEmail,
  userId,
}: {
  userName: string;
  userEmail: string;
  userId: string;
}) {
  const pathname = usePathname();
  const [confirmOut, setConfirmOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function logout() {
    setSigningOut(true);
    try {
      logAuthEvent("LOGOUT", { userId, email: userEmail, reason: "sidebar" });
      await wipeCoredashBrowserAuth(userId);
      window.location.replace("/login");
    } finally {
      setSigningOut(false);
      setConfirmOut(false);
    }
  }

  return (
    <>
      <aside
        className={`${poppinsUi.className} fixed inset-y-0 left-0 z-40 flex h-dvh w-[232px] flex-col overflow-hidden text-white`}
        style={{ background: "linear-gradient(180deg, #4B49AC 0%, #3A3894 58%, #2C2A78 100%)" }}
      >
        <div className="flex h-[72px] min-h-[72px] shrink-0 items-center gap-3 border-b border-white/10 px-3">
          <Image
            src="/onlylogo.png"
            alt="GatiMitra"
            width={36}
            height={36}
            className="h-9 w-9 rounded-full object-contain"
            unoptimized
            priority
          />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold leading-tight tracking-wide">GatiMitra</p>
            <p className="mt-0.5 truncate text-[10px] font-medium uppercase leading-tight tracking-[0.06em] text-white/65">
              Business analytics
            </p>
          </div>
        </div>

        <nav className="cd-scroll min-h-0 flex-1 overflow-y-auto px-2 py-3">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative flex h-11 w-full items-center rounded-xl outline-none transition ${
                  active
                    ? "bg-white text-[#4B49AC] shadow-[0_8px_20px_rgba(0,0,0,0.12)]"
                    : "text-white/90 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="flex size-10 shrink-0 items-center justify-center">
                  <Icon className="h-5 w-5" strokeWidth={1.6} />
                </span>
                <span className="min-w-0 flex-1 truncate pr-2 text-[14px] font-medium tracking-wide whitespace-nowrap">
                  {item.name}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto shrink-0 border-t border-white/10 p-3">
          <div className="mb-2 rounded-xl bg-white/10 px-2.5 py-2">
            <p className="truncate text-sm font-semibold tracking-wide text-white">{userName}</p>
            <p className="truncate text-[10px] font-medium tracking-wide text-white/60">{userEmail}</p>
          </div>
          <button
            type="button"
            onClick={() => setConfirmOut(true)}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-[10px] border border-white/10 bg-transparent text-[13px] font-medium tracking-wide text-white hover:bg-white/10"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.75} />
            Sign out
          </button>
        </div>
      </aside>

      {confirmOut ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="signout-title"
          onClick={() => !signingOut && setConfirmOut(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[#E4E7F7] bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="signout-title" className="text-center text-lg font-semibold text-[#1E1C4A]">
              Sign out?
            </h3>
            <p className="mt-2 text-center text-sm text-[#6B6894]">
              You will need to sign in again to open business analytics.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                disabled={signingOut}
                onClick={() => setConfirmOut(false)}
                className="flex-1 rounded-xl bg-[#F4F6FF] px-4 py-2.5 text-sm font-medium text-[#1E1C4A] hover:bg-[#EEF0FF]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={signingOut}
                onClick={() => void logout()}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#E11D48] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#BE123C] disabled:opacity-60"
              >
                <LogOut className="h-4 w-4" />
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
