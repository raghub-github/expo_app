import * as XLSX from "xlsx";
import type { CustomerWithStats } from "@/lib/db/operations/customers";
import {
  resolveTrustTier,
  TRUST_TIER_LABEL,
  type CustomerTrustTier,
} from "@/lib/customers/trust-tier";

export type CustomerExportFieldId =
  | "customerId"
  | "fullName"
  | "firstName"
  | "lastName"
  | "mobile"
  | "email"
  | "state"
  | "status"
  | "riskFlag"
  | "trustTier"
  | "trustScore"
  | "gatiCash"
  | "orderTypes"
  | "foodOrders"
  | "foodSpent"
  | "parcelOrders"
  | "parcelSpent"
  | "rideOrders"
  | "rideSpent"
  | "totalOrders"
  | "totalSpent"
  | "lastOrderAt"
  | "createdAt";

export const CUSTOMER_EXPORT_FIELD_LABEL: Record<CustomerExportFieldId, string> = {
  customerId: "Customer ID",
  fullName: "Full Name",
  firstName: "First Name",
  lastName: "Last Name",
  mobile: "Mobile",
  email: "Email",
  state: "State",
  status: "Status",
  riskFlag: "Risk Flag",
  trustTier: "Trust Tier",
  trustScore: "Trust Score",
  gatiCash: "GatiCash",
  orderTypes: "Order Types",
  foodOrders: "Food Orders",
  foodSpent: "Food Spent",
  parcelOrders: "Parcel Orders",
  parcelSpent: "Parcel Spent",
  rideOrders: "Ride Orders",
  rideSpent: "Ride Spent",
  totalOrders: "Total Orders",
  totalSpent: "Total Spent",
  lastOrderAt: "Last Order At",
  createdAt: "Created At",
};

export const ALL_CUSTOMER_EXPORT_FIELDS = Object.keys(
  CUSTOMER_EXPORT_FIELD_LABEL
) as CustomerExportFieldId[];

/**
 * Format mobile for Sheets/Excel as readable text (never scientific notation).
 */
export function formatCustomerPhoneForExport(mobile: string | null | undefined): string {
  const raw = String(mobile ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return `+91 ${digits.slice(1, 6)} ${digits.slice(6)}`;
  }
  if (raw.startsWith("+") && digits.length >= 10) {
    const cc = digits.slice(0, digits.length - 10);
    const local = digits.slice(-10);
    return `+${cc} ${local.slice(0, 5)} ${local.slice(5)}`;
  }
  return raw;
}

function statsFor(
  c: CustomerWithStats,
  type: "food" | "parcel" | "person_ride"
) {
  return (
    c.orderStats.find((s) => s.orderType === type) || {
      orderType: type,
      totalOrders: 0,
      totalSpent: 0,
      lastOrderAt: null as Date | string | null,
    }
  );
}

function fmtDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(value);
  }
}

export type CustomerSheetExportOpts = {
  stateLabel?: string;
  /** Which columns to include. Defaults to all. Always keeps Customer ID. */
  fields?: Set<CustomerExportFieldId> | CustomerExportFieldId[];
};

function fieldSet(opts: CustomerSheetExportOpts): Set<CustomerExportFieldId> {
  if (!opts.fields) return new Set(ALL_CUSTOMER_EXPORT_FIELDS);
  const set = opts.fields instanceof Set ? new Set(opts.fields) : new Set(opts.fields);
  set.add("customerId");
  return set;
}

