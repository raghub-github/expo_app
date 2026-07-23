import type { BillPrintPayload } from "./types";
import {
  formatOrderIdForPrint,
  formatOrderPlacedAt,
  formatOrderRs,
  formatMoney,
  escapeHtml,
} from "./format";
import { merchantBillPartsFromItems, merchantItemCatalogAndNet, itemCookingNote } from "./billMath";

/**
 * Production bill HTML — GatiMitra tax invoice layout (Partner Site reference).
 */
export function buildBillHtml(payload: BillPrintPayload): string {
  const { store, items, pricing } = payload;
  const bill = merchantBillPartsFromItems(items, pricing);
  const orderIdDisplay = formatOrderIdForPrint(payload.formattedOrderId);
  const otp = payload.pickupOtp?.trim();
  const printAt = payload.printTimestamp
    ? formatOrderPlacedAt(payload.printTimestamp)
    : null;

  const itemRows = items
    .map((item) => {
      const qty = item.quantity || 1;
      const { catalog, net, showStrike, offerBadge } = merchantItemCatalogAndNet(item);
      const amtLabel = showStrike
        ? `<span style="text-decoration:line-through;color:#888;margin-right:4px">${formatMoney(catalog)}</span>${formatMoney(net)}`
        : formatMoney(net);
      const unitLabel = showStrike
        ? `${qty} x ${Math.round(net / Math.max(1, qty))}`
        : `${qty} x ${Math.round(Number(item.price || 0))}`;
      const note = itemCookingNote(item);
      return `<tr>
          <td class="item-name">${escapeHtml(item.name)}${
            offerBadge
              ? `<div style="font-size:10px;color:#b45309;font-weight:700">${escapeHtml(offerBadge)}</div>`
              : ""
          }${
            note
              ? `<div style="font-size:11px;color:#92400e;font-weight:600;margin-top:2px">Cooking: ${escapeHtml(note)}</div>`
              : ""
          }</td>
          <td class="item-qty">${unitLabel}</td>
          <td class="item-amt">${amtLabel}</td>
        </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>GatiMitra order ${escapeHtml(orderIdDisplay)}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; padding: 16px 18px 12px; font-size: 12.5px; line-height: 1.38; }
    .invoice-header {
      background: #ffffff;
      color: #111;
      padding: 0 0 9px;
      margin-bottom: 11px;
      border-bottom: 2px solid #111;
    }
    .company { font-size: 15px; font-weight: 800; letter-spacing: 0.02em; margin: 0; line-height: 1.28; color: #111; }
    .company-sub { font-size: 10px; color: #555; margin: 3px 0 0; letter-spacing: 0.06em; text-transform: uppercase; }
    .order-badge {
      display: inline-block; margin-top: 8px;
      background: #ffffff; color: #111;
      font-size: 12px; font-weight: 800; letter-spacing: 0.04em;
      padding: 2px 9px; border-radius: 5px; border: 1px solid #333;
    }
    .store { font-size: 15px; font-weight: 700; margin: 0 0 3px; }
    .muted { color: #555; font-size: 11px; margin: 0 0 2px; }
    .divider { border-top: 1px solid #d7d7d7; margin: 9px 0; }
    .meta-row { font-size: 12px; margin: 0 0 3px; }
    .paid { font-weight: 800; font-size: 13px; }
    .cust { margin: 0 0 3px; font-size: 12px; }
    .section-title { text-align: center; font-weight: 800; font-size: 13px; margin: 8px 0 6px; }
    table { width: 100%; border-collapse: collapse; }
    .item-name { text-align: left; padding: 3px 8px 3px 0; vertical-align: top; word-break: break-word; }
    .item-qty { text-align: center; white-space: nowrap; padding: 3px; color: #333; }
    .item-amt { text-align: right; white-space: nowrap; padding: 3px 0 3px 8px; font-weight: 600; }
    .summary { margin-top: 8px; font-size: 12.5px; }
    .summary div { display: flex; justify-content: space-between; margin-bottom: 3px; }
    .summary .discount { color: #b45309; }
    .total-row { display: flex; justify-content: space-between; align-items: baseline; margin-top: 8px; padding-top: 6px; border-top: 1.5px solid #111; font-size: 20px; font-weight: 800; }
    .otp { font-size: 20px; font-weight: 800; }
    .print-time { margin-top: 18px; text-align: right; font-size: 10.5px; color: #777; }
    .footer { margin-top: 4px; font-size: 10.5px; color: #888; text-align: center; }
    @page { size: A4; margin: 0; }
    @media print {
      html, body { width: 100%; }
      body { padding: 12mm 12mm 8mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="invoice-header">
    <p class="company">GATIMITRA ON DEMAND SERVICES PRIVATE LIMITED</p>
    <p class="company-sub">Restaurant Partner · Tax Invoice</p>
    <span class="order-badge">Order ${escapeHtml(orderIdDisplay)}</span>
  </div>
  <p class="store">${escapeHtml(store.storeName)}</p>
  ${store.fullAddress ? `<p class="muted">${escapeHtml(store.fullAddress)}</p>` : ""}
  ${
    store.cuisineLabel
      ? `<p class="muted">${escapeHtml(store.cuisineLabel)}${store.city ? ` · ${escapeHtml(store.city)}` : ""}</p>`
      : store.city
        ? `<p class="muted">${escapeHtml(store.city)}</p>`
        : ""
  }
  ${store.fssaiNumber ? `<p class="muted">FSSAI Lic. No. ${escapeHtml(store.fssaiNumber)}</p>` : ""}
  <div class="divider"></div>
  ${
    payload.taxInvoiceNumber
      ? `<p class="meta-row"><strong>Tax Invoice No.:</strong> ${escapeHtml(payload.taxInvoiceNumber)}</p>`
      : ""
  }
  <p class="meta-row paid">PAID · Delivery by GatiMitra</p>
  <div class="divider"></div>
  ${payload.customerName ? `<p class="cust"><strong>Name:</strong> ${escapeHtml(payload.customerName)}</p>` : ""}
  ${payload.dropAddress ? `<p class="cust"><strong>Deliver to:</strong> ${escapeHtml(payload.dropAddress.toUpperCase())}</p>` : ""}
  ${otp ? `<p class="cust"><strong>OTP:</strong> <span class="otp">${escapeHtml(otp)}</span></p>` : ""}
  <div class="divider"></div>
  <p class="section-title">Summary</p>
  <table><tbody>${itemRows || "<tr><td colspan=\"3\">No items</td></tr>"}</tbody></table>
  <div class="summary">
    ${bill.packaging > 0.005 ? `<div><span>Restaurant Packaging Charges</span><span>${formatOrderRs(bill.packaging)}</span></div>` : ""}
    ${bill.discount > 0 ? `<div class="discount"><span>Discount</span><span>−${formatOrderRs(bill.discount)}</span></div>` : ""}
  </div>
  <div class="total-row"><span>Total</span><span>${formatOrderRs(bill.total)}</span></div>
  <div class="print-time">Order placed: ${escapeHtml(formatOrderPlacedAt(payload.orderCreatedAt))}${printAt ? `<br/>Printed: ${escapeHtml(printAt)}` : ""}</div>
  <p class="footer">Powered by GatiMitra</p>
</body>
</html>`;
}
