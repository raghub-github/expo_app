import {
  ROUTE_CASING_COLOR,
  ROUTE_DROP_COLOR,
  ROUTE_LINE_COLOR,
  ROUTE_PICKUP_COLOR,
} from "@/lib/customer-map-assets";

type RapidoRouteStyle = {
  lineColor?: string;
  casingColor?: string;
  /** Pill overlay draws pickup/drop dots on ride-book map. */
  showEndpointDots?: boolean;
  /** Thicker stroke for ride-book (Rapido-style). */
  thickStroke?: boolean;
};

/** Mapbox GL JS — Rapido-style route layers + endpoint dots. */
export function mapboxRapidoRouteScript(style?: RapidoRouteStyle): string {
  const lineColor = style?.lineColor ?? ROUTE_LINE_COLOR;
  const casingColor = style?.casingColor ?? ROUTE_CASING_COLOR;
  const showEndpointDots = style?.showEndpointDots !== false;
  const thick = style?.thickStroke === true;
  const casingWidth = thick
    ? "['interpolate', ['linear'], ['zoom'], 5, 4, 8, 5, 11, 6, 14, 7, 16, 8]"
    : "['interpolate', ['linear'], ['zoom'], 11, 7, 14, 10, 16, 12, 18, 14]";
  const lineWidth = thick
    ? "['interpolate', ['linear'], ['zoom'], 5, 2.5, 8, 3, 11, 3.5, 14, 4.5, 16, 5]"
    : "['interpolate', ['linear'], ['zoom'], 11, 4.5, 14, 6.5, 16, 8, 18, 9.5]";
  return `
      var endpointMarkers = [];

      function clearEndpointMarkers() {
        endpointMarkers.forEach(function(m) { try { m.remove(); } catch (e) {} });
        endpointMarkers = [];
      }

      function endpointDot(color) {
        var el = document.createElement('div');
        el.style.cssText =
          'width:16px;height:16px;border-radius:8px;background:' + color +
          ';border:3px solid #fff;box-shadow:0 1px 4px rgba(15,23,42,0.28);pointer-events:none;';
        return el;
      }

      function addRouteLayers() {
        if (map.getSource('route')) return;
        map.addSource('route', {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } }
        });
        map.addLayer({
          id: 'route-casing',
          type: 'line',
          source: 'route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '${casingColor}',
            'line-width': ${casingWidth},
            'line-opacity': 1
          }
        });
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '${lineColor}',
            'line-width': ${lineWidth},
            'line-opacity': 1
          }
        });
      }

      window.updateRoute = function(coords) {
        addRouteLayers();
        var src = map.getSource('route');
        if (!src) return;
        var line = (coords || []).map(function(c) { return [c.longitude, c.latitude]; });
        src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: line } });
        clearEndpointMarkers();
        if (${showEndpointDots ? "true" : "false"} && line.length >= 2) {
          var pickup = new mapboxgl.Marker({ element: endpointDot('${ROUTE_PICKUP_COLOR}'), anchor: 'center' })
            .setLngLat(line[0])
            .addTo(map);
          var drop = new mapboxgl.Marker({ element: endpointDot('${ROUTE_DROP_COLOR}'), anchor: 'center' })
            .setLngLat(line[line.length - 1])
            .addTo(map);
          endpointMarkers.push(pickup, drop);
        }
      };
  `;
}
