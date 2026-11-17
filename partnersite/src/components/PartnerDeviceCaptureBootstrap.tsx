"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useMerchantSession } from "@/context/MerchantSessionContext";
import { readPartnerSelectedStoreId } from "@/lib/partner-selected-store";
import { partnerSessionHasPermission } from "@/lib/auth/merchant-staff-permissions";

function isPartnerPath(pathname: string): boolean {
  const p = (pathname ?? "").replace(/\/$/, "") || "/";
  return p === "/partners" || p.startsWith("/partners/") || p === "/mx" || p.startsWith("/mx/");
}

/**
 * Keeps this browser row alive in `user_device_sessions` (same table as merchant app).
 * Uses staff/devices GET sync when the signed-in role can manage users.
 */
export function PartnerDeviceCaptureBootstrap() {
  const pathname = usePathname() ?? "";
  const session = useMerchantSession();
  const lastSyncRef = useRef(0);

  useEffect(() => {
    if (!isPartnerPath(pathname)) return;
    if (!session || session.isLoading || !session.isAuthenticated) return;
    if (!partnerSessionHasPermission(session.parent, "users")) return;

    const storeId = readPartnerSelectedStoreId();
    if (!storeId) return;

    const now = Date.now();
    if (now - lastSyncRef.current < 60_000) return;
    lastSyncRef.current = now;

    void fetch(`/api/merchant/staff/devices?storeId=${encodeURIComponent(storeId)}`, {
      credentials: "include",
      cache: "no-store",
    }).catch(() => {
      /* best-effort dual-write */
    });
  }, [
    pathname,
    session,
    session?.isAuthenticated,
    session?.isLoading,
    session?.parent?.accessRole,
    session?.parent?.id,
  ]);

  return null;
}
