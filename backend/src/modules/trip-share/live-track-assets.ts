/** Rapido-style live trip page — client script + CSS. */
export const LIVE_TRACK_CLIENT_SCRIPT = String.raw`
(function(){
  var cfg = window.__GM_TRACK__ || {};
  var TOKEN = cfg.token || "";
  var MAPBOX = cfg.mapboxToken || "";
  var BIKE_URI = cfg.bikeIconUrl || "/trip/assets/mapbike.png";
  var POLL_MS = 5000;

  var map = null;
  var mapReady = false;
  var layersReady = false;
  var lastData = null;
  var cachedRouteLine = null;
  var detailsOpen = false;
  var smoothRider = null;
  var animFrame = null;
  var didInitialFit = false;
  var riderMarker = null;
  var riderImg = null;

  function apiUrl(){ return window.location.origin + "/v1/public/track/" + encodeURIComponent(TOKEN); }
  function esc(s){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;"); }
  function fmtDist(km){
    if(km == null || isNaN(km)) return "—";
    return km < 1 ? (Math.round(km * 1000) + " m") : (km.toFixed(1) + " km");
  }
  function fmtTime(iso){
    if(!iso) return "";
    try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch(e){ return ""; }
  }

  function lngLat(p){ return p && p.longitude != null ? [p.longitude, p.latitude] : null; }

  function routeFromApi(coords){
    if(!coords || coords.length < 2) return null;
    return coords.map(function(c){ return [c.longitude, c.latitude]; });
  }

  function buildPointsGeoJson(data){
    var features = [];
    if(data.pickup){
      features.push({ type: "Feature", properties: { kind: "pickup" }, geometry: { type: "Point", coordinates: lngLat(data.pickup) } });
    }
    if(data.destination){
      features.push({ type: "Feature", properties: { kind: "drop" }, geometry: { type: "Point", coordinates: lngLat(data.destination) } });
    }
    return { type: "FeatureCollection", features: features };
  }

  function updateRiderMarker(coord, heading){
    if(!map || !mapReady || !coord) return;
    if(!riderMarker){
      var el = document.createElement("div");
      el.className = "gm-rider-marker";
      el.innerHTML = '<div class="gm-rider-marker__shell"><img class="gm-rider-marker__bike" src="' + BIKE_URI + '" alt="" /></div>';
      riderMarker = new mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat(coord).addTo(map);
      riderImg = el.querySelector(".gm-rider-marker__bike");
    } else {
      riderMarker.setLngLat(coord);
    }
    if(riderImg && heading != null && !isNaN(heading)){
      riderImg.style.transform = "rotate(" + heading + "deg)";
    }
  }

  function whenMapContainerReady(cb){
    var wrap = document.getElementById("mapWrap");
    function tick(){
      if(wrap && wrap.offsetWidth > 40 && wrap.offsetHeight > 40) cb();
      else requestAnimationFrame(tick);
    }
    tick();
  }

  function resizeMap(){
    if(map) try { map.resize(); } catch(e){}
  }

  function installMapLayers(){
    if(!map || layersReady) return;

    map.addSource("gm-route", {
      type: "geojson",
      data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } }
    });
    map.addSource("gm-points", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    });

    /* Route — black Rapido-style line on top of roads */
    map.addLayer({
      id: "gm-route-casing",
      type: "line",
      source: "gm-route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.95 }
    });
    map.addLayer({
      id: "gm-route-line",
      type: "line",
      source: "gm-route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#111111", "line-width": 5.5, "line-opacity": 1 }
    });

    /* Drop glow */
    map.addLayer({
      id: "gm-drop-glow",
      type: "circle",
      source: "gm-points",
      filter: ["==", ["get", "kind"], "drop"],
      paint: { "circle-radius": 26, "circle-color": "#ea4335", "circle-opacity": 0.15, "circle-blur": 0.2 }
    });

    /* Pin halos */
    map.addLayer({
      id: "gm-point-halo",
      type: "circle",
      source: "gm-points",
      filter: ["!=", ["get", "kind"], "rider"],
      paint: {
        "circle-radius": ["match", ["get", "kind"], "drop", 14, "pickup", 11, 10],
        "circle-color": "#ffffff",
        "circle-stroke-width": 0
      }
    });

    /* Pin dots */
    map.addLayer({
      id: "gm-point-dot",
      type: "circle",
      source: "gm-points",
      filter: ["!=", ["get", "kind"], "rider"],
      paint: {
        "circle-radius": ["match", ["get", "kind"], "drop", 9, "pickup", 7, 6],
        "circle-color": ["match", ["get", "kind"], "drop", "#ea4335", "pickup", "#4285F4", "#666"],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff"
      }
    });

    /* Labels for pickup/drop */
    map.addLayer({
      id: "gm-point-label",
      type: "symbol",
      source: "gm-points",
      filter: ["!=", ["get", "kind"], "rider"],
      layout: {
        "text-field": ["match", ["get", "kind"], "drop", "Drop", "pickup", "Pickup", ""],
        "text-size": 11,
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-offset": [0, 1.6],
        "text-anchor": "top",
        "text-allow-overlap": true
      },
      paint: { "text-color": "#111827", "text-halo-color": "#fff", "text-halo-width": 1.5 }
    });

    layersReady = true;
  }

  function setRouteCoords(line){
    if(!map || !layersReady || !line || line.length < 2) return;
    cachedRouteLine = line;
    map.getSource("gm-route").setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: line }
    });
  }

  function setPoints(data){
    if(!map || !layersReady || !data) return;
    map.getSource("gm-points").setData(buildPointsGeoJson(data));
  }

  function fitMapToTrip(data, line, force){
    if(!map || !mapReady || !data) return;
    if(didInitialFit && !force) return;
    var bounds = new mapboxgl.LngLatBounds();
    var added = false;
    function addPt(p){
      var ll = lngLat(p);
      if(ll){ bounds.extend(ll); added = true; }
    }
    addPt(data.pickup);
    addPt(data.destination);
    if(smoothRider) bounds.extend(smoothRider);
    else addPt(data.rider);
    (line || []).forEach(function(c){ if(c && c.length === 2){ bounds.extend(c); added = true; } });
    if(!added) return;
    try {
      map.fitBounds(bounds, { padding: 56, duration: 700, maxZoom: 14 });
      didInitialFit = true;
    } catch(e){}
  }

  function lerp(a,b,t){ return a + (b-a)*t; }

  function animateRiderTo(data){
    if(!data.rider) return;
    var target = lngLat(data.rider);
    var heading = data.rider.headingDegrees;
    if(!target) return;
    if(!smoothRider){
      smoothRider = target.slice();
      updateRiderMarker(smoothRider, heading);
      return;
    }
    if(animFrame) cancelAnimationFrame(animFrame);
    var start = performance.now();
    var from = smoothRider.slice();
    function tick(now){
      var t = Math.min(1, (now - start) / 4200);
      var ease = t * (2 - t);
      smoothRider = [lerp(from[0], target[0], ease), lerp(from[1], target[1], ease)];
      updateRiderMarker(smoothRider, heading);
      if(t < 1) animFrame = requestAnimationFrame(tick);
    }
    animFrame = requestAnimationFrame(tick);
  }

  function syncMap(data){
    if(!map || !mapReady || !data) return;
    resizeMap();
    if(!layersReady) installMapLayers();

    var apiLine = routeFromApi(data.routeCoordinates);
    var line = apiLine;
    if(!line && data.rider && data.destination){
      line = [lngLat(data.rider), lngLat(data.destination)];
    }
    if(line && line.length >= 2){
      setRouteCoords(line);
    }

    setPoints(data);
    animateRiderTo(data);
    fitMapToTrip(data, cachedRouteLine || line);
  }

  function bootMap(center){
    if(map) return;
    if(!MAPBOX || typeof mapboxgl === "undefined"){
      document.getElementById("map").innerHTML = '<div class="map-fallback">Map unavailable — check Mapbox token</div>';
      return;
    }
    whenMapContainerReady(function(){
      if(map) return;
      mapboxgl.accessToken = MAPBOX;
      map = new mapboxgl.Map({
        container: "map",
        style: "mapbox://styles/mapbox/streets-v12",
        center: center,
        zoom: 12,
        attributionControl: true,
        antialias: true
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
      map.on("load", function(){
        installMapLayers();
        mapReady = true;
        resizeMap();
        if(lastData){
          syncMap(lastData);
          map.once("idle", function(){
            resizeMap();
            fitMapToTrip(lastData, cachedRouteLine, true);
          });
        }
      });
      window.addEventListener("resize", function(){
        resizeMap();
        if(lastData && mapReady) fitMapToTrip(lastData, cachedRouteLine);
      });
    });
  }

  /* ── Bottom sheet (Rapido) ── */
  function renderPinRow(pin){
    if(!pin || pin.length < 4) return "";
    var digits = pin.replace(/\D/g, "").slice(0, 4).split("");
    var boxes = digits.map(function(d){ return '<span class="pin-box">' + esc(d) + '</span>'; }).join("");
    return '<div class="pin-row"><div class="pin-label">PIN to start ride</div><div class="pin-boxes">' + boxes + '</div></div>';
  }

  function renderCaptainCard(data){
    var rider = data.rider || {};
    var photo = rider.photoUrl
      ? '<img class="captain-photo" src="' + esc(rider.photoUrl) + '" alt="" />'
      : '<div class="captain-photo fallback">' + esc((rider.name || "C").slice(0,1)) + '</div>';
    var rating = rider.rating != null ? '<div class="captain-rating">' + rider.rating.toFixed(1) + ' <span>★</span></div>' : '';
    return '<div class="captain-card"><div class="captain-left">' +
      '<div class="vehicle-reg">' + esc(rider.vehicleRegistration || "—") + '</div>' +
      '<div class="vehicle-model">' + esc((rider.vehicleModel || "—").toUpperCase()) + '</div>' +
      '<div class="captain-name">' + esc((rider.name || "Captain").toUpperCase()) + '</div>' +
      '</div><div class="captain-right">' + photo + rating + '</div></div>';
  }

  function renderTimeline(data){
    if(!detailsOpen) return "";
    var html = '<div class="details-panel"><h3>Trip timeline</h3>';
    (data.timeline || []).forEach(function(step){
      html += '<div class="tl-row"><div class="tl-dot' + (step.completed ? " done" : "") + '"></div><div>' +
        '<div class="tl-label">' + esc(step.label) + '</div>' +
        (step.at ? '<div class="tl-time">' + esc(fmtTime(step.at)) + '</div>' : '') + '</div></div>';
    });
    return html + '</div>';
  }

  function renderSheet(data){
    if(data.tripCompleted){
      document.getElementById("mapStage").style.display = "none";
      document.getElementById("sheetBody").innerHTML =
        '<div class="completed"><h2>Trip completed</h2><p>Completed at ' + esc(fmtTime(data.completedAt)) + '</p></div>';
      return;
    }
    var eta = data.etaMinutes != null ? data.etaMinutes + " min" : "—";
    var locLabel = data.tripPhase === "to_drop" ? "Drop at" : "Pickup from";
    var locAddr = data.tripPhase === "to_drop"
      ? (data.destination && data.destination.address) || "—"
      : (data.pickup && data.pickup.address) || "—";
    document.getElementById("sheetBody").innerHTML =
      '<div class="status-row">' +
        '<div class="status-heading">' + esc(data.statusHeading || data.statusLabel) + '</div>' +
        '<div class="eta-pill">' + esc(eta) + '</div></div>' +
      renderPinRow(data.pickupPin) + renderCaptainCard(data) +
      '<div class="loc-row"><div class="loc-label">' + esc(locLabel) + '</div><div class="loc-addr">' + esc(locAddr) + '</div></div>' +
      renderTimeline(data) +
      '<button type="button" class="trip-details-btn" id="tripDetailsBtn"><span>Trip details</span><span class="chev">' + (detailsOpen ? "▾" : "▸") + '</span></button>';
    var btn = document.getElementById("tripDetailsBtn");
    if(btn) btn.onclick = function(){ detailsOpen = !detailsOpen; renderSheet(data); };
  }

  function renderLive(data){
    lastData = data;
    document.getElementById("tripTitle").textContent = data.tripTitle || "Live Trip";
    renderSheet(data);
    if(data.tripCompleted) return;

    var center = lngLat(data.rider) || lngLat(data.destination) || lngLat(data.pickup) || [85.52, 24.88];
    bootMap(center);
    if(mapReady) syncMap(data);
  }

  function showError(msg){
    document.getElementById("sheetBody").innerHTML = '<div class="error">' + esc(msg) + '</div>';
  }

  var failCount = 0;
  async function poll(){
    try {
      var res = await fetch(apiUrl(), { cache: "no-store" });
      if(res.status === 404){ showError("Tracking link not found."); return; }
      if(res.status === 410){ showError("This link has expired."); return; }
      if(!res.ok) throw new Error("HTTP " + res.status);
      renderLive(await res.json());
      if(!lastData.tripCompleted && !lastData.tripCancelled) setTimeout(poll, POLL_MS);
    } catch(e){
      failCount += 1;
      if(failCount < 8) setTimeout(poll, Math.min(15000, POLL_MS * failCount));
      else showError("Could not load trip. Refresh and try again.");
    }
  }
  poll();
})();
`;

