import Constants from "expo-constants";

type RiderAppConfig = {
  apiBaseUrl: string;
  /**
   * OTP provider is backend-owned. Rider app must not integrate OTP providers directly.
   * Kept as a flag for future debugging, but only "msg91" is supported.
   */
  otpProvider: "msg91";
  mapboxToken?: string;
};

/**
 * Expo public env rule:
 * - Only variables prefixed with `EXPO_PUBLIC_` are available in the app bundle.
 * - No secrets must ever be placed in Expo public env.
 */
export function getRiderAppConfig(): RiderAppConfig {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
  // Force backend-driven OTP (MSG91 is called by backend, not by the app).
  // Ignore any EXPO_PUBLIC_OTP_PROVIDER to prevent accidental Firebase OTP wiring.
  const otpProvider: "msg91" = "msg91";

  // Allow overriding via app config extra if needed.
  const fromExtra =
    (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.API_BASE_URL ??
    (Constants.manifest2?.extra as Record<string, unknown> | undefined)?.API_BASE_URL;

  const apiBaseUrl = (
    asNonEmptyString(fromEnv) ??
    asNonEmptyString(fromExtra) ??
    "http://localhost:3000"
  ).replace(/\/+$/, "");

  const mapboxToken = asNonEmptyString(process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN) ?? undefined;

  return { apiBaseUrl, otpProvider, mapboxToken };
}

function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}


