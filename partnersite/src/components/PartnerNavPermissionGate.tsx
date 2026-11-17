"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMerchantSession } from "@/context/MerchantSessionContext";
import {
  PARTNER_NAV_PERMISSION,
  partnerSessionHasPermission,
} from "@/lib/auth/merchant-staff-permissions";

/**
 * Deep-link guard: sidebar already hides forbidden items; this redirects if a
 * MANAGER/STAFF user opens a URL they are not allowed to see (same matrix as merchant app).
 */
export function PartnerNavPermissionGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const session = useMerchantSession();

  const requiredPermission = useMemo(() => {
    // /mx/* and /partners/* share the same console — normalize for the matrix.
    const raw = pathname.replace(/\/$/, "") || "/";
    const p = raw.startsWith("/mx/")
      ? `/partners/${raw.slice(4)}`
      : raw === "/mx"
        ? "/partners/dashboard"
        : raw;
    const exact = PARTNER_NAV_PERMISSION[p];
    if (exact) return exact;
    const match = Object.keys(PARTNER_NAV_PERMISSION)
      .filter((href) => p === href || p.startsWith(`${href}/`))
      .sort((a, b) => b.length - a.length)[0];
    return match ? PARTNER_NAV_PERMISSION[match] : null;
  }, [pathname]);

  const allowed =
    !requiredPermission ||
    !session ||
    session.isLoading ||
    !session.isAuthenticated ||
    partnerSessionHasPermission(session.parent, requiredPermission);

  useEffect(() => {
    if (!session || session.isLoading || !session.isAuthenticated) return;
    if (!requiredPermission) return;
    if (partnerSessionHasPermission(session.parent, requiredPermission)) return;
    const home =
      pathname.startsWith("/mx") ? "/mx/dashboard" : "/partners/dashboard";
    // Hard nav avoids "Router action dispatched before initialization" on cold load/HMR.
    if (typeof window !== "undefined") {
      window.location.replace(home);
      return;
    }
    router.replace(home);
  }, [
    pathname,
    requiredPermission,
    router,
    session,
    session?.isAuthenticated,
    session?.isLoading,
    session?.parent,
  ]);

  if (!allowed && requiredPermission) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-8 text-sm text-slate-500">
        Redirecting to an allowed page…
      </div>
    );
  }

  return <>{children}</>;
}
