"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import { usePermissions } from "@/hooks/queries/usePermissionsQuery";
import {
  type BillingAdminConditionRow,
  type BillingAdminDiscountRow,
  type BillingAdminPackagingSlabRow,
  type BillingAdminPlatformOfferRow,
  type BillingAdminRateCardRow,
  type BillingAdminRuleRow,
  type BillingAdminSlabRow,
  type BillingAdminTaxRow,
  type CreateBillingRuleBody,
  useCreateBillingConditionMutation,
  useCreateBillingDiscountMutation,
  useCreateBillingDeliveryRateCardMutation,
  useCreateBillingPlatformOfferMutation,
  useCreateBillingPackagingSlabMutation,
  useCreateBillingRuleMutation,
  useCreateBillingSlabMutation,
  useCreateBillingTaxConfigMutation,
  useDeleteBillingConditionMutation,
  useDeleteBillingDiscountMutation,
  useDeleteBillingDeliveryRateCardMutation,
  useDeleteBillingPlatformOfferMutation,
  useDeleteBillingPackagingSlabMutation,
  useDeleteBillingRuleMutation,
  useDeleteBillingSlabMutation,
  useDeleteBillingTaxConfigMutation,
  useRepairBillingTaxSlabsMutation,
  useGetBillingConditionsQuery,
  useGetBillingDeliveryRateCardsQuery,
  useGetBillingDiscountsQuery,
  useGetBillingPackagingSlabsQuery,
  useGetBillingPlatformOffersQuery,
  useGetBillingRulesQuery,
  useGetBillingSlabsQuery,
  useGetBillingTaxConfigsQuery,
  useLazyGetMerchantBillingOverrideQuery,
  usePutMerchantBillingOverrideMutation,
  useSimulateBillingMutation,
  useUpdateBillingDiscountMutation,
  useUpdateBillingDeliveryRateCardMutation,
  useUpdateBillingPlatformOfferMutation,
  useUpdateBillingPackagingSlabMutation,
  useUpdateBillingRuleMutation,
  useReorderBillingChargeOrderMutation,
  useUpdateBillingSlabMutation,
  useUpdateBillingTaxConfigMutation,
} from "@/store/api/billingAdminApi";
import { logBillingCharge, normalizeChargeOrderKeys } from "@/lib/billing-charge-order";

/** Aligns with backend POST /v1/billing/calculate (see `calculateBodySchema` + addonSchema: `addonName`, not `name`). */
const DEFAULT_SIM = `{
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
    {
      "menuItemId": "101",
      "itemName": "Thali",
      "quantity": 2,
      "basePrice": 150,
      "addons": [{ "addonId": "a1", "addonName": "Extra raita", "quantity": 1, "addonPrice": 20 }]
    }
  ]
}`;

function normalizeSimPayload(raw: unknown): unknown {
  if (raw == null || typeof raw !== "object") return raw;
  const b = raw as Record<string, unknown>;
  const items = b.items;
  if (!Array.isArray(items)) return raw;
  const nextItems = items.map((it) => {
    if (it == null || typeof it !== "object") return it;
    const row = { ...(it as Record<string, unknown>) };
    const addons = row.addons;
    if (!Array.isArray(addons)) return row;
    row.addons = addons.map((a) => {
      if (a == null || typeof a !== "object") return a;
      const ad = { ...(a as Record<string, unknown>) };
      if (ad.addonName == null && typeof ad.name === "string") {
        ad.addonName = ad.name;
        delete ad.name;
      }
      return ad;
    });
    return row;
  });
  return { ...b, items: nextItems };
}

function rtkErrorMessage(err: unknown): string {
  const fbe = err as FetchBaseQueryError | undefined;
  if (fbe && typeof fbe === "object" && "data" in fbe && fbe.data && typeof fbe.data === "object" && "error" in fbe.data) {
    const m = (fbe.data as { error?: unknown }).error;
    if (typeof m === "string") return m;
  }
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return "Request failed";
}

export type BillingRuleRow = BillingAdminRuleRow;
export type BillingConditionRow = BillingAdminConditionRow;

export type UseSuperAdminBillingPageOptions = {
  /** When false, slabs/packaging/discounts/rate-cards/platform-offers are not fetched (billing rules page only). */
  loadReferenceData?: boolean;
  /** Fewer automatic refetches; use on the dedicated Billing Rules page for snappier UX. */
  leanBillingQueries?: boolean;
};

