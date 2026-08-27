/**
 * FCM v1 direct provider.
 *
 * Used when the carrier must talk to Firebase directly:
 *   • Super-admin "Send to one device token" path (admin pastes an FCM token)
 *   • Topic-based broadcasts (no device-token list, just a topic name)
 *   • Browser push (web FCM tokens)
 *
 * For the regular mobile push flow (customer/merchant/rider apps) we still
 * use the existing Expo Push pipeline — Expo internally calls FCM v1 for
 * Android and APNs for iOS. This provider is only for cases where we need
 * to bypass Expo.
 */
import { FirebaseMessagingError, type Message } from "firebase-admin/messaging";
import { getFirebaseMessaging } from "../../config/firebase.js";
import { getEnv } from "../../config/env.js";
import type { ProviderSendResult, NotificationPriority } from "./types.js";

type FcmSendInput = {
  notificationId: string;
  token?: string;         // single device token
  topic?: string;         // FCM topic name (alternative to token)
  title: string;
  body: string;
  imageUrl?: string | null;
  data?: Record<string, string>;
  deepLink?: string | null;
  /** Web-only click URL (partnersite). Falls back to deepLink. */
  webLink?: string | null;
  /** Android notification channel (merchant_default, customer_default, …). */
  channelId?: string | null;
  priority?: NotificationPriority;
  collapseKey?: string | null;
  silent?: boolean;
  /** Customer / merchant / rider — stamps Expo experienceId so killed-app FCM still renders. */
  appRole?: string | null;
};

/** Expo project slugs — required on direct FCM so expo-notifications does not drop background messages. */
const EXPO_EXPERIENCE_BY_ROLE: Record<string, string> = {
  customer: "@raghubhunia/gatimitra-customer",
  merchant: "@raghubhunia/merchantapp",
  // Must match apps/gatimitra-riderApp/app.config.js owner + slug.
  rider: "@raghubhunia53s-team/gatimitra-riderapp",
};

function stampExpoIdentity(data: Record<string, string>, input: FcmSendInput): void {
  const role = String(input.appRole ?? data.appRole ?? "")
    .trim()
    .toLowerCase();
  const experienceId = EXPO_EXPERIENCE_BY_ROLE[role];
  if (experienceId) {
    data.experienceId = experienceId;
    data.scopeKey = experienceId;
    data.appRole = role;
  }
  if (input.title && !data.title) data.title = input.title;
  if (input.body) {
    if (!data.body) data.body = input.body;
    // Expo Android NotificationDeserializer reads `message` as the body.
    if (!data.message) data.message = input.body;
  }
}

function mapPriorityAndroid(p?: NotificationPriority): "normal" | "high" {
  return p === "high" || p === "critical" ? "high" : "normal";
}

function mapPriorityApns(p?: NotificationPriority): "10" | "5" {
  return p === "high" || p === "critical" ? "10" : "5";
}

/**
 * Send one notification via FCM v1. Returns provider result for log update.
 *
 * Errors are categorised:
 *   • DeviceNotRegistered / InvalidRegistration → terminal (caller should
 *     delete the token from the DB)
 *   • Other → may retry
 */
