"use client";

import { useEffect, useState, useRef, useMemo, useCallback, memo } from "react";
import { ServicePointMarker } from "./ServicePointMarker";
import { X } from "lucide-react";
import { mapCache } from "@/lib/map-cache";

interface ServicePoint {
  id: number;
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  address?: string;
  is_active: boolean;
}

interface MapComponentProps {
  servicePoints: ServicePoint[];
  onPointClick: (point: ServicePoint) => void;
  selectedPoint: ServicePoint | null;
  onClosePopup: () => void;
  mapboxToken: string;
  className?: string;
  isSuperAdmin?: boolean;
  onDeletePoint?: (pointId: number) => Promise<void>;
  deletingPointId?: number | null;
  deleteStartTime?: number | null;
}

const PERSISTENT_MAP_CONTAINER_ID = "gm-persistent-mapbox-container";

function getOrCreatePersistentMapContainer(): HTMLDivElement {
  let el = document.getElementById(PERSISTENT_MAP_CONTAINER_ID) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = PERSISTENT_MAP_CONTAINER_ID;
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.position = "relative";
  }
  return el;
}

function getMapStashEl(): HTMLElement | null {
  return document.getElementById("gm-map-stash");
}

function MapComponentInner({
  servicePoints,
  onPointClick,
  selectedPoint,
  onClosePopup,
  mapboxToken,
  className = "",
  isSuperAdmin = false,
  onDeletePoint,
  deletingPointId = null,
  deleteStartTime = null,
}: MapComponentProps) {
  const [deleteElapsed, setDeleteElapsed] = useState(0);
  const componentMountTime = Date.now();

  const hostContainerRef = useRef<HTMLDivElement>(null);
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(() => {
    if (typeof window === "undefined") return false;
    const cached = mapCache.getCachedMap(mapboxToken);
    return Boolean(cached && typeof cached.loaded === "function" && cached.loaded());
  });
  const [error, setError] = useState<string | null>(null);
  const markersRef = useRef<any[]>([]);
  const popupRef = useRef<any>(null);
  const scriptLoadedRef = useRef(false);
  const initAttemptedRef = useRef(false);
  const [containerReady, setContainerReady] = useState(false);

  const [viewState, setViewState] = useState({
    longitude: 81.0, // Adjusted center for better visual centering of India
    latitude: 22.0, // Adjusted center for better visual centering of India
    zoom: 3.45, // Better zoom level to show all of India
  });

  // Callback ref to detect when container is mounted
  const containerRefCallback = (node: HTMLDivElement | null) => {
    
    if (node) {
      hostContainerRef.current = node;
      // Mount / re-mount the persistent map container into this host so Mapbox never
      // loses its container across route navigations.
      const persistent = getOrCreatePersistentMapContainer();
      if (persistent.parentElement !== node) {
        node.replaceChildren(persistent);
      }
      mapContainer.current = persistent;
      setContainerReady(true);
    } else {
      hostContainerRef.current = null;
      mapContainer.current = null;
      setContainerReady(false);
    }
  };

  useEffect(() => {

    if (!mapboxToken) {
      setError('Mapbox token not provided');
      return;
    }

    if (initAttemptedRef.current) {
      return;
    }

    // Wait for container to be available
    const checkContainer = () => {

      if (!mapContainer.current || !containerReady) {
        setTimeout(checkContainer, 100);
        return;
      }

      // Container is ready, proceed with initialization
      initAttemptedRef.current = true;
      loadMapbox();
    };

    // Initialize map using global cache
    const loadMapbox = async () => {
      try {

        // Check if mapbox-gl is already loaded
        if (mapCache.isScriptLoaded()) {
          await initializeMap();
          return;
        }

        // Load script via cache manager
        await mapCache.loadMapboxScript();
        await initializeMap();
      } catch (err) {
        scriptLoadedRef.current = false;
        setError(err instanceof Error ? err.message : 'Failed to load map');
      }
    };

    const initializeMap = async () => {
      try {

        if (!mapContainer.current) {
          setError('Map container not found');
          return;
        }

        // Check for cached map first
        const cachedMap = mapCache.getCachedMap(mapboxToken);
        if (cachedMap) {
          // Reuse cached map
          mapRef.current = cachedMap;
          // Update container reference if it changed
          if (cachedMap.getContainer() !== mapContainer.current) {
            // Map container changed, need to recreate
            // But for now, just update the reference
            mapRef.current = cachedMap;
          }
          
          // If map is already loaded, update markers immediately
          if (cachedMap.loaded()) {
            setIsLoaded(true);
            updateMarkers();
          } else {
            // Wait for map to load
            cachedMap.once('load', () => {
              setIsLoaded(true);
              updateMarkers();
            });
          }
          return;
        }

        // Load Mapbox script if needed
        await mapCache.loadMapboxScript();

        const mapboxgl = (window as any).mapboxgl;
        if (!mapboxgl) {
          setError('Mapbox library not available');
          return;
        }


        // Use map cache to get or create map instance
        const map = await mapCache.getOrCreateMap(
          mapContainer.current,
          mapboxToken,
          {
            center: [viewState.longitude, viewState.latitude],
            zoom: viewState.zoom,
            style: 'mapbox://styles/mapbox/streets-v12',
          }
        );

        mapRef.current = map;

        map.on('load', () => {
          setIsLoaded(true);
          // Clear any previous errors when map loads successfully
          setError(null);
          updateMarkers();
        });

        map.on('error', (e: any) => {
          
          // Filter out non-critical errors that shouldn't be shown to users
          // Tile loading errors during zoom/pan are temporary and shouldn't be displayed
          const errorMessage = String(e.error?.message || e || '');
          const errorType = e.error?.type || '';
          
          // Ignore tile loading errors, network errors during zoom, and other non-critical errors
          // These are common during zoom operations and don't indicate a real problem
          const isTileError = errorMessage.includes('tile') || 
                             errorMessage.includes('vector.pbf') ||
                             errorMessage.includes('api.mapbox.com/v4') ||
                             errorMessage.includes('api.mapbox.com/v4/') ||
                             errorType === 'TileLoadError' ||
                             errorType === 'StyleImageMissing';
          
          // Only show critical errors that prevent the map from working
          // Filter out tile errors which are temporary and common during zoom/pan
          if (!isTileError && errorMessage) {
            // Sanitize error message to avoid showing tokens or URLs
            const sanitizedError = errorMessage
              .replace(/pk\.[a-zA-Z0-9_-]+/g, 'pk.***') // Hide Mapbox tokens
              .replace(/https?:\/\/[^\s]+/g, '[URL]') // Hide URLs
              .substring(0, 200); // Limit length
            
            // Show errors for critical issues (authentication, initialization, etc.)
            // but not for temporary tile loading issues
            if (errorMessage.includes('token') || 
                errorMessage.includes('authentication') ||
                errorMessage.includes('unauthorized') ||
                errorMessage.includes('forbidden') ||
                errorMessage.includes('invalid') ||
                errorMessage.includes('not found') ||
                errorMessage.includes('failed to load')) {
              setError(`Map error: ${sanitizedError}`);
            }
            // For other non-critical errors, just log them but don't show to user
          }
        });

        map.on('move', () => {
          if (mapRef.current) {
            setViewState({
              longitude: mapRef.current.getCenter().lng,
              latitude: mapRef.current.getCenter().lat,
              zoom: mapRef.current.getZoom(),
            });
          }
        });

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize map');
      }
    };

    const updateMarkers = () => {
      if (!mapRef.current) {
        return;
      }

      // Clear existing markers
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];

      const mapboxgl = (window as any).mapboxgl;
      if (!mapboxgl) return;

      servicePoints.forEach((point) => {

        const el = document.createElement('div');
        el.className = 'map-marker-container';
        el.style.cursor = 'pointer';
        el.style.width = '24px';
        el.style.height = '24px';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        
        // Create marker with logo - 24px size, no border
        const marker = new mapboxgl.Marker({
          element: el,
          anchor: 'center'
        })
          .setLngLat([point.longitude, point.latitude])
          .addTo(mapRef.current);

        // Render ServicePointMarker into the element - 24px size, no border
        const img = document.createElement('img');
        img.src = '/onlylogo.png';
        img.alt = 'GatiMitra';
        img.style.width = '24px';
        img.style.height = '24px';
        img.style.objectFit = 'contain';
        img.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))';
        
        el.appendChild(img);

        el.addEventListener('click', () => onPointClick(point));
        markersRef.current.push(marker);
      });
    };

    // Start checking when container becomes ready
    let timer: NodeJS.Timeout | null = null;
    if (containerReady) {
      checkContainer();
    } else {
      // Also check periodically in case callback ref doesn't fire
      timer = setTimeout(checkContainer, 100);
    }

    return () => {
      
      if (timer) clearTimeout(timer);

      // Keep the Mapbox map + container alive across navigations.
      // Move the persistent container back into the dashboard stash so it stays mounted.
      try {
        const stash = getMapStashEl();
        const persistent = document.getElementById(PERSISTENT_MAP_CONTAINER_ID);
        if (stash && persistent && persistent.parentElement !== stash) {
          stash.replaceChildren(persistent);
        }
      } catch {
        // ignore
      }

      // Do not remove the map instance. Also do not clear markers here to preserve
      // perceived instant return (map + state remain visible). Marker updates are
      // handled by servicePoints effects.
      mapRef.current = null;
    };
  }, [mapboxToken, containerReady]);

  // Update markers when service points change
  useEffect(() => {

    if (isLoaded && mapRef.current) {
      const mapboxgl = (window as any).mapboxgl;
      if (!mapboxgl) {
        return;
      }

      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];

      servicePoints.forEach((point) => {

        const el = document.createElement('div');
        el.className = 'map-marker-container';
        el.style.cursor = 'pointer';
        el.style.width = '24px';
        el.style.height = '24px';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        
        const marker = new mapboxgl.Marker({
          element: el,
          anchor: 'center'
        })
          .setLngLat([point.longitude, point.latitude])
          .addTo(mapRef.current);

        const img = document.createElement('img');
        img.src = '/onlylogo.png';
        img.alt = 'GatiMitra';
        img.style.width = '24px';
        img.style.height = '24px';
        img.style.objectFit = 'contain';
        img.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))';
        
        el.appendChild(img);
        el.addEventListener('click', () => onPointClick(point));
        markersRef.current.push(marker);
      });
    }
  }, [servicePoints, isLoaded, onPointClick]);

  // Tick elapsed time when delete is in progress
  useEffect(() => {
    if (!deletingPointId || !deleteStartTime) {
      setDeleteElapsed(0);
      return;
    }
    const id = setInterval(() => {
      setDeleteElapsed(Math.floor((Date.now() - deleteStartTime) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [deletingPointId, deleteStartTime]);

  // Handle popup
  useEffect(() => {
    if (!mapRef.current || !selectedPoint) {
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
      return;
    }

    const mapboxgl = (window as any).mapboxgl;
    if (!mapboxgl) return;

    // Remove existing popup
    if (popupRef.current) {
      popupRef.current.remove();
    }

    // Create unique ID for delete button to avoid conflicts
    const deleteButtonId = `delete-btn-${selectedPoint.id}-${Date.now()}`;
    const pointId = selectedPoint.id;
    const pointName = selectedPoint.name.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const isDeleting = deletingPointId === pointId;
    const elapsedStr = isDeleting ? `${deleteElapsed}s` : '';
    const trashSvg = '<svg style="width: 18px; height: 18px; flex-shrink: 0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
    const spinnerSvg = '<svg style="width: 16px; height: 16px; animation: spin 1s linear infinite;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" fill-opacity="0.75"></path></svg>';
    
    const popup = new mapboxgl.Popup({ closeOnClick: false })
      .setLngLat([selectedPoint.longitude, selectedPoint.latitude])
      .setHTML(`
        <div style="padding: 12px; min-width: 220px;">
          <style>@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }</style>
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
            <div style="flex: 1;">
              <h3 style="font-weight: 600; color: #111827; margin: 0; font-size: 15px;">${pointName}</h3>
              <p style="color: #4b5563; font-size: 13px; margin: 4px 0 0 0;">${selectedPoint.city}</p>
            </div>
            <button onclick="this.closest('.mapboxgl-popup').remove()" style="background: none; border: none; color: #9ca3af; cursor: pointer; padding: 4px; margin-left: 8px; border-radius: 4px; hover:bg-gray-100;">✕</button>
          </div>
          ${selectedPoint.address ? `<p style="color: #6b7280; font-size: 12px; margin-top: 8px; margin-bottom: ${isSuperAdmin ? '10px' : '0'}; line-height: 1.4;">${selectedPoint.address.replace(/"/g, '&quot;').replace(/'/g, '&#39;')}</p>` : ''}
          ${isSuperAdmin ? `
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
              <button 
                id="${deleteButtonId}" 
                style="width: 100%; padding: 8px 12px; background: ${isDeleting ? '#9ca3af' : '#ef4444'}; color: white; border: none; border-radius: 6px; cursor: ${isDeleting ? 'not-allowed' : 'pointer'}; font-size: 13px; font-weight: 500; transition: background 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px;"
                ${isDeleting ? 'disabled' : ''}
                onmouseover="${isDeleting ? '' : "this.style.background='#dc2626'"} "
                onmouseout="${isDeleting ? '' : "this.style.background='#ef4444'"} "
                title="Delete service point"
              >
                ${isDeleting ? spinnerSvg + '<span style="margin-left: 6px;">' + elapsedStr + '</span>' : trashSvg}
              </button>
            </div>
          ` : ''}
        </div>
      `)
      .addTo(mapRef.current);

    popupRef.current = popup;

    // Add delete handler if super admin
    if (isSuperAdmin && onDeletePoint) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        setTimeout(() => {
          const deleteBtn = document.getElementById(deleteButtonId);
          if (deleteBtn) {
            deleteBtn.addEventListener('click', async (e) => {
              e.stopPropagation();
              e.preventDefault();
              if (confirm(`Are you sure you want to delete "${selectedPoint.name}"? This action cannot be undone.`)) {
                try {
                  await onDeletePoint(pointId);
                  // Clean up popup after successful deletion
                  if (popupRef.current) {
                    popupRef.current.remove();
                    popupRef.current = null;
                  }
                  onClosePopup();
                } catch (error) {
                  // Show user-friendly error message
                  const errorMessage = error instanceof Error 
                    ? error.message 
                    : 'Unknown error occurred';
                  alert(`Failed to delete service point: ${errorMessage}\n\nPlease try again or check your internet connection.`);
                  console.error("Delete error details:", error);
                }
              }
            });
          }
        }, 50);
      });
    }

    popupRef.current = popup;

    return () => {
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
    };
  }, [selectedPoint, isSuperAdmin, onDeletePoint, onClosePopup, deletingPointId, deleteElapsed, deleteStartTime]);

  return (
    <div className={`relative rounded-lg border border-gray-200 bg-white overflow-hidden shadow-sm ${className}`} style={{ height: '100%', width: '100%', maxHeight: '500px', maxWidth: '500px' }}>
      {/* Host remains mounted; persistent Mapbox container is attached inside it */}
      <div ref={containerRefCallback} style={{ width: '100%', height: '100%', position: 'relative' }} />
      
      {/* Show loading overlay */}
      {!isLoaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-90 z-10">
          <div className="text-center">
            <p className="text-gray-500">Loading map...</p>
            <p className="text-gray-400 text-xs mt-2">Initializing Mapbox</p>
          </div>
        </div>
      )}
      
      {/* Show error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-50 bg-opacity-90 z-10">
          <div className="text-center p-4">
            <p className="text-red-600 font-semibold">Error: {error}</p>
            <p className="text-red-500 text-sm mt-2">
              {mapboxToken ? 'Mapbox token is configured' : 'Mapbox token not configured'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Memoize MapComponent to prevent unnecessary re-renders
export const MapComponent = memo(MapComponentInner, (prevProps: MapComponentProps, nextProps: MapComponentProps) => {
  // Only re-render if these props change
  return (
    prevProps.servicePoints.length === nextProps.servicePoints.length &&
    prevProps.servicePoints.every((p: ServicePoint, i: number) => 
      p.id === nextProps.servicePoints[i]?.id &&
      p.latitude === nextProps.servicePoints[i]?.latitude &&
      p.longitude === nextProps.servicePoints[i]?.longitude
    ) &&
    prevProps.selectedPoint?.id === nextProps.selectedPoint?.id &&
    prevProps.mapboxToken === nextProps.mapboxToken &&
    prevProps.isSuperAdmin === nextProps.isSuperAdmin &&
    prevProps.className === nextProps.className
  );
});
