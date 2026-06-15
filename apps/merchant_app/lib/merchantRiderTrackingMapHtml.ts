import type { MerchantRiderTrackingPayload } from "@/services/riderTrackingApi";

function escapeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

const MARKER_CSS = `
.gm-location-marker{display:flex;flex-direction:column;align-items:center;pointer-events:auto;filter:drop-shadow(0 4px 10px rgba(15,23,42,0.22))}
.gm-location-marker--store{z-index:3}
.gm-location-marker--rider{z-index:5}
.gm-location-marker__chip{display:none;flex-direction:column;align-items:stretch;gap:2px;max-width:168px;margin-bottom:6px;padding:6px 8px;padding-top:4px;border-radius:10px;border:1px solid rgba(255,255,255,0.9);background:rgba(255,255,255,0.97);text-align:center;box-shadow:0 2px 8px rgba(15,23,42,0.12);position:relative;pointer-events:auto}
.gm-location-marker--label-open .gm-location-marker__chip{display:flex}
.gm-location-marker__chip-header{display:flex;align-items:center;justify-content:center;gap:6px;width:100%}
.gm-location-marker__close{flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;margin-left:auto;padding:0;border:none;border-radius:999px;background:#f1f5f9;color:#64748b;font-size:14px;line-height:1;cursor:pointer}
.gm-location-marker--store .gm-location-marker__badge{color:#111827;background:#f1f5f9}
.gm-location-marker__badge{display:inline-flex;align-items:center;border-radius:999px;padding:1px 8px;font-size:9px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;line-height:1.4}
.gm-location-marker__name{display:block;max-width:152px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:600;color:#0f172a;line-height:1.3}
.gm-location-marker__pin{display:flex;align-items:center;justify-content:center;pointer-events:auto;cursor:pointer}
.gm-teardrop-pin{position:relative;width:28px;height:38px}
.gm-teardrop-pin__shape{display:block;width:100%;height:100%}
.gm-location-marker--store .gm-teardrop-pin__shape{fill:#1a1a1a}
.gm-teardrop-pin__icon{position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;pointer-events:none}
.gm-location-marker__pin--teardrop{width:28px;height:38px}
.gm-location-marker__bike{display:block;width:34px;height:34px;object-fit:contain;pointer-events:none;transform-origin:center center;transition:transform 0.35s ease-out}
`;

