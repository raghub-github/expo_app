/**
 * Rapido-style ride invoice PDF (3 pages): Payment Summary + Ride tax + Platform tax.
 */

import PDFDocument from "pdfkit";
import { createHash } from "crypto";
import type { RideInvoiceLine } from "../modules/rides/ride-invoice-lines.js";
import {
  resolveRapidoPaymentSummary,
  type RapidoPaymentSummary,
} from "../modules/rides/ride-invoice-summary.js";
import { fmtPdfInr, pdfFont, registerInvoicePdfFonts } from "./pdf-fonts.js";
import {
  getRideInvoiceLogoSource,
  type RideInvoiceLogoSource,
} from "./ride-invoice-logo-source.js";
import { drawRouteMapOnPdf, resolveInvoiceRouteCoords } from "./ride-invoice-route-map.js";

const PAGE_BG = "#F3F4F6";
const WHITE = "#FFFFFF";
const BILL_DARK = "#141414";
const PAY_DARK = "#1F1F1F";
const TOTAL_BOX_BG = "#3A3A3A";
const MUTED = "#9CA3AF";
const TEXT_DARK = "#111827";
const GREEN = "#059669";
const LABEL_GRAY = "#6B7280";
const DISCOUNT_BLUE = "#60A5FA";

const DEFAULT_GSTIN = "10AAMCG7962L1Z7";
const DEFAULT_PLATFORM_ADDRESS =
  "GatiMitra On-Demand Services Private Limited, Plot- 165, Khata No.- 170, Holding No 257/485, Circle-249, Ward No.-23, Main Boring Road, Patna, Bihar, 800001";

export type RideInvoicePdfInput = {
  orderId: string;
  coreOrderId: number;
  customerPk: number;
  rideLabel: string;
  rideDateIso: string;
  customerName: string;
  pickupAddress: string;
  dropAddress: string;
  distanceKm?: number | null;
  durationMins?: number | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropLat?: number | null;
  dropLng?: number | null;
  lines: RideInvoiceLine[];
  totalFare: number;
  paymentMethod: string;
  billingSnapshot?: Record<string, unknown> | null;
  riderName?: string | null;
  vehicleNumber?: string | null;
  placeOfSupply?: string | null;
};

type RapidoAmounts = RapidoPaymentSummary;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

const LOGO_MAX_W = 128;
const LOGO_MAX_H = 34;

function drawInvoiceLogoWithName(
  doc: InstanceType<typeof PDFDocument>,
  logo: RideInvoiceLogoSource | null,
  rightX: number,
  y: number
): void {
  const x = rightX - LOGO_MAX_W;
  if (logo) {
    if (logo.filePath) {
      doc.image(logo.filePath, x, y, { fit: [LOGO_MAX_W, LOGO_MAX_H], align: "right" });
    } else {
      doc.image(logo.buffer, x, y, { fit: [LOGO_MAX_W, LOGO_MAX_H], align: "right" });
    }
    return;
  }
  doc.font(pdfFont(true)).fontSize(18).fillColor(GREEN).text("GatiMitra", x, y, {
    width: LOGO_MAX_W,
    align: "right",
  });
}

function drawPageFooter(doc: InstanceType<typeof PDFDocument>, pageNo: number, totalPages: number): void {
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  doc
    .font(pdfFont())
    .fontSize(9)
    .fillColor(LABEL_GRAY)
    .text(`${pageNo} of ${totalPages}`, 0, pageH - 22, { width: pageW, align: "center" });
}

function ordinalDay(day: number): string {
  if (day % 10 === 1 && day !== 11) return `${day}st`;
  if (day % 10 === 2 && day !== 12) return `${day}nd`;
  if (day % 10 === 3 && day !== 13) return `${day}rd`;
  return `${day}th`;
}

export function formatRapidoRideDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = ordinalDay(d.getDate());
  const year = d.getFullYear();
  const time = d
    .toLocaleString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/\s/g, " ");
  return `${month} ${day} ${year}, ${time}`;
}

function formatTaxInvoiceDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    return String(iso).slice(0, 10);
  }
}

function fiscalYearCode(iso: string): string {
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const start = m >= 4 ? y : y - 1;
    return `${String(start).slice(-2)}${String(start + 1).slice(-2)}`;
  } catch {
    return "2627";
  }
}