export function useSuperAdminBillingPage(options?: UseSuperAdminBillingPageOptions) {
  const loadReferenceData = options?.loadReferenceData ?? true;
  const leanBillingQueries = options?.leanBillingQueries ?? false;
  const { isSuperAdmin, loading: permLoading } = usePermissions();
  const gateSkip = !isSuperAdmin || permLoading;
  const refSkip = gateSkip || !loadReferenceData;

  const billingQueryOpts = leanBillingQueries
    ? { refetchOnFocus: false as const, refetchOnReconnect: false as const }
    : {};

  const {
    data: rules = [],
    isLoading: rulesLoading,
    isFetching: rulesFetching,
    error: rulesQueryError,
  } = useGetBillingRulesQuery(undefined, { skip: gateSkip, ...billingQueryOpts });

  const [billingService, setBillingService] = useState<"FOOD" | "PARCEL" | "RIDE">("FOOD");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const {
    data: conditions = [],
    isFetching: conditionsFetching,
    error: conditionsQueryError,
  } = useGetBillingConditionsQuery(selectedId ?? 0, {
    skip: gateSkip || selectedId == null,
  });

  const { data: refSlabs = [], isLoading: slabsLoading, error: slabsQueryError } = useGetBillingSlabsQuery(
    undefined,
    { skip: refSkip }
  );
  const {
    data: refPackagingSlabs = [],
    isLoading: packagingLoading,
    error: packagingQueryError,
  } = useGetBillingPackagingSlabsQuery(undefined, { skip: refSkip });
  const { data: refTax = [], isLoading: taxLoading, error: taxQueryError } = useGetBillingTaxConfigsQuery(
    undefined,
    { skip: gateSkip, ...billingQueryOpts }
  );
  const { data: refDiscounts = [], isLoading: discountsLoading, error: discountsQueryError } =
    useGetBillingDiscountsQuery(undefined, { skip: refSkip });

  const { data: refRateCards = [], isLoading: rateCardsLoading, error: rateCardsQueryError } =
    useGetBillingDeliveryRateCardsQuery(undefined, { skip: refSkip });
  const { data: refPlatformOffers = [], isLoading: platformOffersLoading, error: platformOffersQueryError } =
    useGetBillingPlatformOffersQuery(undefined, { skip: refSkip });

  const [createRuleMut, createRuleState] = useCreateBillingRuleMutation();
  const [updateRuleMut, updateRuleState] = useUpdateBillingRuleMutation();
  const [reorderChargeOrderMut] = useReorderBillingChargeOrderMutation();
  const [deleteRuleMut, deleteRuleState] = useDeleteBillingRuleMutation();
  const [createCondMut, createCondState] = useCreateBillingConditionMutation();
  const [deleteCondMut, deleteCondState] = useDeleteBillingConditionMutation();
  const [createSlabMut, createSlabState] = useCreateBillingSlabMutation();
  const [updateSlabMut, updateSlabState] = useUpdateBillingSlabMutation();
  const [deleteSlabMut, deleteSlabState] = useDeleteBillingSlabMutation();
  const [createPackMut, createPackState] = useCreateBillingPackagingSlabMutation();
  const [updatePackMut, updatePackState] = useUpdateBillingPackagingSlabMutation();
  const [deletePackMut, deletePackState] = useDeleteBillingPackagingSlabMutation();
  const [createTaxMut, createTaxState] = useCreateBillingTaxConfigMutation();
  const [updateTaxMut, updateTaxState] = useUpdateBillingTaxConfigMutation();
  const [deleteTaxMut, deleteTaxState] = useDeleteBillingTaxConfigMutation();
  const [repairTaxSlabsMut] = useRepairBillingTaxSlabsMutation();
  const [createDiscMut, createDiscState] = useCreateBillingDiscountMutation();
  const [updateDiscMut, updateDiscState] = useUpdateBillingDiscountMutation();
  const [deleteDiscMut, deleteDiscState] = useDeleteBillingDiscountMutation();
  const [createRateCardMut, createRateCardState] = useCreateBillingDeliveryRateCardMutation();
  const [updateRateCardMut, updateRateCardState] = useUpdateBillingDeliveryRateCardMutation();
  const [deleteRateCardMut, deleteRateCardState] = useDeleteBillingDeliveryRateCardMutation();
  const [createPlatformOfferMut, createPlatformOfferState] = useCreateBillingPlatformOfferMutation();
  const [updatePlatformOfferMut, updatePlatformOfferState] = useUpdateBillingPlatformOfferMutation();
  const [deletePlatformOfferMut, deletePlatformOfferState] = useDeleteBillingPlatformOfferMutation();
  const [triggerLoadOverride, loadOverrideState] = useLazyGetMerchantBillingOverrideQuery();
  const [putOverrideMut, putOverrideState] = usePutMerchantBillingOverrideMutation();
  const [simulateMut, simulateState] = useSimulateBillingMutation();
  const simBusy = simulateState.isLoading;

  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const withBusy = useCallback(async <T,>(key: string, fn: () => Promise<T>): Promise<T> => {
    setBusy((m) => ({ ...m, [key]: true }));
    try {
      return await fn();
    } finally {
      setBusy((m) => ({ ...m, [key]: false }));
    }
  }, []);

  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [editingSlabId, setEditingSlabId] = useState<number | null>(null);
  const [editingPackId, setEditingPackId] = useState<number | null>(null);
  const [editingTaxId, setEditingTaxId] = useState<number | null>(null);
  const [editingDiscId, setEditingDiscId] = useState<number | null>(null);
  const [editingRateCardId, setEditingRateCardId] = useState<number | null>(null);
  const [editingPlatformOfferId, setEditingPlatformOfferId] = useState<number | null>(null);

  const [slabForm, setSlabForm] = useState({
    name: "",
    min_km: "0",
    max_km: "5",
    fee_fixed: "25",
    fee_per_km: "5",
    scope_type: "global",
    is_active: true,
  });
  const [packForm, setPackForm] = useState({
    name: "",
    min_cart: "0",
    max_cart: "",
    fee_fixed: "10",
    fee_per_addon_qty: "5",
    scope_type: "global",
    is_active: true,
  });
  const [taxForm, setTaxForm] = useState({
    name: "GST",
    /** Stored as decimal in DB (e.g. 0.05); UI may edit as percent via page */
    rate: "0.05",
    applicable_base: "ITEM_AFTER_DISCOUNT",
    tax_group: "item" as string,
    priority: "0",
    is_active: true,
    is_hidden: false,
    metadata: "",
    service_type: "FOOD" as "FOOD" | "PARCEL" | "RIDE" | "ALL",
  });
  const [discForm, setDiscForm] = useState({
    code: "",
    discount_type: "PERCENTAGE" as "FIXED" | "PERCENTAGE",
    value_numeric: "10",
    max_discount_cap: "",
    usage_limit: "",
    is_active: true,
    is_hidden: false,
    metadata: "",
  });
  const [rateCardForm, setRateCardForm] = useState({
    name: "",
    service_type: "FOOD" as "FOOD" | "PARCEL" | "RIDE" | "ALL",
    city_name: "",
    time_slot: "ALL",
    base_fare: "0",
    per_km_rate: "0",
    surge_multiplier: "1",
    min_km: "",
    max_km: "",
    free_delivery_above: "",
    priority: "0",
    is_active: true,
    metadata: "",
  });
  const [platformOfferForm, setPlatformOfferForm] = useState({
    name: "",
    service_type: "FOOD" as "FOOD" | "PARCEL" | "RIDE" | "ALL",
    discount_type: "PERCENTAGE",
    value_numeric: "",
    delivery_discount_type: "",
    delivery_discount_value: "",
    priority: "0",
    is_active: true,
    is_hidden: false,
    city: "",
    min_order_value: "",
    user_segment: "ALL" as "NEW" | "EXISTING" | "ALL",
    metadata: "",
  });
  const [ovStoreId, setOvStoreId] = useState("");
  const [ovJson, setOvJson] = useState(`{\n  "disabledRuleIds": []\n}`);

  /** When false, priority field tracks `nextRulePriority` as rules/tax load; set true if user edits priority. */
  const [rulePriorityTouched, setRulePriorityTouched] = useState(false);
  /** Same for tax create form vs `nextTaxPriority`. */
  const [taxPriorityTouched, setTaxPriorityTouched] = useState(false);

  const [form, setForm] = useState({
    name: "",
    type: "DISCOUNT",
    calculation_type: "PERCENTAGE",
    value_numeric: "10",
    /** Placeholder until rules load; then synced to max priority + 10 (see useEffect). */
    priority: "10",
    is_active: true,
    stackable: true,
    applies_to: "ORDER",
    offer_owner: "GATIMITRA",
    is_hidden: false,
    value_json: "",
    metadata: "",
    service_type: "FOOD" as "FOOD" | "PARCEL" | "RIDE" | "ALL",
    discount_applies_on: "ITEMS_TOTAL",
    charge_subtype: "",
  });

  const [condForm, setCondForm] = useState({
    condition_type: "ORDER_VALUE",
    operator: "GTE",
    value_min: "",
    value_max: "",
    value_text: "",
    value_json: "",
  });

  const [simBody, setSimBody] = useState(DEFAULT_SIM);
  const [simResult, setSimResult] = useState<string | null>(null);

  const [localError, setLocalError] = useState<string | null>(null);

  const rulesListLoading = rulesLoading;
  const referenceLoading =
    loadReferenceData &&
    (slabsLoading || packagingLoading || discountsLoading || rateCardsLoading || platformOffersLoading);
  /** Full-page loading when legacy “everything” mode; billing page uses rulesListLoading + taxListLoading separately */
  const listLoading = rulesListLoading || taxLoading || referenceLoading;
  const taxListLoading = taxLoading;
  const rulesUpdating = rulesFetching && !rulesLoading;

  const nextRulePriority = useMemo(() => {
    const ruleMax = rules.reduce((m, r) => Math.max(m, Number(r.priority) || 0), 0);
    const taxMax = refTax.reduce((m, t) => Math.max(m, Number(t.priority) || 0), 0);
    const maxP = Math.max(ruleMax, taxMax);
    return String(maxP + 10);
  }, [rules, refTax]);

  const nextTaxPriority = useMemo(() => {
    const rel = refTax.filter(
      (t) =>
        String(t.service_type ?? "FOOD").toUpperCase() === billingService ||
        String(t.service_type ?? "").toUpperCase() === "ALL"
    );
    const maxP = rel.reduce((m, t) => Math.max(m, Number(t.priority) || 0), 0);
    return String(maxP + 10);
  }, [refTax, billingService]);

  const queryErrorMessage = useMemo(() => {
    const parts = [
      rulesQueryError,
      conditionsQueryError,
      taxQueryError,
      loadReferenceData ? slabsQueryError : null,
      loadReferenceData ? packagingQueryError : null,
      loadReferenceData ? discountsQueryError : null,
      loadReferenceData ? rateCardsQueryError : null,
      loadReferenceData ? platformOffersQueryError : null,
    ].map((e) => (e ? rtkErrorMessage(e) : null));
    const first = parts.find(Boolean);
    return first ?? null;
  }, [
    rulesQueryError,
    conditionsQueryError,
    taxQueryError,
    slabsQueryError,
    packagingQueryError,
    discountsQueryError,
    rateCardsQueryError,
    platformOffersQueryError,
    loadReferenceData,
  ]);

  const bannerError = localError ?? queryErrorMessage;

  const resetRuleForm = useCallback(() => {
    setEditingRuleId(null);
    setRulePriorityTouched(false);
    setForm({
      name: "",
      type: "DISCOUNT",
      calculation_type: "PERCENTAGE",
      value_numeric: "10",
      priority: nextRulePriority,
      is_active: true,
      stackable: true,
      applies_to: "ORDER",
      offer_owner: "GATIMITRA",
      is_hidden: false,
      value_json: "",
      metadata: "",
      service_type: billingService,
      discount_applies_on: "ITEMS_TOTAL",
      charge_subtype: "",
    });
  }, [billingService, nextRulePriority]);

  useEffect(() => {
    if (editingRuleId != null) return;
    setForm((f) => ({ ...f, service_type: billingService }));
  }, [billingService, editingRuleId]);

  /** Keep create-mode priority equal to next suggested slot so the input matches the hint without manual copy. */
  useEffect(() => {
    if (editingRuleId != null || rulesLoading || rulePriorityTouched) return;
    setForm((f) => ({ ...f, priority: nextRulePriority }));
  }, [editingRuleId, rulesLoading, nextRulePriority, rulePriorityTouched]);

  const setRulePriorityField = useCallback((value: string) => {
    setRulePriorityTouched(true);
    setForm((f) => ({ ...f, priority: value }));
  }, []);

  const hydrateRuleForEdit = useCallback((r: BillingRuleRow, e?: MouseEvent) => {
    e?.stopPropagation();
    setEditingRuleId(r.id);
    setRulePriorityTouched(false);
    setSelectedId(r.id);
    setForm({
      name: r.name ?? "",
      type: r.type,
      calculation_type: r.calculation_type,
      value_numeric: r.value_numeric ?? "",
      priority: String(r.priority),
      is_active: r.is_active,
      stackable: r.stackable,
      applies_to: r.applies_to,
      offer_owner: r.offer_owner ?? "GATIMITRA",
      is_hidden: r.is_hidden ?? false,
      value_json: r.value_json != null ? JSON.stringify(r.value_json, null, 2) : "",
      metadata: r.metadata != null ? JSON.stringify(r.metadata, null, 2) : "",
      service_type: (r.service_type ?? "FOOD").toUpperCase() as "FOOD" | "PARCEL" | "RIDE" | "ALL",
      discount_applies_on: r.discount_applies_on ?? "ITEMS_TOTAL",
      charge_subtype: r.charge_subtype ?? "",
    });
  }, []);

  const saveRule = useCallback(async () => {
    setLocalError(null);
    let valueJson: unknown;
    let metadata: unknown;
    try {
      if (typeof form.value_json === "string") {
        valueJson = form.value_json.trim() ? JSON.parse(form.value_json) : null;
      } else {
        valueJson = form.value_json ?? null;
      }
    } catch {
      setLocalError("value_json must be valid JSON or empty");
      return;
    }
    try {
      metadata = form.metadata.trim() ? JSON.parse(form.metadata) : null;
    } catch {
      setLocalError("metadata must be valid JSON or empty");
      return;
    }
    const appliesTo = form.type === "DELIVERY" ? "DELIVERY" : form.applies_to;
    const payload: CreateBillingRuleBody = {
      name: form.name || null,
      type: form.type,
      calculation_type: form.calculation_type,
      value_numeric: form.value_numeric === "" ? null : parseFloat(form.value_numeric),
      value_json: valueJson,
      priority: parseInt(form.priority, 10) || 100,
      is_active: form.is_active,
      stackable: form.stackable,
      applies_to: appliesTo,
      offer_owner: form.offer_owner,
      is_hidden: form.is_hidden,
      metadata,
      service_type: form.service_type,
      discount_applies_on: form.discount_applies_on,
      charge_subtype: form.charge_subtype.trim() === "" ? null : form.charge_subtype.trim(),
    };

    if (payload.calculation_type === "FORMULA_KEY") {
      if (payload.type === "PACKAGING") {
        payload.value_json = { key: "MERCHANT_PACKAGING" };
      } else if (payload.type === "DELIVERY") {
        const k = (payload.value_json as { key?: string } | null)?.key;
        payload.value_json =
          k === "GEO_LOCATION_DELIVERY"
            ? { key: "GEO_LOCATION_DELIVERY" }
            : { key: "DELIVERY_RATE_CARD" };
      } else if (payload.type === "OFFER" && payload.offer_owner === "MERCHANT") {
        payload.value_json = { key: "MERCHANT_OFFER_REF" };
      }
    }
    try {
      const wasCreate = editingRuleId == null;
      await withBusy(wasCreate ? "rule.create" : "rule.update", async () => {
        if (wasCreate) {
          try {
            await createRuleMut(payload).unwrap();
          } catch (e) {
            const msg = rtkErrorMessage(e);
            // Friendly recovery for "tip setup" and other create flows when suggested priority became stale.
            if (msg.includes("Priority") && msg.includes("already used")) {
              const fallbackPriority = parseInt(nextRulePriority, 10);
              if (Number.isFinite(fallbackPriority) && fallbackPriority > 0) {
                await createRuleMut({ ...payload, priority: fallbackPriority }).unwrap();
                setForm((f) => ({ ...f, priority: String(fallbackPriority) }));
                setRulePriorityTouched(false);
              } else {
                throw e;
              }
            } else {
              throw e;
            }
          }
          resetRuleForm();
        } else {
          await updateRuleMut({ id: editingRuleId, body: payload }).unwrap();
        }
      });
    } catch (e) {
      setLocalError(rtkErrorMessage(e));
    }
  }, [form, editingRuleId, createRuleMut, updateRuleMut, resetRuleForm, withBusy, nextRulePriority, setRulePriorityTouched]);

  const toggleRule = useCallback(
    async (r: BillingRuleRow) => {
      setLocalError(null);
      try {
        await withBusy(`rule.toggle.${r.id}`, async () => {
          await updateRuleMut({
            id: r.id,
            body: {
              name: r.name,
              type: r.type,
              calculation_type: r.calculation_type,
              value_numeric: r.value_numeric != null ? parseFloat(r.value_numeric) : null,
              value_json: r.value_json,
              priority: r.priority,
              is_active: !r.is_active,
              stackable: r.stackable,
              applies_to: r.applies_to,
              offer_owner: r.offer_owner,
              is_hidden: r.is_hidden,
              metadata: r.metadata,
              service_type: r.service_type,
              discount_applies_on: r.discount_applies_on,
              charge_subtype: r.charge_subtype,
            },
          }).unwrap();
        });
      } catch (e) {
        setLocalError(rtkErrorMessage(e));
      }
    },
    [updateRuleMut, withBusy]
  );

  const moveRule = useCallback(
    async (idx: number, dir: -1 | 1, serviceScope?: "FOOD" | "PARCEL" | "RIDE") => {
      setLocalError(null);
      const next = [...rules].sort((a, b) => a.priority - b.priority || a.id - b.id);
      const scoped = serviceScope
        ? next.filter((r) => {
            const st = String(r.service_type ?? "FOOD").toUpperCase();
            return st === serviceScope || st === "ALL";
          })
        : next;
      const j = idx + dir;
      if (j < 0 || j >= scoped.length) return;
      const a = scoped[idx];
      const b = scoped[j];
      if (!a || !b) return;
      try {
        await withBusy("rule.reorder", async () => {
          await Promise.all([
            updateRuleMut({ id: a.id, body: { priority: b.priority } }).unwrap(),
            updateRuleMut({ id: b.id, body: { priority: a.priority } }).unwrap(),
          ]);
        });
      } catch (e) {
        setLocalError(rtkErrorMessage(e));
      }
    },
    [rules, updateRuleMut, withBusy]
  );

  const reorderRules = useCallback(
    async (orderedScopedIds: number[]) => {
      if (orderedScopedIds.length === 0) return;
      setLocalError(null);
      try {
        await withBusy("rule.reorder", async () => {
          await Promise.all(
            orderedScopedIds.map((id, i) =>
              updateRuleMut({
                id,
                body: { priority: (i + 1) * 10 },
              }).unwrap()
            )
          );
        });
      } catch (e) {
        setLocalError(rtkErrorMessage(e));
        throw e;
      }
    },
    [updateRuleMut, withBusy]
  );

  const deleteRule = useCallback(
    async (id: number) => {
      if (!confirm("Delete this rule and its conditions?")) return;
      setLocalError(null);
      try {
        await withBusy(`rule.delete.${id}`, async () => {
          await deleteRuleMut(id).unwrap();
        });
        if (selectedId === id) setSelectedId(null);
        if (editingRuleId === id) resetRuleForm();
      } catch (e) {
        setLocalError(rtkErrorMessage(e));
      }
    },
    [deleteRuleMut, selectedId, editingRuleId, resetRuleForm, withBusy]
  );

  const addCondition = useCallback(async () => {
    if (selectedId == null) return;
    setLocalError(null);
    let valueJson: unknown;
    try {
      valueJson = condForm.value_json.trim() ? JSON.parse(condForm.value_json) : null;
    } catch {
      setLocalError("Condition value_json invalid");
      return;
    }
    try {
      await withBusy("cond.create", async () => {
        await createCondMut({
          ruleId: selectedId,
          body: {
            condition_type: condForm.condition_type,
            operator: condForm.operator,
            value_min: condForm.value_min === "" ? null : parseFloat(condForm.value_min),
            value_max: condForm.value_max === "" ? null : parseFloat(condForm.value_max),
            value_text: condForm.value_text || null,
            value_json: valueJson,
          },
        }).unwrap();
      });
    } catch (e) {
      setLocalError(rtkErrorMessage(e));
    }
  }, [selectedId, condForm, createCondMut, withBusy]);

  const deleteCondition = useCallback(
    async (cid: number) => {
      if (selectedId == null) return;
      setLocalError(null);
      try {
        await withBusy(`cond.delete.${cid}`, async () => {
          await deleteCondMut({ condId: cid, ruleId: selectedId }).unwrap();
        });
      } catch (e) {
        setLocalError(rtkErrorMessage(e));
      }
    },
    [selectedId, deleteCondMut, withBusy]
  );

  const runSim = useCallback(async () => {
    setSimResult(null);
    setLocalError(null);
    try {
      let body: unknown;
      try {
        body = JSON.parse(simBody);
      } catch {
        setSimResult(JSON.stringify({ error: "INVALID_JSON", message: "Fix the request JSON and try again." }, null, 2));
        return;
      }
      body = normalizeSimPayload(body);
      await withBusy("sim.run", async () => {
        const text = await simulateMut(body).unwrap();
        setSimResult(text);
      });
    } catch (e) {
      const msg = rtkErrorMessage(e);
      const data =
        e && typeof e === "object" && "data" in e
          ? (e as { data?: unknown }).data
          : undefined;
      let detail = msg;
      if (data && typeof data === "object" && data !== null) {
        const m = (data as { message?: unknown; error?: unknown }).message;
        const er = (data as { message?: unknown; error?: unknown }).error;
        const miss = (data as { missing?: unknown }).missing;
        if (typeof m === "string") detail = er ? `${er}: ${m}` : m;
        else if (typeof er === "string") detail = er;
        if (Array.isArray(miss) && miss.length > 0) {
          detail = `${detail} Missing env: ${miss.join(", ")}.`;
        }
      }
      setSimResult(JSON.stringify({ error: "SIMULATION_FAILED", message: detail }, null, 2));
    }
  }, [simBody, simulateMut, withBusy]);

  const resetSlabForm = useCallback(() => {
    setEditingSlabId(null);
    setSlabForm({
      name: "",
      min_km: "0",
      max_km: "5",
      fee_fixed: "25",
      fee_per_km: "5",
      scope_type: "global",
      is_active: true,
    });
  }, []);

  const saveSlab = useCallback(async () => {
    setLocalError(null);
    const payload = {
      name: slabForm.name || null,
      min_km: slabForm.min_km === "" ? null : parseFloat(slabForm.min_km),
      max_km: slabForm.max_km === "" ? null : parseFloat(slabForm.max_km),
      fee_fixed: parseFloat(slabForm.fee_fixed) || 0,
      fee_per_km: parseFloat(slabForm.fee_per_km) || 0,
      scope_type: slabForm.scope_type,
      is_active: slabForm.is_active,
    };
    try {
      await withBusy(editingSlabId != null ? "slab.update" : "slab.create", async () => {
        if (editingSlabId != null) {
          await updateSlabMut({ id: editingSlabId, body: payload }).unwrap();
        } else {
          await createSlabMut(payload).unwrap();
        }
        resetSlabForm();
      });
    } catch (e) {
      setLocalError(rtkErrorMessage(e));
    }
  }, [slabForm, editingSlabId, createSlabMut, updateSlabMut, resetSlabForm, withBusy]);

  const deleteSlab = useCallback(
    async (id: number) => {
      if (!confirm("Delete slab?")) return;
      setLocalError(null);
      try {
        await withBusy(`slab.delete.${id}`, async () => {
          await deleteSlabMut(id).unwrap();
        });
      } catch (e) {
        setLocalError(rtkErrorMessage(e));
      }
    },
    [deleteSlabMut, withBusy]
  );

  const resetPackForm = useCallback(() => {
    setEditingPackId(null);
    setPackForm({
      name: "",
      min_cart: "0",
      max_cart: "",
      fee_fixed: "10",
      fee_per_addon_qty: "5",
      scope_type: "global",
      is_active: true,
    });
  }, []);

  const savePack = useCallback(async () => {
    setLocalError(null);
    const payload = {
      name: packForm.name || null,
      min_cart: packForm.min_cart === "" ? null : parseFloat(packForm.min_cart),
      max_cart: packForm.max_cart.trim() === "" ? null : parseFloat(packForm.max_cart),
      fee_fixed: parseFloat(packForm.fee_fixed) || 0,
      fee_per_addon_qty: parseFloat(packForm.fee_per_addon_qty) || 0,
      scope_type: packForm.scope_type,
      is_active: packForm.is_active,
    };
    try {
      await withBusy(editingPackId != null ? "pack.update" : "pack.create", async () => {
        if (editingPackId != null) {
          await updatePackMut({ id: editingPackId, body: payload }).unwrap();
        } else {
          await createPackMut(payload).unwrap();
        }
        resetPackForm();
      });
    } catch (e) {
      setLocalError(rtkErrorMessage(e));
    }
  }, [packForm, editingPackId, createPackMut, updatePackMut, resetPackForm, withBusy]);

  const deletePack = useCallback(
    async (id: number) => {
      if (!confirm("Delete packaging slab?")) return;
      setLocalError(null);
      try {
        await withBusy(`pack.delete.${id}`, async () => {
          await deletePackMut(id).unwrap();
        });
      } catch (e) {
        setLocalError(rtkErrorMessage(e));
      }
    },
    [deletePackMut, withBusy]
  );

  const resetTaxForm = useCallback(() => {
    setEditingTaxId(null);
    setTaxPriorityTouched(false);
    setTaxForm({
      name: "GST",
      rate: "0.05",
      applicable_base: "ITEM_AFTER_DISCOUNT",
      tax_group: "item",
      priority: nextTaxPriority,
      is_active: true,
      is_hidden: false,
      metadata: "",
      service_type: billingService,
    });
  }, [billingService, nextTaxPriority]);

  useEffect(() => {
    if (editingTaxId != null || taxLoading || taxPriorityTouched) return;
    setTaxForm((f) => ({ ...f, priority: nextTaxPriority }));
  }, [editingTaxId, taxLoading, nextTaxPriority, taxPriorityTouched]);

  const setTaxPriorityField = useCallback((value: string) => {
    setTaxPriorityTouched(true);
    setTaxForm((f) => ({ ...f, priority: value }));
  }, []);

  const hydrateTaxForEdit = useCallback((t: BillingAdminTaxRow) => {
    setEditingTaxId(t.id);
    setTaxPriorityTouched(false);
    const st = t.service_type ?? "FOOD";
    setTaxForm({
      name: t.name,
      rate: t.rate,
      applicable_base: t.applicable_base,
      tax_group: t.tax_group ?? "other",
      priority: String(t.priority),
      is_active: t.is_active,
      is_hidden: t.is_hidden,
      metadata: t.metadata != null ? JSON.stringify(t.metadata, null, 2) : "",
      service_type: (["FOOD", "PARCEL", "RIDE", "ALL"].includes(String(st).toUpperCase())
        ? String(st).toUpperCase()
        : "FOOD") as "FOOD" | "PARCEL" | "RIDE" | "ALL",
    });
  }, []);

  const saveTax = useCallback(async () => {
    setLocalError(null);
    let metadata: unknown = null;
    try {
      metadata = taxForm.metadata.trim() ? JSON.parse(taxForm.metadata) : null;
    } catch {
      setLocalError("Tax metadata must be valid JSON or empty");
      return;
    }
    const payload = {
      name: taxForm.name,
      rate: parseFloat(taxForm.rate),
      applicable_base: taxForm.applicable_base,
      tax_group: taxForm.tax_group.trim() === "" ? null : taxForm.tax_group.trim().toLowerCase(),
      priority: parseInt(taxForm.priority, 10) || 0,
      is_active: taxForm.is_active,
      is_hidden: taxForm.is_hidden,
      metadata,
      service_type: taxForm.service_type,
    };
    try {
      await withBusy(editingTaxId != null ? "tax.update" : "tax.create", async () => {
        if (editingTaxId != null) {
          await updateTaxMut({ id: editingTaxId, body: payload }).unwrap();
        } else {
          await createTaxMut(payload).unwrap();
        }
        resetTaxForm();
      });
    } catch (e) {
      setLocalError(rtkErrorMessage(e));
    }
  }, [taxForm, editingTaxId, createTaxMut, updateTaxMut, resetTaxForm, withBusy]);

  const deleteTax = useCallback(
    async (id: number) => {
      if (!confirm("Delete tax config?")) return;
      setLocalError(null);
      try {
        await withBusy(`tax.delete.${id}`, async () => {
          await deleteTaxMut(id).unwrap();
        });
      } catch (e) {
        setLocalError(rtkErrorMessage(e));
      }
    },
    [deleteTaxMut, withBusy]
  );

  /** Recreate missing `billing_pricing_rules` TAX rows for existing `billing_tax_configs`. Returns rows created. */
  const repairTaxSlabs = useCallback(async (): Promise<number> => {
    setLocalError(null);
    return withBusy("tax.repairSlabs", async () => {
      const r = await repairTaxSlabsMut().unwrap();
      return r.created;
    });
  }, [repairTaxSlabsMut, withBusy]);

  const moveTax = useCallback(
    async (idx: number, dir: -1 | 1) => {
      const svc = (t: BillingAdminTaxRow) => String(t.service_type ?? "FOOD").toUpperCase();
      const filtered = [...refTax]
        .filter((t) => svc(t) === billingService || svc(t) === "ALL")
        .sort((a, b) => a.priority - b.priority || a.id - b.id);
      const j = idx + dir;
      if (j < 0 || j >= filtered.length) return;
      const a = filtered[idx]!;
      const b = filtered[j]!;
      const pa = a.priority;
      const pb = b.priority;
      setLocalError(null);
      try {
        await withBusy("tax.reorder", async () => {
          await Promise.all([
            updateTaxMut({ id: a.id, body: { priority: pb } }).unwrap(),
            updateTaxMut({ id: b.id, body: { priority: pa } }).unwrap(),
          ]);
        });
      } catch (e) {
        setLocalError(rtkErrorMessage(e));
      }
    },
    [refTax, billingService, updateTaxMut, withBusy]
  );

  const swapRuleTaxPriority = useCallback(
    async (args: { ruleId: number; rulePriority: number; taxId: number; taxPriority: number }) => {
      const { ruleId, rulePriority, taxId, taxPriority } = args;
      setLocalError(null);
      try {
        await withBusy("rule-tax.reorder", async () => {
          await Promise.all([
            updateRuleMut({ id: ruleId, body: { priority: taxPriority } }).unwrap(),
            updateTaxMut({ id: taxId, body: { priority: rulePriority } }).unwrap(),
          ]);
        });
      } catch (e) {
        setLocalError(rtkErrorMessage(e));
        throw e;
      }
    },
    [updateRuleMut, updateTaxMut, withBusy]
  );

  /** Persist full mixed rule+tax order (e.g. after drag-and-drop). */
  const reorderCombinedRows = useCallback(
    async (ordered: Array<{ kind: "rule" | "tax"; id: number }>) => {
      if (ordered.length === 0) return;
      setLocalError(null);
      let payload: ReturnType<typeof normalizeChargeOrderKeys>;
      try {
        payload = normalizeChargeOrderKeys(ordered);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Invalid charge order keys";
        logBillingCharge("reorderCombinedRows", "normalize failed", { message: msg });
        setLocalError(msg);
        throw err;
      }
      logBillingCharge("reorderCombinedRows", "POST /charge-order", {
        n: payload.length,
        keys: payload.map((r) => `${r.kind}:${r.id}`).join(","),
      });
      try {
        await withBusy("combined.reorder", async () => {
          await reorderChargeOrderMut({ ordered: payload }).unwrap();
        });
        logBillingCharge("reorderCombinedRows", "mutation ok", { n: payload.length });
      } catch (e) {
        const msg = rtkErrorMessage(e);
        console.warn("[billing] reorderCombinedRows failed:", msg, e);
        logBillingCharge("reorderCombinedRows", "mutation failed", { err: msg.slice(0, 240) });
        setLocalError(msg);
        throw e;
      }
    },
    [reorderChargeOrderMut, withBusy]
  );

  const resetDiscForm = useCallback(() => {
    setEditingDiscId(null);
    setDiscForm({
      code: "",
      discount_type: "PERCENTAGE",
      value_numeric: "10",
      max_discount_cap: "",
      usage_limit: "",
      is_active: true,
      is_hidden: false,
      metadata: "",
    });
  }, []);

  const resetRateCardForm = useCallback(() => {
    setEditingRateCardId(null);
    setRateCardForm({
      name: "",
      service_type: "FOOD",
      city_name: "",
      time_slot: "ALL",
      base_fare: "0",
      per_km_rate: "0",
      surge_multiplier: "1",
      min_km: "",
      max_km: "",
      free_delivery_above: "",
      priority: "0",
      is_active: true,
      metadata: "",
    });
  }, []);

  const resetPlatformOfferForm = useCallback(() => {
    setEditingPlatformOfferId(null);
    setPlatformOfferForm({
      name: "",
      service_type: "FOOD",
      discount_type: "PERCENTAGE",
      value_numeric: "",
      delivery_discount_type: "",
      delivery_discount_value: "",
      priority: "0",
      is_active: true,
      is_hidden: false,
      city: "",
      min_order_value: "",
      user_segment: "ALL",
      metadata: "",
    });
  }, []);

  const saveDisc = useCallback(async () => {
    setLocalError(null);
    const rawVal = discForm.value_numeric.trim();
    const valueNumeric = rawVal === "" ? null : parseFloat(rawVal);
    if (valueNumeric != null && Number.isNaN(valueNumeric)) {
      setLocalError("Coupon value must be a valid number");
      return;
    }
    const rawCap = discForm.max_discount_cap.trim();
    const maxCap = rawCap === "" ? null : parseFloat(rawCap);
    if (maxCap != null && Number.isNaN(maxCap)) {
      setLocalError("Coupon max cap must be a valid number or empty");
      return;
    }
    const rawLimit = discForm.usage_limit.trim();
    const usageLimit = rawLimit === "" ? null : parseInt(rawLimit, 10);
    if (usageLimit != null && (!Number.isInteger(usageLimit) || usageLimit < 0)) {
      setLocalError("Coupon usage limit must be a non-negative integer or empty");
      return;
    }
    let metadata: unknown = null;
    try {
      metadata = discForm.metadata.trim() ? JSON.parse(discForm.metadata) : null;
    } catch {
      setLocalError("Coupon metadata must be valid JSON or empty");
      return;
    }
    const payload = {
      code: discForm.code.trim(),
      discount_type: discForm.discount_type,
      value_numeric: valueNumeric,
      max_discount_cap: maxCap,
      usage_limit: usageLimit,
      is_active: discForm.is_active,
      is_hidden: discForm.is_hidden,
      metadata,
    };
    try {
      await withBusy(editingDiscId != null ? "disc.update" : "disc.create", async () => {
        if (editingDiscId != null) {
          await updateDiscMut({ id: editingDiscId, body: payload }).unwrap();
        } else {
          await createDiscMut(payload).unwrap();
        }
        resetDiscForm();
      });
    } catch (e) {
      setLocalError(rtkErrorMessage(e));
    }
  }, [discForm, editingDiscId, createDiscMut, updateDiscMut, resetDiscForm, withBusy]);

  const deleteDisc = useCallback(
    async (id: number) => {
      if (!confirm("Delete coupon?")) return;
      setLocalError(null);
      try {
        await withBusy(`disc.delete.${id}`, async () => {
          await deleteDiscMut(id).unwrap();
        });
      } catch (e) {
        setLocalError(rtkErrorMessage(e));
      }
    },
    [deleteDiscMut, withBusy]
  );

  const hydrateRateCardForEdit = useCallback((c: BillingAdminRateCardRow) => {
    setEditingRateCardId(c.id);
    setRateCardForm({
      name: c.name ?? "",
      service_type: (c.service_type ?? "FOOD").toUpperCase() as "FOOD" | "PARCEL" | "RIDE" | "ALL",
      city_name: c.city_name ?? "",
      time_slot: c.time_slot ?? "ALL",
      base_fare: c.base_fare ?? "0",
      per_km_rate: c.per_km_rate ?? "0",
      surge_multiplier: c.surge_multiplier ?? "1",
      min_km: c.min_km ?? "",
      max_km: c.max_km ?? "",
      free_delivery_above: c.free_delivery_above ?? "",
      priority: String(c.priority ?? 0),
      is_active: c.is_active ?? true,
      metadata: c.metadata != null ? JSON.stringify(c.metadata, null, 2) : "",
    });
  }, []);

  const saveRateCard = useCallback(async () => {
    setLocalError(null);
    let metadata: unknown = null;
    try {
      metadata = rateCardForm.metadata.trim() ? JSON.parse(rateCardForm.metadata) : null;
    } catch {
      setLocalError("Rate card metadata must be valid JSON or empty");
      return;
    }
    const payload = {
      name: rateCardForm.name || null,
      service_type: rateCardForm.service_type,
      city_name: rateCardForm.city_name.trim() ? rateCardForm.city_name.trim() : null,
      time_slot: rateCardForm.time_slot.trim() ? rateCardForm.time_slot.trim() : null,
      base_fare: parseFloat(rateCardForm.base_fare) || 0,
      per_km_rate: parseFloat(rateCardForm.per_km_rate) || 0,
      surge_multiplier: parseFloat(rateCardForm.surge_multiplier) || 1,
      min_km: rateCardForm.min_km.trim() === "" ? null : parseFloat(rateCardForm.min_km),
      max_km: rateCardForm.max_km.trim() === "" ? null : parseFloat(rateCardForm.max_km),
      free_delivery_above:
        rateCardForm.free_delivery_above.trim() === "" ? null : parseFloat(rateCardForm.free_delivery_above),
      priority: parseInt(rateCardForm.priority, 10) || 0,
      is_active: rateCardForm.is_active,
      metadata,
    };
    try {
      await withBusy(editingRateCardId != null ? "rateCard.update" : "rateCard.create", async () => {
        if (editingRateCardId != null) {
          await updateRateCardMut({ id: editingRateCardId, body: payload }).unwrap();
        } else {
          await createRateCardMut(payload).unwrap();
        }
        resetRateCardForm();
      });
    } catch (e) {
      setLocalError(rtkErrorMessage(e));
    }
  }, [
    rateCardForm,
    editingRateCardId,
    updateRateCardMut,
    createRateCardMut,
    resetRateCardForm,
    withBusy,
  ]);

  const deleteRateCard = useCallback(
    async (id: number) => {
      if (!confirm("Delete delivery rate card?")) return;
      setLocalError(null);
      try {
        await withBusy(`rateCard.delete.${id}`, async () => {
          await deleteRateCardMut(id).unwrap();
        });
        if (editingRateCardId === id) resetRateCardForm();
      } catch (e) {
        setLocalError(rtkErrorMessage(e));
      }
    },
    [deleteRateCardMut, editingRateCardId, resetRateCardForm, withBusy]
  );

  const hydratePlatformOfferForEdit = useCallback((o: BillingAdminPlatformOfferRow) => {
    setEditingPlatformOfferId(o.id);
    const cond =
      o.conditions && typeof o.conditions === "object" ? (o.conditions as Record<string, unknown>) : {};
    setPlatformOfferForm({
      name: o.name ?? "",
      service_type: (o.service_type ?? "FOOD").toUpperCase() as "FOOD" | "PARCEL" | "RIDE" | "ALL",
      discount_type: o.discount_type ?? "PERCENTAGE",
      value_numeric: o.value_numeric ?? "",
      delivery_discount_type: o.delivery_discount_type ?? "",
      delivery_discount_value: o.delivery_discount_value ?? "",
      priority: String(o.priority ?? 0),
      is_active: o.is_active ?? true,
      is_hidden: o.is_hidden ?? false,
      city: typeof cond.city === "string" ? cond.city : "",
      min_order_value: cond.min_order_value != null ? String(cond.min_order_value) : "",
      user_segment: (typeof cond.user_segment === "string" ? cond.user_segment : "ALL") as
        | "NEW"
        | "EXISTING"
        | "ALL",
      metadata: o.metadata != null ? JSON.stringify(o.metadata, null, 2) : "",
    });
  }, []);

  const savePlatformOffer = useCallback(async () => {
    setLocalError(null);
    let metadata: unknown = null;
    try {
      metadata = platformOfferForm.metadata.trim() ? JSON.parse(platformOfferForm.metadata) : null;
    } catch {
      setLocalError("Offer metadata must be valid JSON or empty");
      return;
    }
    const conditions: Record<string, unknown> = {};
    if (platformOfferForm.city.trim()) conditions.city = platformOfferForm.city.trim();
    if (platformOfferForm.min_order_value.trim()) {
      const mv = parseFloat(platformOfferForm.min_order_value);
      if (Number.isFinite(mv)) conditions.min_order_value = mv;
    }
    if (platformOfferForm.user_segment !== "ALL") conditions.user_segment = platformOfferForm.user_segment;

    const payload = {
      name: platformOfferForm.name || null,
      service_type: platformOfferForm.service_type,
      discount_type: platformOfferForm.discount_type,
      value_numeric:
        platformOfferForm.value_numeric.trim() === "" ? null : parseFloat(platformOfferForm.value_numeric),
      delivery_discount_type:
        platformOfferForm.delivery_discount_type.trim() === "" ? null : platformOfferForm.delivery_discount_type,
      delivery_discount_value:
        platformOfferForm.delivery_discount_value.trim() === ""
          ? null
          : parseFloat(platformOfferForm.delivery_discount_value),
      priority: parseInt(platformOfferForm.priority, 10) || 0,
      is_active: platformOfferForm.is_active,
      is_hidden: platformOfferForm.is_hidden,
      conditions,
      metadata,
    };
    try {
      await withBusy(editingPlatformOfferId != null ? "platOffer.update" : "platOffer.create", async () => {
        if (editingPlatformOfferId != null) {
          await updatePlatformOfferMut({ id: editingPlatformOfferId, body: payload }).unwrap();
        } else {
          await createPlatformOfferMut(payload).unwrap();
        }
        resetPlatformOfferForm();
      });
    } catch (e) {
      setLocalError(rtkErrorMessage(e));
    }
  }, [
    platformOfferForm,
    editingPlatformOfferId,
    updatePlatformOfferMut,
    createPlatformOfferMut,
    resetPlatformOfferForm,
    withBusy,
  ]);

  const deletePlatformOffer = useCallback(
    async (id: number) => {
      if (!confirm("Delete platform offer?")) return;
      setLocalError(null);
      try {
        await withBusy(`platOffer.delete.${id}`, async () => {
          await deletePlatformOfferMut(id).unwrap();
        });
        if (editingPlatformOfferId === id) resetPlatformOfferForm();
      } catch (e) {
        setLocalError(rtkErrorMessage(e));
      }
    },
    [deletePlatformOfferMut, editingPlatformOfferId, resetPlatformOfferForm, withBusy]
  );

  const loadMerchantOverride = useCallback(async () => {
    const id = parseInt(ovStoreId, 10);
    if (!Number.isInteger(id) || id < 1) {
      setLocalError("Merchant store id must be a positive integer");
      return;
    }
    setLocalError(null);
    try {
      const data = await withBusy("override.load", async () => {
        return await triggerLoadOverride(id).unwrap();
      });
      const ov = data?.overrides;
      setOvJson(ov != null ? JSON.stringify(ov, null, 2) : `{\n  "disabledRuleIds": []\n}`);
    } catch (e) {
      setLocalError(rtkErrorMessage(e));
    }
  }, [ovStoreId, triggerLoadOverride, withBusy]);

  const saveOverride = useCallback(async () => {
    const id = parseInt(ovStoreId, 10);
    if (!Number.isInteger(id) || id < 1) {
      setLocalError("Merchant store id must be a positive integer");
      return;
    }
    let overrides: Record<string, unknown>;
    try {
      overrides = JSON.parse(ovJson) as Record<string, unknown>;
    } catch {
      setLocalError("Overrides must be valid JSON");
      return;
    }
    setLocalError(null);
    try {
      await withBusy("override.save", async () => {
        await putOverrideMut({ merchant_store_id: id, overrides }).unwrap();
      });
    } catch (e) {
      setLocalError(rtkErrorMessage(e));
    }
  }, [ovStoreId, ovJson, putOverrideMut, withBusy]);

  const clearLocalError = useCallback(() => setLocalError(null), []);

  return {
    isSuperAdmin,
    permLoading,

    billingService,
    setBillingService,

    rules,
    listLoading,
    rulesListLoading,
    taxListLoading,
    nextRulePriority,
    nextTaxPriority,
    rulesUpdating,
    selectedId,
    setSelectedId,
    conditions,
    conditionsFetching,

    refSlabs: refSlabs as BillingAdminSlabRow[],
    refPackagingSlabs: refPackagingSlabs as BillingAdminPackagingSlabRow[],
    refTax: refTax as BillingAdminTaxRow[],
    refDiscounts: refDiscounts as BillingAdminDiscountRow[],
    refRateCards: refRateCards as BillingAdminRateCardRow[],
    refPlatformOffers: refPlatformOffers as BillingAdminPlatformOfferRow[],

    bannerError,
    localError,
    clearLocalError,

    editingRuleId,
    setEditingRuleId,
    editingSlabId,
    setEditingSlabId,
    editingPackId,
    setEditingPackId,
    editingTaxId,
    setEditingTaxId,
    editingDiscId,
    setEditingDiscId,
    editingRateCardId,
    setEditingRateCardId,
    editingPlatformOfferId,
    setEditingPlatformOfferId,

    slabForm,
    setSlabForm,
    packForm,
    setPackForm,
    taxForm,
    setTaxForm,
    discForm,
    setDiscForm,
    rateCardForm,
    setRateCardForm,
    platformOfferForm,
    setPlatformOfferForm,
    ovStoreId,
    setOvStoreId,
    ovJson,
    setOvJson,

    form,
    setForm,
    setRulePriorityField,
    setTaxPriorityField,
    condForm,
    setCondForm,

    simBody,
    setSimBody,
    simResult,
    simBusy,
    busy,

    // RTK-level busy flags (useful when action functions aren’t used)
    mutationLoading: {
      createRule: createRuleState.isLoading,
      updateRule: updateRuleState.isLoading,
      deleteRule: deleteRuleState.isLoading,
      reorderRules: busy["rule.reorder"] ?? false,
      reorderCombined: busy["combined.reorder"] ?? false,
      createCondition: createCondState.isLoading,
      deleteCondition: deleteCondState.isLoading,
      createSlab: createSlabState.isLoading,
      updateSlab: updateSlabState.isLoading,
      deleteSlab: deleteSlabState.isLoading,
      createPack: createPackState.isLoading,
      updatePack: updatePackState.isLoading,
      deletePack: deletePackState.isLoading,
      createTax: createTaxState.isLoading,
      updateTax: updateTaxState.isLoading,
      deleteTax: deleteTaxState.isLoading,
      repairTaxSlabs: busy["tax.repairSlabs"] ?? false,
      createDisc: createDiscState.isLoading,
      updateDisc: updateDiscState.isLoading,
      deleteDisc: deleteDiscState.isLoading,
      createRateCard: createRateCardState.isLoading,
      updateRateCard: updateRateCardState.isLoading,
      deleteRateCard: deleteRateCardState.isLoading,
      createPlatformOffer: createPlatformOfferState.isLoading,
      updatePlatformOffer: updatePlatformOfferState.isLoading,
      deletePlatformOffer: deletePlatformOfferState.isLoading,
      loadOverride: loadOverrideState.isLoading,
      saveOverride: putOverrideState.isLoading,
      simulate: simulateState.isLoading,
    },

    resetRuleForm,
    hydrateRuleForEdit,
    saveRule,
    toggleRule,
    moveRule,
    reorderRules,
    deleteRule,
    addCondition,
    deleteCondition,
    runSim,

    resetSlabForm,
    saveSlab,
    deleteSlab,
    resetPackForm,
    savePack,
    deletePack,
    resetTaxForm,
    hydrateTaxForEdit,
    saveTax,
    deleteTax,
    repairTaxSlabs,
    moveTax,
    swapRuleTaxPriority,
    reorderCombinedRows,
    resetDiscForm,
    saveDisc,
    deleteDisc,
    resetRateCardForm,
    hydrateRateCardForEdit,
    saveRateCard,
    deleteRateCard,
    resetPlatformOfferForm,
    hydratePlatformOfferForEdit,
    savePlatformOffer,
    deletePlatformOffer,
    loadMerchantOverride,
    saveOverride,
  };
}
