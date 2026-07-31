import { eq, and, desc, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { customers, ordersCore, riders, riderVehicles } from "../../db/schema.js";
import { customerOrderRefWhere } from "../../lib/order-ref-resolve.js";
import { normalizeCustomerOrderStatus } from "../../lib/customer-order-status-resolve.js";
import { createSmtpTransporter, formatRideInvoiceSmtpFrom, getSmtpConfig } from "../../lib/smtp-config.js";
import { buildRideInvoiceEmail } from "../../services/email/rideInvoiceTemplate.js";
import { isCustomerEmailVerified } from "../../lib/customer-email-verified.js";
import {
  buildRideInvoicePdfBuffer,
  formatRapidoRideDate,
  rideInvoicePdfFilename,
} from "../../lib/ride-invoice-pdf.js";
import { buildRideInvoiceLinesFromSnapshot, buildRideInvoiceLinesFromBilling } from "./ride-invoice-lines.js";
import { resolveRidePayableTotal } from "./ride-invoice-summary.js";

function formatRideServiceLabel(rideType: string | null | undefined): string {
  const raw = String(rideType ?? "").trim().toLowerCase();
  if (!raw) return "Ride";
  if (raw.includes("cab_premium") || raw === "cab premium") return "Cab Premium Ride";
  if (raw.includes("cab")) return "Cab Ride";
  if (raw.includes("auto")) return "Auto Ride";
  if (raw.includes("bike")) return "Bike Ride";
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) + " Ride";
}

function formatPaymentMethod(method: string | null | undefined): string {
  const m = String(method ?? "").trim().toLowerCase();
  if (!m) return "Online (pay after ride)";
  if (m === "cod" || m === "cash") return "Cash";
  if (m === "upi") return "UPI";
  // "prepaid" is a legacy DB alias for online — payment still happens AFTER the ride.
  if (m === "online" || m === "prepaid") return "Online (pay after ride)";
  return method ?? "Online (pay after ride)";
}

function formatTripStats(distanceKm: unknown, durationMins: unknown): string | null {
  const parts: string[] = [];
  const mins = typeof durationMins === "number" ? durationMins : parseFloat(String(durationMins ?? ""));
  const km = typeof distanceKm === "number" ? distanceKm : parseFloat(String(distanceKm ?? ""));
  if (Number.isFinite(mins) && mins > 0) parts.push(`${Math.round(mins * 10) / 10} mins`);
  if (Number.isFinite(km) && km > 0) parts.push(`${Math.round(km * 10) / 10} kms`);
  return parts.length > 0 ? parts.join(" • ") : null;
}

function formatRideDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function metaCoord(meta: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const n = typeof meta[key] === "number" ? meta[key] : parseFloat(String(meta[key] ?? ""));
    if (Number.isFinite(n) && n !== 0) return n;
  }
  return null;
}

