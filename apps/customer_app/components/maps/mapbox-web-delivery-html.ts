import { MAPBOX_RIDE_STYLE } from "@/lib/customer-map-assets";
import { escToken, mapboxHtmlHead, mapboxLabelRestoreScript } from "@/components/maps/mapbox-web-shared";
import { mapboxFoodDeliveryScript } from "@/components/maps/mapbox-food-delivery-script";

export function buildDeliveryTrackingMapHtml(
  token: string,
  center: { latitude: number; longitude: number },
  bikeUri: string
): string {
  const lat = center.latitude;
  const lng = center.longitude;

  return `<!DOCTYPE html>
<html>
<head>${mapboxHtmlHead(MAPBOX_RIDE_STYLE)}</head>
<body>
  <div id="map"></div>
  <script>
    (function(){
      mapboxgl.accessToken = '${escToken(token)}';
      var map = new mapboxgl.Map({
        container: 'map',
        style: '${MAPBOX_RIDE_STYLE}',
        center: [${lng}, ${lat}],
        zoom: 14.5,
        attributionControl: false
      });
      ${mapboxLabelRestoreScript()}
      map.on('style.load', function() { ensureMapLabelsVisible(map); });
      map.on('load', function() {
        ensureMapLabelsVisible(map);
        ${mapboxFoodDeliveryScript(bikeUri)}
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

export type DeliveryMapRouteStyle = "dashed" | "solid";

export type DeliveryMapPadding = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type DeliveryMapPayload = {
  pickupLat: number | null;
  pickupLng: number | null;
  dropLat: number | null;
  dropLng: number | null;
  riderLat: number | null;
  riderLng: number | null;
  riderHeading?: number | null;
  riderSpeedMps?: number | null;
  /** Full road geometry from routing API. */
  fullRoute?: { latitude: number; longitude: number }[];
  /** Trimmed remaining route on road (rider-app splitRouteProgress). */
  remainingRoute: { latitude: number; longitude: number }[];
  /** Dashed store → customer arc before rider assignment (Zomato-style preview). */
  preRiderArcRoute?: { latitude: number; longitude: number }[];
  /** Dashed GPS → route join connector. */
  connectorRoute?: { latitude: number; longitude: number }[];
  routeJoinLat?: number | null;
  routeJoinLng?: number | null;
  hideRouteLine?: boolean;
  highlightPickupZone?: boolean;
  highlightDropZone?: boolean;
  geofenceRadiusM?: number;
  geofenceProximityM?: number;
  riderArrived?: boolean;
  refitCamera?: boolean;
  mapPhase?: "rider_to_pickup" | "rider_to_drop";
  /** When false, hide store pin (post-pickup). Default true. */
  showPickupMarker?: boolean;
  /** When false, hide customer/home pin (rider → store). Default true. */
  showDropMarker?: boolean;
  mapPadding?: DeliveryMapPadding;
  /** @deprecated use remainingRoute */
  route?: { latitude: number; longitude: number }[];
  routeStyle?: DeliveryMapRouteStyle;
};
