import { MAPBOX_RIDE_STYLE } from "@/lib/customer-map-assets";
import {
  escToken,
  escJson,
  buildTrackingRiderMarkerInnerHtml,
  mapboxEnableGesturesScript,
  mapboxHtmlHead,
  mapboxLabelRestoreScript,
} from "@/components/maps/mapbox-web-shared";
import { mapboxRapidoRouteScript } from "@/components/maps/mapbox-rapido-route-script";
import { mapboxRideNavScript } from "@/components/maps/mapbox-ride-nav-script";
import { mapboxPickupZoneScript } from "@/components/maps/mapbox-pickup-zone-script";

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
        ${mapboxRapidoRouteScript()}
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
        function applyHeading(h) {
          var img = document.getElementById('rider-img');
          if (!img || h == null || isNaN(h)) return;
          if (headingAnimFrame) { cancelAnimationFrame(headingAnimFrame); headingAnimFrame = null; }
          var from = currentHeading == null ? h : currentHeading;
          var to = ((h % 360) + 360) % 360;
          var delta = ((to - from + 540) % 360) - 180;
          if (Math.abs(delta) < 1) {
            currentHeading = to;
            img.style.transform = 'rotate(' + to + 'deg)';
            return;
          }
          var t0 = performance.now();
          var dur = Math.min(500, Math.max(180, Math.abs(delta) * 4));
          function hStep(now) {
            var t = Math.min(1, (now - t0) / dur);
            var eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            var ang = from + delta * eased;
            currentHeading = ((ang % 360) + 360) % 360;
            img.style.transform = 'rotate(' + currentHeading + 'deg)';
            if (t < 1) headingAnimFrame = requestAnimationFrame(hStep);
            else headingAnimFrame = null;
          }
          headingAnimFrame = requestAnimationFrame(hStep);
        }
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
          el.className = 'gm-vehicle-marker';
          el.style.cssText = 'width:44px;height:44px;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:8;position:relative;background:transparent;';
          el.innerHTML = '${buildTrackingRiderMarkerInnerHtml(uri)}';
          riderMarker = new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map);
          applyHeading(heading);
          return;
        }
        var start = riderMarker.getLngLat();
        var fromLng = start.lng;
        var fromLat = start.lat;
        var jumpM = haversineM(fromLat, fromLng, lat, lng);
        if (jumpM > 180) {
          if (riderAnimFrame) { cancelAnimationFrame(riderAnimFrame); riderAnimFrame = null; }
          riderMarker.setLngLat([lng, lat]);
          applyHeading(heading);
          return;
        }
        if (riderAnimFrame) { cancelAnimationFrame(riderAnimFrame); riderAnimFrame = null; }
        var t0 = performance.now();
        var dur = Math.min(1100, Math.max(350, jumpM * 18));
        function step(now) {
          var t = Math.min(1, (now - t0) / dur);
          var eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          var latN = fromLat + (lat - fromLat) * eased;
          var lngN = fromLng + (lng - fromLng) * eased;
          if (riderMarker) riderMarker.setLngLat([lngN, latN]);
          if (t < 1) {
            riderAnimFrame = requestAnimationFrame(step);
          } else {
            riderAnimFrame = null;
            applyHeading(heading);
            var geofenceLock = typeof window.isGeofenceCameraActive === 'function' && window.isGeofenceCameraActive();
            if (followRider && !geofenceLock && !(window.__gmNavFollowActive)) {
              try { map.easeTo({ center: [lng, lat], duration: 280, essential: true }); } catch (e) {}
            }
          }
        }
        applyHeading(heading);
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
