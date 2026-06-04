import Constants from "expo-constants";

function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

/** Resolve Mapbox public token from all supported env aliases (Expo + Next + plain). */
export function resolveMapboxPublicToken(): string | undefined {
  const fromExpo = asNonEmptyString(process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN);
  const fromMapbox = asNonEmptyString(process.env.MAPBOX_PUBLIC_TOKEN);
  const fromNext = asNonEmptyString(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);

  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const fromExtra =
    asNonEmptyString(extra?.mapboxPublicToken) ??
    asNonEmptyString(extra?.MAPBOX_PUBLIC_TOKEN) ??
    asNonEmptyString(extra?.NEXT_PUBLIC_MAPBOX_TOKEN);

  return fromExpo ?? fromMapbox ?? fromNext ?? fromExtra ?? undefined;
}
