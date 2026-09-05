/**
 * Shared Android live-order sticky + tray dedupe (plain JS for pushBackgroundTask).
 */

const CHANNEL_ID = "customer_live_order";
const BAR_LEN = 8;
const STICKY_COLOR = "#14b8a6";

let channelReady = false;
let postInFlight = false;
let queuedPost = null;
const lastPostedSig = new Map();
const lastPostedStep = new Map();
let lastDismissIdsKey = "";
const pendingLiveByOrder = new Map();
let pendingLiveTimer = null;

function ongoingId(orderId) {
  return `customer-live-order-${orderId}`;
}

function progressBar(step, steps) {
  const filled = Math.max(0, Math.min(BAR_LEN, Math.round((step / Math.max(1, steps)) * BAR_LEN)));
  const empty = BAR_LEN - filled;
  if (filled <= 0) return "·".repeat(BAR_LEN);
  return `${"●".repeat(filled)}${"·".repeat(empty)}`;
}

function isGmLiveProgressPush(data) {
  if (!data || typeof data !== "object") return false;
  return data.gmLiveProgress === true || data.gmLiveProgress === "true";
}

function isOrderLifecyclePush(data) {
  if (!data || typeof data !== "object") return false;
  if (data.type === "live_order_progress") return true;
  const code =
    (typeof data.template_code === "string" && data.template_code) ||
    (typeof data.templateCode === "string" && data.templateCode) ||
    (typeof data.gmType === "string" && data.gmType) ||
    (typeof data.event_type === "string" && data.event_type) ||
    "";
  const upper = String(code).toUpperCase();
  return (
    /^ORDER_/i.test(upper) ||
    /^RIDE_/i.test(upper) ||
    /^PARCEL_/i.test(upper) ||
    upper === "CUSTOMER_DELIVERY_OTP_NEARBY" ||
    upper === "CUSTOMER_PICKUP_OTP_ARRIVED"
  );
}

function normalizeActiveIdSet(activeOrderIds) {
  const active = new Set();
  const list = activeOrderIds instanceof Set ? [...activeOrderIds] : activeOrderIds ?? [];
  for (const raw of list) {
    const id = String(raw ?? "").trim();
    if (id) active.add(id.toUpperCase());
  }
  return active;
}

function orderIdsFromPresentedItem(item) {
  const ids = [];
  const seen = new Set();
  const add = (raw) => {
    const id = String(raw ?? "").trim();
    if (!id) return;
    const key = id.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    ids.push(key);
  };
  const identifier = item?.request?.identifier ?? item?.identifier ?? "";
  if (String(identifier).startsWith("customer-live-order-")) {
    add(String(identifier).slice("customer-live-order-".length));
  }
  const data = item?.request?.content?.data ?? item?.data ?? {};
  add(data.orderId);
  add(data.order_id);
  add(data.orderIdText);
  add(data.formattedOrderId);
  add(data.formatted_order_id);
  add(data.orderShortId);
  add(data.order_short_id);
  const deep = data.deepLink || data.deep_link || data.screen || "";
  const match = String(deep).match(/\/orders\/([^/?#]+)/i);
  if (match?.[1]) add(decodeURIComponent(match[1]));
  return ids;
}

async function ensureChannel(Notifications) {
  if (channelReady) return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Live trip progress",
    importance: Notifications.AndroidImportance.LOW,
    sound: undefined,
    vibrationPattern: undefined,
    enableVibrate: false,
    showBadge: true,
  });
  channelReady = true;
}

async function postOrUpdateLiveNotification(args) {
  const sig = `${args.orderId}|${args.title}|${args.step}|${args.terminal ? 1 : 0}`;
  if (!args.terminal && lastPostedSig.get(args.orderId) === sig) return;
  const prevStep = lastPostedStep.get(args.orderId);
  if (prevStep != null && !args.terminal) {
    const nextStep = Number(args.step);
    if (Number.isFinite(nextStep) && nextStep < prevStep) {
      return;
    }
  }
  if (postInFlight) {
    queuedPost = args;
    return;
  }
  postInFlight = true;
  try {
    const Notifications = require("expo-notifications");
    await ensureChannel(Notifications);
    const id = ongoingId(args.orderId);
    if (args.terminal) {
      lastPostedSig.delete(args.orderId);
      lastPostedStep.delete(args.orderId);
      await Notifications.dismissNotificationAsync(id).catch(() => undefined);
      return;
    }
    lastPostedSig.set(args.orderId, sig);
    lastPostedStep.set(args.orderId, Number(args.step) || 0);
    const bar = progressBar(args.step, args.steps);
    const href = `/orders/${args.orderId}`;
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: {
        title: args.title,
        body: `${args.body}\n${bar}`,
        data: {
          type: "live_order_progress",
          liveService: args.service ?? "food",
          orderId: args.orderId,
          screen: href,
          deepLink: href,
        },
        color: STICKY_COLOR,
        sticky: true,
        autoDismiss: false,
        sound: undefined,
        channelId: CHANNEL_ID,
      },
      trigger: null,
    });
  } finally {
    postInFlight = false;
    const next = queuedPost;
    queuedPost = null;
    if (next) await postOrUpdateLiveNotification(next);
  }
}

