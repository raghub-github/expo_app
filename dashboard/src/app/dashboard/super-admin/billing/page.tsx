"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSuperAdminBillingPage } from "@/hooks/useSuperAdminBillingPage";
import {
  chargeOrderKeyEquals,
  logBillingCharge,
  normalizeChargeOrderId,
} from "@/lib/billing-charge-order";
import type { BillingAdminRuleRow, BillingAdminTaxRow } from "@/store/api/billingAdminApi";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { BillPreviewSimulator, BillPreviewSimulatorRunButton } from "@/components/billing-admin/BillPreviewSimulator";
import { RulePriorityManager } from "@/components/billing-admin/RulePriorityManager";
import { TaxConfigPanel } from "@/components/billing-admin/TaxConfigPanel";

const cardCls =
  "rounded-2xl border border-slate-200/70 bg-white/90 p-5 text-slate-900 shadow-[0_12px_40px_-18px_rgba(15,23,42,0.45)] backdrop-blur-sm";
const labelCls = "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500";
const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] placeholder:text-slate-400 transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200";
const selectCls =
  "w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200";
const textareaCls =
  "w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-xs font-mono text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200";

/** DataTransfer type for charge-order drag-and-drop. Payload: JSON `{ kind, id }`. */
const BILLING_ROW_DND_MIME = "application/x-gatimitra-billing-row-ref";

type CombinedOrderKey = { kind: "rule" | "tax"; id: number };

