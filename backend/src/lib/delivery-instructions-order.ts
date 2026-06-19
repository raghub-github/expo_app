import { buildDeliveryInstructionsArray } from "./food-order-payload.js";

export function parseDeliveryInstructionsList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function mergeInstructionLists(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const item of list) {
      const key = item.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item.trim());
    }
  }
  return out;
}

export function resolveOrderDeliveryInstructionsList(
  stored: unknown,
  checkoutMetadata: unknown
): string[] {
  const fromDb = parseDeliveryInstructionsList(stored);
  if (fromDb.length > 0) return fromDb;
  const meta =
    checkoutMetadata && typeof checkoutMetadata === "object"
      ? (checkoutMetadata as Record<string, unknown>)
      : null;
  return buildDeliveryInstructionsArray(meta);
}

/** Normalize instruction strings from the client sheet save. */
export function normalizeDeliveryInstructionsList(incoming: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of incoming) {
    const text = String(raw ?? "").trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

export function canCustomerUpdateDeliveryInstructions(statusUpper: string): boolean {
  const blocked = new Set([
    "OUT_FOR_DELIVERY",
    "ON_THE_WAY",
    "IN_TRANSIT",
    "PICKED_UP",
    "DELIVERED",
    "CANCELLED",
    "FAILED",
    "RTO",
    "PAYMENT_FAILED",
  ]);
  return !blocked.has(statusUpper);
}
