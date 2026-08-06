/**
 * Customer lifecycle pushes for food / person-ride / parcel milestones.
 * Keeps copy in DB templates; this module only resolves recipients + variables
 * and attaches live-progress metadata for the customer app shade UI.
 */
import { getSql } from "../db/client.js";
import { send as sendNotification } from "../modules/notifications/notificationService.js";

export type LiveService = "food" | "ride" | "parcel";

export type LiveProgressMeta = {
  gmLiveProgress: true;
  liveService: LiveService;
  liveStep: number;
  liveSteps: number;
  liveTitle: string;
  liveBody: string;
  orderId: string;
  storeName?: string;
  etaMinutes?: number;
  gmType: string;
};

const FOOD_LIVE: Record<string, { step: number; title: string; body: string }> = {
  ORDER_ACCEPTED: { step: 1, title: "Order Confirmed by the Store", body: "Your order has been confirmed by the store and is now being prepared." },
  ORDER_PREPARING: { step: 1, title: "Preparing Your Order", body: "Preparing" },
  ORDER_FOOD_READY: { step: 2, title: "Ready for Pickup", body: "Rider arriving at store" },
  ORDER_RIDER_AT_STORE: { step: 2, title: "Ready for Pickup", body: "Rider at the store" },
  ORDER_RIDER_ASSIGNED: { step: 2, title: "Ready for Pickup", body: "Rider heading to store" },
  ORDER_OUT_FOR_DELIVERY: { step: 3, title: "On The Way", body: "Arriving" },
  ORDER_RIDER_ARRIVING: { step: 4, title: "Nearby", body: "Rider is almost there" },
  ORDER_DELIVERED: { step: 5, title: "Delivered", body: "Enjoy your meal!" },
};

/** Ride: Accepted → Nearby → Arrived → Trip → Near drop → Completed */
const RIDE_LIVE: Record<string, { step: number; title: string; body: string }> = {
  /** Same template as food assignment — used when a captain accepts a person-ride. */
  ORDER_RIDER_ASSIGNED: { step: 1, title: "Ride Accepted", body: "Captain on the way" },
  RIDE_CAPTAIN_ON_THE_WAY: { step: 1, title: "Ride Accepted", body: "Captain on the way" },
  RIDE_RIDER_NEARBY: { step: 2, title: "Rider Nearby", body: "Be ready at pickup" },
  RIDE_RIDER_ARRIVED: { step: 3, title: "Rider Has Arrived", body: "Meet your rider" },
  RIDE_TRIP_STARTED: { step: 4, title: "Trip Started", body: "Have a safe ride" },
  RIDE_NEAR_DESTINATION: { step: 5, title: "Approaching Destination", body: "Almost there" },
  RIDE_COMPLETED: { step: 6, title: "Ride Completed", body: "Please rate your ride" },
};

/** Parcel: Accepted → Rider on way → Picked up → Nearby → Delivered */
const PARCEL_LIVE: Record<string, { step: number; title: string; body: string }> = {
  PARCEL_ACCEPTED: { step: 1, title: "Parcel Accepted", body: "Being prepared" },
  PARCEL_RIDER_ON_THE_WAY: { step: 2, title: "Rider On The Way", body: "Collecting your parcel" },
  PARCEL_PICKED_UP: { step: 3, title: "Parcel Picked Up", body: "On the way" },
  PARCEL_RIDER_NEARBY: { step: 4, title: "Rider Nearby", body: "Please be ready" },
  PARCEL_DELIVERED: { step: 5, title: "Parcel Delivered", body: "Delivered successfully" },
};

const FOOD_LIVE_STEPS = 5;
const RIDE_LIVE_STEPS = 6;
const PARCEL_LIVE_STEPS = 5;

async function customerUserIdForOrderIdText(orderIdText: string): Promise<string | null> {
  const sql = getSql();
  const rows = await sql<{ customer_user_id: string | null }[]>`
    SELECT c.customer_id AS customer_user_id
    FROM orders_core oc
    JOIN customers c ON c.id = oc.customer_id
    WHERE oc.order_id = ${orderIdText}
       OR oc.formatted_order_id = ${orderIdText}
    LIMIT 1
  `;
  const id = rows[0]?.customer_user_id?.trim();
  return id || null;
}

