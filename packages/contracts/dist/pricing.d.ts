import { z } from "zod";
export declare const CustomerPricingSourceSchema: z.ZodEnum<{
    geo_slab: "geo_slab";
    fallback_slab: "fallback_slab";
    ride_vehicle_slab: "ride_vehicle_slab";
    fallback_per_km: "fallback_per_km";
    manual_override: "manual_override";
    other: "other";
}>;
export type CustomerPricingSource = z.infer<typeof CustomerPricingSourceSchema>;
export declare const RiderPayoutSourceSchema: z.ZodEnum<{
    geo_slab: "geo_slab";
    fallback_slab: "fallback_slab";
    ride_vehicle_slab: "ride_vehicle_slab";
    manual_override: "manual_override";
    other: "other";
}>;
export type RiderPayoutSource = z.infer<typeof RiderPayoutSourceSchema>;
export declare const CustomerPricingBreakdownSchema: z.ZodObject<{
    service_type: z.ZodEnum<{
        food: "food";
        parcel: "parcel";
        ride: "ride";
    }>;
    pricing_source: z.ZodEnum<{
        geo_slab: "geo_slab";
        fallback_slab: "fallback_slab";
        ride_vehicle_slab: "ride_vehicle_slab";
        fallback_per_km: "fallback_per_km";
        manual_override: "manual_override";
        other: "other";
    }>;
    currency: z.ZodDefault<z.ZodLiteral<"INR">>;
    distance_km: z.ZodNullable<z.ZodNumber>;
    base_fare: z.ZodNumber;
    distance_charge: z.ZodNumber;
    min_charge_applied: z.ZodNumber;
    surge_charge: z.ZodOptional<z.ZodNumber>;
    waiting_charge: z.ZodOptional<z.ZodNumber>;
    platform_fee: z.ZodOptional<z.ZodNumber>;
    taxes: z.ZodOptional<z.ZodNumber>;
    delivery_fee: z.ZodNumber;
    total_payable_delivery: z.ZodOptional<z.ZodNumber>;
    slab_meta: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        slab_node_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        slab_node_type: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        fallback_rule_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        vehicle_type_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>>;
    breakdown_label: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export type CustomerPricingBreakdown = z.infer<typeof CustomerPricingBreakdownSchema>;
export declare const RiderPayoutBreakdownSchema: z.ZodObject<{
    service_type: z.ZodEnum<{
        food: "food";
        parcel: "parcel";
        ride: "ride";
    }>;
    payout_source: z.ZodEnum<{
        geo_slab: "geo_slab";
        fallback_slab: "fallback_slab";
        ride_vehicle_slab: "ride_vehicle_slab";
        manual_override: "manual_override";
        other: "other";
    }>;
    currency: z.ZodDefault<z.ZodLiteral<"INR">>;
    pickup_km: z.ZodNullable<z.ZodNumber>;
    drop_km: z.ZodNullable<z.ZodNumber>;
    wait_min: z.ZodNullable<z.ZodNumber>;
    base_fare: z.ZodNumber;
    pickup_payout: z.ZodNumber;
    drop_payout: z.ZodNumber;
    waiting_payout: z.ZodNumber;
    surge_payout: z.ZodNumber;
    gmitra_max_adjustment: z.ZodOptional<z.ZodNumber>;
    dispatch_payout: z.ZodNumber;
    slab_meta: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        slab_node_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        slab_node_type: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        fallback_rule_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        vehicle_type_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>>;
    breakdown_label: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export type RiderPayoutBreakdown = z.infer<typeof RiderPayoutBreakdownSchema>;
//# sourceMappingURL=pricing.d.ts.map