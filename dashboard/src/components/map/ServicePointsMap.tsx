"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { usePermissions } from "@/hooks/usePermissions";

// Dynamically import the map component with no SSR - use function to make it truly lazy
const DynamicMapComponent = dynamic(
  () => import("./MapComponent").then((mod) => ({ default: mod.MapComponent })),
  { 
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
        <p className="text-gray-500">Loading map...</p>
      </div>
    ),
  }
);

interface ServicePoint {
  id: number;
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  address?: string;
  is_active: boolean;
}

interface ServicePointsMapProps {
  className?: string;
}

export function ServicePointsMap({ className = "" }: ServicePointsMapProps) {
  const [servicePoints, setServicePoints] = useState<ServicePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPoint, setSelectedPoint] = useState<ServicePoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isSuperAdmin } = usePermissions();

  // Support both env variable names
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_PUBLIC_TOKEN;

  const fetchServicePoints = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/service-points");
      const result = await response.json();

      if (result.success) {
        setServicePoints(result.data);
        setError(null);
      } else {
        setError(result.error || "Failed to fetch service points");
      }
    } catch (err) {
      console.error("Error fetching service points:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServicePoints();
  }, [fetchServicePoints]);

  const handleDeletePoint = useCallback(async (pointId: number) => {
    try {
      const response = await fetch(`/api/service-points?id=${pointId}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (result.success) {
        // Remove the point from local state
        setServicePoints((prev) => prev.filter((p) => p.id !== pointId));
        setSelectedPoint(null);
        // Optionally show success message
      } else {
        throw new Error(result.error || "Failed to delete service point");
      }
    } catch (err) {
      console.error("Error deleting service point:", err);
      throw err;
    }
  }, []);

  if (!mapboxToken) {
    return (
      <div className={`rounded-lg border border-red-200 bg-red-50 p-8 text-center ${className}`}>
        <p className="text-red-600">Mapbox token not configured. Please set NEXT_PUBLIC_MAPBOX_TOKEN or MAPBOX_PUBLIC_TOKEN in .env.local</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`rounded-lg border border-gray-200 bg-white p-4 text-center ${className}`} style={{ height: '100%', maxHeight: '240px' }}>
        <div className="animate-pulse">
          <div className="h-full bg-gray-200 rounded-lg"></div>
          <p className="mt-2 text-sm text-gray-500">Loading service points...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rounded-lg border border-red-200 bg-red-50 p-8 text-center ${className}`}>
        <p className="text-red-600">Error: {error}</p>
        <button
          onClick={fetchServicePoints}
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
        servicePoints={servicePoints}
        onPointClick={setSelectedPoint}
        selectedPoint={selectedPoint}
        onClosePopup={() => setSelectedPoint(null)}
        mapboxToken={mapboxToken}
        className="h-full w-full"
        isSuperAdmin={isSuperAdmin}
        onDeletePoint={isSuperAdmin ? handleDeletePoint : undefined}
      />
    </div>
  );
}
