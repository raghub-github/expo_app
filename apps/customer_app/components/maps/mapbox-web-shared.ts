import { MAPBOX_GL_VERSION } from "@/lib/customer-map-assets";

export function escToken(token: string): string {
  return token.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function escJson(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function mapboxLabelRestoreScript(): string {
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

export function mapboxHtmlHead(styleUrl: string): string {
  return `
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link href="https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_GL_VERSION}/mapbox-gl.css" rel="stylesheet" />
  <script src="https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_GL_VERSION}/mapbox-gl.js"><\/script>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body, #map { width:100%; height:100%; touch-action: none; }
    .mapboxgl-ctrl-logo, .mapboxgl-ctrl-attrib { display:none !important; }
    .mapboxgl-marker { background: transparent !important; }
    .gm-vehicle-marker { background: transparent !important; pointer-events: none; z-index: 8; position: relative; }
    .gm-vehicle-marker img {
      display: block;
      background: transparent !important;
      border: 0;
    }
  </style>`;
}

/** Pinch-zoom, pan, and double-tap zoom — Rapido-style map interaction. */
export function mapboxEnableGesturesScript(): string {
  return `
    map.touchZoomRotate.enable();
    map.scrollZoom.enable();
    map.dragPan.enable();
    map.doubleClickZoom.enable();
    if (map.touchPitch && map.touchPitch.disable) map.touchPitch.disable();
    if (map.dragRotate && map.dragRotate.disable) map.dragRotate.disable();
    var userGestureNotified = false;
    function notifyUserGesture() {
      if (userGestureNotified) return;
      userGestureNotified = true;
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'usergesture' }));
      }
    }
    map.on('zoomstart', function(e) { if (e.originalEvent) notifyUserGesture(); });
    map.on('dragstart', function(e) { if (e.originalEvent) notifyUserGesture(); });
  `;
}

/** Vehicle marker img inline style — visible on light Mapbox tiles (no blend mode). */
export function mapboxVehicleMarkerImgStyle(sizePx: number, rotationDeg: string): string {
  return (
    "width:" +
    sizePx +
    "px;height:" +
    sizePx +
    "px;object-fit:contain;transform:" +
    rotationDeg +
    ";transform-origin:center center;background:transparent;border:0;" +
    "filter:drop-shadow(0 1px 2px rgba(0,0,0,0.32));"
  );
}

/** Captain / booked vehicle marker on live ride tracking maps — vehicle icon only. */
export function buildTrackingRiderMarkerInnerHtml(escapedUri: string): string {
  const imgStyle = mapboxVehicleMarkerImgStyle(44, "none");
  return (
    '<img id="rider-img" class="gm-vehicle-marker-img" src="' +
    escapedUri +
    '" style="' +
    imgStyle +
    ';transition:transform 0.32s cubic-bezier(0.22,1,0.36,1);" alt="" />'
  );
}

/** Approximate Mapbox zoom from react-native-maps latitudeDelta. */
export function latitudeDeltaToZoom(latitudeDelta: number): number {
  const delta = Math.max(latitudeDelta, 0.0005);
  return Math.max(10, Math.min(18, Math.log2(360 / delta)));
}
