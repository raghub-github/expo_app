import { z } from "zod";
export const CustomerPricingSourceSchema = z.enum([
    "geo_slab",
    "fallback_slab",
    "ride_vehicle_slab",
    "fallback_per_km",
    "manual_override",
    "other",
]);
export const RiderPayoutSourceSchema = z.enum([
    "geo_slab",
    "fallback_slab",
    "ride_vehicle_slab",
    "manual_override",
    "other",
]);
export const CustomerPricingBreakdownSchema = z.object({
    service_type: z.enum(["food", "parcel", "ride"]),
    pricing_source: CustomerPricingSourceSchema,
    currency: z.literal("INR").default("INR"),
    distance_km: z.number().nullable(),
    base_fare: z.number(),
    distance_charge: z.number(),
    min_charge_applied: z.number(),
    surge_charge: z.number().optional(),
    waiting_charge: z.number().optional(),
    platform_fee: z.number().optional(),
    taxes: z.number().optional(),
    delivery_fee: z.number(),
    total_payable_delivery: z.number().optional(),
    slab_meta: z
        .object({
        slab_node_id: z.string().nullable().optional(),
        slab_node_type: z.string().nullable().optional(),
        fallback_rule_id: z.string().nullable().optional(),
        vehicle_type_id: z.string().nullable().optional(),
    })
        .nullable()
        .optional(),
    breakdown_label: z.string().nullable().optional(),
});
export const RiderPayoutBreakdownSchema = z.object({
    service_type: z.enum(["food", "parcel", "ride"]),
    payout_source: RiderPayoutSourceSchema,
    currency: z.literal("INR").default("INR"),
    pickup_km: z.number().nullable(),
    drop_km: z.number().nullable(),
    wait_min: z.number().nullable(),
    base_fare: z.number(),
    pickup_payout: z.number(),
    drop_payout: z.number(),
    waiting_payout: z.number(),
    surge_payout: z.number(),
    gmitra_max_adjustment: z.number().optional(),
    dispatch_payout: z.number(),
    slab_meta: z
        .object({
        slab_node_id: z.string().nullable().optional(),
        slab_node_type: z.string().nullable().optional(),
        fallback_rule_id: z.string().nullable().optional(),
        vehicle_type_id: z.string().nullable().optional(),
    })
        .nullable()
        .optional(),
    breakdown_label: z.string().nullable().optional(),
});
//# sourceMappingURL=pricing.js.map