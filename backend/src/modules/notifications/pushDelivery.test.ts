import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isExpoPushTokenString } from "@gatimitra/contracts";

function isExpoDeviceToken(token: string): boolean {
  return isExpoPushTokenString(token);
}

function riderDispatchChannelIdFromMetadata(opts?: {
  serviceType?: string;
  category?: string;
}): string {
  const service = String(opts?.serviceType ?? opts?.category ?? "")
    .trim()
    .toLowerCase();
  if (service === "food") return "rider_dispatch_food_v1";
  if (service === "parcel") return "rider_dispatch_parcel_v1";
  if (service === "ride" || service === "person_ride") return "rider_dispatch_ride_v1";
  return "rider_dispatch_offers_alert";
}

function riderDispatchSoundFromMetadata(opts?: {
  serviceType?: string;
  category?: string;
}): string {
  const service = String(opts?.serviceType ?? opts?.category ?? "")
    .trim()
    .toLowerCase();
  if (service === "food") return "food_order";
  if (service === "parcel") return "parcel_order";
  if (service === "ride" || service === "person_ride") return "ride_order";
  return "notification";
}

function channelIdForRecipient(
  role: string,
  priority?: string,
  opts?: {
    liveService?: string;
    templateCode?: string;
    metadataType?: string;
    serviceType?: string;
    category?: string;
  },
): string {
  if (role === "merchant") {
    const code = String(opts?.templateCode ?? "").toUpperCase();
    const metaType = String(opts?.metadataType ?? "").toLowerCase();
    if (code === "MERCHANT_NEW_ORDER" || metaType === "merchant_new_order") {
      return "merchant_new_orders_alert_v2";
    }
    if (priority === "critical" || priority === "high") return "merchant_new_orders";
    return "merchant_default";
  }
  if (role === "rider") {
    const code = String(opts?.templateCode ?? "").toUpperCase();
    const metaType = String(opts?.metadataType ?? "").toLowerCase();
    if (
      code === "RIDER_DISPATCH_OFFER" ||
      code === "RIDER_NEW_ORDER" ||
      metaType === "dispatch_offer"
    ) {
      return riderDispatchChannelIdFromMetadata(opts);
    }
    return "rider_default";
  }
  const live = String(opts?.liveService ?? "").toLowerCase();
  const code = String(opts?.templateCode ?? "").toUpperCase();
  if (live === "ride" || code.startsWith("RIDE_")) return "customer_ride_cx";
  return "customer_default";
}

function soundForRecipient(
  role: string,
  opts?: {
    liveService?: string;
    templateCode?: string;
    metadataType?: string;
    serviceType?: string;
    category?: string;
  },
): string {
  if (role === "customer") {
    const live = String(opts?.liveService ?? "").toLowerCase();
    const code = String(opts?.templateCode ?? "").toUpperCase();
    if (live === "ride" || code.startsWith("RIDE_")) return "cx_notification.mp3";
  }
  if (role === "merchant") {
    const code = String(opts?.templateCode ?? "").toUpperCase();
    const metaType = String(opts?.metadataType ?? "").toLowerCase();
    if (code === "MERCHANT_NEW_ORDER" || metaType === "merchant_new_order") {
      return "notification";
    }
  }
  if (role === "rider") {
    const code = String(opts?.templateCode ?? "").toUpperCase();
    const metaType = String(opts?.metadataType ?? "").toLowerCase();
    if (
      code === "RIDER_DISPATCH_OFFER" ||
      code === "RIDER_NEW_ORDER" ||
      metaType === "dispatch_offer"
    ) {
      return riderDispatchSoundFromMetadata(opts);
    }
  }
  return "default";
}