async function applyLiveProgressFromPush(data) {
  const live = isGmLiveProgressPush(data);
  if (!live) return;

  const serviceRaw = String(data.liveService ?? "food").trim().toLowerCase();
  const service =
    serviceRaw === "ride" || serviceRaw === "person_ride"
      ? "ride"
      : serviceRaw === "parcel"
        ? "parcel"
        : "food";

  const orderId = typeof data.orderId === "string" ? data.orderId.trim() : "";
  if (!orderId) return;

  const step = Number(data.liveStep);
  const defaultSteps = service === "ride" ? 6 : 5;
  const steps = Number(data.liveSteps) || defaultSteps;
  const title =
    typeof data.liveTitle === "string" && data.liveTitle.trim()
      ? data.liveTitle.trim()
      : service === "ride"
        ? "Ride update"
        : service === "parcel"
          ? "Parcel update"
          : "Order update";
  let body =
    typeof data.liveBody === "string" && data.liveBody.trim() ? data.liveBody.trim() : "Tap to track";
  const eta = Number(data.etaMinutes);
  if (Number.isFinite(eta) && eta > 0 && !/min/i.test(body)) {
    body = `${body} · ${Math.round(eta)} mins`;
  }

  const terminal =
    (Number.isFinite(step) && step >= steps) ||
    /delivered|completed|cancelled/i.test(title) ||
    String(data.gmType ?? "").includes("DELIVERED") ||
    String(data.gmType ?? "").includes("COMPLETED") ||
    String(data.gmType ?? "").includes("CANCELLED");

  const next = {
    orderId,
    title,
    body,
    step: Number.isFinite(step) ? step : 1,
    steps,
    terminal,
    service,
  };
  const prev = pendingLiveByOrder.get(orderId);
  if (!prev || next.step >= prev.step || next.terminal) {
    pendingLiveByOrder.set(orderId, next);
  }
  if (pendingLiveTimer) clearTimeout(pendingLiveTimer);
  pendingLiveTimer = setTimeout(() => {
    pendingLiveTimer = null;
    const batch = [...pendingLiveByOrder.values()];
    pendingLiveByOrder.clear();
    void (async () => {
      for (const args of batch) {
        await postOrUpdateLiveNotification(args);
      }
    })();
  }, 280);
}

/**
 * Remove stale FCM tray rows for active orders — keep only the sticky per orderId.
 */
async function dismissStaleLiveOrderTrayNotifications(activeOrderIds, opts) {
  const active = normalizeActiveIdSet(activeOrderIds);
  const idsKey = [...active].sort().join(",");
  const force = Boolean(opts && opts.force);
  if (!force && idsKey === lastDismissIdsKey) return;
  lastDismissIdsKey = idsKey;

  const Notifications = require("expo-notifications");
  let presented = [];
  try {
    presented = await Notifications.getPresentedNotificationsAsync();
  } catch {
    return;
  }

  for (const item of presented) {
    const identifier = item?.request?.identifier ?? "";
    const data = item?.request?.content?.data ?? {};
    const keys = orderIdsFromPresentedItem(item);
    const matchesActive = keys.some((k) => active.has(k));

    if (identifier.startsWith("customer-live-order-")) {
      const stickyOrderId = identifier.slice("customer-live-order-".length).toUpperCase();
      if (!active.has(stickyOrderId) && !matchesActive) {
        await Notifications.dismissNotificationAsync(identifier).catch(() => undefined);
      }
      continue;
    }

    if (!matchesActive) continue;

    const isLive =
      isGmLiveProgressPush(data) ||
      isOrderLifecyclePush(data) ||
      data.type === "live_order_progress";

    if (isLive) {
      // Historical FCM shade rows for this active order — never keep them
      // around to "replay" when the customer opens the app.
      await Notifications.dismissNotificationAsync(identifier).catch(() => undefined);
    }
  }
}

function liveProgressHandlerResult(data) {
  // Foreground / resume must not paint OS alerts for order-status pushes.
  // Killed/background delivery still uses the FCM notification block (this
  // handler is not running then). On resume Expo may re-invoke the handler
  // for tray items — suppressing prevents Confirmed+Assigned replay.
  if (isGmLiveProgressPush(data) || isOrderLifecyclePush(data)) {
    return {
      suppress: true,
      shouldShowAlert: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: false,
      shouldShowList: false,
    };
  }
  return {
    suppress: false,
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  };
}

module.exports = {
  CHANNEL_ID,
  ongoingId,
  applyLiveProgressFromPush,
  dismissStaleLiveOrderTrayNotifications,
  isGmLiveProgressPush,
  isOrderLifecyclePush,
  liveProgressHandlerResult,
  postOrUpdateLiveNotification,
};
