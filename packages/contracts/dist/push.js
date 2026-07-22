import { z } from "zod";
export const PushDeviceTypeSchema = z.enum(["ios", "android", "web", "unknown"]);
export const NativePushTokenTypeSchema = z.enum(["fcm", "apns"]);
export const PushRegisterBodySchema = z.object({
    expo_push_token: z.string().min(10),
    device_type: PushDeviceTypeSchema,
    native_push_token: z.string().min(8).optional().nullable(),
    native_token_type: NativePushTokenTypeSchema.optional().nullable(),
    /** Merchant store context for `merchant_store_<id>` topic reconciliation. */
    store_id: z.number().int().positive().optional().nullable(),
    device_model: z.string().max(120).optional().nullable(),
    device_brand: z.string().max(60).optional().nullable(),
    os_name: z.string().max(30).optional().nullable(),
    os_version: z.string().max(40).optional().nullable(),
    app_version: z.string().max(20).optional().nullable(),
    locale: z.string().max(20).optional().nullable(),
    timezone: z.string().max(60).optional().nullable(),
});
export const PushUnregisterBodySchema = z.object({
    expo_push_token: z.string().min(10).optional().nullable(),
    native_push_token: z.string().min(8).optional().nullable(),
});
export function rolePushTopic(role) {
    return `app_${role}`;
}
export function merchantStorePushTopic(storeId) {
    return `merchant_store_${storeId}`;
}
export function isExpoPushTokenString(token) {
    return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}
//# sourceMappingURL=push.js.map