/** Shared pulsing geofence circles for pickup / drop highlights. */
export function mapboxPickupZoneScript(): string {
  return `
      var pickupZoneReady = false;
      var dropZoneReady = false;
      var pulsePhase = 0;
      var zoneAnimFrame = null;
      var geofenceCameraActive = false;
      var lastGeofenceFitKey = '';

      /**
       * Fit the full geofence circle into the visible map with UI padding.
       * Sets geofenceCameraActive so rider-follow does not fight this framing.
       */
      window.fitToGeofence = function(lat, lng, radiusM, padding, opts) {
        if (lat == null || lng == null || !map) return;
        var r = Math.max(Number(radiusM) || 200, 120);
        var pad = padding || { top: 56, bottom: 40, left: 40, right: 56 };
        var force = !!(opts && opts.force);
        var key = [
          Number(lat).toFixed(5),
          Number(lng).toFixed(5),
          Math.round(r),
          pad.top, pad.right, pad.bottom, pad.left
        ].join('|');
        if (!force && key === lastGeofenceFitKey && geofenceCameraActive) return;
        lastGeofenceFitKey = key;
        geofenceCameraActive = true;
        if (typeof followRider !== 'undefined') followRider = true;

        var latRad = lat * Math.PI / 180;
        // Slightly oversize so stroke/pulse never kisses the viewport edge.
        var meters = r * 1.28;
        var latOffset = (meters / 6378137) * (180 / Math.PI);
        var lngOffset = latOffset / Math.max(0.35, Math.cos(latRad));
        var bounds = new mapboxgl.LngLatBounds(
          [lng - lngOffset, lat - latOffset],
          [lng + lngOffset, lat + latOffset]
        );
        try {
          map.fitBounds(bounds, {
            padding: pad,
            duration: (opts && opts.duration) || 750,
            maxZoom: (opts && opts.maxZoom) || 16.4,
            essential: true
          });
        } catch (e) {}
      };

      window.clearGeofenceCamera = function() {
        geofenceCameraActive = false;
        lastGeofenceFitKey = '';
      };

      window.isGeofenceCameraActive = function() {
        return !!geofenceCameraActive;
      };

      function circlePolygon(lng, lat, radiusM, steps) {
        var coords = [];
        var dist = radiusM / 6378137;
        for (var i = 0; i <= (steps || 64); i++) {
          var bearing = (i / (steps || 64)) * 2 * Math.PI;
          var latRad = lat * Math.PI / 180;
          var lngRad = lng * Math.PI / 180;
          var pLat = Math.asin(
            Math.sin(latRad) * Math.cos(dist) +
            Math.cos(latRad) * Math.sin(dist) * Math.cos(bearing)
          );
          var pLng =
            lngRad +
            Math.atan2(
              Math.sin(bearing) * Math.sin(dist) * Math.cos(latRad),
              Math.cos(dist) - Math.sin(latRad) * Math.sin(pLat)
            );
          coords.push([pLng * 180 / Math.PI, pLat * 180 / Math.PI]);
        }
        return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] } };
      }

      function ensurePickupZoneLayers() {
        if (map.getSource('ride-pickup-zone')) return;
        map.addSource('ride-pickup-zone', {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] } }
        });
        map.addLayer({
          id: 'ride-pickup-zone-fill',
          type: 'fill',
          source: 'ride-pickup-zone',
          paint: { 'fill-color': '#22C55E', 'fill-opacity': 0.14 }
        });
        map.addLayer({
          id: 'ride-pickup-zone-stroke',
          type: 'line',
          source: 'ride-pickup-zone',
          paint: { 'line-color': '#22C55E', 'line-opacity': 0.35, 'line-width': 1.5 }
        });
        pickupZoneReady = true;
      }

      function zoneTick() {
        pulsePhase += 0.06;
        var src = map.getSource('ride-pickup-zone');
        if (src && map.getLayoutProperty('ride-pickup-zone-fill', 'visibility') === 'visible') {
          var fillOp = 0.14 + Math.sin(pulsePhase) * 0.08;
          map.setPaintProperty('ride-pickup-zone-fill', 'fill-opacity', fillOp);
        }
        var dropSrc = map.getSource('ride-drop-zone');
        if (dropSrc && map.getLayoutProperty('ride-drop-zone-fill', 'visibility') === 'visible') {
          var dropOp = 0.18 + Math.sin(pulsePhase) * 0.12;
          var dropStroke = 0.42 + Math.sin(pulsePhase + 0.6) * 0.18;
          map.setPaintProperty('ride-drop-zone-fill', 'fill-opacity', dropOp);
          map.setPaintProperty('ride-drop-zone-stroke', 'line-opacity', dropStroke);
        }
        zoneAnimFrame = requestAnimationFrame(zoneTick);
      }

      function startZonePulse() {
        if (zoneAnimFrame != null) return;
        zoneAnimFrame = requestAnimationFrame(zoneTick);
      }

      window.updatePickupZoneHighlight = function(lat, lng, visible, radiusM) {
        ensurePickupZoneLayers();
        var src = map.getSource('ride-pickup-zone');
        if (!src) return;
        if (!visible || lat == null || lng == null) {
          src.setData({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] } });
          map.setLayoutProperty('ride-pickup-zone-fill', 'visibility', 'none');
          map.setLayoutProperty('ride-pickup-zone-stroke', 'visibility', 'none');
          return;
        }
        src.setData(circlePolygon(lng, lat, radiusM || 200, 64));
        map.setLayoutProperty('ride-pickup-zone-fill', 'visibility', 'visible');
        map.setLayoutProperty('ride-pickup-zone-stroke', 'visibility', 'visible');
        startZonePulse();
      };

      function ensureDropZoneLayers() {
        if (map.getSource('ride-drop-zone')) return;
        map.addSource('ride-drop-zone', {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] } }
        });
        map.addLayer({
          id: 'ride-drop-zone-fill',
          type: 'fill',
          source: 'ride-drop-zone',
          paint: { 'fill-color': '#1A73E8', 'fill-opacity': 0.16 }
        });
        map.addLayer({
          id: 'ride-drop-zone-stroke',
          type: 'line',
          source: 'ride-drop-zone',
          paint: { 'line-color': '#1A73E8', 'line-opacity': 0.45, 'line-width': 2 }
        });
        dropZoneReady = true;
      }

      window.updateDropZoneHighlight = function(lat, lng, visible, radiusM) {
        ensureDropZoneLayers();
        var src = map.getSource('ride-drop-zone');
        if (!src) return;
        if (!visible || lat == null || lng == null) {
          src.setData({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] } });
          map.setLayoutProperty('ride-drop-zone-fill', 'visibility', 'none');
          map.setLayoutProperty('ride-drop-zone-stroke', 'visibility', 'none');
          return;
        }
        src.setData(circlePolygon(lng, lat, radiusM || 200, 64));
        map.setLayoutProperty('ride-drop-zone-fill', 'visibility', 'visible');
        map.setLayoutProperty('ride-drop-zone-stroke', 'visibility', 'visible');
        startZonePulse();
      };
  `;
}
