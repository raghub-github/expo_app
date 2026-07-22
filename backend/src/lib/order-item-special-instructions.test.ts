import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeOrderItemSpecialInstructions,
  readOrderItemSpecialInstructions,
  specialInstructionsIntoSnapshot,
  ORDER_ITEM_SPECIAL_INSTRUCTIONS_MAX_LENGTH,
} from "./order-item-special-instructions.js";

describe("order-item-special-instructions", () => {
  it("trims and rejects blank instructions", () => {
    assert.equal(normalizeOrderItemSpecialInstructions("  less spicy  "), "less spicy");
    assert.equal(normalizeOrderItemSpecialInstructions("   "), null);
    assert.equal(normalizeOrderItemSpecialInstructions(null), null);
  });

  it("enforces max length with unicode safety", () => {
    const long = "🍛".repeat(ORDER_ITEM_SPECIAL_INSTRUCTIONS_MAX_LENGTH + 5);
    const normalized = normalizeOrderItemSpecialInstructions(long);
    assert.notEqual(normalized, null);
    assert.equal(Array.from(normalized!).length, ORDER_ITEM_SPECIAL_INSTRUCTIONS_MAX_LENGTH);
  });

  it("prefers relational column over snapshot aliases", () => {
    const value = readOrderItemSpecialInstructions({
      relational: "Less oil",
      itemSnapshot: { item_instructions: "Extra spicy" },
      cartLine: { specialInstructions: "No onion" },
    });
    assert.equal(value, "Less oil");
  });

  it("falls back through snapshot and cart aliases", () => {
    assert.equal(
      readOrderItemSpecialInstructions({
        itemSnapshot: { note: "No garlic" },
      }),
      "No garlic",
    );
    assert.equal(
      readOrderItemSpecialInstructions({
        cartLine: { item_note: "Separate packing" },
      }),
      "Separate packing",
    );
  });

  it("dual-writes into item snapshot for rolling deploys", () => {
    const snap = specialInstructionsIntoSnapshot({ isVeg: true }, "Less spicy");
    assert.equal(snap.item_instructions, "Less spicy");
    assert.equal(snap.special_instructions, "Less spicy");
    assert.equal(snap.isVeg, true);
  });

  it("clears snapshot aliases when instruction removed", () => {
    const snap = specialInstructionsIntoSnapshot(
      { item_instructions: "Old", note: "Old" },
      null,
    );
    assert.equal(snap.item_instructions, undefined);
    assert.equal(snap.note, undefined);
  });
});
