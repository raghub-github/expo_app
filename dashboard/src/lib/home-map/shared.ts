/** Control Dashboard Home map: live Mapbox vs static uploaded image. */

export const HOME_MAP_MODE_CONFIG_KEY = "dashboard.home_map_mode" as const;
export const HOME_MAP_STATIC_ASSET_ID = "dashboard.home.map_static" as const;

export const HOME_MAP_MODES = ["live", "static"] as const;
export type HomeMapMode = (typeof HOME_MAP_MODES)[number];

export function parseHomeMapMode(value: unknown): HomeMapMode {
  if (value == null) return "live";
  if (typeof value === "object" && value !== null && "mode" in value) {
    return parseHomeMapMode((value as { mode: unknown }).mode);
  }
  const v = String(value)
    .trim()
    .toLowerCase()
    .replace(/^"+|"+$/g, "");
  return v === "static" ? "static" : "live";
}

export function isHomeMapMode(value: unknown): value is HomeMapMode {
  return value === "live" || value === "static";
}
