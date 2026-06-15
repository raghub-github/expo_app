import { buildMerchantInstructionsArray } from "./food-order-payload.js";

export function parseMerchantInstructionsList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export function resolveMerchantInstructionsList(
  stored: unknown,
  checkoutMetadata: unknown
): string[] {
  const fromDb = parseMerchantInstructionsList(stored);
  if (fromDb.length > 0) return fromDb;
  const meta =
    checkoutMetadata && typeof checkoutMetadata === "object"
      ? (checkoutMetadata as Record<string, unknown>)
      : null;
  return buildMerchantInstructionsArray(meta);
}

export function appendMerchantInstruction(
  current: string[],
  instruction: string
): string[] {
  const text = instruction.trim();
  if (!text) return current;
  return [...current, text];
}

export function canCustomerAppendCookingRequest(statusUpper: string): boolean {
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
