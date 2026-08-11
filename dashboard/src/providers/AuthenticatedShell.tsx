"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AuthProvider } from "@/providers/AuthProvider";
import { useBootstrapGate } from "@/hooks/useBootstrapGate";
import { FoodOrdersListQueryGate } from "@/components/query/FoodOrdersListQueryGate";
import { installDashboardAuthFetchGuard } from "@/lib/auth/redirect-to-login";

/**
 * Shared auth shell for dashboard + standalone order routes.
 * Mounted once from ControlAppShell — do not nest another AuthenticatedShell
 * in segment layouts (that remounts AuthProvider on cross-nav).
 */
export default function AuthenticatedShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const authReady = useBootstrapGate(queryClient);

  useEffect(() => {
    installDashboardAuthFetchGuard();
  }, []);

  return (
    <AuthProvider authReady={authReady}>
      <FoodOrdersListQueryGate />
      {children}
    </AuthProvider>
  );
}
