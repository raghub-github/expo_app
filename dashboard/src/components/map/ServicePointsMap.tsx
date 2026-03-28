"use client";

import { useState, useCallback, useMemo, memo } from "react";
import { usePermissions } from "@/hooks/queries/usePermissionsQuery";
import Link from "next/link";
import {
  useGetServicePointsQuery,
  useDeleteServicePointMutation,
  SESSION_EXPIRED_MESSAGE,
  type ServicePoint,
} from "@/store/api/dashboardHomeApi";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ChunkLoadErrorBoundary } from "@/components/ChunkLoadErrorBoundary";
import { MapComponent } from "./MapComponent";

interface ServicePointsMapProps {
  className?: string;
}

function ServicePointsMapInner({ className = "" }: ServicePointsMapProps) {
  const [selectedPoint, setSelectedPoint] = useState<ServicePoint | null>(null);
  const [deletingPointId, setDeletingPointId] = useState<number | null>(null);
  const [deleteStartTime, setDeleteStartTime] = useState<number | null>(null);
  const [mapChunkKey, setMapChunkKey] = useState(0);
  const { isSuperAdmin } = usePermissions();

  const {
    data: servicePoints = [],
    isLoading,
    error,
    refetch,
    isFetching,
  } = useGetServicePointsQuery(undefined, {
    // Preserve cache when component remounts after route switch.
    refetchOnMountOrArgChange: false,
  });
  const [deleteServicePoint] = useDeleteServicePointMutation();
  const [retrying, setRetrying] = useState(false);
  const handleRetry = useCallback(async () => {
    setRetrying(true);
    try {
      await refetch();
    } finally {
      setRetrying(false);
    }
  }, [refetch]);

  // Support both env variable names
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_PUBLIC_TOKEN;

  // ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURNS
  // Memoize service points to prevent unnecessary re-renders
  const memoizedServicePoints = useMemo(() => servicePoints, [
    servicePoints.length,
    servicePoints.map((p: ServicePoint) => `${p.id}-${p.latitude}-${p.longitude}`).join(',')
  ]);

  // Memoize callbacks
  const handlePointClick = useCallback((point: ServicePoint) => {
    setSelectedPoint(point);
  }, []);

  const handleClosePopup = useCallback(() => {
    setSelectedPoint(null);
  }, []);

  const handleDeletePoint = useCallback(async (pointId: number) => {
    setDeletingPointId(pointId);
    setDeleteStartTime(Date.now());
    try {
      await deleteServicePoint(pointId).unwrap();
      setSelectedPoint(null);
    } catch (err) {
      console.error("Error deleting service point:", err);
      throw err;
    } finally {
      setDeletingPointId(null);
      setDeleteStartTime(null);
    }
  }, [deleteServicePoint]);

  // Early returns AFTER all hooks
  if (!mapboxToken) {
    return (
      <div className={`rounded-lg border border-red-200 bg-red-50 p-8 text-center ${className}`}>
        <p className="text-red-600">Mapbox token not configured. Please set NEXT_PUBLIC_MAPBOX_TOKEN or MAPBOX_PUBLIC_TOKEN in .env.local</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={`relative rounded-lg border border-gray-200 bg-white overflow-hidden shadow-sm ${className}`} style={{ height: '100%', width: '100%' }}>
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <LoadingSpinner size="lg" text="Loading service points..." />
        </div>
      </div>
    );
  }

  if (error) {
    const err = error as { status?: number; message?: string };
    const isSessionExpired =
      err?.status === 401 ||
      (error instanceof Error && error.message === SESSION_EXPIRED_MESSAGE);
    const isNetworkError =
      error instanceof Error &&
      (error.message === "Failed to fetch" || error.name === "TypeError");
    const friendlyMessage = isNetworkError
      ? "Could not load the map. Check your connection and try again."
      : (error instanceof Error ? error.message : "Failed to load service points");
    return (
      <div className={`rounded-lg border p-8 text-center ${className} ${isSessionExpired ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"}`}>
        <p className={isSessionExpired ? "text-amber-800" : "text-red-600"}>
          {isSessionExpired
            ? "Your session has expired. Please log in again to continue."
            : `Error: ${friendlyMessage}`}
        </p>
        {isSessionExpired ? (
          <Link
            href="/login?expired=1&redirect=/dashboard"
            className="mt-4 inline-block px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium"
          >
            Log in again
          </Link>
        ) : (
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying || isFetching}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {retrying || isFetching ? "Retrying…" : "Retry"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`${className} min-h-[200px]`}>
      <ChunkLoadErrorBoundary onRetry={() => setMapChunkKey((k) => k + 1)}>
        <MapComponent
          key={mapChunkKey}
          servicePoints={memoizedServicePoints}
          onPointClick={handlePointClick}
          selectedPoint={selectedPoint}
          onClosePopup={handleClosePopup}
          mapboxToken={mapboxToken}
          className="h-full w-full"
          isSuperAdmin={isSuperAdmin}
          onDeletePoint={isSuperAdmin ? handleDeletePoint : undefined}
          deletingPointId={deletingPointId}
          deleteStartTime={deleteStartTime}
        />
      </ChunkLoadErrorBoundary>
    </div>
  );
}

// Memoize ServicePointsMap to prevent unnecessary re-renders
export const ServicePointsMap = memo(ServicePointsMapInner);
