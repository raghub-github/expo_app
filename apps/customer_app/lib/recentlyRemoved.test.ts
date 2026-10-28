import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CartItem } from "../store/cartStore";
import {
  MAX_RECENTLY_REMOVED,
  buildRecentlyRemovedEntry,
  dropRecentlyRemovedByMerchant,
  dropRecentlyRemovedEntry,
  filterRecentlyRemovedByMerchant,
  formatRecentlyRemovedVariantSummary,
  pushRecentlyRemovedEntry,
  recentlyRemovedConfigKey,
  snapshotCartItemForRecentlyRemoved,
  type RecentlyRemovedEntry,
} from "./recentlyRemoved";

function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    lineId: "m1::::",
    menuItemId: "m1",
    name: "Paneer Butter Masala",
    price: 409,
    quantity: 1,
    isVeg: true,
    imageUrl: "https://example.com/p.jpg",
    ...overrides,
  };
}

function entryFromItem(
  item: CartItem,
  merchantId = "store-a",
  quantity = item.quantity
): RecentlyRemovedEntry {
  const built = buildRecentlyRemovedEntry({
    merchantId,
    merchantName: "Test Kitchen",
    item,
    quantity,
    removedAt: Date.now(),
  });
  assert.ok(built);
  return built!;
}

describe("recentlyRemoved retention", () => {
  it("captures one removed item", () => {
    const e = entryFromItem(makeCartItem());
    const next = pushRecentlyRemovedEntry([], e);
    assert.equal(next.length, 1);
    assert.equal(next[0]!.line.name, "Paneer Butter Masala");
    assert.equal(next[0]!.quantity, 1);
  });

  it("orders newest first when two different items are removed", () => {
    const first = entryFromItem(makeCartItem({ menuItemId: "a", lineId: "a::::", name: "A" }));
    const second = entryFromItem(makeCartItem({ menuItemId: "b", lineId: "b::::", name: "B" }));
    let list = pushRecentlyRemovedEntry([], first);
    list = pushRecentlyRemovedEntry(list, second);
    assert.equal(list.length, 2);
    assert.equal(list[0]!.line.name, "B");
    assert.equal(list[1]!.line.name, "A");
  });

  it("drops the oldest when a third unique item is removed (cap = 2)", () => {
    assert.equal(MAX_RECENTLY_REMOVED, 2);
    const a = entryFromItem(makeCartItem({ menuItemId: "a", lineId: "a::::", name: "A" }));
    const b = entryFromItem(makeCartItem({ menuItemId: "b", lineId: "b::::", name: "B" }));
    const c = entryFromItem(makeCartItem({ menuItemId: "c", lineId: "c::::", name: "C" }));
    let list = pushRecentlyRemovedEntry([], a);
    list = pushRecentlyRemovedEntry(list, b);
    list = pushRecentlyRemovedEntry(list, c);
    assert.equal(list.length, 2);
    assert.equal(list[0]!.line.name, "C");
    assert.equal(list[1]!.line.name, "B");
    assert.ok(!list.some((e) => e.line.name === "A"));
  });

  it("dedupes the same configuration and bumps recency", () => {
    const first = entryFromItem(
      makeCartItem({ menuItemId: "a", lineId: "a::::", name: "A", quantity: 1 }),
      "store-a",
      1
    );
    const other = entryFromItem(makeCartItem({ menuItemId: "b", lineId: "b::::", name: "B" }));
    const again = entryFromItem(
      makeCartItem({ menuItemId: "a", lineId: "a::::", name: "A", quantity: 2 }),
      "store-a",
      2
    );
    let list = pushRecentlyRemovedEntry([], first);
    list = pushRecentlyRemovedEntry(list, other);
    list = pushRecentlyRemovedEntry(list, again);
    assert.equal(list.length, 2);
    assert.equal(list[0]!.line.name, "A");
    assert.equal(list[0]!.quantity, 2);
    assert.equal(list[1]!.line.name, "B");
  });

  it("keeps different variants as separate entries", () => {
    const full = entryFromItem(
      makeCartItem({
        menuItemId: "a",
        lineId: "a::v-full::",
        variantId: "v-full",
        variantName: "Full",
        name: "PBM Full",
      })
    );
    const half = entryFromItem(
      makeCartItem({
        menuItemId: "a",
        lineId: "a::v-half::",
        variantId: "v-half",
        variantName: "Half",
        name: "PBM Half",
      })
    );
    assert.notEqual(recentlyRemovedConfigKey(full.line), recentlyRemovedConfigKey(half.line));
    let list = pushRecentlyRemovedEntry([], full);
    list = pushRecentlyRemovedEntry(list, half);
    assert.equal(list.length, 2);
  });

  it("keeps different add-ons as separate entries", () => {
    const plain = entryFromItem(makeCartItem({ menuItemId: "a", lineId: "a::::", name: "Plain" }));
    const withAddon = entryFromItem(
      makeCartItem({
        menuItemId: "a",
        lineId: "a:::addon1:",
        name: "With Extra",
        addons: [{ addonId: "addon1", addonName: "Extra Cheese", addonPrice: 30, quantity: 1 }],
      })
    );
    assert.notEqual(recentlyRemovedConfigKey(plain.line), recentlyRemovedConfigKey(withAddon.line));
    let list = pushRecentlyRemovedEntry([], plain);
    list = pushRecentlyRemovedEntry(list, withAddon);
    assert.equal(list.length, 2);
  });
});

