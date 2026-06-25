import { MAPBOX_GL_VERSION, MAPBOX_RIDE_STYLE, ROUTE_BOOK_CASING_COLOR, ROUTE_BOOK_LINE_COLOR } from "@/lib/customer-map-assets";
import { mapboxEnableGesturesScript } from "@/components/maps/mapbox-web-shared";
import { mapboxRapidoRouteScript } from "@/components/maps/mapbox-rapido-route-script";

type LatLng = { latitude: number; longitude: number };

type NearbyRider = {
  riderId: number;
  lat: number;
  lng: number;
  heading: number | null;
};

function escToken(token: string): string {
  return token.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function escUri(uri: string): string {
  return uri.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function labelRestoreScript(): string {
  return `
    function ensureMapLabelsVisible(map) {
      var style = map.getStyle();
      if (!style || !style.layers) return;
      style.layers.forEach(function(layer) {
        if (layer.type !== 'symbol') return;
        var id = layer.id || '';
        var isLabel = /label|place|poi|road-name|settlement|state|country|airport|waterway|transit|town|village|locality|neighbourhood|suburb|hamlet|city|region/i.test(id);
        if (!isLabel) return;
        try { map.setLayoutProperty(id, 'visibility', 'visible'); } catch (e) {}
      });
    }
  `;
}

export function buildRideBookMapHtml(
  token: string,
  center: LatLng,
  bikeUri: string,
  style = MAPBOX_RIDE_STYLE
): string {
  const lat = center.latitude;
  const lng = center.longitude;
  const uri = escUri(bikeUri);

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link href="https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_GL_VERSION}/mapbox-gl.css" rel="stylesheet" />
  <script src="https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_GL_VERSION}/mapbox-gl.js"><\/script>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body, #map { width:100%; height:100%; touch-action: none; }
    .mapboxgl-ctrl-logo, .mapboxgl-ctrl-attrib { display:none !important; }
    .mapboxgl-marker { background: transparent !important; }
    .gm-vehicle-marker { background: transparent !important; pointer-events: none; }
    .gm-vehicle-marker img {
      display: block;
      background: transparent !important;
      border: 0;
      mix-blend-mode: screen;
      -webkit-mix-blend-mode: screen;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    (function(){
      var token = '${escToken(token)}';
      var riderMarkers = [];
      var stopMarkers = [];
      var riderMarkerUri = '${uri}';
      var lastRidersPayload = [];

      window.setRiderMarkerIcon = function(nextUri) {
        if (!nextUri) return;
        riderMarkerUri = nextUri;
        if (lastRidersPayload.length) window.updateRiders(lastRidersPayload);
      };

      mapboxgl.accessToken = token;
      var map = new mapboxgl.Map({
        container: 'map',
        style: '${style}',
        center: [${lng}, ${lat}],
        zoom: 11,
        minZoom: 2,
        maxZoom: 20,
        pitch: 0,
        attributionControl: false,
        cooperativeGestures: false
      });
      ${labelRestoreScript()}
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
        ${mapboxRapidoRouteScript({
          lineColor: ROUTE_BOOK_LINE_COLOR,
          casingColor: ROUTE_BOOK_CASING_COLOR,
          showEndpointDots: false,
          thickStroke: true,
        })}
        map.resize();
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
        }
      });

      function clearMarkers(list) {
        list.forEach(function(m) { try { m.remove(); } catch (e) {} });
        list.length = 0;
      }

      window.updateRiders = function(riders) {
        lastRidersPayload = riders || [];
        clearMarkers(riderMarkers);
        lastRidersPayload.forEach(function(r, index) {
          var spread = lastRidersPayload.length > 1 ? 0.00012 * (index + 1) : 0;
          var angle = index * 1.35;
          var lat = r.lat + spread * Math.sin(angle);
          var lng = r.lng + spread * Math.cos(angle);
          var el = document.createElement('div');
          el.className = 'gm-vehicle-marker';
          el.style.cssText = 'width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:transparent;';
          var rot = r.heading != null && !isNaN(r.heading) ? 'rotate(' + r.heading + 'deg)' : 'none';
          el.innerHTML = '<img src="' + riderMarkerUri + '" class="gm-vehicle-marker-img" style="width:40px;height:40px;object-fit:contain;transform:' + rot + ';transform-origin:center center;background:transparent;border:0;" alt="" />';
          var marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([lng, lat])
            .addTo(map);
          riderMarkers.push(marker);
        });
      };

      window.updateStops = function(stops) {
        clearMarkers(stopMarkers);
        (stops || []).forEach(function(s, index) {
          var el = document.createElement('div');
          el.style.cssText = 'width:26px;height:26px;border-radius:13px;background:#111827;border:2px solid #fff;color:#fff;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.25);';
          el.textContent = String(index + 1);
          var marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([s.longitude, s.latitude])
            .addTo(map);
          stopMarkers.push(marker);
        });
      };

      window.fitToCoordinates = function(coords, padding, maxZoom) {
        if (!coords || coords.length < 1) return;
        var points = coords.map(function(c) { return [c.longitude, c.latitude]; });
        var pad = padding || { top: 48, bottom: 40, left: 36, right: 36 };
        var cap = typeof maxZoom === 'number' && maxZoom > 0 ? maxZoom : 15;
        if (points.length === 1) {
          map.flyTo({ center: points[0], zoom: Math.min(cap, 14), duration: 650, padding: pad });
          return;
        }
        var bounds = points.reduce(function(b, c) { return b.extend(c); }, new mapboxgl.LngLatBounds(points[0], points[0]));
        map.fitBounds(bounds, {
          padding: pad,
          duration: 700,
          maxZoom: cap,
          linear: false
        });
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

export type { NearbyRider };