async function riderDisplayName(riderId: number): Promise<string> {
  const sql = getSql();
  const rows = await sql<{ name: string | null }[]>`
    SELECT NULLIF(TRIM(name), '') AS name
    FROM riders
    WHERE id = ${riderId}
    LIMIT 1
  `;
  return rows[0]?.name?.trim() || "Your rider";
}

/** Resolve 4-digit delivery OTP for customer-facing nearby notification. */
export async function deliveryOtpForOrderIdText(orderIdText: string): Promise<string | null> {
  const sql = getSql();
  const rows = await sql<{ delivery_otp: string | null }[]>`
    SELECT NULLIF(TRIM(oc.delivery_otp), '') AS delivery_otp
    FROM orders_core oc
    WHERE oc.order_id = ${orderIdText}
       OR oc.formatted_order_id = ${orderIdText}
       OR oc.id::text = ${orderIdText}
    LIMIT 1
  `;
  const otp = rows[0]?.delivery_otp?.trim() ?? "";
  if (!otp) return null;
  const digits = otp.replace(/\D/g, "");
  if (!digits) return null;
  return digits.length >= 4 ? digits.slice(-4) : digits.padStart(4, "0");
}

function foodLiveMeta(
  templateCode: string,
  orderId: string,
  opts?: {
    etaMinutes?: number | null;
    storeName?: string | null;
    deliveryOtp?: string | null;
  }
): LiveProgressMeta | Record<string, unknown> {
  const live = FOOD_LIVE[templateCode];
  if (!live) return { gmType: templateCode, orderId };
  const eta =
    opts?.etaMinutes != null && Number.isFinite(opts.etaMinutes)
      ? Math.max(1, Math.round(opts.etaMinutes))
      : null;
  let liveBody = live.body;
  if (templateCode === "ORDER_PREPARING" && eta != null) liveBody = `Preparing • ${eta} mins`;
  if (templateCode === "ORDER_OUT_FOR_DELIVERY" && eta != null) liveBody = `Arriving in ${eta} mins`;
  if (templateCode === "ORDER_RIDER_ARRIVING" && opts?.deliveryOtp) {
    liveBody = `OTP ${opts.deliveryOtp} · Share with your delivery partner`;
  }
  return {
    gmLiveProgress: true,
    liveService: "food",
    liveStep: live.step,
    liveSteps: FOOD_LIVE_STEPS,
    liveTitle: live.title,
    liveBody,
    orderId,
    ...(opts?.storeName ? { storeName: opts.storeName } : {}),
    ...(eta != null ? { etaMinutes: eta } : {}),
    ...(opts?.deliveryOtp ? { deliveryOtp: opts.deliveryOtp } : {}),
    gmType: templateCode,
  };
}

function rideLiveMeta(
  templateCode: string,
  orderId: string,
  captainName: string
): LiveProgressMeta | Record<string, unknown> {
  const live = RIDE_LIVE[templateCode];
  if (!live) {
    return {
      gmType: templateCode,
      orderId,
      gmLiveProgress: true,
      liveService: "ride",
      liveTitle: "Ride update",
      liveBody: captainName,
      liveStep: 1,
      liveSteps: RIDE_LIVE_STEPS,
    };
  }
  return {
    gmLiveProgress: true,
    liveService: "ride",
    liveStep: live.step,
    liveSteps: RIDE_LIVE_STEPS,
    liveTitle: live.title,
    liveBody: live.body.includes("Captain") || live.body.includes("rider")
      ? live.body
      : `${live.body}${captainName ? ` · ${captainName}` : ""}`,
    orderId,
    gmType: templateCode,
  };
}

function parcelLiveMeta(
  templateCode: string,
  orderId: string,
  riderName: string
): LiveProgressMeta | Record<string, unknown> {
  const live = PARCEL_LIVE[templateCode];
  if (!live) {
    return {
      gmType: templateCode,
      orderId,
      gmLiveProgress: true,
      liveService: "parcel",
      liveTitle: "Parcel update",
      liveBody: riderName,
      liveStep: 1,
      liveSteps: PARCEL_LIVE_STEPS,
    };
  }
  return {
    gmLiveProgress: true,
    liveService: "parcel",
    liveStep: live.step,
    liveSteps: PARCEL_LIVE_STEPS,
    liveTitle: live.title,
    liveBody: riderName && live.step >= 2 ? `${live.body} · ${riderName}` : live.body,
    orderId,
    gmType: templateCode,
  };
}

