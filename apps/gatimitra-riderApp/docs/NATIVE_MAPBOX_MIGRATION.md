# Native Mapbox-Only Migration

The rider app no longer uses Mapbox WebView, Mapbox GL JS, or Expo Go map fallbacks. All maps render through **@rnmapbox/maps** native SDK.

## Removed (WebView stack)

| File | Purpose |
|------|---------|
| `src/components/maps/mapbox-web-html.ts` | Mapbox GL JS HTML generators |
| `src/components/maps/MapboxWebRiderMap.tsx` | Home map WebView |
| `src/components/maps/MapboxWebNavigationMap.tsx` | Navigation WebView |
| `src/lib/map-webview-image-uri.ts` | WebView image base64 helper |
| `src/lib/mapbox-runtime.ts` | Expo Go web fallback switch |
| `src/lib/is-expo-go.ts` | Expo Go detection for map routing |

## Removed dependencies

- `react-native-webview`
- `react-native-maps`
- `@mapbox/search-js-core`

## Updated components

- `RiderMapView.tsx` — native `MapView` only
- `ActiveRideNavigationMap.tsx` — native layers only; route glow layer added
- `MapboxUnavailablePanel.tsx` — dev build required messaging
- `map-assets.ts` — removed `MAPBOX_GL_VERSION`, `MAPBOX_NAV_WEB_STYLE`

## Unchanged (shared)

- `directions.service.ts` — HTTP Mapbox Directions API
- All `navigation-*` libs (camera, route progress, maneuvers)
- `expo-location` tracking pipeline
- `app.config.js` — `@rnmapbox/maps` plugin

## Development workflow

```bash
cd apps/gatimitra-riderApp
npx expo run:android          # first time / native changes
npx expo start --dev-client   # daily JS development
```

## EAS configuration

Ensure these secrets are set for all build profiles:

- `EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN` — runtime map + directions
- `RNMAPBOX__MAPS_DOWNLOAD_TOKEN` — native SDK download at prebuild

## Verification

- [ ] No `WebView` imports in `src/`
- [ ] No `mapbox-gl` CDN references
- [ ] Home map loads in dev build
- [ ] Food / person navigation loads with route + markers
- [ ] Recenter, follow mode, route overview work
- [ ] Rider bike marker visible above route line
