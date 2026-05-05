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
      /** Phone OTP: must match Supabase project (Auth → Phone). EAS builds need these in env at build time. */
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL || null,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || null,
      /** "true" / "1" → phone OTP via backend MSG91 (same path as customer app without Supabase). */
      EXPO_PUBLIC_PHONE_OTP_USE_BACKEND: process.env.EXPO_PUBLIC_PHONE_OTP_USE_BACKEND || null,
      GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || null,
      eas: {
        ...(config?.expo?.extra?.eas && typeof config.expo.extra.eas === "object" ? config.expo.extra.eas : {}),
        projectId:
          process.env.EAS_PROJECT_ID ||
          process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
          config?.expo?.extra?.eas?.projectId ||
          undefined,
      },
    },
  },
});
