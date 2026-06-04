/**
 * Expo App Configuration
 * This file allows dynamic configuration using environment variables
 */

module.exports = {
  expo: {
    name: "GatiMitra Rider",
    slug: "gatimitra-riderapp",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/onlylogo.png",
    scheme: "gatimitra-rider",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    splash: {
      image: "./assets/images/onlylogo.png",
      resizeMode: "contain",
      backgroundColor: "#FFFFFF"
    },
    ios: {
      supportsTablet: true,
      icon: "./assets/images/onlylogo.png",
      infoPlist: {
        NSLocationWhenInUseUsageDescription: "GatiMitra needs your location to show nearby orders, enable navigation, and verify deliveries. Location is mandatory for receiving orders.",
        NSLocationAlwaysAndWhenInUseUsageDescription: "GatiMitra needs your location in the background during active duties for safety and accurate order tracking.",
        NSPhotoLibraryUsageDescription: "GatiMitra needs access to your photos to upload KYC documents and profile pictures.",
        NSCameraUsageDescription: "GatiMitra needs camera access to scan KYC documents like Aadhaar, PAN, and Driving License for faster verification.",
        NSFaceIDUsageDescription: "We use Face ID to authenticate you securely."
      }
    },
    android: {
      softwareKeyboardLayoutMode: "resize",
      package: "com.raghubhunia.gatimitrariderapp",
      adaptiveIcon: {
        foregroundImage: "./assets/images/onlylogo.png",
        backgroundColor: "#FFFFFF"
      },
      icon: "./assets/images/onlylogo.png",
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
      "@react-native-community/datetimepicker"
    ],
    experiments: {
      typedRoutes: true
    },
    extra: {
      router: {},
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
