import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMenuItemFullConfigFallback,
  menuItemNeedsServerOptions,
  resolveFullConfigItemId,
} from "./menuItemFullConfigFallback";
import { shouldBypassStartupGate } from "./startup-api-gate";

describe("menu item full-config sheet speed", () => {
  it("builds an instant fallback config without network", () => {
    const fb = buildMenuItemFullConfigFallback({
      id: "SS1026_plain",
      menuItemId: 42,
      name: "Plain Chappati",
      price: 18,
      isVeg: true,
      imageUrl: "https://example.com/c.jpg",
    });
    assert.equal(fb.item.name, "Plain Chappati");
    assert.equal(fb.item.price, 18);
    assert.equal(fb.variants.length, 0);
    assert.equal(fb.customizations.length, 0);
    assert.equal(resolveFullConfigItemId(fb.item), "SS1026_plain");
  });

  it("home rail items without has_* flags do not require server options spinner", () => {
    assert.equal(
      menuItemNeedsServerOptions({
        hasVariants: false,
        hasAddons: false,
        hasCustomizations: false,
      }),
      false
    );
    assert.equal(
      menuItemNeedsServerOptions({ hasVariants: true, hasAddons: false, hasCustomizations: false }),
      true
    );
  });

  it("bypasses startup API gate for full-config (never queue behind cold-start)", () => {
    assert.equal(
      shouldBypassStartupGate("/v1/merchants/GMMC1026/menu/items/SS1026_x/full-config"),
      true
    );
    assert.equal(shouldBypassStartupGate("/v1/merchants/nearby"), false);
  });
});
