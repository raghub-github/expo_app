import type { RideInvoiceLine } from "../../modules/rides/ride-invoice-lines.js";
import { resolveRapidoPaymentSummary } from "../../modules/rides/ride-invoice-summary.js";

function fmtInr(amount: number): string {
  const v = Math.round(amount * 100) / 100;
  return `₹ ${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function buildRideInvoiceEmail(args: {
  customerName: string;
  orderId: string;
  rideLabel: string;
  rideDate: string;
  pickupAddress: string;
  dropAddress: string;
  tripStats?: string | null;
  lines: RideInvoiceLine[];
  totalFare: number;
  paymentMethod?: string | null;
  pdfFilename: string;
  billingSnapshot?: Record<string, unknown> | null;
}): { subject: string; text: string; html: string } {
  const subject = `GatiMitra Invoice — ${args.orderId}`;
  const paymentMethod = args.paymentMethod?.trim() || "Online";
  const summary = resolveRapidoPaymentSummary(args.billingSnapshot, args.totalFare, {
    excludeTip: true,
  });
  const { rideChargeGross, bookingFeesConvenience, totalFare, discounts } = summary;

  const discountTextLines = discounts.map(
    (row) => `  ${row.label}: -${fmtInr(row.amount)}`
  );

  const text = [
    `Hi ${args.customerName},`,
    "",
    "Thank you for riding with GatiMitra.",
    "",
    `Your ride invoice (${args.pdfFilename}) is attached as a PDF.`,
    "",
    `Ride: ${args.rideLabel}`,
    `Ride ID: ${args.orderId}`,
    `Date: ${args.rideDate}`,
    "",
    "Trip",
    `  Pickup: ${args.pickupAddress}`,
    `  Drop: ${args.dropAddress}`,
    args.tripStats ? `  ${args.tripStats}` : "",
    "",
    "Bill Details",
    `  Ride Charge: ${fmtInr(rideChargeGross)}`,
    `  Booking Fees & Convenience Charges: ${fmtInr(bookingFeesConvenience)}`,
    ...discountTextLines,
    `  Total Amount: ${fmtInr(totalFare)} (Inclusive of Taxes)`,
    "",
    `You paid using: ${paymentMethod} — ${fmtInr(totalFare)}`,
    "",
    "Team GatiMitra",
  ]
    .filter(Boolean)
    .join("\n");

  const discountRowsHtml = discounts
    .map(
      (row) => `
        <tr>
          <td style="padding:10px 0;color:#E5E7EB;font-size:14px;">${row.label}</td>
          <td style="padding:10px 0;text-align:right;font-size:14px;font-weight:700;color:#60A5FA;">-${fmtInr(row.amount)}</td>
        </tr>`
    )
    .join("");

  const feeRowsHtml = `
        <tr>
          <td style="padding:10px 0;color:#E5E7EB;font-size:14px;">Ride Charge</td>
          <td style="padding:10px 0;text-align:right;font-size:14px;font-weight:600;color:#FFFFFF;">${fmtInr(rideChargeGross)}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#E5E7EB;font-size:14px;">Booking Fees &amp; Convenience Charges</td>
          <td style="padding:10px 0;text-align:right;font-size:14px;font-weight:600;color:#FFFFFF;">${fmtInr(bookingFeesConvenience)}</td>
        </tr>${discountRowsHtml}`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;background:#F3F4F6;padding:20px;">
      <div style="background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E5E7EB;">
        <div style="padding:24px 24px 16px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="font-size:18px;font-weight:800;color:#111827;">Payment Summary</td>
              <td style="text-align:right;font-size:20px;font-weight:800;color:#059669;">GatiMitra</td>
            </tr>
          </table>
          <p style="margin:16px 0 4px;font-size:12px;color:#9CA3AF;">Ride ID</p>
          <p style="margin:0 0 14px;font-size:14px;font-weight:700;color:#111827;">${args.orderId}</p>
          <p style="margin:0 0 4px;font-size:12px;color:#9CA3AF;">Time of Ride</p>
          <p style="margin:0 0 18px;font-size:14px;color:#111827;">${args.rideDate}</p>
          <div style="background:#F3F4F6;border-radius:12px;padding:16px 20px;margin-bottom:18px;">
            <p style="margin:0;font-size:13px;color:#6B7280;">Total</p>
            <p style="margin:4px 0 0;font-size:28px;font-weight:800;color:#111827;">${fmtInr(totalFare)}</p>
          </div>
          ${args.tripStats ? `<p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#374151;">${args.tripStats}</p>` : ""}
          <p style="margin:0 0 6px;font-size:13px;color:#374151;"><span style="color:#10B981;">●</span> ${args.pickupAddress}</p>
          <p style="margin:0;font-size:13px;color:#374151;"><span style="color:#EF4444;">●</span> ${args.dropAddress}</p>
        </div>

        <div style="background:#141414;padding:24px;">
          <p style="margin:0 0 14px;font-size:16px;font-weight:800;color:#FFFFFF;">Bill Details</p>
          <table style="width:100%;border-collapse:collapse;">
            ${feeRowsHtml}
            <tr>
              <td style="padding:14px 0 4px;border-top:1px solid #374151;font-size:15px;font-weight:800;color:#FFFFFF;">Total Amount</td>
              <td style="padding:14px 0 4px;border-top:1px solid #374151;text-align:right;font-size:15px;font-weight:800;color:#FFFFFF;">${fmtInr(totalFare)}</td>
            </tr>
          </table>
          <p style="margin:6px 0 0;font-size:11px;color:#9CA3AF;">(Inclusive of Taxes)</p>
        </div>

        <div style="background:#1F1F1F;padding:20px 24px;">
          <p style="margin:0 0 8px;font-size:12px;color:#9CA3AF;">You Paid Using</p>
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="font-size:15px;font-weight:700;color:#FFFFFF;">${paymentMethod}</td>
              <td style="text-align:right;font-size:15px;font-weight:700;color:#FFFFFF;">${fmtInr(totalFare)}</td>
            </tr>
          </table>
        </div>
      </div>

      <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#4B5563;text-align:center;">
        Hi ${args.customerName}, your full invoice is attached as <strong>${args.pdfFilename}</strong>.
      </p>
      <p style="margin:8px 0 0;font-size:11px;color:#9CA3AF;text-align:center;">
        System-generated · GatiMitra Mobility
      </p>
    </div>`;

  return { subject, text, html };
}
