/**
 * Silent high-priority FCM so the native OrderAlert FGS can start/stop when
 * JS is dead. Does not change order/dispatch APIs — extra data-only messages
 * only. Existing display notifications stay as the one-shot OS fallback.
 */
import { randomUUID } from "node:crypto";
import { isExpoPushTokenString } from "@gatimitra/contracts";
import { sendFcmV1 } from "../modules/notifications/fcmProvider.js";
import { getSql } from "../db/client.js";
import { expandCampaignUserIdCandidates } from "../modules/notifications/campaignTarget.js";

export type CriticalAlertAction = "start" | "stop";

function flatten(data: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!data) return out;
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}

export async function sendCriticalAlertControlFcm(args: {
  tokens: string[];
  action: CriticalAlertAction;
  alertSessionId: string;
  appRole: "merchant" | "rider";
  data?: Record<string, unknown>;
}): Promise<void> {
  const sessionId = String(args.alertSessionId ?? "").trim();
  if (!sessionId || args.tokens.length === 0) {
    if (args.tokens.length === 0) {
      console.warn(
        `[ALERT_ENGINE] TOKEN_MISSING role=${args.appRole} action=${args.action} ` +
          `alertSessionId=${sessionId} ts=${Date.now()}`
      );
    }
    return;
  }
  const data = flatten({
    ...(args.data ?? {}),
    gmAlertAction: args.action,
    gmAlertControl: "1",
    alertSessionId: sessionId,
    appRole: args.appRole,
  });
  await Promise.all(
    args.tokens.map(async (token) => {
      const t = String(token ?? "").trim();
      if (!t || isExpoPushTokenString(t)) return;
      try {
        const res = await sendFcmV1({
          notificationId: randomUUID(),
          token: t,
          title: "",
          body: "",
          silent: true,
          playSound: false,
          appRole: args.appRole,
          priority: "critical",
          collapseKey: `gm_alert_${args.action}_${sessionId}`,
          data,
        });
        const tail = t.length > 6 ? t.slice(-6) : "******";
        const orderId = String(args.data?.orderId ?? args.data?.foodOrderId ?? "");
        if (res.ok) {
          console.info(
            `[ALERT_ENGINE] FCM_SEND_SUCCESS role=${args.appRole} action=${args.action} ` +
              `token_tail=${tail} messageId=${res.messageId ?? ""} orderId=${orderId} ` +
              `alertSessionId=${sessionId} silent=1 priority=critical ts=${Date.now()}`
          );
        } else {
          console.warn(
            `[ALERT_ENGINE] FCM_SEND_FAILED role=${args.appRole} action=${args.action} ` +
              `token_tail=${tail} code=${res.errorCode ?? ""} orderId=${orderId} ` +
              `alertSessionId=${sessionId} ts=${Date.now()}`
          );
        }
      } catch {
        /* best-effort control path */
      }
    })
  );
}

export async function sendMerchantAlertControl(args: {
  storeId: number;
  action: CriticalAlertAction;
  alertSessionId: string;
  orderId?: string | number | null;
  foodOrderId?: number | null;
}): Promise<void> {
  if (!Number.isInteger(args.storeId) || args.storeId < 1) return;
  try {
    const sql = getSql();
    const { getMerchantStoreNativeFcmTokens } = await import("./merchant-push-notify.js");
    const tokens = await getMerchantStoreNativeFcmTokens(sql, args.storeId, {
      ignoreStaleness: true,
    });
    await sendCriticalAlertControlFcm({
      tokens,
      action: args.action,
      alertSessionId: args.alertSessionId,
      appRole: "merchant",
      data: {
        type: "merchant_new_order",
        event: args.action === "stop" ? "STOP_ALERT" : "NEW_ORDER",
        gmType: "MERCHANT_NEW_ORDER",
        template_code: "MERCHANT_NEW_ORDER",
        screen: "new_order",
        orderId: args.orderId != null ? String(args.orderId) : "",
        foodOrderId: args.foodOrderId ?? "",
        storeId: args.storeId,
        soundType: "notification",
      },
    });
  } catch {
    /* never throw into order flows */
  }
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

export function riderDispatchAlertSessionId(args: {
  orderId: string;
  riderId: number | string;
  waveNumber?: number | string | null;
}): string {
  const wave =
    args.waveNumber != null && String(args.waveNumber).trim()
      ? `:${String(args.waveNumber).trim()}`
      : "";
  return `RIDER_NEW_ORDER:${args.orderId}:${args.riderId}${wave}`;
}

export async function sendRiderAlertControl(args: {
  riderId: number;
  action: CriticalAlertAction;
  alertSessionId: string;
  orderId: string;
  serviceType?: string | null;
}): Promise<void> {
  if (!Number.isFinite(args.riderId) || args.riderId < 1) return;
  try {
    const candidates = expandCampaignUserIdCandidates(`usr_${args.riderId}`);
    const tokens = await loadRiderNativeFcmTokens(candidates);
    await sendCriticalAlertControlFcm({
      tokens,
      action: args.action,
      alertSessionId: args.alertSessionId,
      appRole: "rider",
      data: {
        type: "dispatch_offer",
        gmType: "DISPATCH_OFFER",
        event: args.action === "stop" ? "STOP_ALERT" : "NEW_ORDER",
        orderId: args.orderId,
        offerId: args.orderId,
        serviceType: args.serviceType ?? "",
      },
    });
  } catch {
    /* never throw into dispatch flows */
  }
}
