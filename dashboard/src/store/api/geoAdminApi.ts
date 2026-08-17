import { baseApi } from "./baseApi";
import type {
  GeoAncestorStep,
  GeoChildRow,
  GeoHierarchyLevel,
  GeoPricingRuleRow,
  GeoSearchRow,
  RiderRateCardRow,
} from "@/lib/geo/geo-shared";

export type GeoPlatformOfferBindingRow = {
  id: string;
  geo_level: string;
  geo_ref_id: string;
  platform_offer_id: number;
  created_at: string;
  updated_at: string;
};

export type { GeoHierarchyLevel };

export type GeoChildrenQuery = {
  parentLevel: GeoHierarchyLevel;
  parentId?: string | null;
  limit?: number;
  afterName?: string | null;
  afterId?: string | null;
  stateId?: string | null;
  food?: boolean | null;
  parcel?: boolean | null;
  ride?: boolean | null;
};

function boolToParam(v: boolean | null | undefined): string | undefined {
  if (v === undefined || v === null) return undefined;
  return v ? "true" : "false";
}

export const geoAdminApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    geoStates: build.query<{ states: { id: string; name: string }[] }, void>({
      query: () => ({ url: "/super-admin/geo/states" }),
      providesTags: [{ type: "Geo", id: "STATES" }],
      keepUnusedDataFor: 30 * 60,
    }),

    geoChildren: build.query<{ rows: GeoChildRow[] }, GeoChildrenQuery>({
      query: (arg) => ({
        url: "/super-admin/geo/children",
        params: {
          parentLevel: arg.parentLevel,
          parentId: arg.parentLevel === "root" ? undefined : arg.parentId ?? undefined,
          limit: arg.limit,
          afterName: arg.afterName ?? undefined,
          afterId: arg.afterId ?? undefined,
          stateId: arg.stateId ?? undefined,
          food: boolToParam(arg.food),
          parcel: boolToParam(arg.parcel),
          ride: boolToParam(arg.ride),
        },
      }),
      providesTags: (_r, _e, arg) => [
        { type: "Geo", id: `CHILDREN_${arg.parentLevel}_${arg.parentId ?? "root"}` },
        { type: "Geo", id: "HIERARCHY" },
      ],
    }),

    geoSearch: build.query<
      { rows: GeoSearchRow[] },
      {
        q: string;
        types?: string[];
        limit?: number;
        afterSort?: string | null;
        afterId?: string | null;
        stateId?: string | null;
        food?: boolean | null;
        parcel?: boolean | null;
        ride?: boolean | null;
      }
    >({
      query: (arg) => ({
        url: "/super-admin/geo/search",
        params: {
          q: arg.q,
          types: arg.types?.length ? arg.types.join(",") : undefined,
          limit: arg.limit,
          afterSort: arg.afterSort ?? undefined,
          afterId: arg.afterId ?? undefined,
          stateId: arg.stateId ?? undefined,
          food: boolToParam(arg.food),
          parcel: boolToParam(arg.parcel),
          ride: boolToParam(arg.ride),
        },
      }),
      providesTags: [{ type: "Geo", id: "SEARCH" }],
      /** Keep previous results visible while refetching (toggles / invalidation). */
      keepUnusedDataFor: 300,
    }),

    geoToggle: build.mutation<
      void,
      { level: Exclude<GeoHierarchyLevel, "root">; id: string; service: "food" | "parcel" | "ride"; value: boolean }
    >({
      query: (body) => ({
        url: "/super-admin/geo/toggle",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "Geo" }],
    }),

    geoRiderOnlineCheck: build.mutation<void, { id: string; value: boolean }>({
      query: (body) => ({
        url: "/super-admin/geo/rider-online-check",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "Geo" }],
    }),

    geoUpsert: build.mutation<
      { result: unknown },
      {
        state: string;
        region: string;
        district: string;
        division: string;
        postOffice: string;
        pincode: string;
        branchType?: string | null;
        latitude?: number | null;
        longitude?: number | null;
        isFood?: boolean;
        isParcel?: boolean;
        isRide?: boolean;
      }
    >({
      query: (body) => ({
        url: "/super-admin/geo/upsert",
        method: "POST",
        body: {
          state: body.state,
          region: body.region,
          district: body.district,
          division: body.division,
          postOffice: body.postOffice,
          pincode: body.pincode,
          branchType: body.branchType,
          latitude: body.latitude,
          longitude: body.longitude,
          isFood: body.isFood,
          isParcel: body.isParcel,
          isRide: body.isRide,
        },
      }),
      invalidatesTags: [{ type: "Geo" }],
    }),

    geoUpdateNode: build.mutation<
      void,
      {
        level: Exclude<GeoHierarchyLevel, "root">;
        id: string;
        name?: string;
        branchType?: string | null;
        latitude?: number | null;
        longitude?: number | null;
      }
    >({
      query: (body) => ({
        url: "/super-admin/geo/node",
        method: "PATCH",
        body,
      }),
      invalidatesTags: [{ type: "Geo" }],
    }),

    geoDeleteNode: build.mutation<void, { level: Exclude<GeoHierarchyLevel, "root">; id: string }>({
      query: (body) => ({
        url: "/super-admin/geo/node",
        method: "DELETE",
        body,
      }),
      invalidatesTags: [{ type: "Geo" }],
    }),

    geoPricingRules: build.query<{ rules: GeoPricingRuleRow[] }, { level: string; refId: string }>({
      query: (arg) => ({
        url: "/super-admin/geo/pricing",
        params: { level: arg.level, refId: arg.refId },
      }),
      providesTags: (_r, _e, arg) => [{ type: "Geo", id: `PRICE_${arg.refId}` }],
    }),

    geoPricingContext: build.query<
      { chain: GeoAncestorStep[]; rulesByRef: Record<string, GeoPricingRuleRow[]> },
      { level: string; refId: string }
    >({
      query: (arg) => ({
        url: "/super-admin/geo/pricing/context",
        params: { level: arg.level, refId: arg.refId },
      }),
      providesTags: (_r, _e, arg) => [{ type: "Geo", id: `PRICE_CTX_${arg.refId}` }],
    }),

    geoChainServices: build.query<{ chain: GeoChildRow[] }, { level: string; refId: string }>({
      query: (arg) => ({
        url: "/super-admin/geo/chain-services",
        params: { level: arg.level, refId: arg.refId },
      }),
      providesTags: (_r, _e, arg) => [{ type: "Geo", id: `CHAIN_${arg.refId}` }],
    }),

    geoCreatePricingRule: build.mutation<
      { rule: GeoPricingRuleRow },
      {
        level: string;
        refId: string;
        service: "food" | "parcel" | "ride";
        ruleType: string;
        valueNumeric?: number | null;
        valueJson?: unknown;
        priority?: number;
        isActive?: boolean;
      }
    >({
      query: (body) => ({
        url: "/super-admin/geo/pricing",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "Geo" }],
    }),

    geoUpdatePricingRule: build.mutation<
      { rule: GeoPricingRuleRow },
      { id: string; ruleType: string; valueNumeric: number | null; valueJson: unknown; priority: number; isActive: boolean }
    >({
      query: ({ id, ...body }) => ({
        url: `/super-admin/geo/pricing/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: [{ type: "Geo" }],
    }),

    geoDeletePricingRule: build.mutation<void, { id: string; refId: string }>({
      query: ({ id }) => ({
        url: `/super-admin/geo/pricing/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "Geo" }],
    }),

    riderRateCardsByLevel: build.query<
      { cards: RiderRateCardRow[] },
      { level: string; refId: string; limit?: number; offset?: number }
    >({
      query: (arg) => ({
        url: "/super-admin/geo/rider-rate-cards",
        params: {
          level: arg.level,
          refId: arg.refId,
          limit: arg.limit,
          offset: arg.offset,
        },
      }),
      providesTags: (_r, _e, arg) => [{ type: "Geo", id: `RIDER_RC_${arg.refId}` }],
    }),

    riderRateCardUpsert: build.mutation<
      { card: RiderRateCardRow },
      {
        level: string;
        refId: string;
        service: "food" | "parcel" | "ride";
        baseFare: number;
        perKmRate: number;
        minDistanceKm?: number;
        maxDistanceKm?: number | null;
        waitingChargePerMin?: number;
        surgeMultiplier?: number;
        priority?: number;
        isActive?: boolean;
        override?: boolean;
      }
    >({
      query: (body) => ({
        url: "/super-admin/geo/rider-rate-cards",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "Geo" }],
    }),

    riderRateResolve: build.query<
      unknown,
      { pincode: string; service: "food" | "parcel" | "ride"; distanceKm: number; waitingMin?: number }
    >({
      query: (arg) => ({
        url: "/super-admin/geo/rider-rate-cards/resolve",
        params: {
          pincode: arg.pincode,
          service: arg.service,
          distanceKm: arg.distanceKm,
          waitingMin: arg.waitingMin,
        },
      }),
    }),

    geoPlatformOfferBindings: build.query<
      { bindings: GeoPlatformOfferBindingRow[] },
      { level: Exclude<GeoHierarchyLevel, "root">; refId: string }
    >({
      query: (arg) => ({
        url: "/super-admin/geo/platform-offer-bindings",
        params: { level: arg.level, refId: arg.refId },
      }),
      providesTags: (_r, _e, arg) => [{ type: "Geo", id: `PO_BIND_${arg.refId}` }],
    }),

    geoPlatformOfferBindingCreate: build.mutation<
      { binding: GeoPlatformOfferBindingRow },
      { level: Exclude<GeoHierarchyLevel, "root">; refId: string; platform_offer_id: number }
    >({
      query: (body) => ({
        url: "/super-admin/geo/platform-offer-bindings",
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, arg) => [
        { type: "Geo", id: `PO_BIND_${arg.refId}` },
        { type: "Geo" },
      ],
    }),

    geoPlatformOfferBindingDelete: build.mutation<{ ok: boolean }, { id: number }>({
      query: ({ id }) => ({
        url: `/super-admin/geo/platform-offer-bindings/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "Geo" }],
    }),

    geoCheckoutCouponBindings: build.query<
      { bindings: Array<{ id: string; billing_discount_id: number; geo_level: string; geo_ref_id: string }> },
      { level: Exclude<GeoHierarchyLevel, "root">; refId: string }
    >({
      query: (arg) => ({
        url: "/super-admin/geo/checkout-coupon-bindings",
        params: { level: arg.level, refId: arg.refId },
      }),
      providesTags: (_r, _e, arg) => [{ type: "Geo", id: `COUPON_BIND_${arg.refId}` }],
    }),

    geoCheckoutCouponBindingCreate: build.mutation<
      { binding: { id: string; billing_discount_id: number } },
      { level: Exclude<GeoHierarchyLevel, "root">; refId: string; billing_discount_id: number }
    >({
      query: (body) => ({
        url: "/super-admin/geo/checkout-coupon-bindings",
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, arg) => [
        { type: "Geo", id: `COUPON_BIND_${arg.refId}` },
        { type: "Geo" },
      ],
    }),

    geoCheckoutCouponBindingDelete: build.mutation<{ ok: boolean }, { id: number }>({
      query: ({ id }) => ({
        url: `/super-admin/geo/checkout-coupon-bindings/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "Geo" }],
    }),
  }),
  overrideExisting: true,
});

export const {
  useGeoStatesQuery,
  useGeoChildrenQuery,
  useLazyGeoChildrenQuery,
  useLazyGeoSearchQuery,
  useGeoToggleMutation,
  useGeoRiderOnlineCheckMutation,
  useGeoUpsertMutation,
  useGeoUpdateNodeMutation,
  useGeoDeleteNodeMutation,
  useGeoPricingRulesQuery,
  useGeoPricingContextQuery,
  useGeoChainServicesQuery,
  useGeoCreatePricingRuleMutation,
  useGeoUpdatePricingRuleMutation,
  useGeoDeletePricingRuleMutation,
  useRiderRateCardsByLevelQuery,
  useRiderRateCardUpsertMutation,
  useLazyRiderRateResolveQuery,
  useGeoPlatformOfferBindingsQuery,
  useGeoPlatformOfferBindingCreateMutation,
  useGeoPlatformOfferBindingDeleteMutation,
  useGeoCheckoutCouponBindingsQuery,
  useGeoCheckoutCouponBindingCreateMutation,
  useGeoCheckoutCouponBindingDeleteMutation,
} = geoAdminApi;
