/**
 * Merchant app config. Backend URL from .env (same backend as monorepo).
 * Set EXPO_PUBLIC_API_BASE_URL in .env to match backend/.env API_BASE_URL.
 *
 * Also defines a custom `scheme` so that Expo Linking is properly configured
 * and avoids runtime warnings in development/production builds.
 */
module.exports = ({ config }) => ({
  ...config,
  expo: {
    ...config?.expo,
    android: {
      ...config?.expo?.android,
      /** `pan` works better with bottom tabs / floating tab bar than `resize` (avoids IME covering fixed composers). */
      softwareKeyboardLayoutMode: "pan",
    },
    // Used for Expo Linking / deep links (e.g. gatimitra-merchant://)
    scheme: config?.expo?.scheme || "gatimitra-merchant",
    extra: {
      ...config?.expo?.extra,
      API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3000",
      GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || null,
    },
  },
});
