import { baseApi } from "./baseApi";
import type { PricingRuleRow } from "@/lib/db/operations/pricing-rules-admin";

export type PricingRuleTypeApi =
  | "customer_delivery_fee"
  | "rider_payout"
  | "surge_pricing"
  | "discount"
  | "commission";

export const pricingRulesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listPricingRules: build.query<
      { rules: PricingRuleRow[] },
      {
        level: string;
        refId: string;
        ruleType?: PricingRuleTypeApi;
        limit?: number;
        offset?: number;
      }
    >({
      query: (arg) => ({
        url: "/super-admin/pricing-rules",
        params: {
          level: arg.level,
          refId: arg.refId,
          ruleType: arg.ruleType,
          limit: arg.limit,
          offset: arg.offset,
        },
      }),
      providesTags: (_r, _e, arg) => [{ type: "PricingRules", id: arg.refId }],
    }),

    createPricingRule: build.mutation<
      { rule: PricingRuleRow },
      {
        ruleType: PricingRuleTypeApi;
        serviceType: "food" | "parcel" | "ride";
        level: string;
        refId: string;
        conditions?: Record<string, unknown>;
        actions?: Record<string, unknown>;
        priority?: number;
        isActive?: boolean;
        override?: boolean;
      }
    >({
      query: (body) => ({
        url: "/super-admin/pricing-rules",
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, arg) => [{ type: "PricingRules", id: arg.refId }],
    }),

    resolvePricingRules: build.mutation<
      unknown,
      {
        pincode: string;
        service: "food" | "parcel" | "ride";
        ruleType: PricingRuleTypeApi;
        context?: Record<string, unknown>;
        withTotals?: boolean;
      }
    >({
      query: (body) => ({
        url: "/super-admin/pricing-rules/resolve",
        method: "POST",
        body,
      }),
    }),
  }),
});

export const {
  useListPricingRulesQuery,
  useLazyListPricingRulesQuery,
  useCreatePricingRuleMutation,
  useResolvePricingRulesMutation,
} = pricingRulesApi;