export function buildMerchantRiderTrackingMapHtml(
  mapboxToken: string,
  payload: MerchantRiderTrackingPayload,
  mapbikeUri: string
): string {
  const store = payload.store;
  const rider = payload.location;
  const center = rider ?? store ?? { latitude: 20.5937, longitude: 78.9629 };
  const zoom = rider && store ? 13 : 14;
  const dataJson = escapeJson({
    store,
    storeName: payload.store_name,
    rider,
    trail: payload.trail ?? [],
  });
  const bikeSrc = escapeJson(mapbikeUri);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link href="https://api.mapbox.com/mapbox-gl-js/v3.8.0/mapbox-gl.css" rel="stylesheet" />
  <script src="https://api.mapbox.com/mapbox-gl-js/v3.8.0/mapbox-gl.js"><\/script>
  <style>
    html, body, #map { margin:0; padding:0; width:100%; height:100%; background:#f1f5f9; }
    ${MARKER_CSS}
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    mapboxgl.accessToken = ${JSON.stringify(mapboxToken)};
    var MAPBIKE_SRC = ${bikeSrc};
    var mapData = ${dataJson};
    var routeCoords = null;
    var routeInflight = false;
    var lastRouteFrom = null;
    var ROUTE_REFRESH_METERS = 35;
    var CONNECTOR_MIN_METERS = 6;
    var SAME_POINT_METERS = 18;

    var map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [${center.longitude}, ${center.latitude}],
      zoom: ${zoom},
      attributionControl: false
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    var storeMarker = null;
    var riderMarker = null;
    var storeLabelOpen = false;

    var TEARDROP_PIN_SVG = '<svg class="gm-teardrop-pin__shape" viewBox="0 0 32 42" aria-hidden="true"><path d="M16 0C8.82 0 3 5.58 3 12.46c0 8.12 11.11 20.9 12.28 22.22a1.2 1.2 0 0 0 1.44 0C17.89 33.36 29 20.58 29 12.46 29 5.58 23.18 0 16 0z"/></svg>';
    var STORE_BUILDING_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>';

    function haversineM(a, b) {
      var R = 6371000;
      var toRad = function(d) { return d * Math.PI / 180; };
      var dLat = toRad(b[1] - a[1]);
      var dLon = toRad(b[0] - a[0]);
      var lat1 = toRad(a[1]);
      var lat2 = toRad(b[1]);
      var h = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)*Math.sin(dLon/2);
      return 2 * R * Math.asin(Math.sqrt(h));
    }

    function samePoint(a, b) {
      return haversineM(a, b) < SAME_POINT_METERS;
    }

    function fitBounds() {
      var coords = [];
      if (routeCoords && routeCoords.length >= 2) {
        routeCoords.forEach(function(c) { coords.push(c); });
      } else {
        if (mapData.store) coords.push([mapData.store.longitude, mapData.store.latitude]);
        if (mapData.rider) coords.push([mapData.rider.longitude, mapData.rider.latitude]);
      }
      if (coords.length === 0) return;
      if (coords.length === 1) {
        map.easeTo({ center: coords[0], zoom: 15, duration: 600 });
        return;
      }
      var bounds = coords.reduce(function(b, c) { return b.extend(c); }, new mapboxgl.LngLatBounds(coords[0], coords[0]));
      map.fitBounds(bounds, { padding: 56, maxZoom: 16, duration: 700 });
    }

    function ensureRouteLayers() {
      if (!map.getSource('active-route')) {
        map.addSource('active-route', {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } }
        });
        map.addLayer({
          id: 'active-route-casing',
          type: 'line',
          source: 'active-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 1 }
        });
        map.addLayer({
          id: 'active-route-line',
          type: 'line',
          source: 'active-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#22c55e', 'line-width': 4, 'line-opacity': 0.95 }
        });
      }
      if (!map.getSource('route-connectors')) {
        map.addSource('route-connectors', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
        map.addLayer({
          id: 'route-connectors-casing',
          type: 'line',
          source: 'route-connectors',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 1 }
        });
        map.addLayer({
          id: 'route-connectors-line',
          type: 'line',
          source: 'route-connectors',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#22c55e',
            'line-width': 2.5,
            'line-opacity': 0.95,
            'line-dasharray': [1.2, 1.8]
          }
        });
      }
    }

    function applyRouteGeometry(coords) {
      var src = map.getSource('active-route');
      if (!src) return;
      if (!coords || coords.length < 2) {
        src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] } });
        return;
      }
      src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } });
    }

    function applyConnectorLines(routeCoords, riderLngLat, storeLngLat) {
      var src = map.getSource('route-connectors');
      if (!src) return;
      if (!routeCoords || routeCoords.length < 2) {
        src.setData({ type: 'FeatureCollection', features: [] });
        return;
      }
      var routeStart = routeCoords[0];
      var routeEnd = routeCoords[routeCoords.length - 1];
      var segments = [];
      function pushSegment(from, to) {
        if (haversineM(from, to) < CONNECTOR_MIN_METERS) return;
        segments.push({ from: from, to: to });
      }
      if (storeLngLat) pushSegment(routeEnd, storeLngLat);
      if (riderLngLat) pushSegment(riderLngLat, routeStart);
      src.setData({
        type: 'FeatureCollection',
        features: segments.map(function(seg, index) {
          return {
            type: 'Feature',
            properties: { id: index },
            geometry: { type: 'LineString', coordinates: [seg.from, seg.to] }
          };
        })
      });
    }

    function createStoreMarkerElement(storeName) {
      var displayName = (storeName || '').trim();
      var root = document.createElement('div');
      root.className = 'gm-location-marker gm-location-marker--store';
      if (storeLabelOpen) root.classList.add('gm-location-marker--label-open');

      var chip = document.createElement('div');
      chip.className = 'gm-location-marker__chip';
      var chipHeader = document.createElement('div');
      chipHeader.className = 'gm-location-marker__chip-header';
      var badge = document.createElement('span');
      badge.className = 'gm-location-marker__badge';
      badge.textContent = 'Store Location';
      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'gm-location-marker__close';
      closeBtn.setAttribute('aria-label', 'Hide store label');
      closeBtn.textContent = '×';
      closeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        storeLabelOpen = false;
        root.classList.remove('gm-location-marker--label-open');
      });
      chipHeader.appendChild(badge);
      chipHeader.appendChild(closeBtn);
      chip.appendChild(chipHeader);
      if (displayName) {
        var nameEl = document.createElement('span');
        nameEl.className = 'gm-location-marker__name';
        nameEl.textContent = displayName;
        chip.appendChild(nameEl);
      }

      var pin = document.createElement('div');
      pin.className = 'gm-location-marker__pin gm-location-marker__pin--teardrop';
      var wrap = document.createElement('div');
      wrap.className = 'gm-teardrop-pin';
      wrap.innerHTML = TEARDROP_PIN_SVG;
      var icon = document.createElement('div');
      icon.className = 'gm-teardrop-pin__icon gm-teardrop-pin__icon--store';
      icon.innerHTML = STORE_BUILDING_SVG;
      wrap.appendChild(icon);
      pin.appendChild(wrap);
      pin.addEventListener('click', function(e) {
        e.stopPropagation();
        storeLabelOpen = true;
        root.classList.add('gm-location-marker--label-open');
      });

      root.appendChild(chip);
      root.appendChild(pin);
      return root;
    }

    function createRiderMarkerElement(headingDeg) {
      var root = document.createElement('div');
      root.className = 'gm-location-marker gm-location-marker--rider';
      var img = document.createElement('img');
      img.src = MAPBIKE_SRC;
      img.alt = 'Rider';
      img.className = 'gm-location-marker__bike';
      img.draggable = false;
      if (headingDeg != null && isFinite(headingDeg)) {
        img.style.transform = 'rotate(' + headingDeg + 'deg)';
      }
      root.appendChild(img);
      return root;
    }

    function setRiderHeading(marker, headingDeg) {
      if (headingDeg == null || !isFinite(headingDeg)) return;
      var img = marker.getElement().querySelector('.gm-location-marker__bike');
      if (img) img.style.transform = 'rotate(' + headingDeg + 'deg)';
    }

    function fetchDrivingRoute(from, to) {
      if (routeInflight || samePoint(from, to)) return;
      var moved = lastRouteFrom ? haversineM(lastRouteFrom, from) : Infinity;
      if (moved < ROUTE_REFRESH_METERS && routeCoords && routeCoords.length >= 2) {
        var riderLngLat = mapData.rider ? [mapData.rider.longitude, mapData.rider.latitude] : null;
        var storeLngLat = mapData.store ? [mapData.store.longitude, mapData.store.latitude] : null;
        applyConnectorLines(routeCoords, riderLngLat, storeLngLat);
        return;
      }
      routeInflight = true;
      var url = 'https://api.mapbox.com/directions/v5/mapbox/driving/' +
        from[0] + ',' + from[1] + ';' + to[0] + ',' + to[1] +
        '?overview=full&geometries=geojson&access_token=' + encodeURIComponent(mapboxgl.accessToken);
      fetch(url).then(function(res) { return res.json(); }).then(function(json) {
        var coords = json.routes && json.routes[0] && json.routes[0].geometry && json.routes[0].geometry.coordinates;
        if (coords && coords.length >= 2) {
          routeCoords = coords;
          lastRouteFrom = from;
          applyRouteGeometry(coords);
          var riderLngLat = mapData.rider ? [mapData.rider.longitude, mapData.rider.latitude] : null;
          var storeLngLat = mapData.store ? [mapData.store.longitude, mapData.store.latitude] : null;
          applyConnectorLines(coords, riderLngLat, storeLngLat);
          fitBounds();
        }
      }).catch(function() {}).finally(function() { routeInflight = false; });
    }

    function renderMarkers() {
      if (mapData.store) {
        var storeLngLat = [mapData.store.longitude, mapData.store.latitude];
        if (!storeMarker) {
          storeMarker = new mapboxgl.Marker({
            element: createStoreMarkerElement(mapData.storeName),
            anchor: 'bottom'
          })
            .setLngLat(storeLngLat)
            .addTo(map);
        } else {
          storeMarker.setLngLat(storeLngLat);
        }
      }

      if (mapData.rider) {
        var riderLngLat = [mapData.rider.longitude, mapData.rider.latitude];
        var heading = mapData.rider.heading_degrees;
        if (!riderMarker) {
          riderMarker = new mapboxgl.Marker({
            element: createRiderMarkerElement(heading),
            anchor: 'center'
          })
            .setLngLat(riderLngLat)
            .addTo(map);
        } else {
          riderMarker.setLngLat(riderLngLat);
          setRiderHeading(riderMarker, heading);
        }
      }

      if (mapData.rider && mapData.store) {
        var from = [mapData.rider.longitude, mapData.rider.latitude];
        var to = [mapData.store.longitude, mapData.store.latitude];
        fetchDrivingRoute(from, to);
      } else {
        applyRouteGeometry([]);
        applyConnectorLines([], null, null);
      }

      if (!routeCoords || routeCoords.length < 2) {
        fitBounds();
      }
    }

    map.on('load', function() {
      ensureRouteLayers();
      renderMarkers();
    });

    window.updateRiderTrackingMap = function(next) {
      mapData = next || mapData;
      if (map.isStyleLoaded()) {
        ensureRouteLayers();
        renderMarkers();
      }
    };
  </script>
</body>
</html>`;
}

export function buildMapUpdateScript(payload: MerchantRiderTrackingPayload): string {
  const dataJson = JSON.stringify({
    store: payload.store,
    storeName: payload.store_name,
    rider: payload.location,
    trail: payload.trail ?? [],
  }).replace(/</g, "\\u003c");
  return `window.updateRiderTrackingMap && window.updateRiderTrackingMap(${dataJson}); true;`;
}
