import { z } from "zod";
export declare const PushDeviceTypeSchema: z.ZodEnum<{
    unknown: "unknown";
    ios: "ios";
    android: "android";
    web: "web";
}>;
export type PushDeviceType = z.infer<typeof PushDeviceTypeSchema>;
export declare const NativePushTokenTypeSchema: z.ZodEnum<{
    fcm: "fcm";
    apns: "apns";
}>;
export type NativePushTokenType = z.infer<typeof NativePushTokenTypeSchema>;
export declare const PushRegisterBodySchema: z.ZodObject<{
    expo_push_token: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    device_type: z.ZodEnum<{
        unknown: "unknown";
        ios: "ios";
        android: "android";
        web: "web";
    }>;
    native_push_token: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    native_token_type: z.ZodNullable<z.ZodOptional<z.ZodEnum<{
        fcm: "fcm";
        apns: "apns";
    }>>>;
    store_id: z.ZodNullable<z.ZodOptional<z.ZodNumber>>;
    device_model: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    device_brand: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    os_name: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    os_version: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    app_version: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    locale: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    timezone: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, z.core.$strip>;
export type PushRegisterBody = z.infer<typeof PushRegisterBodySchema>;
export declare const PushUnregisterBodySchema: z.ZodObject<{
    expo_push_token: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    native_push_token: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, z.core.$strip>;
export type PushUnregisterBody = z.infer<typeof PushUnregisterBodySchema>;
export declare function rolePushTopic(role: "customer" | "rider" | "merchant"): string;
export declare function merchantStorePushTopic(storeId: number): string;
export declare function isExpoPushTokenString(token: string): boolean;
//# sourceMappingURL=push.d.ts.map