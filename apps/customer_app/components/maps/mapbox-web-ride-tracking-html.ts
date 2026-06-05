import { MAPBOX_RIDE_STYLE } from "@/lib/customer-map-assets";
import {
  escToken,
  escJson,
  mapboxHtmlHead,
  mapboxLabelRestoreScript,
} from "@/components/maps/mapbox-web-shared";
import { mapboxRapidoRouteScript } from "@/components/maps/mapbox-rapido-route-script";

type Center = { latitude: number; longitude: number };

export function buildRideTrackingMapHtml(token: string, center: Center, bikeUri: string): string {
  const lat = center.latitude;
  const lng = center.longitude;
  const uri = escJson(bikeUri);

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
      var riderMarker = null;

      mapboxgl.accessToken = token;
      var map = new mapboxgl.Map({
        container: 'map',
        style: '${MAPBOX_RIDE_STYLE}',
        center: [${lng}, ${lat}],
        zoom: 14,
        minZoom: 10,
        maxZoom: 18,
        pitch: 0,
        attributionControl: false
      });
      ${mapboxLabelRestoreScript()}

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

      window.updateRider = function(lat, lng, heading) {
        if (lat == null || lng == null) {
          if (riderMarker) { try { riderMarker.remove(); } catch (e) {} riderMarker = null; }
          return;
        }
        if (!riderMarker) {
          var el = document.createElement('div');
          el.style.cssText = 'width:44px;height:44px;display:flex;align-items:center;justify-content:center;pointer-events:none;';
          el.innerHTML = '<img id="rider-img" src="${uri}" style="width:40px;height:40px;object-fit:contain;transform-origin:center center;" alt="" />';
          riderMarker = new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map);
        } else {
          riderMarker.setLngLat([lng, lat]);
        }
        var img = document.getElementById('rider-img');
        if (img && heading != null && !isNaN(heading)) {
          img.style.transform = 'rotate(' + heading + 'deg)';
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
