import type { KotLineItem, KotPrintPayload } from "./types";
import { resolveKotPrintSpec } from "./types";
import { pickupTokenToQrDataUri } from "./qr";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatKotTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return String(iso);
  }
}

function formatOrderType(raw: string | null | undefined): string {
  const t = String(raw ?? "").trim();
  if (!t) return "Food";
  if (/^food$/i.test(t)) return "Food";
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPaymentMode(raw: string | null | undefined): string {
  const t = String(raw ?? "").trim();
  if (!t) return "";
  const lower = t.toLowerCase();
  if (lower === "cod" || lower === "cash") return "cod";
  if (lower === "online" || lower === "prepaid" || lower === "upi" || lower === "card") {
    return lower;
  }
  return t.replace(/_/g, " ").toLowerCase();
}

/** Customer mobile for KOT — never merchant/store phone. */
function formatCustomerPhone(raw: string | null | undefined): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    const local = digits.slice(2);
    return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
  }
  return trimmed;
}

function itemVariants(item: KotLineItem): string[] {
  const fromLines = (item.customizationLines ?? [])
    .filter((l) => l.kind === "variant")
    .map((l) => l.name?.trim())
    .filter((n): n is string => !!n);
  if (fromLines.length) return fromLines;
  const v = (item.variantName ?? item.variantTag ?? "").trim();
  return v ? [v] : [];
}

function itemAddons(item: KotLineItem): Array<{ label: string; qty?: number }> {
  return (item.customizationLines ?? [])
    .filter((l) => l.kind === "addon")
    .map((l) => ({
      label: l.name?.trim() || "",
      qty: l.quantity ?? undefined,
    }))
    .filter((a) => a.label);
}

function itemNotes(item: KotLineItem): string[] {
  const fromLines = (item.customizationLines ?? [])
    .filter((l) => l.kind === "note")
    .map((l) => l.name?.trim())
    .filter((n): n is string => !!n);
  const special = (item.specialInstructions ?? "").trim();
  return special ? [...fromLines, special] : fromLines;
}

function buildKotItemBlock(item: KotLineItem, index: number, total: number): string {
  const qty = item.quantity || 1;
  const variants = itemVariants(item);
  const addons = itemAddons(item);
  const notes = itemNotes(item);
  const details: string[] = [];

  for (const n of notes) {
    details.push(`<div class="detail">Note : ( ${escapeHtml(n)} )</div>`);
  }
  for (const v of variants) {
    details.push(`<div class="detail">Specialty : ${escapeHtml(v)}</div>`);
  }
  for (const a of addons) {
    const addonLabel = a.qty && a.qty > 1 ? `${a.qty} x ${a.label}` : a.label;
    details.push(`<div class="detail">Extras : ${escapeHtml(addonLabel)}</div>`);
  }

  const separator = index < total - 1 ? `<div class="item-sep"></div>` : "";

  return `<div class="item">
    <div class="item-title">${qty} x ${escapeHtml(item.name.toUpperCase())}</div>
    ${details.join("")}
  </div>${separator}`;
}

/**
 * Production KOT HTML — reference layout, GatiMitra branding, 58mm/80mm responsive.
 */
