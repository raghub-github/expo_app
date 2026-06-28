/**
 * Customer tax invoices (platform fee + delivery fee) — HTML for in-app WebView / print.
 */

import { createHash } from "crypto";
import { getInvoiceSignatureDataUri } from "./invoice-signature-source.js";

type GstLine = {
  taxable: number;
  gst: number;
  cgst: number;
  sgst: number;
  total: number;
};

export type CustomerOrderInvoiceInput = {
  orderId: string;
  formattedOrderId: string;
  coreOrderId: number;
  customerPk: number;
  orderDateIso: string;
  customerName: string;
  deliveryAddress: string | null;
  placeOfSupply: string;
  billingSnapshot: Record<string, unknown> | null;
  riderName: string | null;
  paymentMethod: string | null;
};

const DEFAULT_GSTIN = "10AAMCG7962L1Z7";
const DEFAULT_CIN = "U62099BR2026PTC082614";
const DEFAULT_PAN = "AAMCG7962L";

function platformGstin(): string {
  return process.env.PLATFORM_GSTIN?.trim() || DEFAULT_GSTIN;
}

function platformCin(): string {
  return process.env.PLATFORM_CIN?.trim() || DEFAULT_CIN;
}

function platformPan(): string {
  return process.env.PLATFORM_PAN?.trim() || DEFAULT_PAN;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtInr(n: number): string {
  return round2(n).toFixed(2);
}

function readGstComponent(
  snap: Record<string, unknown>,
  key: "platform" | "delivery",
  feeKey: "platform_fee" | "delivery_fee"
): GstLine {
  const gc =
    snap.gst_components && typeof snap.gst_components === "object"
      ? (snap.gst_components as Record<string, unknown>)
      : null;
  const raw =
    gc?.[key] && typeof gc[key] === "object"
      ? (gc[key] as Record<string, unknown>)
      : null;
  const taxable = num(raw?.taxable_value) || num(snap[feeKey]);
  let gst = num(raw?.gst);
  if (gst <= 0 && taxable > 0) gst = round2(taxable * 0.18);
  const cgst = round2(gst / 2);
  const sgst = round2(gst - cgst);
  return { taxable: round2(taxable), gst: round2(gst), cgst, sgst, total: round2(taxable + gst) };
}

function formatInvoiceDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    return iso.slice(0, 10);
  }
}

function fiscalYearShort(iso: string): string {
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const start = m >= 4 ? y : y - 1;
    return `${String(start).slice(-2)}${String(start + 1).slice(-2)}`;
  } catch {
    return "2526";
  }
}

/** Globally unique, stable per order + customer + invoice kind (re-download returns same number). */
export function buildCustomerInvoiceNumber(input: {
  invoiceKind: "platform" | "delivery";
  coreOrderId: number;
  customerPk: number;
  formattedOrderId: string;
  orderDateIso: string;
}): string {
  const tag = input.invoiceKind === "platform" ? "PF" : "DF";
  const fy = fiscalYearShort(input.orderDateIso);
  const digest = createHash("sha256")
    .update(
      `${input.coreOrderId}|${input.customerPk}|${tag}|${input.formattedOrderId}|${input.orderDateIso}`
    )
    .digest("hex")
    .slice(0, 8)
    .toUpperCase();
  const seq = String(input.coreOrderId).padStart(8, "0");
  return `GM/${fy}/${tag}/${seq}/${digest}`;
}

