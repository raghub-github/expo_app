/**
 * Direct FCM/Expo fallback when notificationService cannot deliver a
 * rider dispatch offer (no tokens via template path, inbox-only, etc.).
 * Never throws.
 */

import { randomUUID } from "node:crypto";
import { isExpoPushTokenString } from "@gatimitra/contracts";
import { getSql } from "../db/client.js";
import { expandCampaignUserIdCandidates } from "../modules/notifications/campaignTarget.js";
import { sendFcmV1 } from "../modules/notifications/fcmProvider.js";
import type { DispatchOrderTarget } from "./order-assignment-engine.js";

function channelIdForService(serviceType: DispatchOrderTarget["serviceType"]): string {
  if (serviceType === "food") return "rider_dispatch_food_v1";
  if (serviceType === "parcel") return "rider_dispatch_parcel_v1";
  if (serviceType === "person_ride") return "rider_dispatch_ride_v1";
  return "rider_dispatch_offers_alert";
}

function soundForService(serviceType: DispatchOrderTarget["serviceType"]): string {
  if (serviceType === "food") return "food_order";
  if (serviceType === "parcel") return "parcel_order";
  if (serviceType === "person_ride") return "ride_order";
  return "notification";
}

async function loadRiderNativeFcmTokens(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const sql = getSql();
  try {
    const rows = (await sql`
      SELECT native_token
      FROM public.native_device_push_tokens
      WHERE user_id = ANY(${userIds}::text[])
        AND token_type = 'fcm'
        AND (
          lower(coalesce(role, 'rider')) = 'rider'
          OR role IS NULL
          OR trim(role) = ''
        )
        AND (
          lower(coalesce(platform, 'android')) = 'android'
          OR platform IS NULL
          OR trim(platform) = ''
        )
        AND lower(coalesce(source, 'app')) <> 'web'
      ORDER BY
        CASE WHEN lower(coalesce(source, 'app')) = 'app' THEN 0 ELSE 1 END,
        updated_at DESC NULLS LAST
    `) as unknown as Array<{ native_token: string }>;
    return [
      ...new Set(
        rows
          .map((r) => String(r.native_token ?? "").trim())
          .filter((t) => t.length > 0 && !isExpoPushTokenString(t))
      ),
    ];
  } catch {
    return [];
  }
}

async function loadRiderExpoTokens(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const sql = getSql();
  try {
    const rows = (await sql`
      SELECT expo_push_token AS token
      FROM public.expo_push_tokens
      WHERE user_id = ANY(${userIds}::text[])
        AND expo_push_token IS NOT NULL
        AND (
          lower(coalesce(role, 'rider')) = 'rider'
          OR role IS NULL
          OR trim(role) = ''
        )
      ORDER BY updated_at DESC NULLS LAST
    `) as unknown as Array<{ token: string }>;
    return [
      ...new Set(
        rows
          .map((r) => String(r.token ?? "").trim())
          .filter((t) => t.length > 0 && isExpoPushTokenString(t))
      ),
    ];
  } catch {
    return [];
  }
}

function flattenData(data: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = { appRole: "rider" };
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}

/**
 * Best-effort direct push when the template pipeline reports no tokens / inbox-only.
 * Prefer native Android FCM; Expo only when no native tokens. Never throws.
 */