export async function sendFcmV1(input: FcmSendInput): Promise<ProviderSendResult> {
  if (!input.token && !input.topic) {
    return {
      notificationId: input.notificationId,
      ok: false,
      errorCode: "INVALID_ARGUMENT",
      errorMessage: "Either token or topic must be provided",
    };
  }
  const env = getEnv();
  const messaging = getFirebaseMessaging(env);

  // Data payloads in FCM v1 must be flat string→string. Coerce defensively.
  const data: Record<string, string> = {
    notification_id: input.notificationId,
  };
  if (input.deepLink) {
    // Clients read screen / deepLink; partnersite may use deep_link.
    data.deep_link = input.deepLink;
    data.deepLink = input.deepLink;
    data.screen = input.deepLink;
  }
  if (input.data) {
    for (const [k, v] of Object.entries(input.data)) {
      if (v === undefined || v === null) continue;
      data[k] = typeof v === "string" ? v : JSON.stringify(v);
    }
  }
  stampExpoIdentity(data, input);

  // Silent (data-only) payloads omit the notification block so the OS doesn't
  // render anything; the app's background handler picks them up.
  const wantsNotificationBlock = !input.silent;
  const androidPriority = mapPriorityAndroid(input.priority);
  const notifPriority: "min" | "low" | "default" | "high" | "max" =
    input.priority === "critical" ? "max" : androidPriority === "high" ? "high" : "default";

  const baseMessage = {
    data,
    android: {
      priority: androidPriority,
      collapseKey: input.collapseKey ?? undefined,
      notification: wantsNotificationBlock
        ? {
            title: input.title,
            body: input.body,
            imageUrl: input.imageUrl ?? undefined,
            // Prefer data.deep_link for navigation; only set clickAction for real intent actions.
            clickAction:
              input.deepLink && !input.deepLink.startsWith("/") && !/^https?:\/\//i.test(input.deepLink)
                ? input.deepLink
                : undefined,
            channelId: input.channelId?.trim() || "default",
            defaultSound: true,
            defaultVibrateTimings: true,
            visibility: "public",
            priority: notifPriority,
          }
        : undefined,
    },
    apns: {
      headers: {
        "apns-priority": mapPriorityApns(input.priority),
        ...(input.collapseKey ? { "apns-collapse-id": input.collapseKey } : {}),
      },
      payload: {
        aps: wantsNotificationBlock
          ? {
              alert: { title: input.title, body: input.body },
              sound: "default",
              "mutable-content": input.imageUrl ? 1 : 0,
              "content-available": 1,
            }
          : { "content-available": 1 },
      },
      fcmOptions: input.imageUrl ? { imageUrl: input.imageUrl } : undefined,
    },
    webpush: wantsNotificationBlock
      ? {
          notification: {
            title: input.title,
            body: input.body,
            icon: undefined,
            image: input.imageUrl ?? undefined,
          },
          fcmOptions: (() => {
            const link = (input.webLink ?? input.deepLink)?.trim();
            return link ? { link } : undefined;
          })(),
        }
      : undefined,
    notification: wantsNotificationBlock
      ? {
          title: input.title,
          body: input.body,
          imageUrl: input.imageUrl ?? undefined,
        }
      : undefined,
  };

  // `baseMessage` is inferred with widened string fields (e.g. notification `visibility` /
  // `priority`); the values are all valid FCM enums, so assert the send payload as `Message`.
  const message = (
    input.token
      ? { ...baseMessage, token: input.token }
      : { ...baseMessage, topic: input.topic! }
  ) as Message;

  try {
    const messageId = await messaging.send(message);
    console.info(
      `[fcm] accepted nid=${input.notificationId} messageId=${messageId} target=${
        input.token ? `token:${input.token.slice(0, 12)}…` : `topic:${input.topic}`
      }`,
    );
    return { notificationId: input.notificationId, ok: true, messageId };
  } catch (e) {
    const err = e as FirebaseMessagingError;
    console.warn(
      `[fcm] rejected nid=${input.notificationId} code=${err.code ?? "FCM_UNKNOWN"} msg=${err.message ?? String(e)} target=${
        input.token ? `token:${input.token.slice(0, 12)}…` : `topic:${input.topic}`
      }`,
    );
    return {
      notificationId: input.notificationId,
      ok: false,
      errorCode: err.code ?? "FCM_UNKNOWN",
      errorMessage: err.message ?? String(e),
    };
  }
}

/**
 * Subscribe a list of device tokens to a topic. Used by the Topics module
 * in the super-admin (Phase 4) and by mobile apps when a user opts in to
 * city/category-based promotional pushes.
 */
export async function subscribeToTopic(tokens: string[], topic: string): Promise<{ ok: number; fail: number }> {
  if (tokens.length === 0) return { ok: 0, fail: 0 };
  const env = getEnv();
  const messaging = getFirebaseMessaging(env);
  const res = await messaging.subscribeToTopic(tokens, topic);
  return { ok: res.successCount, fail: res.failureCount };
}

export async function unsubscribeFromTopic(tokens: string[], topic: string): Promise<{ ok: number; fail: number }> {
  if (tokens.length === 0) return { ok: 0, fail: 0 };
  const env = getEnv();
  const messaging = getFirebaseMessaging(env);
  const res = await messaging.unsubscribeFromTopic(tokens, topic);
  return { ok: res.successCount, fail: res.failureCount };
}