export function buildKotHtml(payload: KotPrintPayload): string {
  const spec = resolveKotPrintSpec(payload.printerWidthMm);
  const items = payload.items ?? [];
  const itemBlocks =
    items.map((item, i) => buildKotItemBlock(item, i, items.length)).join("") ||
    '<div class="item"><div class="item-title">NO ITEMS</div></div>';
  const lineCount = items.length;
  const totalQty = items.reduce((n, i) => n + (i.quantity || 1), 0);
  const printAt = formatKotTime(payload.printTimestamp ?? new Date().toISOString());
  const orderAt = formatKotTime(payload.orderCreatedAt);
  const qrSrc = pickupTokenToQrDataUri(payload.pickupToken, spec.qrModuleScale);
  const otp = String(payload.pickupOtp ?? "").trim();
  const orderType = formatOrderType(payload.orderType);
  const paymentMode = formatPaymentMode(payload.paymentMode);
  const packaging = (payload.packagingInstructions ?? "").trim();
  const orderNotes = (payload.specialInstructions ?? [])
    .map((s) => String(s ?? "").trim())
    .filter(Boolean);

  const address = (payload.restaurantAddress ?? "").trim();
  const customerName = (payload.customerName ?? "").trim();
  const customerPhone = formatCustomerPhone(payload.customerPhone);
  const customerLine =
    customerName && customerPhone
      ? `${customerName} / ${customerPhone}`
      : customerName || customerPhone;
  const customerBlock = customerLine
    ? `<div class="section-title">CUSTOMER</div>
  <div class="customer-line">${escapeHtml(customerLine)}</div>
  <hr class="rule" />`
    : "";

  const metaRow = (label: string, value: string) =>
    `<div class="meta-row"><span class="meta-label">${escapeHtml(label)}</span><span class="meta-colon">:</span><span class="meta-value">${escapeHtml(value)}</span></div>`;

  const metaBlock = [
    metaRow("Order ID", payload.orderId || "—"),
    metaRow("CRN", payload.crn || "—"),
    metaRow("Internal Ref", String(payload.internalReferenceId ?? "—")),
    orderAt ? metaRow("Order Time", orderAt) : "",
    metaRow("Printed", printAt),
    metaRow("Order Type", orderType),
    paymentMode ? metaRow("Payment", paymentMode) : "",
  ]
    .filter(Boolean)
    .join("");

  const cookingBlock =
    orderNotes.length > 0
      ? `<div class="pack-block">${orderNotes
          .map((n) => `<div class="detail">Cooking : ${escapeHtml(n)}</div>`)
          .join("")}</div>`
      : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=${spec.cssWidthPx}, initial-scale=1" />
  <title>KOT ${escapeHtml(payload.kotNumber || payload.crn)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: ${spec.cssWidth};
      max-width: ${spec.cssWidth};
      margin: 0 auto;
      overflow-x: hidden;
    }
    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #000;
      background: #fff;
      padding: 4mm 3mm 5mm;
      font-size: ${spec.paperMm === 58 ? "11px" : "12px"};
      line-height: 1.35;
      font-weight: 600;
      word-wrap: break-word;
      overflow-wrap: anywhere;
    }
    .brand {
      text-align: center;
      font-size: ${spec.paperMm === 58 ? "18px" : "22px"};
      font-weight: 900;
      letter-spacing: 0.02em;
      margin-bottom: 2px;
    }
    .brand-sub {
      text-align: center;
      font-size: ${spec.paperMm === 58 ? "10px" : "11px"};
      font-weight: 800;
      letter-spacing: 0.12em;
      margin-bottom: 6px;
    }
    .store-name {
      text-align: center;
      font-size: ${spec.paperMm === 58 ? "11px" : "12px"};
      font-weight: 800;
      line-height: 1.3;
      margin-bottom: 4px;
      padding: 0 2px;
    }
    .store-address {
      text-align: center;
      font-size: ${spec.paperMm === 58 ? "9px" : "10px"};
      font-weight: 600;
      line-height: 1.35;
      margin-bottom: 2px;
      padding: 0 2px;
    }
    .rule {
      border: none;
      border-top: 1px dashed #000;
      margin: 7px 0;
    }
    .rule-double {
      border: none;
      border-top: 3px double #000;
      margin: 8px 0;
    }
    .kot-block { text-align: center; margin: 6px 0; }
    .kot-label {
      font-size: ${spec.paperMm === 58 ? "9px" : "10px"};
      font-weight: 800;
      letter-spacing: 0.14em;
    }
    .kot-num {
      font-size: ${spec.paperMm === 58 ? "26px" : "32px"};
      font-weight: 900;
      line-height: 1.05;
      letter-spacing: 0.04em;
      margin-top: 2px;
    }
    .meta-row {
      display: flex;
      align-items: flex-start;
      gap: 4px;
      font-size: ${spec.paperMm === 58 ? "10px" : "11px"};
      font-weight: 700;
      margin: 2px 0;
      line-height: 1.35;
    }
    .meta-label { flex: 0 0 auto; font-weight: 800; white-space: nowrap; }
    .meta-colon { flex: 0 0 auto; }
    .meta-value { flex: 1 1 auto; min-width: 0; word-break: break-word; }
    .section-title {
      font-size: ${spec.paperMm === 58 ? "10px" : "11px"};
      font-weight: 900;
      letter-spacing: 0.08em;
      margin: 4px 0 3px;
    }
    .customer-line {
      font-size: ${spec.paperMm === 58 ? "12px" : "14px"};
      font-weight: 800;
      line-height: 1.35;
      margin-bottom: 4px;
      word-break: break-word;
    }
    .items-title {
      font-size: ${spec.paperMm === 58 ? "10px" : "11px"};
      font-weight: 900;
      letter-spacing: 0.06em;
      margin: 2px 0 6px;
    }
    .item { margin-bottom: 6px; }
    .item-title {
      font-size: ${spec.paperMm === 58 ? "12px" : "13px"};
      font-weight: 900;
      line-height: 1.25;
      text-transform: uppercase;
      word-break: break-word;
    }
    .detail {
      font-size: ${spec.paperMm === 58 ? "10px" : "11px"};
      font-weight: 600;
      margin: 2px 0 0 8px;
      line-height: 1.3;
      word-break: break-word;
    }
    .item-sep {
      border-bottom: 1px dotted #666;
      margin: 6px 0 8px;
    }
    .pack-block, .pack-line {
      font-size: ${spec.paperMm === 58 ? "10px" : "11px"};
      font-weight: 700;
      margin: 4px 0;
      line-height: 1.35;
      word-break: break-word;
    }
    .total-line {
      font-size: ${spec.paperMm === 58 ? "11px" : "12px"};
      font-weight: 800;
      margin: 4px 0;
    }
    .verify-block {
      text-align: center;
      margin: 8px 0 4px;
      padding: 4px 0;
    }
    .verify-otp-section {
      padding: 6px 0 10px;
    }
    .verify-qr-section {
      padding: 12px 0 6px;
    }
    .verify-code-sep {
      border: none;
      border-top: 2px solid #000;
      margin: 4px 10px 0;
    }
    .otp-label, .qr-label {
      font-size: ${spec.paperMm === 58 ? "10px" : "11px"};
      font-weight: 800;
      letter-spacing: 0.12em;
    }
    .otp-value {
      font-size: ${spec.paperMm === 58 ? "34px" : "42px"};
      font-weight: 900;
      line-height: 1;
      letter-spacing: 0.1em;
      margin: 6px 0 2px;
    }
    .qr-wrap {
      text-align: center;
      margin: 10px auto 0;
    }
    .qr-wrap img {
      width: ${spec.paperMm === 58 ? "108px" : "132px"};
      height: ${spec.paperMm === 58 ? "108px" : "132px"};
      image-rendering: pixelated;
      display: block;
      margin: 0 auto;
    }
    .scan-caption {
      font-size: ${spec.paperMm === 58 ? "9px" : "10px"};
      font-weight: 700;
      margin-top: 8px;
    }
    .footer-line {
      text-align: center;
      font-size: ${spec.paperMm === 58 ? "9px" : "10px"};
      font-weight: 700;
      margin-top: 6px;
    }
    .footer-tag {
      text-align: center;
      font-size: ${spec.paperMm === 58 ? "9px" : "10px"};
      font-weight: 600;
      margin-top: 4px;
    }
    @page { size: ${spec.paperMm}mm auto; margin: 0; }
    @media print {
      html, body {
        width: ${spec.cssWidth};
        max-width: ${spec.cssWidth};
      }
      body {
        padding: 2mm 2mm 4mm;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <div class="brand">GatiMitra</div>
  <div class="brand-sub">KITCHEN ORDER TICKET</div>
  ${payload.restaurantName?.trim() ? `<div class="store-name">${escapeHtml(payload.restaurantName.trim())}</div>` : ""}
  ${address ? `<div class="store-address">📍 ${escapeHtml(address)}</div>` : ""}
  <hr class="rule" />
  <div class="kot-block">
    <div class="kot-label">KOT NUMBER</div>
    <div class="kot-num">${escapeHtml(payload.kotNumber || "—")}</div>
  </div>
  <hr class="rule" />
  ${metaBlock}
  <hr class="rule" />
  ${customerBlock}
  <div class="items-title">ITEMS (${lineCount})</div>
  ${itemBlocks}
  <hr class="rule" />
  ${cookingBlock}
  ${packaging ? `<div class="pack-line">Packaging : ${escapeHtml(packaging)}</div>` : ""}
  ${packaging || cookingBlock ? `<hr class="rule" />` : ""}
  <div class="total-line">Items Ordered: ${lineCount} | Total Units: ${totalQty}</div>
  <hr class="rule-double" />
  <div class="verify-block">
    ${
      otp
        ? `<div class="verify-otp-section">
    <div class="otp-label">PICKUP OTP</div>
    <div class="otp-value">${escapeHtml(otp)}</div>
  </div>`
        : ""
    }
    ${otp && qrSrc ? `<hr class="verify-code-sep" />` : ""}
    ${
      qrSrc
        ? `<div class="verify-qr-section">
    <div class="qr-label">SCAN QR FOR PICKUP</div>
    <div class="qr-wrap"><img src="${qrSrc}" alt="Pickup QR" width="${spec.paperMm === 58 ? 108 : 132}" height="${spec.paperMm === 58 ? 108 : 132}" /></div>
    <div class="scan-caption">Scan QR to verify pickup</div>
  </div>`
        : otp
          ? ""
          : `<div class="scan-caption">Pickup QR unavailable</div>`
    }
  </div>
  <hr class="rule" />
  <div class="footer-line">-------- Powered by GatiMitra --------</div>
  <div class="footer-tag">Made for you moments ❤️</div>
</body>
</html>`;
}

/** Derive CRN (kitchen callout) from a public order id — last 4 digits. */
export function deriveCrnFromOrderId(orderId: string | null | undefined): string {
  const digits = String(orderId ?? "").replace(/\D/g, "");
  return digits ? digits.slice(-4).padStart(4, "0") : String(orderId ?? "").slice(-4) || "—";
}