describe("super admin push delivery helpers", () => {
  it("accepts both Expo token prefixes", () => {
    assert.equal(isExpoDeviceToken("ExponentPushToken[abc]"), true);
    assert.equal(isExpoDeviceToken("ExpoPushToken[abc]"), true);
    assert.equal(isExpoDeviceToken("fcm-native-token"), false);
  });

  it("picks merchant android channel", () => {
    assert.equal(channelIdForRecipient("merchant"), "merchant_default");
    assert.equal(channelIdForRecipient("merchant", "critical"), "merchant_new_orders");
    assert.equal(
      channelIdForRecipient("merchant", "critical", { templateCode: "MERCHANT_NEW_ORDER" }),
      "merchant_new_orders_alert_v2",
    );
  });

  it("uses bundled alert sound for merchant new orders", () => {
    assert.equal(
      soundForRecipient("merchant", { templateCode: "MERCHANT_NEW_ORDER" }),
      "notification",
    );
    assert.equal(soundForRecipient("merchant"), "default");
  });

  it("routes rider dispatch offers to per-service alert channels", () => {
    assert.equal(channelIdForRecipient("rider"), "rider_default");
    assert.equal(
      channelIdForRecipient("rider", "high", {
        templateCode: "RIDER_DISPATCH_OFFER",
        serviceType: "food",
      }),
      "rider_dispatch_food_v1",
    );
    assert.equal(
      soundForRecipient("rider", {
        templateCode: "RIDER_DISPATCH_OFFER",
        serviceType: "food",
      }),
      "food_order",
    );
    assert.equal(
      channelIdForRecipient("rider", "high", {
        templateCode: "RIDER_NEW_ORDER",
        serviceType: "food",
      }),
      "rider_dispatch_food_v1",
    );
    assert.equal(
      soundForRecipient("rider", {
        templateCode: "RIDER_NEW_ORDER",
        serviceType: "parcel",
      }),
      "parcel_order",
    );
    assert.equal(
      channelIdForRecipient("rider", "high", {
        templateCode: "RIDER_DISPATCH_OFFER",
        category: "parcel",
      }),
      "rider_dispatch_parcel_v1",
    );
    assert.equal(
      soundForRecipient("rider", {
        templateCode: "RIDER_DISPATCH_OFFER",
        serviceType: "person_ride",
      }),
      "ride_order",
    );
    assert.equal(
      channelIdForRecipient("rider", "high", { templateCode: "RIDER_DISPATCH_OFFER" }),
      "rider_dispatch_offers_alert",
    );
    assert.equal(
      soundForRecipient("rider", { templateCode: "RIDER_DISPATCH_OFFER" }),
      "notification",
    );
    assert.equal(
      channelIdForRecipient("rider", "critical", {
        templateCode: "RIDER_NEW_ORDER",
        serviceType: "person_ride",
      }),
      "rider_dispatch_ride_v1",
    );
  });

  it("routes customer ride pushes to CX sound channel", () => {
    assert.equal(
      channelIdForRecipient("customer", undefined, { liveService: "ride" }),
      "customer_ride_cx",
    );
    assert.equal(
      channelIdForRecipient("customer", undefined, { templateCode: "RIDE_RIDER_NEARBY" }),
      "customer_ride_cx",
    );
    assert.equal(channelIdForRecipient("customer"), "customer_default");
  });
});

describe("in-app-only delivery semantics", () => {
  const IN_APP_ONLY = "__in_app_only__";

  function resolveInAppOnlyLogStatus(args: {
    deviceToken: string;
    templateCode: string;
    priority: string;
  }): { status: "failed"; errorCode: "NO_PUSH_TOKEN" | "IN_APP_ONLY" } | { status: "delivered" } {
    if (args.deviceToken !== IN_APP_ONLY) return { status: "delivered" };
    const code = String(args.templateCode).toUpperCase();
    const critical =
      code === "MERCHANT_NEW_ORDER" ||
      code === "RIDER_DISPATCH_OFFER" ||
      code === "RIDER_NEW_ORDER" ||
      String(args.priority).toLowerCase() === "critical";
    return {
      status: "failed",
      errorCode: critical ? "NO_PUSH_TOKEN" : "IN_APP_ONLY",
    };
  }

  it("never marks __in_app_only__ as delivered", () => {
    const critical = resolveInAppOnlyLogStatus({
      deviceToken: IN_APP_ONLY,
      templateCode: "RIDER_DISPATCH_OFFER",
      priority: "critical",
    });
    assert.equal(critical.status, "failed");
    assert.equal(critical.errorCode, "NO_PUSH_TOKEN");

    const normal = resolveInAppOnlyLogStatus({
      deviceToken: IN_APP_ONLY,
      templateCode: "RIDER_DOC_APPROVED",
      priority: "normal",
    });
    assert.equal(normal.status, "failed");
    assert.equal(normal.errorCode, "IN_APP_ONLY");
  });
});
