/**
 * Customer-app mirror of backend order-item-special-instructions contract.
 */

export const ORDER_ITEM_SPECIAL_INSTRUCTIONS_MAX_LENGTH = 100;

/** Unicode-safe trim; blank → null; max 100 chars. */
export function normalizeOrderItemSpecialInstructions(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const chars = Array.from(trimmed);
  if (chars.length <= ORDER_ITEM_SPECIAL_INSTRUCTIONS_MAX_LENGTH) return trimmed;
  return chars.slice(0, ORDER_ITEM_SPECIAL_INSTRUCTIONS_MAX_LENGTH).join("");
}

export function specialInstructionsIntoSnapshot(
  snapshot: Record<string, unknown> | null | undefined,
  instructions: string | null,
): Record<string, unknown> {
  const base = snapshot && typeof snapshot === "object" ? { ...snapshot } : {};
  if (instructions) {
    base.item_instructions = instructions;
    base.special_instructions = instructions;
  } else {
    delete base.item_instructions;
    delete base.special_instructions;
    delete base.item_note;
    delete base.instructions;
    delete base.note;
  }
  return base;
}
