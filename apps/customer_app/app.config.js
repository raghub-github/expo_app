/**
 * Extends app.json with expo-notifications and EAS project id for push tokens.
 * Set EAS_PROJECT_ID or EXPO_PUBLIC_EAS_PROJECT_ID for dev builds / production.
 */
const appJson = require("./app.json");

// Launcher icons: logo-only mark, 65% safe zone — see scripts/generate-app-icons.mjs
const APP_ICON = "./assets/icon.png";
const APP_ADAPTIVE_FOREGROUND = "./assets/adaptive-icon.png";
const APP_ICON_BG = "#14b8a6";

module.exports = {
  ...appJson,
  expo: {
    ...appJson.expo,
    jsEngine: "hermes",
    newArchEnabled: true,
    icon: APP_ICON,
    splash: {
      ...appJson.expo.splash,
      image: "./assets/images/splash-logo.png",
      resizeMode: "contain",
      backgroundColor: "#14b8a6",
    },
    ios: {
      ...appJson.expo.ios,
      icon: APP_ICON,
      infoPlist: {
        ...(appJson.expo.ios?.infoPlist || {}),
        UIFileSharingEnabled: true,
        LSSupportsOpeningDocumentsInPlace: true,
      },
    },
    android: {
      ...appJson.expo.android,
      softwareKeyboardLayoutMode: "resize",
      edgeToEdgeEnabled: false,
      icon: APP_ICON,
      adaptiveIcon: {
        foregroundImage: APP_ADAPTIVE_FOREGROUND,
        backgroundColor: APP_ICON_BG,
      },
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            { scheme: "https", host: "link.gatimitra.com", pathPrefix: "/addr" },
            { scheme: "gatimitra", host: "address" },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
    },
    plugins: [
      ...(appJson.expo.plugins || []),
      "@config-plugins/react-native-blob-util",
      [
        "expo-notifications",
        {
          icon: "./assets/images/splash-logo.png",
          color: "#14b8a6",
          defaultChannel: "customer_default",
        },
      ],
      [
        "expo-navigation-bar",
        {
          backgroundColor: "#121212",
          barStyle: "light",
          visibility: "visible",
          position: "relative",
        },
      ],
      // Razorpay Native SDK (Standard Checkout — UPI, cards, wallets, netbanking).
      // react-native-razorpay uses the classic React Native autolinking mechanism,
      // so no dedicated Expo config plugin is required. Adding expo-build-properties
      // here ensures the Android minSdk = 24 (Razorpay SDK requirement) and the
      // Android Kotlin version is 1.9+ (also required by the SDK's checkout intent
      // handler). This block is idempotent — safe if it appears multiple times.
      [
        "expo-build-properties",
        {
          android: {
            minSdkVersion: 24,
            kotlinVersion: "1.9.25",
          },
        },
      ],
    ],
    extra: {
      ...(appJson.expo.extra || {}),
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL || null,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || null,
      EXPO_PUBLIC_PHONE_OTP_USE_BACKEND: process.env.EXPO_PUBLIC_PHONE_OTP_USE_BACKEND || null,
      mapboxAccessToken:
        process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
        process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN ||
        process.env.MAPBOX_PUBLIC_TOKEN ||
        process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
        "",
      EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN:
        process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
        process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN ||
        "",
      eas: {
        // EAS project: https://expo.dev/accounts/raghubhunia/projects/gatimitra-customer
        // Hardcoded fallback so EAS CLI can find the project without an env var,
        // but env override still wins so CI / different environments can swap.
        projectId:
          process.env.EAS_PROJECT_ID ||
          process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
          "53fb1df5-d522-4e6a-bc73-04b7ad260992",
      },
    },
    // Required for development builds — links the runtime to your EAS project.
    owner: "raghubhunia",
  },
};
