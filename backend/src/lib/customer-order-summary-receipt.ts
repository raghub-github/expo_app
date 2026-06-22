/**
 * Zomato-style order summary receipt — HTML for Bill Summary download in customer app.
 * No platform FSSAI footer (GatiMitra is not an FBO). Restaurant FSSAI shown left only when available.
 */

import { parseOrderBillFromSnapshot } from "./customer-order-bill-breakdown.js";

export type CustomerOrderSummaryReceiptItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

export type CustomerOrderSummaryReceiptInput = {
  formattedOrderId: string;
  orderDateIso: string;
  customerName: string;
  deliveryAddress: string | null;
  restaurantName: string;
  restaurantAddress: string | null;
  restaurantFssai: string | null;
  riderName: string | null;
  paymentMethod: string | null;
  orderType: string | null;
  items: CustomerOrderSummaryReceiptItem[];
  billingSnapshot: Record<string, unknown> | null;
  fallbackTotal: number | null;
  fallbackTipAmount: number | null;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtInr(n: number): string {
  return `₹${round2(n).toFixed(2)}`;
}

function formatOrderDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso.slice(0, 16);
  }
}

function receiptStyles(): string {
  return `
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #111;
      margin: 0;
      padding: 20px 22px 28px;
      background: #fff;
      font-size: 12px;
      line-height: 1.35;
    }
    h1 {
      font-size: 15px;
      font-weight: 700;
      margin: 0 0 14px;
      line-height: 1.3;
    }
    .meta { margin-bottom: 14px; }
    .meta p { margin: 2px 0; }
    .meta .k { font-weight: 700; }
    table.items {
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0 10px;
      font-size: 11px;
    }
    table.items thead th {
      background: #b5b5b5;
      color: #fff;
      font-weight: 700;
      padding: 7px 8px;
      text-align: left;
    }
    table.items thead th.num { text-align: right; }
    table.items tbody td {
      padding: 7px 8px;
      border-bottom: 1px solid #ececec;
      vertical-align: top;
    }
    table.items tbody td.num { text-align: right; white-space: nowrap; }
    .summary {
      width: 100%;
      max-width: 300px;
      margin-left: auto;
      margin-top: 4px;
      font-size: 11px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 2px 0;
    }
    .summary-row.discount { color: #2563eb; }
    .summary-row.wallet { color: #2563eb; }
    .total-bar {
      background: #e6e6e6;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 7px 10px;
      font-weight: 700;
      font-size: 12px;
      margin-top: 6px;
    }
    .terms {
      margin-top: 18px;
      font-size: 8.5px;
      color: #333;
      line-height: 1.45;
    }
    .terms h2 {
      font-size: 9px;
      font-weight: 700;
      margin: 0 0 5px;
    }
    .terms a { color: #2563eb; text-decoration: none; }
    .terms ol { margin: 0; padding-left: 14px; }
    .terms li { margin-bottom: 3px; }
    .footer {
      margin-top: 22px;
      padding-top: 10px;
      border-top: 1px solid #eee;
      color: #aaa;
      font-size: 8.5px;
      line-height: 1.4;
    }
    .footer-name { font-weight: 600; color: #999; margin-bottom: 2px; }
    @media print {
      body { padding: 12px; }
    }
  `;
}

function metaRow(label: string, value: string | null | undefined): string {
  if (!value?.trim()) return "";
  return `<p><span class="k">${escapeHtml(label)}:</span> ${escapeHtml(value.trim())}</p>`;
}

function summaryRow(label: string, amount: number, opts?: { discount?: boolean; wallet?: boolean }): string {
  const cls = opts?.discount ? "discount" : opts?.wallet ? "wallet" : "";
  const display = fmtInr(Math.abs(amount));
  const value = opts?.discount || opts?.wallet ? `( ${display} )` : display;
  return `<div class="summary-row ${cls}"><span>${escapeHtml(label)}</span><span>${value}</span></div>`;
}

const TERMS_URL =
  process.env.CUSTOMER_TERMS_URL?.trim() || "https://gatimitra.com/legal/terms";

const TERMS_ITEMS = [
  "This is an order summary receipt issued by GatiMitra for your food order placed on the platform.",
  "Food items are supplied by the restaurant partner listed above. GatiMitra facilitates ordering and delivery.",
  "Taxes and charges shown are as per the billing snapshot at the time of order placement.",
  "Refunds, if applicable, are processed per GatiMitra refund and cancellation policy.",
  "For order-related support, use in-app Help or write to order@gatimitra.com.",
  "This document is not a tax invoice for platform or delivery fees. Download the tax invoice separately when available.",
];

