import {
  MAPBOX_GL_VERSION,
  MAPBOX_HOME_STYLE,
  MAPBOX_NAV_WEB_STYLE,
  HOME_MAP_ZOOM,
  NAV_MAP_ZOOM,
} from "@/src/lib/map-assets";

const MINT = "#14b8a6";
const NAV_BLUE = "#1A73E8";
const NAV_ALT_BLUE = "#7EB8F5";
const NAV_OFF_ROUTE = "#64748B";
const NAV_WRONG_WAY = "#EA580C";
const RESTAURANT_GREEN = "#16A34A";

function escToken(token: string): string {
  return token.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function escUri(uri: string): string {
  return uri.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Restores symbol layers if a style default hides place/POI/road labels. */
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

function mapBaseInit(style: string, lng: number, lat: number, zoom: number): string {
  return `
      mapboxgl.accessToken = token;
      var map = new mapboxgl.Map({
        container: 'map',
        style: '${style}',
        center: [${lng}, ${lat}],
        zoom: ${zoom},
        minZoom: 10,
        maxZoom: 20,
        pitch: 0,
        attributionControl: false
      });
      ${labelRestoreScript()}
      map.on('style.load', function() { ensureMapLabelsVisible(map); });
  `;
}

function homeRiderMarkerHtml(bikeUri: string): string {
  const uri = escUri(bikeUri);
  return `
    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;pointer-events:none;position:relative;z-index:20;';
    wrap.innerHTML = '<div id="radar-host" style="display:none;position:absolute;bottom:8px;left:50%;transform:translateX(-50%);width:128px;height:128px;pointer-events:none;z-index:0;">'
      + '<div class="radar-ring radar-ring-1"></div>'
      + '<div class="radar-ring radar-ring-2"></div>'
      + '<div class="radar-ring radar-ring-3"></div>'
      + '</div>'
      + '<div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;">'
      + '<div style="background:${MINT};color:#fff;font-weight:800;font-size:11px;padding:4px 10px;border-radius:8px;box-shadow:0 1px 5px rgba(0,0,0,0.16);margin-bottom:3px;white-space:nowrap;">You</div>'
      + '<div style="position:relative;width:36px;height:36px;border-radius:18px;background:transparent;border:2.5px solid ${MINT};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.12);">'
      + '<img src="${uri}" style="width:28px;height:28px;object-fit:contain;background:transparent;" alt="" />'
      + '</div></div>';
    return wrap;
  `;
}

function navigationRiderMarkerHtml(bikeUri: string): string {
  const uri = escUri(bikeUri);
  return `
    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;justify-content:center;pointer-events:none;width:40px;height:40px;';
    wrap.innerHTML = '<img id="rider-bike-img" src="${uri}" style="width:40px;height:40px;object-fit:contain;background:transparent;transform:rotate(0deg);transform-origin:center center;" alt="" />';
    return wrap;
  `;
}

type OrderPin = { id: string; lat: number; lng: number; earning: number };

export function buildRiderHomeMapHtml(
  token: string,
  lat: number,
  lng: number,
  orders: OrderPin[],
  bikeUri: string,
  style = MAPBOX_HOME_STYLE,
  zoom = HOME_MAP_ZOOM,
  showRadar = false
): string {
  const ordersJson = JSON.stringify(orders);
  const riderMarkerJs = homeRiderMarkerHtml(bikeUri);
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
    .radar-ring {
      position:absolute; top:0; left:0; width:128px; height:128px; border-radius:64px;
      border:2px solid rgba(34,197,94,0.5); background:rgba(34,197,94,0.06);
      transform:scale(0.4); opacity:0.5; animation:radarPulse 2.2s ease-out infinite;
    }
    .radar-ring-2 { animation-delay:0.7s; }
    .radar-ring-3 { animation-delay:1.4s; }
    @keyframes radarPulse {
      0% { transform:scale(0.4); opacity:0.5; }
      100% { transform:scale(1.1); opacity:0; }
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    (function(){
      var token = '${escToken(token)}';
      var orders = ${ordersJson};
      ${mapBaseInit(style, lng, lat, zoom)}

      var riderEl = (function(){ ${riderMarkerJs} })();
      window.riderMarker = new mapboxgl.Marker({ element: riderEl, anchor: 'bottom' })
        .setLngLat([${lng}, ${lat}])
        .addTo(map);

      window.setShowRadar = function(on) {
        var host = riderEl.querySelector('#radar-host');
        if (host) host.style.display = on ? 'block' : 'none';
      };
      window.setShowRadar(${showRadar ? "true" : "false"});

      orders.forEach(function(o) {
        var el = document.createElement('div');
        el.style.cssText = 'background:${MINT};color:#fff;font-weight:700;font-size:12px;padding:6px 12px;border-radius:20px;border:2px solid #fff;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.2);z-index:5;';
        el.textContent = '₹' + o.earning;
        new mapboxgl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([o.lng, o.lat])
          .addTo(map);
      });

      window.updateRider = function(lng, lat, animate) {
        if (!window.riderMarker) return;
        window.riderMarker.setLngLat([lng, lat]);
        if (animate) {
          map.easeTo({ center: [lng, lat], duration: 600 });
        }
      };

      window.recenterMap = function(lng, lat) {
        map.flyTo({ center: [lng, lat], zoom: ${zoom}, duration: 700 });
      };

      map.on('load', function() {
        ensureMapLabelsVisible(map);
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

type NavPoint = { lat: number; lng: number };

export function buildNavigationMapHtml(
  token: string,
  rider: NavPoint,
  pickup: NavPoint,
  remainingCoords: NavPoint[],
  bikeUri: string,
  style = MAPBOX_NAV_WEB_STYLE,
  zoom = NAV_MAP_ZOOM,
  destinationLabel = "Pickup",
  secondary?: { lat: number; lng: number; label: string; color: string } | null
): string {
  const destLabel = destinationLabel.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/</g, "");
  const destColor = destinationLabel === "Drop" ? NAV_BLUE : RESTAURANT_GREEN;
  const sec = secondary;
  const secLabel = sec ? sec.label.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/</g, "") : "";
  const secColor = sec?.color ?? RESTAURANT_GREEN;
  const secLng = sec?.lng ?? 0;
  const secLat = sec?.lat ?? 0;
  const hasSecondary = sec != null && Number.isFinite(sec.lat) && Number.isFinite(sec.lng);
  const routeCoords =
    remainingCoords.length >= 2
      ? remainingCoords
      : [{ lat: rider.lat, lng: rider.lng }, { lat: rider.lat, lng: rider.lng }];
  const lineJson = JSON.stringify({
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: routeCoords.map((c) => [c.lng, c.lat]),
    },
  });
  const pickupLng = pickup.lng;
  const pickupLat = pickup.lat;
  const riderMarkerJs = navigationRiderMarkerHtml(bikeUri);

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
      var route = ${lineJson};
      mapboxgl.accessToken = token;
      var map = new mapboxgl.Map({
        container: 'map',
        style: '${style}',
        center: [${rider.lng}, ${rider.lat}],
        zoom: ${zoom},
        minZoom: 8,
        maxZoom: 21,
        pitch: 0,
        attributionControl: false,
        scrollZoom: true,
        boxZoom: true,
        dragRotate: true,
        dragPan: true,
        keyboard: true,
        doubleClickZoom: true,
        touchZoomRotate: true,
        touchPitch: true
      });
      ${labelRestoreScript()}
      map.on('style.load', function() { ensureMapLabelsVisible(map); });

      window._followNavEnabled = false;
      window._programmaticCam = false;

      function notifyUserGesture() {
        window._followNavEnabled = false;
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'userGesture' }));
        }
      }

      ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart', 'wheel', 'movestart'].forEach(function(evt) {
        map.on(evt, function(e) {
          if (e && e.originalEvent) notifyUserGesture();
        });
      });
      map.on('moveend', function() {
        if (!window._programmaticCam) notifyUserGesture();
        window._programmaticCam = false;
      });

      function buildPickupConnector(coords) {
        if (!coords || coords.length < 1) {
          return { type: 'Feature', geometry: { type: 'LineString', coordinates: [[${pickupLng}, ${pickupLat}], [${pickupLng}, ${pickupLat}]] } };
        }
        var last = coords[coords.length - 1];
        return { type: 'Feature', geometry: { type: 'LineString', coordinates: [last, [${pickupLng}, ${pickupLat}]] } };
      }

      function syncPickupConnector(coords) {
        var data = buildPickupConnector(coords);
        var src = map.getSource('pickup-connector');
        if (src) src.setData(data);
      }

      var ALT_BLUE = '${NAV_ALT_BLUE}';
      window._altMarkers = [];
      window._altLayerIds = [];
      window._altSourceIds = [];
      window._altBoundsCoords = [];

      window.setAlternativeRoutes = function(alts) {
        if (!map || !map.isStyleLoaded || !map.isStyleLoaded()) {
          window._pendingAlts = alts;
          return;
        }
        (window._altMarkers || []).forEach(function(m) { m.remove(); });
        window._altMarkers = [];
        (window._altLayerIds || []).forEach(function(id) {
          try { if (map.getLayer(id)) map.removeLayer(id); } catch (e) {}
        });
        window._altLayerIds = [];
        (window._altSourceIds || []).forEach(function(id) {
          try { if (map.getSource(id)) map.removeSource(id); } catch (e) {}
        });
        window._altSourceIds = [];
        window._altBoundsCoords = [];
        if (!alts || !alts.length) return;
        alts.forEach(function(alt, idx) {
          if (!alt || !alt.geojson) return;
          var sid = 'alt-route-' + idx;
          var lid = 'alt-route-line-' + idx;
          try {
            map.addSource(sid, { type: 'geojson', data: alt.geojson });
            var beforeId = map.getLayer('route-casing') ? 'route-casing' : undefined;
            map.addLayer({
              id: lid,
              type: 'line',
              source: sid,
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: { 'line-color': ALT_BLUE, 'line-width': 7, 'line-opacity': 0.88 }
            }, beforeId);
            window._altSourceIds.push(sid);
            window._altLayerIds.push(lid);
            if (alt.geojson.geometry && alt.geojson.geometry.coordinates) {
              alt.geojson.geometry.coordinates.forEach(function(c) {
                window._altBoundsCoords.push(c);
              });
            }
          } catch (e) {}
          if (alt.labelLng != null && alt.labelLat != null && !isNaN(alt.labelLng) && !isNaN(alt.labelLat)) {
            var pill = document.createElement('div');
            pill.innerHTML = '<div style="background:#fff;color:${NAV_BLUE};font-weight:700;font-size:12px;padding:5px 10px;border-radius:8px;border:1px solid rgba(0,0,0,0.08);box-shadow:0 1px 4px rgba(0,0,0,0.12);white-space:nowrap;">' + (alt.label || '') + '</div>';
            var mk = new mapboxgl.Marker({ element: pill, anchor: 'center' })
              .setLngLat([alt.labelLng, alt.labelLat])
              .addTo(map);
            window._altMarkers.push(mk);
          }
        });
      };

      function fitAll(extraCoords) {
        var coords = route.geometry.coordinates.slice();
        (window._altBoundsCoords || []).forEach(function(c) { coords.push(c); });
        if (extraCoords && extraCoords.length) {
          extraCoords.forEach(function(c) { if (c && c.length >= 2) coords.push(c); });
        }
        coords.push([${pickup.lng}, ${pickup.lat}]);
        ${hasSecondary ? `coords.push([${secLng}, ${secLat}]);` : ""}
        if (window._navLast && window._navLast.riderLng != null) {
          coords.push([window._navLast.riderLng, window._navLast.riderLat]);
        } else {
          coords.push([${rider.lng}, ${rider.lat}]);
        }
        if (coords.length < 1) return;
        var bounds = coords.reduce(function(b, c) { return b.extend(c); }, new mapboxgl.LngLatBounds(coords[0], coords[0]));
        window._programmaticCam = true;
        map.fitBounds(bounds, {
          padding: { top: 150, bottom: 120, left: 100, right: 100 },
          duration: 650,
          maxZoom: 15.5,
          pitch: 0,
          bearing: 0
        });
      }

      window.showRouteOverview = function(extraCoords) {
        window._followNavEnabled = false;
        window._navCamEngaged = false;
        window._navCamLast = null;
        notifyUserGesture();
        fitAll(extraCoords || []);
      };

      map.on('load', function() {
        ensureMapLabelsVisible(map);
        map.addSource('route', { type: 'geojson', data: route });
        map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 14 } });
        map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '${NAV_BLUE}', 'line-width': 11 } });
        map.addLayer({
          id: 'route-arrows',
          type: 'symbol',
          source: 'route',
          layout: {
            'symbol-placement': 'line',
            'symbol-spacing': 52,
            'text-field': '▶',
            'text-size': 14,
            'text-keep-upright': false,
            'text-rotation-alignment': 'map',
            'text-pitch-alignment': 'map'
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': '#1A73E8',
            'text-halo-width': 1.5
          }
        });

        map.addSource('maneuver-arrows', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
        map.addLayer({
          id: 'maneuver-arrows-layer',
          type: 'symbol',
          source: 'maneuver-arrows',
          layout: {
            'text-field': '▶',
            'text-size': 18,
            'text-rotate': ['get', 'bearing'],
            'text-keep-upright': false,
            'text-allow-overlap': true,
            'text-ignore-placement': true
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': '#0f172a',
            'text-halo-width': 2
          }
        });

        map.addSource('pickup-connector', { type: 'geojson', data: buildPickupConnector(route.geometry.coordinates) });
        map.addLayer({
          id: 'pickup-connector-line',
          type: 'line',
          source: 'pickup-connector',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '${NAV_BLUE}', 'line-width': 2.5, 'line-opacity': 0.55, 'line-dasharray': [1.5, 1.5] }
        });

        map.addSource('route-join', {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { visible: false } }
        });
        map.addLayer({
          id: 'route-join-dot',
          type: 'circle',
          source: 'route-join',
          filter: ['==', ['get', 'visible'], true],
          paint: {
            'circle-radius': 7,
            'circle-color': '#94a3b8',
            'circle-opacity': 0.72,
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-opacity': 0.95
          }
        });

        map.addSource('off-route-connector', {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } }
        });
        map.addLayer({
          id: 'off-route-connector-casing',
          type: 'line',
          source: 'off-route-connector',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#ffffff',
            'line-width': 7,
            'line-opacity': 0.92,
            'line-dasharray': [2, 2]
          }
        });
        map.addLayer({
          id: 'off-route-connector-line',
          type: 'line',
          source: 'off-route-connector',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '${NAV_OFF_ROUTE}',
            'line-width': 5,
            'line-opacity': 1,
            'line-dasharray': [2, 2]
          }
        });
        try {
          if (map.getLayer('off-route-connector-line')) {
            map.moveLayer('off-route-connector-casing');
            map.moveLayer('off-route-connector-line');
          }
        } catch (e) {}

        var pickupEl = document.createElement('div');
        pickupEl.innerHTML = '<div style="background:${destColor};color:#fff;font-weight:800;font-size:13px;padding:7px 14px;border-radius:12px;border:2px solid #fff;margin-bottom:6px;text-align:center;">${destLabel}</div><div style="width:18px;height:18px;background:${destColor};border:3px solid #fff;border-radius:9px;margin:0 auto;"></div>';
        pickupEl.style.textAlign = 'center';
        window.pickupMarker = new mapboxgl.Marker({ element: pickupEl, anchor: 'bottom' })
          .setLngLat([${pickup.lng}, ${pickup.lat}])
          .addTo(map);

        ${hasSecondary ? `
        var secEl = document.createElement('div');
        secEl.innerHTML = '<div style="background:${secColor};color:#fff;font-weight:800;font-size:12px;padding:6px 12px;border-radius:12px;border:2px solid #fff;margin-bottom:5px;text-align:center;opacity:0.9;">${secLabel}</div><div style="width:16px;height:16px;background:${secColor};border:3px solid #fff;border-radius:8px;margin:0 auto;"></div>';
        secEl.style.textAlign = 'center';
        window.secondaryMarker = new mapboxgl.Marker({ element: secEl, anchor: 'bottom' })
          .setLngLat([${secLng}, ${secLat}])
          .addTo(map);
        ` : 'window.secondaryMarker = null;'}

        var riderEl = (function(){ ${riderMarkerJs} })();
        window.riderMarker = new mapboxgl.Marker({ element: riderEl, anchor: 'center' })
          .setLngLat([${rider.lng}, ${rider.lat}])
          .addTo(map);

        map.easeTo({
          center: [${rider.lng}, ${rider.lat}],
          zoom: 16,
          pitch: 0,
          bearing: 0,
          duration: 0
        });
        map.resize();
        if (window._pendingAlts) {
          window.setAlternativeRoutes(window._pendingAlts);
          window._pendingAlts = null;
        }
        if (window._pendingOffRoute) {
          window.setOffRouteConnector(window._pendingOffRoute.feature, window._pendingOffRoute.wrongWay);
          window._pendingOffRoute = null;
        }
        if (window._pendingManeuverArrows) {
          window.setManeuverArrows(window._pendingManeuverArrows);
          window._pendingManeuverArrows = null;
        }
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
        }
      });

      function navBearing(coords, headingDeg) {
        if (headingDeg != null && !isNaN(headingDeg)) return headingDeg;
        if (!coords || coords.length < 2) return 0;
        var a = coords[0], b = coords[Math.min(3, coords.length - 1)];
        var dLng = (b[0] - a[0]) * Math.PI / 180;
        var lat1r = a[1] * Math.PI / 180, lat2r = b[1] * Math.PI / 180;
        var y = Math.sin(dLng) * Math.cos(lat2r);
        var x = Math.cos(lat1r) * Math.sin(lat2r) - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLng);
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
      }

      window._navCamLast = null;
      window._navCamEngaged = false;

      function shouldThrottleNavCam(centerLng, centerLat, bearing) {
        var last = window._navCamLast;
        if (!last) return false;
        var elapsed = Date.now() - last.atMs;
        if (elapsed < 480) {
          var dLng = (centerLng - last.lng) * Math.PI / 180;
          var lat1r = last.lat * Math.PI / 180;
          var lat2r = centerLat * Math.PI / 180;
          var y = Math.sin(dLng) * Math.cos(lat2r);
          var x = Math.cos(lat1r) * Math.sin(lat2r) - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLng);
          var distM = Math.acos(Math.min(1, Math.max(-1, Math.sin(lat1r) * Math.sin(lat2r) + Math.cos(lat1r) * Math.cos(lat2r) * Math.cos(dLng)))) * 6371000;
          var bDelta = Math.abs(((bearing - last.bearing + 540) % 360) - 180);
          if (distM < 5 && bDelta < 7) return true;
        }
        return false;
      }

      function followNavigationCamera(routeGeoJson, riderLng, riderLat, headingDeg, forceCam) {
        if (!routeGeoJson || !routeGeoJson.geometry) return;
        var coords = routeGeoJson.geometry.coordinates;
        if (!coords || coords.length < 2) return;
        var br = navBearing(coords, headingDeg);
        var anchor = coords[0];
        if (riderLng != null && riderLat != null && !isNaN(riderLng) && !isNaN(riderLat)) {
          anchor = [riderLng, riderLat];
        }
        var mPerDegLat = 111320;
        var mPerDegLng = 111320 * Math.cos(anchor[1] * Math.PI / 180);
        var aheadM = 80;
        var rad = br * Math.PI / 180;
        var dLat = (aheadM / mPerDegLat) * Math.cos(rad);
        var dLng = (aheadM / mPerDegLng) * Math.sin(rad);
        var cLng = anchor[0] + dLng;
        var cLat = anchor[1] + dLat;
        if (!forceCam && shouldThrottleNavCam(cLng, cLat, br)) return;
        var animate = !window._navCamEngaged || !!forceCam;
        window._navCamLast = { lng: cLng, lat: cLat, bearing: br, atMs: Date.now() };
        window._navCamEngaged = true;
        window._programmaticCam = true;
        map.easeTo({
          center: [cLng, cLat],
          zoom: 18,
          bearing: br,
          pitch: 52,
          duration: animate ? 320 : 0,
          padding: { top: 172, bottom: 120, left: 60, right: 60 }
        });
      }

      window.setMapStyle = function(styleUrl) {
        if (!map || !styleUrl) return;
        window._followNavEnabled = false;
        window._navCamEngaged = false;
        map.setStyle(styleUrl, function() {
          ensureMapLabelsVisible(map);
        });
      };

      window.setManeuverArrows = function(collection) {
        if (!map || !map.isStyleLoaded || !map.isStyleLoaded()) {
          window._pendingManeuverArrows = collection;
          return;
        }
        var src = map.getSource('maneuver-arrows');
        if (src) src.setData(collection || { type: 'FeatureCollection', features: [] });
      };

      window.setRouteJoinPoint = function(lng, lat) {
        if (!map || !map.isStyleLoaded || !map.isStyleLoaded()) return;
        var joinSrc = map.getSource('route-join');
        if (!joinSrc) return;
        if (lng == null || lat == null || isNaN(lng) || isNaN(lat)) {
          joinSrc.setData({ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { visible: false } });
          return;
        }
        joinSrc.setData({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: { visible: true }
        });
      };

      window.setOffRouteConnector = function(feature, wrongWay) {
        if (!map || !map.isStyleLoaded || !map.isStyleLoaded()) {
          window._pendingOffRoute = { feature: feature, wrongWay: wrongWay };
          return;
        }
        var src = map.getSource('off-route-connector');
        if (!src) return;
        var empty = { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } };
        var joinSrc = map.getSource('route-join');
        var joinEmpty = { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { visible: false } };
        if (!feature || !feature.geometry || !feature.geometry.coordinates || feature.geometry.coordinates.length < 2) {
          src.setData(empty);
          if (joinSrc) joinSrc.setData(joinEmpty);
          return;
        }
        src.setData(feature);
        var coords = feature.geometry.coordinates;
        var join = coords[coords.length - 1];
        if (joinSrc && join && join.length >= 2) {
          joinSrc.setData({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: join },
            properties: { visible: true }
          });
        }
        try {
          if (map.getLayer('off-route-connector-line')) {
            map.setPaintProperty('off-route-connector-line', 'line-color', wrongWay ? '${NAV_WRONG_WAY}' : '${NAV_OFF_ROUTE}');
            map.setPaintProperty('off-route-connector-line', 'line-width', wrongWay ? 5.5 : 5);
          }
          if (map.getLayer('off-route-connector-casing')) {
            map.setPaintProperty('off-route-connector-casing', 'line-width', wrongWay ? 8 : 7);
          }
        } catch (e) {}
      };

      window.updateRoute = function(routeGeoJson, riderLng, riderLat, pickupLng, pickupLat, headingDeg, followNav, forceCam, connectorJson, connectorWrongWay) {
        var src = map.getSource('route');
        if (src && routeGeoJson && routeGeoJson.geometry) src.setData(routeGeoJson);
        window._navLast = { routeGeoJson: routeGeoJson, riderLng: riderLng, riderLat: riderLat, pickupLng: pickupLng, pickupLat: pickupLat, headingDeg: headingDeg };
        if (connectorJson !== undefined) {
          window.setOffRouteConnector(connectorJson, !!connectorWrongWay);
        }
        if (window.riderMarker) {
          window.riderMarker.setLngLat([riderLng, riderLat]);
          var img = window.riderMarker.getElement().querySelector('#rider-bike-img');
          if (img && headingDeg != null && !isNaN(headingDeg)) {
            img.style.transform = 'rotate(' + headingDeg + 'deg)';
          }
        }
        if (window.pickupMarker && pickupLng != null && pickupLat != null && !isNaN(pickupLng) && !isNaN(pickupLat)) {
          window.pickupMarker.setLngLat([pickupLng, pickupLat]);
        }
        if (window.secondaryMarker && arguments.length >= 11) {
          var sLng = arguments[8], sLat = arguments[9];
          if (sLng != null && sLat != null && !isNaN(sLng) && !isNaN(sLat)) {
            window.secondaryMarker.setLngLat([sLng, sLat]);
            window.secondaryMarker.getElement().style.display = 'block';
          } else {
            window.secondaryMarker.getElement().style.display = 'none';
          }
        }
        if (routeGeoJson && routeGeoJson.geometry && routeGeoJson.geometry.coordinates) {
          var coords = routeGeoJson.geometry.coordinates;
          if (coords.length >= 1) {
            var end = coords[coords.length - 1];
            var plng = pickupLng != null ? pickupLng : ${pickupLng};
            var plat = pickupLat != null ? pickupLat : ${pickupLat};
            if (end && plng != null && plat != null) {
              var connector = { type: 'Feature', geometry: { type: 'LineString', coordinates: [end, [plng, plat]] } };
              var connSrc = map.getSource('pickup-connector');
              if (connSrc) connSrc.setData(connector);
            }
          }
          if (followNav && window._followNavEnabled) {
            followNavigationCamera(routeGeoJson, riderLng, riderLat, headingDeg, forceCam);
          }
        }
      };

      window.setFollowNavigation = function(on) {
        window._followNavEnabled = !!on;
        if (on && window._navLast) {
          var n = window._navLast;
          followNavigationCamera(n.routeGeoJson, n.riderLng, n.riderLat, n.headingDeg, true);
        }
      };

      window.zoomMap = function(delta) {
        window._followNavEnabled = false;
        notifyUserGesture();
        var z = map.getZoom();
        map.easeTo({
          zoom: Math.max(8, Math.min(21, z + delta)),
          duration: 220,
          pitch: map.getPitch(),
          bearing: map.getBearing()
        });
      };

      window.recenterMap = function(followNav) {
        if (followNav) {
          window._followNavEnabled = true;
          if (window._navLast) {
            var n = window._navLast;
            followNavigationCamera(n.routeGeoJson, n.riderLng, n.riderLat, n.headingDeg, true);
            return;
          }
        }
        window._navCamEngaged = false;
        window._navCamLast = null;
        fitAll();
      };
    })();
  <\/script>
</body>
</html>`;
}
