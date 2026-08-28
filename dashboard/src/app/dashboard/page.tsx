"use client";

import { useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, MapPin, Shield } from "lucide-react";
import dynamic from "next/dynamic";
import { ServicePointForm } from "@/components/map/ServicePointForm";
import { ChunkLoadErrorBoundary } from "@/components/ChunkLoadErrorBoundary";
import { useLogout } from "@/hooks/queries/useAuthQuery";
import { usePermissionsQuery } from "@/hooks/queries/usePermissionsQuery";
import { queryKeys } from "@/lib/queryKeys";

function MapLoadingPlaceholder() {
  return (
    <div className="relative h-full w-full min-h-[320px] overflow-hidden rounded-2xl border border-[#121212]/10 bg-white shadow-sm">
      <div className="absolute inset-0 flex items-center justify-center bg-[#F3F7FA]">
        <div className="text-center">
          <p className="text-sm font-medium text-[#121212]/60">Loading map…</p>
          <p className="mt-1 text-xs text-[#121212]/40">Preparing service points</p>
        </div>
      </div>
    </div>
  );
}

const ServicePointsMap = dynamic(
  () =>
    import("@/components/map/ServicePointsMap")
      .then((m) => m.ServicePointsMap)
      .catch((err) => {
        console.warn("[DashboardHome] ServicePointsMap chunk failed:", err);
        // Remount via boundary Retry — avoid crashing the whole dashboard shell.
        throw err;
      }),
  {
    loading: () => <MapLoadingPlaceholder />,
    ssr: false,
  }
);

/**
 * Home page: only this page's APIs run when user opens Home from sidebar.
 * Permissions and service points use React Query cache; no invalidation on mount.
 */
export default function DashboardHome() {
  const queryClient = useQueryClient();
  const { data: userPerms, error, isError } = usePermissionsQuery();
  const logoutMutation = useLogout();
  const [hasMounted, setHasMounted] = useState(false);
  const [mapRetryKey, setMapRetryKey] = useState(0);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const handleMapChunkRetry = useCallback(() => {
    setMapRetryKey((k) => k + 1);
  }, []);

  const isSuperAdmin = hasMounted && (userPerms?.isSuperAdmin ?? false);
  const needsAccountSetup = hasMounted && !!userPerms && !userPerms.exists;

  const handleRetry = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.permissions() });
  };

  const handleServicePointCreated = () => {
    // RTK Query invalidates ServicePoint cache on create; no React Query invalidation needed.
  };

  return (
    <div className="w-full max-w-full overflow-x-hidden">
      {/* Defer until mount: React Query may restore persisted permissions only on client (SSR has no cache). */}
      {hasMounted && isError && error && !userPerms && (
        <div className="mb-4 rounded-xl border border-amber-200/80 bg-amber-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-start">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-amber-800">Could not load permissions</h3>
                <p className="mt-1 text-sm text-amber-700">
                  {error instanceof Error ? error.message : "Request failed. Try again."}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRetry}
              className="rounded-[10px] bg-[#121212] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-black"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Account setup modal – centered; Got it signs out and sends user to login. */}
      {needsAccountSetup && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-setup-title"
          aria-describedby="account-setup-desc"
        >
          <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-50">
                <AlertCircle className="h-5 w-5 text-amber-600" />
              </div>
              <div className="min-w-0 flex-1">
                <h3
                  id="account-setup-title"
                  className="text-base font-semibold text-slate-900"
                >
                  Account Setup Required
                </h3>
                <p
                  id="account-setup-desc"
                  className="mt-2 text-sm leading-relaxed text-slate-600"
                >
                  Your account is authenticated but not yet added to the system.
                  Please contact an administrator to complete your account setup.
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={logoutMutation.isPending}
              onClick={() => logoutMutation.mutate()}
              className="mt-6 w-full rounded-xl bg-[#121212] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {logoutMutation.isPending ? "Signing out…" : "Got it"}
            </button>
          </div>
        </div>
      )}

      {/* Map + right panel — map fills available main area like the Home layout */}
      <div className="grid h-[calc(100dvh-7.5rem)] min-h-[420px] grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
        <div className="min-h-[320px] lg:col-span-2 lg:min-h-0">
          <ChunkLoadErrorBoundary
            key={mapRetryKey}
            onRetry={handleMapChunkRetry}
            fallback={
              <div className="relative flex h-full min-h-[320px] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/80 p-6 text-center">
                <p className="text-sm font-medium text-amber-900">
                  Map failed to load (stale chunk). Retry or hard-refresh the page.
                </p>
                <button
                  type="button"
                  onClick={handleMapChunkRetry}
                  className="rounded-lg bg-amber-200 px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-300"
                >
                  Retry map
                </button>
              </div>
            }
          >
            <ServicePointsMap className="h-full w-full" />
          </ChunkLoadErrorBoundary>
        </div>

        <div
          className="flex flex-col space-y-4 rounded-2xl p-4 sm:p-5 lg:min-h-0 lg:overflow-y-auto"
          style={{ background: "#F3F7FA" }}
        >
          <div className="rounded-2xl border border-[#121212]/08 bg-white p-5 shadow-[0_2px_12px_rgba(18,18,18,0.04)]">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] bg-[#121212]">
                <MapPin className="h-5 w-5 text-white" strokeWidth={1.75} />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold tracking-wide text-[#121212]">
                  Service Points
                </h3>
                <p className="text-xs font-medium text-[#121212]/45">Active locations</p>
              </div>
            </div>
            <p className="text-2xl font-bold tracking-tight text-[#121212]">India</p>
            <p className="mt-1 text-sm text-[#121212]/55">GatiMitra service coverage</p>
          </div>

          {isSuperAdmin && (
            <div className="rounded-2xl border border-[#121212]/10 bg-[#121212] p-5 text-white shadow-[0_4px_16px_rgba(18,18,18,0.12)]">
              <div className="mb-2 flex items-center gap-2">
                <Shield className="h-4 w-4 text-white/80" strokeWidth={1.75} />
                <h4 className="text-sm font-semibold tracking-wide">Super Admin</h4>
              </div>
              <p className="text-sm leading-relaxed text-white/70">
                Click the &quot;Add Service Point&quot; button to add new service locations. You can use city name or coordinates.
              </p>
            </div>
          )}
        </div>
      </div>

      {isSuperAdmin && <ServicePointForm onSuccess={handleServicePointCreated} />}
    </div>
  );
}
