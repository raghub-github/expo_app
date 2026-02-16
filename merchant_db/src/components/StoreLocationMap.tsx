'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icon in Leaflet (works without public assets)
const createRedIcon = () =>
  new L.DivIcon({
    className: 'store-location-marker',
    html: `<div style="background:#EF4444;width:24px;height:24px;border-radius:50%;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

export interface StoreLocationMapRef {
  flyTo: (opts: { center: [number, number]; zoom: number; duration?: number }) => void;
}

type MapProvider = 'leaflet' | 'mapbox';

interface StoreLocationMapProps {
  latitude: number | null;
  longitude: number | null;
  mapboxToken?: string;
  provider?: MapProvider;
  onLocationChange: (lat: number, lng: number) => void;
  onMapClick: (e: { lngLat: { lat: number; lng: number } }) => void;
}

const StoreLocationMap = forwardRef<StoreLocationMapRef, StoreLocationMapProps>(
  function StoreLocationMap({ latitude, longitude, mapboxToken, provider = 'leaflet', onLocationChange, onMapClick }, ref) {
    const leafletMapRef = useRef<L.Map | null>(null);
    const isMapboxTiles = provider === 'mapbox' && !!mapboxToken;

    useImperativeHandle(ref, () => ({
      flyTo: (opts: { center: [number, number]; zoom: number; duration?: number }) => {
        const [lng, lat] = opts.center;
        leafletMapRef.current?.flyTo([lat, lng], opts.zoom, {
          animate: true,
          duration: opts.duration ?? 1.4,
        });
      },
    }), []);

    return (
      <div className="h-full min-h-[300px] w-full rounded-lg overflow-hidden border border-slate-300 [&_.leaflet-container]:h-full [&_.leaflet-container]:min-h-[300px]">
        <MapContainer
          center={[20.5937, 78.9629]}
          zoom={4}
          className="h-full w-full"
          ref={leafletMapRef}
          scrollWheelZoom
        >
          <TileLayer
            attribution={
              isMapboxTiles
                ? '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            }
            url={
              isMapboxTiles
                ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`
                : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
            }
            tileSize={isMapboxTiles ? 512 : 256}
            zoomOffset={isMapboxTiles ? -1 : 0}
          />
          <MapClickHandler onMapClick={onMapClick} />
          {latitude != null && longitude != null && (
            <Marker
              position={[latitude, longitude]}
              icon={createRedIcon()}
              eventHandlers={{
                dragend: (e) => {
                  const { lat, lng } = e.target.getLatLng();
                  onLocationChange(lat, lng);
                },
              }}
              draggable
            />
          )}
        </MapContainer>
      </div>
    );
  }
);

function MapClickHandler({ onMapClick }: { onMapClick: (e: { lngLat: { lat: number; lng: number } }) => void }) {
  useMapEvents({
    click: (e) => {
      onMapClick({ lngLat: { lat: e.latlng.lat, lng: e.latlng.lng } });
    },
  });
  return null;
}

export default StoreLocationMap;
