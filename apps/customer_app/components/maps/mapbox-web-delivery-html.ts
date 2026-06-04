import { MAPBOX_RIDE_STYLE } from "@/lib/customer-map-assets";
import { escToken, mapboxHtmlHead, mapboxLabelRestoreScript } from "@/components/maps/mapbox-web-shared";
import { mapboxRapidoRouteScript } from "@/components/maps/mapbox-rapido-route-script";

type Point = { latitude: number; longitude: number } | null;

export function buildDeliveryTrackingMapHtml(
  token: string,
  center: { latitude: number; longitude: number }
): string {
  const lat = center.latitude;
  const lng = center.longitude;

  return `<!DOCTYPE html>
<html>
<head>${mapboxHtmlHead(MAPBOX_RIDE_STYLE)}</head>
<body>
  <div id="map"></div>
  <script>
    (function(){
      var markers = { pickup: null, drop: null, rider: null };
      mapboxgl.accessToken = '${escToken(token)}';
      var map = new mapboxgl.Map({
        container: 'map',
        style: '${MAPBOX_RIDE_STYLE}',
        center: [${lng}, ${lat}],
        zoom: 13,
        attributionControl: false
      });
      ${mapboxLabelRestoreScript()}
      map.on('style.load', function() { ensureMapLabelsVisible(map); });
      map.on('load', function() {
        ensureMapLabelsVisible(map);
        ${mapboxRapidoRouteScript()}
        map.resize();
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
        }
      });

      function setMarker(key, lat, lng, color, size) {
        if (lat == null || lng == null) {
          if (markers[key]) { try { markers[key].remove(); } catch (e) {} markers[key] = null; }
          return;
        }
        if (!markers[key]) {
          var el = document.createElement('div');
          el.style.cssText = 'width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:' + color + ';border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.2);';
          markers[key] = new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map);
        } else {
          markers[key].setLngLat([lng, lat]);
        }
      }

      window.updateDeliveryMap = function(data) {
        setMarker('pickup', data.pickupLat, data.pickupLng, '#22C55E', 14);
        setMarker('drop', data.dropLat, data.dropLng, '#EF4444', 14);
        setMarker('rider', data.riderLat, data.riderLng, '#2563EB', 16);
        if (data.route && data.route.length >= 2) {
          window.updateRoute && window.updateRoute(data.route);
        }
      };

      window.fitToCoordinates = function(coords, padding, maxZoom) {
        if (!coords || coords.length < 1) return;
        var points = coords.map(function(c) { return [c.longitude, c.latitude]; });
        var cap = typeof maxZoom === 'number' ? maxZoom : 15;
        var bounds = points.reduce(function(b, c) { return b.extend(c); }, new mapboxgl.LngLatBounds(points[0], points[0]));
        map.fitBounds(bounds, { padding: padding || { top: 40, bottom: 40, left: 40, right: 40 }, duration: 500, maxZoom: cap });
      };
    })();
  <\/script>
</body>
</html>`;
}

export type DeliveryMapPayload = {
  pickupLat: number | null;
  pickupLng: number | null;
  dropLat: number | null;
  dropLng: number | null;
  riderLat: number | null;
  riderLng: number | null;
  route: { latitude: number; longitude: number }[];
};
