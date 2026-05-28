import { getSql } from "../client";

export type DashboardOrderOtps = {
  pickupOtp: string | null;
  rtoOtp: string | null;
  deliveryOtp: string | null;
};

function pickCode(...values: Array<string | null | undefined>): string | null {
  for (const v of values) {
    const t = v?.trim();
    if (t) return t;
  }
  return null;
}

/**
 * Resolve pickup, RTO, and delivery OTPs for dashboard order detail (orders_core id).
 */
export async function getOrderOtpsForDashboard(
  orderId: number
): Promise<DashboardOrderOtps> {
  const sql = getSql();

  let pickupFromFoodOtps: string | null = null;
  let rtoFromFoodOtps: string | null = null;
  let pickupFromOtps: string | null = null;
  let rtoFromOtps: string | null = null;
  let deliveryFromOtps: string | null = null;
  let pickupFromFood: string | null = null;
  let rtoFromFood: string | null = null;
  let pickupFromCore: string | null = null;
  let rtoFromCore: string | null = null;

  try {
    const rows = await sql`
      SELECT otp_type::text AS otp_type, code
      FROM order_otps
      WHERE order_id = ${orderId}
    `;
    for (const row of rows as unknown as Array<{ otp_type: string; code: string }>) {
      const t = String(row.otp_type ?? "").toLowerCase();
      const code = row.code?.trim() || null;
      if (!code) continue;
      if (t === "pickup") pickupFromOtps = code;
      else if (t === "rto") rtoFromOtps = code;
      else if (t === "delivery") deliveryFromOtps = code;
    }
  } catch {
    // order_otps may be unavailable during migration
  }

  try {
    const rows = await sql`
      SELECT otp_type::text AS otp_type, otp_code
      FROM order_food_otps
      WHERE order_id = ${orderId}
    `;
    for (const row of rows as unknown as Array<{ otp_type: string; otp_code: string }>) {
      const t = String(row.otp_type ?? "").toUpperCase();
      const code = row.otp_code?.trim() || null;
      if (!code) continue;
      if (t === "PICKUP") pickupFromFoodOtps = code;
      else if (t === "RTO") rtoFromFoodOtps = code;
      else if (t === "DELIVERY") deliveryFromOtps = deliveryFromOtps ?? code;
    }
  } catch {
    // optional legacy table
  }

  try {
    const rows = await sql`
      SELECT pickup_otp, rto_otp
      FROM orders_food
      WHERE order_id = ${orderId}
      LIMIT 1
    `;
    const row = (rows as unknown as Array<{ pickup_otp?: string; rto_otp?: string }>)[0];
    pickupFromFood = row?.pickup_otp?.trim() || null;
    rtoFromFood = row?.rto_otp?.trim() || null;
  } catch {
    // columns may not exist on all environments
  }

  try {
    const rows = await sql`
      SELECT pickup_otp, rto_otp
      FROM orders_core
      WHERE id = ${orderId}
      LIMIT 1
    `;
    const row = (rows as unknown as Array<{ pickup_otp?: string; rto_otp?: string }>)[0];
    pickupFromCore = row?.pickup_otp?.trim() || null;
    rtoFromCore = row?.rto_otp?.trim() || null;
  } catch {
    // columns may not exist on all environments
  }

  return {
    pickupOtp: pickCode(
      pickupFromFoodOtps,
      pickupFromOtps,
      pickupFromFood,
      pickupFromCore
    ),
    rtoOtp: pickCode(rtoFromFoodOtps, rtoFromOtps, rtoFromFood, rtoFromCore),
    deliveryOtp: deliveryFromOtps,
  };
}
