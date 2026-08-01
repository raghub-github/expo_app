import type { Sql } from "postgres";
import {
  buildCustomisationDetail,
  customizationLabelsForMerchant,
  findCartLineForOrderItem,
  merchantItemBreakdownFromDetail,
  type MerchantItemCustomizationLine,
} from "./order-item-customisation.js";
import { readOrderItemSpecialInstructions } from "./order-item-special-instructions.js";
import { toAbsoluteClientMediaUrl } from "../utils/publicAttachmentUrl.js";

export type MerchantOrderLineItem = {
  qty: number;
  name: string;
  price: number;
  menu_item_id?: number | null;
  /** Live catalog primary image URL (empty → merchant can Add photo). */
  item_image_url?: string | null;
  veg_nonveg?: string | null;
  customizations?: string[];
  special_instructions?: string | null;
  specialInstructions?: string | null;
  variant_tag?: string | null;
  category_name?: string | null;
  customization_lines?: MerchantItemCustomizationLine[];
  base_amount?: number;
  customizations_total?: number;
  has_customizations?: boolean;
  catalog_line_total?: number;
  net_line_total?: number;
  offer_discount?: number;
  offer_label?: string | null;
  is_item_promo?: boolean;
  applied_offer_type?: string | null;
  /** True when price/net came from merchant_ctm_pricing_snapshot (skip live menu / commission rescale). */
  ctm_from_snapshot?: boolean;
  order_item_id?: number;
};

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function extractCartLines(raw: unknown): Record<string, unknown>[] {
  if (!raw) return [];
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (Array.isArray(parsed)) {
    return parsed.map((r) =>
      r && typeof r === "object" ? (r as Record<string, unknown>) : {},
    );
  }
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    for (const key of ["items", "order_items", "cart_items"]) {
      if (Array.isArray(o[key])) {
        return (o[key] as unknown[]).map((r) =>
          r && typeof r === "object" ? (r as Record<string, unknown>) : {},
        );
      }
    }
  }
  return [];
}

function mergeCartLines(sources: unknown[]): Record<string, unknown>[] {
  let best: Record<string, unknown>[] = [];
  for (const src of sources) {
    const arr = extractCartLines(src);
    if (arr.length > best.length) best = arr;
  }
  return best;
}

function displayName(baseName: string, variant: string | null): string {
  const base = baseName.trim() || "Item";
  const v = (variant ?? "").trim();
  return v ? `${base} (${v})` : base;
}

/**
 * Load orders_core_items (+ addons, cart snapshot) with merchant-facing customization labels.
 */
