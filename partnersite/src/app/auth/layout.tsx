"use client";

import { usePathname } from "next/navigation";
import { Lora, Poppins } from "next/font/google";
import NeedHelpBadge from "@/components/NeedHelpBadge";
import { GlobalToaster } from "@/components/GlobalToaster";

const authLora = Lora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-auth-lora",
  display: "swap",
});

const authPoppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-auth-poppins",
  display: "swap",
});

/** Routes where Help button should be shown (after user is in a logged-in flow). */
function showHelpOnRoute(pathname: string): boolean {
  const p = (pathname ?? "").replace(/\/$/, "") || "/";
  if (p === "/auth") return false;
  if (p.startsWith("/auth/login")) return false;
  if (p.startsWith("/auth/register") && !p.includes("register-store")) return false;
  if (p.includes("register-store")) return false;
  if (p.startsWith("/auth/search")) return false;
  if (p.startsWith("/auth/callback")) return false;
  if (p.startsWith("/auth/register-phone")) return false;
  if (p.startsWith("/auth/register-business")) return false;
  if (p.startsWith("/auth/register-parent")) return false;
  return true;
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showHelp = showHelpOnRoute(pathname ?? "");
  const isRegister = (pathname ?? "").includes("/auth/register");

  return (
    <div
      className={`${authLora.variable} ${authPoppins.variable} ${
        isRegister ? "auth-register-page" : ""
      }`}
    >
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