function keysEqual(a: CombinedOrderKey[], b: CombinedOrderKey[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    try {
      if (
        !chargeOrderKeyEquals(
          { kind: x.kind, id: normalizeChargeOrderId(x.id) },
          { kind: y.kind, id: normalizeChargeOrderId(y.id) }
        )
      ) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

function swapKeysAt(keys: CombinedOrderKey[], i: number, j: number): CombinedOrderKey[] {
  const next = [...keys];
  const tmp = next[i];
  next[i] = next[j]!;
  next[j] = tmp!;
  return next;
}

type CombinedOrderListRow =
  | { kind: "rule"; id: number; priority: number; rule: BillingAdminRuleRow }
  | { kind: "tax"; id: number; priority: number; tax: BillingAdminTaxRow };

const COND_TYPES = [
  "ORDER_VALUE",
  "DISTANCE_KM",
  "TIME_WINDOW",
  "MERCHANT_ID",
  "MERCHANT_STORE_ID",
  "ITEM_CATEGORY",
  "USER_TYPE",
] as const;
const OPS = ["GT", "GTE", "LT", "LTE", "EQ", "NEQ", "BETWEEN"] as const;
const TAX_BASES = [
  "ITEM_SUBTOTAL",
  "AFTER_DISCOUNTS",
  "ITEM_AFTER_DISCOUNT",
  "DELIVERY_FEE",
  "PLATFORM_FEE",
  "PACKAGING_FEE",
  "SURGE_FEE",
  "SMALL_ORDER_FEE",
  "CONVENIENCE_FEE",
  "GRAND_BEFORE_TAX",
] as const;

const DISCOUNT_APPLIES_ON = [
  "ITEMS_TOTAL",
  "SUBTOTAL",
  "DELIVERY_FEE",
  "PLATFORM_FEE",
  "PACKAGING_FEE",
] as const;

const TAX_GROUPS = ["item", "delivery", "platform", "packaging", "surge", "fee", "other"] as const;

type ChargeKind =
  | "packaging_merchant"
  | "merchant_offer"
  | "platform_offer_ref"
  | "manual_discount"
  | "delivery_ref"
  | "platform_fee"
  | "surge_fee"
  | "small_order_fee"
  | "convenience_fee"
  | "optional_subscription"
  | "optional_donation"
  | "optional_rider_tip"
  | "optional_other"
  | "tax_config";

function inferChargeKind(r: BillingAdminRuleRow): ChargeKind {
  if (r.type === "TAX") return "tax_config";
  if (r.type === "PACKAGING") {
    return "packaging_merchant";
  }
  if (r.type === "OFFER") {
    return r.offer_owner === "MERCHANT" ? "merchant_offer" : "platform_offer_ref";
  }
  if (r.type === "DISCOUNT") return "manual_discount";
  if (r.type === "DELIVERY") return "delivery_ref";
  if (r.type === "PLATFORM_FEE") return "platform_fee";
  if (r.type === "SURGE") return "surge_fee";
  if (r.type === "SMALL_ORDER_FEE") return "small_order_fee";
  if (r.type === "CONVENIENCE_FEE") return "convenience_fee";
  if (r.type === "SUBSCRIPTION") return "optional_subscription";
  if (r.type === "DONATION") return "optional_donation";
  if (r.type === "RIDER_TIP") return "optional_rider_tip";
  if (r.type === "OTHER") return "optional_other";
  if (r.type === "FEE") {
    return "optional_other";
  }
  return "platform_fee";
}

/** Rule applies to a selected service line (ALL rules apply to every non-ALL line). */
function ruleMatchesService(rule: BillingAdminRuleRow, selectedService: string): boolean {
  const st = String(rule.service_type ?? "FOOD").toUpperCase();
  const sel = selectedService.toUpperCase();
  if (sel === "ALL") return st === "ALL";
  return st === sel || st === "ALL";
}

function taxMatchesService(t: BillingAdminTaxRow, selectedService: string): boolean {
  const st = String(t.service_type ?? "FOOD").toUpperCase();
  const sel = selectedService.toUpperCase();
  if (sel === "ALL") return st === "ALL";
  return st === sel || st === "ALL";
}

const CHARGE_KIND_ORDER: ChargeKind[] = [
  "packaging_merchant",
  "merchant_offer",
  "platform_offer_ref",
  "manual_discount",
  "delivery_ref",
  "platform_fee",
  "surge_fee",
  "small_order_fee",
  "convenience_fee",
  "tax_config",
  "optional_subscription",
  "optional_donation",
  "optional_rider_tip",
  "optional_other",
];

const CHARGE_KIND_LABELS: Record<ChargeKind, string> = {
  packaging_merchant: "Packaging (from item table — no manual amount)",
  merchant_offer: "Merchant offer (% or fixed)",
  platform_offer_ref: "Platform offer placeholder (amounts from Offers page)",
  manual_discount: "Manual discount (% or fixed)",
  delivery_ref: "Delivery (rate card or geo location rules — order by priority)",
  platform_fee: "Platform fee (% or fixed)",
  surge_fee: "Surge fee (% or fixed)",
  small_order_fee: "Small order fee (% or fixed)",
  convenience_fee: "Convenience fee (% or fixed)",
  tax_config: "Tax (configure GST logic below)",
  optional_subscription: "Subscription fee (fixed)",
  optional_donation: "Donation (fixed)",
  optional_rider_tip: "Rider tip (customer-entered at checkout, non-taxable)",
  optional_other: "Other charge (% or fixed)",
};

function computeChargeKindDisabled(args: {
  rules: BillingAdminRuleRow[];
  refTax: BillingAdminTaxRow[];
  /** Service line for the row being added/edited (rule form, or tax form when charge type is Tax). */
  serviceLine: string;
  editingRuleId: number | null;
  editingTaxId: number | null;
}): Record<ChargeKind, boolean> {
  const { rules, refTax, serviceLine, editingRuleId, editingTaxId } = args;
  const out = {} as Record<ChargeKind, boolean>;
  for (const k of CHARGE_KIND_ORDER) out[k] = false;

  for (const r of rules) {
    if (editingRuleId != null && r.id === editingRuleId) continue;
    if (!ruleMatchesService(r, serviceLine)) continue;
    const k = inferChargeKind(r);
    out[k] = true;
  }

  for (const t of refTax) {
    if (editingTaxId != null && t.id === editingTaxId) continue;
    if (!taxMatchesService(t, serviceLine)) continue;
    /**
     * Tax configs are intentionally multi-row per service (GST on items/delivery/platform/...).
     * Do NOT disable the "Tax" charge kind just because one tax row already exists.
     */
    out.tax_config = false;
  }

  return out;
}

function applyChargeKind(kind: ChargeKind, setForm: ReturnType<typeof useSuperAdminBillingPage>["setForm"]) {
  setForm((f) => {
    const base = { ...f, discount_applies_on: "ITEMS_TOTAL" as string, charge_subtype: "" };
    switch (kind) {
      case "packaging_merchant":
        return {
          ...base,
          type: "PACKAGING",
          calculation_type: "FORMULA_KEY",
          value_json: JSON.stringify({ key: "MERCHANT_PACKAGING" }),
          value_numeric: "",
          applies_to: "ORDER",
          stackable: true,
        };
      case "merchant_offer":
        return {
          ...base,
          type: "OFFER",
          offer_owner: "MERCHANT",
          calculation_type: "FORMULA_KEY",
          value_numeric: "",
          value_json: JSON.stringify({ key: "MERCHANT_OFFER_REF" }),
          applies_to: "ORDER",
          stackable: true,
        };
      case "platform_offer_ref":
        return {
          ...base,
          type: "OFFER",
          offer_owner: "GATIMITRA",
          calculation_type: "PERCENTAGE",
          value_numeric: "",
          value_json: "",
          applies_to: "ORDER",
          stackable: true,
        };
      case "manual_discount":
        return {
          ...base,
          type: "DISCOUNT",
          offer_owner: "GATIMITRA",
          calculation_type: "PERCENTAGE",
          value_numeric: "10",
          value_json: "",
          applies_to: "ORDER",
          stackable: true,
          discount_applies_on: "ITEMS_TOTAL",
        };
      case "delivery_ref":
        return {
          ...base,
          type: "DELIVERY",
          calculation_type: "FORMULA_KEY",
          value_json: JSON.stringify({ key: "GEO_LOCATION_DELIVERY" }),
          value_numeric: "",
          applies_to: "DELIVERY",
          stackable: true,
        };
      case "platform_fee":
        return {
          ...base,
          type: "PLATFORM_FEE",
          calculation_type: "PERCENTAGE",
          value_numeric: "5",
          value_json: "",
          applies_to: "ORDER",
          stackable: true,
        };
      case "surge_fee":
        return {
          ...base,
          type: "SURGE",
          calculation_type: "FIXED",
          value_numeric: "0",
          value_json: "",
          applies_to: "ORDER",
          stackable: true,
          offer_owner: "GATIMITRA",
        };
      case "small_order_fee":
        return {
          ...base,
          type: "SMALL_ORDER_FEE",
          calculation_type: "FIXED",
          value_numeric: "0",
          value_json: "",
          applies_to: "ORDER",
          stackable: true,
          offer_owner: "GATIMITRA",
        };
      case "convenience_fee":
        return {
          ...base,
          type: "CONVENIENCE_FEE",
          calculation_type: "FIXED",
          value_numeric: "0",
          value_json: "",
          applies_to: "ORDER",
          stackable: true,
          offer_owner: "GATIMITRA",
        };
      case "optional_subscription":
        return {
          ...base,
          type: "SUBSCRIPTION",
          calculation_type: "FIXED",
          value_numeric: "99",
          value_json: "",
          applies_to: "ORDER",
          stackable: false,
          offer_owner: "GATIMITRA",
        };
      case "optional_donation":
        return {
          ...base,
          type: "DONATION",
          calculation_type: "FIXED",
          value_numeric: "5",
          value_json: "",
          applies_to: "ORDER",
          stackable: false,
          offer_owner: "OTHER",
        };
      case "optional_rider_tip":
        return {
          ...base,
          type: "RIDER_TIP",
          calculation_type: "FIXED",
          value_numeric: "0",
          value_json: "",
          applies_to: "ORDER",
          stackable: false,
          offer_owner: "OTHER",
        };
      case "optional_other":
        return {
          ...base,
          type: "OTHER",
          calculation_type: "FIXED",
          value_numeric: "0",
          value_json: "",
          applies_to: "ORDER",
          stackable: false,
          offer_owner: "OTHER",
        };
      case "tax_config":
        return { ...base, type: "TAX", calculation_type: "PERCENTAGE", value_numeric: "", applies_to: "ORDER" };
      default:
        return f;
    }
  });
}

const SIM_PRESETS: { label: string; json: string }[] = [
  {
    label: "Example: 2× thali + add-on",
    json: `{
  "merchantId": "1",
  "dropLat": 12.97,
  "dropLon": 77.59,
  "cityName": "Bengaluru",
  "serviceType": "FOOD",
  "userSegment": "ALL",
  "subscriptionOptIn": false,
  "tipAmount": 10,
  "donationAmount": 0,
  "items": [
    {
      "menuItemId": "101",
      "itemName": "Thali",
      "quantity": 2,
      "basePrice": 150,
      "addons": [{ "addonId": "a1", "addonName": "Extra raita", "quantity": 1, "addonPrice": 20 }]
    }
  ]
}`,
  },
  {
    label: "Small order",
    json: `{
  "merchantId": "1",
  "dropLat": 12.97,
  "dropLon": 77.59,
  "cityName": "Bengaluru",
  "serviceType": "FOOD",
  "userSegment": "ALL",
  "subscriptionOptIn": false,
  "tipAmount": 0,
  "donationAmount": 0,
  "items": [
    { "menuItemId": "1", "itemName": "Chai", "quantity": 1, "basePrice": 40, "addons": [] }
  ]
}`,
  },
  {
    label: "Multi-cart (stress rules)",
    json: `{
  "merchantId": "1",
  "dropLat": 12.97,
  "dropLon": 77.59,
  "cityName": "Bengaluru",
  "serviceType": "FOOD",
  "userSegment": "ALL",
  "subscriptionOptIn": false,
  "tipAmount": 10,
  "donationAmount": 5,
  "items": [
    {
      "menuItemId": "201",
      "itemName": "Meal 1",
      "quantity": 1,
      "basePrice": 199,
      "addons": [{ "addonId": "10", "addonName": "Extra cheese", "quantity": 1, "addonPrice": 30 }]
    },
    {
      "menuItemId": "202",
      "itemName": "Meal 2",
      "quantity": 2,
      "basePrice": 120,
      "addons": []
    },
    {
      "menuItemId": "203",
      "itemName": "Drink",
      "quantity": 3,
      "basePrice": 45,
      "addons": []
    }
  ]
}`,
  },
];

type SimGstLine = { original: number; discount: number; taxable_value: number; gst: number };

type SimParsed = {
  itemTotal?: number;
  addonTotal?: number;
  discountTotal?: number;
  deliveryFee?: number;
  platformFee?: number;
  packagingFee?: number;
  surgeFee?: number;
  smallOrderFee?: number;
  convenienceFee?: number;
  taxTotal?: number;
  finalAmount?: number;
  itemsNetAfterDiscounts?: number;
  taxesByGroup?: Record<string, number>;
  components?: {
    items: SimGstLine;
    delivery: SimGstLine;
    platform: SimGstLine;
    surge: SimGstLine;
    packaging: SimGstLine;
    small_order: SimGstLine;
    convenience: SimGstLine;
  };
  totals?: { total_discount: number; total_tax: number; final_payable: number };
  breakdownSteps?: { step: string; amount: number; meta?: unknown }[];
  error?: string;
  message?: string;
};

function parseSim(raw: string | null): SimParsed | null {
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw) as SimParsed;
  } catch {
    return { error: raw.slice(0, 240) };
  }
}

export default function SuperAdminBillingPage() {
  const {
    permLoading,
    isSuperAdmin,
    billingService,
    setBillingService,
    rules,
    rulesListLoading,
    taxListLoading,
    rulesUpdating,
    selectedId,
    setSelectedId,
    conditions,
    conditionsFetching,
    refTax,
    bannerError,
    localError,
    clearLocalError,
    editingRuleId,
    form,
    setForm,
    setRulePriorityField,
    setTaxPriorityField,
    condForm,
    setCondForm,
    busy,
    simBody,
    setSimBody,
    simCouponCode,
    setSimCouponCode,
    simResult,
    simBusy,
    resetRuleForm,
    hydrateRuleForEdit,
    saveRule,
    toggleRule,
    deleteRule,
    addCondition,
    deleteCondition,
    runSim,
    taxForm,
    setTaxForm,
    editingTaxId,
    resetTaxForm,
    hydrateTaxForEdit,
    saveTax,
    deleteTax,
    repairTaxSlabs,
    reorderCombinedRows,
  } = useSuperAdminBillingPage({ loadReferenceData: false, leanBillingQueries: true });

  // Keep initial selector aligned with hook default form.type (DISCOUNT).
  const [chargeKind, setChargeKind] = useState<ChargeKind>("manual_discount");
  const [orderedRuleIds, setOrderedRuleIds] = useState<number[]>([]);
  const [realStoreId, setRealStoreId] = useState("");
  const [realItemId, setRealItemId] = useState("");
  const [realItemLoading, setRealItemLoading] = useState(false);
  const [realItemError, setRealItemError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const simParsed = useMemo(() => parseSim(simResult), [simResult]);

  const deliveryEngine = useMemo(() => {
    try {
      const j = JSON.parse(form.value_json || "{}") as { key?: string };
      if (j.key === "GEO_LOCATION_DELIVERY") return "geo";
      if (j.key === "DELIVERY_SLABS_GEO_V2") return "slabs_v2";
      return "rate_card";
    } catch {
      return "rate_card";
    }
  }, [form.value_json]);

  const breakdownRows = useMemo(() => {
    if (!simParsed || simParsed.error || !Array.isArray(simParsed.breakdownSteps)) return null;
    const start = (simParsed.itemTotal ?? 0) + (simParsed.addonTotal ?? 0);
    let run = start;
    return simParsed.breakdownSteps.map((row, i) => {
      const delta = row.amount;
      const next = run + delta;
      const out = { i, step: row.step, delta, running: next };
      run = next;
      return out;
    });
  }, [simParsed]);

  const sortedRules = useMemo(
    () => [...rules].sort((a, b) => a.priority - b.priority || a.id - b.id),
    [rules]
  );

  const rulesForService = useMemo(
    () =>
      sortedRules.filter((r) => {
        const st = String(r.service_type ?? "FOOD").toUpperCase();
        return st === billingService || st === "ALL";
      }),
    [sortedRules, billingService]
  );

  const taxesForService = useMemo(
    () =>
      [...refTax]
        .filter((t) => {
          const st = String(t.service_type ?? "FOOD").toUpperCase();
          return st === billingService || st === "ALL";
        })
        .sort((a, b) => a.priority - b.priority || a.id - b.id),
    [refTax, billingService]
  );

  /** Taxes that have a TAX row in billing_pricing_rules (excludes orphan configs after manual SQL deletes). */
  const taxesForChargeOrder = useMemo(
    () => taxesForService.filter((t) => !t.slab_missing),
    [taxesForService]
  );

  const orphanTaxCount = useMemo(
    () => refTax.filter((t) => Boolean(t.slab_missing)).length,
    [refTax]
  );

  const [taxRepairNotice, setTaxRepairNotice] = useState<string | null>(null);

  const taxPercentDisplay = String(
    Math.round((parseFloat(taxForm.rate) || 0) * 10000) / 100
  ).replace(/\.?0+$/, "");

  const serviceLineForChargeSlots =
    chargeKind === "tax_config" ? taxForm.service_type : form.service_type;

  const chargeKindDisabled = useMemo(
    () =>
      computeChargeKindDisabled({
        rules: sortedRules,
        refTax,
        serviceLine: serviceLineForChargeSlots,
        editingRuleId,
        editingTaxId,
      }),
    [sortedRules, refTax, serviceLineForChargeSlots, editingRuleId, editingTaxId]
  );

  useEffect(() => {
    if (!chargeKindDisabled[chargeKind]) return;
    const fallback = CHARGE_KIND_ORDER.find((k) => !chargeKindDisabled[k]);
    if (!fallback) return;
    setChargeKind(fallback);
    applyChargeKind(fallback, setForm);
    if (fallback === "tax_config") {
      setTaxForm((tf) => ({ ...tf, service_type: form.service_type }));
    }
  }, [chargeKindDisabled, chargeKind, setForm, setTaxForm, form.service_type]);

  const onChargeKindChange = (kind: ChargeKind) => {
    if (chargeKindDisabled[kind]) return;
    setChargeKind(kind);
    applyChargeKind(kind, setForm);
    if (kind === "tax_config") {
      setTaxForm((tf) => ({ ...tf, service_type: form.service_type }));
    }
  };

  const onEditRule = useCallback(
    (r: BillingAdminRuleRow, e?: React.MouseEvent) => {
      hydrateRuleForEdit(r, e);
      setChargeKind(inferChargeKind(r));
    },
    [hydrateRuleForEdit]
  );

  const loadRealItemIntoSimulator = async () => {
    const storeId = parseInt(realStoreId.trim(), 10);
    const itemId = parseInt(realItemId.trim(), 10);
    if (!Number.isInteger(storeId) || storeId < 1 || !Number.isInteger(itemId) || itemId < 1) {
      setRealItemError("Enter valid Store ID and Item ID.");
      return;
    }
    setRealItemError(null);
    setRealItemLoading(true);
    try {
      const res = await fetch(
        `/api/super-admin/billing/sim-real-item?storeId=${encodeURIComponent(String(storeId))}&itemId=${encodeURIComponent(String(itemId))}`
      );
      const data = (await res.json()) as { item?: unknown; error?: string };
      if (!res.ok || !data?.item || typeof data.item !== "object") {
        setRealItemError(data?.error ?? "Failed to load item");
        return;
      }
      let current: Record<string, unknown>;
      try {
        current = JSON.parse(simBody) as Record<string, unknown>;
      } catch {
        current = {};
      }
      const next = {
        merchantId: String(storeId),
        dropLat: Number(current["dropLat"] ?? 12.97),
        dropLon: Number(current["dropLon"] ?? 77.59),
        cityName: String(current["cityName"] ?? "Bengaluru"),
        serviceType: String(current["serviceType"] ?? billingService),
        userSegment: String(current["userSegment"] ?? "ALL"),
        subscriptionOptIn: Boolean(current["subscriptionOptIn"]),
        tipAmount: Number(current["tipAmount"] ?? 0),
        donationAmount: Number(current["donationAmount"] ?? 0),
        items: [data.item],
      };
      setSimBody(JSON.stringify(next, null, 2));
    } catch (e) {
      setRealItemError(e instanceof Error ? e.message : "Failed to load item");
    } finally {
      setRealItemLoading(false);
    }
  };

  const showAmountInput =
    chargeKind === "platform_fee" ||
    chargeKind === "manual_discount" ||
    chargeKind === "surge_fee" ||
    chargeKind === "small_order_fee" ||
    chargeKind === "convenience_fee" ||
    chargeKind === "optional_subscription" ||
    chargeKind === "optional_donation" ||
    chargeKind === "optional_other";

  const showCalcTypeSelect =
    chargeKind === "platform_fee" ||
    chargeKind === "manual_discount" ||
    chargeKind === "surge_fee" ||
    chargeKind === "small_order_fee" ||
    chargeKind === "convenience_fee" ||
    chargeKind === "optional_other";

  const showStackable =
    chargeKind === "manual_discount" ||
    chargeKind === "merchant_offer" ||
    chargeKind === "platform_offer_ref";

  // Only pricing-rule discount rows use this field in the engine.
  const showDiscountAppliesOn = chargeKind === "manual_discount";
  const showChargeSubtype =
    chargeKind === "small_order_fee" ||
    chargeKind === "convenience_fee" ||
    chargeKind === "optional_other";

  useEffect(() => {
    const nextIds = rulesForService.map((r) => r.id);
    setOrderedRuleIds((prev) => {
      if (prev.length === nextIds.length && prev.every((id, i) => id === nextIds[i])) return prev;
      return nextIds;
    });
  }, [rulesForService]);

  const orderedRulesForService = useMemo(() => {
    if (orderedRuleIds.length === 0) return rulesForService;
    const byId = new Map(rulesForService.map((r) => [r.id, r]));
    const ordered = orderedRuleIds.map((id) => byId.get(id)).filter((r): r is BillingAdminRuleRow => Boolean(r));
    return ordered.length === rulesForService.length ? ordered : rulesForService;
  }, [orderedRuleIds, rulesForService]);

  const combinedOrderRows = useMemo((): CombinedOrderListRow[] => {
    const rows: CombinedOrderListRow[] = [
      ...orderedRulesForService.map((r) => ({
        kind: "rule" as const,
        id: normalizeChargeOrderId(r.id),
        priority: r.priority,
        rule: r,
      })),
      ...taxesForChargeOrder.map((t) => ({
        kind: "tax" as const,
        id: normalizeChargeOrderId(t.id),
        priority: t.priority,
        tax: t,
      })),
    ];
    return rows.sort((a, b) => a.priority - b.priority || a.id - b.id);
  }, [orderedRulesForService, taxesForChargeOrder]);

  const serverCombinedKeys = useMemo((): CombinedOrderKey[] => {
    return combinedOrderRows.map((r) =>
      r.kind === "rule"
        ? { kind: "rule", id: normalizeChargeOrderId(r.rule.id) }
        : { kind: "tax", id: normalizeChargeOrderId(r.tax.id) }
    );
  }, [combinedOrderRows]);

  const [optimisticCombinedKeys, setOptimisticCombinedKeys] = useState<CombinedOrderKey[] | null>(null);

  const displayCombinedRows = useMemo((): CombinedOrderListRow[] => {
    const keys = optimisticCombinedKeys ?? serverCombinedKeys;
    const ruleMap = new Map(orderedRulesForService.map((r) => [normalizeChargeOrderId(r.id), r]));
    const taxMap = new Map(taxesForService.map((t) => [normalizeChargeOrderId(t.id), t]));
    const rows: CombinedOrderListRow[] = [];
    for (const k of keys) {
      const kid = normalizeChargeOrderId(k.id);
      if (k.kind === "rule") {
        const rule = ruleMap.get(kid);
        if (rule) rows.push({ kind: "rule", id: kid, priority: rule.priority, rule });
      } else {
        const tax = taxMap.get(kid);
        if (tax) rows.push({ kind: "tax", id: kid, priority: tax.priority, tax });
      }
    }
    if (rows.length !== keys.length) return combinedOrderRows;
    return rows;
  }, [optimisticCombinedKeys, serverCombinedKeys, orderedRulesForService, taxesForService, combinedOrderRows]);

  const displayKeysRef = useRef<CombinedOrderKey[]>(serverCombinedKeys);
  useLayoutEffect(() => {
    displayKeysRef.current = optimisticCombinedKeys ?? serverCombinedKeys;
  }, [optimisticCombinedKeys, serverCombinedKeys]);

  // Smoothly animate reorder with a lightweight FLIP technique.
  const rowElsRef = useRef<Map<string, HTMLLIElement>>(new Map());
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map());
  const shouldAnimateRef = useRef(false);

  const captureFlipRects = useCallback(() => {
    // Capture current positions before we update optimistic order.
    const prev = new Map<string, DOMRect>();
    for (const [k, el] of rowElsRef.current.entries()) {
      prev.set(k, el.getBoundingClientRect());
    }
    prevRectsRef.current = prev;
    shouldAnimateRef.current = true;
  }, []);

  useLayoutEffect(() => {
    if (!shouldAnimateRef.current) return;
    shouldAnimateRef.current = false;

    const prevRects = prevRectsRef.current;
    prevRectsRef.current = new Map();
    if (prevRects.size === 0) return;

    const reduceMotion =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduceMotion) return;

    // First paint with inverted transforms, then transition to identity.
    const first = requestAnimationFrame(() => {
      for (const [k, prevRect] of prevRects.entries()) {
        const el = rowElsRef.current.get(k);
        if (!el) continue;
        const nextRect = el.getBoundingClientRect();
        const dx = prevRect.left - nextRect.left;
        const dy = prevRect.top - nextRect.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
        el.style.transition = "none";
        el.style.transform = `translate(${dx}px, ${dy}px)`;
      }

      requestAnimationFrame(() => {
        const durationMs = 190;
        for (const [k] of prevRects.entries()) {
          const el = rowElsRef.current.get(k);
          if (!el) continue;
          el.style.willChange = "transform";
          el.style.transition = `transform ${durationMs}ms ease`;
          el.style.transform = "translate(0px, 0px)";
        }

        // Cleanup inline styles after animation.
        window.setTimeout(() => {
          for (const [k] of prevRects.entries()) {
            const el = rowElsRef.current.get(k);
            if (!el) continue;
            el.style.transition = "";
            el.style.transform = "";
            el.style.willChange = "";
          }
        }, 240);
      });
    });

    return () => cancelAnimationFrame(first);
  }, [displayCombinedRows]);

  useEffect(() => {
    setOptimisticCombinedKeys(null);
  }, [billingService]);

  useEffect(() => {
    if (optimisticCombinedKeys == null) return;
    if (keysEqual(optimisticCombinedKeys, serverCombinedKeys)) {
      setOptimisticCombinedKeys(null);
    }
  }, [optimisticCombinedKeys, serverCombinedKeys]);

  const showProvisionalOrder = optimisticCombinedKeys != null;

  const moveCombinedRow = useCallback(
    async (idx: number, dir: -1 | 1) => {
      const base = optimisticCombinedKeys ?? serverCombinedKeys;
      const j = idx + dir;
      if (j < 0 || j >= base.length) return;
      const nextKeys = swapKeysAt(base, idx, j);
      captureFlipRects();
      setOptimisticCombinedKeys(nextKeys);
      try {
        await reorderCombinedRows(nextKeys);
      } catch (e) {
        console.warn("[billing] moveCombinedRow: persist failed", e);
        logBillingCharge("moveCombinedRow", "reorderCombinedRows rejected", {
          nextLen: nextKeys.length,
          err: e instanceof Error ? e.message : String(e),
        });
        setOptimisticCombinedKeys(null);
      }
    },
    [optimisticCombinedKeys, serverCombinedKeys, reorderCombinedRows, captureFlipRects]
  );

  const reorderBusy =
    Boolean(busy["rule.reorder"]) ||
    Boolean(busy["tax.reorder"]) ||
    Boolean(busy["rule-tax.reorder"]) ||
    Boolean(busy["combined.reorder"]);

  const reorderBusyRef = useRef(reorderBusy);
  useLayoutEffect(() => {
    reorderBusyRef.current = reorderBusy;
  }, [reorderBusy]);

  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  /** HTML5 drag on the same node as touch swipes breaks many mobile browsers; use drag only with fine pointer (mouse). */
  const [finePointer, setFinePointer] = useState(false);
  useLayoutEffect(() => {
    const mq = window.matchMedia("(pointer: fine)");
    const sync = () => setFinePointer(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  /** Pointer events cover mouse, touch, and pen; window listeners handle release outside the grip. */
  const swipeReorderRef = useRef<{
    y0: number;
    x0: number;
    t0: number;
    key: CombinedOrderKey;
    pointerId: number;
  } | null>(null);
  const swipePointerCleanupRef = useRef<(() => void) | null>(null);

  const clearSwipePointerListeners = useCallback(() => {
    swipePointerCleanupRef.current?.();
    swipePointerCleanupRef.current = null;
  }, []);

  const onReorderGripPointerDown = (e: React.PointerEvent, key: CombinedOrderKey) => {
    if (reorderBusyRef.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.pointerType === "touch" || e.pointerType === "pen") {
      e.preventDefault();
    }
    e.stopPropagation();
    clearSwipePointerListeners();
    const y0 = e.clientY;
    const x0 = e.clientX;
    const pointerId = e.pointerId;
    swipeReorderRef.current = { y0, x0, t0: Date.now(), key, pointerId };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const start = swipeReorderRef.current;
      if (!start) return;
      const ddy = ev.clientY - start.y0;
      const ddx = ev.clientX - start.x0;
      if (Math.abs(ddy) > 12 && Math.abs(ddy) > Math.abs(ddx)) ev.preventDefault();
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const start = swipeReorderRef.current;
      swipeReorderRef.current = null;
      clearSwipePointerListeners();
      if (!start) return;
      if (reorderBusyRef.current) return;
      const dy = ev.clientY - start.y0;
      const dx = ev.clientX - start.x0;
      if (Date.now() - start.t0 > 2000) return;
      if (Math.abs(dy) < 14) return;
      if (Math.abs(dy) < Math.abs(dx)) return;
      const keys = displayKeysRef.current;
      let index = -1;
      try {
        const sk = { kind: start.key.kind, id: normalizeChargeOrderId(start.key.id) };
        index = keys.findIndex((k) =>
          chargeOrderKeyEquals({ kind: k.kind, id: normalizeChargeOrderId(k.id) }, sk)
        );
      } catch {
        index = -1;
      }
      if (index < 0) {
        logBillingCharge("swipe", "could not resolve row index (id mismatch?)", {
          key: start.key,
        });
        return;
      }
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(12);
      if (dy < 0) void moveCombinedRow(index, -1);
      else void moveCombinedRow(index, 1);
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    swipePointerCleanupRef.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  };

  const onReorderGripPointerCancel = () => {
    clearSwipePointerListeners();
    swipeReorderRef.current = null;
  };

  useEffect(() => {
    return () => {
      clearSwipePointerListeners();
    };
  }, [clearSwipePointerListeners]);

  const onCombinedRowDragOver = useCallback((idx: number, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverIdx(idx);
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onCombinedRowDragStart = useCallback(
    (row: CombinedOrderListRow, e: React.DragEvent) => {
      if (reorderBusy || !finePointer) {
        e.preventDefault();
        return;
      }
      setDragOverIdx(null);
      const ref: CombinedOrderKey =
        row.kind === "rule"
          ? { kind: "rule", id: normalizeChargeOrderId(row.rule.id) }
          : { kind: "tax", id: normalizeChargeOrderId(row.tax.id) };
      e.dataTransfer.setData(BILLING_ROW_DND_MIME, JSON.stringify(ref));
      e.dataTransfer.setData(
        "text/plain",
        `billing-row-ref:${row.kind}:${row.kind === "rule" ? normalizeChargeOrderId(row.rule.id) : normalizeChargeOrderId(row.tax.id)}`
      );
      e.dataTransfer.effectAllowed = "move";
    },
    [reorderBusy, finePointer]
  );

  const onCombinedRowDrop = useCallback(
    async (targetIdx: number, e: React.DragEvent) => {
      e.preventDefault();
      setDragOverIdx(null);
      if (reorderBusy) return;
      const keys = [...displayKeysRef.current];
      let ref: CombinedOrderKey | null = null;
      const raw = e.dataTransfer.getData(BILLING_ROW_DND_MIME);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { kind?: string; id?: unknown };
          if (parsed.kind === "rule" || parsed.kind === "tax") {
            ref = { kind: parsed.kind, id: normalizeChargeOrderId(parsed.id) };
          }
        } catch {
          ref = null;
        }
      }
      if (!ref) {
        const plain = e.dataTransfer.getData("text/plain");
        const m = /^billing-row-ref:(rule|tax):(\d+)$/.exec(plain.trim());
        if (m) {
          ref = { kind: m[1] as "rule" | "tax", id: normalizeChargeOrderId(m[2]) };
        }
      }
      if (!ref) return;
      const fromIdx = keys.findIndex((k) => k.kind === ref!.kind && k.id === ref!.id);
      if (fromIdx < 0) return;
      if (fromIdx === targetIdx) return;
      const next = [...keys];
      const [moved] = next.splice(fromIdx, 1);
      if (!moved) return;
      const insertAt = targetIdx > fromIdx ? targetIdx - 1 : targetIdx;
      next.splice(insertAt, 0, moved);
      captureFlipRects();
      setOptimisticCombinedKeys(next);
      try {
        await reorderCombinedRows(next);
      } catch (e) {
        console.warn("[billing] onCombinedRowDrop: persist failed", e);
        logBillingCharge("drag-drop", "reorder failed", { err: e instanceof Error ? e.message : String(e) });
        setOptimisticCombinedKeys(null);
      }
    },
    [reorderCombinedRows, reorderBusy, captureFlipRects]
  );

  if (!mounted) {
    return <div className="mx-auto max-w-6xl p-6 text-slate-900" />;
  }

  if (!permLoading && !isSuperAdmin) {
    return (
      <div className="mx-auto max-w-6xl p-6 text-slate-900">
        <p>You do not have access to billing administration.</p>
        <Link href="/dashboard/super-admin" className="mt-4 inline-block text-sm text-indigo-600 hover:underline">
          ← Super Admin
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 bg-[radial-gradient(circle_at_top_right,#eef2ff_0%,#f8fafc_45%,#ffffff_100%)] p-4 text-slate-900 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Billing Rules</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Set charge order and rule parameters. Delivery amounts come from{" "}
            <Link href="/dashboard/super-admin/delivery-rate-cards" className="text-indigo-600 underline">
              Delivery rate cards
            </Link>
            ; GatiMitra offers/coupons from{" "}
            <Link href="/dashboard/super-admin/offers-coupons" className="text-indigo-600 underline">
              Offers &amp; coupons
            </Link>
            . Tax percentages are configured in the Tax section below (applied after rules, platform offers, and
            coupons).
          </p>
          <div className="mt-4 inline-flex flex-wrap gap-2 rounded-2xl border border-slate-200/80 bg-white/80 p-1 shadow-sm" role="tablist" aria-label="Service line">
            {(["FOOD", "PARCEL", "RIDE"] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={billingService === id}
                className={`rounded-xl border px-3 py-1.5 text-sm font-semibold transition-all ${
                  billingService === id
                    ? "border-indigo-500 bg-indigo-600 text-white shadow-md shadow-indigo-200"
                    : "border-transparent bg-white/70 text-slate-700 hover:border-slate-200 hover:bg-white"
                }`}
                onClick={() => setBillingService(id)}
              >
                {id}
              </button>
            ))}
          </div>
          {rulesUpdating && !rulesListLoading && (
            <p className="mt-1 text-xs text-slate-500" aria-live="polite">
              Updating rules…
            </p>
          )}
        </div>
        <div className="shrink-0 rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-2 text-right shadow-sm">
          <Link href="/dashboard/super-admin" className="text-sm font-medium text-indigo-600 hover:underline">
            ← Super Admin
          </Link>
          <Link href="/dashboard/super-admin/delivery-rate-cards" className="mt-1 block text-xs text-slate-600 underline">
            Delivery rate cards
          </Link>
          <Link href="/dashboard/super-admin/offers-coupons" className="block text-xs text-slate-600 underline">
            Offers &amp; coupons
          </Link>
        </div>
      </header>

      {(bannerError || localError) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-800 shadow-sm">
          <span>{bannerError ?? localError}</span>
          {localError != null && (
            <button type="button" className="text-xs underline shrink-0" onClick={clearLocalError}>
              Dismiss
            </button>
          )}
        </div>
      )}

      <section className="rounded-2xl border border-indigo-200/70 bg-gradient-to-r from-indigo-50/90 to-sky-50/90 p-4 text-sm text-slate-800 shadow-sm" aria-label="How billing runs in the app">
        <h2 className="text-sm font-semibold text-sky-950">Engine order (same priority field, two passes)</h2>
        <p className="mt-2 text-sky-900/90 leading-relaxed">
          Engine order: <strong>charge rules</strong> first (delivery, platform, packaging, surge, fees), then
          <strong> discount / offer rules</strong> (same priority list as below — but fees are always computed before
          discounts), then merchant + platform offers, coupon, then <strong>tax configs</strong>. Geo delivery uses pincode{' '}
          <code className="text-xs bg-white/80 px-1 rounded">pricing_rules</code>; rate cards use the delivery rate card
          engine. Use tax <strong>applicable base</strong> for GST on items (e.g. <code className="text-xs bg-white/80 px-1 rounded">ITEM_AFTER_DISCOUNT</code>
          ), delivery, packaging, etc. Add a <strong>RIDER_TIP</strong> row for the rider tip line (amount always comes
          from checkout <code className="text-xs bg-white/80 px-1 rounded">tipAmount</code>; never taxed). Donation rows
          work the same way with <code className="text-xs bg-white/80 px-1 rounded">donationAmount</code>.
        </p>
        <p className="mt-3 text-sky-900/90 leading-relaxed">
          <strong>Delivery shape (e.g. max of base fare vs per-km × km):</strong> model this with distance slabs on{" "}
          <Link href="/dashboard/super-admin/delivery-rate-cards" className="text-indigo-700 underline">
            delivery rate cards
          </Link>{" "}
          (engine uses <code className="text-xs bg-white/80 px-1 rounded">base_fare + per_km_rate × km</code> per slab) or
          via geo <code className="text-xs bg-white/80 px-1 rounded">customer_delivery_fee</code> in pricing rules. For a
          universal minimum (e.g. ₹25 when distance &gt; 0), set backend env{" "}
          <code className="text-xs bg-white/80 px-1 rounded">DELIVERY_MIN_FEE_INR</code> after rules and fallbacks.
        </p>
      </section>

      {/* Charge order */}
      <section className={cardCls}>
        <h2 className="text-base font-semibold text-gray-900">Charge order</h2>
        <p className="text-sm text-gray-600 mt-1">
          Engine order uses <code className="text-xs bg-gray-100 px-1 rounded">charge_order_key</code> (shown as
          priority badges). Use arrows, <strong> drag the ⋮⋮ handle</strong> on desktop, or{" "}
          <strong>swipe up/down on the handle</strong> on touch screens.
        </p>
        {orphanTaxCount > 0 && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2.5 text-sm text-amber-950">
            <p className="font-medium">
              {orphanTaxCount} tax config{orphanTaxCount === 1 ? "" : "s"} have no billing engine row (common if{" "}
              <code className="text-xs bg-white/80 px-1 rounded">billing_pricing_rules</code> was cleared in SQL while{" "}
              <code className="text-xs bg-white/80 px-1 rounded">billing_tax_configs</code> still exists). They are
              hidden from this list until you attach rows.
            </p>
            {taxRepairNotice != null && (
              <p className="mt-1.5 text-xs text-amber-900/90" role="status">
                {taxRepairNotice}
              </p>
            )}
            <button
              type="button"
              className="mt-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 shadow-sm hover:bg-amber-100/80 disabled:opacity-50"
              disabled={Boolean(busy["tax.repairSlabs"])}
              onClick={() => {
                setTaxRepairNotice(null);
                void (async () => {
                  try {
                    const n = await repairTaxSlabs();
                    setTaxRepairNotice(
                      n > 0
                        ? `Attached ${n} tax row(s) to the billing engine. Refresh if counts look stale.`
                        : "No orphan tax configs needed repair."
                    );
                  } catch {
                    /* localError from hook */
                  }
                })();
              }}
            >
              {busy["tax.repairSlabs"] ? "Repairing…" : "Attach missing tax rows (repair)"}
            </button>
          </div>
        )}
        {reorderBusy && (
          <p className="text-xs text-amber-800/90 mt-1.5" aria-live="polite">
            Saving order…
          </p>
        )}
        {rulesListLoading || taxListLoading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
            <LoadingSpinner variant="button" size="sm" /> Loading rules and tax…
          </div>
        ) : combinedOrderRows.length === 0 ? (
          <p className="text-sm text-gray-500 mt-3">No charge rows for this service line yet.</p>
        ) : (
          <RulePriorityManager>
          <ul className="mt-4 space-y-3">
            {displayCombinedRows.map((row, idx) => {
              const stepPriority = (idx + 1) * 10;
              const priorityLabel = showProvisionalOrder ? stepPriority : row.priority;
              if (row.kind === "tax") {
                const t = row.tax;
                return (
                  <li
                    key={`tax-${t.id}`}
                    ref={(el) => {
                      const rowKey = `tax-${t.id}`;
                      if (el) rowElsRef.current.set(rowKey, el);
                      else rowElsRef.current.delete(rowKey);
                    }}
                    className={`flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-amber-200/60 bg-gradient-to-r from-amber-50/85 to-orange-50/70 p-4 shadow-[0_8px_24px_-18px_rgba(217,119,6,0.5)] transition-[transform,box-shadow,opacity,border-color] duration-200 ease-out motion-reduce:transition-none ${
                      dragOverIdx === idx && !reorderBusy
                        ? "border-indigo-400 ring-2 ring-indigo-200/60"
                        : ""
                    }`}
                    onDragOver={(e) => void onCombinedRowDragOver(idx, e)}
                    onDrop={(e) => void onCombinedRowDrop(idx, e)}
                  >
                    <span
                      className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-grab touch-none flex-col items-center justify-center rounded-xl border border-dashed border-amber-300/90 bg-white/70 text-[10px] font-bold text-amber-900 active:cursor-grabbing select-none [-webkit-user-drag:none]"
                      draggable={finePointer && !reorderBusy}
                      onDragStart={(e) => onCombinedRowDragStart(row, e)}
                      onDragEnd={() => setDragOverIdx(null)}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onReorderGripPointerDown(e, { kind: "tax", id: normalizeChargeOrderId(t.id) });
                      }}
                      onPointerCancel={onReorderGripPointerCancel}
                      aria-label="Drag or swipe up or down to change priority"
                      title="Drag, or swipe up/down"
                    >
                      ⋮⋮
                    </span>
                    <button
                      type="button"
                      className="flex flex-1 min-w-0 text-left gap-3"
                      onClick={() => {
                        hydrateTaxForEdit(t);
                        setChargeKind("tax_config");
                      }}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 text-sm font-bold shadow-sm">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 truncate">{t.name}</div>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                            TAX
                          </span>
                          <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                            {(parseFloat(t.rate) * 100).toFixed(2)}%
                          </span>
                          <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                            p{priorityLabel}
                            {showProvisionalOrder && <span className="sr-only"> (pending save)</span>}
                          </span>
                          {t.is_hidden && (
                            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                              hidden
                            </span>
                          )}
                          {!t.is_active && (
                            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-100 text-red-800">
                              inactive
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                    <div className="flex flex-wrap gap-2 items-center">
                      <button
                        type="button"
                        disabled={reorderBusy}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm disabled:opacity-50"
                        onClick={() => void moveCombinedRow(idx, -1)}
                        aria-label="Move up"
                      >
                        {reorderBusy ? <LoadingSpinner variant="button" size="sm" /> : "↑"}
                      </button>
                      <button
                        type="button"
                        disabled={reorderBusy}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm disabled:opacity-50"
                        onClick={() => void moveCombinedRow(idx, 1)}
                        aria-label="Move down"
                      >
                        {reorderBusy ? <LoadingSpinner variant="button" size="sm" /> : "↓"}
                      </button>
                      <button type="button" className="text-indigo-600 text-xs" onClick={() => { hydrateTaxForEdit(t); setChargeKind("tax_config"); }}>
                        Edit
                      </button>
                      <button type="button" className="text-red-600 text-xs" disabled={busy[`tax.delete.${t.id}`]} onClick={() => void deleteTax(t.id)}>
                        {busy[`tax.delete.${t.id}`] ? <LoadingSpinner variant="button" size="sm" /> : "Delete"}
                      </button>
                    </div>
                  </li>
                );
              }
              const r = row.rule;
              return (
                <li
                  key={`rule-${r.id}`}
                  ref={(el) => {
                    const rowKey = `rule-${r.id}`;
                    if (el) rowElsRef.current.set(rowKey, el);
                    else rowElsRef.current.delete(rowKey);
                  }}
                  className={`flex flex-wrap items-start justify-between gap-3 rounded-2xl border p-4 shadow-[0_10px_26px_-18px_rgba(15,23,42,0.4)] transition-[transform,box-shadow,opacity,border-color,background-color] duration-200 ease-out motion-reduce:transition-none ${
                    selectedId === r.id
                      ? "border-indigo-400 bg-gradient-to-r from-indigo-50 to-violet-50 ring-2 ring-indigo-100"
                      : "border-slate-200/80 bg-white/95 hover:border-slate-300"
                  } ${
                    dragOverIdx === idx && !reorderBusy ? "border-indigo-400 ring-2 ring-indigo-200/80" : ""
                  }`}
                  onDragOver={(e) => void onCombinedRowDragOver(idx, e)}
                  onDrop={(e) => void onCombinedRowDrop(idx, e)}
                >
                  <span
                    className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-grab touch-none flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-[10px] font-bold text-slate-500 active:cursor-grabbing select-none [-webkit-user-drag:none]"
                    draggable={finePointer && !reorderBusy}
                    onDragStart={(e) => onCombinedRowDragStart(row, e)}
                    onDragEnd={() => setDragOverIdx(null)}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onReorderGripPointerDown(e, { kind: "rule", id: normalizeChargeOrderId(r.id) });
                    }}
                    onPointerCancel={onReorderGripPointerCancel}
                    aria-label="Drag or swipe up or down to change priority"
                    title="Drag, or swipe up/down"
                  >
                    ⋮⋮
                  </span>
                  <button
                    type="button"
                    className="flex flex-1 min-w-0 text-left gap-3"
                    onClick={() => setSelectedId(r.id)}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-800 text-sm font-bold shadow-sm">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">{r.name || `Rule #${r.id}`}</div>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                          {r.type}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                          p{priorityLabel}
                          {showProvisionalOrder && <span className="sr-only"> (pending save)</span>}
                        </span>
                        {r.is_hidden && (
                          <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                            hidden
                          </span>
                        )}
                        {!r.is_active && (
                          <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-100 text-red-800">
                            inactive
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                  <div className="flex flex-wrap gap-2 items-center">
                    <button
                      type="button"
                      disabled={reorderBusy}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm disabled:opacity-50"
                      onClick={() => void moveCombinedRow(idx, -1)}
                      aria-label="Move up"
                    >
                      {reorderBusy ? <LoadingSpinner variant="button" size="sm" /> : "↑"}
                    </button>
                    <button
                      type="button"
                      disabled={reorderBusy}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm disabled:opacity-50"
                      onClick={() => void moveCombinedRow(idx, 1)}
                      aria-label="Move down"
                    >
                      {reorderBusy ? <LoadingSpinner variant="button" size="sm" /> : "↓"}
                    </button>
                    <button
                      type="button"
                      disabled={busy[`rule.toggle.${r.id}`]}
                      className="text-xs text-indigo-600 px-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggleRule(r);
                      }}
                    >
                      {busy[`rule.toggle.${r.id}`] ? (
                        <LoadingSpinner variant="button" size="sm" />
                      ) : r.is_active ? (
                        "Deactivate"
                      ) : (
                        "Activate"
                      )}
                    </button>
                    <button type="button" className="text-xs font-medium text-gray-800 underline" onClick={(e) => onEditRule(r, e)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busy[`rule.delete.${r.id}`]}
                      className="text-xs text-red-600 px-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteRule(r.id);
                      }}
                    >
                      {busy[`rule.delete.${r.id}`] ? <LoadingSpinner variant="button" size="sm" /> : "Delete"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          </RulePriorityManager>
        )}
      </section>

      {/* Rule form */}
      <section className={`${cardCls} ring-1 ring-indigo-100/80 shadow-md`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-gray-900">
            {editingRuleId != null ? `Edit rule #${editingRuleId}` : "Add charge rule"}
          </h2>
          {editingRuleId != null && (
            <span className="text-[11px] font-medium uppercase tracking-wide text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-2.5 py-0.5">
              Editing
            </span>
          )}
        </div>
        {chargeKind === "tax_config" && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-2">
            Tax values are configured below in this same form. Tax still runs after pricing rules, offers, and coupon
            in the current engine pipeline.
          </p>
        )}
        {(chargeKind === "optional_rider_tip" || form.type === "RIDER_TIP") && (
          <p className="text-sm text-emerald-900 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 mt-2">
            Rider tip is <strong>non-taxable</strong>. The rupee amount is never taken from this rule — it comes from the
            customer&apos;s <code className="text-xs bg-white/80 px-1 rounded">tipAmount</code> at checkout. This row
            controls name, priority in the list, active/hidden, and optional conditions.
          </p>
        )}

        <div className="mt-4 grid sm:grid-cols-2 gap-4">
          {chargeKind !== "tax_config" && (
            <>
              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor="rule-name">
                  Name (shown on bill)
                </label>
                <input id="rule-name" className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls} htmlFor="rule-service">
                  Service line
                </label>
                <select
                  id="rule-service"
                  className={selectCls}
                  value={form.service_type}
                  onChange={(e) => setForm((f) => ({ ...f, service_type: e.target.value as typeof f.service_type }))}
                >
                  {(["FOOD", "PARCEL", "RIDE", "ALL"] as const).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="rule-priority">
                  Priority
                </label>
                <input
                  id="rule-priority"
                  className={inputCls}
                  inputMode="numeric"
                  value={form.priority}
                  onChange={(e) => setRulePriorityField(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-0.5">
                  Pre-filled to the next free slot (max priority among all rules and taxes + 10). You can override it.
                  Execution order is stored as charge_order_key in the database; the priority field is a
                  display hint. Use ↑/↓ or drag to persist order for the selected service line.
                </p>
              </div>
            </>
          )}
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="charge-kind">
              Charge type
            </label>
            <select
              id="charge-kind"
              className={selectCls}
              value={chargeKind}
              onChange={(e) => onChargeKindChange(e.target.value as ChargeKind)}
            >
              {CHARGE_KIND_ORDER.map((k) => (
                <option
                  key={k}
                  value={k}
                  disabled={chargeKindDisabled[k]}
                  title={
                    chargeKindDisabled[k]
                      ? `Already configured for this service line (${serviceLineForChargeSlots}). Edit or remove the existing row.`
                      : undefined
                  }
                >
                  {CHARGE_KIND_LABELS[k]}
                  {chargeKindDisabled[k] ? " — already added" : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Each charge type can exist once per service line (FOOD, PARCEL, RIDE). Service-wide{" "}
              <code className="text-[11px] bg-slate-100 px-1 rounded">ALL</code> rows count for every line except{" "}
              <code className="text-[11px] bg-slate-100 px-1 rounded">ALL</code>.
            </p>
          </div>

          {chargeKind === "delivery_ref" && (
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="delivery-engine">
                Delivery fee source
              </label>
              <select
                id="delivery-engine"
                className={selectCls}
                value={deliveryEngine}
                onChange={(e) => {
                  const key =
                    e.target.value === "geo"
                      ? "GEO_LOCATION_DELIVERY"
                      : e.target.value === "slabs_v2"
                        ? "DELIVERY_SLABS_GEO_V2"
                        : "DELIVERY_RATE_CARD";
                  setForm((f) => ({
                    ...f,
                    value_json: JSON.stringify({ key }),
                    calculation_type: "FORMULA_KEY",
                  }));
                }}
              >
                <option value="rate_card">Delivery rate cards (city / time / distance)</option>
                <option value="geo">Location pricing rules (Geo → pincode)</option>
                <option value="slabs_v2">Progressive geo slabs (base once + per slab km)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                <strong>Geo</strong> uses Super Admin → Geo <code className="text-[11px] bg-gray-100 px-1 rounded">pricing_rules</code>{" "}
                (<code className="text-[11px] bg-gray-100 px-1 rounded">customer_delivery_fee</code>). If no rule matches, the
                delivery rate card amount is used. The customer&apos;s saved address must include a valid pincode.
              </p>
            </div>
          )}

          {showCalcTypeSelect && (
            <div>
              <label className={labelCls} htmlFor="rule-calc">
                How to calculate
              </label>
              <select
                id="rule-calc"
                className={selectCls}
                value={form.calculation_type}
                onChange={(e) => setForm((f) => ({ ...f, calculation_type: e.target.value }))}
              >
                <option value="PERCENTAGE">Percentage</option>
                <option value="FIXED">Fixed amount (₹)</option>
              </select>
            </div>
          )}

          {showAmountInput && (
            <div className={showCalcTypeSelect ? "sm:col-span-2" : ""}>
              <label className={labelCls} htmlFor="rule-value">
                {form.calculation_type === "PERCENTAGE" ? "Percent value" : "Amount (₹)"}
              </label>
              <input
                id="rule-value"
                className={inputCls}
                placeholder={form.calculation_type === "PERCENTAGE" ? "e.g. 10 for 10%" : "e.g. 25"}
                value={form.value_numeric}
                onChange={(e) => setForm((f) => ({ ...f, value_numeric: e.target.value }))}
              />
              <p className="text-xs text-gray-500 mt-1">
                {form.calculation_type === "PERCENTAGE"
                  ? "Percent of the rule base (e.g. 5 → 5%). Used by platform fee, discounts, offers, etc."
                  : "Fixed amount in ₹ for this rule when calculation is FIXED. Formula-based packaging/delivery ignore this and use engine data instead."}
              </p>
            </div>
          )}

          {(chargeKind === "packaging_merchant" ||
            chargeKind === "delivery_ref" ||
            chargeKind === "platform_offer_ref" ||
            chargeKind === "merchant_offer") && (
            <div className="sm:col-span-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">
              No manual amount here — pricing comes from{" "}
              {chargeKind === "delivery_ref" &&
                "the source you picked above (geo pricing_rules or delivery rate cards) + route distance for billing context."}
              {chargeKind === "platform_offer_ref" && "GatiMitra offers configured on the Offers & coupons page."}
              {chargeKind === "merchant_offer" &&
                "merchant offer mappings (store/item level) and eligibility from merchant data."}
              {chargeKind === "packaging_merchant" && "item packaging flags and per-item packaging value from merchant item table."}
            </div>
          )}

          {chargeKind !== "tax_config" && (
            <details className="sm:col-span-2 group rounded-xl border border-indigo-100 bg-gradient-to-br from-white to-indigo-50/30 px-3 py-2 open:shadow-sm">
              <summary className="cursor-pointer list-none flex items-center justify-between gap-2 text-sm font-medium text-indigo-900">
                <span>Advanced — engine JSON</span>
                <span className="text-indigo-400 text-xs group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="mt-3 grid sm:grid-cols-2 gap-3 pt-1 border-t border-indigo-100/80">
                <div className="sm:col-span-2">
                  <label className={labelCls} htmlFor="rule-value-json">
                    value_json
                  </label>
                  <textarea
                    id="rule-value-json"
                    className={textareaCls}
                    rows={4}
                    placeholder='{"key":"MERCHANT_PACKAGING"}'
                    value={form.value_json}
                    onChange={(e) => setForm((f) => ({ ...f, value_json: e.target.value }))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls} htmlFor="rule-metadata-json">
                    metadata (optional)
                  </label>
                  <textarea
                    id="rule-metadata-json"
                    className={textareaCls}
                    rows={3}
                    placeholder="{}"
                    value={form.metadata}
                    onChange={(e) => setForm((f) => ({ ...f, metadata: e.target.value }))}
                  />
                </div>
                <p className="sm:col-span-2 text-xs text-gray-600">
                  Formula rules (packaging, delivery, merchant offer) send the correct <code className="text-[11px] bg-white px-1 rounded">key</code> on save.
                  Edit only if you are aligning with the billing engine contract.
                </p>
              </div>
            </details>
          )}

          {showStackable && (
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 text-sm text-gray-900 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={form.stackable}
                  onChange={(e) => setForm((f) => ({ ...f, stackable: e.target.checked }))}
                />
                Stackable with other discounts / offers
              </label>
            </div>
          )}

          {showDiscountAppliesOn && (
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="discount-applies-on">
                Discount applies on
              </label>
              <select
                id="discount-applies-on"
                className={selectCls}
                value={form.discount_applies_on}
                onChange={(e) => setForm((f) => ({ ...f, discount_applies_on: e.target.value }))}
              >
                {DISCOUNT_APPLIES_ON.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Used only for manual DISCOUNT rules. Select which component base this discount reduces.
              </p>
            </div>
          )}
          {showChargeSubtype && (
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="charge-subtype">
                Charge subtype (optional)
              </label>
              <input
                id="charge-subtype"
                className={inputCls}
                value={form.charge_subtype}
                onChange={(e) => setForm((f) => ({ ...f, charge_subtype: e.target.value }))}
                placeholder="e.g. small_order_peak"
              />
            </div>
          )}

          {chargeKind === "tax_config" && (
            <TaxConfigPanel
              taxForm={taxForm}
              setTaxForm={setTaxForm}
              taxPercentDisplay={taxPercentDisplay}
              setTaxPriorityField={setTaxPriorityField}
              taxBases={TAX_BASES}
              taxGroups={TAX_GROUPS}
              labelCls={labelCls}
              inputCls={inputCls}
              selectCls={selectCls}
            />
          )}

          <div className="sm:col-span-2 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-900 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={chargeKind === "tax_config" ? taxForm.is_active : form.is_active}
                onChange={(e) =>
                  chargeKind === "tax_config"
                    ? setTaxForm((f) => ({ ...f, is_active: e.target.checked }))
                    : setForm((f) => ({ ...f, is_active: e.target.checked }))
                }
              />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-900 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={chargeKind === "tax_config" ? taxForm.is_hidden : form.is_hidden}
                onChange={(e) =>
                  chargeKind === "tax_config"
                    ? setTaxForm((f) => ({ ...f, is_hidden: e.target.checked }))
                    : setForm((f) => ({ ...f, is_hidden: e.target.checked }))
                }
              />
              Hidden in customer app (still affects total)
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void (chargeKind === "tax_config" ? saveTax() : saveRule())}
            disabled={
              chargeKind === "tax_config"
                ? busy[editingTaxId != null ? "tax.update" : "tax.create"]
                : busy[editingRuleId != null ? "rule.update" : "rule.create"]
            }
            className="rounded-lg bg-indigo-600 text-white text-sm font-medium px-4 py-2 disabled:opacity-60"
          >
            {(chargeKind === "tax_config"
              ? busy[editingTaxId != null ? "tax.update" : "tax.create"]
              : busy[editingRuleId != null ? "rule.update" : "rule.create"]) ? (
              <span className="inline-flex items-center gap-2">
                <LoadingSpinner variant="button" size="sm" /> Saving…
              </span>
            ) : chargeKind === "tax_config" ? (
              editingTaxId != null ? "Save tax" : "Create tax"
            ) : editingRuleId != null ? (
              "Save rule"
            ) : (
              "Create rule"
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              if (chargeKind === "tax_config") {
                resetTaxForm();
              } else {
                resetRuleForm();
                setChargeKind("manual_discount");
                applyChargeKind("manual_discount", setForm);
              }
            }}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm disabled:opacity-60"
            disabled={
              chargeKind === "tax_config"
                ? busy[editingTaxId != null ? "tax.update" : "tax.create"]
                : busy[editingRuleId != null ? "rule.update" : "rule.create"]
            }
          >
            Reset
          </button>
        </div>
      </section>

      {/* Conditions */}
      <section className={cardCls}>
        <h2 className="text-base font-semibold">Conditions (optional)</h2>
        <p className="text-sm text-gray-600 mt-1">Select a rule in the list above. All conditions must pass for the rule to run.</p>
        {selectedId == null ? (
          <p className="text-sm text-gray-500 mt-3">No rule selected.</p>
        ) : (
          <>
            {conditionsFetching && (
              <p className="text-xs text-gray-500 mt-2 flex items-center gap-2">
                <LoadingSpinner variant="button" size="sm" /> Loading…
              </p>
            )}
            <ul className="mt-3 space-y-2">
              {conditions.map((c) => (
                <li key={c.id} className="flex justify-between items-center text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
                  <span className="text-gray-800">
                    {c.condition_type} {c.operator} · min {c.value_min} max {c.value_max}
                    {c.value_text ? ` · ${c.value_text}` : ""}
                  </span>
                  <button
                    type="button"
                    className="text-red-600 text-xs"
                    disabled={busy[`cond.delete.${c.id}`]}
                    onClick={() => void deleteCondition(c.id)}
                  >
                    {busy[`cond.delete.${c.id}`] ? <LoadingSpinner variant="button" size="sm" /> : "Remove"}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-4 grid sm:grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Condition type</label>
                <select
                  className={selectCls}
                  value={condForm.condition_type}
                  onChange={(e) => setCondForm((f) => ({ ...f, condition_type: e.target.value }))}
                >
                  {COND_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Operator</label>
                <select
                  className={selectCls}
                  value={condForm.operator}
                  onChange={(e) => setCondForm((f) => ({ ...f, operator: e.target.value }))}
                >
                  {OPS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Min</label>
                <input className={inputCls} value={condForm.value_min} onChange={(e) => setCondForm((f) => ({ ...f, value_min: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Max</label>
                <input className={inputCls} value={condForm.value_max} onChange={(e) => setCondForm((f) => ({ ...f, value_max: e.target.value }))} />
              </div>
            </div>
            <button
              type="button"
              onClick={() => void addCondition()}
              disabled={busy["cond.create"]}
              className="mt-3 rounded-lg bg-gray-800 text-white text-sm px-4 py-2 disabled:opacity-60"
            >
              {busy["cond.create"] ? (
                <span className="inline-flex items-center gap-2">
                  <LoadingSpinner variant="button" size="sm" /> Adding…
                </span>
              ) : (
                "Add condition"
              )}
            </button>
          </>
        )}
      </section>

      {/* Simulator */}
      <section className={cardCls}>
        <h2 className="text-base font-semibold">Simulator</h2>
        <p className="text-sm text-gray-600 mt-1">
          Uses backend <code className="text-xs bg-gray-100 px-1 rounded">POST /v1/billing/calculate</code> with your live
          rules, tax slabs, rate cards, and coupons from the database — same pipeline as checkout.{" "}
          <strong className="font-medium text-gray-800">merchantId</strong> is the merchant store id; set{" "}
          <strong className="font-medium text-gray-800">dropLat</strong>/<strong className="font-medium text-gray-800">dropLon</strong>{" "}
          (simulator cannot use addressId). Add-ons must use <code className="text-xs bg-gray-100 px-1 rounded">addonName</code>, not{" "}
          <code className="text-xs bg-gray-100 px-1 rounded">name</code>.
        </p>
        <BillPreviewSimulator simParsed={simParsed} simResult={simResult} breakdownRows={breakdownRows}>
          <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-medium text-gray-700 mb-2">Load a real menu item</p>
            <div className="grid sm:grid-cols-3 gap-2">
              <input
                className={inputCls}
                placeholder="Store ID"
                value={realStoreId}
                onChange={(e) => setRealStoreId(e.target.value)}
              />
              <input
                className={inputCls}
                placeholder="Item ID"
                value={realItemId}
                onChange={(e) => setRealItemId(e.target.value)}
              />
              <button
                type="button"
                onClick={() => void loadRealItemIntoSimulator()}
                disabled={realItemLoading}
                className="rounded-lg bg-gray-800 text-white text-xs font-medium px-3 py-2 disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {realItemLoading ? (
                  <>
                    <LoadingSpinner variant="button" size="sm" /> Loading…
                  </>
                ) : (
                  "Load item"
                )}
              </button>
            </div>
            {realItemError && <p className="text-xs text-red-600 mt-2">{realItemError}</p>}
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {SIM_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className="text-xs rounded-full border border-gray-300 bg-white px-3 py-1.5 hover:bg-gray-50"
                onClick={() => setSimBody(p.json)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
            <label className={`${labelCls}`} htmlFor="sim-coupon">
              Coupon code (optional)
            </label>
            <input
              id="sim-coupon"
              className={inputCls}
              placeholder="e.g. WELCOME20 — must exist under Super Admin → Offers & coupons"
              value={simCouponCode}
              onChange={(e) => setSimCouponCode(e.target.value.toUpperCase())}
              autoComplete="off"
            />
            <p className="mt-1.5 text-xs text-gray-600">
              Sent as <code className="rounded bg-white px-1 text-[11px]">couponCode</code> on the calculate request (same field as
              checkout). Leave empty to simulate without a coupon. If you also put{" "}
              <code className="rounded bg-white px-1 text-[11px]">couponCode</code> in the JSON, this field wins when it is not empty.
            </p>
          </div>
          <label className={`${labelCls} mt-3`} htmlFor="sim-json">
            Request JSON
          </label>
          <textarea id="sim-json" className={textareaCls} rows={10} value={simBody} onChange={(e) => setSimBody(e.target.value)} />
          <BillPreviewSimulatorRunButton
            onClick={() => void runSim()}
            disabled={simBusy || busy["sim.run"]}
            busy={Boolean(simBusy || busy["sim.run"])}
          />
        </BillPreviewSimulator>
      </section>
    </div>
  );
}
