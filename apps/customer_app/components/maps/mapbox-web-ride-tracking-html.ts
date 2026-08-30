import { MAPBOX_RIDE_STYLE } from "@/lib/customer-map-assets";
import {
  escToken,
  escJson,
  mapboxEnableGesturesScript,
  mapboxHtmlHead,
  mapboxLabelRestoreScript,
} from "@/components/maps/mapbox-web-shared";
import { mapboxRapidoRouteScript } from "@/components/maps/mapbox-rapido-route-script";
import { mapboxRideNavScript } from "@/components/maps/mapbox-ride-nav-script";
import { mapboxPickupZoneScript } from "@/components/maps/mapbox-pickup-zone-script";
import { liveRiderDotMarkerHtml } from "@gatimitra/map-tracking-engine";

type Center = { latitude: number; longitude: number };

export function buildRideTrackingMapHtml(
  token: string,
  center: Center,
  bikeUri: string,
  options?: { navigationStyle?: boolean }
): string {
  const lat = center.latitude;
  const lng = center.longitude;
  const uri = escJson(bikeUri);
  const initialPitch = options?.navigationStyle ? 58 : 0;
  const initialZoom = options?.navigationStyle ? 17.4 : 14;

  return `<!DOCTYPE html>
<html>
<head>
  ${mapboxHtmlHead(MAPBOX_RIDE_STYLE)}
</head>
<body>
  <div id="map"></div>
  <script>
    (function(){
      var token = '${escToken(token)}';
      var riderMarkerUri = '${uri}';
      var riderMarker = null;
      var riderAnimFrame = null;
      var headingAnimFrame = null;
      var currentHeading = null;
      var followRider = true;

      window.setRiderMarkerIcon = function(nextUri) {
        if (!nextUri) return;
        riderMarkerUri = nextUri;
        var img = document.getElementById('rider-img');
        if (img) img.src = riderMarkerUri;
      };

      mapboxgl.accessToken = token;
      var map = new mapboxgl.Map({
        container: 'map',
        style: '${MAPBOX_RIDE_STYLE}',
        center: [${lng}, ${lat}],
        zoom: ${initialZoom},
        minZoom: 10,
        maxZoom: 18,
        pitch: ${initialPitch},
        bearing: 0,
        attributionControl: false,
        cooperativeGestures: false
      });
      ${mapboxLabelRestoreScript()}
      ${mapboxEnableGesturesScript()}

      map.on('style.load', function() { ensureMapLabelsVisible(map); });
      map.on('move', function() {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'move' }));
        }
      });
      map.on('moveend', function() {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'moveend' }));
        }
      });

      map.on('load', function() {
        ensureMapLabelsVisible(map);
        ${mapboxRapidoRouteScript({ liveNav: true, showEndpointDots: false })}
        ${mapboxRideNavScript()}
        ${mapboxPickupZoneScript()}
        if (window.patchRideTrackingForNav) window.patchRideTrackingForNav();
        map.resize();
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
        }
      });

      window.updateRider = function(lat, lng, heading) {
        applyRiderMarker(lat, lng, heading);
        if (window.onNavRiderUpdate) window.onNavRiderUpdate(lat, lng, heading);
      };

      function applyRiderMarker(lat, lng, heading) {
        if (lat == null || lng == null) {
          if (riderAnimFrame) { cancelAnimationFrame(riderAnimFrame); riderAnimFrame = null; }
          if (riderMarker) { try { riderMarker.remove(); } catch (e) {} riderMarker = null; }
          return;
        }
        function easeOutCubic(t) { return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3); }
        function haversineM(lat1, lng1, lat2, lng2) {
          var R = 6378137;
          var toRad = function(d) { return d * Math.PI / 180; };
          var dLat = toRad(lat2 - lat1);
          var dLng = toRad(lng2 - lng1);
          var a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }
        if (!riderMarker) {
          var el = document.createElement('div');
          el.style.cssText = 'pointer-events:none;z-index:8;position:relative;';
          el.innerHTML = '${liveRiderDotMarkerHtml()}';
          riderMarker = new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map);
          return;
        }
        var start = riderMarker.getLngLat();
        var fromLng = start.lng;
        var fromLat = start.lat;
        var jumpM = haversineM(fromLat, fromLng, lat, lng);
        if (jumpM < 0.4 || jumpM < 1.5) return;
        if (jumpM > 120) {
          if (riderAnimFrame) { cancelAnimationFrame(riderAnimFrame); riderAnimFrame = null; }
          riderMarker.setLngLat([lng, lat]);
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
          if (riderMarker) riderMarker.setLngLat([lngN, latN]);
          if (t < 1) {
            riderAnimFrame = requestAnimationFrame(step);
          } else {
            riderAnimFrame = null;
            var geofenceLock = typeof window.isGeofenceCameraActive === 'function' && window.isGeofenceCameraActive();
            if (followRider && !geofenceLock && !(window.__gmNavFollowActive)) {
              try { map.easeTo({ center: [lng, lat], duration: 280, essential: true }); } catch (e) {}
            }
          }
        }
        riderAnimFrame = requestAnimationFrame(step);
      }

      map.on('dragstart', function() {
        followRider = false;
        if (typeof window.clearGeofenceCamera === 'function') window.clearGeofenceCamera();
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'user_pan' }));
        }
      });
      window.recenterOnRider = function() {
        followRider = true;
        if (typeof window.isGeofenceCameraActive === 'function' && window.isGeofenceCameraActive()) {
          return;
        }
        if (riderMarker) {
          var ll = riderMarker.getLngLat();
          try { map.easeTo({ center: [ll.lng, ll.lat], duration: 450, essential: true }); } catch (e) {}
        }
      };

      window.fitToCoordinates = function(coords, padding, maxZoom) {
        if (!coords || coords.length < 1) return;
        var points = coords.map(function(c) { return [c.longitude, c.latitude]; });
        var cap = typeof maxZoom === 'number' && maxZoom > 0 ? maxZoom : 15;
        if (points.length === 1) {
          map.flyTo({ center: points[0], zoom: Math.min(cap, 15), duration: 650, padding: padding || {} });
          return;
        }
        var bounds = points.reduce(function(b, c) { return b.extend(c); }, new mapboxgl.LngLatBounds(points[0], points[0]));
        map.fitBounds(bounds, { padding: padding || { top: 80, bottom: 200, left: 56, right: 56 }, duration: 650, maxZoom: cap });
      };

      window.projectPoint = function(lat, lng, requestId) {
        try {
          var p = map.project([lng, lat]);
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'point', requestId: requestId, x: p.x, y: p.y }));
          }
        } catch (e) {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'point', requestId: requestId, error: true }));
          }
        }
      };
    })();
  <\/script>
</body>
</html>`;
}