function buildRideInvoiceNumber(
  kind: "ride" | "platform",
  input: Pick<RideInvoicePdfInput, "coreOrderId" | "customerPk" | "orderId" | "rideDateIso">
): string {
  const fy = fiscalYearCode(input.rideDateIso);
  const digest = createHash("sha256")
    .update(`${input.coreOrderId}|${input.customerPk}|${kind}|${input.orderId}|${input.rideDateIso}`)
    .digest("hex")
    .slice(0, 7)
    .toUpperCase();
  return `${fy}BR${String(input.coreOrderId).padStart(7, "0")}${digest.slice(0, 3)}`;
}

function platformGstin(): string {
  return process.env.PLATFORM_GSTIN?.trim() || DEFAULT_GSTIN;
}

function platformLegalName(): string {
  return (
    process.env.PLATFORM_LEGAL_NAME?.trim() || "GatiMitra On-Demand Services Private Limited"
  );
}

function platformAddress(): string {
  return process.env.PLATFORM_REGISTERED_ADDRESS?.trim() || DEFAULT_PLATFORM_ADDRESS;
}

function estimateAddressHeight(address: string): number {
  const charsPerLine = 52;
  const lines = Math.max(1, Math.ceil(String(address).length / charsPerLine));
  return lines * 12 + 4;
}

function estimateBillSectionHeight(discountCount: number): number {
  return 132 + discountCount * 20;
}

function estimatePaymentSummaryPageHeight(
  input: RideInvoicePdfInput,
  hasMap: boolean,
  discountCount = 0
): number {
  const margin = 20;
  const pad = 20;
  const mapH = hasMap ? 108 : 0;
  const pickupH = estimateAddressHeight(input.pickupAddress);
  const dropH = estimateAddressHeight(input.dropAddress);
  const whiteH = pad + 28 + 44 + 44 + 62 + 12 + mapH + 44 + pickupH + dropH + pad;
  const billH = estimateBillSectionHeight(discountCount);
  const payH = 56;
  return margin * 2 + whiteH + billH + payH + 24;
}

function drawBillAmountRow(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  w: number,
  y: number,
  label: string,
  amount: number,
  opts?: { bold?: boolean; note?: string }
): number {
  const amountStr = fmtPdfInr(amount);
  doc
    .font(pdfFont(opts?.bold))
    .fontSize(opts?.bold ? 13 : 11)
    .fillColor(WHITE)
    .text(label, x, y, { width: w * 0.58 });
  doc.font(pdfFont(opts?.bold)).text(amountStr, x, y, { width: w, align: "right" });
  let ny = y + (opts?.bold ? 24 : 20);
  if (opts?.note) {
    doc.font(pdfFont()).fontSize(9).fillColor(MUTED).text(opts.note, x, ny);
    ny += 14;
  }
  return ny;
}

function drawBillDiscountRow(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  w: number,
  y: number,
  label: string,
  amount: number
): number {
  doc
    .font(pdfFont())
    .fontSize(11)
    .fillColor(WHITE)
    .text(label, x, y, { width: w * 0.58 });
  doc
    .font(pdfFont(true))
    .fillColor(DISCOUNT_BLUE)
    .text(`- ${fmtPdfInr(amount)}`, x, y, { width: w, align: "right" });
  return y + 20;
}

function drawTaxAmountRow(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  label: string,
  amount: number,
  bold = false
): number {
  doc
    .font(pdfFont(bold))
    .fontSize(10)
    .fillColor(TEXT_DARK)
    .text(label, x, y, { width: 300 });
  doc.text(fmtPdfInr(amount), x, y, { width: 515, align: "right" });
  return y + 18;
}

function drawTaxField(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  label: string,
  value: string,
  colW: number
): number {
  doc.font(pdfFont()).fontSize(9).fillColor(LABEL_GRAY).text(label, x, y, { width: colW });
  const vy = y + 12;
  doc.font(pdfFont(true)).fontSize(10).fillColor(TEXT_DARK).text(value, x, vy, { width: colW });
  return vy + 22;
}

