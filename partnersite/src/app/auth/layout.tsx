"use client";

import { usePathname } from "next/navigation";
import MerchantHelpTicket from "@/components/MerchantHelpTicket";

function getPageContext(pathname: string): string {
  if (pathname.includes("register-store")) return "store-onboarding";
  if (pathname.includes("post-login")) return "post-login";
  if (pathname.includes("register")) return "register";
  if (pathname.includes("login")) return "login";
  return "auth";
}

/** Routes where Help button should be shown (after user is in a logged-in flow). */
function showHelpOnRoute(pathname: string): boolean {
  const p = (pathname ?? "").replace(/\/$/, "") || "/";
  if (p === "/auth") return false;
  if (p.startsWith("/auth/login")) return false;
  if (p.startsWith("/auth/register") && !p.includes("register-store")) return false;
  if (p.includes("register-store")) return false; // register-store has Help in sidebar only; same form opens there
  if (p.startsWith("/auth/search")) return false;
  if (p.startsWith("/auth/callback")) return false;
  if (p.startsWith("/auth/register-phone")) return false;
  if (p.startsWith("/auth/register-business")) return false;
  if (p.startsWith("/auth/register-parent")) return false;
  return true;
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const pageContext = getPageContext(pathname ?? "");
  const showHelp = showHelpOnRoute(pathname ?? "");

  return (
    <>
      {children}
      {showHelp && (
        <div className="fixed top-4 right-4 z-40">
          <MerchantHelpTicket pageContext={pageContext} />
        </div>
      )}
    </>
  );
}