export async function notifyCustomerFoodLifecycle(args: {
  orderIdText: string;
  templateCode: string;
  riderId?: number | null;
  riderName?: string | null;
  merchantName?: string | null;
  etaMinutes?: number | null;
  orderShortId?: string | null;
  deliveryOtp?: string | null;
}): Promise<void> {
  try {
    const customerId = await customerUserIdForOrderIdText(args.orderIdText);
    if (!customerId) return;

    const riderName =
      args.riderName?.trim() ||
      (args.riderId != null ? await riderDisplayName(args.riderId) : "Your rider");

    const orderShortId = args.orderShortId?.trim() || args.orderIdText;
    const etaMinutes =
      args.etaMinutes != null && Number.isFinite(args.etaMinutes)
        ? Math.max(1, Math.round(args.etaMinutes))
        : 25;

    const deliveryOtp =
      args.deliveryOtp?.trim() ||
      (args.templateCode === "ORDER_RIDER_ARRIVING"
        ? await deliveryOtpForOrderIdText(args.orderIdText)
        : null);

    await sendNotification({
      templateCode: args.templateCode,
      variables: {
        orderId: args.orderIdText,
        orderShortId,
        merchantName: args.merchantName?.trim() || "Store",
        riderName,
        etaMinutes,
        ...(args.templateCode === "ORDER_RIDER_ARRIVING"
          ? { deliveryOtp: deliveryOtp || "your app OTP" }
          : {}),
      },
      target: { user_id: customerId },
      idempotencyKey: `${args.templateCode}:${args.orderIdText}`,
      metadata: foodLiveMeta(args.templateCode, args.orderIdText, {
        etaMinutes,
        storeName: args.merchantName,
        deliveryOtp,
      }),
    });
  } catch (err) {
    console.warn(
      `[lifecycle] food ${args.templateCode} push failed (tolerated)`,
      (err as Error).message
    );
  }
}

export async function notifyCustomerRideLifecycle(args: {
  orderIdText: string;
  templateCode: string;
  riderId?: number | null;
  captainName?: string | null;
}): Promise<void> {
  try {
    const customerId = await customerUserIdForOrderIdText(args.orderIdText);
    if (!customerId) return;

    const captainName =
      args.captainName?.trim() ||
      (args.riderId != null ? await riderDisplayName(args.riderId) : "Your rider");

    await sendNotification({
      templateCode: args.templateCode,
      variables: {
        orderId: args.orderIdText,
        orderShortId: args.orderIdText,
        captainName,
        // ORDER_RIDER_ASSIGNED (and food-parity templates) use {{riderName}}.
        riderName: captainName,
        riderId: args.riderId != null ? String(args.riderId) : "",
      },
      target: { user_id: customerId },
      idempotencyKey: `${args.templateCode}:${args.orderIdText}`,
      metadata: rideLiveMeta(args.templateCode, args.orderIdText, captainName),
    });
  } catch (err) {
    console.warn(
      `[lifecycle] ride ${args.templateCode} push failed (tolerated)`,
      (err as Error).message
    );
  }
}

export async function notifyCustomerParcelLifecycle(args: {
  orderIdText: string;
  templateCode: string;
  riderId?: number | null;
  riderName?: string | null;
}): Promise<void> {
  try {
    const customerId = await customerUserIdForOrderIdText(args.orderIdText);
    if (!customerId) return;

    const riderName =
      args.riderName?.trim() ||
      (args.riderId != null ? await riderDisplayName(args.riderId) : "Your rider");

    await sendNotification({
      templateCode: args.templateCode,
      variables: {
        orderId: args.orderIdText,
        orderShortId: args.orderIdText,
        riderName,
      },
      target: { user_id: customerId },
      idempotencyKey: `${args.templateCode}:${args.orderIdText}`,
      metadata: parcelLiveMeta(args.templateCode, args.orderIdText, riderName),
    });
  } catch (err) {
    console.warn(
      `[lifecycle] parcel ${args.templateCode} push failed (tolerated)`,
      (err as Error).message
    );
  }
}
