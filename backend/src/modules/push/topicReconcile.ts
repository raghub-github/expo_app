import {
  isExpoPushTokenString,
  merchantStorePushTopic,
  rolePushTopic,
} from "@gatimitra/contracts";
import { subscribeToTopic, unsubscribeFromTopic } from "../notifications/fcmProvider.js";

export function desiredFcmTopics(input: {
  role: "customer" | "rider" | "merchant";
  storeId?: number | null;
}): string[] {
  const topics = [rolePushTopic(input.role)];
  if (input.role === "merchant" && input.storeId != null && input.storeId > 0) {
    topics.push(merchantStorePushTopic(input.storeId));
  }
  return topics;
}

export function topicDiff(
  current: string[],
  desired: string[]
): { subscribe: string[]; unsubscribe: string[] } {
  const cur = new Set(current);
  const des = new Set(desired);
  return {
    subscribe: desired.filter((t) => !cur.has(t)),
    unsubscribe: current.filter((t) => !des.has(t)),
  };
}

/**
 * Reconcile FCM topic subscriptions for a native Android token.
 * Never accepts Expo push token strings.
 */
export async function reconcileFcmTopics(input: {
  nativeToken: string;
  tokenType: "fcm" | "apns";
  currentTopics: string[];
  desiredTopics: string[];
  log?: { warn?: (obj: unknown, msg?: string) => void; info?: (obj: unknown, msg?: string) => void };
}): Promise<string[]> {
  if (input.tokenType !== "fcm") {
    return [];
  }
  if (isExpoPushTokenString(input.nativeToken)) {
    input.log?.warn?.(
      { tokenPrefix: input.nativeToken.slice(0, 24) },
      "fcm_topic_rejected_expo_token_string"
    );
    return input.currentTopics;
  }

  const { subscribe, unsubscribe } = topicDiff(input.currentTopics, input.desiredTopics);
  let next = [...input.currentTopics];

  for (const topic of unsubscribe) {
    try {
      await unsubscribeFromTopic([input.nativeToken], topic);
      next = next.filter((t) => t !== topic);
    } catch (e) {
      input.log?.warn?.({ err: e, topic }, "fcm_topic_unsubscribe_failed");
    }
  }

  for (const topic of subscribe) {
    try {
      await subscribeToTopic([input.nativeToken], topic);
      if (!next.includes(topic)) next.push(topic);
    } catch (e) {
      input.log?.warn?.({ err: e, topic }, "fcm_topic_subscribe_failed");
    }
  }

  return next;
}
