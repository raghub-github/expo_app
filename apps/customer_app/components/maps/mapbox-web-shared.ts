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
    html, body, #map { width:100%; height:100%; }
    .mapboxgl-ctrl-logo, .mapboxgl-ctrl-attrib { display:none !important; }
  </style>`;
}

/** Approximate Mapbox zoom from react-native-maps latitudeDelta. */
export function latitudeDeltaToZoom(latitudeDelta: number): number {
  const delta = Math.max(latitudeDelta, 0.0005);
  return Math.max(10, Math.min(18, Math.log2(360 / delta)));
}