export async function loadMerchantOrderLineItemsByTextIds(
  sql: Sql,
  orderTextIds: string[],
): Promise<Map<string, MerchantOrderLineItem[]>> {
  const unique = [...new Set(orderTextIds.map((t) => String(t ?? "").trim()).filter(Boolean))];
  const out = new Map<string, MerchantOrderLineItem[]>();
  if (unique.length === 0) return out;

  type CoreItemRow = {
    id: number;
    order_id: string;
    menu_item_id: number | null;
    item_name: string;
    variant_name: string | null;
    category_name: string | null;
    quantity: number;
    base_price: unknown;
    addon_price: unknown;
    total_price: unknown;
    veg_nonveg: string | null;
    item_snapshot: Record<string, unknown> | null;
    effective_line_total: unknown;
    offer_discount_amount: unknown;
    applied_offer_label: string | null;
    applied_offer_type: string | null;
    special_instructions: string | null;
  };

  let itemRows: CoreItemRow[];
  try {
    itemRows = (await sql`
      SELECT id, order_id, menu_item_id, item_name, variant_name, category_name, quantity,
        base_price, addon_price, total_price, veg_nonveg, item_snapshot,
        effective_line_total, offer_discount_amount, applied_offer_label, applied_offer_type,
        special_instructions
      FROM orders_core_items
      WHERE order_id = ANY(${unique}::text[])
      ORDER BY id ASC
    `) as CoreItemRow[];
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "42703") throw err;
    // Pre-0410 / pre-0433 schema — columns missing.
    itemRows = (await sql`
      SELECT id, order_id, menu_item_id, item_name, variant_name, category_name, quantity,
        base_price, addon_price, total_price, veg_nonveg, item_snapshot
      FROM orders_core_items
      WHERE order_id = ANY(${unique}::text[])
      ORDER BY id ASC
    `).map((r) => ({
      ...(r as Omit<
        CoreItemRow,
        | "effective_line_total"
        | "offer_discount_amount"
        | "applied_offer_label"
        | "applied_offer_type"
        | "special_instructions"
      >),
      effective_line_total: null,
      offer_discount_amount: null,
      applied_offer_label: null,
      applied_offer_type: null,
      special_instructions: null,
    })) as CoreItemRow[];
  }

  if (!itemRows.length) return out;

  const itemIds = itemRows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
  const ctmByItemId = new Map<
    number,
    {
      gross_value: number;
      merchant_offer_discount: number;
      net_ctm_value: number;
      merchant_offer_type: string | null;
      merchant_offer_name: string | null;
    }
  >();
  if (itemIds.length > 0) {
    try {
      const ctmRows = await sql<
        Array<{
          order_item_id: number;
          gross_value: unknown;
          merchant_offer_discount: unknown;
          net_ctm_value: unknown;
          merchant_offer_type: string | null;
          merchant_offer_name: string | null;
        }>
      >`
        SELECT order_item_id, gross_value, merchant_offer_discount, net_ctm_value,
          merchant_offer_type, merchant_offer_name
        FROM merchant_ctm_pricing_snapshot
        WHERE order_item_id = ANY(${itemIds}::int[])
      `;
      for (const r of ctmRows) {
        const id = Number(r.order_item_id);
        if (!Number.isFinite(id)) continue;
        ctmByItemId.set(id, {
          gross_value: num(r.gross_value),
          merchant_offer_discount: num(r.merchant_offer_discount),
          net_ctm_value: num(r.net_ctm_value),
          merchant_offer_type: r.merchant_offer_type,
          merchant_offer_name: r.merchant_offer_name,
        });
      }
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== "42P01") throw err;
    }
  }

  const addonsByItemId = new Map<
    number,
    Array<{
      addon_name: string | null;
      quantity: number;
      addon_price: unknown;
    }>
  >();
  if (itemIds.length > 0) {
    try {
      const addonRows = await sql<
        Array<{
          id: number;
          order_item_id: number;
          addon_name: string | null;
          quantity: number;
          addon_price: unknown;
          menu_addon_id: string | null;
        }>
      >`
        SELECT id, order_item_id, addon_name, quantity, addon_price, menu_addon_id
        FROM orders_core_item_addons
        WHERE order_item_id = ANY(${itemIds}::int[])
      `;
      const addonPkIds = addonRows.map((a) => Number(a.id)).filter((id) => Number.isFinite(id) && id > 0);
      const snapshotByAddonPk = new Map<
        number,
        { merchant_base_price: unknown; customer_visible_price: unknown }
      >();
      if (addonPkIds.length > 0) {
        try {
          const snapRows = await sql<
            Array<{
              order_item_addon_id: number;
              merchant_base_price: unknown;
              customer_visible_price: unknown;
            }>
          >`
            SELECT order_item_addon_id, merchant_base_price, customer_visible_price
            FROM order_item_addon_commission_snapshots
            WHERE order_item_addon_id = ANY(${addonPkIds}::int[])
          `;
          for (const s of snapRows) {
            snapshotByAddonPk.set(Number(s.order_item_addon_id), s);
          }
        } catch (err) {
          const code = (err as { code?: string })?.code;
          if (code !== "42P01") throw err;
        }
      }
      for (const a of addonRows) {
        const id = Number(a.order_item_id);
        if (!Number.isFinite(id)) continue;
        const snap = snapshotByAddonPk.get(Number(a.id));
        const qty = Math.max(1, Number(a.quantity) || 1);
        const unitMerchant = snap != null ? num(snap.merchant_base_price) : num(a.addon_price);
        const list = addonsByItemId.get(id) ?? [];
        list.push({
          ...a,
          addon_price: unitMerchant * qty,
        });
        addonsByItemId.set(id, list);
      }
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== "42P01") {
        /* Addons are enrichment only — never fail the merchant order board. */
        console.warn("[merchant-line-items] addons load failed:", (err as Error)?.message ?? err);
      }
    }
  }

  let pendingRows: Array<{ finalized_order_id: string; items_snapshot: unknown }> = [];
  try {
    pendingRows = await sql<
      Array<{ finalized_order_id: string; items_snapshot: unknown }>
    >`
      SELECT DISTINCT ON (finalized_order_id) finalized_order_id, items_snapshot
      FROM pending_orders
      WHERE finalized_order_id = ANY(${unique}::text[])
      ORDER BY finalized_order_id, id DESC
    `;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "42P01") {
      console.warn("[merchant-line-items] pending_orders load failed:", (err as Error)?.message ?? err);
    }
    pendingRows = [];
  }
  const cartByOrderText = new Map<string, Record<string, unknown>[]>();
  for (const p of pendingRows) {
    const key = String(p.finalized_order_id ?? "").trim();
    if (!key) continue;
    cartByOrderText.set(key, extractCartLines(p.items_snapshot));
  }

  const grouped = new Map<string, CoreItemRow[]>();
  for (const row of itemRows) {
    const oid = String(row.order_id);
    const list = grouped.get(oid) ?? [];
    list.push(row);
    grouped.set(oid, list);
  }

  for (const [oid, rows] of grouped) {
    const cartLines = cartByOrderText.get(oid) ?? [];
    const lines: MerchantOrderLineItem[] = rows.map((row, lineIndex) => {
      const dbAddons = addonsByItemId.get(Number(row.id)) ?? [];
      const cartLine = findCartLineForOrderItem(cartLines, {
        lineIndex,
        menuItemId: row.menu_item_id != null ? Number(row.menu_item_id) : null,
        name: String(row.item_name ?? ""),
        variant: row.variant_name,
      });
      const specialInstructions = readOrderItemSpecialInstructions({
        relational: row.special_instructions,
        itemSnapshot: row.item_snapshot,
        cartLine,
      });
      const detail = buildCustomisationDetail({
        variantName: row.variant_name,
        basePrice: num(row.base_price),
        itemSnapshot: row.item_snapshot,
        cartLine,
        storedAddonPrice: num(row.addon_price),
        specialInstructions,
        addons: dbAddons.map((a) => ({
          name: String(a.addon_name ?? "Add-on").trim(),
          quantity: Math.max(1, Number(a.quantity) || 1),
          price: num(a.addon_price),
          type: null,
        })),
      });
      const customizations = customizationLabelsForMerchant(detail);
      const qty = Number(row.quantity) || 1;
      const breakdown = merchantItemBreakdownFromDetail(
        detail,
        qty,
        num(row.base_price),
      );
      const lineTotal = num(row.total_price ?? row.base_price) || breakdown.lineTotal;
      const categoryFromRow = String(row.category_name ?? "").trim() || null;
      const veg =
        row.veg_nonveg != null && String(row.veg_nonveg).trim() !== ""
          ? String(row.veg_nonveg).trim()
          : null;
      const hasCust =
        breakdown.lines.length > 0 || (customizations?.length ?? 0) > 0;
      const offerDisc = num(row.offer_discount_amount);
      const effectiveLine =
        row.effective_line_total != null && String(row.effective_line_total).trim() !== ""
          ? num(row.effective_line_total)
          : null;
      const isPromo =
        offerDisc > 0.005 ||
        (effectiveLine != null && Math.abs(effectiveLine - lineTotal) > 0.005);
      const ctm = ctmByItemId.get(Number(row.id));
      if (ctm && ctm.gross_value > 0.005) {
        const offerTypeRaw = String(ctm.merchant_offer_type ?? "").trim();
        const offerTypeNorm = offerTypeRaw.toUpperCase().replace(/[-\s]+/g, "_");
        const isNone = !offerTypeNorm || offerTypeNorm === "NONE";
        const isBogo =
          offerTypeNorm === "BOGO" ||
          offerTypeNorm === "BUY_X_GET_Y" ||
          offerTypeNorm === "BUY_N_GET_M";
        const moneyPromo = ctm.merchant_offer_discount > 0.005;
        const offerName = String(ctm.merchant_offer_name ?? "").trim() || null;
        const hasMerchantOffer = !isNone && (moneyPromo || isBogo || Boolean(offerName));
        return {
          qty,
          name: String(row.item_name ?? "Item").trim() || "Item",
          // price = catalog for bill math; UI uses catalog_line_total / net_line_total.
          price: ctm.gross_value,
          menu_item_id:
            row.menu_item_id != null && Number.isFinite(Number(row.menu_item_id))
              ? Number(row.menu_item_id)
              : null,
          veg_nonveg: veg,
          customizations: customizations.length ? customizations : undefined,
          variant_tag: breakdown.variantTag,
          category_name: categoryFromRow ?? breakdown.categoryName,
          customization_lines: breakdown.lines.length ? breakdown.lines : undefined,
          base_amount: breakdown.baseAmount,
          customizations_total: breakdown.customizationsTotal,
          captured_base_amount: Math.round((num(row.base_price) * qty) * 100) / 100,
          captured_addon_amount:
            Math.round((num(row.addon_price) || breakdown.customizationsTotal) * 100) /
            100,
          has_customizations: hasCust,
          catalog_line_total: ctm.gross_value,
          net_line_total: isBogo ? ctm.gross_value : ctm.net_ctm_value,
          offer_discount: moneyPromo ? ctm.merchant_offer_discount : 0,
          offer_label: hasMerchantOffer ? offerName : null,
          is_item_promo: moneyPromo || isBogo,
          applied_offer_type: hasMerchantOffer ? offerTypeRaw || null : null,
          ctm_from_snapshot: true,
          order_item_id: Number(row.id),
          special_instructions: specialInstructions,
          specialInstructions,
        };
      }
      return {
        qty,
        name: String(row.item_name ?? "Item").trim() || "Item",
        price: lineTotal,
        menu_item_id:
          row.menu_item_id != null && Number.isFinite(Number(row.menu_item_id))
            ? Number(row.menu_item_id)
            : null,
        veg_nonveg: veg,
        customizations: customizations.length ? customizations : undefined,
        variant_tag: breakdown.variantTag,
        category_name: categoryFromRow ?? breakdown.categoryName,
        customization_lines: breakdown.lines.length ? breakdown.lines : undefined,
        base_amount: breakdown.baseAmount,
        customizations_total: breakdown.customizationsTotal,
        captured_base_amount: Math.round((num(row.base_price) * qty) * 100) / 100,
        captured_addon_amount:
          Math.round((num(row.addon_price) || breakdown.customizationsTotal) * 100) /
          100,
        has_customizations: hasCust,
        catalog_line_total: lineTotal,
        net_line_total: isPromo && effectiveLine != null ? effectiveLine : lineTotal,
        offer_discount: isPromo ? offerDisc : 0,
        offer_label: isPromo
          ? String(row.applied_offer_label ?? "").trim() || null
          : null,
        is_item_promo: isPromo,
        applied_offer_type: isPromo
          ? String(row.applied_offer_type ?? "").trim() || null
          : null,
        order_item_id: Number(row.id),
        special_instructions: specialInstructions,
        specialInstructions,
      };
    });
    out.set(oid, lines);
  }

  // Attach live menu primary image so preparing cards can show Add-photo without extra client fetches.
  const allMenuIds = [
    ...new Set(
      [...out.values()]
        .flat()
        .map((l) => (l.menu_item_id != null ? Number(l.menu_item_id) : NaN))
        .filter((n) => Number.isFinite(n) && n > 0)
    ),
  ];
  if (allMenuIds.length > 0) {
    try {
      const imgRows = await sql<
        Array<{ id: number; item_image_url: string | null }>
      >`
        SELECT id, item_image_url
        FROM merchant_menu_items
        WHERE id = ANY(${allMenuIds}::int[])
      `;
      const imgById = new Map<number, string | null>();
      for (const r of imgRows) {
        const id = Number(r.id);
        if (!Number.isFinite(id)) continue;
        const raw = r.item_image_url != null ? String(r.item_image_url).trim() : "";
        imgById.set(id, raw ? toAbsoluteClientMediaUrl(raw) : null);
      }
      for (const [, lines] of out) {
        for (const line of lines) {
          const mid =
            line.menu_item_id != null && Number.isFinite(Number(line.menu_item_id))
              ? Number(line.menu_item_id)
              : null;
          if (mid == null) continue;
          line.item_image_url = imgById.has(mid) ? imgById.get(mid) ?? null : null;
        }
      }
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== "42P01" && code !== "42703") {
        console.warn(
          "[merchant-line-items] menu image enrich failed:",
          (err as Error)?.message ?? err
        );
      }
    }
  }

  return out;
}

