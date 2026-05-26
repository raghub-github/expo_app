/**
 * Canonical menu item stock fields — keep merchant app, partner site, and dashboard in sync.
 * Restoring in stock always clears out_of_stock_* and stamps a new marker (breaks category cascade).
 */

export function buildMenuItemStockTogglePatch(inStock: boolean, now = new Date().toISOString()) {
  if (inStock) {
    return {
      in_stock: true,
      out_of_stock_manual: false,
      out_of_stock_until: null,
      out_of_stock_updated_at: now,
      updated_at: now,
    };
  }
  return {
    in_stock: false,
    out_of_stock_manual: true,
    out_of_stock_until: null,
    out_of_stock_updated_at: now,
    updated_at: now,
  };
}

export function buildMenuItemOosModePatch(
  manual: boolean,
  until: Date | null,
  now = new Date().toISOString()
) {
  const itemNowOos = manual || (until != null && until.getTime() > Date.now());
  return {
    out_of_stock_manual: manual,
    out_of_stock_until: until ? until.toISOString() : null,
    out_of_stock_updated_at: now,
    in_stock: !itemNowOos,
    updated_at: now,
  };
}
