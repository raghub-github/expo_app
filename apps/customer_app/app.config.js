/**
 * Dynamic Expo config: inject env at build/prebuild time and Android networking/maps.
 * Keeps static content in app.json; this file merges overrides (Expo prefers app.config.* over app.json alone).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const appJson = require("./app.json");

const googleMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

module.exports = {
  expo: {
    ...appJson.expo,
    android: {
      ...appJson.expo.android,
      /** Required for http:// dev API (LAN IP / 10.0.2.2) — Android 9+ blocks cleartext by default */
      usesCleartextTraffic: true,
      permissions: [
        "READ_SMS",
        "RECEIVE_SMS",
        ...(Array.isArray(appJson.expo.android?.permissions) ? appJson.expo.android.permissions : []),
      ],
      config: {
        ...(appJson.expo.android?.config ?? {}),
        googleMaps: {
          apiKey: googleMapsKey,
        },
      },
    },
    ios: {
      ...appJson.expo.ios,
      config: {
        ...(appJson.expo.ios?.config ?? {}),
        googleMapsApiKey: googleMapsKey,
      },
    },
  },
};
