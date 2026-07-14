import type { BillContext, ConditionRow, MutableBillState } from "./types.js";
import { cartPromoQualifyingSubtotal } from "./discountEligibility.js";

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function getLineCategories(ctx: BillContext): string[] {
  return ctx.lineCategories.map((l) => (l.categoryName ?? "").trim().toLowerCase()).filter(Boolean);
}

/**
 * ORDER_VALUE uses item+addon before rule discounts unless metadata on condition row
 * is not available here — use ctx.orderValuePreDiscount passed via closure in executor.
 */
export function evaluateCondition(
  row: ConditionRow,
  ctx: BillContext,
  orderValueForCompare: number
): boolean {
  const op = row.operator;
  const vmin = num(row.valueMin);
  const vmax = num(row.valueMax);

  switch (row.conditionType) {
    case "ORDER_VALUE": {
      const v = orderValueForCompare;
      if (op === "GT") return vmin != null && v > vmin;
      if (op === "GTE") return vmin != null && v >= vmin;
      if (op === "LT") return vmin != null && v < vmin;
      if (op === "LTE") return vmin != null && v <= vmin;
      if (op === "EQ") return vmin != null && Math.abs(v - vmin) < 0.005;
      if (op === "NEQ") return vmin != null && Math.abs(v - vmin) >= 0.005;
      if (op === "BETWEEN" && vmin != null && vmax != null) return v >= vmin && v <= vmax;
      return false;
    }
    case "DISTANCE_KM": {
      const d = ctx.distanceKm;
      if (d == null || !Number.isFinite(d)) return false;
      if (op === "GT") return vmin != null && d > vmin;
      if (op === "GTE") return vmin != null && d >= vmin;
      if (op === "LT") return vmin != null && d < vmin;
      if (op === "LTE") return vmin != null && d <= vmin;
      if (op === "EQ") return vmin != null && Math.abs(d - vmin) < 0.01;
      if (op === "BETWEEN" && vmin != null && vmax != null) return d >= vmin && d <= vmax;
      return false;
    }
    case "TIME_WINDOW": {
      const j = row.valueJson as { startHour?: number; endHour?: number } | null;
      const sh = j?.startHour ?? vmin ?? 0;
      const eh = j?.endHour ?? vmax ?? 24;
      const h = ctx.now.getHours();
      if (sh <= eh) return h >= sh && h < eh;
      return h >= sh || h < eh;
    }
    case "MERCHANT_ID": {
      const want = row.valueText != null ? parseInt(row.valueText, 10) : vmin;
      if (want == null || Number.isNaN(want)) return false;
      const pid = ctx.merchantParentId;
      if (pid == null) return false;
      if (op === "NEQ") return pid !== want;
      return pid === want;
    }
    case "MERCHANT_STORE_ID": {
      const want = row.valueText != null ? parseInt(row.valueText, 10) : vmin;
      if (want == null || Number.isNaN(want)) return false;
      if (op === "NEQ") return ctx.merchantStoreId !== want;
      return ctx.merchantStoreId === want;
    }
    case "ITEM_CATEGORY": {
      const cats = getLineCategories(ctx);
      if (cats.length === 0) return false;
      const want = row.valueJson;
      const list = Array.isArray(want)
        ? want.map((x) => String(x).trim().toLowerCase()).filter(Boolean)
        : row.valueText
          ? [row.valueText.trim().toLowerCase()]
          : [];
      if (list.length === 0) return false;
      return cats.some((c) => list.includes(c));
    }
    case "USER_TYPE": {
      const want = (row.valueText ?? "").trim().toLowerCase();
      if (!want) return false;
      return ctx.userType.trim().toLowerCase() === want;
    }
    default:
      return false;
  }
}

export function ruleConditionsPass(
  conditions: ConditionRow[],
  ctx: BillContext,
  state: MutableBillState,
  itemPlusAddon: number,
  opts?: { useEligibleSubtotalForOrderValue?: boolean }
): boolean {
  if (conditions.length === 0) return true;
  const afterDisc = Math.max(0, itemPlusAddon - state.discountTotal);
  const eligible = cartPromoQualifyingSubtotal(ctx, itemPlusAddon);
  for (const c of conditions) {
    const meta = c.valueJson as { use_after_discount?: boolean; use_eligible_subtotal?: boolean } | null;
    let orderVal = itemPlusAddon;
    if (meta?.use_after_discount === true) orderVal = afterDisc;
    else if (opts?.useEligibleSubtotalForOrderValue === true || meta?.use_eligible_subtotal === true) {
      orderVal = eligible;
    }
    if (!evaluateCondition(c, ctx, orderVal)) return false;
  }
  return true;
}
