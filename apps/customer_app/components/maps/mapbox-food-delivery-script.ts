/** Mapbox GL JS — food delivery map (rider-app parity: remaining route + dashed connector, no fake cruise). */
export function mapboxFoodDeliveryScript(bikeUri: string): string {
  const uri = bikeUri.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  return `
      var markers = { pickup: null, drop: null, rider: null };
      var pickupZoneReady = false;
      var dropZoneReady = false;
      var pulsePhase = 0;
      var animFrame = null;
      var ROUTE_BLUE = '#1A56C6';
      var ROUTE_CONNECTOR = '#64748B';
      var ROUTE_CASING = '#FFFFFF';

      var state = {
        pickupLat: null,
        pickupLng: null,
        dropLat: null,
        dropLng: null,
        highlightPickupZone: false,
        highlightDropZone: false,
        riderArrived: false,
        hideRouteLine: false,
        geofenceRadiusM: 200,
        geofenceProximityM: 500,
        refitCamera: false,
        mapPhase: 'rider_to_pickup',
        initialFitDone: false,
        mapPadding: { top: 48, bottom: 40, left: 28, right: 28 },
      };

      function toRad(d) { return d * Math.PI / 180; }

      function haversineM(lat1, lng1, lat2, lng2) {
        var R = 6378137;
        var dLat = toRad(lat2 - lat1);
        var dLng = toRad(lng2 - lng1);
        var a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      }

      function pinHtml(kind) {
        if (kind === 'pickup') {
          return (
            '<div style="display:flex;flex-direction:column;align-items:center;">' +
            '<div style="width:34px;height:34px;border-radius:17px;background:#E23744;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(226,55,68,0.45);border:2.5px solid #fff;">' +
            '<div style="width:22px;height:22px;border-radius:11px;background:#1C1C1C;display:flex;align-items:center;justify-content:center;">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="#fff"><path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2h-2v4z"/></svg>' +
            '</div></div>' +
            '<div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid #E23744;margin-top:-1px;"></div>' +
            '</div>'
          );
        }
        return (
          '<div style="display:flex;flex-direction:column;align-items:center;">' +
          '<div style="width:34px;height:34px;border-radius:17px;background:#1C1C1C;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.28);border:2.5px solid #fff;">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>' +
          '</div>' +
          '<div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid #1C1C1C;margin-top:-1px;"></div>' +
          '</div>'
        );
      }

      function setPin(key, lat, lng, kind) {
        if (lat == null || lng == null) {
          if (markers[key]) { try { markers[key].remove(); } catch (e) {} markers[key] = null; }
          return;
        }
        if (!markers[key]) {
          var el = document.createElement('div');
          el.style.cssText = 'pointer-events:none;';
          el.innerHTML = pinHtml(kind);
          markers[key] = new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map);
        } else {
          markers[key].setLngLat([lng, lat]);
        }
      }

      function setRiderMarker(lat, lng, heading) {
        if (lat == null || lng == null) {
          if (markers.rider) { try { markers.rider.remove(); } catch (e) {} markers.rider = null; }
          return;
        }
        if (!markers.rider) {
          var el = document.createElement('div');
          el.style.cssText = 'width:44px;height:44px;display:flex;align-items:center;justify-content:center;pointer-events:none;';
          el.innerHTML = '<img class="gm-rider-img" src="${uri}" style="width:40px;height:40px;object-fit:contain;transform-origin:center center;" alt="" />';
          markers.rider = new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map);
        } else {
          markers.rider.setLngLat([lng, lat]);
        }
        var img = markers.rider.getElement().querySelector('.gm-rider-img');
        if (img && heading != null && !isNaN(heading)) {
          img.style.transform = 'rotate(' + heading + 'deg)';
        }
      }

      function ensureLineLayer(sourceId, layerId, paint, layout) {
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } }
          });
        }
        if (!map.getLayer(layerId)) {
          map.addLayer({
            id: layerId,
            type: 'line',
            source: sourceId,
            layout: layout || { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
            paint: paint
          });
        }
      }

      function ensureRouteLayers() {
        ensureLineLayer('route-remaining', 'route-remaining-casing', {
          'line-color': ROUTE_CASING,
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 4, 14, 5, 16, 6],
          'line-opacity': 0.9
        });
        ensureLineLayer('route-remaining', 'route-remaining-line', {
          'line-color': ROUTE_BLUE,
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 14, 3.5, 16, 4.5],
          'line-opacity': 0.96
        }, { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' });

        ensureLineLayer('route-connector', 'route-connector-line', {
          'line-color': ROUTE_CONNECTOR,
          'line-width': 4,
          'line-opacity': 0.85,
          'line-dasharray': [1.5, 1.5]
        }, { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' });

        ensureLineLayer('route-pre-rider', 'route-pre-rider-line', {
          'line-color': '#1C1C1C',
          'line-width': 3,
          'line-opacity': 0.9,
          'line-dasharray': [2, 2]
        }, { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' });

        if (!map.getSource('route-join')) {
          map.addSource('route-join', {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'Point', coordinates: [] } }
          });
          map.addLayer({
            id: 'route-join-dot',
            type: 'circle',
            source: 'route-join',
            paint: {
              'circle-radius': 5,
              'circle-color': ROUTE_BLUE,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff'
            },
            layout: { visibility: 'none' }
          });
        }
      }

      function setLineData(sourceId, coords, layerIds) {
        var src = map.getSource(sourceId);
        if (!src) return;
        if (!coords || coords.length < 2) {
          src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] } });
          layerIds.forEach(function(id) {
            if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
          });
          return;
        }
        var line = coords.map(function(c) { return [c.longitude, c.latitude]; });
        src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: line } });
        layerIds.forEach(function(id) {
          if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
        });
      }

      function setJoinDot(lat, lng, visible) {
        var src = map.getSource('route-join');
        if (!src) return;
        if (!visible || lat == null || lng == null) {
          map.setLayoutProperty('route-join-dot', 'visibility', 'none');
          return;
        }
        src.setData({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] } });
        map.setLayoutProperty('route-join-dot', 'visibility', 'visible');
      }

      function circlePolygon(lng, lat, radiusM, steps) {
        var coords = [];
        var dist = radiusM / 6378137;
        for (var i = 0; i <= (steps || 64); i++) {
          var bearing = (i / (steps || 64)) * 2 * Math.PI;
          var latRad = lat * Math.PI / 180;
          var lngRad = lng * Math.PI / 180;
          var pLat = Math.asin(
            Math.sin(latRad) * Math.cos(dist) +
            Math.cos(latRad) * Math.sin(dist) * Math.cos(bearing)
          );
          var pLng =
            lngRad +
            Math.atan2(
              Math.sin(bearing) * Math.sin(dist) * Math.cos(latRad),
              Math.cos(dist) - Math.sin(latRad) * Math.sin(pLat)
            );
          coords.push([pLng * 180 / Math.PI, pLat * 180 / Math.PI]);
        }
        return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] } };
      }

      function ensureZoneLayers(sourceId, fillId, strokeId) {
        if (map.getSource(sourceId)) return;
        map.addSource(sourceId, {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] } }
        });
        map.addLayer({ id: fillId, type: 'fill', source: sourceId, paint: { 'fill-color': '#22C55E', 'fill-opacity': 0.14 } });
        map.addLayer({ id: strokeId, type: 'line', source: sourceId, paint: { 'line-color': '#22C55E', 'line-opacity': 0.35, 'line-width': 1.5 } });
      }

      function updateZone(sourceId, fillId, strokeId, lat, lng, visible, radiusM) {
        ensureZoneLayers(sourceId, fillId, strokeId);
        var src = map.getSource(sourceId);
        if (!src) return;
        if (!visible || lat == null || lng == null) {
          src.setData({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] } });
          map.setLayoutProperty(fillId, 'visibility', 'none');
          map.setLayoutProperty(strokeId, 'visibility', 'none');
          return;
        }
        src.setData(circlePolygon(lng, lat, radiusM || 200, 64));
        map.setLayoutProperty(fillId, 'visibility', 'visible');
        map.setLayoutProperty(strokeId, 'visibility', 'visible');
        var fillOp = 0.14 + Math.sin(pulsePhase) * 0.08;
        map.setPaintProperty(fillId, 'fill-opacity', fillOp);
      }

      function activeDestination() {
        if (state.mapPhase === 'rider_to_drop') {
          return { lat: state.dropLat, lng: state.dropLng };
        }
        return { lat: state.pickupLat, lng: state.pickupLng };
      }

      function fitMapToContent(data) {
        var pts = [];
        function push(lat, lng) {
          if (lat != null && lng != null) pts.push([lng, lat]);
        }
        if (data.preRiderArcRoute && data.preRiderArcRoute.length >= 2) {
          data.preRiderArcRoute.forEach(function(c) { push(c.latitude, c.longitude); });
        } else if (data.remainingRoute && data.remainingRoute.length) {
          data.remainingRoute.forEach(function(c) { push(c.latitude, c.longitude); });
        } else if (data.fullRoute && data.fullRoute.length) {
          data.fullRoute.forEach(function(c) { push(c.latitude, c.longitude); });
        }
        push(data.riderLat, data.riderLng);
        push(data.pickupLat, data.pickupLng);
        push(data.dropLat, data.dropLng);
        var dest = activeDestination();
        push(dest.lat, dest.lng);
        if (pts.length < 1) return;
        var bounds = pts.reduce(function(b, c) { return b.extend(c); }, new mapboxgl.LngLatBounds(pts[0], pts[0]));
        var pad = state.mapPadding || { top: 48, bottom: 40, left: 28, right: 28 };
        map.fitBounds(bounds, {
          padding: pad,
          duration: state.refitCamera ? 650 : 900,
          maxZoom: 16
        });
        state.initialFitDone = true;
        state.refitCamera = false;
      }

      function tick() {
        pulsePhase += 0.06;
        animFrame = requestAnimationFrame(tick);
      }

      function startPulse() {
        if (animFrame != null) return;
        animFrame = requestAnimationFrame(tick);
      }

      window.updateDeliveryMap = function(data) {
        ensureRouteLayers();
        state.pickupLat = data.pickupLat;
        state.pickupLng = data.pickupLng;
        state.dropLat = data.dropLat;
        state.dropLng = data.dropLng;
        state.highlightPickupZone = !!data.highlightPickupZone;
        state.highlightDropZone = !!data.highlightDropZone;
        state.riderArrived = !!data.riderArrived;
        state.hideRouteLine = !!data.hideRouteLine;
        state.geofenceRadiusM = data.geofenceRadiusM || 200;
        state.geofenceProximityM = data.geofenceProximityM || 500;
        state.refitCamera = !!data.refitCamera;
        state.mapPhase = data.mapPhase || 'rider_to_pickup';
        if (data.mapPadding) state.mapPadding = data.mapPadding;

        var showPickup = state.mapPhase === 'rider_to_pickup' && state.highlightPickupZone;
        var showDrop = state.mapPhase === 'rider_to_drop' && state.highlightDropZone;
        updateZone('pickup-zone', 'pickup-zone-fill', 'pickup-zone-stroke', state.pickupLat, state.pickupLng, showPickup, state.geofenceRadiusM);
        updateZone('drop-zone', 'drop-zone-fill', 'drop-zone-stroke', state.dropLat, state.dropLng, showDrop, state.geofenceRadiusM);
        if (showPickup || showDrop) startPulse();

        setPin('pickup', data.pickupLat, data.pickupLng, 'pickup');
        setPin('drop', data.dropLat, data.dropLng, 'drop');
        setRiderMarker(data.riderLat, data.riderLng, data.riderHeading);

        var hideRoute = state.hideRouteLine || state.riderArrived;
        var preRiderArc = data.preRiderArcRoute && data.preRiderArcRoute.length >= 2 ? data.preRiderArcRoute : null;
        if (preRiderArc) {
          setLineData('route-pre-rider', preRiderArc, ['route-pre-rider-line']);
          setLineData('route-remaining', [], ['route-remaining-casing', 'route-remaining-line']);
          setLineData('route-connector', [], ['route-connector-line']);
          setJoinDot(null, null, false);
        } else if (hideRoute) {
          setLineData('route-pre-rider', [], ['route-pre-rider-line']);
          setLineData('route-remaining', [], ['route-remaining-casing', 'route-remaining-line']);
          setLineData('route-connector', [], ['route-connector-line']);
          setJoinDot(null, null, false);
        } else {
          setLineData('route-pre-rider', [], ['route-pre-rider-line']);
          var remaining = data.remainingRoute && data.remainingRoute.length >= 2
            ? data.remainingRoute
            : (data.fullRoute && data.fullRoute.length >= 2 ? data.fullRoute : []);
          setLineData('route-remaining', remaining, ['route-remaining-casing', 'route-remaining-line']);
          setLineData('route-connector', data.connectorRoute || [], ['route-connector-line']);
          setJoinDot(data.routeJoinLat, data.routeJoinLng, !!(data.routeJoinLat != null && data.connectorRoute && data.connectorRoute.length >= 2));
        }

        if (state.refitCamera || !state.initialFitDone) {
          fitMapToContent(data);
        }
      };
  `;
}
