"use client";

import { useEffect, useRef, useState } from "react";
import { mapCache } from "@/lib/map-cache";

interface UseMapCacheOptions {
  token: string;
  container: HTMLElement | null;
  center?: [number, number];
  zoom?: number;
  style?: string;
}

/**
 * Hook to get or create a cached map instance
 * Reuses map instance across component mounts/unmounts
 */
export function useMapCache(options: UseMapCacheOptions) {
  const { token, container, center, zoom, style } = options;
  const [map, setMap] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (!container || !token) {
      setIsLoading(false);
      return;
    }

    let mounted = true;

    const initializeMap = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Try to get cached map first
        const cachedMap = mapCache.getCachedMap(token);
        
        if (cachedMap) {
          // Reuse cached map
          if (mounted) {
            mapRef.current = cachedMap;
            setMap(cachedMap);
            setIsLoading(false);
          }
          return;
        }

        // Create new map instance (will be cached automatically)
        const newMap = await mapCache.getOrCreateMap(container, token, {
          center,
          zoom,
          style,
        });

        if (mounted) {
          mapRef.current = newMap;
          setMap(newMap);
          setIsLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to initialize map");
          setIsLoading(false);
        }
      }
    };

    initializeMap();

    return () => {
      mounted = false;
      // Don't clear map on unmount - let it be cached for reuse
      // Only clear ref
      mapRef.current = null;
    };
  }, [container, token, center?.[0], center?.[1], zoom, style]);

  return { map, isLoading, error, mapRef };
}

/**
 * Clear map cache (useful for logout or explicit cleanup)
 */
export function useClearMapCache() {
  return () => {
    mapCache.clearCache();
  };
}
