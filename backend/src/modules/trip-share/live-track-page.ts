/**
 * Public live trip tracking web page (Rapido-style).
 */

import { getEnv } from "../../config/env.js";
import { LIVE_TRACK_CLIENT_SCRIPT, LIVE_TRACK_PAGE_CSS } from "./live-track-assets.js";
import { LIVE_TRACK_BIKE_ICON_URL } from "./live-track-map-assets.js";

export function buildLiveTrackPageHtml(token: string): string {
  const mapboxToken = getEnv().MAPBOX_ACCESS_TOKEN ?? "";
  const safeToken = token.trim();
  const cfg = JSON.stringify({
    token: safeToken,
    mapboxToken,
    bikeIconUrl: LIVE_TRACK_BIKE_ICON_URL,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <title>GatiMitra Live Trip</title>
  <link href="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css" rel="stylesheet" />
  <style>${LIVE_TRACK_PAGE_CSS}</style>
</head>
<body>
  <div id="app">
    <header class="page-head">
      <h1 id="tripTitle">Live Trip</h1>
    </header>
    <div id="mapStage">
      <div id="mapWrap">
        <div id="map"></div>
        <div class="map-legend" aria-hidden="true">
          <span><i class="legend-dot route"></i>Route</span>
          <span><i class="legend-dot rider"></i>Captain</span>
          <span><i class="legend-dot pickup"></i>Pickup</span>
          <span><i class="legend-dot drop"></i>Drop</span>
        </div>
      </div>
    </div>
    <section class="rapido-sheet" id="sheet">
      <div id="sheetBody">
        <div class="sheet-loading">Loading trip…</div>
      </div>
    </section>
  </div>
  <script>window.__GM_TRACK__ = ${cfg};</script>
  <script src="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js"></script>
  <script>${LIVE_TRACK_CLIENT_SCRIPT}</script>
</body>
</html>`;
}
