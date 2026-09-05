/**
 * Extends app.json with expo-notifications and EAS project id for push tokens.
 * Set EAS_PROJECT_ID or EXPO_PUBLIC_EAS_PROJECT_ID for dev builds / production.
 *
 * Android FCM: place google-services.json next to this file (package
 * com.gatimitra.customer). Only referenced when the file exists so Expo Go /
 * local Metro does not warn about a missing path.
 */
const fs = require("fs");
const path = require("path");
const appJson = require("./app.json");

// Launcher icons: logo-only mark on pure black, ~40% safe zone — see scripts/generate-app-icons.mjs
const APP_ICON = "./assets/icon.png";
const APP_ADAPTIVE_FOREGROUND = "./assets/adaptive-icon.png";
const APP_ICON_BG = "#000000";
/** Native launch splash — GatiMitra wordmark, not the circular logo. */
const LAUNCHER_SPLASH_BG = "#14b8a6";
const LAUNCHER_SPLASH_IMAGE = "./assets/images/splash-brand.png";
const LAUNCHER_SPLASH_ANDROID12 = "./assets/images/splash-android12.png";

const googleServicesFile = path.resolve(__dirname, "google-services.json");
const hasGoogleServices = fs.existsSync(googleServicesFile);

const CUSTOMER_EAS_PROJECT_ID = "53fb1df5-d522-4e6a-bc73-04b7ad260992";

module.exports = {
  ...appJson,
  expo: {
    ...appJson.expo,
    jsEngine: "hermes",
    newArchEnabled: true,
    icon: APP_ICON,
    splash: {
      ...appJson.expo.splash,
      image: LAUNCHER_SPLASH_IMAGE,
      resizeMode: "cover",
      backgroundColor: LAUNCHER_SPLASH_BG,
      android: {
        ...(appJson.expo.splash?.android || {}),
        image: LAUNCHER_SPLASH_ANDROID12,
        resizeMode: "contain",
        backgroundColor: LAUNCHER_SPLASH_BG,
      },
      ios: {
        ...(appJson.expo.splash?.ios || {}),
        image: LAUNCHER_SPLASH_IMAGE,
        resizeMode: "cover",
        backgroundColor: LAUNCHER_SPLASH_BG,
      },
    },
    ios: {
      ...appJson.expo.ios,
      icon: APP_ICON,
      bundleIdentifier: appJson.expo.ios?.bundleIdentifier || "com.gatimitra.customer",
      associatedDomains: [
        ...new Set([
          ...((appJson.expo.ios?.associatedDomains || []) as string[]),
          "applinks:gatimitra.com",
        ]),
      ],
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
      package: "com.gatimitra.customer",
      useNextNotificationsApi: true,
      icon: APP_ICON,
      adaptiveIcon: {
        foregroundImage: APP_ADAPTIVE_FOREGROUND,
        backgroundColor: APP_ICON_BG,
      },
      ...(hasGoogleServices ? { googleServicesFile: "./google-services.json" } : {}),
      permissions: [
        ...new Set([
          ...((appJson.expo.android?.permissions || []) as string[]),
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
            { scheme: "https", host: "gatimitra.com", pathPrefix: "/address/share" },
            { scheme: "https", host: "gatimitra.com", pathPrefix: "/addr/" },
            { scheme: "https", host: "gatimitra.com", pathPrefix: "/ref" },
            { scheme: "https", host: "gatimitra.com", pathPrefix: "/invite" },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
    },
    plugins: [
      ...(appJson.expo.plugins || []),
      [
        "expo-splash-screen",
        {
          backgroundColor: LAUNCHER_SPLASH_BG,
          image: LAUNCHER_SPLASH_ANDROID12,
          imageWidth: 240,
          resizeMode: "contain",
          enableFullScreenImage_legacy: true,
          android: {
            image: LAUNCHER_SPLASH_ANDROID12,
            backgroundColor: LAUNCHER_SPLASH_BG,
            imageWidth: 240,
          },
          ios: {
            image: LAUNCHER_SPLASH_IMAGE,
            backgroundColor: LAUNCHER_SPLASH_BG,
            enableFullScreenImage_legacy: true,
          },
          dark: {
            image: LAUNCHER_SPLASH_ANDROID12,
            backgroundColor: LAUNCHER_SPLASH_BG,
          },
        },
      ],
      "@config-plugins/react-native-blob-util",
      // Resolve via file path — Expo's plugin resolver cannot load
      // `@rnmapbox/maps` by package name (exports map hides app.plugin).
      ...(fs.existsSync(path.resolve(__dirname, "node_modules/@rnmapbox/maps/app.plugin.js"))
        ? [path.resolve(__dirname, "node_modules/@rnmapbox/maps/app.plugin.js")]
        : []),
      [
        "expo-notifications",
        {
          // White stacked "GatiMitra" wordmark — status-bar small icon (fills slot like Zomato).
          icon: "./assets/notification-icon.png",
          color: "#14b8a6",
          defaultChannel: "customer_default",
          sounds: ["./assets/sounds/cx_notification.mp3"],
          enableBackgroundRemoteNotifications: true,
        },
      ],
      [
        "../../packages/expo-push-kit/plugin/withAndroidPushChannels.js",
        {
          channels: [
            { id: "customer_default", name: "Orders & updates", importance: 4 },
            { id: "customer_ride_cx", name: "Ride updates", importance: 4 },
            { id: "customer_live_order", name: "Live trip progress", importance: 3 },
            { id: "customer_cx", name: "Orders & updates", importance: 4 },
            { id: "default", name: "Orders & updates", importance: 4 },
          ],
        },
      ],
      [
        "expo-navigation-bar",
        {
          backgroundColor: LAUNCHER_SPLASH_BG,
          barStyle: "dark",
          visibility: "visible",
          position: "relative",
        },
      ],
      "expo-video",
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
        ...(appJson.expo.extra?.eas && typeof appJson.expo.extra.eas === "object"
          ? appJson.expo.extra.eas
          : {}),
        // EAS project: https://expo.dev/accounts/raghubhunia/projects/gatimitra-customer
        // Hardcoded fallback so getExpoPushTokenAsync always has a projectId.
        projectId:
          process.env.EAS_PROJECT_ID ||
          process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
          appJson.expo.extra?.eas?.projectId ||
          CUSTOMER_EAS_PROJECT_ID,
      },
    },
    // Required for development builds — links the runtime to your EAS project.
    owner: "raghubhunia",
  },
};
