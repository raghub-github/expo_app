"use client";

import { useEffect, useState, useCallback, type ComponentType } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, MapPin, Shield } from "lucide-react";
import dynamic from "next/dynamic";
import { StaticHomeMapImage } from "@/components/map/StaticHomeMapImage";
import { ChunkLoadErrorBoundary } from "@/components/ChunkLoadErrorBoundary";
import { useLogout } from "@/hooks/queries/useAuthQuery";
import { usePermissionsQuery } from "@/hooks/queries/usePermissionsQuery";
import { queryKeys } from "@/lib/queryKeys";
import type { HomeMapMode } from "@/lib/home-map/shared";
import { cn } from "@/lib/utils";

/** Neutral wait for /api/dashboard/home-map — never implies Mapbox. */
function HomeMapConfigLoading() {
  return (
    <div className="relative flex h-full w-full min-h-[240px] items-center justify-center overflow-hidden">
      <div className="text-center">
        <p className="text-sm font-medium text-[#121212]/60">Loading home map…</p>
      </div>
    </div>
  );
}

/** Shown only while the live Mapbox chunk is downloading — never used in static mode. */
function LiveMapChunkLoading() {
  return (
    <div className="relative h-full w-full min-h-[240px] overflow-hidden rounded-2xl border border-[#121212]/10 bg-white shadow-sm">
      <div className="absolute inset-0 flex items-center justify-center bg-[#F3F7FA]/60">
        <div className="text-center">
          <p className="text-sm font-medium text-[#121212]/60">Loading live map…</p>
          <p className="mt-1 text-xs text-[#121212]/40">Preparing Mapbox</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Live Mapbox map — dynamic import is only evaluated when this component mounts,
 * which happens only after home-map settings confirm mode === "live".
 */
const LiveServicePointsMap = dynamic(
  () =>
    import("@/components/map/ServicePointsMap")
      .then((m) => m.ServicePointsMap)
      .catch((err) => {
        console.warn("[DashboardHome] ServicePointsMap chunk failed:", err);
        throw err;
      }),
  {
    loading: () => <LiveMapChunkLoading />,
    ssr: false,
  }
);

const LiveServicePointForm = dynamic(
  () =>
    import("@/components/map/ServicePointForm").then((m) => m.ServicePointForm as ComponentType<{
      onSuccess?: () => void;
    }>),
  { ssr: false }
);

type HomeMapApiResp = {
  success: boolean;
  mode?: HomeMapMode;
  staticImage?: { proxyUrl: string | null } | null;
  error?: string;
};

/**
 * Tear down any leftover Mapbox singleton from a prior live visit in this session.
 * Does not load Mapbox scripts — only clears an already-created instance / DOM node.
 */
function tearDownLeftoverMapboxArtifacts() {
  void import("@/lib/map-cache")
    .then(({ mapCache }) => {
      mapCache.clearCache();
      document.getElementById("gm-persistent-mapbox-container")?.remove();
      document.getElementById("gm-map-stash")?.replaceChildren();
    })
    .catch(() => {
      /* non-fatal */
    });
}

/**
 * Home page: fetch saved Home Map mode first.
 * Mapbox / ServicePointsMap mount ONLY when mode === "live".
 * Static mode renders the uploaded image with zero Mapbox init/network.
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

  const homeMapQuery = useQuery({
    queryKey: ["dashboard-home-map"],
    queryFn: async (): Promise<HomeMapApiResp> => {
      const res = await fetch("/api/dashboard/home-map", { credentials: "include", cache: "no-store" });
      const json = (await res.json()) as HomeMapApiResp;
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load home map settings");
      return json;
    },
    staleTime: 30_000,
    // Do not guess "live" from an empty cache — wait for the API.
    retry: 1,
  });

  /** null until settings resolve — never treat unknown as live (would mount Mapbox). */
  const mode: HomeMapMode | null = !homeMapQuery.isSuccess
    ? null
    : homeMapQuery.data?.mode === "static"
      ? "static"
      : "live";
  const staticProxyUrl = homeMapQuery.data?.staticImage?.proxyUrl ?? null;
  const settingsReady = mode !== null;
  const showLiveMap = mode === "live";
  const showStaticMap = mode === "static";

  // Static confirmed → destroy any leftover live Mapbox from earlier in the session.
  useEffect(() => {
    if (mode !== "static") return;
    tearDownLeftoverMapboxArtifacts();
  }, [mode]);

  const setModeMutation = useMutation({
    mutationFn: async (next: HomeMapMode) => {
      const res = await fetch("/api/dashboard/home-map", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      const json = (await res.json()) as HomeMapApiResp;
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to update mode");
      return json;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["dashboard-home-map"], data);
      // Switching to static: ensure Mapbox is torn down immediately after cache update.
      if (data.mode === "static") tearDownLeftoverMapboxArtifacts();
    },
  });

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
                <h3 id="account-setup-title" className="text-base font-semibold text-slate-900">
                  Account Setup Required
                </h3>
                <p id="account-setup-desc" className="mt-2 text-sm leading-relaxed text-slate-600">
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

      <div className="grid h-[calc(100dvh-7.5rem)] min-h-[360px] grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
        <div className="min-h-[240px] lg:col-span-2 lg:min-h-0">
          {!settingsReady ? (
            homeMapQuery.isError ? (
              <div className="relative flex h-full min-h-[240px] w-full flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-sm font-medium text-rose-700">
                  {(homeMapQuery.error as Error)?.message ?? "Could not load home map settings"}
                </p>
                <button
                  type="button"
                  onClick={() => void homeMapQuery.refetch()}
                  className="rounded-lg bg-[#121212] px-4 py-2 text-sm font-semibold text-white hover:bg-black"
                >
                  Retry
                </button>
              </div>
            ) : (
              <HomeMapConfigLoading />
            )
          ) : showStaticMap ? (
            /* Static path: image only — ServicePointsMap / Mapbox never mounted. */
            <StaticHomeMapImage proxyUrl={staticProxyUrl} className="h-full w-full" />
          ) : (
            /* Live path only: dynamic Mapbox chunk loads here. */
            <ChunkLoadErrorBoundary
              key={mapRetryKey}
              onRetry={handleMapChunkRetry}
              fallback={
                <div className="relative flex h-full min-h-[240px] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/80 p-6 text-center">
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
              <LiveServicePointsMap className="h-full w-full" />
            </ChunkLoadErrorBoundary>
          )}
        </div>

        <div
          className={cn(
            "flex flex-col space-y-4 rounded-2xl p-4 sm:p-5 lg:min-h-0 lg:overflow-y-auto",
            showLiveMap ? "" : "bg-transparent"
          )}
          style={showLiveMap ? { background: "#F3F7FA" } : undefined}
        >
          <div
            className={cn(
              "rounded-2xl bg-white p-5",
              showLiveMap
                ? "border border-[#121212]/08 shadow-[0_2px_12px_rgba(18,18,18,0.04)]"
                : "border-0 shadow-none"
            )}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] bg-[#121212]">
                  <MapPin className="h-5 w-5 text-white" strokeWidth={1.75} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-semibold tracking-wide text-[#121212]">
                    Service Points
                  </h3>
                  <p className="text-xs font-medium text-[#121212]/45">Active locations</p>
                </div>
              </div>

              {isSuperAdmin && (
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={mode === "static"}
                    aria-label={
                      mode === "static"
                        ? "Static home map on"
                        : mode === "live"
                          ? "Live Mapbox map on"
                          : "Home map mode loading"
                    }
                    title={
                      mode === "static"
                        ? "Static image (on)"
                        : mode === "live"
                          ? "Live Mapbox (off = live)"
                          : "Loading mode…"
                    }
                    disabled={setModeMutation.isPending || !settingsReady}
                    onClick={() => {
                      if (!mode) return;
                      setModeMutation.mutate(mode === "static" ? "live" : "static");
                    }}
                    className={cn(
                      "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#121212]/30 focus-visible:ring-offset-1",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                      mode === "static"
                        ? "border-[#121212] bg-[#121212]"
                        : "border-gray-300 bg-gray-200"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
                        mode === "static" ? "translate-x-[1.125rem]" : "translate-x-0.5"
                      )}
                    />
                  </button>
                  <span className="text-[10px] font-medium uppercase tracking-wide text-[#121212]/40">
                    {setModeMutation.isPending
                      ? "Saving…"
                      : !settingsReady
                        ? "…"
                        : mode === "static"
                          ? "Static"
                          : "Live"}
                  </span>
                </div>
              )}
            </div>
            <p className="text-2xl font-bold tracking-tight text-[#121212]">India</p>
            <p className="mt-1 text-sm text-[#121212]/55">GatiMitra service coverage</p>

            {isSuperAdmin && setModeMutation.isError && (
              <p className="mt-3 text-xs text-red-600">
                {(setModeMutation.error as Error)?.message ?? "Could not save mode"}
              </p>
            )}
            {isSuperAdmin && showStaticMap && !staticProxyUrl && (
              <p className="mt-3 text-xs text-amber-700">
                No image uploaded — upload one under Super Admin → App Images → Home Map.
              </p>
            )}
          </div>

          {isSuperAdmin && settingsReady && (
            <div className="rounded-2xl border border-[#121212]/10 bg-[#121212] p-5 text-white shadow-[0_4px_16px_rgba(18,18,18,0.12)]">
              <div className="mb-2 flex items-center gap-2">
                <Shield className="h-4 w-4 text-white/80" strokeWidth={1.75} />
                <h4 className="text-sm font-semibold tracking-wide">Super Admin</h4>
              </div>
              <p className="text-sm leading-relaxed text-white/70">
                {showLiveMap
                  ? 'Click the "Add Service Point" button to add new service locations. You can use city name or coordinates.'
                  : "Static Home Map is on. Upload or replace the image in App Images → Home Map. Switch to Live Mapbox to view service points on the interactive map."}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* FAB only in live mode — form (and its geocode hooks) never mount in static. */}
      {isSuperAdmin && showLiveMap && (
        <LiveServicePointForm onSuccess={handleServicePointCreated} />
      )}
    </div>
  );
}
