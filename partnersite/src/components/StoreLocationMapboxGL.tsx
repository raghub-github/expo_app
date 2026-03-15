'use client';

import { forwardRef, useImperativeHandle, useRef, useEffect, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

export interface StoreLocationMapboxGLRef {
  flyTo: (opts: { center: [number, number]; zoom: number; duration?: number }) => void;
}

interface StoreLocationMapboxGLProps {
  latitude: number | null;
  longitude: number | null;
  mapboxToken: string;
  onLocationChange: (lat: number, lng: number) => void;
  onMapClick: (e: { lngLat: { lat: number; lng: number } }) => void;
}

const StoreLocationMapboxGL = forwardRef<StoreLocationMapboxGLRef, StoreLocationMapboxGLProps>(
  function StoreLocationMapboxGL({ latitude, longitude, mapboxToken, onLocationChange, onMapClick }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const markerRef = useRef<mapboxgl.Marker | null>(null);

    // Initialize map (no GeolocateControl — parent uses browser geolocation so only the red marker shows)
    useEffect(() => {
      if (!containerRef.current || !mapboxToken) return;

      mapboxgl.accessToken = mapboxToken;
      const center: [number, number] =
        latitude != null && longitude != null ? [longitude, latitude] : [78.9629, 20.5937];
      const zoom = latitude != null && longitude != null ? 14 : 4;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center,
        zoom,
        maxZoom: 22,
        minZoom: 2,
      });

      map.addControl(new mapboxgl.NavigationControl(), 'top-left');

      map.on('click', (e) => {
        const { lng, lat } = e.lngLat;
        onMapClick({ lngLat: { lat, lng } });
      });

      mapRef.current = map;

      return () => {
        markerRef.current?.remove();
        markerRef.current = null;
        map.remove();
        mapRef.current = null;
      };
    }, [mapboxToken]); // eslint-disable-line react-hooks/exhaustive-deps

    // Update marker when latitude/longitude change
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }

      if (latitude != null && longitude != null) {
        const el = document.createElement('div');
        el.className = 'store-location-marker-mapbox';
        el.style.cssText =
          'width:24px;height:24px;border-radius:50%;background:#EF4444;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);cursor:grab;';
        const marker = new mapboxgl.Marker({ element: el, draggable: true })
          .setLngLat([longitude, latitude])
          .addTo(map);
        marker.on('dragend', () => {
          const pos = marker.getLngLat();
          onLocationChange(pos.lat, pos.lng);
        });
        markerRef.current = marker;
      }
    }, [latitude, longitude, onLocationChange]);

    const flyTo = useCallback((opts: { center: [number, number]; zoom: number; duration?: number }) => {
      const map = mapRef.current;
      if (!map) return;
      const [lng, lat] = opts.center;
      map.flyTo({
        center: [lng, lat],
        zoom: opts.zoom,
        duration: (opts.duration ?? 1.4) * 1000,
      });
    }, []);

    useImperativeHandle(ref, () => ({ flyTo }), [flyTo]);

    return (
      <div
        ref={containerRef}
        className="h-full min-h-[300px] w-full rounded-lg overflow-hidden border border-slate-300 [&_.mapboxgl-ctrl-bottom-left]:hidden"
      />
    );
  }
);

export default StoreLocationMapboxGL;