async function drawPaymentSummaryPage(
  doc: InstanceType<typeof PDFDocument>,
  input: RideInvoicePdfInput,
  routeCoords: ReturnType<typeof resolveInvoiceRouteCoords>,
  amounts: RapidoAmounts,
  logo: RideInvoiceLogoSource | null
): Promise<void> {
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const margin = 20;
  const cardX = margin;
  const cardW = pageW - margin * 2;
  const pad = 20;
  const ix = cardX + pad;
  const iw = cardW - pad * 2;

  doc.rect(0, 0, pageW, pageH).fill(PAGE_BG);

  const rideDate = formatRapidoRideDate(input.rideDateIso);
  const pickupH = doc.heightOfString(input.pickupAddress, { width: iw - 20, lineGap: 1 });
  const dropH = doc.heightOfString(input.dropAddress, { width: iw - 20, lineGap: 1 });
  const mapH = routeCoords ? 108 : 0;
  const whiteH = pad + 28 + 44 + 44 + 62 + 12 + mapH + 44 + pickupH + dropH + pad;
  const billH = estimateBillSectionHeight(amounts.discounts.length);
  const payH = 56;
  const cardH = whiteH + billH + payH;

  doc.roundedRect(cardX, margin, cardW, cardH, 16).fill(WHITE);

  let y = margin + pad;

  doc.font(pdfFont(true)).fontSize(17).fillColor(TEXT_DARK).text("Payment Summary", ix, y);
  drawInvoiceLogoWithName(doc, logo, ix + iw, y);
  y += 30;

  doc.font(pdfFont()).fontSize(9).fillColor(LABEL_GRAY).text("Ride ID", ix, y);
  y += 13;
  doc.font(pdfFont(true)).fontSize(11).fillColor(TEXT_DARK).text(input.orderId, ix, y);
  y += 22;

  doc.font(pdfFont()).fontSize(9).fillColor(LABEL_GRAY).text("Time of Ride", ix, y);
  y += 13;
  doc.font(pdfFont()).fontSize(11).fillColor(TEXT_DARK).text(rideDate, ix, y);
  y += 22;

  const totalBoxH = 56;
  doc.roundedRect(ix, y, iw, totalBoxH, 10).fill(TOTAL_BOX_BG);
  doc.font(pdfFont()).fontSize(11).fillColor("#D1D5DB").text("Total", ix + 14, y + 10);
  doc
    .font(pdfFont(true))
    .fontSize(24)
    .fillColor(WHITE)
    .text(fmtPdfInr(amounts.totalFare), ix + 14, y + 8, { width: iw - 14, align: "right" });
  y += totalBoxH + 12;

  if (routeCoords) {
    const mapBoxH = mapH - 8;
    await drawRouteMapOnPdf(doc, ix, y, iw, mapBoxH, routeCoords);
    y += mapH;
  }

  const km = num(input.distanceKm);
  const mins = num(input.durationMins);
  const colW = iw / 2;
  if (km > 0) {
    doc
      .font(pdfFont(true))
      .fontSize(15)
      .fillColor(TEXT_DARK)
      .text(`${round2(km)} kms`, ix, y, { width: colW });
    doc.font(pdfFont()).fontSize(8).fillColor(LABEL_GRAY).text("DISTANCE", ix, y + 18, { width: colW });
  }
  if (mins > 0) {
    doc
      .font(pdfFont(true))
      .fontSize(15)
      .fillColor(TEXT_DARK)
      .text(`${round2(mins)} mins`, ix + colW, y, { width: colW });
    doc
      .font(pdfFont())
      .fontSize(8)
      .fillColor(LABEL_GRAY)
      .text("DURATION", ix + colW, y + 18, { width: colW });
  }
  y += 40;

  doc.circle(ix + 6, y + 6, 5).fill(GREEN);
  doc.font(pdfFont()).fontSize(9).fillColor(TEXT_DARK).text(input.pickupAddress, ix + 18, y, {
    width: iw - 20,
    lineGap: 1,
  });
  y += pickupH + 10;

  doc.circle(ix + 6, y + 6, 5).fill("#EF4444");
  doc.font(pdfFont()).fontSize(9).fillColor(TEXT_DARK).text(input.dropAddress, ix + 18, y, {
    width: iw - 20,
    lineGap: 1,
  });

  const billY = margin + whiteH;
  const payY = billY + billH;
  const billX = cardX + pad;
  const billW = cardW - pad * 2;

  doc.save();
  doc.roundedRect(cardX, margin, cardW, cardH, 16).clip();
  doc.rect(cardX, billY, cardW, billH).fill(BILL_DARK);
  doc.rect(cardX, payY, cardW, payH).fill(PAY_DARK);
  doc.restore();

  let by = billY + 16;
  doc.font(pdfFont(true)).fontSize(14).fillColor(WHITE).text("Bill Details", billX, by);
  by += 22;
  by = drawBillAmountRow(doc, billX, billW, by, "Ride Charge", amounts.rideChargeGross);
  by = drawBillAmountRow(
    doc,
    billX,
    billW,
    by,
    "Booking Fees & Convenience Charges",
    amounts.bookingFeesConvenience
  );
  for (const discount of amounts.discounts) {
    by = drawBillDiscountRow(doc, billX, billW, by, discount.label, discount.amount);
  }
  by += 2;
  doc.moveTo(billX, by).lineTo(billX + billW, by).strokeColor("#374151").lineWidth(0.8).stroke();
  by += 10;
  drawBillAmountRow(doc, billX, billW, by, "Total Amount", amounts.totalFare, {
    bold: true,
    note: "(Inclusive of Taxes)",
  });

  doc.font(pdfFont()).fontSize(10).fillColor(MUTED).text("You Paid Using", billX, payY + 12);
  doc
    .font(pdfFont(true))
    .fontSize(13)
    .fillColor(WHITE)
    .text(input.paymentMethod, billX, payY + 30);
  doc
    .font(pdfFont(true))
    .fontSize(13)
    .fillColor(WHITE)
    .text(fmtPdfInr(amounts.totalFare), billX, payY + 28, { width: billW, align: "right" });

  drawPageFooter(doc, 1, 3);
}

