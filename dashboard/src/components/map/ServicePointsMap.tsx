"use client";

import { useState, useCallback, useEffect, useMemo, memo } from "react";
import dynamic from "next/dynamic";
import { usePermissions } from "@/hooks/queries/usePermissionsQuery";
import { 
  useServicePointsQuery, 
  useDeleteServicePoint,
  type ServicePoint 
} from "@/hooks/queries/useServicePointsQuery";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

// Dynamically import the map component with no SSR - use function to make it truly lazy
const DynamicMapComponent = dynamic(
  () => import("./MapComponent").then((mod) => ({ default: mod.MapComponent })),
  { 
    ssr: false,
    loading: () => (
      <div className="relative rounded-lg border border-gray-200 bg-white overflow-hidden shadow-sm h-full w-full">
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <p className="text-gray-500">Loading map...</p>
            <p className="text-gray-400 text-xs mt-2">Initializing Mapbox</p>
          </div>
        </div>
      </div>
    ),
  }
);

interface ServicePointsMapProps {
  className?: string;
}

function ServicePointsMapInner({ className = "" }: ServicePointsMapProps) {
  // #region agent log
  const componentMountTime = Date.now();
  fetch('http://127.0.0.1:7242/ingest/2cc0b640-978a-4fbb-81f9-cf64378f704f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ServicePointsMap.tsx:29',message:'ServicePointsMap mounted',data:{componentMountTime},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  
  const [selectedPoint, setSelectedPoint] = useState<ServicePoint | null>(null);
  const [deletingPointId, setDeletingPointId] = useState<number | null>(null);
  const { isSuperAdmin } = usePermissions();
  const { data: servicePoints = [], isLoading, error, dataUpdatedAt, isFetching } = useServicePointsQuery();
  const deleteServicePoint = useDeleteServicePoint();
  
  // #region agent log
  useEffect(() => {
    const queryCheckTime = Date.now();
    fetch('http://127.0.0.1:7242/ingest/2cc0b640-978a-4fbb-81f9-cf64378f704f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ServicePointsMap.tsx:32',message:'ServicePoints query state',data:{isLoading,isFetching,dataUpdatedAt,hasData:!!servicePoints.length,timeSinceMount:queryCheckTime - componentMountTime},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  }, [isLoading, isFetching, servicePoints.length]);
  // #endregion

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
    try {
      await deleteServicePoint.mutateAsync(pointId);
      setSelectedPoint(null);
    } catch (err) {
      console.error("Error deleting service point:", err);
      throw err;
    } finally {
      setDeletingPointId(null);
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
    return (
      <div className={`rounded-lg border border-red-200 bg-red-50 p-8 text-center ${className}`}>
        <p className="text-red-600">Error: {error instanceof Error ? error.message : "Failed to load service points"}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      <DynamicMapComponent
        servicePoints={memoizedServicePoints}
        onPointClick={handlePointClick}
        selectedPoint={selectedPoint}
        onClosePopup={handleClosePopup}
        mapboxToken={mapboxToken}
        className="h-full w-full"
        isSuperAdmin={isSuperAdmin}
        onDeletePoint={isSuperAdmin ? handleDeletePoint : undefined}
        deletingPointId={deletingPointId}
      />
    </div>
  );
}

// Memoize ServicePointsMap to prevent unnecessary re-renders
export const ServicePointsMap = memo(ServicePointsMapInner);
