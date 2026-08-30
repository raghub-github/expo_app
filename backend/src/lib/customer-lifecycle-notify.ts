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
  RIDE_RIDER_NEARBY: { step: 2, title: "Captain Nearby", body: "Be ready at pickup" },
  RIDE_RIDER_ARRIVED: { step: 3, title: "Captain Has Arrived", body: "Meet your captain" },
  RIDE_TRIP_STARTED: { step: 4, title: "Trip Started", body: "Have a safe ride" },
  RIDE_NEAR_DESTINATION: { step: 5, title: "Approaching Destination", body: "Almost there" },
  RIDE_COMPLETED: { step: 6, title: "Ride Completed", body: "Please rate your ride" },
};

/** Parcel: Accepted → On way → At pickup → Picked up → Nearby → Delivered */
const PARCEL_LIVE: Record<string, { step: number; title: string; body: string }> = {
  PARCEL_ACCEPTED: { step: 1, title: "Parcel Accepted", body: "Looking for a captain" },
  PARCEL_RIDER_ON_THE_WAY: { step: 2, title: "Rider On The Way", body: "Collecting your parcel" },
  PARCEL_RIDER_AT_PICKUP: { step: 3, title: "Rider at Pickup", body: "Share pickup PIN" },
  PARCEL_PICKED_UP: { step: 4, title: "Parcel Picked Up", body: "On the way" },
  PARCEL_RIDER_NEARBY: { step: 5, title: "Rider Nearby", body: "Share delivery OTP" },
  PARCEL_DELIVERED: { step: 6, title: "Parcel Delivered", body: "Delivered successfully" },
};

const FOOD_LIVE_STEPS = 5;
const RIDE_LIVE_STEPS = 6;
const PARCEL_LIVE_STEPS = 6;

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

/** Resolve 4-digit pickup OTP for customer-facing arrival notification. */
export async function pickupOtpForOrderIdText(orderIdText: string): Promise<string | null> {
  const sql = getSql();
  const rows = await sql<{ pickup_otp: string | null }[]>`
    SELECT NULLIF(TRIM(oc.pickup_otp), '') AS pickup_otp
    FROM orders_core oc
    WHERE oc.order_id = ${orderIdText}
       OR oc.formatted_order_id = ${orderIdText}
       OR oc.id::text = ${orderIdText}
    LIMIT 1
  `;
  const otp = rows[0]?.pickup_otp?.trim() ?? "";
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
  captainName: string,
  pickupOtp?: string | null
): LiveProgressMeta | Record<string, unknown> {
  const live = RIDE_LIVE[templateCode];
  const otp = pickupOtp?.trim() || null;
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
      ...(otp ? { pickupOtp: otp } : {}),
    };
  }
  const bodyWithOtp =
    otp && (templateCode === "RIDE_RIDER_NEARBY" || templateCode === "RIDE_RIDER_ARRIVED")
      ? `${live.body} · PIN ${otp}`
      : live.body;
  return {
    gmLiveProgress: true,
    liveService: "ride",
    liveStep: live.step,
    liveSteps: RIDE_LIVE_STEPS,
    liveTitle: live.title,
    liveBody: bodyWithOtp.includes("Captain") || bodyWithOtp.includes("rider")
      ? bodyWithOtp
      : `${bodyWithOtp}${captainName ? ` · ${captainName}` : ""}`,
    orderId,
    gmType: templateCode,
    ...(otp ? { pickupOtp: otp } : {}),
  };
}

