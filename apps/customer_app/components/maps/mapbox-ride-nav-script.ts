/** Google Maps–style live navigation: smooth camera follow, auto-rotate, traveled/remaining route. */
export function mapboxRideNavScript(): string {
  return `
      var navMode = false;
      var navDropLat = null;
      var navDropLng = null;
      var navFullRoute = [];
      var navDestMarker = null;
      var navRiderLat = null;
      var navRiderLng = null;
      var navRiderHeading = null;
      var navSmoothBearing = null;
      var navLastCameraTs = 0;
      var navFollowTimer = null;
      var navTargetBearing = null;
      var navTargetCenter = null;
      var navTargetZoom = 17.42;
      var navCameraRaf = null;
      var navTurnSeverity = 0;
      var navCameraBoot = 0;

      var NAV_BLUE = '#1A73E8';
      var NAV_BLUE_GLOW = '#4285F4';
      var NAV_TRAVELED = '#A8C7FA';
      var NAV_CASING = '#FFFFFF';
      var NAV_CAMERA_MIN_MS = 160;
      var NAV_LOOKAHEAD_M = 88;
      var NAV_TURN_LOOKAHEAD_M = 52;
      var NAV_TURN_SCAN_M = 200;
      var NAV_TURN_ANTICIPATE_M = 95;
      var NAV_CONNECTOR = '#64748B';
      var FRONT_WHEEL_OFFSET_M = 2;
      var CONNECTOR_MIN_GAP_M = 0.5;

      function haversineM(lat1, lng1, lat2, lng2) {
        var R = 6378137;
        var dLat = (lat2 - lat1) * Math.PI / 180;
        var dLng = (lng2 - lng1) * Math.PI / 180;
        var a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      }

      function computeBearing(lat1, lng1, lat2, lng2) {
        var dLon = (lng2 - lng1) * Math.PI / 180;
        var y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
        var x =
          Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
          Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
      }

      function smoothBearing(target, alpha) {
        if (target == null || isNaN(target)) return navSmoothBearing;
        if (navSmoothBearing == null) {
          navSmoothBearing = target;
          return target;
        }
        var diff = ((target - navSmoothBearing + 540) % 360) - 180;
        if (Math.abs(diff) < 0.35) return navSmoothBearing;
        navSmoothBearing = (navSmoothBearing + diff * alpha + 360) % 360;
        return navSmoothBearing;
      }

      function lerpAngle(from, to, t) {
        if (from == null || to == null) return to != null ? to : from;
        var diff = ((to - from + 540) % 360) - 180;
        return (from + diff * t + 360) % 360;
      }

      function lerpNum(from, to, t) {
        return from + (to - from) * t;
      }

      function offsetLatLng(lat, lng, bearingDeg, distanceM) {
        var R = 6378137;
        var brng = bearingDeg * Math.PI / 180;
        var lat1 = lat * Math.PI / 180;
        var lng1 = lng * Math.PI / 180;
        var lat2 = Math.asin(
          Math.sin(lat1) * Math.cos(distanceM / R) +
          Math.cos(lat1) * Math.sin(distanceM / R) * Math.cos(brng)
        );
        var lng2 =
          lng1 +
          Math.atan2(
            Math.sin(brng) * Math.sin(distanceM / R) * Math.cos(lat1),
            Math.cos(distanceM / R) - Math.sin(lat1) * Math.sin(lat2)
          );
        return { lat: lat2 * 180 / Math.PI, lng: lng2 * 180 / Math.PI };
      }

      function closestPointOnSegment(px, py, ax, ay, bx, by) {
        var dx = bx - ax;
        var dy = by - ay;
        if (dx === 0 && dy === 0) {
          return { lat: ax, lng: ay, t: 0, dist: haversineM(px, py, ax, ay) };
        }
        var t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
        if (t < 0) t = 0;
        if (t > 1) t = 1;
        var lat = ax + t * dy;
        var lng = ay + t * dx;
        return { lat: lat, lng: lng, t: t, dist: haversineM(px, py, lat, lng) };
      }

      function snapToRoute(route, rider) {
        if (!route || route.length < 2 || !rider) return null;
        var best = null;
        for (var i = 0; i < route.length - 1; i++) {
          var a = route[i];
          var b = route[i + 1];
          var snap = closestPointOnSegment(
            rider.latitude, rider.longitude,
            a.latitude, a.longitude,
            b.latitude, b.longitude
          );
          if (!best || snap.dist < best.dist) {
            best = { segIndex: i, lat: snap.lat, lng: snap.lng, t: snap.t, dist: snap.dist };
          }
        }
        return best;
      }

      function pointAheadOnRoute(route, snap, metersAhead) {
        if (!route || route.length < 2 || !snap) return null;
        var remaining = metersAhead;
        var i = snap.segIndex;
        var segStart = { latitude: snap.lat, longitude: snap.lng };
        while (i < route.length - 1 && remaining > 0) {
          var segEnd = route[i + 1];
          var segLen = haversineM(segStart.latitude, segStart.longitude, segEnd.latitude, segEnd.longitude);
          if (segLen <= 0.5) {
            i += 1;
            segStart = segEnd;
            continue;
          }
          if (remaining <= segLen) {
            var frac = remaining / segLen;
            return {
              latitude: segStart.latitude + (segEnd.latitude - segStart.latitude) * frac,
              longitude: segStart.longitude + (segEnd.longitude - segStart.longitude) * frac
            };
          }
          remaining -= segLen;
          i += 1;
          segStart = segEnd;
        }
        return route[route.length - 1];
      }

      function nearestRouteIndex(route, rider) {
        var snap = snapToRoute(route, rider);
        return snap ? snap.segIndex : 0;
      }

      function findUpcomingTurn(route, snap) {
        if (!route || route.length < 3 || !snap) return null;
        var distAlong = haversineM(
          snap.lat, snap.lng,
          route[snap.segIndex + 1].latitude, route[snap.segIndex + 1].longitude
        );
        for (var i = snap.segIndex; i < route.length - 2 && distAlong <= NAV_TURN_SCAN_M; i++) {
          var a = route[i];
          var b = route[i + 1];
          var c = route[i + 2];
          var b1 = computeBearing(a.latitude, a.longitude, b.latitude, b.longitude);
          var b2 = computeBearing(b.latitude, b.longitude, c.latitude, c.longitude);
          var delta = Math.abs(((b2 - b1 + 540) % 360) - 180);
          if (delta >= 14) {
            return { angle: delta, distanceM: distAlong, bearingAfter: b2, vertexIndex: i + 1 };
          }
          distAlong += haversineM(b.latitude, b.longitude, c.latitude, c.longitude);
        }
        return null;
      }

      function routeLookAheadBearing(route, rider) {
        if (!route || route.length < 2 || !rider) return null;
        var snap = snapToRoute(route, rider);
        if (!snap) return null;

        var distToDrop = navDropLat != null && navDropLng != null
          ? haversineM(rider.latitude, rider.longitude, navDropLat, navDropLng)
          : Infinity;

        if (distToDrop < 35 && navDropLat != null && navDropLng != null) {
          navTurnSeverity = 0;
          return computeBearing(rider.latitude, rider.longitude, navDropLat, navDropLng);
        }

        var upcoming = findUpcomingTurn(route, snap);
        var turnWeight = 0;
        if (upcoming && upcoming.distanceM <= NAV_TURN_ANTICIPATE_M) {
          turnWeight = Math.min(1, 1 - upcoming.distanceM / NAV_TURN_ANTICIPATE_M);
          turnWeight *= Math.min(1, upcoming.angle / 55);
          navTurnSeverity = upcoming.angle * turnWeight;
        } else {
          navTurnSeverity = 0;
        }

        var lookM = distToDrop < 120
          ? NAV_TURN_LOOKAHEAD_M
          : (turnWeight > 0.25 ? NAV_TURN_LOOKAHEAD_M + turnWeight * 28 : NAV_LOOKAHEAD_M);
        var ahead = pointAheadOnRoute(route, snap, lookM);
        if (!ahead) return null;

        var segBearing = computeBearing(
          route[snap.segIndex].latitude,
          route[snap.segIndex].longitude,
          route[Math.min(snap.segIndex + 1, route.length - 1)].latitude,
          route[Math.min(snap.segIndex + 1, route.length - 1)].longitude
        );
        var aheadBearing = computeBearing(snap.lat, snap.lng, ahead.latitude, ahead.longitude);

        if (upcoming && turnWeight > 0.08) {
          var postTurnBearing = computeBearing(
            route[upcoming.vertexIndex - 1].latitude,
            route[upcoming.vertexIndex - 1].longitude,
            route[Math.min(upcoming.vertexIndex, route.length - 1)].latitude,
            route[Math.min(upcoming.vertexIndex, route.length - 1)].longitude
          );
          var blended = lerpAngle(segBearing, postTurnBearing, turnWeight * 0.82);
          blended = lerpAngle(blended, aheadBearing, 1 - turnWeight * 0.45);
          return blended;
        }

        if (Math.abs(((aheadBearing - segBearing + 540) % 360) - 180) < 8) return segBearing;
        return aheadBearing;
      }

      function splitRouteAtRider(route, rider) {
        if (!route || route.length < 2) return { traveled: [], remaining: route || [] };
        if (!rider) return { traveled: [], remaining: route };
        var snap = snapToRoute(route, rider);
        var idx = snap ? snap.segIndex : 0;
        var traveled = route.slice(0, idx + 1);
        if (snap) traveled.push({ latitude: snap.lat, longitude: snap.lng });
        var remaining = [{ latitude: snap ? snap.lat : rider.latitude, longitude: snap ? snap.lng : rider.longitude }]
          .concat(route.slice(idx + 1));
        if (remaining.length > 1 && haversineM(
          remaining[0].latitude, remaining[0].longitude,
          remaining[1].latitude, remaining[1].longitude
        ) < 2) {
          remaining = remaining.slice(1);
        }
        if (remaining.length < 2) {
          remaining = [{ latitude: rider.latitude, longitude: rider.longitude }, route[route.length - 1]];
        }
        return { traveled: traveled, remaining: remaining };
      }

      function riderFrontWheelPoint(lat, lng, heading, fallbackBearing) {
        var h = heading;
        if (h == null || isNaN(h)) h = fallbackBearing != null ? fallbackBearing : 0;
        var pt = offsetLatLng(lat, lng, h, FRONT_WHEEL_OFFSET_M);
        return { latitude: pt.lat, longitude: pt.lng };
      }

      function ensureConnectorLayers() {
        if (!map.getSource('nav-connector')) {
          map.addSource('nav-connector', {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } }
          });
          map.addLayer({
            id: 'nav-connector-casing',
            type: 'line',
            source: 'nav-connector',
            layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
            paint: {
              'line-color': '#FFFFFF',
              'line-width': ['interpolate', ['linear'], ['zoom'], 12, 5, 15, 7, 17, 8],
              'line-opacity': 0.92
            }
          });
          map.addLayer({
            id: 'nav-connector-line',
            type: 'line',
            source: 'nav-connector',
            layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
            paint: {
              'line-color': NAV_CONNECTOR,
              'line-width': ['interpolate', ['linear'], ['zoom'], 12, 3, 15, 4, 17, 4.5],
              'line-opacity': 0.9,
              'line-dasharray': [1.4, 1.4]
            }
          });
        }
        if (!map.getSource('nav-connector-join')) {
          map.addSource('nav-connector-join', {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'Point', coordinates: [] } }
          });
          map.addLayer({
            id: 'nav-connector-join-dot',
            type: 'circle',
            source: 'nav-connector-join',
            layout: { visibility: 'none' },
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 4, 15, 5.5, 17, 6],
              'circle-color': '#FFFFFF',
              'circle-stroke-color': NAV_BLUE,
              'circle-stroke-width': 2.5
            }
          });
        }
      }

      function hideRideConnector() {
        ensureConnectorLayers();
        var lineSrc = map.getSource('nav-connector');
        var dotSrc = map.getSource('nav-connector-join');
        if (lineSrc) {
          lineSrc.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] } });
          map.setLayoutProperty('nav-connector-casing', 'visibility', 'none');
          map.setLayoutProperty('nav-connector-line', 'visibility', 'none');
        }
        if (dotSrc) {
          dotSrc.setData({ type: 'Feature', geometry: { type: 'Point', coordinates: [] } });
          map.setLayoutProperty('nav-connector-join-dot', 'visibility', 'none');
        }
      }

      function syncRideConnector(route, lat, lng, heading) {
        ensureConnectorLayers();
        if (!route || route.length < 2 || lat == null || lng == null) {
          hideRideConnector();
          return;
        }
        var rider = { latitude: lat, longitude: lng };
        var snap = snapToRoute(route, rider);
        if (!snap) {
          hideRideConnector();
          return;
        }
        var join = { latitude: snap.lat, longitude: snap.lng };
        var joinBearing = computeBearing(lat, lng, join.latitude, join.longitude);
        var frontWheel = riderFrontWheelPoint(lat, lng, heading, joinBearing);
        var gapM = haversineM(frontWheel.latitude, frontWheel.longitude, join.latitude, join.longitude);
        if (gapM < CONNECTOR_MIN_GAP_M) {
          hideRideConnector();
          return;
        }
        var coords = [
          [frontWheel.longitude, frontWheel.latitude],
          [join.longitude, join.latitude]
        ];
        map.getSource('nav-connector').setData({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords }
        });
        map.getSource('nav-connector-join').setData({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [join.longitude, join.latitude] }
        });
        map.setLayoutProperty('nav-connector-casing', 'visibility', 'visible');
        map.setLayoutProperty('nav-connector-line', 'visibility', 'visible');
        map.setLayoutProperty('nav-connector-join-dot', 'visibility', 'visible');
      }

      function ensureNavLineLayer(sourceId, layerId, paint, layout) {
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

      function ensureNavRouteLayers() {
        ensureNavLineLayer('nav-traveled', 'nav-traveled-casing', {
          'line-color': NAV_CASING,
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 11, 15, 15, 17, 17],
          'line-opacity': 0.88
        });
        ensureNavLineLayer('nav-traveled', 'nav-traveled-line', {
          'line-color': NAV_TRAVELED,
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 7, 15, 9.5, 17, 11],
          'line-opacity': 0.95
        });
        ensureNavLineLayer('nav-remaining', 'nav-remaining-casing', {
          'line-color': NAV_CASING,
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 14, 15, 18, 17, 20],
          'line-opacity': 1
        });
        ensureNavLineLayer('nav-remaining', 'nav-remaining-line', {
          'line-color': NAV_BLUE,
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 8, 15, 11, 17, 13],
          'line-opacity': 1
        });
        ensureNavLineLayer('nav-remaining', 'nav-remaining-glow', {
          'line-color': NAV_BLUE_GLOW,
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 12, 15, 15, 17, 17],
          'line-opacity': 0.22,
          'line-blur': 0.8
        }, { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' });
      }

      function setNavLineData(sourceId, coords, layerIds) {
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

      function setNavLayerVisibility(visible) {
        ['nav-traveled-casing', 'nav-traveled-line', 'nav-remaining-casing', 'nav-remaining-line', 'nav-remaining-glow'].forEach(function(id) {
          if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
        });
        ['route-casing', 'route-line'].forEach(function(id) {
          if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'none' : 'visible');
        });
        if (!visible) hideRideConnector();
        if (typeof clearEndpointMarkers === 'function' && visible) clearEndpointMarkers();
      }

      function googleDestPinHtml() {
        return (
          '<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">' +
          '<div style="width:38px;height:38px;border-radius:19px;background:#EA4335;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(234,67,53,0.42);border:3px solid #fff;">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>' +
          '</div>' +
          '<div style="width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;border-top:11px solid #EA4335;margin-top:-1px;"></div>' +
          '</div>'
        );
      }

      function updateNavDestinationPin() {
        if (!navMode || navDropLat == null || navDropLng == null) {
          if (navDestMarker) { try { navDestMarker.remove(); } catch (e) {} navDestMarker = null; }
          return;
        }
        if (!navDestMarker) {
          var el = document.createElement('div');
          el.innerHTML = googleDestPinHtml();
          navDestMarker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat([navDropLng, navDropLat])
            .addTo(map);
        } else {
          navDestMarker.setLngLat([navDropLng, navDropLat]);
        }
      }

      function syncNavRouteFromFull() {
        ensureNavRouteLayers();
        var rider = navRiderLat != null ? { latitude: navRiderLat, longitude: navRiderLng } : null;
        var split = splitRouteAtRider(navFullRoute, rider);
        setNavLineData('nav-traveled', split.traveled, ['nav-traveled-casing', 'nav-traveled-line']);
        setNavLineData('nav-remaining', split.remaining, ['nav-remaining-casing', 'nav-remaining-line', 'nav-remaining-glow']);
        syncRideConnector(navFullRoute, navRiderLat, navRiderLng, navRiderHeading);
        return split;
      }

      function computeNavCameraTargets(force) {
        if (!navMode || navRiderLat == null || navRiderLng == null) return;
        var now = Date.now();
        if (!force && now - navLastCameraTs < NAV_CAMERA_MIN_MS) return;
        navLastCameraTs = now;

        var split = syncNavRouteFromFull();
        var remaining = split.remaining || [];
        var rider = { latitude: navRiderLat, longitude: navRiderLng };
        var rawBearing = routeLookAheadBearing(remaining, rider);
        if (rawBearing == null && navRiderHeading != null && !isNaN(navRiderHeading)) rawBearing = navRiderHeading;
        if (rawBearing == null && navDropLat != null && navDropLng != null) {
          rawBearing = computeBearing(navRiderLat, navRiderLng, navDropLat, navDropLng);
        }

        var turnDelta = 0;
        if (rawBearing != null && navSmoothBearing != null) {
          turnDelta = Math.abs(((rawBearing - navSmoothBearing + 540) % 360) - 180);
        }
        var severity = Math.max(turnDelta, navTurnSeverity);
        var alpha = force
          ? 0.62
          : (severity > 45 ? 0.58 : severity > 28 ? 0.48 : severity > 12 ? 0.34 : 0.18);
        var bearing = smoothBearing(rawBearing, alpha);
        if (bearing == null) bearing = map.getBearing();

        var lookM = severity > 22 ? NAV_TURN_LOOKAHEAD_M + 18 : NAV_LOOKAHEAD_M;
        var ahead = offsetLatLng(navRiderLat, navRiderLng, bearing, lookM);
        navTargetBearing = bearing;
        navTargetCenter = { lng: ahead.lng, lat: ahead.lat };
        navTargetZoom = severity > 35 ? 17.28 : severity > 12 ? 17.36 : 17.44;
      }

      function navCameraTick() {
        if (!navMode) {
          navCameraRaf = null;
          return;
        }
        if (navTargetBearing == null || navTargetCenter == null) {
          computeNavCameraTargets(false);
        }
        if (navTargetBearing != null && navTargetCenter != null) {
          var curBearing = map.getBearing();
          var curCenter = map.getCenter();
          var curZoom = map.getZoom();
          var bDiff = navTargetBearing != null
            ? Math.abs(((navTargetBearing - curBearing + 540) % 360) - 180)
            : 0;
          var moveT = bDiff > 40 ? 0.16 : bDiff > 18 ? 0.11 : bDiff > 6 ? 0.075 : 0.048;
          var posT = bDiff > 25 ? 0.13 : 0.07;
          if (navCameraBoot > 0) {
            var boot = navCameraBoot / 50;
            moveT = Math.min(0.24, moveT + boot * 0.12);
            posT = Math.min(0.2, posT + boot * 0.1);
            navCameraBoot -= 1;
          }
          var zoomT = 0.04;

          var nextBearing = lerpAngle(curBearing, navTargetBearing, moveT);
          var nextLng = lerpNum(curCenter.lng, navTargetCenter.lng, posT);
          var nextLat = lerpNum(curCenter.lat, navTargetCenter.lat, posT);
          var nextZoom = lerpNum(curZoom, navTargetZoom, zoomT);

          map.jumpTo({
            center: [nextLng, nextLat],
            bearing: nextBearing,
            pitch: 58,
            zoom: nextZoom
          });

          var riderImg = document.getElementById('rider-img');
          if (riderImg) riderImg.style.transform = 'rotate(0deg)';
        }
        navCameraRaf = requestAnimationFrame(navCameraTick);
      }

      function startNavCameraLoop() {
        if (navCameraRaf != null) return;
        navCameraRaf = requestAnimationFrame(navCameraTick);
      }

      function stopNavCameraLoop() {
        if (navCameraRaf != null) {
          cancelAnimationFrame(navCameraRaf);
          navCameraRaf = null;
        }
        navTargetBearing = null;
        navTargetCenter = null;
        navTurnSeverity = 0;
        navCameraBoot = 0;
      }

      function followNavCamera(force) {
        computeNavCameraTargets(!!force);
        if (force) navCameraBoot = 52;
        startNavCameraLoop();
      }

      function scheduleNavFollow(force) {
        if (navFollowTimer) clearTimeout(navFollowTimer);
        navFollowTimer = setTimeout(function() {
          navFollowTimer = null;
          followNavCamera(!!force);
        }, force ? 0 : 16);
      }

      window.setNavigationMode = function(enabled, dropLat, dropLng) {
        navMode = !!enabled;
        navDropLat = dropLat != null ? Number(dropLat) : null;
        navDropLng = dropLng != null ? Number(dropLng) : null;
        navSmoothBearing = null;
        navLastCameraTs = 0;
        setNavLayerVisibility(navMode);
        updateNavDestinationPin();
        if (navMode) {
          if (window._replayLastRoute) window._replayLastRoute();
          scheduleNavFollow(true);
        } else {
          if (navDestMarker) { try { navDestMarker.remove(); } catch (e) {} navDestMarker = null; }
          if (navFollowTimer) { clearTimeout(navFollowTimer); navFollowTimer = null; }
          stopNavCameraLoop();
          navSmoothBearing = null;
          hideRideConnector();
          map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
        }
      };

      window.onNavRouteUpdate = function(coords) {
        navFullRoute = coords || [];
        if (navMode) {
          syncNavRouteFromFull();
          scheduleNavFollow(false);
        }
      };

      window.onNavRiderUpdate = function(lat, lng, heading) {
        var moved =
          navRiderLat != null &&
          navRiderLng != null &&
          lat != null &&
          lng != null &&
          haversineM(navRiderLat, navRiderLng, lat, lng) > 0.8;
        navRiderLat = lat;
        navRiderLng = lng;
        navRiderHeading = heading;
        if (navMode) {
          if (moved || lat != null) {
            syncNavRouteFromFull();
            computeNavCameraTargets(false);
            startNavCameraLoop();
          }
          return;
        }
        if (window._lastRouteCoords && window._lastRouteCoords.length >= 2 && lat != null && lng != null) {
          syncRideConnector(window._lastRouteCoords, lat, lng, heading);
        }
      };

      window.patchRideTrackingForNav = function() {
        var rapidoUpdateRoute = window.updateRoute;
        var lastCoords = [];
        window.updateRoute = function(coords) {
          lastCoords = coords || [];
          window._lastRouteCoords = lastCoords;
          if (navMode) {
            window.onNavRouteUpdate(coords);
            return;
          }
          rapidoUpdateRoute(coords);
          if (navRiderLat != null && navRiderLng != null && lastCoords.length >= 2) {
            syncRideConnector(lastCoords, navRiderLat, navRiderLng, navRiderHeading);
          }
        };
        window._replayLastRoute = function() {
          if (lastCoords.length >= 2) window.onNavRouteUpdate(lastCoords);
        };
      };
  `;
}
