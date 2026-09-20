"use client";

import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import NeedHelpBadge from "@/components/NeedHelpBadge";
import { GlobalToaster } from "@/components/GlobalToaster";

/** Routes where Help button should be shown (after user is in a logged-in flow). */
function showHelpOnRoute(pathname: string): boolean {
  const p = (pathname ?? "").replace(/\/$/, "") || "/";
  if (p === "/auth" || p === "/auth/login") return false;
  if (p.startsWith("/auth/register") && !p.includes("register-store")) return false;
  if (p.includes("register-store")) return false;
  if (p.startsWith("/auth/search")) return false;
  if (p.startsWith("/auth/resubmit-onboarding")) return false;
  if (p.startsWith("/auth/register-phone")) return false;
  if (p.startsWith("/auth/register-business")) return false;
  if (p.startsWith("/auth/register-parent")) return false;
  return true;
}

/**
 * Auth layout — reuses Lora/Poppins from root layout (`--font-site-*`).
 * Do NOT call next/font/google here: a second Google Fonts fetch during
 * `/auth` compile under load has caused `JSON.parse` empty-body 500s.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showHelp = showHelpOnRoute(pathname ?? "");
  const isRegister = (pathname ?? "").includes("/auth/register");
  const isResubmit = (pathname ?? "").includes("/auth/resubmit-onboarding");
  const useLoraPage = isRegister || isResubmit;

  const fontVars = {
    ["--font-auth-lora"]: "var(--font-site-lora)",
    ["--font-auth-poppins"]: "var(--font-site-poppins)",
  } as CSSProperties;

  return (
    <div className={useLoraPage ? "auth-register-page" : ""} style={fontVars}>
      {children}
      <GlobalToaster />
      {showHelp && (
        <div className="fixed top-4 right-4 z-40">
          <NeedHelpBadge inline variant="pill" />
        </div>
      )}
    </div>
  );
}
