/**
 * Expo App Configuration
 * This file allows dynamic configuration using environment variables
 */

// Expo Go reads `icon` + `splash.image` from manifest — use rideraap.png directly (cache-bust).
// Native APK icons: run `npm run generate:icons` → assets/icon.png + adaptive-icon.png
const APP_ICON = "./assets/images/rideraap.png";
const APP_ICON_NATIVE = "./assets/icon.png";
const APP_ADAPTIVE_FOREGROUND = "./assets/adaptive-icon.png";
const APP_ICON_BG = "#FFFFFF";

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
      backgroundColor: "#FFFFFF"
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
      package: "com.raghubhunia.gatimitrariderapp",
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
        "READ_MEDIA_VIDEO"
      ],
      queries: {
        schemes: ["google.navigation", "geo", "comgooglemaps", "https"],
        packages: ["com.google.android.apps.maps"]
      },
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
      favicon: "./assets/images/logo.png"
    },
    plugins: [
      "expo-router",
      "expo-asset",
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
          icon: "./assets/images/onlylogo.png",
          color: "#FFFFFF",
          sounds: []
        }
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
          backgroundColor: "#FFFFFF",
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
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
        process.env.MAPBOX_PUBLIC_TOKEN ||
        process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
        "",
    },
    owner: "raghubhunia"
  }
};
