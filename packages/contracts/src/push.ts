import { z } from "zod";

export const PushDeviceTypeSchema = z.enum(["ios", "android", "web", "unknown"]);
export type PushDeviceType = z.infer<typeof PushDeviceTypeSchema>;

export const NativePushTokenTypeSchema = z.enum(["fcm", "apns"]);
export type NativePushTokenType = z.infer<typeof NativePushTokenTypeSchema>;

export const PushRegisterBodySchema = z
  .object({
    expo_push_token: z.string().min(10).optional().nullable(),
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
  })
  .refine(
    (b) =>
      (typeof b.expo_push_token === "string" && b.expo_push_token.trim().length >= 10) ||
      (typeof b.native_push_token === "string" && b.native_push_token.trim().length >= 8),
    { message: "expo_push_token or native_push_token required" },
  );
export type PushRegisterBody = z.infer<typeof PushRegisterBodySchema>;

export const PushUnregisterBodySchema = z.object({
  expo_push_token: z.string().min(10).optional().nullable(),
  native_push_token: z.string().min(8).optional().nullable(),
});
export type PushUnregisterBody = z.infer<typeof PushUnregisterBodySchema>;

export function rolePushTopic(role: "customer" | "rider" | "merchant"): string {
  return `app_${role}`;
}

export function merchantStorePushTopic(storeId: number): string {
  return `merchant_store_${storeId}`;
}

export function isExpoPushTokenString(token: string): boolean {
  return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}
