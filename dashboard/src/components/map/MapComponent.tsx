"use client";

import { useEffect, useState, useRef } from "react";
import { ServicePointMarker } from "./ServicePointMarker";
import { X } from "lucide-react";

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
}

export function MapComponent({
  servicePoints,
  onPointClick,
  selectedPoint,
  onClosePopup,
  mapboxToken,
  className = "",
  isSuperAdmin = false,
  onDeletePoint,
}: MapComponentProps) {
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
    log('MapComponent.tsx:76', 'Main useEffect started', { 
      hasContainer: !!mapContainer.current, 
      hasToken: !!mapboxToken,
      tokenLength: mapboxToken?.length || 0,
      tokenPrefix: mapboxToken?.substring(0, 5) || 'none',
      initAttempted: initAttemptedRef.current
    }, 'A');
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
      log('MapComponent.tsx:93', 'Init already attempted, skipping', {}, 'A');
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

    // Load mapbox-gl from CDN to bypass module resolution
    const loadMapbox = () => {
      try {
        // #region agent log
        log('MapComponent.tsx:117', 'loadMapbox called', { 
          scriptLoaded: scriptLoadedRef.current,
          hasMapboxgl: !!(window as any).mapboxgl
        }, 'A');
        // #endregion

        // Check if mapbox-gl is already loaded
        if ((window as any).mapboxgl) {
          // #region agent log
          log('MapComponent.tsx:125', 'Mapbox already available', {}, 'A');
          // #endregion
          initializeMap();
          return;
        }

        if (scriptLoadedRef.current) {
          // #region agent log
          log('MapComponent.tsx:132', 'Script already loading, waiting...', {}, 'A');
          // #endregion
          // Wait for script to load
          const checkScript = setInterval(() => {
            if ((window as any).mapboxgl) {
              clearInterval(checkScript);
              initializeMap();
            }
          }, 100);
          return;
        }

        scriptLoadedRef.current = true;

        // Load CSS (only if not already loaded)
        if (!document.querySelector('link[href*="mapbox-gl.css"]')) {
          const cssLink = document.createElement('link');
          cssLink.rel = 'stylesheet';
          cssLink.href = 'https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css';
          document.head.appendChild(cssLink);
          // #region agent log
          log('MapComponent.tsx:152', 'CSS link added', {}, 'A');
          // #endregion
        }

        // Load mapbox-gl script
        const script = document.createElement('script');
        script.src = 'https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.js';
        script.async = true;
        
        script.onload = () => {
          // #region agent log
          log('MapComponent.tsx:162', 'Script onload fired', { 
            mapboxgl: !!(window as any).mapboxgl,
            hasContainer: !!mapContainer.current 
          }, 'A');
          // #endregion
          if ((window as any).mapboxgl) {
            (window as any).mapboxgl.accessToken = mapboxToken;
            initializeMap();
          } else {
            // #region agent log
            log('MapComponent.tsx:171', 'Mapbox not available after load', {}, 'A');
            // #endregion
            scriptLoadedRef.current = false;
            setError('Mapbox library failed to initialize');
          }
        };

        script.onerror = (err) => {
          // #region agent log
          log('MapComponent.tsx:179', 'Script onerror fired', { error: String(err) }, 'A');
          // #endregion
          scriptLoadedRef.current = false;
          setError('Failed to load Mapbox library from CDN');
        };

        document.head.appendChild(script);
        // #region agent log
        log('MapComponent.tsx:187', 'Script element appended', { src: script.src }, 'A');
        // #endregion
      } catch (err) {
        // #region agent log
        log('MapComponent.tsx:191', 'loadMapbox exception', { error: String(err) }, 'A');
        // #endregion
        scriptLoadedRef.current = false;
        setError(err instanceof Error ? err.message : 'Failed to load map');
      }
    };

    const initializeMap = () => {
      try {
        // #region agent log
        log('MapComponent.tsx:201', 'initializeMap called', { 
          hasMapboxgl: !!(window as any).mapboxgl,
          hasContainer: !!mapContainer.current,
          containerHeight: mapContainer.current?.offsetHeight || 0,
          containerWidth: mapContainer.current?.offsetWidth || 0
        }, 'A');
        // #endregion

        const mapboxgl = (window as any).mapboxgl;
        if (!mapboxgl) {
          // #region agent log
          log('MapComponent.tsx:211', 'No mapboxgl object', {}, 'A');
          // #endregion
          setError('Mapbox library not available');
          return;
        }

        if (!mapContainer.current) {
          // #region agent log
          log('MapComponent.tsx:219', 'No container element', {}, 'A');
          // #endregion
          setError('Map container not found');
          return;
        }

        // Check if map already exists
        if (mapRef.current) {
          // #region agent log
          log('MapComponent.tsx:228', 'Map already exists, removing', {}, 'A');
          // #endregion
          mapRef.current.remove();
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

        const map = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [viewState.longitude, viewState.latitude],
          zoom: viewState.zoom,
          accessToken: mapboxToken,
        });

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
          updateMarkers();
        });

        map.on('error', (e: any) => {
          // #region agent log
          log('MapComponent.tsx:257', 'Map error event', { 
            error: String(e.error?.message || e),
            errorType: e.error?.type || 'unknown'
          }, 'A');
          // #endregion
          setError(`Map error: ${e.error?.message || String(e)}`);
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
        el.style.width = '40px';
        el.style.height = '40px';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        
        // #region agent log
        log('MapComponent.tsx:365', 'Creating marker element', {
          elementWidth: el.style.width,
          elementHeight: el.style.height,
          pointId: point.id,
          pointName: point.name,
          expectedSize: '52px'
        }, 'C');
        // #endregion
        
        // Create marker with logo - 40px size, no border
        const marker = new mapboxgl.Marker({
          element: el,
          anchor: 'center'
        })
          .setLngLat([point.longitude, point.latitude])
          .addTo(mapRef.current);

        // Render ServicePointMarker into the element - 40px size, no border
        const img = document.createElement('img');
        img.src = '/onlylogo.png';
        img.alt = 'GatiMitra';
        img.style.width = '40px';
        img.style.height = '40px';
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
            expectedSize: '52px'
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
      if (timer) clearTimeout(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
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
        el.style.width = '52px';
        el.style.height = '52px';
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
        img.style.width = '52px';
        img.style.height = '52px';
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
                style="width: 100%; padding: 8px 12px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; transition: background 0.2s;"
                onmouseover="this.style.background='#dc2626'"
                onmouseout="this.style.background='#ef4444'"
              >
                🗑️ Delete Service Point
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
  }, [selectedPoint, isSuperAdmin, onDeletePoint, onClosePopup]);

  return (
    <div className={`relative rounded-lg border border-gray-200 bg-white overflow-hidden shadow-sm ${className}`} style={{ height: '100%', width: '100%', maxHeight: '380px', maxWidth: '500px' }}>
      {/* Always render container div so ref can attach */}
      <div ref={containerRefCallback} style={{ width: '100%', height: '100%', position: 'relative', maxHeight: '100%', maxWidth: '100%' }} />
      
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
            <p className="text-red-500 text-sm mt-2">Token: {mapboxToken ? `${mapboxToken.substring(0, 10)}...` : 'Not set'}</p>
          </div>
        </div>
      )}
    </div>
  );
}
