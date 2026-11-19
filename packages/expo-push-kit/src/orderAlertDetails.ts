/**
 * Offer details handed to the native order alert when the APP starts it.
 *
 * The native floating / lock-screen card renders from its session row. An
 * alert started from a WebSocket offer or the order board used to carry no
 * details at all, so the card drew "Address unavailable" / "Distance
 * unavailable" until a push happened to land. These are the same flat keys the
 * FCM data payload uses (pickupAddress, dropAddress, amount, expiresAt, …).
 */
export type NativeOrderAlertDetails = Record<string, unknown>;

const MAX_VALUE_CHARS = 2000;

/**
 * Flat string-valued JSON for the native bridge, or null when nothing useful
 * is left. Nested objects/arrays, null/undefined, blank strings and non-finite
 * numbers are dropped — the card hides a row it has no value for instead of
 * printing "null" or "NaN".
 */
export function serializeNativeAlertDetails(
  details: NativeOrderAlertDetails | null | undefined
): string | null {
  if (!details || typeof details !== "object") return null;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(details)) {
    if (!key) continue;
    let value: string | null = null;
    if (typeof raw === "string") {
      const v = raw.trim();
      if (v && v.toLowerCase() !== "null" && v.toLowerCase() !== "undefined") value = v;
    } else if (typeof raw === "number") {
      if (Number.isFinite(raw)) value = String(raw);
    } else if (typeof raw === "boolean") {
      value = raw ? "true" : "false";
    }
    if (value == null) continue;
    out[key] = value.length > MAX_VALUE_CHARS ? value.slice(0, MAX_VALUE_CHARS) : value;
  }
  return Object.keys(out).length > 0 ? JSON.stringify(out) : null;
}

/** Epoch-millis string for a deadline (native parses millis reliably on every API level). */
export function deadlineEpochMs(value: string | number | null | undefined): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? String(Math.round(value)) : undefined;
  const raw = String(value).trim();
  if (/^\d+$/.test(raw)) return raw;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) && ms > 0 ? String(ms) : undefined;
}
