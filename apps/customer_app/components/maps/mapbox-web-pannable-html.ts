import { MAPBOX_RIDE_STYLE } from "@/lib/customer-map-assets";
import {
  escToken,
  latitudeDeltaToZoom,
  mapboxHtmlHead,
  mapboxLabelRestoreScript,
} from "@/components/maps/mapbox-web-shared";

type Center = { latitude: number; longitude: number };

export function buildPannableMapHtml(
  token: string,
  center: Center,
  options?: {
    zoom?: number;
    latitudeDelta?: number;
    circleRadiusMeters?: number;
    style?: string;
  }
): string {
  const lat = center.latitude;
  const lng = center.longitude;
  const zoom =
    options?.zoom ??
    latitudeDeltaToZoom(options?.latitudeDelta ?? 0.01);
  const style = options?.style ?? MAPBOX_RIDE_STYLE;
  const circleRadius = options?.circleRadiusMeters ?? 0;

  return `<!DOCTYPE html>
<html>
<head>
  ${mapboxHtmlHead(style)}
</head>
<body>
  <div id="map"></div>
  <script>
    (function(){
      var token = '${escToken(token)}';
      var snapMarkers = [];

      mapboxgl.accessToken = token;
      var map = new mapboxgl.Map({
        container: 'map',
        style: '${style}',
        center: [${lng}, ${lat}],
        zoom: ${zoom},
        minZoom: 8,
        maxZoom: 20,
        pitch: 0,
        attributionControl: false
      });
      ${mapboxLabelRestoreScript()}

      map.on('style.load', function() { ensureMapLabelsVisible(map); });

      var mapReady = false;
      var lastPosted = null;

      function postRegion(phase) {
        if (!mapReady) return;
        var c = map.getCenter();
        if (!c || !isFinite(c.lat) || !isFinite(c.lng)) return;
        if (Math.abs(c.lat) < 1e-4 && Math.abs(c.lng) < 1e-4) return;
        if (lastPosted) {
          var dLat = Math.abs(c.lat - lastPosted.lat);
          var dLng = Math.abs(c.lng - lastPosted.lng);
          if (dLat < 1e-6 && dLng < 1e-6) return;
        }
        lastPosted = { lat: c.lat, lng: c.lng };
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'region',
            phase: phase,
            latitude: c.lat,
            longitude: c.lng
          }));
        }
      }

      function syncCircleToCenter() {
        if (${circleRadius} <= 0) return;
        var src = map.getSource('pin-range');
        if (!src) return;
        var c = map.getCenter();
        if (!c || !isFinite(c.lat) || !isFinite(c.lng)) return;
        src.setData({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [c.lng, c.lat] }
        });
      }

      map.on('move', function() {
        syncCircleToCenter();
        postRegion('change');
      });
      map.on('moveend', function() { postRegion('complete'); });

      function clearSnapMarkers() {
        snapMarkers.forEach(function(m) { try { m.remove(); } catch (e) {} });
        snapMarkers = [];
      }

      function addCircleLayer() {
        if (${circleRadius} <= 0) return;
        if (map.getSource('pin-range')) return;
        map.addSource('pin-range', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [${lng}, ${lat}] }
          }
        });
        map.addLayer({
          id: 'pin-range-fill',
          type: 'circle',
          source: 'pin-range',
          paint: {
            'circle-radius': {
              stops: [[10, 8], [14, 40], [16, 80], [18, 160]]
            },
            'circle-color': 'rgba(59,130,246,0.18)',
            'circle-stroke-color': 'rgba(59,130,246,0.45)',
            'circle-stroke-width': 1.5
          }
        });
      }

      map.on('load', function() {
        mapReady = true;
        ensureMapLabelsVisible(map);
        addCircleLayer();
        map.resize();
        postRegion('complete');
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
        }
      });

      window.flyToCenter = function(lat, lng, zoomLevel) {
        map.flyTo({
          center: [lng, lat],
          zoom: zoomLevel || map.getZoom(),
          duration: 320
        });
      };

      window.updateSnapPoints = function(points) {
        clearSnapMarkers();
        (points || []).forEach(function(p) {
          var el = document.createElement('div');
          var selected = !!p.selected;
          el.style.cssText =
            'width:' + (selected ? '26px' : '22px') +
            ';height:' + (selected ? '26px' : '22px') +
            ';border-radius:50%;background:rgba(34,197,94,' + (selected ? '0.55' : '0.35') +
            ');border:2px solid #fff;display:flex;align-items:center;justify-content:center;cursor:pointer;';
          var inner = document.createElement('div');
          inner.style.cssText =
            'width:8px;height:8px;border-radius:4px;background:' + (selected ? '#15803D' : '#22C55E') + ';';
          el.appendChild(inner);
          el.onclick = function() {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'snap', id: p.id }));
            }
          };
          var marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([p.longitude, p.latitude])
            .addTo(map);
          snapMarkers.push(marker);
        });
      };

      window.updateCircleCenter = function(lat, lng) {
        var src = map.getSource('pin-range');
        if (!src) return;
        src.setData({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] }
        });
      };

      window.projectPoint = function(lat, lng, requestId) {
        try {
          var p = map.project([lng, lat]);
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'point', requestId: requestId, x: p.x, y: p.y
            }));
          }
        } catch (e) {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'point', requestId: requestId, error: true
            }));
          }
        }
      };
    })();
  <\/script>
</body>
</html>`;
}
