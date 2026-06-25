import { MAPBOX_GL_VERSION, MAPBOX_RIDE_STYLE } from "@/lib/customer-map-assets";
import { mapboxEnableGesturesScript } from "@/components/maps/mapbox-web-shared";

type LatLng = { latitude: number; longitude: number };

type NearbyRiderPin = {
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

export function buildRideSearchingMapHtml(
  token: string,
  center: LatLng,
  bikeUri: string,
  style = MAPBOX_RIDE_STYLE,
  bottomMapPadding = 360
): string {
  const lat = center.latitude;
  const lng = center.longitude;
  const uri = escUri(bikeUri);
  const bottomPad = Math.max(180, Math.round(bottomMapPadding));

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
    .radar-host {
      position:absolute; left:50%; bottom:0; width:160px; height:160px;
      margin-left:-80px; margin-bottom:-80px; pointer-events:none;
    }
    .radar-ring {
      position:absolute; top:50%; left:50%; width:120px; height:120px; margin:-60px 0 0 -60px;
      border-radius:50%; border:2px solid rgba(59,130,246,0.42); background:rgba(59,130,246,0.07);
      transform:scale(0.35); opacity:0.65; animation:searchRadar 2.4s ease-out infinite;
      transform-origin:center center;
    }
    .radar-ring-2 { animation-delay:0.8s; }
    .radar-ring-3 { animation-delay:1.6s; }
    @keyframes searchRadar {
      0% { transform:scale(0.35); opacity:0.65; }
      100% { transform:scale(1.2); opacity:0; }
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    (function(){
      var token = '${escToken(token)}';
      var riderMarkerUri = '${uri}';
      var lastRidersPayload = [];
      var riderMarkers = [];
      var pickupLng = ${lng};
      var pickupLat = ${lat};

      window.setRiderMarkerIcon = function(nextUri) {
        if (!nextUri) return;
        riderMarkerUri = nextUri;
        if (lastRidersPayload.length) window.updateNearbyRiders(lastRidersPayload);
      };

      mapboxgl.accessToken = token;
      var map = new mapboxgl.Map({
        container: 'map',
        style: '${style}',
        center: [pickupLng, pickupLat],
        zoom: 14.5,
        minZoom: 10,
        maxZoom: 18,
        pitch: 0,
        attributionControl: false,
        cooperativeGestures: false
      });
      ${labelRestoreScript()}
      ${mapboxEnableGesturesScript()}
      map.on('style.load', function() { ensureMapLabelsVisible(map); });

      function buildPickupMarker() {
        var wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;width:140px;height:96px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;pointer-events:none;';
        wrap.innerHTML = '<div class="radar-host">'
          + '<div class="radar-ring radar-ring-1"></div>'
          + '<div class="radar-ring radar-ring-2"></div>'
          + '<div class="radar-ring radar-ring-3"></div>'
          + '</div>'
          + '<div style="position:relative;z-index:3;display:flex;flex-direction:column;align-items:center;">'
          + '<div style="background:#22C55E;color:#fff;font-weight:800;font-size:11px;padding:3px 10px;border-radius:8px;margin-bottom:3px;box-shadow:0 1px 4px rgba(0,0,0,0.15);white-space:nowrap;">You</div>'
          + '<svg width="34" height="44" viewBox="0 0 34 44" style="display:block;filter:drop-shadow(0 2px 5px rgba(0,0,0,0.22));" aria-hidden="true">'
          + '<path d="M17 0C10.096 0 4.5 5.596 4.5 12.5c0 9.375 12.5 29.5 12.5 29.5S29.5 21.875 29.5 12.5C29.5 5.596 23.904 0 17 0z" fill="#22C55E"/>'
          + '<circle cx="17" cy="12.5" r="5.5" fill="#FFFFFF"/>'
          + '</svg>'
          + '</div>';
        return wrap;
      }

      function centerMapWithPadding() {
        map.easeTo({
          center: [pickupLng, pickupLat],
          zoom: 14.5,
          padding: { top: 72, bottom: ${bottomPad}, left: 40, right: 40 },
          duration: 400
        });
      }

      function clearRiderMarkers() {
        riderMarkers.forEach(function(m) { try { m.remove(); } catch (e) {} });
        riderMarkers = [];
      }

      function fitPickupAndRiders(riders) {
        var coords = [[pickupLng, pickupLat]];
        (riders || []).forEach(function(r) { coords.push([r.lng, r.lat]); });
        if (coords.length === 1) {
          centerMapWithPadding();
          return;
        }
        var bounds = coords.reduce(function(b, c) { return b.extend(c); }, new mapboxgl.LngLatBounds(coords[0], coords[0]));
        map.fitBounds(bounds, {
          padding: { top: 80, bottom: ${bottomPad}, left: 48, right: 48 },
          duration: 650,
          maxZoom: 15.5
        });
      }

      window.updateNearbyRiders = function(riders) {
        lastRidersPayload = riders || [];
        clearRiderMarkers();
        lastRidersPayload.forEach(function(r) {
          var el = document.createElement('div');
          el.className = 'gm-vehicle-marker';
          el.style.cssText = 'width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:transparent;';
          var rot = r.heading != null && !isNaN(r.heading) ? 'rotate(' + r.heading + 'deg)' : 'none';
          el.innerHTML = '<img src="' + riderMarkerUri + '" style="width:40px;height:40px;object-fit:contain;transform:' + rot + ';transform-origin:center center;background:transparent;border:0;" alt="" />';
          var marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([r.lng, r.lat])
            .addTo(map);
          riderMarkers.push(marker);
        });
        fitPickupAndRiders(lastRidersPayload);
      };

      map.on('load', function() {
        ensureMapLabelsVisible(map);
        var pickupEl = buildPickupMarker();
        window.pickupMarker = new mapboxgl.Marker({ element: pickupEl, anchor: 'bottom' })
          .setLngLat([pickupLng, pickupLat])
          .addTo(map);
        centerMapWithPadding();
        map.resize();
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
        }
      });
    })();
  <\/script>
</body>
</html>`;
}

export type { NearbyRiderPin };
