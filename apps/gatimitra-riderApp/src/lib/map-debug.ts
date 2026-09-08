/**
 * Dev-only rider map logs. Single-line so they are easy to grep on device.
 */

type MapLogTag =
  | "MAP"
  | "LOCATION"
  | "MAP_CAMERA"
  | "MAP_INTERACTION"
  | "ROUTE";

function enabled(): boolean {
  try {
    return typeof __DEV__ !== "undefined" ? Boolean(__DEV__) : process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
}

function formatValue(value: unknown): string {
  if (value == null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NaN";
  return String(value);
}

export function mapLog(tag: MapLogTag, payload: Record<string, unknown>): void {
  if (!enabled()) return;
  const parts = Object.entries(payload)
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join(" ");
  console.log(`[${tag}] ${parts}`);
}

declare const __DEV__: boolean | undefined;
