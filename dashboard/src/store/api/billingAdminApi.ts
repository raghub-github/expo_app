import { baseApi } from "./baseApi";

export type BillingAdminRuleRow = {
  id: number;
  name: string | null;
  type: string;
  calculation_type: string;
  value_numeric: string | null;
  value_json: unknown;
  priority: number;
  is_active: boolean;
  stackable: boolean;
  applies_to: string;
  offer_owner: string;
  is_hidden: boolean;
  metadata: unknown;
  service_type: string;
  discount_applies_on: string;
  charge_subtype: string | null;
};

export type BillingAdminConditionRow = {
  id: number;
  rule_id: number;
  condition_type: string;
  operator: string;
  value_min: string | null;
  value_max: string | null;
  value_text: string | null;
  value_json: unknown;
};

export type BillingAdminSlabRow = {
  id: number;
  name: string | null;
  min_km: string | null;
  max_km: string | null;
  fee_fixed: string;
  fee_per_km: string;
  scope_type: string;
  scope_id: string | null;
  priority: number;
  metadata: unknown;
  is_active: boolean;
};

export type BillingAdminPackagingSlabRow = {
  id: number;
  name: string | null;
  min_cart: string | null;
  max_cart: string | null;
  fee_fixed: string;
  fee_per_addon_qty: string;
  scope_type: string;
  scope_id: string | null;
  priority: number;
  metadata: unknown;
  is_active: boolean;
};

export type BillingAdminTaxRow = {
  id: number;
  name: string;
  rate: string;
  applicable_base: string;
  tax_group: string | null;
  priority: number;
  is_active: boolean;
  is_hidden: boolean;
  service_type: string;
  metadata: unknown;
  /** No billing_pricing_rules TAX row (e.g. slab deleted in SQL). Not in pipeline until repaired or saved. */
  slab_missing?: boolean;
  pricing_rule_id?: number | null;
};

export type BillingAdminDiscountRow = {
  id: number;
  code: string;
  discount_type: string;
  value_numeric: string | null;
  max_discount_cap: string | null;
  usage_limit: number | null;
  used_count: number;
  is_active: boolean;
  is_hidden: boolean;
  metadata: unknown;
};

function errMsg(body: unknown): string {
  if (body && typeof body === "object" && "error" in body) {
    const e = (body as { error?: unknown }).error;
    if (typeof e === "string") return e;
  }
  return "Request failed";
}

const billingTags = {
  rulesList: { type: "Billing" as const, id: "RULES" },
  reference: { type: "Billing" as const, id: "REFERENCE" },
  taxConfigs: { type: "Billing" as const, id: "TAX_CONFIGS" },
  cond: (ruleId: number) => ({ type: "Billing" as const, id: `COND_${ruleId}` }),
};

export type CreateBillingRuleBody = {
  name?: string | null;
  type: string;
  calculation_type: string;
  value_numeric?: number | null;
  value_json?: unknown;
  priority?: number;
  is_active?: boolean;
  stackable?: boolean;
  applies_to?: string;
  offer_owner?: string;
  is_hidden?: boolean;
  metadata?: unknown;
  service_type?: string;
  discount_applies_on?: string;
  charge_subtype?: string | null;
};

export type BillingAdminRateCardRow = {
  id: number;
  name: string | null;
  service_type: string;
  city_name: string | null;
  time_slot: string | null;
  base_fare: string;
  per_km_rate: string;
  surge_multiplier: string;
  min_km: string | null;
  max_km: string | null;
  free_delivery_above: string | null;
  priority: number;
  is_active: boolean;
  metadata: unknown;
};

export type BillingAdminPlatformOfferRow = {
  id: number;
  name: string | null;
  service_type: string;
  offer_kind: string;
  funding_mode: string;
  platform_share_pct: string;
  merchant_share_pct: string;
  max_platform_contribution: string | null;
  max_merchant_contribution: string | null;
  target_scope: string;
  geo_level: string | null;
  geo_ids: unknown;
  merchant_ids: unknown;
  customer_segment: string;
  min_order_amount: string | null;
  max_discount_amount: string | null;
  buy_qty: number | null;
  get_qty: number | null;
  is_stackable: boolean;
  exclusion_group: string | null;
  starts_at: string | null;
  ends_at: string | null;
  budget_total: string | null;
  budget_used: string | null;
  discount_type: string;
  value_numeric: string | null;
  delivery_discount_type: string | null;
  delivery_discount_value: string | null;
  priority: number;
  is_active: boolean;
  is_hidden: boolean;
  conditions: unknown;
  metadata: unknown;
};

