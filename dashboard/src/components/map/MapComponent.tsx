"use client";

import { useEffect, useState, useRef, useMemo, useCallback, memo } from "react";
import { ServicePointMarker } from "./ServicePointMarker";
import { X } from "lucide-react";
import { mapCache } from "@/lib/map-cache";

// #region agent log
const LOG_ENDPOINT = 'http://127.0.0.1:7242/ingest/2cc0b640-978a-4fbb-81f9-cf64378f704f';
const log = (location: string, message: string, data: any, hypothesisId: string) => {
  fetch(LOG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location,
      message,
      data,
      timestamp: Date.now(),
      sessionId: 'debug-session',
      runId: 'run1',
      hypothesisId
    })
  }).catch(() => {});
};
// #endregion

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
}: MapComponentProps) {
  // #region agent log
  const componentMountTime = Date.now();
  fetch('http://127.0.0.1:7242/ingest/2cc0b640-978a-4fbb-81f9-cf64378f704f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MapComponent.tsx:47',message:'MapComponent mounted',data:{componentMountTime,servicePointsCount:servicePoints.length,hasToken:!!mapboxToken},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const markersRef = useRef<any[]>([]);
  const popupRef = useRef<any>(null);
  const scriptLoadedRef = useRef(false);
  const initAttemptedRef = useRef(false);
  const [containerReady, setContainerReady] = useState(false);

  const [viewState, setViewState] = useState({
    longitude: 78.0, // Adjusted center for better visual centering of India
    latitude: 22.0, // Adjusted center for better visual centering of India
    zoom: 3.0, // Better zoom level to show all of India
  });

  // Callback ref to detect when container is mounted
  const containerRefCallback = (node: HTMLDivElement | null) => {
    // #region agent log
    log('MapComponent.tsx:70', 'Container ref callback', { 
      hasNode: !!node,
      nodeHeight: node?.offsetHeight || 0,
      nodeWidth: node?.offsetWidth || 0,
      nodeStyleWidth: node?.style.width || 'none',
      nodeStyleHeight: node?.style.height || 'none',
      parentHeight: node?.parentElement?.offsetHeight || 0,
      parentWidth: node?.parentElement?.offsetWidth || 0
    }, 'A');
    // #endregion
    
    if (node) {
      mapContainer.current = node;
      setContainerReady(true);
      // #region agent log
      log('MapComponent.tsx:83', 'Container ref set, containerReady=true', {
        height: node.offsetHeight,
        width: node.offsetWidth,
        computedStyle: window.getComputedStyle(node).width + ' x ' + window.getComputedStyle(node).height
      }, 'A');
      // #endregion
    } else {
      mapContainer.current = null;
      setContainerReady(false);
    }
  };

  useEffect(() => {
    // #region agent log
    const effectStartTime = Date.now();
    const timeSinceMount = effectStartTime - componentMountTime;
    fetch('http://127.0.0.1:7242/ingest/2cc0b640-978a-4fbb-81f9-cf64378f704f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MapComponent.tsx:103',message:'Map init useEffect started',data:{timeSinceMount,hasContainer:!!mapContainer.current,hasToken:!!mapboxToken,initAttempted:initAttemptedRef.current,mapboxAlreadyLoaded:!!(window as any).mapboxgl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    if (!mapboxToken) {
      // #region agent log
      log('MapComponent.tsx:86', 'No mapbox token', {}, 'A');
      // #endregion
      setError('Mapbox token not provided');
      return;
    }

    if (initAttemptedRef.current) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/2cc0b640-978a-4fbb-81f9-cf64378f704f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MapComponent.tsx:122',message:'Init already attempted, skipping',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      return;
    }

    // Wait for container to be available
    const checkContainer = () => {
      // #region agent log
      log('MapComponent.tsx:101', 'Checking container', { 
        hasContainer: !!mapContainer.current,
        containerReady: containerReady,
        containerHeight: mapContainer.current?.offsetHeight || 0,
        containerWidth: mapContainer.current?.offsetWidth || 0,
        containerParent: mapContainer.current?.parentElement?.tagName || 'none'
      }, 'A');
      // #endregion

      if (!mapContainer.current || !containerReady) {
        // #region agent log
        log('MapComponent.tsx:111', 'Container not ready, will retry', {
          hasContainer: !!mapContainer.current,
          containerReady
        }, 'A');
        // #endregion
        setTimeout(checkContainer, 100);
        return;
      }

      // Container is ready, proceed with initialization
      // #region agent log
      log('MapComponent.tsx:120', 'Container ready, starting loadMapbox', {
        containerHeight: mapContainer.current.offsetHeight,
        containerWidth: mapContainer.current.offsetWidth
      }, 'A');
      // #endregion
      initAttemptedRef.current = true;
      loadMapbox();
    };

    // Initialize map using global cache
    const loadMapbox = async () => {
      try {
        // #region agent log
        log('MapComponent.tsx:117', 'loadMapbox called', { 
          scriptLoaded: scriptLoadedRef.current,
          hasMapboxgl: !!(window as any).mapboxgl
        }, 'A');
        // #endregion

        // Check if mapbox-gl is already loaded
        if (mapCache.isScriptLoaded()) {
          // #region agent log
          const scriptReuseTime = Date.now();
          fetch('http://127.0.0.1:7242/ingest/2cc0b640-978a-4fbb-81f9-cf64378f704f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MapComponent.tsx:174',message:'Mapbox script reused (not reloaded)',data:{timeSinceMount:scriptReuseTime - componentMountTime},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          await initializeMap();
          return;
        }

        // Load script via cache manager
        await mapCache.loadMapboxScript();
        await initializeMap();
      } catch (err) {
        // #region agent log
        log('MapComponent.tsx:191', 'loadMapbox exception', { error: String(err) }, 'A');
        // #endregion
        scriptLoadedRef.current = false;
        setError(err instanceof Error ? err.message : 'Failed to load map');
      }
    };

    const initializeMap = async () => {
      try {
        // #region agent log
        log('MapComponent.tsx:201', 'initializeMap called', { 
          hasMapboxgl: !!(window as any).mapboxgl,
          hasContainer: !!mapContainer.current,
          containerHeight: mapContainer.current?.offsetHeight || 0,
          containerWidth: mapContainer.current?.offsetWidth || 0
        }, 'A');
        // #endregion

        if (!mapContainer.current) {
          // #region agent log
          log('MapComponent.tsx:219', 'No container element', {}, 'A');
          // #endregion
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
          // #region agent log
          log('MapComponent.tsx:211', 'No mapboxgl object', {}, 'A');
          // #endregion
          setError('Mapbox library not available');
          return;
        }

        // #region agent log
        log('MapComponent.tsx:281', 'Creating map with container dimensions', {
          containerHeight: mapContainer.current.offsetHeight,
          containerWidth: mapContainer.current.offsetWidth,
          containerStyleWidth: mapContainer.current.style.width,
          containerStyleHeight: mapContainer.current.style.height,
          containerMaxWidth: mapContainer.current.style.maxWidth,
          containerMaxHeight: mapContainer.current.style.maxHeight,
          parentHeight: mapContainer.current.parentElement?.offsetHeight || 0,
          parentWidth: mapContainer.current.parentElement?.offsetWidth || 0,
          parentMaxWidth: window.getComputedStyle(mapContainer.current.parentElement || document.body).maxWidth,
          computedMaxWidth: window.getComputedStyle(mapContainer.current).maxWidth
        }, 'B');
        // #endregion

        // #region agent log
        log('MapComponent.tsx:281', 'Setting map center and zoom', {
          centerLng: viewState.longitude,
          centerLat: viewState.latitude,
          zoom: viewState.zoom
        }, 'F');
        // #endregion

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
        // #region agent log
        log('MapComponent.tsx:295', 'Map instance created', { 
          mapId: (map as any)._id || 'unknown',
          container: mapContainer.current?.id || 'none',
          mapCanvasWidth: (map as any)._canvas?.width || 0,
          mapCanvasHeight: (map as any)._canvas?.height || 0
        }, 'B');
        // #endregion

        map.on('load', () => {
          // #region agent log
          const mapLoadTime = Date.now();
          const totalInitTime = mapLoadTime - componentMountTime;
          fetch('http://127.0.0.1:7242/ingest/2cc0b640-978a-4fbb-81f9-cf64378f704f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MapComponent.tsx:331',message:'Map loaded successfully',data:{totalInitTime,timeSinceMount:totalInitTime},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          const container = mapContainer.current;
          const parent = container?.parentElement;
          const grandParent = parent?.parentElement;
          log('MapComponent.tsx:297', 'Map load event fired - container fit check', {
            containerHeight: container?.offsetHeight || 0,
            containerWidth: container?.offsetWidth || 0,
            containerStyleMaxHeight: container?.style.maxHeight || 'none',
            containerStyleMaxWidth: container?.style.maxWidth || 'none',
            mapCanvasWidth: (map as any)._canvas?.width || 0,
            mapCanvasHeight: (map as any)._canvas?.height || 0,
            parentHeight: parent?.offsetHeight || 0,
            parentWidth: parent?.offsetWidth || 0,
            parentStyleMaxHeight: parent ? window.getComputedStyle(parent).maxHeight : 'none',
            parentStyleMaxWidth: parent ? window.getComputedStyle(parent).maxWidth : 'none',
            grandParentHeight: grandParent?.offsetHeight || 0,
            grandParentWidth: grandParent?.offsetWidth || 0,
            fitsInParent: container && parent ? (container.offsetHeight <= parent.offsetHeight && container.offsetWidth <= parent.offsetWidth) : false
          }, 'E');
          // #endregion
          setIsLoaded(true);
          // Clear any previous errors when map loads successfully
          setError(null);
          updateMarkers();
        });

        map.on('error', (e: any) => {
          // #region agent log
          log('MapComponent.tsx:257', 'Map error event', { 
            error: String(e.error?.message || e),
            errorType: e.error?.type || 'unknown'
          }, 'A');
          // #endregion
          
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
        // #region agent log
        log('MapComponent.tsx:276', 'initializeMap exception', { 
          error: String(err),
          errorName: (err as Error)?.name || 'unknown'
        }, 'A');
        // #endregion
        setError(err instanceof Error ? err.message : 'Failed to initialize map');
      }
    };

    const updateMarkers = () => {
      if (!mapRef.current) {
        // #region agent log
        log('MapComponent.tsx:288', 'updateMarkers: no map ref', {}, 'A');
        // #endregion
        return;
      }

      // Clear existing markers
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];

      // #region agent log
      log('MapComponent.tsx:297', 'Updating markers', { count: servicePoints.length }, 'A');
      // #endregion

      const mapboxgl = (window as any).mapboxgl;
      if (!mapboxgl) return;

      servicePoints.forEach((point) => {
        // #region agent log
        log('MapComponent.tsx:355', 'Creating marker for point', { 
          pointId: point.id, 
          name: point.name, 
          lat: point.latitude, 
          lng: point.longitude 
        }, 'A');
        // #endregion

        const el = document.createElement('div');
        el.className = 'map-marker-container';
        el.style.cursor = 'pointer';
        el.style.width = '24px';
        el.style.height = '24px';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        
        // #region agent log
        log('MapComponent.tsx:365', 'Creating marker element', {
          elementWidth: el.style.width,
          elementHeight: el.style.height,
          pointId: point.id,
          pointName: point.name,
          expectedSize: '24px'
        }, 'C');
        // #endregion
        
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
        
        // #region agent log
        img.onload = () => {
          log('MapComponent.tsx:390', 'Marker image loaded', {
            imgWidth: img.offsetWidth,
            imgHeight: img.offsetHeight,
            imgNaturalWidth: img.naturalWidth,
            imgNaturalHeight: img.naturalHeight,
            computedWidth: window.getComputedStyle(img).width,
            computedHeight: window.getComputedStyle(img).height,
            elementWidth: el.offsetWidth,
            elementHeight: el.offsetHeight,
            expectedSize: '24px'
          }, 'C');
        };
        img.onerror = () => {
          log('MapComponent.tsx:400', 'Marker image failed to load', { src: img.src }, 'C');
        };
        // #endregion
        
        el.appendChild(img);

        el.addEventListener('click', () => onPointClick(point));
        markersRef.current.push(marker);
        
        // #region agent log
        log('MapComponent.tsx:377', 'Marker created and added', { 
          pointId: point.id,
          markerCount: markersRef.current.length
        }, 'A');
        // #endregion
      });

      // #region agent log
      log('MapComponent.tsx:327', 'Markers updated', { markerCount: markersRef.current.length }, 'A');
      // #endregion
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
      // #region agent log
      const cleanupTime = Date.now();
      const componentLifetime = cleanupTime - componentMountTime;
      fetch('http://127.0.0.1:7242/ingest/2cc0b640-978a-4fbb-81f9-cf64378f704f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MapComponent.tsx:498',message:'MapComponent cleanup (unmounting)',data:{componentLifetime,wasLoaded:isLoaded,initAttempted:initAttemptedRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      if (timer) clearTimeout(timer);
      // Don't remove map instance - let it be cached for reuse
      // Only clear markers and refs
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      mapRef.current = null;
      initAttemptedRef.current = false;
    };
  }, [mapboxToken, containerReady]);

  // Update markers when service points change
  useEffect(() => {
    // #region agent log
    log('MapComponent.tsx:406', 'Service points useEffect triggered', { 
      isLoaded, 
      hasMapRef: !!mapRef.current, 
      servicePointsCount: servicePoints.length 
    }, 'A');
    // #endregion

    if (isLoaded && mapRef.current) {
      const mapboxgl = (window as any).mapboxgl;
      if (!mapboxgl) {
        // #region agent log
        log('MapComponent.tsx:414', 'Mapboxgl not available', {}, 'A');
        // #endregion
        return;
      }

      // #region agent log
      log('MapComponent.tsx:420', 'Clearing existing markers', { 
        currentMarkerCount: markersRef.current.length 
      }, 'A');
      // #endregion

      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];

      // #region agent log
      log('MapComponent.tsx:428', 'Creating new markers', { 
        servicePointsCount: servicePoints.length 
      }, 'A');
      // #endregion

      servicePoints.forEach((point) => {
        // #region agent log
        log('MapComponent.tsx:432', 'Creating marker in useEffect', { 
          pointId: point.id, 
          name: point.name, 
          lat: point.latitude, 
          lng: point.longitude 
        }, 'A');
        // #endregion

        const el = document.createElement('div');
        el.className = 'map-marker-container';
        el.style.cursor = 'pointer';
        el.style.width = '24px';
        el.style.height = '24px';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        
        // #region agent log
        log('MapComponent.tsx:473', 'Creating marker in useEffect', {
          elementWidth: el.style.width,
          elementHeight: el.style.height,
          pointId: point.id,
          pointName: point.name
        }, 'D');
        // #endregion
        
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
        
        // #region agent log
        img.onload = () => {
          log('MapComponent.tsx:495', 'Marker image loaded in useEffect', {
            imgWidth: img.offsetWidth,
            imgHeight: img.offsetHeight,
            computedWidth: window.getComputedStyle(img).width,
            computedHeight: window.getComputedStyle(img).height
          }, 'D');
        };
        // #endregion
        
        el.appendChild(img);
        el.addEventListener('click', () => onPointClick(point));
        markersRef.current.push(marker);
      });

      // #region agent log
      log('MapComponent.tsx:456', 'Markers created in useEffect', { 
        finalMarkerCount: markersRef.current.length 
      }, 'A');
      // #endregion
    }
  }, [servicePoints, isLoaded, onPointClick]);

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
    
    const popup = new mapboxgl.Popup({ closeOnClick: false })
      .setLngLat([selectedPoint.longitude, selectedPoint.latitude])
      .setHTML(`
        <div style="padding: 12px; min-width: 220px;">
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
              >
                ${isDeleting ? '<svg style="width: 14px; height: 14px; animation: spin 1s linear infinite;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" fill-opacity="0.75"></path></svg><style>@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }</style>' : '🗑️'} ${isDeleting ? 'Deleting...' : 'Delete Service Point'}
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
                  if (popupRef.current) {
                    popupRef.current.remove();
                  }
                  onClosePopup();
                } catch (error) {
                  alert(`Failed to delete service point: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
  }, [selectedPoint, isSuperAdmin, onDeletePoint, onClosePopup, deletingPointId]);

  return (
    <div className={`relative rounded-lg border border-gray-200 bg-white overflow-hidden shadow-sm ${className}`} style={{ height: '100%', width: '100%', maxHeight: '380px', maxWidth: '380px' }}>
      {/* Always render container div so ref can attach */}
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
