/**
 * Merchant app config. Backend URL from .env (same backend as monorepo).
 * Android FCM: google-services.json (package com.gatimitra.partner) must match Firebase console.
 */
const fs = require("fs");
const path = require("path");
const appJson = require("./app.json");

// Only reference google-services.json when it actually exists on disk. In Expo Go / local
// dev the FCM file is absent (and unused), and pointing Expo at a missing path makes it log
// "Could not parse Expo config: android.googleServicesFile" on every bundle. Production /
// EAS Android builds provide the real file, so FCM stays wired there.
const googleServicesFile = path.resolve(__dirname, "google-services.json");
const hasGoogleServices = fs.existsSync(googleServicesFile);

module.exports = ({ config }) => ({
  ...appJson,
  ...config,
  expo: {
    ...appJson.expo,
    ...config?.expo,
    scheme: config?.expo?.scheme || appJson.expo.scheme || "gatimitra-merchant",
    android: {
      ...appJson.expo.android,
      ...config?.expo?.android,
      package: "com.gatimitra.partner",
      ...(hasGoogleServices ? { googleServicesFile: "./google-services.json" } : {}),
      softwareKeyboardLayoutMode: "pan",
    },
    plugins: [
      ...(appJson.expo.plugins || []),
      "expo-dev-client",
      [
        "expo-notifications",
        {
          icon: "./assets/mxappicon.png",
          color: "#3EB489",
          sounds: [],
          defaultChannel: "merchant_default",
          enableBackgroundRemoteNotifications: true,
        },
      ],
    ],
    extra: {
      ...(appJson.expo.extra || {}),
      ...(config?.expo?.extra || {}),
      API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3000",
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL || null,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || null,
      EXPO_PUBLIC_PHONE_OTP_USE_BACKEND: process.env.EXPO_PUBLIC_PHONE_OTP_USE_BACKEND || null,
      GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || null,
      eas: {
        ...(appJson.expo.extra?.eas && typeof appJson.expo.extra.eas === "object" ? appJson.expo.extra.eas : {}),
        ...(config?.expo?.extra?.eas && typeof config.expo.extra.eas === "object" ? config.expo.extra.eas : {}),
        projectId:
          process.env.EAS_PROJECT_ID ||
          process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
          config?.expo?.extra?.eas?.projectId ||
          appJson.expo.extra?.eas?.projectId ||
          undefined,
      },
    },
    owner: "raghubhunia53s-team",
  },
});
