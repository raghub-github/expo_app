/**
 * Structured customisation display for order line items (variant, add-ons, snapshot notes).
 */

import { readOrderItemSpecialInstructions } from "./order-item-special-instructions.js";

export type OrderItemAddonDetail = {
  name: string;
  quantity: number;
  price: number;
  type?: string | null;
};

/** One display row: `Quantity: Full(qty: 1 Price:169) [Total Price:169]` */
export type OrderItemCustomisationLine = {
  label: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

export type OrderItemCustomisationDetail = {
  variantName: string | null;
  variantPrice: number | null;
  variantSize: string | null;
  addons: OrderItemAddonDetail[];
  notes: string[];
  lines: OrderItemCustomisationLine[];
  /** Flat summary for tooltips / legacy strings */
  plainText: string;
};

function formatPriceNum(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const r = Math.round(n * 100) / 100;
  return r % 1 === 0 ? String(Math.round(r)) : r.toFixed(2);
}

/** `Quantity: Full(qty: 1 Price:169) [Total Price:169]` */
export function formatCustomisationLine(line: OrderItemCustomisationLine): string {
  return `${line.label}: ${line.name}(qty: ${line.quantity} Price:${formatPriceNum(line.unitPrice)}) [Total Price:${formatPriceNum(line.totalPrice)}]`;
}

function asNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function readSnapString(snap: Record<string, unknown> | null, keys: string[]): string | null {
  if (!snap) return null;
  for (const k of keys) {
    const v = snap[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function parseAddonsArray(
  raw: unknown[],
  priceRow?: Record<string, unknown>
): OrderItemAddonDetail[] {
  const out: OrderItemAddonDetail[] = [];
  for (const entry of raw) {
    if (typeof entry === "string" && entry.trim()) {
      out.push({ name: entry.trim(), quantity: 1, price: 0, type: null });
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const name = String(
      row.addonName ?? row.addon_name ?? row.name ?? row.label ?? ""
    ).trim();
    if (!name) continue;
    out.push({
      name,
      quantity: Math.max(1, asNum(row.quantity) ?? 1),
      price: asNum(row.addonPrice ?? row.addon_price ?? row.price) ?? 0,
      type:
        row.addonType != null
          ? String(row.addonType)
          : row.addon_type != null
            ? String(row.addon_type)
            : row.type != null
              ? String(row.type)
              : null,
    });
  }
  if (out.length > 0 && priceRow) {
    const prices = priceRow.addon_prices ?? priceRow.addonPrices;
    if (Array.isArray(prices)) {
      for (let i = 0; i < out.length && i < prices.length; i++) {
        const p = asNum(prices[i]);
        if (p != null && p > 0) out[i] = { ...out[i], price: p };
      }
    }
  }
  return out;
}

function mergeAddonLists(lists: OrderItemAddonDetail[][]): OrderItemAddonDetail[] {
  const byKey = new Map<string, OrderItemAddonDetail>();
  for (const list of lists) {
    for (const a of list) {
      const key = a.name.toLowerCase().trim();
      if (!key) continue;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { ...a });
        continue;
      }
      byKey.set(key, {
        name: existing.name.length >= a.name.length ? existing.name : a.name,
        quantity: Math.max(existing.quantity, a.quantity),
        price: Math.max(existing.price, a.price),
        type: existing.type ?? a.type,
      });
    }
  }
  return [...byKey.values()];
}

function addonsFromCommaText(
  text: string | null,
  variantName: string | null,
  skip: Set<string>
): OrderItemAddonDetail[] {
  if (!text?.trim()) return [];
  const out: OrderItemAddonDetail[] = [];
  for (const part of text.split(/[,;|•]+/)) {
    const name = part.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (variantName && key === variantName.toLowerCase()) continue;
    if (skip.has(key)) continue;
    skip.add(key);
    out.push({ name, quantity: 1, price: 0, type: null });
  }
  return out;
}

function applyStoredAddonPrices(
  addons: OrderItemAddonDetail[],
  storedAddonPrice: number
): OrderItemAddonDetail[] {
  if (storedAddonPrice <= 0) return addons;
  const missing = addons.filter((a) => a.price <= 0);
  if (missing.length === 0) return addons;
  const totalQty = missing.reduce((s, a) => s + a.quantity, 0);
  if (totalQty <= 0) return addons;
  const perUnit = Math.round((storedAddonPrice / totalQty) * 100) / 100;
  return addons.map((a) => (a.price > 0 ? a : { ...a, price: perUnit }));
}

/** Merge addons from DB rows, cart JSON, billing line, and item_snapshot. */
export function resolveAllOrderItemAddons(args: {
  dbAddons: Array<{
    name: string;
    quantity: number;
    price: number;
    type?: string | null;
  }>;
  cartLine?: Record<string, unknown> | null;
  itemSnapshot?: Record<string, unknown> | null;
  storedAddonPrice?: number;
  variantName?: string | null;
}): OrderItemAddonDetail[] {
  const lists: OrderItemAddonDetail[][] = [];

  if (args.dbAddons.length > 0) {
    lists.push(
      args.dbAddons.map((a) => ({
        name: a.name.trim(),
        quantity: Math.max(1, a.quantity),
        price: a.price,
        type: a.type?.trim() || null,
      }))
    );
  }

  const cart = args.cartLine;
  if (cart) {
    if (Array.isArray(cart.addons)) {
      lists.push(parseAddonsArray(cart.addons as unknown[], cart));
    }
    const cust =
      cart.customization != null
        ? String(cart.customization)
        : cart.customisation != null
          ? String(cart.customisation)
          : null;
    const known = new Set<string>();
    for (const list of lists) {
      for (const a of list) known.add(a.name.toLowerCase());
    }
    lists.push(addonsFromCommaText(cust, args.variantName ?? null, known));
  }

  lists.push(addonsFromSnapshot(args.itemSnapshot ?? null));

  let merged = mergeAddonLists(lists);
  merged = applyStoredAddonPrices(merged, args.storedAddonPrice ?? 0);
  return merged;
}

/** Pick richest cart line for a core item (pending snapshot > core.items > food.items). */
export function findCartLineForOrderItem(
  cartLines: Record<string, unknown>[],
  match: {
    lineIndex: number;
    menuItemId: number | null;
    name: string;
    variant: string | null;
  }
): Record<string, unknown> | null {
  const byIndex = cartLines[match.lineIndex];
  if (byIndex && typeof byIndex === "object") return byIndex;

  const normName = match.name.trim().toLowerCase();
  const normVariant = match.variant?.trim().toLowerCase() ?? "";

  for (const row of cartLines) {
    const id = asNum(row.menuItemId ?? row.menu_item_id ?? row.item_id);
    if (match.menuItemId != null && id === match.menuItemId) return row;

    const name = String(row.itemName ?? row.item_name ?? row.name ?? "")
      .trim()
      .toLowerCase();
    const variant = String(
      row.variantName ?? row.variant_name ?? row.variant ?? ""
    )
      .trim()
      .toLowerCase();

    if (name && name === normName) {
      if (!normVariant || variant === normVariant) return row;
    }
  }
  return null;
}

function addonsFromSnapshot(snap: Record<string, unknown> | null): OrderItemAddonDetail[] {
  if (!snap) return [];
  const raw = snap.addons ?? snap.addon ?? snap.selected_addons ?? snap.selectedAddons;
  if (Array.isArray(raw)) {
    return parseAddonsArray(raw, snap);
  }
  return [];
}

function notesFromSnapshot(
  snap: Record<string, unknown> | null,
  relationalInstructions?: string | null,
): string[] {
  if (!snap && !relationalInstructions) return [];
  const notes: string[] = [];
  const free =
    relationalInstructions?.trim() ||
    readSnapString(snap, [
      "item_instructions",
      "item_note",
      "special_instructions",
      "instructions",
      "note",
    ]);
  if (free) notes.push(free);
  const cat = readSnapString(snap, ["category_name", "categoryName"]);
  if (cat) notes.push(`Category: ${cat}`);
  return notes;
}

export function buildCustomisationDetail(args: {
  variantName: string | null;
  basePrice?: number | null;
  itemSnapshot?: Record<string, unknown> | null;
  cartLine?: Record<string, unknown> | null;
  storedAddonPrice?: number;
  specialInstructions?: string | null;
  addons: Array<{
    name: string;
    quantity: number;
    price: number;
    type?: string | null;
  }>;
}): OrderItemCustomisationDetail {
  const snap = args.itemSnapshot ?? null;

  let variantName =
    args.variantName?.trim() ||
    readSnapString(snap, ["variantName", "variant_name"]) ||
    (args.cartLine
      ? readSnapString(args.cartLine, ["variantName", "variant_name", "variant"])
      : null) ||
    null;

  let variantSize =
    readSnapString(snap, [
      "variant_size",
      "variantSize",
      "size",
      "portion",
      "serving_size",
      "servingSize",
    ]) ?? null;
  if (!variantSize && snap) {
    const val = readSnapString(snap, ["variant_size_value", "variantSizeValue"]);
    const unit = readSnapString(snap, ["variant_size_unit", "variantSizeUnit"]);
    if (val && unit) variantSize = `${val} ${unit}`;
    else if (val) variantSize = val;
  }
  if (!variantSize && args.cartLine) {
    const val = readSnapString(args.cartLine, ["variant_size_value", "variantSizeValue"]);
    const unit = readSnapString(args.cartLine, ["variant_size_unit", "variantSizeUnit"]);
    if (val && unit) variantSize = `${val} ${unit}`;
    else if (val) variantSize = val;
  }

  const variantPrice =
    asNum(snap?.variant_price) ??
    asNum(snap?.variantPrice) ??
    asNum(snap?.variant_addon_price) ??
    null;

  const addons = resolveAllOrderItemAddons({
    dbAddons: args.addons,
    cartLine: args.cartLine,
    itemSnapshot: snap,
    storedAddonPrice: args.storedAddonPrice,
    variantName,
  });

  const notes = notesFromSnapshot(
    snap,
    readOrderItemSpecialInstructions({
      relational: args.specialInstructions,
      itemSnapshot: snap,
      cartLine: args.cartLine ?? null,
    }),
  );

  const lines: OrderItemCustomisationLine[] = [];

  if (variantName) {
    const displayName = variantSize ? `${variantName} (${variantSize})` : variantName;
    const unitPrice =
      variantPrice != null && variantPrice > 0
        ? variantPrice
        : args.basePrice != null && args.basePrice > 0
          ? args.basePrice
          : 0;
    const qty = 1;
    lines.push({
      label: "Quantity",
      name: displayName,
      quantity: qty,
      unitPrice,
      totalPrice: unitPrice * qty,
    });
  }

  for (const a of addons) {
    const unitPrice = a.price > 0 ? a.price : 0;
    const qty = Math.max(1, a.quantity);
    lines.push({
      label: "Add-on",
      name: a.name,
      quantity: qty,
      unitPrice,
      totalPrice: unitPrice * qty,
    });
  }

  const plainText =
    lines.length > 0 ? lines.map(formatCustomisationLine).join(" | ") : "-";

  return {
    variantName,
    variantPrice,
    variantSize,
    addons,
    notes,
    lines,
    plainText,
  };
}

export function formatCustomisationPlain(detail: OrderItemCustomisationDetail): string {
  return detail.plainText;
}

export type MerchantItemCustomizationLine = {
  name: string;
  amount: number;
  kind: "variant" | "addon" | "note";
};

export function merchantItemBreakdownFromDetail(
  detail: OrderItemCustomisationDetail,
  qty: number,
  baseUnitFromRow: number,
): {
  variantTag: string | null;
  categoryName: string | null;
  lines: MerchantItemCustomizationLine[];
  baseAmount: number;
  customizationsTotal: number;
  lineTotal: number;
} {
  const q = Math.max(1, qty);
  const lines: MerchantItemCustomizationLine[] = [];

  if (detail.variantName) {
    const unit =
      detail.variantPrice != null && detail.variantPrice > 0
        ? detail.variantPrice
        : baseUnitFromRow > 0
          ? baseUnitFromRow
          : 0;
    const label = detail.variantSize
      ? `${detail.variantName} (${detail.variantSize})`
      : detail.variantName;
    lines.push({ name: label, amount: unit, kind: "variant" });
  }

  for (const a of detail.addons) {
    const unit = a.price > 0 ? a.price : 0;
    lines.push({
      name: a.quantity > 1 ? `${a.name} ×${a.quantity}` : a.name,
      amount: unit * Math.max(1, a.quantity),
      kind: "addon",
    });
  }

  for (const n of detail.notes) {
    const t = n.trim();
    if (!t || t.toLowerCase().startsWith("category:")) continue;
    lines.push({ name: t, amount: 0, kind: "note" });
  }

  let categoryName: string | null = null;
  for (const n of detail.notes) {
    const t = n.trim();
    if (t.toLowerCase().startsWith("category:")) {
      categoryName = t.replace(/^category:\s*/i, "").trim() || null;
      break;
    }
  }

  const variantAmount = lines
    .filter((l) => l.kind === "variant")
    .reduce((s, l) => s + l.amount, 0);
  const addonAmount = lines
    .filter((l) => l.kind === "addon")
    .reduce((s, l) => s + l.amount, 0);
  const baseAmount =
    variantAmount > 0.005
      ? round2(variantAmount)
      : round2(Math.max(0, baseUnitFromRow) * q);
  const customizationsTotal = round2(addonAmount);
  const lineTotal = round2(baseAmount + customizationsTotal);

  return {
    variantTag: detail.variantName?.trim() || null,
    categoryName,
    lines,
    baseAmount,
    customizationsTotal,
    lineTotal: lineTotal > 0 ? lineTotal : baseAmount + customizationsTotal,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Plain variant + add-on lines for customer order detail / customization sheet. */
export function customizationLabelsForCustomer(detail: OrderItemCustomisationDetail): {
  variantDisplay: string | null;
  addonLines: string[];
} {
  let variantDisplay: string | null = null;
  if (detail.variantName) {
    variantDisplay = detail.variantSize
      ? `${detail.variantName} (${detail.variantSize})`
      : detail.variantName;
  }
  const addonLines = detail.addons.map((a) => {
    const base = a.name.trim();
    if (!base) return "";
    return a.quantity > 1 ? `${base} ×${a.quantity}` : base;
  }).filter(Boolean);
  return { variantDisplay, addonLines };
}

/** Short lines for merchant / partner item lists (variant, add-ons, notes). */
export function customizationLabelsForMerchant(
  detail: OrderItemCustomisationDetail,
): string[] {
  if (detail.plainText === "-") return [];
  const labels: string[] = [];
  if (detail.variantName) {
    const v = detail.variantSize
      ? `${detail.variantName} (${detail.variantSize})`
      : detail.variantName;
    labels.push(v);
  }
  for (const a of detail.addons) {
    const price =
      a.price > 0 ? ` · ₹${Math.round(a.price)}` : "";
    labels.push(
      a.quantity > 1 ? `+ ${a.name} ×${a.quantity}${price}` : `+ ${a.name}${price}`,
    );
  }
  for (const n of detail.notes) {
    const t = n.trim();
    if (t) labels.push(t);
  }
  return labels;
}
