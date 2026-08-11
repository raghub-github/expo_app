"use client";

import { useMemo } from "react";
import { useAppPathname } from "@/hooks/useAppSearchParams";
import AuthenticatedShell from "@/providers/AuthenticatedShell";
import DashboardLayoutClient from "@/app/dashboard/DashboardLayoutClient";

/**
 * Persistent control-app shell.
 *
 * Auth/bootstrap stays mounted across `/dashboard/*` and `/order/*` so navigating
 * between them does not remount AuthProvider / re-run bootstrap gates.
 *
 * Dashboard chrome (sidebar/header) applies only to `/dashboard/*`.
 * `/order/*` keeps its standalone OrderHeader layout without the left rail.
 */
export function isControlAppShellPath(pathname: string): boolean {
  const clean = pathname.split("?")[0].split("#")[0] || "";
  if (clean === "/dashboard" || clean.startsWith("/dashboard/")) return true;
  return false;
}

export function isAuthenticatedShellPath(pathname: string): boolean {
  const clean = pathname.split("?")[0].split("#")[0] || "";
  if (clean === "/dashboard" || clean.startsWith("/dashboard/")) return true;
  if (clean === "/order" || clean.startsWith("/order/")) return true;
  return false;
}

export default function ControlAppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = useAppPathname();
  const needsAuth = useMemo(() => isAuthenticatedShellPath(pathname), [pathname]);
  const useDashboardChrome = useMemo(() => isControlAppShellPath(pathname), [pathname]);

  if (!needsAuth) {
    return <>{children}</>;
  }

  return (
    <AuthenticatedShell>
      {useDashboardChrome ? (
        <DashboardLayoutClient>{children}</DashboardLayoutClient>
      ) : (
        children
      )}
    </AuthenticatedShell>
  );
}
