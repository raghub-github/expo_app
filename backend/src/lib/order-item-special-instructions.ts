/**
 * Canonical normalization + legacy alias resolution for per-line cooking instructions.
 */

import { z } from "zod";

export const ORDER_ITEM_SPECIAL_INSTRUCTIONS_MAX_LENGTH = 100;

const SNAPSHOT_ALIASES = [
  "item_instructions",
  "special_instructions",
  "item_note",
  "instructions",
  "note",
] as const;

const CART_ALIASES = [
  "specialInstructions",
  "special_instructions",
  "item_instructions",
  "item_note",
  "instructions",
  "note",
] as const;

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

function readFromRecord(
  record: Record<string, unknown> | null | undefined,
  keys: readonly string[],
): string | null {
  if (!record) return null;
  for (const key of keys) {
    const v = normalizeOrderItemSpecialInstructions(record[key]);
    if (v) return v;
  }
  return null;
}

/** Prefer relational column; fall back to snapshot / pending-cart aliases. */
export function readOrderItemSpecialInstructions(args: {
  relational?: string | null;
  itemSnapshot?: Record<string, unknown> | null;
  cartLine?: Record<string, unknown> | null;
}): string | null {
  const fromRel = normalizeOrderItemSpecialInstructions(args.relational);
  if (fromRel) return fromRel;
  const fromSnap = readFromRecord(args.itemSnapshot ?? null, SNAPSHOT_ALIASES);
  if (fromSnap) return fromSnap;
  return readFromRecord(args.cartLine ?? null, CART_ALIASES);
}

/** Dual-write into item_snapshot for rolling-deploy compatibility. */
export function specialInstructionsIntoSnapshot(
  snapshot: Record<string, unknown> | null | undefined,
  instructions: string | null,
): Record<string, unknown> {
  const base = snapshot && typeof snapshot === "object" ? { ...snapshot } : {};
  if (instructions) {
    base.item_instructions = instructions;
    base.special_instructions = instructions;
  } else {
    for (const k of SNAPSHOT_ALIASES) {
      delete base[k];
    }
  }
  return base;
}

export const orderItemSpecialInstructionsSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => normalizeOrderItemSpecialInstructions(v ?? null));
