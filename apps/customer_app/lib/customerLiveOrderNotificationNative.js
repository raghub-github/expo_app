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
let lastDismissIdsKey = "";

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
  const code =
    (typeof data.template_code === "string" && data.template_code) ||
    (typeof data.gmType === "string" && data.gmType) ||
    "";
  return /^ORDER_/i.test(code);
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
      await Notifications.dismissNotificationAsync(id).catch(() => undefined);
      return;
    }
    lastPostedSig.set(args.orderId, sig);
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

  await postOrUpdateLiveNotification({
    orderId,
    title,
    body,
    step: Number.isFinite(step) ? step : 1,
    steps,
    terminal,
    service,
  });
}

/**
 * Remove stale FCM tray rows for active orders — keep only the sticky per orderId.
 */
async function dismissStaleLiveOrderTrayNotifications(activeOrderIds) {
  const active = activeOrderIds instanceof Set ? activeOrderIds : new Set(activeOrderIds ?? []);
  const idsKey = [...active].sort().join(",");
  if (idsKey === lastDismissIdsKey) return;
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
    const orderId = typeof data.orderId === "string" ? data.orderId.trim() : "";

    if (identifier.startsWith("customer-live-order-")) {
      const stickyOrderId = identifier.slice("customer-live-order-".length);
      if (!active.has(stickyOrderId)) {
        await Notifications.dismissNotificationAsync(identifier).catch(() => undefined);
      }
      continue;
    }

    if (!orderId || !active.has(orderId)) continue;

    const isLive =
      isGmLiveProgressPush(data) ||
      isOrderLifecyclePush(data) ||
      data.type === "live_order_progress";

    if (isLive) {
      await Notifications.dismissNotificationAsync(identifier).catch(() => undefined);
    }
  }
}

function liveProgressHandlerResult(data) {
  if (!isGmLiveProgressPush(data)) {
    return {
      suppress: false,
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  }
  return {
    suppress: true,
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: false,
    shouldShowList: false,
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
