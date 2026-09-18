"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { poppinsUi } from "@/lib/fonts";
import { NAV } from "@/lib/nav";
import { wipeCoredashBrowserAuth } from "@/lib/auth/browser-wipe";
import { logAuthEvent } from "@/lib/auth/log";
import { useShellChrome } from "@/components/layout/ShellChrome";

/** Collapse icon: three bars with left arrow on the middle bar (ref image). */
function SidebarToggleIcon({ expand }: { expand?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-5 w-5 ${expand ? "scale-x-[-1]" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 6h10" />
      <path d="M4 12h14" />
      <path d="M4 12l3-2.5" />
      <path d="M4 12l3 2.5" />
      <path d="M8 18h10" />
    </svg>
  );
}

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
  const { collapsed, toggleCollapsed, sidebarWidth } = useShellChrome();
  const [confirmOut, setConfirmOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setUserMenu(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function logout() {
    setSigningOut(true);
    try {
      logAuthEvent("LOGOUT", { userId, email: userEmail, reason: "sidebar" });
      await wipeCoredashBrowserAuth(userId);
      window.location.replace("/login");
    } finally {
      setSigningOut(false);
      setConfirmOut(false);
      setUserMenu(false);
    }
  }

  return (
    <>
      <aside
        className={`${poppinsUi.className} fixed inset-y-0 left-0 z-40 flex h-dvh flex-col overflow-hidden text-white transition-[width] duration-200 ease-out`}
        style={{
          width: sidebarWidth,
          background: "linear-gradient(180deg, #4B49AC 0%, #3A3894 58%, #2C2A78 100%)",
        }}
      >
        <div
          className={`flex h-[72px] min-h-[72px] shrink-0 items-center border-b border-white/10 ${
            collapsed ? "justify-center px-2" : "gap-3 px-3"
          }`}
        >
          <Image
            src="/onlylogo.png"
            alt="GatiMitra"
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-full object-contain"
            unoptimized
            priority
          />
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold leading-tight tracking-wide">GatiMitra</p>
              <p className="mt-0.5 truncate text-[10px] font-medium uppercase leading-tight tracking-[0.06em] text-white/65">
                Business analytics
              </p>
            </div>
          ) : null}
        </div>

        <nav className="cd-scroll min-h-0 flex-1 overflow-y-auto px-2 py-3">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.name}
                className={`group relative mb-0.5 flex h-11 w-full items-center rounded-xl outline-none transition ${
                  collapsed ? "justify-center px-0" : ""
                } ${
                  active
                    ? "bg-white text-[#4B49AC] shadow-[0_8px_20px_rgba(0,0,0,0.12)]"
                    : "text-white/90 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="flex size-10 shrink-0 items-center justify-center">
                  <Icon className="h-5 w-5" strokeWidth={1.6} />
                </span>
                {!collapsed ? (
                  <span className="min-w-0 flex-1 truncate pr-2 text-[14px] font-medium tracking-wide whitespace-nowrap">
                    {item.name}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className={`relative mt-auto shrink-0 border-t border-white/10 ${collapsed ? "p-2" : "p-3"}`} ref={menuRef}>
          <div
            className={`flex items-center gap-1 rounded-xl bg-white/10 ${collapsed ? "flex-col p-1" : "px-1.5 py-1.5"}`}
          >
            <button
              type="button"
              onClick={() => setUserMenu((v) => !v)}
              title={`${userName} · click for sign out`}
              className={`min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left hover:bg-white/10 ${
                collapsed ? "flex w-full justify-center px-0" : ""
              }`}
            >
              {collapsed ? (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-[11px] font-semibold">
                  {userName
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0]?.toUpperCase() || "")
                    .join("") || "U"}
                </span>
              ) : (
                <>
                  <p className="truncate text-sm font-semibold tracking-wide text-white">{userName}</p>
                  <p className="truncate text-[10px] font-medium tracking-wide text-white/60">{userEmail}</p>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={toggleCollapsed}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/85 hover:bg-white/10 hover:text-white"
            >
              <SidebarToggleIcon expand={collapsed} />
            </button>
          </div>

          {userMenu ? (
            <div
              className={`absolute z-50 rounded-xl border border-white/15 bg-[#2C2A78] p-1 shadow-xl ${
                collapsed ? "bottom-14 left-1/2 w-40 -translate-x-1/2" : "bottom-[calc(100%+8px)] left-3 right-3"
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  setUserMenu(false);
                  setConfirmOut(true);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium text-white hover:bg-white/10"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          ) : null}
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
