"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, MapPin } from "lucide-react";
import dynamic from "next/dynamic";
import { ServicePointForm } from "@/components/map/ServicePointForm";
import { usePermissionsQuery } from "@/hooks/queries/usePermissionsQuery";
import { queryKeys } from "@/lib/queryKeys";

const ServicePointsMap = dynamic(
  () => import("@/components/map/ServicePointsMap").then((m) => m.ServicePointsMap),
  {
    // Map is heavy and below the fold; show a lightweight placeholder while it loads.
    loading: () => (
      <div className="relative rounded-lg border border-gray-200 bg-white overflow-hidden shadow-sm h-full w-full">
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <p className="text-gray-500">Loading map…</p>
            <p className="text-gray-400 text-xs mt-2">Preparing service points</p>
          </div>
        </div>
      </div>
    ),
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
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const isSuperAdmin = hasMounted && (userPerms?.isSuperAdmin ?? false);

  const handleRetry = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.permissions() });
  };

  const handleServicePointCreated = () => {
    // RTK Query invalidates ServicePoint cache on create; no React Query invalidation needed.
  };

  return (
    <div className="w-full max-w-full overflow-x-hidden">
      {/* Only show error when we have no cached data (avoids "signal aborted" on nav/timeout) */}
      {isError && error && !userPerms && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-start">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
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
              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Account setup warning – only when we have data and user is not in system */}
      {userPerms && !userPerms.exists && (
        <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <div className="flex flex-start">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">Account Setup Required</h3>
              <p className="mt-1 text-sm text-yellow-700">
                Your account is authenticated but not yet added to the system. Please contact an administrator to complete your account setup.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Map and content – always show; permissions are cached, no blocking */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <div className="lg:col-span-2 flex items-start">
          <div className="w-full max-w-[500px] aspect-square">
            <ServicePointsMap className="h-full w-full" />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
                <MapPin className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Service Points</h3>
                <p className="text-sm text-gray-500">Active locations</p>
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">India</p>
            <p className="text-sm text-gray-600 mt-1">GatiMitra service coverage</p>
          </div>

          {isSuperAdmin && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <h4 className="font-medium text-blue-900 mb-2">Super Admin</h4>
              <p className="text-sm text-blue-700">
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