function parcelLiveMeta(
  templateCode: string,
  orderId: string,
  riderName: string,
  opts?: { deliveryOtp?: string | null; pickupOtp?: string | null }
): LiveProgressMeta | Record<string, unknown> {
  const live = PARCEL_LIVE[templateCode];
  const deliveryOtp = opts?.deliveryOtp?.trim() || null;
  const pickupOtp = opts?.pickupOtp?.trim() || null;
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
      ...(deliveryOtp ? { deliveryOtp } : {}),
      ...(pickupOtp ? { pickupOtp } : {}),
    };
  }
  let bodyWithOtp = live.body;
  if (pickupOtp && templateCode === "PARCEL_RIDER_AT_PICKUP") {
    bodyWithOtp = `${live.body} · PIN ${pickupOtp}`;
  } else if (deliveryOtp && templateCode === "PARCEL_RIDER_NEARBY") {
    bodyWithOtp = `${live.body} · OTP ${deliveryOtp}`;
  }
  return {
    gmLiveProgress: true,
    liveService: "parcel",
    liveStep: live.step,
    liveSteps: PARCEL_LIVE_STEPS,
    liveTitle: live.title,
    liveBody: riderName && live.step >= 2 ? `${bodyWithOtp} · ${riderName}` : bodyWithOtp,
    orderId,
    gmType: templateCode,
    ...(deliveryOtp ? { deliveryOtp } : {}),
    ...(pickupOtp ? { pickupOtp } : {}),
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

    // OTP copy is sent via CUSTOMER_DELIVERY_OTP_NEARBY (radius helper).
    // Stage ORDER_RIDER_ARRIVING stays progress-only to avoid duplicate OTP pushes.
    await sendNotification({
      templateCode: args.templateCode,
      variables: {
        orderId: args.orderIdText,
        orderShortId,
        merchantName: args.merchantName?.trim() || "Store",
        riderName,
        rider_name: riderName,
        etaMinutes,
      },
      target: { user_id: customerId },
      idempotencyKey: `${args.templateCode}:${args.orderIdText}`,
      metadata: foodLiveMeta(args.templateCode, args.orderIdText, {
        etaMinutes,
        storeName: args.merchantName,
        deliveryOtp:
          args.templateCode === "ORDER_RIDER_ARRIVING" ? null : deliveryOtp,
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
  includePickupOtp?: boolean;
  pickupOtp?: string | null;
}): Promise<void> {
  try {
    const customerId = await customerUserIdForOrderIdText(args.orderIdText);
    if (!customerId) return;

    const captainName =
      args.captainName?.trim() ||
      (args.riderId != null ? await riderDisplayName(args.riderId) : "Your rider");

    const wantsPickupOtp = args.includePickupOtp === true;
    const pickupOtp =
      args.pickupOtp?.trim() ||
      (wantsPickupOtp ? await pickupOtpForOrderIdText(args.orderIdText) : null);

    const meta = rideLiveMeta(args.templateCode, args.orderIdText, captainName, pickupOtp);
    const liveTitle =
      "liveTitle" in meta && typeof meta.liveTitle === "string" ? meta.liveTitle.trim() : "";
    const liveBody =
      "liveBody" in meta && typeof meta.liveBody === "string" ? meta.liveBody.trim() : "";
    await sendNotification({
      templateCode: args.templateCode,
      variables: {
        orderId: args.orderIdText,
        orderShortId: args.orderIdText,
        captainName,
        // ORDER_RIDER_ASSIGNED (and food-parity templates) use {{riderName}}.
        riderName: captainName,
        rider_name: captainName,
        riderId: args.riderId != null ? String(args.riderId) : "",
        ...(wantsPickupOtp && pickupOtp
          ? { pickupOtp, pickup_otp: pickupOtp }
          : {}),
      },
      target: { user_id: customerId },
      idempotencyKey: `${args.templateCode}:${args.orderIdText}`,
      metadata: meta,
      ...(liveTitle
        ? { overrides: { title: liveTitle, body: liveBody || undefined } }
        : {}),
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
  /** Attach delivery OTP only at drop-radius nearby stage. */
  includeDeliveryOtp?: boolean;
  deliveryOtp?: string | null;
  includePickupOtp?: boolean;
  pickupOtp?: string | null;
}): Promise<void> {
  try {
    const customerId = await customerUserIdForOrderIdText(args.orderIdText);
    if (!customerId) return;

    const riderName =
      args.riderName?.trim() ||
      (args.riderId != null ? await riderDisplayName(args.riderId) : "Your rider");

    const wantsDeliveryOtp = args.includeDeliveryOtp === true;
    const wantsPickupOtp = args.includePickupOtp === true;

    const deliveryOtp =
      args.deliveryOtp?.trim() ||
      (wantsDeliveryOtp ? await deliveryOtpForOrderIdText(args.orderIdText) : null);
    const pickupOtp =
      args.pickupOtp?.trim() ||
      (wantsPickupOtp ? await pickupOtpForOrderIdText(args.orderIdText) : null);

    await sendNotification({
      templateCode: args.templateCode,
      variables: {
        orderId: args.orderIdText,
        orderShortId: args.orderIdText,
        riderName,
        rider_name: riderName,
        ...(wantsDeliveryOtp
          ? {
              deliveryOtp: deliveryOtp || "your app OTP",
              delivery_otp: deliveryOtp || "your app OTP",
            }
          : {}),
        ...(wantsPickupOtp
          ? {
              pickupOtp: pickupOtp || "your app OTP",
              pickup_otp: pickupOtp || "your app OTP",
            }
          : {}),
      },
      target: { user_id: customerId },
      idempotencyKey: `${args.templateCode}:${args.orderIdText}`,
      metadata: parcelLiveMeta(args.templateCode, args.orderIdText, riderName, {
        deliveryOtp,
        pickupOtp,
      }),
    });
  } catch (err) {
    console.warn(
      `[lifecycle] parcel ${args.templateCode} push failed (tolerated)`,
      (err as Error).message
    );
  }
}
