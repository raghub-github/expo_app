/** FLASH_SALE admin config helpers — keep in sync with backend/src/modules/billing/flashSale.ts */

export type FlashSaleItemConfig = {
  menuItemId: string;
  flashPrice: number;
  /** Optional store PK for multi-outlet admin round-trip (runtime overlay keys on menuItemId). */
  storeId?: number | null;
};

function num(v: unknown): number {
  if (v == null) return NaN;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : NaN;
}

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

export function isFlashSaleKind(kind: unknown): boolean {
  return String(kind ?? "").toUpperCase() === "FLASH_SALE";
}

export function parseFlashSaleItems(conditions: unknown): FlashSaleItemConfig[] {
  if (!conditions || typeof conditions !== "object" || Array.isArray(conditions)) return [];
  const c = conditions as Record<string, unknown>;
  const raw = c.flash_sale_items ?? c.flashSaleItems;
  const out: FlashSaleItemConfig[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const id = String(r.menu_item_id ?? r.menuItemId ?? r.item_id ?? "").trim();
      const price = num(r.flash_price ?? r.flashPrice ?? r.price);
      if (!id || !Number.isFinite(price) || price < 0) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      const storeRaw = r.store_id ?? r.storeId;
      const storeId = storeRaw != null ? Number(storeRaw) : NaN;
      out.push({
        menuItemId: id,
        flashPrice: round2(price),
        storeId: Number.isInteger(storeId) && storeId > 0 ? storeId : null,
      });
    }
  }
  return out;
}

/** Percent off vs original customer unit (e.g. 99→9 → 91). */
export function computeFlashSaleOffPercent(
  originalCustomerUnit: number,
  flashPrice: number
): number | null {
  const orig = round2(originalCustomerUnit);
  const flash = round2(flashPrice);
  if (!(orig > 0) || !(flash >= 0) || flash >= orig - 0.0001) return null;
  return Math.max(1, Math.round(((orig - flash) / orig) * 100));
}

export function validateFlashSalePrice(
  flashPrice: unknown,
  originalCustomerUnit?: number | null
): string | null {
  const price = num(flashPrice);
  if (!Number.isFinite(price)) return "Flash Sale price must be a valid number.";
  if (price < 0) return "Flash Sale price cannot be negative.";
  if (
    originalCustomerUnit != null &&
    Number.isFinite(originalCustomerUnit) &&
    price >= round2(originalCustomerUnit) - 0.0001
  ) {
    return "Flash Sale price must be lower than the original customer price.";
  }
  return null;
}

export function computeFlashSaleSubsidy(originalCustomerUnit: number, flashPrice: number): number {
  const orig = round2(originalCustomerUnit);
  const flash = round2(flashPrice);
  if (!(orig > 0) || !(flash >= 0) || flash >= orig - 0.0001) return 0;
  return round2(orig - flash);
}

/** Remaining campaign budget after subsidy consumption. Null = unlimited. */
export function flashSaleBudgetRemaining(
  budgetTotal: number | string | null | undefined,
  budgetUsed: number | string | null | undefined
): number | null {
  const total = num(budgetTotal);
  if (!Number.isFinite(total) || total <= 0) return null;
  const used = num(budgetUsed);
  return round2(Math.max(0, total - (Number.isFinite(used) ? used : 0)));
}

/** Remaining lifetime redemptions. Null = unlimited. */
export function flashSaleRemainingRedemptions(
  maxUsesTotal: number | string | null | undefined,
  activeRedemptions: number | string | null | undefined
): number | null {
  const cap = Number(maxUsesTotal);
  if (!Number.isFinite(cap) || cap <= 0) return null;
  const used = Number(activeRedemptions);
  return Math.max(0, Math.floor(cap) - Math.max(0, Number.isFinite(used) ? Math.floor(used) : 0));
}

export function applyFlashSaleSaveDefaults<T extends Record<string, unknown>>(input: T): T {
  const kind = String(input.offer_kind ?? "").toUpperCase();
  if (kind !== "FLASH_SALE") return input;
  const service = String(input.service_type ?? "FOOD").toUpperCase();
  const next: Record<string, unknown> = {
    ...input,
    offer_kind: "FLASH_SALE",
    funding_mode: "PLATFORM_ONLY",
    platform_share_pct: 100,
    merchant_share_pct: 0,
    max_uses_per_user: 1,
    is_stackable: false,
    offer_audience: "CUSTOMER",
  };
  if (service === "FOOD" || service === "ALL") {
    next.target_scope = "MERCHANT";
    next.discount_type = "FIXED";
    next.value_numeric = null;
    next.delivery_discount_type = null;
    next.delivery_discount_value = null;
    const promo =
      input.promo_config && typeof input.promo_config === "object" && !Array.isArray(input.promo_config)
        ? { ...(input.promo_config as Record<string, unknown>) }
        : {};
    promo.auto_apply = true;
    next.promo_config = promo;
  }
  if (service === "RIDE" || service === "PARCEL") {
    const promo =
      input.promo_config && typeof input.promo_config === "object" && !Array.isArray(input.promo_config)
        ? { ...(input.promo_config as Record<string, unknown>) }
        : {};
    promo.promo_type = "PAY_FIXED";
    promo.auto_apply = promo.auto_apply !== false;
    next.promo_config = promo;
  }
  return next as T;
}

export function buildFlashSaleConditions(args: {
  items: Array<{ menuItemId: string; flashPrice: number; storeId?: number | null }>;
}): Record<string, unknown> {
  const flash_sale_items = args.items
    .filter((it) => it.menuItemId && Number.isFinite(it.flashPrice) && it.flashPrice >= 0)
    .map((it) => {
      const row: Record<string, unknown> = {
        menu_item_id: it.menuItemId,
        flash_price: round2(it.flashPrice),
      };
      if (it.storeId != null && Number.isInteger(it.storeId) && it.storeId > 0) {
        row.store_id = it.storeId;
      }
      return row;
    });
  return {
    menu_item_ids: flash_sale_items.map((it) => String(it.menu_item_id)),
    flash_sale_items,
  };
}
