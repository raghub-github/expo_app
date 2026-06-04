import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { orderOtps, ordersCore, ordersFood } from "../db/schema.js";

type DbTx = PostgresJsDatabase<Record<string, unknown>>;

export function normalizeFoodOtpCode(raw: unknown): string {
  const digits = String(raw ?? "")
    .trim()
    .replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length >= 4) return digits.slice(-4);
  return digits.padStart(4, "0");
}

export type FoodOtpCandidates = {
  deliveryCodes: string[];
  pickupCode: string | null;
};

/** Resolve delivery OTP from all stores (customer app uses orders_core.delivery_otp). */
export async function loadFoodDeliveryOtpCandidates(
  tx: DbTx,
  orderCorePk: number
): Promise<FoodOtpCandidates> {
  const deliverySet = new Set<string>();
  let pickupCode: string | null = null;

  const addDelivery = (raw: unknown) => {
    const n = normalizeFoodOtpCode(raw);
    if (n) deliverySet.add(n);
  };
  const addPickup = (raw: unknown) => {
    const n = normalizeFoodOtpCode(raw);
    if (n && !pickupCode) pickupCode = n;
  };

  const [row] = await tx
    .select({
      coreDelivery: ordersCore.deliveryOtp,
      corePickup: ordersCore.pickupOtp,
      foodDelivery: ordersFood.deliveryOtp,
      foodPickup: ordersFood.pickupOtp,
    })
    .from(ordersCore)
    .innerJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
    .where(eq(ordersCore.id, orderCorePk))
    .limit(1);

  if (row) {
    addDelivery(row.coreDelivery);
    addDelivery(row.foodDelivery);
    addPickup(row.corePickup);
    addPickup(row.foodPickup);
  }

  try {
    const foodOtpResult = await tx.execute(sql`
      SELECT otp_type::text AS otp_type, otp_code
      FROM order_food_otps
      WHERE order_id = ${orderCorePk}
    `);
    const foodOtpRows = Array.isArray(foodOtpResult)
      ? foodOtpResult
      : [];

    for (const r of foodOtpRows as { otp_type?: string; otp_code?: string }[]) {
      const t = String(r.otp_type ?? "").toUpperCase();
      if (t === "DELIVERY") addDelivery(r.otp_code);
      else if (t === "PICKUP") addPickup(r.otp_code);
    }
  } catch {
    /* optional legacy table */
  }

  try {
    const unified = await tx
      .select({ otpType: orderOtps.otpType, code: orderOtps.code })
      .from(orderOtps)
      .where(eq(orderOtps.orderId, orderCorePk));

    for (const r of unified) {
      const t = String(r.otpType ?? "").toLowerCase();
      if (t === "delivery") addDelivery(r.code);
      else if (t === "pickup") addPickup(r.code);
    }
  } catch {
    /* order_otps may be absent on some DBs */
  }

  return { deliveryCodes: [...deliverySet], pickupCode };
}

export function assertFoodDeliveryOtpMatch(
  otpInput: string,
  candidates: FoodOtpCandidates
): void {
  const normalized = normalizeFoodOtpCode(otpInput);
  if (normalized.length !== 4) {
    throw Object.assign(new Error("Enter the 4-digit delivery OTP"), { statusCode: 400 });
  }

  if (candidates.deliveryCodes.length === 0) {
    throw Object.assign(
      new Error("Delivery OTP is not available for this order. Ask the customer to open their order in the app."),
      { statusCode: 409 }
    );
  }

  if (candidates.deliveryCodes.includes(normalized)) {
    return;
  }

  if (candidates.pickupCode && candidates.pickupCode === normalized) {
    throw Object.assign(
      new Error(
        "That is the restaurant pickup OTP, not the delivery OTP. Ask the customer for the delivery OTP shown in their GatiMitra app."
      ),
      { statusCode: 403 }
    );
  }

  throw Object.assign(new Error("Incorrect delivery OTP"), { statusCode: 403 });
}
