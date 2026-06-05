import { MAPBOX_GL_VERSION, MAPBOX_RIDE_STYLE } from "@/lib/customer-map-assets";
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
    html, body, #map { width:100%; height:100%; }
    .mapboxgl-ctrl-logo, .mapboxgl-ctrl-attrib { display:none !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    (function(){
      var token = '${escToken(token)}';
      var riderMarkers = [];
      var stopMarkers = [];

      mapboxgl.accessToken = token;
      var map = new mapboxgl.Map({
        container: 'map',
        style: '${style}',
        center: [${lng}, ${lat}],
        zoom: 14,
        minZoom: 10,
        maxZoom: 20,
        pitch: 0,
        attributionControl: false
      });
      ${labelRestoreScript()}

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
        clearMarkers(riderMarkers);
        (riders || []).forEach(function(r) {
          var el = document.createElement('div');
          el.style.cssText = 'width:44px;height:44px;display:flex;align-items:center;justify-content:center;pointer-events:none;';
          var rot = r.heading != null && !isNaN(r.heading) ? 'rotate(' + r.heading + 'deg)' : 'none';
          el.innerHTML = '<img src="${uri}" style="width:40px;height:40px;object-fit:contain;transform:' + rot + ';transform-origin:center center;" alt="" />';
          var marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([r.lng, r.lat])
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
        var cap = typeof maxZoom === 'number' && maxZoom > 0 ? maxZoom : 15;
        if (points.length === 1) {
          map.flyTo({ center: points[0], zoom: Math.min(cap, 15), duration: 650, padding: padding || {} });
          return;
        }
        var bounds = points.reduce(function(b, c) { return b.extend(c); }, new mapboxgl.LngLatBounds(points[0], points[0]));
        map.fitBounds(bounds, {
          padding: padding || { top: 100, bottom: 200, left: 56, right: 56 },
          duration: 650,
          maxZoom: cap
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
