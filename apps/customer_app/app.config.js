/**
 * Extends app.json with expo-notifications and EAS project id for push tokens.
 * Set EAS_PROJECT_ID or EXPO_PUBLIC_EAS_PROJECT_ID for dev builds / production.
 */
const appJson = require("./app.json");

// Launcher icons: logo-only mark on pure black, ~40% safe zone — see scripts/generate-app-icons.mjs
const APP_ICON = "./assets/icon.png";
const APP_ADAPTIVE_FOREGROUND = "./assets/adaptive-icon.png";
const APP_ICON_BG = "#000000";
/** Native splash + Android 12+ splash window — match JS bootstrap mint (GatiMitraBootstrapScreen). */
const LAUNCHER_SPLASH_BG = "#5eead4";

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
      backgroundColor: LAUNCHER_SPLASH_BG,
    },
    ios: {
      ...appJson.expo.ios,
      icon: APP_ICON,
      infoPlist: {
        ...(appJson.expo.ios?.infoPlist || {}),
        UIFileSharingEnabled: true,
        LSSupportsOpeningDocumentsInPlace: true,
        LSApplicationQueriesSchemes: [
          ...new Set([
            ...((appJson.expo.ios?.infoPlist?.LSApplicationQueriesSchemes ||
              []) as string[]),
            "itms-apps",
          ]),
        ],
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
      permissions: [
        ...new Set([
          ...((appJson.expo.android?.permissions || []) as string[]),
          "READ_SMS",
          "RECEIVE_SMS",
          "POST_NOTIFICATIONS",
          "VIBRATE",
          "RECEIVE_BOOT_COMPLETED",
        ]),
      ],
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            { scheme: "https", host: "gatimitra.com", pathPrefix: "/addr" },
            { scheme: "https", host: "gatimitra.com", pathPrefix: "/ref" },
            { scheme: "https", host: "gatimitra.com", pathPrefix: "/invite" },
            { scheme: "gatimitra", host: "address" },
            { scheme: "gatimitra", host: "referral" },
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
          sounds: ["./assets/sounds/cx_notification.mp3"],
        },
      ],
      [
        "expo-navigation-bar",
        {
          backgroundColor: "#5eead4",
          barStyle: "light",
          visibility: "visible",
          position: "relative",
        },
      ],
      // Razorpay Native SDK (Standard Checkout — UPI, cards, wallets, netbanking).
      // react-native-razorpay uses the classic React Native autolinking mechanism —
      // no dedicated Expo config plugin required. Expo SDK 54 already ships with
      // Kotlin 1.9+ and Android minSdk 24 by default, both of which satisfy the
      // Razorpay SDK's build requirements. No expo-build-properties override
      // needed. Earlier attempt with `kotlinVersion: "1.9.25"` here caused the
      // Android Gradle build to fail at android/build.gradle:11 with
      //   "Could not get unknown property 'kotlinVersion' for
      //    DefaultDependencyHandler"
      // because that property name isn't plumbed through in SDK 54's plugin.
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
