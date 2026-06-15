/**
 * PDF tax invoices — same data as HTML invoices, for Android DownloadManager fetch.
 */

import PDFDocument from "pdfkit";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  buildCustomerInvoiceNumber,
  type CustomerOrderInvoiceInput,
} from "./customer-order-tax-invoice.js";

type GstLine = {
  taxable: number;
  gst: number;
  cgst: number;
  sgst: number;
  total: number;
};

const DEFAULT_GSTIN = "10AAMCG7962L1Z7";
const DEFAULT_CIN = "U62099BR2026PTC082614";
const DEFAULT_PAN = "AAMCG7962L";

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

function signatureImagePath(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "../../assets/invoice-signature.png"),
    join(process.cwd(), "assets/invoice-signature.png"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function drawRow(doc: InstanceType<typeof PDFDocument>, label: string, value: string, y: number): number {
  doc.fontSize(10).fillColor("#333333").text(label, 40, y, { width: 200 });
  doc.fontSize(10).fillColor("#111111").text(value, 260, y, { width: 280, align: "right" });
  return y + 16;
}

function drawPlatformPage(
  doc: InstanceType<typeof PDFDocument>,
  input: CustomerOrderInvoiceInput,
  line: GstLine,
  invoiceNo: string
): void {
  const platformName =
    process.env.PLATFORM_LEGAL_NAME?.trim() ||
    "GatiMitra On-Demand Services Private Limited";
  const gstin = process.env.PLATFORM_GSTIN?.trim() || DEFAULT_GSTIN;
  const pan = process.env.PLATFORM_PAN?.trim() || DEFAULT_PAN;
  const cin = process.env.PLATFORM_CIN?.trim() || DEFAULT_CIN;
  const invoiceDate = formatInvoiceDate(input.orderDateIso);

  doc.fontSize(22).fillColor("#111111").text("GatiMitra", 40, 40);
  doc.fontSize(10).fillColor("#666666").text("ORIGINAL FOR RECIPIENT", 40, 68);
  doc.fontSize(14).fillColor("#111111").text("Tax Invoice", 40, 84);

  let y = 112;
  doc.fontSize(11).fillColor("#111111").text(platformName, 40, y);
  y += 22;
  y = drawRow(doc, "Invoice No.", invoiceNo, y);
  y = drawRow(doc, "Invoice Date", invoiceDate, y);
  y = drawRow(doc, "GSTIN", gstin, y);
  y = drawRow(doc, "PAN", pan, y);
  y = drawRow(doc, "CIN", cin, y);

  y += 8;
  doc.fontSize(11).fillColor("#111111").text("Customer Details", 40, y);
  y += 18;
  y = drawRow(doc, "Name", input.customerName, y);
  if (input.deliveryAddress) y = drawRow(doc, "Delivery Address", input.deliveryAddress, y);
  y = drawRow(doc, "Place of Supply", input.placeOfSupply, y);

  y += 8;
  doc.fontSize(11).text("Service Details", 40, y);
  y += 18;
  y = drawRow(doc, "HSN Code", "999799", y);
  y = drawRow(doc, "Supply Description", "Other Services N.E.C. (Platform fee)", y);

  y += 10;
  doc.fontSize(10).text(
    `Platform fee — Taxable ₹${fmtInr(line.taxable)} | CGST ₹${fmtInr(line.cgst)} | SGST ₹${fmtInr(line.sgst)} | Total ₹${fmtInr(line.total)}`,
    40,
    y,
    { width: 520 }
  );

  y += 36;
  doc.fontSize(9).fillColor("#444444").text(
    `Amount of ₹${fmtInr(line.total)} settled through digital mode against Order ${input.formattedOrderId} dated ${invoiceDate}.`,
    40,
    y,
    { width: 520 }
  );

  const sigPath = signatureImagePath();
  if (sigPath) {
    doc.image(sigPath, 380, 680, { fit: [140, 52], align: "right" });
  }
  doc.fontSize(9).fillColor("#111111").text("Authorised Signatory", 380, 740, { width: 160, align: "right" });
}

function drawDeliveryPage(
  doc: InstanceType<typeof PDFDocument>,
  input: CustomerOrderInvoiceInput,
  line: GstLine,
  invoiceNo: string
): void {
  const platformName =
    process.env.PLATFORM_LEGAL_NAME?.trim() ||
    "GatiMitra On-Demand Services Private Limited";
  const gstin = process.env.PLATFORM_GSTIN?.trim() || DEFAULT_GSTIN;
  const pan = process.env.PLATFORM_PAN?.trim() || DEFAULT_PAN;
  const cin = process.env.PLATFORM_CIN?.trim() || DEFAULT_CIN;
  const invoiceDate = formatInvoiceDate(input.orderDateIso);
  const partnerName = input.riderName?.trim() || "Delivery Partner";

  doc.fontSize(22).fillColor("#111111").text("GatiMitra", 40, 40);
  doc.fontSize(10).fillColor("#666666").text("ORIGINAL FOR RECIPIENT", 40, 68);
  doc.fontSize(14).fillColor("#111111").text("Tax Invoice", 40, 84);
  doc.fontSize(10).text(`Tax Invoice on behalf of ${partnerName}`, 40, 104);

  let y = 128;
  y = drawRow(doc, "Invoice No.", invoiceNo, y);
  y = drawRow(doc, "Invoice Date", invoiceDate, y);
  y = drawRow(doc, "Customer", input.customerName, y);
  if (input.deliveryAddress) y = drawRow(doc, "Delivery Address", input.deliveryAddress, y);
  y = drawRow(doc, "Place of Supply", input.placeOfSupply, y);
  y += 8;
  y = drawRow(doc, "Service Description", "Local delivery service", y);

  y += 10;
  doc.fontSize(10).text(
    `Delivery fee — Taxable ₹${fmtInr(line.taxable)} | CGST ₹${fmtInr(line.cgst)} | SGST ₹${fmtInr(line.sgst)} | Total ₹${fmtInr(line.total)}`,
    40,
    y,
    { width: 520 }
  );

  y += 36;
  doc.fontSize(9).fillColor("#444444").text(
    `Amount of INR ${fmtInr(line.total)} settled through digital mode against Order ${input.formattedOrderId}.`,
    40,
    y,
    { width: 520 }
  );

  y += 40;
  doc.fontSize(9).fillColor("#111111").text(`For ${platformName}`, 320, y, { width: 240, align: "right" });
  y += 14;
  doc.text(`GST: ${gstin}`, 320, y, { width: 240, align: "right" });
  y += 12;
  doc.text(`PAN: ${pan}`, 320, y, { width: 240, align: "right" });
  y += 12;
  doc.text(`CIN: ${cin}`, 320, y, { width: 240, align: "right" });

  const sigPath = signatureImagePath();
  if (sigPath) {
    doc.image(sigPath, 380, y + 10, { fit: [140, 52], align: "right" });
    y += 58;
  }
  doc.text("Authorised Signatory", 380, y + 10, { width: 160, align: "right" });
}

export function buildCustomerOrderTaxInvoicePdfBuffer(input: CustomerOrderInvoiceInput): Promise<Buffer> {
  const snap = input.billingSnapshot ?? {};
  const platformLine = readGstComponent(snap, "platform", "platform_fee");
  const deliveryLine = readGstComponent(snap, "delivery", "delivery_fee");

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

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: false });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    if (platformLine.taxable > 0) {
      doc.addPage();
      drawPlatformPage(doc, input, platformLine, platformInvoiceNo);
    }
    if (deliveryLine.taxable > 0) {
      doc.addPage();
      drawDeliveryPage(doc, input, deliveryLine, deliveryInvoiceNo);
    }

    if (platformLine.taxable <= 0 && deliveryLine.taxable <= 0) {
      doc.addPage();
      doc.fontSize(12).text("No invoiceable platform or delivery charges on this order.", 40, 40);
    }

    doc.end();
  });
}

export function invoicePdfFilename(formattedOrderId: string): string {
  const safe = formattedOrderId.replace(/[^\w-]+/g, "_");
  return `GatiMitra-Invoice-${safe}.pdf`;
}