export type PatchBillingRuleBody = Partial<CreateBillingRuleBody> & Record<string, unknown>;

export const billingAdminApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getBillingRules: build.query<BillingAdminRuleRow[], void>({
      query: () => "/super-admin/billing/rules",
      transformResponse: (res: { rules?: BillingAdminRuleRow[]; error?: string }) => {
        if (res?.error) throw new Error(res.error);
        return res.rules ?? [];
      },
      providesTags: [billingTags.rulesList],
      keepUnusedDataFor: 120,
    }),

    getBillingConditions: build.query<BillingAdminConditionRow[], number>({
      query: (ruleId) => `/super-admin/billing/rules/${ruleId}/conditions`,
      transformResponse: (res: { conditions?: BillingAdminConditionRow[]; error?: string }) => {
        if (res?.error) throw new Error(res.error);
        return res.conditions ?? [];
      },
      providesTags: (_result, _err, ruleId) => [billingTags.cond(ruleId)],
    }),

    createBillingRule: build.mutation<BillingAdminRuleRow, CreateBillingRuleBody>({
      query: (body) => ({ url: "/super-admin/billing/rules", method: "POST", body }),
      transformResponse: (res: { rule?: BillingAdminRuleRow; error?: string }) => {
        if (!res?.rule) throw new Error(res?.error ?? "Failed to create rule");
        return res.rule;
      },
      invalidatesTags: [billingTags.rulesList],
    }),

    updateBillingRule: build.mutation<
      BillingAdminRuleRow,
      { id: number; body: PatchBillingRuleBody }
    >({
      query: ({ id, body }) => ({
        url: `/super-admin/billing/rules/${id}`,
        method: "PATCH",
        body,
      }),
      transformResponse: (res: { rule?: BillingAdminRuleRow; error?: string }) => {
        if (!res?.rule) throw new Error(res?.error ?? "Failed to update rule");
        return res.rule;
      },
      invalidatesTags: [billingTags.rulesList],
      async onQueryStarted({ id, body }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          billingAdminApi.util.updateQueryData("getBillingRules", undefined, (draft) => {
            const row = draft.find((r) => r.id === id);
            if (!row) return;
            if (typeof body.priority === "number") row.priority = body.priority;
            if (typeof body.is_active === "boolean") row.is_active = body.is_active;
            if (typeof body.is_hidden === "boolean") row.is_hidden = body.is_hidden;
            if (body.name !== undefined) row.name = body.name;
            if (body.type !== undefined) row.type = body.type;
            if (body.service_type !== undefined) row.service_type = body.service_type;
            if (body.discount_applies_on !== undefined) row.discount_applies_on = String(body.discount_applies_on);
            if (body.charge_subtype !== undefined)
              row.charge_subtype = body.charge_subtype === null || body.charge_subtype === undefined ? null : String(body.charge_subtype);
            if (body.calculation_type !== undefined) row.calculation_type = String(body.calculation_type);
            if (body.value_numeric !== undefined)
              row.value_numeric = body.value_numeric === null || body.value_numeric === undefined ? null : String(body.value_numeric);
            if (body.value_json !== undefined) row.value_json = body.value_json;
            if (body.stackable !== undefined) row.stackable = Boolean(body.stackable);
            if (body.applies_to !== undefined) row.applies_to = String(body.applies_to);
            if (body.offer_owner !== undefined) row.offer_owner = String(body.offer_owner);
            if (body.metadata !== undefined) row.metadata = body.metadata;
          })
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
    }),

    deleteBillingRule: build.mutation<void, number>({
      query: (id) => ({ url: `/super-admin/billing/rules/${id}`, method: "DELETE" }),
      transformResponse: (res: { ok?: boolean; error?: string }, _m, id) => {
        if (res && "error" in res && res.error) throw new Error(res.error);
        void id;
      },
      invalidatesTags: (_r, _e, id) => [billingTags.rulesList, billingTags.cond(id)],
    }),

    /** Single transaction: rules + tax slabs share global priorities (avoids per-row unique-priority collisions). */
    reorderBillingChargeOrder: build.mutation<void, { ordered: { kind: "rule" | "tax"; id: number }[] }>({
      query: (body) => ({ url: "/super-admin/billing/charge-order", method: "POST", body }),
      transformResponse: (res: { ok?: boolean; error?: string }) => {
        if (res?.error) throw new Error(res.error);
      },
      invalidatesTags: [billingTags.rulesList, billingTags.taxConfigs],
    }),

    patchBillingPriorities: build.mutation<void, { orderedIds: number[] }>({
      query: (body) => ({ url: "/super-admin/billing/priorities", method: "PATCH", body }),
      transformResponse: (res: { ok?: boolean; error?: string }) => {
        if (res?.error) throw new Error(res.error);
      },
      async onQueryStarted({ orderedIds }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          billingAdminApi.util.updateQueryData("getBillingRules", undefined, (draft) => {
            const prev = draft.slice();
            const byId = new Map(prev.map((r) => [r.id, r]));
            const next: BillingAdminRuleRow[] = [];
            for (let i = 0; i < orderedIds.length; i++) {
              const id = orderedIds[i];
              if (id == null) continue;
              const row = byId.get(id);
              if (row) next.push({ ...row, priority: (i + 1) * 10 });
            }
            for (const r of prev) {
              if (!orderedIds.includes(r.id)) next.push(r);
            }
            draft.length = 0;
            draft.push(...next.sort((a, b) => a.priority - b.priority || a.id - b.id));
          })
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
    }),

    createBillingCondition: build.mutation<
      BillingAdminConditionRow,
      {
        ruleId: number;
        body: {
          condition_type: string;
          operator: string;
          value_min?: number | null;
          value_max?: number | null;
          value_text?: string | null;
          value_json?: unknown;
        };
      }
    >({
      query: ({ ruleId, body }) => ({
        url: `/super-admin/billing/rules/${ruleId}/conditions`,
        method: "POST",
        body,
      }),
      transformResponse: (res: { condition?: BillingAdminConditionRow; error?: string }) => {
        if (!res?.condition) throw new Error(res?.error ?? "Failed to add condition");
        return res.condition;
      },
      invalidatesTags: (_r, _e, { ruleId }) => [billingTags.cond(ruleId)],
    }),

    deleteBillingCondition: build.mutation<void, { condId: number; ruleId: number }>({
      query: ({ condId }) => ({
        url: `/super-admin/billing/conditions/${condId}`,
        method: "DELETE",
      }),
      transformResponse: (res: { ok?: boolean; error?: string }) => {
        if (res?.error) throw new Error(res.error);
      },
      invalidatesTags: (_r, _e, { ruleId }) => [billingTags.cond(ruleId)],
    }),

    getBillingSlabs: build.query<BillingAdminSlabRow[], void>({
      query: () => "/super-admin/billing/slabs",
      transformResponse: (res: { slabs?: BillingAdminSlabRow[] }) => res.slabs ?? [],
      providesTags: [billingTags.reference],
    }),

    createBillingSlab: build.mutation<
      BillingAdminSlabRow,
      {
        name?: string | null;
        min_km?: number | null;
        max_km?: number | null;
        fee_fixed?: number;
        fee_per_km?: number;
        scope_type?: string;
        is_active?: boolean;
      }
    >({
      query: (body) => ({ url: "/super-admin/billing/slabs", method: "POST", body }),
      transformResponse: (res: { slab?: BillingAdminSlabRow; error?: string }) => {
        if (!res?.slab) throw new Error(res?.error ?? errMsg(res));
        return res.slab;
      },
      invalidatesTags: [billingTags.reference],
    }),

    updateBillingSlab: build.mutation<
      BillingAdminSlabRow,
      { id: number; body: Record<string, unknown> }
    >({
      query: ({ id, body }) => ({
        url: `/super-admin/billing/slabs/${id}`,
        method: "PATCH",
        body,
      }),
      transformResponse: (res: { slab?: BillingAdminSlabRow; error?: string }) => {
        if (!res?.slab) throw new Error(res?.error ?? errMsg(res));
        return res.slab;
      },
      invalidatesTags: [billingTags.reference],
    }),

    deleteBillingSlab: build.mutation<void, number>({
      query: (id) => ({ url: `/super-admin/billing/slabs/${id}`, method: "DELETE" }),
      transformResponse: (res: { error?: string }) => {
        if (res?.error) throw new Error(res.error);
      },
      invalidatesTags: [billingTags.reference],
    }),

    getBillingPackagingSlabs: build.query<BillingAdminPackagingSlabRow[], void>({
      query: () => "/super-admin/billing/packaging-slabs",
      transformResponse: (res: { slabs?: BillingAdminPackagingSlabRow[] }) => res.slabs ?? [],
      providesTags: [billingTags.reference],
    }),

    createBillingPackagingSlab: build.mutation<
      BillingAdminPackagingSlabRow,
      {
        name?: string | null;
        min_cart?: number | null;
        max_cart?: number | null;
        fee_fixed?: number;
        fee_per_addon_qty?: number;
        scope_type?: string;
        is_active?: boolean;
      }
    >({
      query: (body) => ({ url: "/super-admin/billing/packaging-slabs", method: "POST", body }),
      transformResponse: (res: { slab?: BillingAdminPackagingSlabRow; error?: string }) => {
        if (!res?.slab) throw new Error(res?.error ?? errMsg(res));
        return res.slab;
      },
      invalidatesTags: [billingTags.reference],
    }),

    updateBillingPackagingSlab: build.mutation<
      BillingAdminPackagingSlabRow,
      { id: number; body: Record<string, unknown> }
    >({
      query: ({ id, body }) => ({
        url: `/super-admin/billing/packaging-slabs/${id}`,
        method: "PATCH",
        body,
      }),
      transformResponse: (res: { slab?: BillingAdminPackagingSlabRow; error?: string }) => {
        if (!res?.slab) throw new Error(res?.error ?? errMsg(res));
        return res.slab;
      },
      invalidatesTags: [billingTags.reference],
    }),

    deleteBillingPackagingSlab: build.mutation<void, number>({
      query: (id) => ({ url: `/super-admin/billing/packaging-slabs/${id}`, method: "DELETE" }),
      transformResponse: (res: { error?: string }) => {
        if (res?.error) throw new Error(res.error);
      },
      invalidatesTags: [billingTags.reference],
    }),

    getBillingTaxConfigs: build.query<BillingAdminTaxRow[], void>({
      query: () => "/super-admin/billing/tax-configs",
      transformResponse: (res: { taxConfigs?: BillingAdminTaxRow[] }) => res.taxConfigs ?? [],
      /** taxConfigs must match invalidation on tax mutations; reference keeps parity with other billing ref data */
      providesTags: [billingTags.reference, billingTags.taxConfigs],
    }),

    createBillingTaxConfig: build.mutation<
      BillingAdminTaxRow,
      {
        name: string;
        rate: number;
        applicable_base: string;
        priority?: number;
        is_active?: boolean;
        is_hidden?: boolean;
        service_type?: string;
        metadata?: unknown;
      }
    >({
      query: (body) => ({ url: "/super-admin/billing/tax-configs", method: "POST", body }),
      transformResponse: (res: { taxConfig?: BillingAdminTaxRow; error?: string }) => {
        if (!res?.taxConfig) throw new Error(res?.error ?? errMsg(res));
        return res.taxConfig;
      },
      invalidatesTags: [billingTags.reference, billingTags.taxConfigs],
    }),

    updateBillingTaxConfig: build.mutation<
      BillingAdminTaxRow,
      { id: number; body: Record<string, unknown> }
    >({
      query: ({ id, body }) => ({
        url: `/super-admin/billing/tax-configs/${id}`,
        method: "PATCH",
        body,
      }),
      transformResponse: (res: { taxConfig?: BillingAdminTaxRow; error?: string }) => {
        if (!res?.taxConfig) throw new Error(res?.error ?? errMsg(res));
        return res.taxConfig;
      },
      invalidatesTags: [billingTags.reference, billingTags.taxConfigs],
      async onQueryStarted({ id, body }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          billingAdminApi.util.updateQueryData("getBillingTaxConfigs", undefined, (draft) => {
            const row = draft.find((t) => t.id === id);
            if (!row) return;
            if (typeof body.priority === "number") row.priority = body.priority;
            if (typeof body.is_active === "boolean") row.is_active = body.is_active;
            if (typeof body.is_hidden === "boolean") row.is_hidden = body.is_hidden;
            if (typeof body.name === "string") row.name = body.name;
            if (typeof body.rate === "number") row.rate = String(body.rate);
            if (typeof body.applicable_base === "string") row.applicable_base = body.applicable_base;
            if (typeof body.service_type === "string") row.service_type = body.service_type;
            if (body.tax_group !== undefined)
              row.tax_group = body.tax_group === null || body.tax_group === undefined ? null : String(body.tax_group);
            if (body.metadata !== undefined) row.metadata = body.metadata;
          })
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
    }),

    deleteBillingTaxConfig: build.mutation<void, number>({
      query: (id) => ({ url: `/super-admin/billing/tax-configs/${id}`, method: "DELETE" }),
      transformResponse: (res: { error?: string }) => {
        if (res?.error) throw new Error(res.error);
      },
      invalidatesTags: [billingTags.reference, billingTags.taxConfigs],
    }),

    repairBillingTaxSlabs: build.mutation<{ created: number }, void>({
      query: () => ({
        url: "/super-admin/billing/tax-configs/repair-slabs",
        method: "POST",
        body: {},
      }),
      transformResponse: (res: { created?: number; error?: string }) => {
        if (res?.error) throw new Error(res.error);
        if (typeof res?.created !== "number") throw new Error("Invalid repair response");
        return { created: res.created };
      },
      invalidatesTags: [billingTags.reference, billingTags.taxConfigs, billingTags.rulesList],
    }),

    getBillingDiscounts: build.query<BillingAdminDiscountRow[], void>({
      query: () => "/super-admin/billing/discounts",
      transformResponse: (res: { discounts?: BillingAdminDiscountRow[] }) => res.discounts ?? [],
      providesTags: [billingTags.reference],
    }),

    createBillingDiscount: build.mutation<
      BillingAdminDiscountRow,
      { code: string; discount_type: string; value_numeric?: number | null; is_active?: boolean }
    >({
      query: (body) => ({ url: "/super-admin/billing/discounts", method: "POST", body }),
      transformResponse: (res: { discount?: BillingAdminDiscountRow; error?: string }) => {
        if (!res?.discount) throw new Error(res?.error ?? errMsg(res));
        return res.discount;
      },
      invalidatesTags: [billingTags.reference],
    }),

    updateBillingDiscount: build.mutation<
      BillingAdminDiscountRow,
      { id: number; body: Record<string, unknown> }
    >({
      query: ({ id, body }) => ({
        url: `/super-admin/billing/discounts/${id}`,
        method: "PATCH",
        body,
      }),
      transformResponse: (res: { discount?: BillingAdminDiscountRow; error?: string }) => {
        if (!res?.discount) throw new Error(res?.error ?? errMsg(res));
        return res.discount;
      },
      invalidatesTags: [billingTags.reference],
    }),

    deleteBillingDiscount: build.mutation<void, number>({
      query: (id) => ({ url: `/super-admin/billing/discounts/${id}`, method: "DELETE" }),
      transformResponse: (res: { error?: string } | undefined) => {
        if (res?.error) throw new Error(res.error);
      },
      invalidatesTags: [billingTags.reference],
    }),

    getMerchantBillingOverride: build.query<{ overrides: unknown } | null, number>({
      query: (merchantStoreId) =>
        `/super-admin/billing/merchant-overrides?merchantStoreId=${merchantStoreId}`,
      transformResponse: (res: { override?: { overrides?: unknown } | null; error?: string }) => {
        if (res?.error) throw new Error(res.error);
        if (res?.override?.overrides === undefined) return null;
        return { overrides: res.override.overrides };
      },
      keepUnusedDataFor: 0,
    }),

    putMerchantBillingOverride: build.mutation<
      void,
      { merchant_store_id: number; overrides: Record<string, unknown> }
    >({
      query: (body) => ({
        url: "/super-admin/billing/merchant-overrides",
        method: "PUT",
        body,
      }),
      transformResponse: (res: { ok?: boolean; error?: string } | undefined) => {
        if (res?.error) throw new Error(res.error);
      },
    }),

    getBillingDeliveryRateCards: build.query<BillingAdminRateCardRow[], void>({
      query: () => "/super-admin/billing/delivery-rate-cards",
      transformResponse: (res: { cards?: BillingAdminRateCardRow[]; error?: string }) => {
        if (res?.error) throw new Error(res.error);
        return res.cards ?? [];
      },
      providesTags: [billingTags.reference],
    }),

    createBillingDeliveryRateCard: build.mutation<BillingAdminRateCardRow, Record<string, unknown>>({
      query: (body) => ({ url: "/super-admin/billing/delivery-rate-cards", method: "POST", body }),
      transformResponse: (res: { card?: BillingAdminRateCardRow; error?: string }) => {
        if (!res?.card) throw new Error(res?.error ?? errMsg(res));
        return res.card;
      },
      invalidatesTags: [billingTags.reference],
    }),

    updateBillingDeliveryRateCard: build.mutation<
      BillingAdminRateCardRow,
      { id: number; body: Record<string, unknown> }
    >({
      query: ({ id, body }) => ({
        url: `/super-admin/billing/delivery-rate-cards/${id}`,
        method: "PATCH",
        body,
      }),
      transformResponse: (res: { card?: BillingAdminRateCardRow; error?: string }) => {
        if (!res?.card) throw new Error(res?.error ?? errMsg(res));
        return res.card;
      },
      invalidatesTags: [billingTags.reference],
    }),

    deleteBillingDeliveryRateCard: build.mutation<void, number>({
      query: (id) => ({ url: `/super-admin/billing/delivery-rate-cards/${id}`, method: "DELETE" }),
      transformResponse: (res: { error?: string } | undefined) => {
        if (res?.error) throw new Error(res.error);
      },
      invalidatesTags: [billingTags.reference],
    }),

    getBillingPlatformOffers: build.query<BillingAdminPlatformOfferRow[], void>({
      query: () => "/super-admin/billing/platform-offers",
      transformResponse: (res: { offers?: BillingAdminPlatformOfferRow[]; error?: string }) => {
        if (res?.error) throw new Error(res.error);
        return res.offers ?? [];
      },
      providesTags: [billingTags.reference],
    }),

    createBillingPlatformOffer: build.mutation<BillingAdminPlatformOfferRow, Record<string, unknown>>({
      query: (body) => ({ url: "/super-admin/billing/platform-offers", method: "POST", body }),
      transformResponse: (res: { offer?: BillingAdminPlatformOfferRow; error?: string }) => {
        if (!res?.offer) throw new Error(res?.error ?? errMsg(res));
        return res.offer;
      },
      invalidatesTags: [billingTags.reference],
    }),

    updateBillingPlatformOffer: build.mutation<
      BillingAdminPlatformOfferRow,
      { id: number; body: Record<string, unknown> }
    >({
      query: ({ id, body }) => ({
        url: `/super-admin/billing/platform-offers/${id}`,
        method: "PATCH",
        body,
      }),
      transformResponse: (res: { offer?: BillingAdminPlatformOfferRow; error?: string }) => {
        if (!res?.offer) throw new Error(res?.error ?? errMsg(res));
        return res.offer;
      },
      invalidatesTags: [billingTags.reference],
    }),

    deleteBillingPlatformOffer: build.mutation<void, number>({
      query: (id) => ({ url: `/super-admin/billing/platform-offers/${id}`, method: "DELETE" }),
      transformResponse: (res: { error?: string } | undefined) => {
        if (res?.error) throw new Error(res.error);
      },
      invalidatesTags: [billingTags.reference],
    }),

    simulateBilling: build.mutation<string, unknown>({
      query: (body) => ({
        url: "/super-admin/billing/simulate",
        method: "POST",
        body,
      }),
      transformResponse: (res: unknown) => JSON.stringify(res, null, 2),
    }),
  }),
  /** Allow HMR / duplicate module evaluation to register newer endpoints (e.g. charge-order). */
  overrideExisting: true,
});