export async function sendRiderDispatchDirectPush(args: {
  riderId: number;
  orderId: string;
  serviceType: DispatchOrderTarget["serviceType"];
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<{ ok: boolean; reason?: string }> {
  const push_dispatch_started_at = Date.now();
  try {
    const candidates = expandCampaignUserIdCandidates(`usr_${args.riderId}`);
    const nativeTokens = await loadRiderNativeFcmTokens(candidates);
    const expoTokens =
      nativeTokens.length > 0 ? [] : await loadRiderExpoTokens(candidates);

    console.info(
      "[dispatch] push_dispatch_started_at",
      JSON.stringify({
        push_dispatch_started_at,
        mode: "direct_fcm_fallback",
        riderId: args.riderId,
        orderId: args.orderId,
        serviceType: args.serviceType,
        nativeCount: nativeTokens.length,
        expoCount: expoTokens.length,
      })
    );

    if (nativeTokens.length === 0 && expoTokens.length === 0) {
      console.error(
        "[dispatch] push_failure",
        JSON.stringify({
          reason: "no_push_tokens",
          mode: "direct_fcm_fallback",
          riderId: args.riderId,
          orderId: args.orderId,
          push_provider_response_at: Date.now(),
          push_dispatch_started_at,
        })
      );
      return { ok: false, reason: "no_push_tokens" };
    }

    const channelId = channelIdForService(args.serviceType);
    const sound = soundForService(args.serviceType);
    const deepLink = "/(tabs)/orders";
    const alertSessionId =
      String(args.data?.alertSessionId ?? "").trim() ||
      `RIDER_NEW_ORDER:${args.orderId}:${args.riderId}`;
    const data = flattenData({
      ...(args.data ?? {}),
      type: "dispatch_offer",
      gmType: "DISPATCH_OFFER",
      event: "NEW_ORDER",
      orderId: args.orderId,
      serviceType: args.serviceType,
      url: deepLink,
      deepLink,
      screen: deepLink,
      skip_in_app_banner: true,
      alertSessionId,
      gmAlertAction: "start",
    });

    let anyOk = false;
    let lastError: string | null = null;

    for (const token of nativeTokens) {
      try {
        const res = await sendFcmV1({
          notificationId: randomUUID(),
          token,
          title: args.title,
          body: args.body,
          channelId,
          sound,
          playSound: true,
          silent: false,
          appRole: "rider",
          priority: "critical",
          data,
          deepLink,
        });
        const push_provider_response_at = Date.now();
        if (res.ok) {
          anyOk = true;
          console.info(
            "[dispatch] push_success",
            JSON.stringify({
              mode: "direct_native_fcm",
              riderId: args.riderId,
              orderId: args.orderId,
              push_provider_response_at,
              push_dispatch_started_at,
            })
          );
        } else {
          lastError = res.errorCode ?? res.errorMessage ?? "fcm_failed";
          console.error(
            "[dispatch] push_failure",
            JSON.stringify({
              mode: "direct_native_fcm",
              riderId: args.riderId,
              orderId: args.orderId,
              errorCode: res.errorCode ?? null,
              errorMessage: res.errorMessage ?? null,
              push_provider_response_at,
              push_dispatch_started_at,
            })
          );
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.error(
          "[dispatch] push_failure",
          JSON.stringify({
            mode: "direct_native_fcm",
            riderId: args.riderId,
            orderId: args.orderId,
            errorCode: "FCM_THROW",
            errorMessage: lastError,
            push_provider_response_at: Date.now(),
            push_dispatch_started_at,
          })
        );
      }
    }

    if (nativeTokens.length > 0) {
      try {
        const { sendCriticalAlertControlFcm } = await import("./critical-alert-control.js");
        await sendCriticalAlertControlFcm({
          tokens: nativeTokens,
          action: "start",
          alertSessionId,
          appRole: "rider",
          data,
        });
      } catch {
        /* companion FCM is best-effort */
      }
    }

    if (!anyOk && expoTokens.length > 0) {
      try {
        const { deliverExpoPush } = await import("../modules/push/deliverExpoPush.js");
        const result = await deliverExpoPush({
          to: expoTokens,
          title: args.title,
          body: args.body,
          data,
          screen: deepLink,
          channelId,
          sound,
          priority: "critical",
          forceInline: true,
          templateCode: "RIDER_NEW_ORDER",
        });
        const push_provider_response_at = Date.now();
        if (result.ok) {
          anyOk = true;
          console.info(
            "[dispatch] push_success",
            JSON.stringify({
              mode: "direct_expo",
              riderId: args.riderId,
              orderId: args.orderId,
              accepted: result.accepted,
              push_provider_response_at,
              push_dispatch_started_at,
            })
          );
        } else {
          lastError = result.error ?? "expo_failed";
          console.error(
            "[dispatch] push_failure",
            JSON.stringify({
              mode: "direct_expo",
              riderId: args.riderId,
              orderId: args.orderId,
              errorCode: lastError,
              push_provider_response_at,
              push_dispatch_started_at,
            })
          );
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.error(
          "[dispatch] push_failure",
          JSON.stringify({
            mode: "direct_expo",
            riderId: args.riderId,
            orderId: args.orderId,
            errorCode: "EXPO_THROW",
            errorMessage: lastError,
            push_provider_response_at: Date.now(),
            push_dispatch_started_at,
          })
        );
      }
    }

    return anyOk ? { ok: true } : { ok: false, reason: lastError ?? "push_failed" };
  } catch (err) {
    console.error(
      "[dispatch] push_failure",
      JSON.stringify({
        mode: "direct_fcm_fallback",
        riderId: args.riderId,
        orderId: args.orderId,
        errorCode: "DIRECT_PUSH_THROW",
        errorMessage: err instanceof Error ? err.message : String(err),
        push_provider_response_at: Date.now(),
        push_dispatch_started_at,
      })
    );
    return { ok: false, reason: "direct_push_throw" };
  }
}