export function buildCustomerOrderSummaryReceiptHtml(input: CustomerOrderSummaryReceiptInput): string {
  const isRide = input.orderType === "person_ride";
  const title = isRide
    ? "GatiMitra Ride Order: Summary and Receipt"
    : "GatiMitra Food Order: Summary and Receipt";

  const bill = parseOrderBillFromSnapshot(
    input.billingSnapshot,
    input.fallbackTotal,
    input.fallbackTipAmount
  );

  const itemRows = input.items
    .map((item) => {
      const qty = Math.max(1, Math.round(item.quantity));
      const unit = item.unitPrice > 0 ? item.unitPrice : item.totalPrice / qty;
      const total = item.totalPrice > 0 ? item.totalPrice : unit * qty;
      return `<tr>
        <td>${escapeHtml(item.name)}</td>
        <td class="num">${qty}</td>
        <td class="num">${fmtInr(unit)}</td>
        <td class="num">${fmtInr(total)}</td>
      </tr>`;
    })
    .join("");

  const summaryLines: string[] = [];
  if (bill.gstAndPackaging > 0.005) {
    summaryLines.push(summaryRow("Taxes", bill.gstAndPackaging));
  }
  if (bill.deliveryFee > 0.005 || bill.deliveryFeeOriginal != null) {
    summaryLines.push(summaryRow("Delivery charge subtotal", bill.deliveryFee));
  }
  if (bill.platformFee > 0.005) {
    summaryLines.push(summaryRow("Platform fee", bill.platformFee));
  }
  if (bill.donation > 0.005) {
    summaryLines.push(summaryRow("Feeding India donation", bill.donation));
  }
  if (bill.tipAmount > 0.005) {
    summaryLines.push(summaryRow("Tip for delivery partner", bill.tipAmount));
  }
  if (bill.surgeFee > 0.005) {
    summaryLines.push(summaryRow("Surge fee", bill.surgeFee));
  }
  if (bill.smallOrderFee > 0.005) {
    summaryLines.push(summaryRow("Small order fee", bill.smallOrderFee));
  }
  if (bill.convenienceFee > 0.005) {
    summaryLines.push(summaryRow("Convenience fee", bill.convenienceFee));
  }
  if (bill.miscFee > 0.005) {
    summaryLines.push(summaryRow("Other charges", bill.miscFee));
  }
  if (bill.subscriptionFee > 0.005) {
    summaryLines.push(summaryRow(bill.subscriptionLabel ?? "Membership", bill.subscriptionFee));
  }
  if (bill.couponDiscount > 0.005) {
    const label = bill.couponCode
      ? `Coupon applied — ${bill.couponCode}`
      : "Limited time offer";
    summaryLines.push(summaryRow(label, -bill.couponDiscount, { discount: true }));
  }
  if (bill.gatiCashApplied > 0.005) {
    summaryLines.push(summaryRow("Using GatiCash", -bill.gatiCashApplied, { wallet: true }));
  }
  if (bill.missedOfferDiscount > 0.005) {
    summaryLines.push(summaryRow("Offer discount", -bill.missedOfferDiscount, { discount: true }));
  }
  if (bill.missedOfferWalletAdd > 0.005) {
    summaryLines.push(summaryRow("Add to GatiCash wallet", bill.missedOfferWalletAdd));
  }

  const paidAmount = bill.paid > 0.005 ? bill.paid : bill.grandTotal;

  const footerFssai =
    input.restaurantFssai?.trim() && !isRide
      ? `<div class="footer">
          <div class="footer-name">${escapeHtml(input.restaurantName)}</div>
          <div>FSSAI Lic. No. ${escapeHtml(input.restaurantFssai.trim())}</div>
        </div>`
      : `<div class="footer">
          <div class="footer-name">GatiMitra</div>
          <div>Order summary receipt</div>
        </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(title)} — ${escapeHtml(input.formattedOrderId)}</title>
  <style>${receiptStyles()}</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>

  <div class="meta">
    ${metaRow("Order ID", input.formattedOrderId)}
    ${metaRow("Order Time", formatOrderDateTime(input.orderDateIso))}
    ${metaRow("Customer Name", input.customerName)}
    ${metaRow("Delivery Address", input.deliveryAddress)}
    ${metaRow("Restaurant Name", isRide ? null : input.restaurantName)}
    ${metaRow("Restaurant Address", isRide ? null : input.restaurantAddress)}
    ${metaRow("Delivery partner's Name", input.riderName)}
    ${input.paymentMethod ? metaRow("Payment", input.paymentMethod.replace(/_/g, " ").toUpperCase()) : ""}
  </div>

  <table class="items">
    <thead>
      <tr>
        <th>Item</th>
        <th class="num">Quantity</th>
        <th class="num">Unit Price</th>
        <th class="num">Total Price</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows || `<tr><td colspan="4">No line items recorded</td></tr>`}
    </tbody>
  </table>

  <div class="summary">
    ${summaryLines.join("\n")}
    <div class="total-bar">
      <span>Total</span>
      <span>${fmtInr(paidAmount)}</span>
    </div>
  </div>

  <div class="terms">
    <h2>Terms &amp; Conditions (<a href="${escapeHtml(TERMS_URL)}">${escapeHtml(TERMS_URL)}</a>)</h2>
    <ol>
      ${TERMS_ITEMS.map((t) => `<li>${escapeHtml(t)}</li>`).join("\n")}
    </ol>
  </div>

  ${footerFssai}
</body>
</html>`;
}

export function receiptHtmlFilename(formattedOrderId: string): string {
  const safe = formattedOrderId.replace(/[^\w-]+/g, "_");
  return `GatiMitra-Order-Receipt-${safe}.pdf`;
}
