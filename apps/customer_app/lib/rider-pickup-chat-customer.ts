/**
 * Maps rider pickup quick-reply messages to customer-facing copy and actions.
 */

export type RiderPickupChatAction =
  | "info"
  | "arrived_alert"
  | "call_highlight"
  | "share_location"
  | "waiting_timer"
  | "help_actions";

export type RiderPickupChatCustomerView = {
  id: string;
  customerText: string;
  action: RiderPickupChatAction;
};

const RIDER_PICKUP_QUICK_REPLIES: RiderPickupChatCustomerView[] = [
  {
    id: "onTheWay",
    customerText: "Your driver is on the way to pickup location",
    action: "info",
  },
  {
    id: "reachedPickup",
    customerText: "Driver has arrived. Please meet your driver.",
    action: "arrived_alert",
  },
  {
    id: "answerCall",
    customerText: "Your driver is trying to reach you. Please answer the call.",
    action: "call_highlight",
  },
  {
    id: "arriveSoon",
    customerText: "Driver will arrive shortly.",
    action: "info",
  },
  {
    id: "stuckInTraffic",
    customerText: "Driver is delayed due to traffic.",
    action: "info",
  },
  {
    id: "shareLocation",
    customerText: "Your driver needs your exact pickup location.",
    action: "share_location",
  },
  {
    id: "waitingAtPickup",
    customerText: "Driver is waiting for you.",
    action: "waiting_timer",
  },
  {
    id: "cantFindLocation",
    customerText: "Your driver needs help finding you.",
    action: "help_actions",
  },
];

/** Rider app default messages (emoji + text) keyed to customer views. */
const RIDER_BODY_BY_ID: Record<string, string> = {
  onTheWay: "🚗 I'm on the way",
  reachedPickup: "📍 I've reached the pickup location",
  answerCall: "📞 Please answer my call",
  arriveSoon: "⏳ I'll arrive in a few minutes",
  stuckInTraffic: "🚦 Stuck in traffic, please wait",
  shareLocation: "📍 Please share your exact location",
  waitingAtPickup: "👋 I'm waiting at the pickup point",
  cantFindLocation: "🔍 I can't find your location",
};

function normalizeChatBody(body: string): string {
  return body
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

const NORMALIZED_LOOKUP = new Map<string, RiderPickupChatCustomerView>();
for (const view of RIDER_PICKUP_QUICK_REPLIES) {
  const riderBody = RIDER_BODY_BY_ID[view.id];
  if (riderBody) {
    NORMALIZED_LOOKUP.set(normalizeChatBody(riderBody), view);
  }
}

export function resolveRiderPickupChatCustomerView(
  body: string
): RiderPickupChatCustomerView | null {
  return NORMALIZED_LOOKUP.get(normalizeChatBody(body)) ?? null;
}
