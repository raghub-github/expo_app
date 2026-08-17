/**
 * Expo App Configuration
 * This file allows dynamic configuration using environment variables
 *
 * Android FCM: package must match Firebase google-services.json client
 * `com.gatimitra.rider` (same project as Merchant: gatimitra-od-c5bad).
 */

const fs = require("fs");
const path = require("path");

// Expo Go reads `icon` + `splash.image` from manifest — use rideraap.png directly (cache-bust).
// Native APK icons: run `npm run generate:icons` → assets/icon.png + adaptive-icon.png
const APP_ICON = "./assets/images/rideraap.png";
const APP_ICON_NATIVE = "./assets/icon.png";
const APP_ADAPTIVE_FOREGROUND = "./assets/adaptive-icon.png";
const APP_ICON_BG = "#C4E8D1";

const googleServicesFile = path.resolve(__dirname, "google-services.json");
const hasGoogleServices = fs.existsSync(googleServicesFile);

module.exports = {
  expo: {
    name: "GatiMitra Rider",
    slug: "gatimitra-riderapp",
    version: "1.0.0",
    orientation: "portrait",
    icon: APP_ICON,
    scheme: "gatimitra-rider",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    splash: {
      image: APP_ICON,
      resizeMode: "contain",
      backgroundColor: "#C4E8D1"
    },
    ios: {
      supportsTablet: true,
      icon: APP_ICON_NATIVE,
      // iOS uses the full icon asset (logo on brand background).
      infoPlist: {
        NSLocationWhenInUseUsageDescription: "GatiMitra needs your location to show nearby orders, enable navigation, and verify deliveries. Location is mandatory for receiving orders.",
        NSLocationAlwaysAndWhenInUseUsageDescription: "GatiMitra needs your location in the background during active duties for safety and accurate order tracking.",
        NSPhotoLibraryUsageDescription: "GatiMitra needs access to your photos to upload KYC documents and profile pictures.",
        NSCameraUsageDescription: "GatiMitra needs camera access to scan KYC documents like Aadhaar, PAN, and Driving License for faster verification.",
        NSFaceIDUsageDescription: "We use Face ID to authenticate you securely.",
        LSApplicationQueriesSchemes: [
          "comgooglemaps",
          "googlemaps",
          "maps"
        ]
      }
    },
    android: {
      softwareKeyboardLayoutMode: "resize",
      // Must match Firebase Android client in google-services.json
      package: "com.gatimitra.rider",
      ...(hasGoogleServices ? { googleServicesFile: "./google-services.json" } : {}),
      useNextNotificationsApi: true,
      adaptiveIcon: {
        foregroundImage: APP_ADAPTIVE_FOREGROUND,
        backgroundColor: APP_ICON_BG
      },
      icon: APP_ICON_NATIVE,
      // false = system nav bar stays visible; insets work reliably on 3-button nav devices
      edgeToEdgeEnabled: false,
      predictiveBackGestureEnabled: false,
      permissions: [
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
        "CAMERA",
        "READ_MEDIA_IMAGES",
        "READ_MEDIA_VIDEO",
        "POST_NOTIFICATIONS",
        "VIBRATE",
        "RECEIVE_BOOT_COMPLETED",
        "REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_LOCATION"
      ],
      queries: {
        schemes: ["google.navigation", "geo", "comgooglemaps", "https"],
        packages: ["com.google.android.apps.maps"]
      },
      // Android App Links for rider referral invites. autoVerify needs this
      // package listed in https://gatimitra.com/.well-known/assetlinks.json,
      // otherwise the link falls back to the browser landing page (which still
      // forwards to the Play Store with the install-referrer payload).
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            { scheme: "https", host: "gatimitra.com", pathPrefix: "/rider-ref" },
            { scheme: "gatimitra-rider", host: "referral" }
          ],
          category: ["BROWSABLE", "DEFAULT"]
        }
      ],
      // Bundle size optimization
      enableProguardInReleaseBuilds: true,
      enableShrinkResourcesInReleaseBuilds: true,
      // Optimize APK size
      buildType: "apk",
      // Enable code splitting and minification
      jsEngine: "hermes"
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/images/onlylogo.png"
    },
    plugins: [
      "expo-router",
      "expo-asset",
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission:
            "GatiMitra needs your location in the background during active duties for safety and accurate order tracking.",
          locationAlwaysPermission:
            "GatiMitra needs your location in the background during active duties for safety and accurate order tracking.",
          locationWhenInUsePermission:
            "GatiMitra needs your location to show nearby orders, enable navigation, and verify deliveries. Location is mandatory for receiving orders.",
          isAndroidBackgroundLocationEnabled: true,
          isIosBackgroundLocationEnabled: true,
        },
      ],
      // Mapbox — runtime token via resolveMapboxPublicToken(); download token for native builds
      "@rnmapbox/maps",
      [
        "expo-media-library",
        {
          photosPermission: "Allow GatiMitra to access your photos to upload KYC documents and profile pictures.",
          savePhotosPermission: "Allow GatiMitra to save photos.",
          isAccessMediaLocationEnabled: false
        }
      ],
      [
        "expo-notifications",
        {
          icon: "./assets/images/rideraap.png",
          color: "#C4E8D1",
          sounds: [],
          defaultChannel: "default",
          enableBackgroundRemoteNotifications: true,
        }
      ],
      [
        "../../packages/expo-push-kit/plugin/withAndroidPushChannels.js",
        {
          channels: [
            { id: "default", name: "Orders & alerts", importance: 4 },
            { id: "rider_default", name: "Orders & alerts", importance: 4 },
          ],
        },
      ],
      [
        "./plugins/withBootReconnectNotification",
        {
          title: "Reconnect to receive orders",
          body: "Your device was restarted. Open the app to resume order notifications.",
          channelId: "rider_boot_reconnect",
          channelName: "Reconnect after restart",
          notificationId: 91002,
        },
      ],
      [
        "expo-camera",
        {
          cameraPermission: "GatiMitra needs camera access for live selfie verification during onboarding."
        }
      ],
      "@react-native-community/datetimepicker",
      [
        "expo-splash-screen",
        {
          image: APP_ICON,
          imageWidth: 240,
          resizeMode: "contain",
          backgroundColor: "#C4E8D1",
        },
      ],
    ],
    experiments: {
      typedRoutes: false,
      autolinkingModuleResolution: true
    },
    extra: {
      router: {},
      API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3000",
      /** Phone OTP via Supabase Auth → Send SMS hook → MSG91 (same as customer/merchant). */
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL || null,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || null,
      /** LAN dev: backend /otp/request + MSG91 (same as customer/merchant). Set in .env.local */
      EXPO_PUBLIC_PHONE_OTP_USE_BACKEND: process.env.EXPO_PUBLIC_PHONE_OTP_USE_BACKEND || null,
      eas: {
        projectId: "48aaf6a2-8617-458c-9e5a-cfa9418fbde3"
      },
      mapboxPublicToken:
        process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN ||
        process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
        process.env.MAPBOX_PUBLIC_TOKEN ||
        process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
        "",
      mapboxAccessToken:
        process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
        process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN ||
        process.env.MAPBOX_PUBLIC_TOKEN ||
        "",
      EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN:
        process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN ||
        process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
        null,
      EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN:
        process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
        process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN ||
        null,
    },
    owner: "raghubhunia"
  }
};