/**
 * Lightweight board enrichment: menu_item_id + live item_image_url only.
 * Avoids full customization/CTM SQL that timed out the merchant order board.
 */
export async function loadMerchantOrderItemMenuMetaByTextIds(
  sql: Sql,
  orderTextIds: string[],
): Promise<
  Map<string, Array<{ menu_item_id: number | null; item_image_url: string | null }>>
> {
  const unique = [...new Set(orderTextIds.map((t) => String(t ?? "").trim()).filter(Boolean))];
  const out = new Map<
    string,
    Array<{ menu_item_id: number | null; item_image_url: string | null }>
  >();
  if (unique.length === 0) return out;

  type Row = {
    order_id: string;
    menu_item_id: number | null;
    item_image_url: string | null;
  };

  let rows: Row[];
  try {
    rows = (await sql`
      SELECT oci.order_id, oci.menu_item_id, mmi.item_image_url
      FROM orders_core_items oci
      LEFT JOIN merchant_menu_items mmi ON mmi.id = oci.menu_item_id
      WHERE oci.order_id = ANY(${unique}::text[])
      ORDER BY oci.id ASC
    `) as Row[];
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "42P01" || code === "42703") {
      try {
        rows = (await sql`
          SELECT order_id, menu_item_id, NULL::text AS item_image_url
          FROM orders_core_items
          WHERE order_id = ANY(${unique}::text[])
          ORDER BY id ASC
        `) as Row[];
      } catch {
        return out;
      }
    } else {
      console.warn(
        "[merchant-line-items] lite menu meta failed:",
        (err as Error)?.message ?? err
      );
      return out;
    }
  }

  for (const r of rows) {
    const oid = String(r.order_id ?? "").trim();
    if (!oid) continue;
    const mid =
      r.menu_item_id != null && Number.isFinite(Number(r.menu_item_id))
        ? Number(r.menu_item_id)
        : null;
    const raw = r.item_image_url != null ? String(r.item_image_url).trim() : "";
    const list = out.get(oid) ?? [];
    list.push({
      menu_item_id: mid,
      item_image_url: raw ? toAbsoluteClientMediaUrl(raw) : null,
    });
    out.set(oid, list);
  }

  return out;
}
