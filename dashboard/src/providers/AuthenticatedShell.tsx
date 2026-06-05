"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AuthProvider } from "@/providers/AuthProvider";
import { useBootstrapGate } from "@/hooks/useBootstrapGate";
import { FoodOrdersListQueryGate } from "@/components/query/FoodOrdersListQueryGate";

/**
 * Shared auth shell for dashboard + standalone order routes.
 * Bootstrap runs once per tab; nested layouts must not duplicate AuthProvider.
 */
export default function AuthenticatedShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const authReady = useBootstrapGate(queryClient);

  return (
    <AuthProvider authReady={authReady}>
      <FoodOrdersListQueryGate />
      {children}
    </AuthProvider>
  );
}