export async function sendRideInvoiceEmailForCustomer(
  db: PostgresJsDatabase<Record<string, unknown>>,
  input: {
    customerPk: number;
    customerSub: string;
    orderRef: string;
    emailOverride?: string | null;
  }
): Promise<{ ok: true; sentTo: string } | { ok: false; code: string; message: string; statusCode?: number }> {
  const smtpCfg = getSmtpConfig();
  if (!smtpCfg.ok) {
    return {
      ok: false,
      code: "SMTP_NOT_CONFIGURED",
      message: "Email service is not configured. Set Zoho SMTP (EMAIL_ID / EMAIL_APP_PASSWORD) on the server.",
      statusCode: 503,
    };
  }

  const [customerRow] = await db
    .select({
      id: customers.id,
      fullName: customers.fullName,
      email: customers.email,
      isEmailVerified: customers.isEmailVerified,
      emailVerified: customers.emailVerified,
    })
    .from(customers)
    .where(eq(customers.id, input.customerPk))
    .limit(1);

  const toEmail = input.emailOverride?.trim() || customerRow?.email?.trim() || "";
  if (!toEmail || !toEmail.includes("@")) {
    return {
      ok: false,
      code: "EMAIL_REQUIRED",
      message: "Add your email in profile to receive the ride invoice.",
      statusCode: 400,
    };
  }

  if (!customerRow || !isCustomerEmailVerified(customerRow)) {
    return {
      ok: false,
      code: "EMAIL_NOT_VERIFIED",
      message: "Verify your email before we can send your ride invoice.",
      statusCode: 403,
    };
  }

  const [orderRow] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      formattedOrderId: ordersCore.formattedOrderId,
      orderType: ordersCore.orderType,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      fareAmount: ordersCore.fareAmount,
      grandTotal: ordersCore.grandTotal,
      tipAmount: ordersCore.tipAmount,
      paymentMethod: ordersCore.paymentMethod,
      paymentStatus: ordersCore.paymentStatus,
      billingSnapshot: ordersCore.billingSnapshot,
      pickupAddressRaw: ordersCore.pickupAddressRaw,
      dropAddressRaw: ordersCore.dropAddressRaw,
      distanceKm: ordersCore.distanceKm,
      placedAt: ordersCore.placedAt,
      checkoutMetadata: ordersCore.checkoutMetadata,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
      riderId: ordersCore.riderId,
    })
    .from(ordersCore)
    .where(customerOrderRefWhere(input.customerPk, input.orderRef))
    .limit(1);

  if (!orderRow?.id) {
    return { ok: false, code: "ORDER_NOT_FOUND", message: "Order not found", statusCode: 404 };
  }
  if (String(orderRow.orderType ?? "") !== "person_ride") {
    return { ok: false, code: "NOT_RIDE_ORDER", message: "Not a ride order", statusCode: 400 };
  }

  const statusUpper = normalizeCustomerOrderStatus(orderRow.currentStatus, orderRow.status);
  if (statusUpper !== "DELIVERED" && statusUpper !== "CANCELLED") {
    return {
      ok: false,
      code: "RIDE_NOT_COMPLETED",
      message: "Invoice is available after the ride is completed.",
      statusCode: 409,
    };
  }

  const snap =
    orderRow.billingSnapshot != null && typeof orderRow.billingSnapshot === "object"
      ? (orderRow.billingSnapshot as Record<string, unknown>)
      : {};

  const meta =
    orderRow.checkoutMetadata != null && typeof orderRow.checkoutMetadata === "object"
      ? (orderRow.checkoutMetadata as Record<string, unknown>)
      : {};

  const { lines: snapshotLines, totalFare: snapshotTotal } = buildRideInvoiceLinesFromSnapshot({
    billingSnapshot: snap,
    fareAmount: orderRow.fareAmount,
    tipAmount: orderRow.tipAmount,
    grandTotal: orderRow.grandTotal,
  });

  let lines = snapshotLines;
  let totalFare = snapshotTotal;
  let billingSnapshotForPdf: Record<string, unknown> = snap;

  try {
    const { computeRideBillForCustomerOrder } = await import("./ride-bill.service.js");
    const billRes = await computeRideBillForCustomerOrder(db, {
      customerPk: input.customerPk,
      orderRef: input.orderRef,
      couponCode:
        typeof snap.ride_fare_coupon_code === "string" ? snap.ride_fare_coupon_code.trim() : null,
      platformOfferId:
        typeof snap.ride_fare_platform_offer_id === "number"
          ? snap.ride_fare_platform_offer_id
          : null,
    });
    if (billRes.ok) {
      const built = buildRideInvoiceLinesFromBilling(billRes.billing);
      lines = built.lines;
      totalFare = resolveRidePayableTotal(billRes.billing);
      billingSnapshotForPdf = {
        ...snap,
        ...billRes.snapshot,
        ...billRes.billing,
        final_amount: billRes.billing.final_amount,
      };
    }
  } catch (billErr) {
    console.warn("[sendRideInvoiceEmailForCustomer] live bill fallback:", billErr);
  }

  const displayOrderId =
    orderRow.formattedOrderId?.trim() || orderRow.orderId?.trim() || String(orderRow.id);
  const rideLabel = formatRideServiceLabel(
    typeof meta.rideType === "string" ? meta.rideType : null
  );

  const pdfFilename = rideInvoicePdfFilename(displayOrderId);
  const paymentMethod = formatPaymentMethod(orderRow.paymentMethod);
  const rideDateIso =
    orderRow.placedAt instanceof Date
      ? orderRow.placedAt.toISOString()
      : orderRow.placedAt
        ? String(orderRow.placedAt)
        : new Date().toISOString();
  const rideDate = formatRapidoRideDate(rideDateIso);
  const durationMins =
    typeof meta.rideDurationMinutes === "number"
      ? meta.rideDurationMinutes
      : parseFloat(String(meta.rideDurationMinutes ?? ""));

  const placeOfSupply =
    (typeof meta.pickupState === "string" && meta.pickupState.trim()) ||
    (typeof meta.state === "string" && meta.state.trim()) ||
    "Bihar";

  let riderName: string | null = null;
  let vehicleNumber: string | null = null;
  if (orderRow.riderId != null) {
    const riderPk = Number(orderRow.riderId);
    if (Number.isFinite(riderPk) && riderPk > 0) {
      const [riderRow] = await db
        .select({ name: riders.name })
        .from(riders)
        .where(eq(riders.id, riderPk))
        .limit(1);
      riderName = riderRow?.name?.trim() || null;

      const [vehicleRow] = await db
        .select({
          registrationNumber: riderVehicles.registrationNumber,
          vehicleNumber: riderVehicles.vehicleNumber,
        })
        .from(riderVehicles)
        .where(
          and(
            eq(riderVehicles.riderId, riderPk),
            eq(riderVehicles.isActive, true),
            isNull(riderVehicles.deletedAt)
          )
        )
        .orderBy(desc(riderVehicles.updatedAt))
        .limit(1);
      vehicleNumber =
        vehicleRow?.registrationNumber?.trim() ||
        vehicleRow?.vehicleNumber?.trim() ||
        null;
    }
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await buildRideInvoicePdfBuffer({
      orderId: displayOrderId,
      coreOrderId: orderRow.id,
      customerPk: input.customerPk,
      rideLabel,
      rideDateIso,
      customerName: customerRow?.fullName?.trim() || "Rider",
      pickupAddress: orderRow.pickupAddressRaw?.trim() || "Pickup",
      dropAddress: orderRow.dropAddressRaw?.trim() || "Drop",
      distanceKm: orderRow.distanceKm != null ? Number(orderRow.distanceKm) : null,
      durationMins: Number.isFinite(durationMins) ? durationMins : null,
      pickupLat:
        orderRow.pickupLat != null
          ? Number(orderRow.pickupLat)
          : metaCoord(meta, "pickupLat", "pickup_lat"),
      pickupLng:
        orderRow.pickupLon != null
          ? Number(orderRow.pickupLon)
          : metaCoord(meta, "pickupLng", "pickup_lon", "pickupLng"),
      dropLat:
        orderRow.dropLat != null
          ? Number(orderRow.dropLat)
          : metaCoord(meta, "dropLat", "drop_lat"),
      dropLng:
        orderRow.dropLon != null
          ? Number(orderRow.dropLon)
          : metaCoord(meta, "dropLng", "drop_lon", "dropLng"),
      lines,
      totalFare,
      paymentMethod,
      billingSnapshot: billingSnapshotForPdf,
      riderName,
      vehicleNumber,
      placeOfSupply,
    });
  } catch (err) {
    console.warn("[sendRideInvoiceEmailForCustomer] PDF build failed:", err);
    return {
      ok: false,
      code: "INVOICE_PDF_FAILED",
      message: "Could not generate ride invoice PDF. Please try again later.",
      statusCode: 502,
    };
  }

  const mail = buildRideInvoiceEmail({
    customerName: customerRow?.fullName?.trim() || "Rider",
    orderId: displayOrderId,
    rideLabel,
    rideDate,
    pickupAddress: orderRow.pickupAddressRaw?.trim() || "Pickup",
    dropAddress: orderRow.dropAddressRaw?.trim() || "Drop",
    tripStats: formatTripStats(orderRow.distanceKm, meta.rideDurationMinutes),
    lines,
    totalFare,
    paymentMethod,
    pdfFilename,
    billingSnapshot: billingSnapshotForPdf,
  });

  const from = formatRideInvoiceSmtpFrom();
  if (!from) {
    return {
      ok: false,
      code: "SMTP_NOT_CONFIGURED",
      message: "Email service is not configured.",
      statusCode: 503,
    };
  }

  try {
    const transporter = await createSmtpTransporter();
    if (!transporter) {
      return {
        ok: false,
        code: "SMTP_NOT_CONFIGURED",
        message: "Email service is not configured.",
        statusCode: 503,
      };
    }

    await transporter.sendMail({
      from,
      to: toEmail,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      attachments: [
        {
          filename: pdfFilename,
          content: pdfBuffer,
          contentType: "application/pdf",
          contentDisposition: "attachment",
        },
      ],
    });

    return { ok: true, sentTo: toEmail };
  } catch (err) {
    console.warn("[sendRideInvoiceEmailForCustomer] SMTP failed:", err);
    return {
      ok: false,
      code: "EMAIL_SEND_FAILED",
      message: "Could not send invoice email. Please try again later.",
      statusCode: 502,
    };
  }
}