function amountInWords(amount: number): string {
  const n = Math.round(amount * 100);
  const rupees = Math.floor(n / 100);
  const paise = n % 100;
  if (rupees === 0 && paise === 0) return "Zero Rupees Only";
  const parts: string[] = [];
  if (rupees > 0) parts.push(`${rupees} Rupees`);
  if (paise > 0) parts.push(`${paise} Paisa`);
  return `${parts.join(" And ")} Only`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderAuthorisedSignatory(platformName: string, signatureDataUri: string | null): string {
  const sigImg = signatureDataUri
    ? `<img src="${signatureDataUri}" alt="Authorised signature" class="sign-img" />`
    : "";
  return `
    <div class="sign">
      <div>For ${escapeHtml(platformName)}</div>
      ${sigImg}
      <div class="sign-line">Authorised Signatory</div>
    </div>
  `;
}

function invoiceStyles(): string {
  return `
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 16px; background: #f5f5f5; }
    .page { background: #fff; max-width: 720px; margin: 0 auto 24px; padding: 20px; border: 1px solid #ddd; }
    .brand { font-size: 28px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 4px; }
    .doc-title { font-size: 18px; font-weight: 700; margin: 8px 0 2px; }
    .doc-sub { font-size: 11px; color: #555; text-transform: uppercase; letter-spacing: 0.04em; }
    .section-h { background: #ececec; padding: 6px 8px; font-size: 11px; font-weight: 700; margin: 14px 0 8px; text-transform: uppercase; }
    .row { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; margin: 4px 0; }
    .row .label { color: #444; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
    th { background: #f3f3f3; font-weight: 700; }
    td.num, th.num { text-align: right; }
    .footer-note { font-size: 10px; color: #444; margin-top: 12px; line-height: 1.45; }
    .sign { margin-top: 28px; text-align: right; font-size: 11px; }
    .sign-img { height: 56px; width: auto; max-width: 200px; margin-left: auto; display: block; margin-top: 10px; margin-bottom: 4px; object-fit: contain; opacity: 0.92; }
    .sign-line { border-top: 1px solid #999; width: 180px; margin-left: auto; margin-top: 4px; padding-top: 4px; }
    @media print { body { background: #fff; padding: 0; } .page { border: none; margin: 0; page-break-after: always; } }
  `;
}

function renderPlatformInvoice(
  input: CustomerOrderInvoiceInput,
  line: GstLine,
  invoiceNo: string,
  signatureDataUri: string | null
): string {
  const platformName =
    process.env.PLATFORM_LEGAL_NAME?.trim() ||
    "GatiMitra On-Demand Services Private Limited";
  const gstin = platformGstin();
  const pan = platformPan();
  const cin = platformCin();
  const address =
    process.env.PLATFORM_INVOICE_ADDRESS?.trim() ||
    process.env.PLATFORM_ADDRESS?.trim() ||
    "";
  const email = process.env.PLATFORM_CONTACT_EMAIL?.trim() || "order@gatimitra.com";
  const invoiceDate = formatInvoiceDate(input.orderDateIso);

  return `
    <div class="page">
      <div class="brand">GatiMitra</div>
      <div class="doc-sub">Original for recipient</div>
      <div class="doc-title">Tax Invoice</div>

      <div class="section-h">${escapeHtml(platformName)}</div>
      ${address ? `<div class="row"><span class="label">Address</span><span>${escapeHtml(address)}</span></div>` : ""}
      ${email ? `<div class="row"><span class="label">Email</span><span>${escapeHtml(email)}</span></div>` : ""}
      <div class="row"><span class="label">Invoice No.</span><span>${escapeHtml(invoiceNo)}</span></div>
      <div class="row"><span class="label">Invoice Date</span><span>${escapeHtml(invoiceDate)}</span></div>
      <div class="row"><span class="label">GSTIN</span><span>${escapeHtml(gstin)}</span></div>
      <div class="row"><span class="label">PAN</span><span>${escapeHtml(pan)}</span></div>
      <div class="row"><span class="label">CIN</span><span>${escapeHtml(cin)}</span></div>

      <div class="section-h">Customer Details</div>
      <div class="row"><span class="label">Name</span><span>${escapeHtml(input.customerName)}</span></div>
      ${input.deliveryAddress ? `<div class="row"><span class="label">Delivery Address</span><span>${escapeHtml(input.deliveryAddress)}</span></div>` : ""}
      <div class="row"><span class="label">GSTIN</span><span>UNREGISTERED</span></div>
      <div class="row"><span class="label">Place of Supply</span><span>${escapeHtml(input.placeOfSupply)}</span></div>

      <div class="section-h">Service Details</div>
      <div class="row"><span class="label">HSN Code</span><span>999799</span></div>
      <div class="row"><span class="label">Supply Description</span><span>Other Services N.E.C. (Platform fee)</span></div>

      <table>
        <thead>
          <tr>
            <th>Sr.No</th><th>Particulars</th><th class="num">Taxable Amount</th>
            <th class="num">CGST</th><th class="num">SGST</th><th class="num">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td><td>Platform fee</td>
            <td class="num">${fmtInr(line.taxable)}</td>
            <td class="num">${fmtInr(line.cgst)}</td>
            <td class="num">${fmtInr(line.sgst)}</td>
            <td class="num">${fmtInr(line.total)}</td>
          </tr>
          <tr>
            <td colspan="2"><strong>Total</strong></td>
            <td class="num">${fmtInr(line.taxable)}</td>
            <td class="num">${fmtInr(line.cgst)}</td>
            <td class="num">${fmtInr(line.sgst)}</td>
            <td class="num">${fmtInr(line.total)}</td>
          </tr>
        </tbody>
      </table>

      <p class="footer-note">
        Amount of ₹${fmtInr(line.total)} settled through digital mode / payment received against Order id
        (${escapeHtml(input.formattedOrderId)}) dated (${escapeHtml(invoiceDate)}).
        Tax is not payable on reverse charge basis.
      </p>
      ${renderAuthorisedSignatory(platformName, signatureDataUri)}
    </div>
  `;
}

function renderDeliveryInvoice(
  input: CustomerOrderInvoiceInput,
  line: GstLine,
  invoiceNo: string,
  signatureDataUri: string | null
): string {
  const platformName =
    process.env.PLATFORM_LEGAL_NAME?.trim() ||
    "GatiMitra On-Demand Services Private Limited";
  const gstin = platformGstin();
  const pan = platformPan();
  const cin = platformCin();
  const platformFssai = process.env.PLATFORM_FSSAI?.trim() || "";
  const partnerName = input.riderName?.trim() || "Delivery Partner";
  const invoiceDate = formatInvoiceDate(input.orderDateIso);

  return `
    <div class="page">
      <div class="brand">GatiMitra</div>
      <div class="doc-sub">Original for recipient</div>
      <div class="doc-title">Tax Invoice</div>
      <div class="row"><span class="label">Tax Invoice on behalf of</span><span>${escapeHtml(partnerName)}</span></div>

      <div class="section-h">Invoice Details</div>
      <div class="row"><span class="label">Invoice No.</span><span>${escapeHtml(invoiceNo)}</span></div>
      <div class="row"><span class="label">Invoice Date</span><span>${escapeHtml(invoiceDate)}</span></div>
      <div class="row"><span class="label">Partner State</span><span>${escapeHtml(input.placeOfSupply.replace(/\(\d+\)$/, "").trim() || "—")}</span></div>

      <div class="section-h">Customer Details</div>
      <div class="row"><span class="label">Name</span><span>${escapeHtml(input.customerName)}</span></div>
      ${input.deliveryAddress ? `<div class="row"><span class="label">Delivery Address</span><span>${escapeHtml(input.deliveryAddress)}</span></div>` : ""}
      <div class="row"><span class="label">Place of Supply</span><span>${escapeHtml(input.placeOfSupply)}</span></div>

      <div class="section-h">Service Details</div>
      <div class="row"><span class="label">Service Description</span><span>Local delivery service</span></div>

      <table>
        <thead>
          <tr>
            <th>Particulars</th><th class="num">Gross value</th><th class="num">Discount</th><th class="num">Net value</th>
            <th class="num">CGST (9%)</th><th class="num">SGST (9%)</th><th class="num">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Fee for delivery services</td>
            <td class="num">${fmtInr(line.taxable)}</td><td class="num">0.00</td><td class="num">${fmtInr(line.taxable)}</td>
            <td class="num">${fmtInr(line.cgst)}</td><td class="num">${fmtInr(line.sgst)}</td><td class="num">${fmtInr(line.total)}</td>
          </tr>
          <tr>
            <td><strong>Total Value</strong></td>
            <td class="num">${fmtInr(line.taxable)}</td><td class="num">0.00</td><td class="num">${fmtInr(line.taxable)}</td>
            <td class="num">${fmtInr(line.cgst)}</td><td class="num">${fmtInr(line.sgst)}</td><td class="num">${fmtInr(line.total)}</td>
          </tr>
        </tbody>
      </table>

      <p class="footer-note">
        Amount (in words): ${escapeHtml(amountInWords(line.total))}.<br/>
        Amount of INR ${fmtInr(line.total)} settled through digital mode against Order Id:
        ${escapeHtml(input.formattedOrderId)} dated ${escapeHtml(invoiceDate)}.<br/>
        Supply attracts reverse charge: No
      </p>
      <div class="sign">
        <div>For ${escapeHtml(platformName)}</div>
        ${pan ? `<div>PAN: ${escapeHtml(pan)}</div>` : ""}
        ${cin ? `<div>CIN: ${escapeHtml(cin)}</div>` : ""}
        ${gstin ? `<div>GST: ${escapeHtml(gstin)}</div>` : ""}
        ${platformFssai ? `<div>FSSAI: ${escapeHtml(platformFssai)}</div>` : ""}
        ${signatureDataUri ? `<img src="${signatureDataUri}" alt="Authorised signature" class="sign-img" />` : ""}
        <div class="sign-line">Authorised Signatory</div>
      </div>
    </div>
  `;
}

export async function buildCustomerOrderTaxInvoiceHtml(
  input: CustomerOrderInvoiceInput
): Promise<string> {
  const snap = input.billingSnapshot ?? {};
  const platformLine = readGstComponent(snap, "platform", "platform_fee");
  const deliveryLine = readGstComponent(snap, "delivery", "delivery_fee");
  const signatureDataUri = await getInvoiceSignatureDataUri();

  const platformInvoiceNo = buildCustomerInvoiceNumber({
    invoiceKind: "platform",
    coreOrderId: input.coreOrderId,
    customerPk: input.customerPk,
    formattedOrderId: input.formattedOrderId,
    orderDateIso: input.orderDateIso,
  });
  const deliveryInvoiceNo = buildCustomerInvoiceNumber({
    invoiceKind: "delivery",
    coreOrderId: input.coreOrderId,
    customerPk: input.customerPk,
    formattedOrderId: input.formattedOrderId,
    orderDateIso: input.orderDateIso,
  });

  const sections: string[] = [];
  if (platformLine.taxable > 0) {
    sections.push(renderPlatformInvoice(input, platformLine, platformInvoiceNo, signatureDataUri));
  }
  if (deliveryLine.taxable > 0) {
    sections.push(renderDeliveryInvoice(input, deliveryLine, deliveryInvoiceNo, signatureDataUri));
  }

  if (sections.length === 0) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Invoice</title></head><body><p>No invoiceable platform or delivery charges on this order.</p></body></html>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Tax Invoice — ${escapeHtml(input.formattedOrderId)}</title>
  <style>${invoiceStyles()}</style>
</head>
<body>
  ${sections.join("\n")}
</body>
</html>`;
}

export function orderHasCustomerTaxInvoice(snap: Record<string, unknown> | null): boolean {
  if (!snap) return false;
  return num(snap.platform_fee) > 0 || num(snap.delivery_fee) > 0;
}
