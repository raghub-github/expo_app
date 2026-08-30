import {
  liveRiderDotMarkerHtml,
  NAV_JOIN_DOT_COLOR,
  NAV_OFF_ROUTE_CONNECTOR,
  NAV_ROUTE_BLUE,
  NAV_ROUTE_CASING,
  NAV_ROUTE_CASING_WIDTH,
  NAV_ROUTE_GLOW,
  NAV_ROUTE_GLOW_WIDTH,
  NAV_ROUTE_WIDTH,
} from "@gatimitra/map-tracking-engine";

/** Mapbox GL JS — food delivery map (rider-app parity: remaining route + dashed connector). */

export function mapboxFoodDeliveryScript(_bikeUri: string): string {
  const riderDotHtml = liveRiderDotMarkerHtml().replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  return `
      var markers = { pickup: null, drop: null, rider: null };
      var pickupZoneReady = false;
      var dropZoneReady = false;
      var pulsePhase = 0;
      var animFrame = null;
      var riderAnimFrame = null;
      var followRider = true;
      var geofenceCameraActive = false;
      var ROUTE_BLUE = '${NAV_ROUTE_BLUE}';
      var ROUTE_CONNECTOR = '${NAV_OFF_ROUTE_CONNECTOR}';
      var ROUTE_CASING = '${NAV_ROUTE_CASING}';

      var state = {
        pickupLat: null,
        pickupLng: null,
        dropLat: null,
        dropLng: null,
        highlightPickupZone: false,
        highlightDropZone: false,
        riderArrived: false,
        hideRouteLine: false,
        geofenceRadiusM: 200,
        geofenceProximityM: 500,
        refitCamera: false,
        mapPhase: 'rider_to_pickup',
        initialFitDone: false,
        mapPadding: { top: 48, bottom: 40, left: 28, right: 28 },
        wasPreRider: false,
      };

      function toRad(d) { return d * Math.PI / 180; }

      function haversineM(lat1, lng1, lat2, lng2) {
        var R = 6378137;
        var dLat = toRad(lat2 - lat1);
        var dLng = toRad(lng2 - lng1);
        var a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      }

      function pinHtml(kind) {
        if (kind === 'pickup') {
          return (
            '<div style="display:flex;flex-direction:column;align-items:center;">' +
            '<div style="width:34px;height:34px;border-radius:17px;background:#059669;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(5,150,105,0.45);border:2.5px solid #fff;">' +
            '<div style="width:22px;height:22px;border-radius:11px;background:#1C1C1C;display:flex;align-items:center;justify-content:center;">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="#fff"><path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2h-2v4z"/></svg>' +
            '</div></div>' +
            '<div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid #059669;margin-top:-1px;"></div>' +
            '</div>'
          );
        }
        return (
          '<div style="display:flex;flex-direction:column;align-items:center;">' +
          '<div style="width:34px;height:34px;border-radius:17px;background:#1C1C1C;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.28);border:2.5px solid #fff;">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>' +
          '</div>' +
          '<div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid #1C1C1C;margin-top:-1px;"></div>' +
          '</div>'
        );
      }

      function setPin(key, lat, lng, kind) {
        if (lat == null || lng == null) {
          if (markers[key]) { try { markers[key].remove(); } catch (e) {} markers[key] = null; }
          return;
        }
        if (!markers[key]) {
          var el = document.createElement('div');
          el.style.cssText = 'pointer-events:none;';
          el.innerHTML = pinHtml(kind);
          markers[key] = new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map);
        } else {
          markers[key].setLngLat([lng, lat]);
        }
      }

      function setRiderMarker(lat, lng, heading) {
        if (lat == null || lng == null) {
          if (riderAnimFrame) { cancelAnimationFrame(riderAnimFrame); riderAnimFrame = null; }
          if (markers.rider) { try { markers.rider.remove(); } catch (e) {} markers.rider = null; }
          return;
        }

        function easeOutCubic(t) { return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3); }

        if (!markers.rider) {
          var el = document.createElement('div');
          el.style.cssText = 'pointer-events:none;';
          el.innerHTML = '${riderDotHtml}';
          markers.rider = new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map);
          return;
        }

        var start = markers.rider.getLngLat();
        var fromLng = start.lng;
        var fromLat = start.lat;
        var jumpM = haversineM(fromLat, fromLng, lat, lng);
        if (jumpM < 0.4 || jumpM < 1.5) return;
        if (jumpM > 120) {
          if (riderAnimFrame) { cancelAnimationFrame(riderAnimFrame); riderAnimFrame = null; }
          markers.rider.setLngLat([lng, lat]);
          if (followRider && !state.refitCamera && !(typeof window.isGeofenceCameraActive === 'function' && window.isGeofenceCameraActive())) {
            try { map.easeTo({ center: [lng, lat], duration: 450, essential: true }); } catch (e) {}
          }
          return;
        }

        if (riderAnimFrame) { cancelAnimationFrame(riderAnimFrame); riderAnimFrame = null; }
        var t0 = performance.now();
        var dur = Math.min(850, Math.max(240, jumpM * 22));
        function step(now) {
          var t = Math.min(1, (now - t0) / dur);
          var eased = easeOutCubic(t);
          var latN = fromLat + (lat - fromLat) * eased;
          var lngN = fromLng + (lng - fromLng) * eased;
          if (markers.rider) markers.rider.setLngLat([lngN, latN]);
          if (t < 1) {
            riderAnimFrame = requestAnimationFrame(step);
          } else {
            riderAnimFrame = null;
            if (followRider && !state.refitCamera && !(typeof window.isGeofenceCameraActive === 'function' && window.isGeofenceCameraActive())) {
              try { map.easeTo({ center: [lng, lat], duration: 280, essential: true }); } catch (e) {}
            }
          }
        }
        riderAnimFrame = requestAnimationFrame(step);
      }

      map.on('dragstart', function() { followRider = false; });
      map.on('zoomstart', function(e) {
        if (e && e.originalEvent) followRider = false;
      });
      window.recenterOnRider = function() {
        followRider = true;
        if (typeof window.isGeofenceCameraActive === 'function' && window.isGeofenceCameraActive()) {
          return;
        }
        if (markers.rider) {
          var ll = markers.rider.getLngLat();
          try { map.easeTo({ center: [ll.lng, ll.lat], duration: 450, essential: true }); } catch (e) {}
        }
      };

      function ensureLineLayer(sourceId, layerId, paint, layout) {
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } }
          });
        }
        if (!map.getLayer(layerId)) {
          map.addLayer({
            id: layerId,
            type: 'line',
            source: sourceId,
            layout: layout || { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
            paint: paint
          });
        }
      }

      function ensureRouteLayers() {
        ensureLineLayer('route-remaining', 'route-remaining-glow', {
          'line-color': '${NAV_ROUTE_GLOW}',
          'line-width': ${NAV_ROUTE_GLOW_WIDTH},
          'line-opacity': 0.65,
          'line-blur': 2
        });
        ensureLineLayer('route-remaining', 'route-remaining-casing', {
          'line-color': ROUTE_CASING,
          'line-width': ${NAV_ROUTE_CASING_WIDTH},
          'line-opacity': 1
        });
        ensureLineLayer('route-remaining', 'route-remaining-line', {
          'line-color': ROUTE_BLUE,
          'line-width': ${NAV_ROUTE_WIDTH},
          'line-opacity': 1
        }, { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' });

        ensureLineLayer('route-connector', 'route-connector-casing', {
          'line-color': '#ffffff',
          'line-width': 7,
          'line-opacity': 0.92,
          'line-dasharray': [2, 2]
        });
        ensureLineLayer('route-connector', 'route-connector-line', {
          'line-color': ROUTE_CONNECTOR,
          'line-width': 5,
          'line-opacity': 1,
          'line-dasharray': [2, 2]
        }, { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' });

        ensureLineLayer('route-pre-rider', 'route-pre-rider-line', {
          'line-color': '#1C1C1C',
          'line-width': 3,
          'line-opacity': 0.9,
          'line-dasharray': [2, 2]
        }, { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' });

        if (!map.getSource('route-join')) {
          map.addSource('route-join', {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'Point', coordinates: [] } }
          });
          map.addLayer({
            id: 'route-join-dot',
            type: 'circle',
            source: 'route-join',
            paint: {
              'circle-radius': 7,
              'circle-color': '${NAV_JOIN_DOT_COLOR}',
              'circle-opacity': 0.72,
              'circle-stroke-width': 2.5,
              'circle-stroke-color': '#ffffff'
            },
            layout: { visibility: 'none' }
          });
        }
      }

      function setLineData(sourceId, coords, layerIds) {
        var src = map.getSource(sourceId);
        if (!src) return;
        if (!coords || coords.length < 2) {
          src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] } });
          layerIds.forEach(function(id) {
            if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
          });
          return;
        }
        var line = coords.map(function(c) { return [c.longitude, c.latitude]; });
        src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: line } });
        layerIds.forEach(function(id) {
          if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
        });
      }

      function setJoinDot(lat, lng, visible) {
        var src = map.getSource('route-join');
        if (!src) return;
        if (!visible || lat == null || lng == null) {
          map.setLayoutProperty('route-join-dot', 'visibility', 'none');
          return;
        }
        src.setData({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] } });
        map.setLayoutProperty('route-join-dot', 'visibility', 'visible');
      }

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

      function ensureZoneLayers(sourceId, fillId, strokeId) {
        if (map.getSource(sourceId)) return;
        map.addSource(sourceId, {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] } }
        });
        map.addLayer({ id: fillId, type: 'fill', source: sourceId, paint: { 'fill-color': '#22C55E', 'fill-opacity': 0.14 } });
        map.addLayer({ id: strokeId, type: 'line', source: sourceId, paint: { 'line-color': '#22C55E', 'line-opacity': 0.35, 'line-width': 1.5 } });
      }

      function updateZone(sourceId, fillId, strokeId, lat, lng, visible, radiusM) {
        ensureZoneLayers(sourceId, fillId, strokeId);
        var src = map.getSource(sourceId);
        if (!src) return;
        if (!visible || lat == null || lng == null) {
          src.setData({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] } });
          map.setLayoutProperty(fillId, 'visibility', 'none');
          map.setLayoutProperty(strokeId, 'visibility', 'none');
          return;
        }
        src.setData(circlePolygon(lng, lat, radiusM || 200, 64));
        map.setLayoutProperty(fillId, 'visibility', 'visible');
        map.setLayoutProperty(strokeId, 'visibility', 'visible');
        var fillOp = 0.14 + Math.sin(pulsePhase) * 0.08;
        map.setPaintProperty(fillId, 'fill-opacity', fillOp);
      }

      function activeDestination() {
        if (state.mapPhase === 'rider_to_drop') {
          return { lat: state.dropLat, lng: state.dropLng };
        }
        return { lat: state.pickupLat, lng: state.pickupLng };
      }

      function fitMapToZoneCenter(lat, lng, radiusM) {
        if (lat == null || lng == null) return;
        var r = Math.max(radiusM || 200, 120);
        var latRad = lat * Math.PI / 180;
        var meters = r * 1.28;
        var latOffset = (meters / 6378137) * (180 / Math.PI);
        var lngOffset = latOffset / Math.max(0.35, Math.cos(latRad));
        var bounds = new mapboxgl.LngLatBounds(
          [lng - lngOffset, lat - latOffset],
          [lng + lngOffset, lat + latOffset]
        );
        var pad = state.mapPadding || { top: 56, bottom: 56, left: 40, right: 40 };
        geofenceCameraActive = true;
        map.fitBounds(bounds, {
          padding: pad,
          duration: state.refitCamera ? 650 : 900,
          maxZoom: 16.2,
          bearing: 0,
          pitch: 0,
          linear: false,
          essential: true
        });
        state.initialFitDone = true;
        state.refitCamera = false;
      }

      window.isGeofenceCameraActive = function() { return !!geofenceCameraActive; };
      window.clearGeofenceCamera = function() { geofenceCameraActive = false; };

      /** Geographic bearing (deg) from A → B, 0 = north. */
      function geoBearingDeg(lng1, lat1, lng2, lat2) {
        var φ1 = lat1 * Math.PI / 180;
        var φ2 = lat2 * Math.PI / 180;
        var Δλ = (lng2 - lng1) * Math.PI / 180;
        var y = Math.sin(Δλ) * Math.cos(φ2);
        var x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
      }

      /**
       * Pre-rider: rotate camera so store → home runs left → right on screen
       * (horizontal dashed arc), regardless of real-world north alignment.
       */
      function preRiderHorizontalBearing(data) {
        if (data.pickupLat == null || data.pickupLng == null || data.dropLat == null || data.dropLng == null) {
          return 0;
        }
        var θ = geoBearingDeg(data.pickupLng, data.pickupLat, data.dropLng, data.dropLat);
        return ((θ - 90) + 360) % 360;
      }

      function easeToFitBounds(bounds, pad, duration, bearingDeg) {
        var bearing = bearingDeg || 0;
        var opts = { padding: pad, bearing: bearing, pitch: 0, maxZoom: 16 };
        try {
          var cam = map.cameraForBounds(bounds, opts);
          if (cam) {
            map.easeTo({
              center: cam.center,
              zoom: cam.zoom,
              bearing: bearing,
              pitch: 0,
              duration: duration,
              essential: true
            });
            return;
          }
        } catch (e) {}
        map.fitBounds(bounds, {
          padding: pad,
          duration: duration,
          maxZoom: 16,
          bearing: bearing,
          pitch: 0,
          essential: true
        });
      }

      function fitMapToContent(data) {
        var pts = [];
        function push(lat, lng) {
          if (lat != null && lng != null) pts.push([lng, lat]);
        }
        var isPreRider = !!(data.preRiderArcRoute && data.preRiderArcRoute.length >= 2);
        if (isPreRider) {
          data.preRiderArcRoute.forEach(function(c) { push(c.latitude, c.longitude); });
          push(data.pickupLat, data.pickupLng);
          push(data.dropLat, data.dropLng);
        } else if (data.remainingRoute && data.remainingRoute.length) {
          data.remainingRoute.forEach(function(c) { push(c.latitude, c.longitude); });
          push(data.riderLat, data.riderLng);
          if (state.mapPhase === 'rider_to_drop') {
            push(data.dropLat, data.dropLng);
          } else {
            push(data.pickupLat, data.pickupLng);
          }
        } else if (data.fullRoute && data.fullRoute.length) {
          data.fullRoute.forEach(function(c) { push(c.latitude, c.longitude); });
          push(data.riderLat, data.riderLng);
          if (state.mapPhase === 'rider_to_drop') {
            push(data.dropLat, data.dropLng);
          } else {
            push(data.pickupLat, data.pickupLng);
          }
        } else {
          push(data.riderLat, data.riderLng);
          if (state.mapPhase === 'rider_to_drop') {
            push(data.dropLat, data.dropLng);
          } else {
            push(data.pickupLat, data.pickupLng);
          }
        }
        if (pts.length < 1) return;
        var bounds = pts.reduce(function(b, c) { return b.extend(c); }, new mapboxgl.LngLatBounds(pts[0], pts[0]));
        var pad = state.mapPadding || { top: 48, bottom: 40, left: 28, right: 28 };
        if (isPreRider) {
          // Extra side padding so the horizontal arc + pins breathe like Zomato preview.
          pad = {
            top: Math.max(pad.top || 48, 56),
            bottom: Math.max(pad.bottom || 40, 48),
            left: Math.max(pad.left || 28, 44),
            right: Math.max(pad.right || 28, 44)
          };
        }
        var duration = state.refitCamera ? 650 : 900;
        var bearing = isPreRider ? preRiderHorizontalBearing(data) : 0;
        easeToFitBounds(bounds, pad, duration, bearing);
        state.initialFitDone = true;
        state.refitCamera = false;
      }

      function tick() {
        pulsePhase += 0.06;
        animFrame = requestAnimationFrame(tick);
      }

      function startPulse() {
        if (animFrame != null) return;
        animFrame = requestAnimationFrame(tick);
      }

      window.updateDeliveryMap = function(data) {
        ensureRouteLayers();
        state.pickupLat = data.pickupLat;
        state.pickupLng = data.pickupLng;
        state.dropLat = data.dropLat;
        state.dropLng = data.dropLng;
        state.highlightPickupZone = !!data.highlightPickupZone;
        state.highlightDropZone = !!data.highlightDropZone;
        state.riderArrived = !!data.riderArrived;
        state.hideRouteLine = !!data.hideRouteLine;
        state.geofenceRadiusM = data.geofenceRadiusM || 200;
        state.geofenceProximityM = data.geofenceProximityM || 500;
        state.refitCamera = !!data.refitCamera;
        state.mapPhase = data.mapPhase || 'rider_to_pickup';
        if (data.mapPadding) state.mapPadding = data.mapPadding;

        var showPickup = state.mapPhase === 'rider_to_pickup' && state.highlightPickupZone;
        var showDrop = state.mapPhase === 'rider_to_drop' && state.highlightDropZone;
        updateZone('pickup-zone', 'pickup-zone-fill', 'pickup-zone-stroke', state.pickupLat, state.pickupLng, showPickup, state.geofenceRadiusM);
        updateZone('drop-zone', 'drop-zone-fill', 'drop-zone-stroke', state.dropLat, state.dropLng, showDrop, state.geofenceRadiusM);
        if (showPickup || showDrop) startPulse();

        // Marker visibility by phase:
        // - Pre-rider: store + customer (dashed preview) — no rider pin
        // - Rider → store: store + rider + road route (hide customer)
        // - Rider → customer (picked up): rider + customer + road route (hide store)
        var preRiderArc = data.preRiderArcRoute && data.preRiderArcRoute.length >= 2 ? data.preRiderArcRoute : null;
        var isPreRider = !!preRiderArc;
        var showPickupPin = data.showPickupMarker !== false;
        var showDropPin = data.showDropMarker !== false;
        if (isPreRider) {
          showPickupPin = true;
          showDropPin = true;
        } else if (state.mapPhase === 'rider_to_drop') {
          showPickupPin = false;
          showDropPin = true;
        } else {
          showPickupPin = true;
          showDropPin = false;
        }
        setPin('pickup', showPickupPin ? data.pickupLat : null, showPickupPin ? data.pickupLng : null, 'pickup');
        setPin('drop', showDropPin ? data.dropLat : null, showDropPin ? data.dropLng : null, 'drop');
        // Hide rider marker until assigned (pre-rider preview has no partner).
        if (isPreRider) {
          setRiderMarker(null, null, null);
        } else {
          setRiderMarker(data.riderLat, data.riderLng, data.riderHeading);
        }

        var hideRoute = state.hideRouteLine || state.riderArrived;
        var preRiderModeChanged = state.wasPreRider !== isPreRider;
        state.wasPreRider = isPreRider;
        if (preRiderArc) {
          setLineData('route-pre-rider', preRiderArc, ['route-pre-rider-line']);
          setLineData('route-remaining', [], ['route-remaining-glow', 'route-remaining-casing', 'route-remaining-line']);
          setLineData('route-connector', [], ['route-connector-casing', 'route-connector-line']);
          setJoinDot(null, null, false);
        } else if (hideRoute) {
          setLineData('route-pre-rider', [], ['route-pre-rider-line']);
          setLineData('route-remaining', [], ['route-remaining-glow', 'route-remaining-casing', 'route-remaining-line']);
          setLineData('route-connector', [], ['route-connector-casing', 'route-connector-line']);
          setJoinDot(null, null, false);
        } else {
          setLineData('route-pre-rider', [], ['route-pre-rider-line']);
          var remaining = data.remainingRoute && data.remainingRoute.length >= 2
            ? data.remainingRoute
            : (data.fullRoute && data.fullRoute.length >= 2 ? data.fullRoute : []);
          setLineData('route-remaining', remaining, ['route-remaining-glow', 'route-remaining-casing', 'route-remaining-line']);
          setLineData('route-connector', data.connectorRoute || [], ['route-connector-casing', 'route-connector-line']);
          setJoinDot(data.routeJoinLat, data.routeJoinLng, !!(data.routeJoinLat != null && data.connectorRoute && data.connectorRoute.length >= 2));
        }

        if (state.refitCamera || !state.initialFitDone || preRiderModeChanged) {
          if (showDrop) {
            fitMapToZoneCenter(state.dropLat, state.dropLng, state.geofenceRadiusM);
          } else if (showPickup) {
            fitMapToZoneCenter(state.pickupLat, state.pickupLng, state.geofenceRadiusM);
          } else {
            geofenceCameraActive = false;
            fitMapToContent(data);
          }
        } else if (!showPickup && !showDrop) {
          geofenceCameraActive = false;
        }
      };
  `;
}