export const {
  useGetBillingRulesQuery,
  useGetBillingConditionsQuery,
  useCreateBillingRuleMutation,
  useUpdateBillingRuleMutation,
  useDeleteBillingRuleMutation,
  useReorderBillingChargeOrderMutation,
  usePatchBillingPrioritiesMutation,
  useCreateBillingConditionMutation,
  useDeleteBillingConditionMutation,
  useGetBillingSlabsQuery,
  useCreateBillingSlabMutation,
  useUpdateBillingSlabMutation,
  useDeleteBillingSlabMutation,
  useGetBillingPackagingSlabsQuery,
  useCreateBillingPackagingSlabMutation,
  useUpdateBillingPackagingSlabMutation,
  useDeleteBillingPackagingSlabMutation,
  useGetBillingTaxConfigsQuery,
  useCreateBillingTaxConfigMutation,
  useUpdateBillingTaxConfigMutation,
  useDeleteBillingTaxConfigMutation,
  useRepairBillingTaxSlabsMutation,
  useGetBillingDiscountsQuery,
  useCreateBillingDiscountMutation,
  useUpdateBillingDiscountMutation,
  useDeleteBillingDiscountMutation,
  useLazyGetMerchantBillingOverrideQuery,
  usePutMerchantBillingOverrideMutation,
  useGetBillingDeliveryRateCardsQuery,
  useCreateBillingDeliveryRateCardMutation,
  useUpdateBillingDeliveryRateCardMutation,
  useDeleteBillingDeliveryRateCardMutation,
  useGetBillingPlatformOffersQuery,
  useCreateBillingPlatformOfferMutation,
  useUpdateBillingPlatformOfferMutation,
  useDeleteBillingPlatformOfferMutation,
  useSimulateBillingMutation,
} = billingAdminApi;