function fieldValue(
  id: CustomerExportFieldId,
  c: CustomerWithStats,
  stateLabel: string | undefined
): string | number {
  const food = statsFor(c, "food");
  const parcel = statsFor(c, "parcel");
  const ride = statsFor(c, "person_ride");
  const tier = resolveTrustTier(c.trustTier, c.trustScore) as CustomerTrustTier;

  switch (id) {
    case "customerId":
      return c.customerId ?? "";
    case "fullName":
      return c.fullName ?? "";
    case "firstName":
      return c.firstName ?? "";
    case "lastName":
      return c.lastName ?? "";
    case "mobile":
      return formatCustomerPhoneForExport(c.primaryMobile);
    case "email":
      return c.email ?? "";
    case "state":
      return stateLabel ?? "";
    case "status":
      return c.accountStatus ?? "";
    case "riskFlag":
      return c.riskFlag ?? "";
    case "trustTier":
      return TRUST_TIER_LABEL[tier];
    case "trustScore":
      return c.trustScore ?? "";
    case "gatiCash":
      return Number(c.walletBalance ?? 0).toFixed(2);
    case "orderTypes":
      return c.orderStats.map((s) => s.orderType).filter(Boolean).join(", ") || "None";
    case "foodOrders":
      return food.totalOrders;
    case "foodSpent":
      return Number(food.totalSpent).toFixed(2);
    case "parcelOrders":
      return parcel.totalOrders;
    case "parcelSpent":
      return Number(parcel.totalSpent).toFixed(2);
    case "rideOrders":
      return ride.totalOrders;
    case "rideSpent":
      return Number(ride.totalSpent).toFixed(2);
    case "totalOrders":
      return c.orderStats.reduce((sum, s) => sum + s.totalOrders, 0);
    case "totalSpent":
      return Number(c.orderStats.reduce((sum, s) => sum + s.totalSpent, 0)).toFixed(2);
    case "lastOrderAt":
      return fmtDate(c.lastOrderAt);
    case "createdAt":
      return fmtDate(c.createdAt);
    default:
      return "";
  }
}

/** Column order for the sheet (stable, selection-aware). */
const FIELD_ORDER: CustomerExportFieldId[] = [
  "customerId",
  "fullName",
  "firstName",
  "lastName",
  "mobile",
  "email",
  "state",
  "status",
  "riskFlag",
  "trustTier",
  "trustScore",
  "gatiCash",
  "orderTypes",
  "foodOrders",
  "foodSpent",
  "parcelOrders",
  "parcelSpent",
  "rideOrders",
  "rideSpent",
  "totalOrders",
  "totalSpent",
  "lastOrderAt",
  "createdAt",
];

function buildExportRows(rows: CustomerWithStats[], opts: CustomerSheetExportOpts = {}) {
  const selected = fieldSet(opts);
  const cols = FIELD_ORDER.filter((id) => selected.has(id));
  // If state column selected but no label, still include empty column when exporting non-state lists
  return rows.map((c) => {
    const row: Record<string, string | number> = {};
    for (const id of cols) {
      row[CUSTOMER_EXPORT_FIELD_LABEL[id]] = fieldValue(id, c, opts.stateLabel);
    }
    return row;
  });
}

/**
 * Google Sheets–compatible Excel (.xlsx) export.
 * Phone numbers are stored as text so digits are never lost.
 */
export function downloadCustomersGoogleSheet(
  rows: CustomerWithStats[],
  fileName: string,
  opts: CustomerSheetExportOpts = {}
) {
  const selected = fieldSet(opts);
  const headers = FIELD_ORDER.filter((id) => selected.has(id)).map(
    (id) => CUSTOMER_EXPORT_FIELD_LABEL[id]
  );
  const data = buildExportRows(rows, opts);
  const ws = XLSX.utils.json_to_sheet(data.length ? data : [{}], { header: headers });
  if (!data.length) {
    XLSX.utils.sheet_add_aoa(ws, [headers], { origin: "A1" });
  }

  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  const mobileCol = headers.indexOf(CUSTOMER_EXPORT_FIELD_LABEL.mobile);
  if (mobileCol >= 0) {
    for (let R = range.s.r + 1; R <= range.e.r; R++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: mobileCol });
      const cell = ws[addr];
      if (cell && cell.v != null) {
        ws[addr] = { t: "s", v: String(cell.v), z: "@" };
      }
    }
  }

  ws["!cols"] = headers.map((h) => ({
    wch: h === "Mobile" ? 18 : h === "Email" ? 28 : h === "Full Name" ? 22 : 14,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Customers");
  const raw = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const u8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBufferLike);
  const blob = new Blob([u8 as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const base = fileName.replace(/\.(csv|xlsx)$/i, "");
  triggerDownload(blob, `${base}.xlsx`);
}

/** @deprecated Prefer downloadCustomersGoogleSheet */
export function downloadCustomersCsv(
  rows: CustomerWithStats[],
  fileName: string,
  opts: CustomerSheetExportOpts = {}
) {
  downloadCustomersGoogleSheet(rows, fileName.replace(/\.csv$/i, ""), opts);
}

function triggerDownload(blob: Blob, downloadName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = downloadName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
