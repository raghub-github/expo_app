/**
 * Merchant app config. Backend URL from .env (same backend as monorepo).
 * Set EXPO_PUBLIC_API_BASE_URL in .env to match backend/.env API_BASE_URL.
 */
module.exports = ({ config }) => ({
  ...config,
  expo: {
    ...config?.expo,
    extra: {
      ...config?.expo?.extra,
      API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3000",
    },
  },
});