describe("recentlyRemoved merchant isolation", () => {
  it("filters entries to the active merchant only", () => {
    const a = entryFromItem(makeCartItem({ menuItemId: "a", lineId: "a::::", name: "A" }), "store-a");
    const b = entryFromItem(makeCartItem({ menuItemId: "b", lineId: "b::::", name: "B" }), "store-b");
    const list = [a, b];
    assert.equal(filterRecentlyRemovedByMerchant(list, "store-a").length, 1);
    assert.equal(filterRecentlyRemovedByMerchant(list, "store-a")[0]!.line.name, "A");
    assert.equal(filterRecentlyRemovedByMerchant(list, null).length, 0);
  });

  it("clears history for one merchant without touching others", () => {
    const a = entryFromItem(makeCartItem({ menuItemId: "a", lineId: "a::::", name: "A" }), "store-a");
    const b = entryFromItem(makeCartItem({ menuItemId: "b", lineId: "b::::", name: "B" }), "store-b");
    const next = dropRecentlyRemovedByMerchant([a, b], "store-a");
    assert.equal(next.length, 1);
    assert.equal(next[0]!.merchantId, "store-b");
  });

  it("dismisses a single entry by key", () => {
    const a = entryFromItem(makeCartItem({ menuItemId: "a", lineId: "a::::", name: "A" }));
    const b = entryFromItem(makeCartItem({ menuItemId: "b", lineId: "b::::", name: "B" }));
    const next = dropRecentlyRemovedEntry([a, b], a.entryKey);
    assert.equal(next.length, 1);
    assert.equal(next[0]!.entryKey, b.entryKey);
  });
});

describe("recentlyRemoved snapshots", () => {
  it("preserves quantity, variant, and addons for restore", () => {
    const item = makeCartItem({
      quantity: 3,
      variantId: "v1",
      variantName: "Full",
      addons: [{ addonId: "x", addonName: "Raita", addonPrice: 40, quantity: 1 }],
      specialInstructions: "Less spicy",
    });
    const snap = snapshotCartItemForRecentlyRemoved(item);
    assert.equal(snap.variantId, "v1");
    assert.equal(snap.variantName, "Full");
    assert.equal(snap.addons?.[0]?.addonId, "x");
    assert.equal(snap.specialInstructions, "Less spicy");
    const e = buildRecentlyRemovedEntry({
      merchantId: "store-a",
      merchantName: "Kitchen",
      item,
      quantity: 3,
    });
    assert.equal(e!.quantity, 3);
  });

  it("formats a compact variant summary", () => {
    const summary = formatRecentlyRemovedVariantSummary({
      lineId: "x",
      menuItemId: "m",
      name: "PBM",
      price: 100,
      isVeg: true,
      variantName: "Full",
      addons: [{ addonId: "1", addonName: "Butter", addonPrice: 10, quantity: 1 }],
    });
    assert.equal(summary, "Full · Butter");
  });

  it("rejects capture without merchant id", () => {
    const built = buildRecentlyRemovedEntry({
      merchantId: "  ",
      merchantName: "X",
      item: makeCartItem(),
      quantity: 1,
    });
    assert.equal(built, null);
  });
});

describe("recentlyRemoved section count sync", () => {
  it("section count matches visible restoreable entries after retention", () => {
    const items = ["a", "b", "c"].map((id) =>
      entryFromItem(makeCartItem({ menuItemId: id, lineId: `${id}::::`, name: id }))
    );
    let list: RecentlyRemovedEntry[] = [];
    for (const e of items) list = pushRecentlyRemovedEntry(list, e);
    const visible = filterRecentlyRemovedByMerchant(list, "store-a");
    assert.equal(visible.length, MAX_RECENTLY_REMOVED);
    assert.equal(visible.length, list.length);
  });
});
