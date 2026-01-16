"use client";

import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icons in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/leaflet/images/marker-icon-2x.png',
  iconUrl: '/leaflet/images/marker-icon.png',
  shadowUrl: '/leaflet/images/marker-shadow.png',
});

interface MapComponentProps {
  initialCenter: { lat: number | null; lng: number | null };
  onPinConfirm: (lat: number, lng: number) => void;
  showControls?: boolean;
}

// Custom red marker icon for draggable pin
const createCustomIcon = (color = '#e74c3c') => {
  return new L.DivIcon({
    html: `
      <div style="position: relative;">
        <svg width="40" height="40" viewBox="0 0 24 24">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="${color}"/>
          <circle cx="12" cy="9" r="3" fill="white"/>
          <circle cx="12" cy="9" r="1.5" fill="${color}"/>
        </svg>
        <div style="position: absolute; bottom: -5px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent; border-top: 10px solid ${color};"></div>
      </div>
    `,
    className: 'custom-marker',
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40],
  });
};

const LocationMarker = ({ onPinConfirm }: { onPinConfirm: (lat: number, lng: number) => void }) => {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [draggable, setDraggable] = useState(true);
  
  const map = useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
      onPinConfirm(e.latlng.lat, e.latlng.lng);
      map.flyTo(e.latlng, map.getZoom());
    },
    locationfound(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
      map.flyTo(e.latlng, map.getZoom());
    },
  });

  const markerRef = useRef<L.Marker>(null);
  
  const eventHandlers = {
    dragend() {
      const marker = markerRef.current;
      if (marker) {
        const latlng = marker.getLatLng();
        setPosition([latlng.lat, latlng.lng]);
        onPinConfirm(latlng.lat, latlng.lng);
      }
    },
  };

  // Initialize position from props or map center
  useEffect(() => {
    if (!position && map) {
      const center = map.getCenter();
      setPosition([center.lat, center.lng]);
      onPinConfirm(center.lat, center.lng);
    }
  }, [map]);

  return position === null ? null : (
    <Marker
      draggable={draggable}
      eventHandlers={eventHandlers}
      position={position}
      ref={markerRef}
      icon={createCustomIcon()}
    />
  );
};

export default function MapComponent({ initialCenter, onPinConfirm, showControls = true }: MapComponentProps) {
  const [mapCenter, setMapCenter] = useState<[number, number]>([20.5937, 78.9629]); // Default to India center
  const [zoom, setZoom] = useState(15);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    
    if (initialCenter.lat && initialCenter.lng) {
      setMapCenter([initialCenter.lat, initialCenter.lng]);
    } else {
      // Try to get user's location
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setMapCenter([position.coords.latitude, position.coords.longitude]);
          },
          () => {
            console.log('Unable to retrieve your location');
          }
        );
      }
    }
  }, [initialCenter]);

  if (!isClient) {
    return <div className="w-full h-full bg-gray-200 animate-pulse"></div>;
  }

  return (
    <div className="w-full h-full relative">
      <MapContainer
        center={mapCenter}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
        zoomControl={showControls}
        attributionControl={showControls}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LocationMarker onPinConfirm={onPinConfirm} />
      </MapContainer>
      
      {showControls && (
        <div className="absolute top-4 right-4 z-[1000] bg-white p-4 rounded-lg shadow-lg">
          <div className="text-sm font-medium text-gray-700 mb-2">Instructions:</div>
          <ul className="text-xs text-gray-600 space-y-1">
            <li className="flex items-center">
              <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
              <span>Drag red pin to adjust location</span>
            </li>
            <li className="flex items-center">
              <div className="w-3 h-3 bg-blue-500 rounded-full mr-2"></div>
              <span>Click anywhere to place pin</span>
            </li>
            <li className="flex items-center">
              <svg className="w-3 h-3 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd" />
              </svg>
              <span>Scroll to zoom in/out</span>
            </li>
            <li className="flex items-center">
              <svg className="w-3 h-3 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
              <span>Drag map to navigate</span>
            </li>
          </ul>
        </div>
      )}
      
      <style jsx global>{`
        .leaflet-marker-draggable {
          cursor: move !important;
        }
        .custom-marker {
          background: transparent !important;
          border: none !important;
        }
        .leaflet-container {
          font-family: inherit;
        }
      `}</style>
    </div>
  );
}