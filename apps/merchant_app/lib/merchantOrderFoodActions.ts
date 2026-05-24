/** Action source labels for order timeline (aligned with Partner Site). */

export type MerchantOrderActionSource = "app" | "website" | "admin" | "api" | "system";

export type MerchantOrderActionMode = "auto" | "manual";

export function normalizeActionSource(raw: unknown): MerchantOrderActionSource {
  const s = String(raw ?? "website").trim().toLowerCase();
  if (s === "app" || s === "mobile" || s === "merchant_app" || s === "android" || s === "ios") {
    return "app";
  }
  if (s === "admin" || s === "dashboard") return "admin";
  if (s === "api") return "api";
  if (s === "system" || s === "auto" || s === "schedule") return "system";
  return "website";
}

export function normalizeActionMode(raw: unknown): MerchantOrderActionMode {
  return String(raw ?? "manual").trim().toLowerCase() === "auto" ? "auto" : "manual";
}