function drawRideTaxInvoicePage(
  doc: InstanceType<typeof PDFDocument>,
  input: RideInvoicePdfInput,
  amounts: RapidoAmounts,
  logo: RideInvoiceLogoSource | null
): void {
  const invoiceNo = buildRideInvoiceNumber("ride", input);
  const invoiceDate = formatTaxInvoiceDate(input.rideDateIso);
  const state = input.placeOfSupply?.trim() || "Bihar";
  const captain = input.riderName?.trim() || "Ride Partner";
  const vehicle = input.vehicleNumber?.trim() || "—";

  doc.addPage({ size: "A4", margin: 0 });
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(WHITE);

  const pageW = doc.page.width;
  const margin = 40;
  let y = 36;
  const x = margin;
  const colW = 250;

  drawInvoiceLogoWithName(doc, logo, pageW - margin, y);
  doc.font(pdfFont(true)).fontSize(18).fillColor(TEXT_DARK).text("Tax Invoice", x, y);
  doc.font(pdfFont()).fontSize(10).fillColor(LABEL_GRAY).text(input.orderId, x, y + 22);

  y += 52;
  y = drawTaxField(doc, x, y, "Invoice No.", invoiceNo, colW);
  y = Math.max(y, drawTaxField(doc, x + colW, y - 34, "Invoice Date", invoiceDate, colW));
  y = drawTaxField(doc, x, y, "State", state, colW);
  y = drawTaxField(
    doc,
    x + colW,
    y - 34,
    "Tax Category",
    "Other local transportation services of passengers n.e.c. (996419)",
    colW
  );
  y = drawTaxField(doc, x, y, "Place of Supply", state, colW);
  y = drawTaxField(doc, x + colW, y - 34, "GST Number", platformGstin(), colW);
  y = drawTaxField(doc, x, y, "Vehicle Number", vehicle, colW);
  y = drawTaxField(doc, x + colW, y - 34, "Captain Name", captain, colW);
  y = drawTaxField(doc, x, y, "Customer Name", input.customerName, colW);
  y = drawTaxField(doc, x, y, "Customer Pick Up Address", input.pickupAddress, colW * 2);

  y += 8;
  doc.font(pdfFont(true)).fontSize(13).fillColor(TEXT_DARK).text("Bill Details", x, y);
  y += 22;

  const rows: Array<[string, number, boolean]> = [
    ["Ride Fare Charge", amounts.captainFee, false],
    ["CGST (2.5%)", amounts.rideCgst, false],
    ["SGST (2.5%)", amounts.rideSgst, false],
    ["IGST (0%)", 0, false],
    ["Ride Charge", amounts.rideCharge, true],
  ];
  for (const [label, amount, bold] of rows) {
    y = drawTaxAmountRow(doc, x, y, label, amount, bold);
  }
  y += 6;
  doc.font(pdfFont()).fontSize(9).fillColor(LABEL_GRAY).text("(Inclusive of Taxes)", x, y);
  y += 24;
  doc
    .font(pdfFont())
    .fontSize(8)
    .fillColor(LABEL_GRAY)
    .text(
      "This document is issued by the Transport Service Provider and not by GatiMitra On-Demand Services Private Limited. GatiMitra acts only as an Electronic Commerce Operator for the transportation services.",
      x,
      y,
      { width: 515, lineGap: 2 }
    );

  drawPageFooter(doc, 2, 3);
}

