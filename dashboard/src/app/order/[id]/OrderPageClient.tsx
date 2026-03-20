"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AuthProvider } from "@/providers/AuthProvider";
import { fetchBootstrapAndSeedCache } from "@/hooks/queries/useBootstrapQuery";
import { loadBootstrapFromStorage } from "@/lib/dashboard-bootstrap-storage";
import { queryKeys } from "@/lib/queryKeys";
import OrderHeader from "./OrderHeader";
import OrderDetailClient from "./OrderDetailClient";

interface OrderPageClientProps {
  orderPublicId: string;
}

function useOrderBootstrapGate(queryClient: ReturnType<typeof useQueryClient>) {
  const didRun = useRef(false);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    const cached = queryClient.getQueryData(["auth", "session"]);
    if (cached != null) {
      setAuthReady(true);
      return;
    }

    // Try localStorage fast path so the header can render instantly.
    const stored = loadBootstrapFromStorage<{
      session: { user: Record<string, unknown> };
      permissions: unknown;
      dashboardAccess: unknown;
      systemUser?: { id: number; systemUserId: string; fullName: string; email: string } | null;
    }>(10 * 60 * 1000);

    if (stored?.data) {
      const { session, permissions, dashboardAccess, systemUser } = stored.data;
      queryClient.setQueryData(["auth", "session"], {
        session,
        permissions,
        systemUser: systemUser ?? null,
      });
      queryClient.setQueryData(queryKeys.permissions(), permissions as unknown);
      queryClient.setQueryData(queryKeys.dashboardAccess(), dashboardAccess as unknown);

      // Revalidate in the background; do not block initial render.
      void fetchBootstrapAndSeedCache(queryClient).finally(() => {
        setAuthReady(true);
      });
      return;
    }

    // Slow path: fetch bootstrap in the background.
    void fetchBootstrapAndSeedCache(queryClient).finally(() => {
      setAuthReady(true);
    });
  }, [queryClient]);

  return authReady;
}

export default function OrderPageClient({ orderPublicId }: OrderPageClientProps) {
  const queryClient = useQueryClient();
  const bootstrapReady = useOrderBootstrapGate(queryClient);
  const [orderLoading, setOrderLoading] = useState(true);

  return (
    <AuthProvider authReady={bootstrapReady}>
      <div className="min-h-screen bg-[#F8FAFC]">
        <OrderHeader forceSkeleton={orderLoading} />
        <main className="px-3 py-3 sm:px-4 md:px-6 md:py-4">
          <OrderDetailClient
            orderPublicId={orderPublicId}
            onLoadingChange={setOrderLoading}
          />
        </main>
      </div>
    </AuthProvider>
  );
}
