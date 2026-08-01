"use client";

import { useMemo } from "react";
import { useAppPathname } from "@/hooks/useAppSearchParams";
import AuthenticatedShell from "@/providers/AuthenticatedShell";
import DashboardLayoutClient from "@/app/dashboard/DashboardLayoutClient";

/**
 * Persistent control-app shell for dashboard routes only.
 *
 * `/order/*` is a standalone page (own AuthenticatedShell + OrderHeader) —
 * it must NOT inherit the dashboard left sidebar / "Order Details" header.
 */
export function isControlAppShellPath(pathname: string): boolean {
  const clean = pathname.split("?")[0].split("#")[0] || "";
  if (clean === "/dashboard" || clean.startsWith("/dashboard/")) return true;
  return false;
}

export default function ControlAppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = useAppPathname();
  const useShell = useMemo(() => isControlAppShellPath(pathname), [pathname]);

  if (!useShell) {
    return <>{children}</>;
  }

  return (
    <AuthenticatedShell>
      <DashboardLayoutClient>{children}</DashboardLayoutClient>
    </AuthenticatedShell>
  );
}