export const LIVE_TRACK_PAGE_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fff; color: #111827; }
#app { display: flex; flex-direction: column; height: 100%; max-height: 100dvh; overflow: hidden; }
.page-head { flex-shrink: 0; padding: 14px 16px 10px; background: #fff; border-bottom: 1px solid #eee; z-index: 2; }
.page-head h1 { font-size: 15px; font-weight: 500; color: #111827; }

/* ── Map stage (Rapido: map dominates upper half) ── */
#mapStage { flex-shrink: 0; width: 100%; background: #dde3ea; }
#mapWrap {
  position: relative;
  width: 100%;
  height: 58vh;
  min-height: 280px;
  max-height: 520px;
  overflow: hidden;
}
#map {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  width: 100%;
  height: 100%;
}
.map-legend {
  position: absolute;
  left: 10px;
  bottom: 10px;
  z-index: 2;
  display: flex;
  gap: 8px;
  background: rgba(255,255,255,0.92);
  border-radius: 10px;
  padding: 6px 10px;
  font-size: 10px;
  font-weight: 700;
  color: #374151;
  box-shadow: 0 2px 8px rgba(0,0,0,.1);
  pointer-events: none;
}
.legend-dot { width: 8px; height: 8px; border-radius: 4px; display: inline-block; margin-right: 3px; vertical-align: middle; }
.legend-dot.route { background: #111; width: 14px; height: 3px; border-radius: 2px; }
.legend-dot.rider { background: #22C55E; border: 1px solid #fff; }
.legend-dot.pickup { background: #4285F4; }
.legend-dot.drop { background: #ea4335; }
.map-fallback { display: flex; align-items: center; justify-content: center; height: 100%; color: #6b7280; font-size: 14px; padding: 20px; text-align: center; }

/* ── Bottom sheet ── */
.rapido-sheet { flex: 1; min-height: 0; overflow-y: auto; background: #fff; padding: 16px 16px calc(20px + env(safe-area-inset-bottom, 0px)); border-radius: 16px 16px 0 0; margin-top: -10px; box-shadow: 0 -4px 20px rgba(0,0,0,.06); z-index: 3; }
.sheet-loading { color: #9ca3af; font-size: 14px; padding: 8px 0; }
.status-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.status-heading { font-size: 17px; font-weight: 700; color: #0d3b66; line-height: 1.25; flex: 1; }
.eta-pill { flex-shrink: 0; background: #0d3b66; color: #fff; font-size: 14px; font-weight: 700; padding: 8px 14px; border-radius: 8px; min-width: 64px; text-align: center; }
.pin-row { margin-bottom: 16px; }
.pin-label { font-size: 12px; color: #9ca3af; margin-bottom: 8px; }
.pin-boxes { display: flex; gap: 8px; }
.pin-box { width: 42px; height: 42px; border: 1px solid #e5e7eb; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700; color: #111827; background: #fff; }
.captain-card { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: #f5f6f8; border-radius: 12px; padding: 14px; margin-bottom: 16px; }
.captain-left { flex: 1; min-width: 0; }
.vehicle-reg { font-size: 17px; font-weight: 800; color: #111827; }
.vehicle-model { font-size: 11px; font-weight: 600; color: #9ca3af; margin-top: 2px; }
.captain-name { font-size: 12px; font-weight: 700; color: #6b7280; margin-top: 6px; }
.captain-right { position: relative; flex-shrink: 0; }
.captain-photo { width: 56px; height: 56px; border-radius: 28px; object-fit: cover; border: 2px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,.12); }
.captain-photo.fallback { display: flex; align-items: center; justify-content: center; background: #dbeafe; color: #1d4ed8; font-size: 22px; font-weight: 800; width: 56px; height: 56px; border-radius: 28px; }
.captain-rating { position: absolute; right: -4px; bottom: -6px; background: #fff; border-radius: 10px; padding: 2px 6px; font-size: 11px; font-weight: 800; box-shadow: 0 1px 4px rgba(0,0,0,.12); }
.captain-rating span { color: #f59e0b; }
.loc-row { margin-bottom: 12px; }
.loc-label { font-size: 12px; color: #9ca3af; margin-bottom: 4px; }
.loc-addr { font-size: 15px; font-weight: 700; color: #111827; line-height: 1.35; }
.trip-details-btn { display: flex; align-items: center; justify-content: space-between; width: 100%; margin-top: 8px; padding: 12px 14px; border: 1px solid #e5e7eb; border-radius: 999px; background: #fff; font-size: 14px; font-weight: 700; cursor: pointer; }
.trip-details-btn .chev { color: #9ca3af; }
.details-panel { margin-top: 14px; padding-top: 12px; border-top: 1px solid #f0f0f0; }
.details-panel h3 { font-size: 13px; margin-bottom: 10px; color: #374151; }
.tl-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: flex-start; }
.tl-dot { width: 16px; height: 16px; border-radius: 8px; border: 2px solid #d1d5db; flex-shrink: 0; }
.tl-dot.done { background: #137333; border-color: #137333; }
.tl-label { font-size: 12px; font-weight: 600; }
.tl-time { font-size: 11px; color: #9ca3af; }
.completed, .error { text-align: center; padding: 28px 12px; color: #6b7280; }
.completed h2 { color: #137333; margin-bottom: 8px; }
.mapboxgl-ctrl-logo { opacity: 0.5 !important; }
.mapboxgl-ctrl-bottom-right { bottom: 8px !important; right: 8px !important; }
.gm-rider-marker {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.gm-rider-marker__shell {
  width: 44px;
  height: 44px;
  border-radius: 22px;
  background: #22C55E;
  border: 3px solid #fff;
  box-shadow: 0 2px 10px rgba(34, 197, 94, 0.35), 0 1px 4px rgba(0,0,0,0.12);
  display: flex;
  align-items: center;
  justify-content: center;
}
.gm-rider-marker__bike {
  width: 28px;
  height: 28px;
  object-fit: contain;
  transform-origin: center center;
  transition: transform 0.32s cubic-bezier(0.22,1,0.36,1);
}
`;