function drawPlatformTaxInvoicePage(
  doc: InstanceType<typeof PDFDocument>,
  input: RideInvoicePdfInput,
  amounts: RapidoAmounts,
  logo: RideInvoiceLogoSource | null
): void {
  const invoiceNo = buildRideInvoiceNumber("platform", input);
  const invoiceDate = formatTaxInvoiceDate(input.rideDateIso);
  const state = input.placeOfSupply?.trim() || "Bihar";
  const subTotal = round2(amounts.platformBookingFee + amounts.platformConvenienceFee);

  doc.addPage({ size: "A4", margin: 0 });
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(WHITE);

  const pageW = doc.page.width;
  const margin = 40;
  let y = 36;
  const x = margin;

  drawInvoiceLogoWithName(doc, logo, pageW - margin, y);
  doc.font(pdfFont(true)).fontSize(11).fillColor(TEXT_DARK).text(platformLegalName(), x, y, {
    width: pageW - margin * 2 - LOGO_MAX_W - 12,
  });
  y += 28;
  doc.font(pdfFont()).fontSize(9).fillColor(LABEL_GRAY).text(platformAddress(), x, y, {
    width: 515,
    lineGap: 1,
  });
  y += 40;

  doc.font(pdfFont(true)).fontSize(18).fillColor(TEXT_DARK).text("Tax Invoice", x, y);
  doc.font(pdfFont()).fontSize(10).fillColor(LABEL_GRAY).text(input.orderId, x, y + 22);
  y += 52;

  const colW = 250;
  y = drawTaxField(doc, x, y, "Invoice No.", invoiceNo, colW);
  y = Math.max(y, drawTaxField(doc, x + colW, y - 34, "Invoice Date", invoiceDate, colW));
  y = drawTaxField(doc, x, y, "Customer Name", input.customerName, colW);
  y = drawTaxField(doc, x, y, "Customer Pick Up Address", input.pickupAddress, colW * 2);
  y = drawTaxField(doc, x, y, "Tax Category", "Other services n.e.c. (999799)", colW);
  y = drawTaxField(doc, x + colW, y - 34, "Place of Supply", state, colW);
  y = drawTaxField(doc, x, y, "GST", platformGstin(), colW);

  y += 8;
  doc.font(pdfFont(true)).fontSize(13).fillColor(TEXT_DARK).text("Bill Details", x, y);
  y += 22;

  const rows: Array<[string, number, boolean]> = [
    ["Booking Fee", amounts.platformBookingFee, false],
    ["Convenience Charges", amounts.platformConvenienceFee, false],
    ["Sub Total", subTotal, false],
    ["CGST (9%)", amounts.platformGstCgst, false],
    ["SGST (9%)", amounts.platformGstSgst, false],
    ["IGST (0%)", 0, false],
    ["Final Amount", amounts.platformFinalAmount, true],
  ];
  for (const [label, amount, bold] of rows) {
    y = drawTaxAmountRow(doc, x, y, label, amount, bold);
  }
  y += 6;
  doc.font(pdfFont()).fontSize(9).fillColor(LABEL_GRAY).text("(Inclusive of Taxes)", x, y);
  y += 28;
  doc
    .font(pdfFont())
    .fontSize(9)
    .fillColor(LABEL_GRAY)
    .text("This is a system generated invoice and hence no signature required", x, y);
  y += 16;
  doc
    .font(pdfFont(true))
    .fontSize(10)
    .fillColor(TEXT_DARK)
    .text(`Thank you ${input.customerName}`, x, y);

  drawPageFooter(doc, 3, 3);
}

export async function buildRideInvoicePdfBuffer(input: RideInvoicePdfInput): Promise<Buffer> {
  const amounts = resolveRapidoPaymentSummary(input.billingSnapshot, input.totalFare, {
    excludeTip: true,
  });
  const routeCoords = resolveInvoiceRouteCoords(input);
  const logo = await getRideInvoiceLogoSource();
  const page1Height = estimatePaymentSummaryPageHeight(
    input,
    routeCoords != null,
    amounts.discounts.length
  );
  const page1Width = 595.28;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [page1Width, page1Height],
      margin: 0,
      autoFirstPage: false,
      info: {
        Title: `GatiMitra Ride Invoice ${input.orderId}`,
        Author: "GatiMitra - Ride - Services",
        Subject: "Ride payment summary and tax invoices",
      },
    });
    registerInvoicePdfFonts(doc);

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    void (async () => {
      try {
        doc.addPage({ size: [page1Width, page1Height], margin: 0 });
        await drawPaymentSummaryPage(doc, input, routeCoords, amounts, logo);
        drawRideTaxInvoicePage(doc, input, amounts, logo);
        drawPlatformTaxInvoicePage(doc, input, amounts, logo);
        doc.end();
      } catch (err) {
        reject(err);
      }
    })();
  });
}

export function rideInvoicePdfFilename(orderId: string): string {
  const safe = orderId.replace(/[^\w-]+/g, "_");
  return `ORDER_INVOICE_${safe}.pdf`;
}
