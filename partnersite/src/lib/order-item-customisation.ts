/**
 * Structured customisation display for order line items (variant, add-ons, snapshot notes).
 */

import {
  formatMenuOptionDisplayName,
  formatMenuPortionLabel,
} from "@/lib/format-menu-portion-label";

export type OrderItemAddonDetail = {
  name: string;
  quantity: number;
  price: number;
  type?: string | null;
  sizeValue?: string | null;
  sizeUnit?: string | null;
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

function readSizeValueUnit(
  row: Record<string, unknown> | null,
  prefix: "variant" | "addon"
): { value: string | null; unit: string | null } {
  if (!row) return { value: null, unit: null };
  const valueKeys =
    prefix === "variant"
      ? [
          "variant_size_value",
          "variantSizeValue",
          "size_value",
          "sizeValue",
        ]
      : ["addon_size_value", "addonSizeValue", "size_value", "sizeValue"];
  const unitKeys =
    prefix === "variant"
      ? ["variant_size_unit", "variantSizeUnit", "size_unit", "sizeUnit"]
      : ["addon_size_unit", "addonSizeUnit", "size_unit", "sizeUnit"];

  let value: string | null = null;
  for (const k of valueKeys) {
    const v = row[k];
    if (v != null && String(v).trim() !== "") {
      value = String(v).trim();
      break;
    }
  }
  let unit: string | null = null;
  for (const k of unitKeys) {
    const v = row[k];
    if (v != null && String(v).trim() !== "") {
      unit = String(v).trim();
      break;
    }
  }
  return { value, unit };
}

function readVariantPortion(
  snap: Record<string, unknown> | null,
  cartLine?: Record<string, unknown> | null
): string | null {
  const fromSnap = readSizeValueUnit(snap, "variant");
  const fromCart = readSizeValueUnit(cartLine ?? null, "variant");
  const portion =
    formatMenuPortionLabel(fromSnap.value ?? fromCart.value, fromSnap.unit ?? fromCart.unit) ??
    readSnapString(snap, [
      "variant_size",
      "variantSize",
      "size",
      "portion",
      "serving_size",
      "servingSize",
    ]) ??
    (cartLine
      ? readSnapString(cartLine, [
          "variant_size",
          "variantSize",
          "size",
          "portion",
        ])
      : null);
  return portion;
}

const SIZE_CHOICE_NAME_RE =
  /^(half|full|small|medium|large|regular|jumbo|mini|family|single|quarter)\b/i;

function isSizeChoiceAddon(a: OrderItemAddonDetail): boolean {
  const t = (a.type ?? "").toLowerCase();
  if (
    t.includes("variant") ||
    t.includes("size") ||
    t.includes("portion") ||
    t === "quantity"
  ) {
    return true;
  }
  if (a.sizeValue || a.sizeUnit) return true;
  const base = a.name.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return SIZE_CHOICE_NAME_RE.test(base);
}

function addonDisplayName(
  rawName: string,
  row?: Record<string, unknown> | null
): string {
  const name = rawName.trim();
  if (!name) return name;
  const { value, unit } = readSizeValueUnit(row ?? null, "addon");
  return formatMenuOptionDisplayName(name, value, unit);
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
    const { value: sizeValue, unit: sizeUnit } = readSizeValueUnit(row, "addon");
    out.push({
      name: addonDisplayName(name, row),
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
      sizeValue,
      sizeUnit,
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

function notesFromSnapshot(snap: Record<string, unknown> | null): string[] {
  if (!snap) return [];
  const notes: string[] = [];
  const free = readSnapString(snap, [
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

  const variantSize = readVariantPortion(snap, args.cartLine ?? null);

  const variantPrice =
    asNum(snap?.variant_price) ??
    asNum(snap?.variantPrice) ??
    asNum(snap?.variant_addon_price) ??
    null;

  let addons = resolveAllOrderItemAddons({
    dbAddons: args.addons,
    cartLine: args.cartLine,
    itemSnapshot: snap,
    storedAddonPrice: args.storedAddonPrice,
    variantName,
  });

  if (!variantName) {
    const sizeIdx = addons.findIndex((a) => isSizeChoiceAddon(a));
    if (sizeIdx >= 0) {
      variantName = addons[sizeIdx].name;
      addons = addons.filter((_, i) => i !== sizeIdx);
    }
  }

  const notes = notesFromSnapshot(snap);

  const lines: OrderItemCustomisationLine[] = [];

  if (variantName) {
    const snapSizes = readSizeValueUnit(snap, "variant");
    const cartSizes = readSizeValueUnit(args.cartLine ?? null, "variant");
    let displayName = formatMenuOptionDisplayName(
      variantName,
      snapSizes.value ?? cartSizes.value,
      snapSizes.unit ?? cartSizes.unit
    );
    if (
      displayName === variantName &&
      variantSize &&
      !displayName.toLowerCase().includes(variantSize.toLowerCase())
    ) {
      displayName = `${variantName} (${variantSize})`;
    }
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
      name: formatMenuOptionDisplayName(a.name, a.sizeValue, a.sizeUnit),
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
    let variantLabel = detail.variantName.trim();
    if (
      detail.variantSize &&
      !variantLabel.toLowerCase().includes(detail.variantSize.toLowerCase())
    ) {
      variantLabel = `${variantLabel} (${detail.variantSize})`;
    }
    lines.push({ name: variantLabel, amount: unit, kind: "variant" });
  }

  for (const a of detail.addons) {
    const unit = a.price > 0 ? a.price : 0;
    const addonLabel = formatMenuOptionDisplayName(a.name, a.sizeValue, a.sizeUnit);
    lines.push({
      name: a.quantity > 1 ? `${addonLabel} ×${a.quantity}` : addonLabel,
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

  let variantTag = detail.variantName?.trim() || null;
  if (
    variantTag &&
    detail.variantSize &&
    !variantTag.toLowerCase().includes(detail.variantSize.toLowerCase())
  ) {
    variantTag = `${variantTag} (${detail.variantSize})`;
  }

  return {
    variantTag,
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

/** Short lines for merchant / partner item lists (variant, add-ons, notes). */
export function customizationLabelsForMerchant(
  detail: OrderItemCustomisationDetail,
): string[] {
  if (detail.plainText === "-") return [];
  const labels: string[] = [];
  // Variant is shown as a pill under the item name (variant_tag), not in this list.
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

type CoreItemForCustomisation = {
  id: number;
  menu_item_id?: number | null;
  item_name: string;
  variant_name?: string | null;
  base_price: string | number;
  addon_price?: string | number | null;
  item_snapshot?: Record<string, unknown> | null;
};

type DbAddonRow = {
  addon_name?: string | null;
  quantity: number;
  addon_price?: string | number | null;
  addon_type?: string | null;
};

/** Attach structured customization fields onto a raw item row for normalizeOrderItems. */
export function enrichRawOrderItemFromCoreRow(args: {
  row: CoreItemForCustomisation & {
    item_name: string;
    category_name?: string | null;
    quantity: number;
    base_price: string | number;
    addon_price?: string | number | null;
    item_snapshot?: Record<string, unknown> | null;
  };
  dbAddons: DbAddonRow[];
  cartLines: Record<string, unknown>[];
  lineIndex: number;
  raw: Record<string, unknown>;
}): Record<string, unknown> {
  const cartLine = findCartLineForOrderItem(args.cartLines, {
    lineIndex: args.lineIndex,
    menuItemId:
      args.row.menu_item_id != null ? Number(args.row.menu_item_id) : null,
    name: String(args.row.item_name ?? ""),
    variant: args.row.variant_name ?? null,
  });
  const detail = buildCustomisationDetail({
    variantName: args.row.variant_name ?? null,
    basePrice: Number(args.row.base_price) || null,
    itemSnapshot: args.row.item_snapshot ?? null,
    cartLine,
    storedAddonPrice: Number(args.row.addon_price) || 0,
    addons: args.dbAddons.map((a) => ({
      name: String(a.addon_name ?? "Add-on").trim(),
      quantity: Math.max(1, Number(a.quantity) || 1),
      price: Number(a.addon_price) || 0,
      type: a.addon_type != null ? String(a.addon_type) : null,
    })),
  });
  const labels = customizationLabelsForMerchant(detail);
  const qty = Math.max(1, Number(args.row.quantity) || 1);
  const breakdown = merchantItemBreakdownFromDetail(detail, qty, Number(args.row.base_price) || 0);
  const categoryFromRow = String(args.row.category_name ?? "").trim() || null;

  const capturedBase = round2((Number(args.row.base_price) || 0) * qty);
  const capturedAddon = round2(Number(args.row.addon_price) || 0);

  const specialFromRow = String(
    (args.row as { special_instructions?: string | null }).special_instructions ?? ''
  ).trim();
  const specialFromSnap =
    args.row.item_snapshot && typeof args.row.item_snapshot === 'object'
      ? String(
          (args.row.item_snapshot as Record<string, unknown>).special_instructions ??
            (args.row.item_snapshot as Record<string, unknown>).specialInstructions ??
            (args.row.item_snapshot as Record<string, unknown>).item_instructions ??
            ''
        ).trim()
      : '';
  const specialFromCart = cartLine
    ? String(
        cartLine.specialInstructions ??
          cartLine.special_instructions ??
          cartLine.item_instructions ??
          ''
      ).trim()
    : '';
  const noteFromLines = breakdown.lines.find((l) => l.kind === 'note')?.name?.trim() || '';
  const specialInstructions =
    (specialFromRow || specialFromSnap || specialFromCart || noteFromLines || null)?.slice(0, 100) ||
    null;

  return {
    ...args.raw,
    name: String(args.row.item_name ?? "Item").trim() || "Item",
    customizations: labels.length ? labels : undefined,
    variant_tag: breakdown.variantTag,
    category_name: categoryFromRow ?? breakdown.categoryName,
    customization_lines: breakdown.lines.length ? breakdown.lines : undefined,
    base_amount: breakdown.baseAmount,
    customizations_total: breakdown.customizationsTotal,
    captured_base_amount: capturedBase,
    captured_addon_amount: capturedAddon > 0 ? capturedAddon : breakdown.customizationsTotal,
    has_customizations: breakdown.lines.length > 0 || labels.length > 0,
    special_instructions: specialInstructions,
    specialInstructions,
  };
}

export function customizationLabelsForCoreItem(args: {
  row: CoreItemForCustomisation;
  dbAddons: DbAddonRow[];
  cartLines: Record<string, unknown>[];
  lineIndex: number;
}): string[] {
  const cartLine = findCartLineForOrderItem(args.cartLines, {
    lineIndex: args.lineIndex,
    menuItemId:
      args.row.menu_item_id != null ? Number(args.row.menu_item_id) : null,
    name: String(args.row.item_name ?? ""),
    variant: args.row.variant_name ?? null,
  });
  const storedAddon = Number(args.row.addon_price) || 0;
  const detail = buildCustomisationDetail({
    variantName: args.row.variant_name ?? null,
    basePrice: Number(args.row.base_price) || null,
    itemSnapshot: args.row.item_snapshot ?? null,
    cartLine,
    storedAddonPrice: storedAddon,
    addons: args.dbAddons.map((a) => ({
      name: String(a.addon_name ?? "Add-on").trim(),
      quantity: Math.max(1, Number(a.quantity) || 1),
      price: Number(a.addon_price) || 0,
      type: a.addon_type != null ? String(a.addon_type) : null,
    })),
  });
  return customizationLabelsForMerchant(detail);
}
