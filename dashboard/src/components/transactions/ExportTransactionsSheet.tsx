"use client";

import { useCallback, useLayoutEffect, useState } from "react";
import { ArrowLeft, ArrowUpCircle } from "lucide-react";
import * as XLSX from "xlsx";
import type { WorkBook } from "xlsx";
import { useToast } from "@/context/ToastContext";

export interface TransactionsExportSeed {
  app: "all" | "customer" | "merchant" | "rider";
  service: string;
  status: string;
  mode: string;
  dateFrom: string;
  dateTo: string;
}

type FieldId =
  | "formattedOrderId"
  | "createdAt"
  | "updatedAt"
  | "app"
  | "service"
  | "purpose"
  | "orderStatus"
  | "entityName"
  | "entityDisplayId"
  | "orderSource"
  | "userType"
  | "isBulk"
  | "overdue"
  | "paymentStatus"
  | "paymentMode"
  | "currency"
  | "itemSubtotal"
  | "addon"
  | "charges"
  | "taxes"
  | "tip"
  | "discounts"
  | "gatiCash"
  | "feeSubtotal"
  | "gst"
  | "grandTotal"
  | "gross"
  | "paid"
  | "refund"
  | "razorpayOrderId"
  | "razorpayPaymentId"
  | "internalRef";

interface PaymentLine {
  label: string;
  amountPaise: number;
}

interface ExportRow {
  formattedOrderId: string | null;
  createdAt: string;
  updatedAt: string | null;
  app: string;
  service: string;
  purpose: string;
  orderStatus: string;
  paymentStatus: string;
  normStatus: string;
  paymentMode: string | null;
  currency: string;
  grossPaise: number;
  paidPaise: number;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  internalRef: string | null;
  entityName: string | null;
  entityDisplayId: string | null;
  orderSource: string | null;
  userType: string | null;
  isBulk: boolean;
  overdue: boolean;
  itemSubtotalPaise: number;
  addonPaise: number;
  tipPaise: number;
  gatiCashPaise: number;
  grandTotalPaise: number;
  feeSubtotalPaise: number;
  gstPaise: number;
  refundPaise: number;
  taxes: PaymentLine[];
  charges: PaymentLine[];
  discounts: PaymentLine[];
}

const ORDER_FIELDS: { id: FieldId; label: string; locked?: boolean }[][] = [
  [
    { id: "formattedOrderId", label: "Order ID", locked: true },
    { id: "createdAt", label: "Created time" },
    { id: "updatedAt", label: "Updated time" },
    { id: "app", label: "App" },
    { id: "service", label: "Service" },
    { id: "purpose", label: "Purpose" },
    { id: "orderStatus", label: "Order status" },
  ],
  [
    { id: "entityName", label: "Entity name" },
    { id: "entityDisplayId", label: "Entity ID" },
    { id: "orderSource", label: "Delivery" },
    { id: "userType", label: "User type" },
    { id: "isBulk", label: "Bulk order" },
    { id: "overdue", label: "Overdue" },
  ],
];

const PAYMENT_FIELDS: { id: FieldId; label: string }[][] = [
  [
    { id: "paymentStatus", label: "Payment status" },
    { id: "paymentMode", label: "Payment mode" },
    { id: "currency", label: "Currency" },
    { id: "itemSubtotal", label: "Item subtotal" },
    { id: "addon", label: "Add-on total" },
    { id: "charges", label: "Charges" },
    { id: "taxes", label: "Taxes" },
    { id: "tip", label: "Tip" },
    { id: "discounts", label: "Discounts" },
    { id: "gatiCash", label: "GatiCash" },
  ],
  [
    { id: "feeSubtotal", label: "Fee (before tax)" },
    { id: "gst", label: "GST" },
    { id: "grandTotal", label: "Total payable" },
    { id: "gross", label: "Amount" },
    { id: "paid", label: "Paid" },
    { id: "refund", label: "Refund" },
    { id: "razorpayOrderId", label: "Razorpay order" },
    { id: "razorpayPaymentId", label: "Razorpay payment" },
    { id: "internalRef", label: "Internal reference" },
  ],
];

const ALL_FIELDS: FieldId[] = [...ORDER_FIELDS.flat().map((f) => f.id), ...PAYMENT_FIELDS.flat().map((f) => f.id)];
const ORDER_FIELD_IDS = ORDER_FIELDS.flat().map((f) => f.id);
const PAYMENT_FIELD_IDS = PAYMENT_FIELDS.flat().map((f) => f.id);

const ORDER_STATUSES = [
  "PAYMENT DONE", "ACCEPTED", "DESPATCH READY", "DESPATCHED", "BULK",
  "DELIVERED", "CANCELLED", "FAILED", "REJECTED",
];
const PAYMENT_STATUSES = [
  "created", "pending", "paid", "captured_unfinalized", "failed",
  "reconciliation_required", "refund_pending", "refunded", "refund_failed", "cancelled",
];
const PAYMENT_MODES = ["razorpay", "wallet", "gati_cash", "mixed", "cash", "online", "upi", "card"];
const SERVICES = [
  { value: "food", label: "Food" },
  { value: "grocery", label: "Grocery" },
  { value: "fashion", label: "Fashion" },
  { value: "pharma", label: "Pharma" },
  { value: "pickup", label: "Pickup" },
  { value: "parcel", label: "Parcel" },
  { value: "person_ride", label: "Person Ride" },
  { value: "wallet_topup", label: "Wallet top-up" },
  { value: "subscription", label: "Subscription" },
  { value: "onboarding", label: "Onboarding" },
  { value: "wallet_dues", label: "Wallet dues" },
  { value: "negative_wallet_recovery", label: "Negative wallet" },
];
const USER_TYPES = ["Premium", "Very Good", "Good", "Bad", "Very Bad", "Fraud"];

const checkboxClass =
  "h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0";
const radioClass = "h-4 w-4 shrink-0 cursor-pointer border-gray-300 text-blue-600 focus:ring-blue-500";
const dateClass =
  "mt-1.5 w-full cursor-pointer rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20";

function rupees(paise: number): number {
  return Math.round(paise) / 100;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function lineMap(lines: PaymentLine[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of lines) {
    const label = line.label.trim() || "Other";
    map.set(label, (map.get(label) ?? 0) + line.amountPaise);
  }
  return map;
}

function taxMap(row: ExportRow): Map<string, number> {
  const map = lineMap(row.taxes);
  const hasGst = [...map.keys()].some((k) => /gst/i.test(k));
  if (!hasGst && row.gstPaise) map.set("GST", row.gstPaise);
  return map;
}

function saveWorkbook(wb: WorkBook): void {
  const safe = new Date().toISOString().replace(/[:.]/g, "-");
  const raw = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const u8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBufferLike);
  const blob = new Blob([u8 as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `transactions-export-${safe}.xlsx`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function CheckList({
  options,
  selected,
  onToggle,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
      {options.map((o) => (
        <label key={o.value} className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={selected.includes(o.value)}
            onChange={() => onToggle(o.value)}
            className={checkboxClass}
          />
          <span className="capitalize">{o.label}</span>
        </label>
      ))}
    </div>
  );
}

export function ExportTransactionsSheet({
  isOpen,
  onClose,
  seed,
}: {
  isOpen: boolean;
  onClose: () => void;
  seed: TransactionsExportSeed;
}) {
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<Set<FieldId>>(() => new Set(ALL_FIELDS));
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [orderStatusMode, setOrderStatusMode] = useState<"all" | "specific">("all");
  const [orderStatuses, setOrderStatuses] = useState<string[]>([]);
  const [paymentStatusMode, setPaymentStatusMode] = useState<"all" | "specific">("all");
  const [paymentStatuses, setPaymentStatuses] = useState<string[]>([]);
  const [modeMode, setModeMode] = useState<"all" | "specific">("all");
  const [modes, setModes] = useState<string[]>([]);
  const [appMode, setAppMode] = useState<"all" | "specific">("all");
  const [apps, setApps] = useState<string[]>([]);
  const [serviceMode, setServiceMode] = useState<"all" | "specific">("all");
  const [services, setServices] = useState<string[]>([]);
  const [deliveryMode, setDeliveryMode] = useState<"all" | "specific">("all");
  const [delivery, setDelivery] = useState<string[]>([]);
  const [userMode, setUserMode] = useState<"all" | "specific">("all");
  const [userTypes, setUserTypes] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  useLayoutEffect(() => {
    if (isOpen) {
      setMounted(true);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
      return () => cancelAnimationFrame(id);
    }
    setEntered(false);
    const t = window.setTimeout(() => setMounted(false), 320);
    return () => clearTimeout(t);
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setSelected(new Set(ALL_FIELDS));
    setDateFrom(seed.dateFrom || "");
    setDateTo(seed.dateTo || "");
    setOrderStatusMode("all");
    setOrderStatuses([]);
    setPaymentStatusMode(seed.status ? "specific" : "all");
    setPaymentStatuses(seed.status ? [seed.status] : []);
    setModeMode(seed.mode ? "specific" : "all");
    setModes(seed.mode ? [seed.mode] : []);
    setAppMode(seed.app !== "all" ? "specific" : "all");
    setApps(seed.app !== "all" ? [seed.app] : []);
    setServiceMode(seed.service ? "specific" : "all");
    setServices(seed.service ? [seed.service] : []);
    setDeliveryMode("all");
    setDelivery([]);
    setUserMode("all");
    setUserTypes([]);
    setExporting(false);
  }, [isOpen, seed]);

  const toggleField = (id: FieldId) => {
    if (id === "formattedOrderId") return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setGroup = (ids: FieldId[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (id === "formattedOrderId") {
          next.add(id);
          continue;
        }
        if (on) next.add(id);
        else next.delete(id);
      }
      next.add("formattedOrderId");
      return next;
    });
  };

  const toggleValue = (list: string[], value: string, setList: (v: string[]) => void) => {
    setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  };

  const runExport = useCallback(async () => {
    if (orderStatusMode === "specific" && orderStatuses.length === 0) {
      toast("Select at least one order status, or choose All.", "error");
      return;
    }
    if (paymentStatusMode === "specific" && paymentStatuses.length === 0) {
      toast("Select at least one payment status, or choose All.", "error");
      return;
    }
    if (modeMode === "specific" && modes.length === 0) {
      toast("Select at least one payment mode, or choose All.", "error");
      return;
    }
    if (appMode === "specific" && apps.length === 0) {
      toast("Select at least one app, or choose All.", "error");
      return;
    }
    if (serviceMode === "specific" && services.length === 0) {
      toast("Select at least one service, or choose All.", "error");
      return;
    }
    setExporting(true);
    try {
      const res = await fetch("/api/transactions/export", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apps: appMode === "specific" ? apps : [],
          dateFrom,
          dateTo,
          orderStatuses: orderStatusMode === "specific" ? orderStatuses : [],
          paymentStatuses: paymentStatusMode === "specific" ? paymentStatuses : [],
          paymentModes: modeMode === "specific" ? modes : [],
          services: serviceMode === "specific" ? services : [],
          delivery: deliveryMode === "specific" ? delivery : [],
          userTypes: userMode === "specific" ? userTypes : [],
        }),
      });
      const json = (await res.json()) as { success?: boolean; rows?: ExportRow[]; truncated?: boolean; error?: string };
      if (!res.ok || !json.success || !json.rows) throw new Error(json.error || "Export failed");
      const headers = sheetHeaders(selected, json.rows);
      const data = json.rows.map((row) => sheetRow(selected, row, headers));
      const ws = XLSX.utils.json_to_sheet(data.length ? data : [{}], { header: headers });
      if (!data.length) {
        XLSX.utils.sheet_add_aoa(ws, [headers], { origin: "A1" });
      }
      ws["!cols"] = headers.map((h) => ({ wch: Math.min(36, Math.max(14, h.length + 2)) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Transactions");
      saveWorkbook(wb);
      const n = json.rows.length;
      toast(
        json.truncated
          ? `Exported ${n} transactions. Narrow the filters to include the rest.`
          : n === 1
            ? "Exported 1 transaction"
            : `Exported ${n} transactions`,
        json.truncated ? "error" : "success",
      );
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Export failed", "error");
    } finally {
      setExporting(false);
    }
  }, [
    appMode, apps, dateFrom, dateTo, delivery, deliveryMode,
    modeMode, modes, onClose, orderStatusMode, orderStatuses,
    paymentStatusMode, paymentStatuses, selected, serviceMode, services, toast, userMode, userTypes,
  ]);

  if (!mounted) return null;

  const orderCount = ORDER_FIELD_IDS.filter((id) => selected.has(id)).length;
  const paymentCount = PAYMENT_FIELD_IDS.filter((id) => selected.has(id)).length;
  const sectionShell = "rounded-lg border border-gray-200 bg-white overflow-hidden";
  const sectionTitleRow = "flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/60 px-4 py-2.5";

  return (
    <div className="fixed inset-0 z-[200] flex justify-end" role="presentation">
      <button
        type="button"
        aria-label="Close export panel"
        className={`absolute inset-0 cursor-pointer border-0 bg-black/50 transition-opacity duration-300 ease-out ${entered ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <div
        className={`relative z-10 flex h-full w-full max-w-lg flex-col border-l border-gray-200 bg-white shadow-2xl transition-transform duration-300 ease-out ${entered ? "translate-x-0" : "translate-x-full"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-transactions-title"
      >
        <div className="flex shrink-0 items-center gap-2.5 border-b border-gray-200 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-blue-100 bg-blue-50 text-blue-600">
            <ArrowUpCircle className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
          <h2 id="export-transactions-title" className="text-lg font-semibold text-blue-900">
            Export transactions
          </h2>
        </div>

        {step === 1 ? (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-3">
              <div className="flex flex-col gap-3">
                <FieldCard
                  title="Order fields"
                  count={orderCount}
                  shell={sectionShell}
                  titleRow={sectionTitleRow}
                  fields={ORDER_FIELDS}
                  selected={selected}
                  onToggle={toggleField}
                  onSelectAll={(on) => setGroup(ORDER_FIELD_IDS, on)}
                />
                <FieldCard
                  title="Payment fields"
                  count={paymentCount}
                  shell={sectionShell}
                  titleRow={sectionTitleRow}
                  fields={PAYMENT_FIELDS}
                  selected={selected}
                  onToggle={toggleField}
                  onSelectAll={(on) => setGroup(PAYMENT_FIELD_IDS, on)}
                />
              </div>
            </div>
            <div className="shrink-0 border-t border-gray-200 px-5 py-4">
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className="cursor-pointer rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-blue-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="button" onClick={() => setStep(2)} className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  Next
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-4">
              <div className="space-y-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <h3 className="mb-3 text-sm font-semibold text-gray-900">Created date range</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-xs font-medium text-gray-600">
                      From
                      <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={dateClass} />
                    </label>
                    <label className="block text-xs font-medium text-gray-600">
                      To
                      <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={dateClass} />
                    </label>
                  </div>
                </div>

                <ScopeCard title="Order status" mode={orderStatusMode} onMode={setOrderStatusMode} allLabel="All order statuses">
                  <CheckList
                    options={ORDER_STATUSES.map((s) => ({ value: s, label: s }))}
                    selected={orderStatuses}
                    onToggle={(v) => toggleValue(orderStatuses, v, setOrderStatuses)}
                  />
                </ScopeCard>

                <ScopeCard title="Payment status" mode={paymentStatusMode} onMode={setPaymentStatusMode} allLabel="All payment statuses">
                  <CheckList
                    options={PAYMENT_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") }))}
                    selected={paymentStatuses}
                    onToggle={(v) => toggleValue(paymentStatuses, v, setPaymentStatuses)}
                  />
                </ScopeCard>

                <ScopeCard title="Payment mode" mode={modeMode} onMode={setModeMode} allLabel="All payment modes">
                  <CheckList
                    options={PAYMENT_MODES.map((s) => ({
                      value: s,
                      label: s === "gati_cash" ? "GatiCash" : s.replace(/_/g, " "),
                    }))}
                    selected={modes}
                    onToggle={(v) => toggleValue(modes, v, setModes)}
                  />
                </ScopeCard>

                <ScopeCard title="App" mode={appMode} onMode={setAppMode} allLabel="All apps">
                  <CheckList
                    options={["customer", "merchant", "rider"].map((s) => ({ value: s, label: s }))}
                    selected={apps}
                    onToggle={(v) => toggleValue(apps, v, setApps)}
                  />
                </ScopeCard>

                <ScopeCard title="Service" mode={serviceMode} onMode={setServiceMode} allLabel="All services">
                  <CheckList options={SERVICES} selected={services} onToggle={(v) => toggleValue(services, v, setServices)} />
                </ScopeCard>

                <ScopeCard title="Delivery" mode={deliveryMode} onMode={setDeliveryMode} allLabel="All delivery types">
                  <CheckList
                    options={[{ value: "GatiMitra", label: "GatiMitra" }, { value: "Merchant", label: "Merchant" }]}
                    selected={delivery}
                    onToggle={(v) => toggleValue(delivery, v, setDelivery)}
                  />
                </ScopeCard>

                <ScopeCard title="User type" mode={userMode} onMode={setUserMode} allLabel="All user types">
                  <CheckList
                    options={USER_TYPES.map((s) => ({ value: s, label: s }))}
                    selected={userTypes}
                    onToggle={(v) => toggleValue(userTypes, v, setUserTypes)}
                  />
                </ScopeCard>
              </div>
            </div>
            <div className="shrink-0 border-t border-gray-200 bg-gray-50/50 px-5 py-4">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={exporting}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => void runExport()}
                  disabled={exporting}
                  className="min-w-[7rem] cursor-pointer rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {exporting ? "Exporting…" : "Export"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FieldCard({
  title,
  count,
  shell,
  titleRow,
  fields,
  selected,
  onToggle,
  onSelectAll,
}: {
  title: string;
  count: number;
  shell: string;
  titleRow: string;
  fields: { id: FieldId; label: string; locked?: boolean }[][];
  selected: Set<FieldId>;
  onToggle: (id: FieldId) => void;
  onSelectAll: (on: boolean) => void;
}) {
  const ids = fields.flat().map((f) => f.id);
  const allOn = ids.every((id) => selected.has(id));
  const some = ids.some((id) => selected.has(id));
  return (
    <div className={shell}>
      <div className={titleRow}>
        <span className="text-sm font-medium text-gray-900">{title}</span>
        <span className="text-sm tabular-nums text-gray-500">{count} fields selected</span>
      </div>
      <div className="px-4 pb-4 pt-3">
        <label className="mb-3 inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={allOn}
            ref={(el) => {
              if (el) el.indeterminate = some && !allOn;
            }}
            onChange={(e) => onSelectAll(e.target.checked)}
            className={checkboxClass}
          />
          Select all fields
        </label>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {fields.map((col, ci) => (
            <div key={ci} className="flex flex-col gap-2">
              {col.map((f) => (
                <label key={f.id} className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={selected.has(f.id)}
                    disabled={f.locked}
                    onChange={() => onToggle(f.id)}
                    className={checkboxClass}
                  />
                  {f.label}
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScopeCard({
  title,
  mode,
  onMode,
  allLabel,
  children,
}: {
  title: string;
  mode: "all" | "specific";
  onMode: (m: "all" | "specific") => void;
  allLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">{title}</h3>
      <div className="flex flex-col gap-2.5">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input type="radio" checked={mode === "all"} onChange={() => onMode("all")} className={radioClass} />
          {allLabel}
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input type="radio" checked={mode === "specific"} onChange={() => onMode("specific")} className={radioClass} />
          Select
        </label>
        {mode === "specific" ? <div className="ml-6">{children}</div> : null}
      </div>
    </div>
  );
}

function sheetHeaders(selected: Set<FieldId>, rows: ExportRow[]): string[] {
  const chargeLabels = new Set<string>();
  const taxLabels = new Set<string>();
  const discountLabels = new Set<string>();
  if (selected.has("charges")) rows.forEach((r) => lineMap(r.charges).forEach((_, k) => chargeLabels.add(k)));
  if (selected.has("taxes")) rows.forEach((r) => taxMap(r).forEach((_, k) => taxLabels.add(k)));
  if (selected.has("discounts")) rows.forEach((r) => lineMap(r.discounts).forEach((_, k) => discountLabels.add(k)));
  const headers = ["Order ID"];
  const push = (id: FieldId, label: string) => {
    if (selected.has(id)) headers.push(label);
  };
  push("createdAt", "Created time");
  push("updatedAt", "Updated time");
  push("app", "App");
  push("service", "Service");
  push("purpose", "Purpose");
  push("orderStatus", "Order status");
  push("entityName", "Entity name");
  push("entityDisplayId", "Entity ID");
  push("orderSource", "Delivery");
  push("userType", "User type");
  push("isBulk", "Bulk order");
  push("overdue", "Overdue");
  push("paymentStatus", "Payment status");
  push("paymentMode", "Payment mode");
  push("currency", "Currency");
  push("itemSubtotal", "Item subtotal");
  push("addon", "Add-on total");
  if (selected.has("charges")) {
    headers.push("Charges total");
    [...chargeLabels].sort().forEach((l) => headers.push(`Charge: ${l}`));
  }
  if (selected.has("taxes")) {
    headers.push("Taxes total");
    [...taxLabels].sort().forEach((l) => headers.push(`Tax: ${l}`));
  }
  push("tip", "Tip");
  if (selected.has("discounts")) {
    headers.push("Discounts total");
    [...discountLabels].sort().forEach((l) => headers.push(`Discount: ${l}`));
  }
  push("gatiCash", "GatiCash");
  push("feeSubtotal", "Fee (before tax)");
  push("gst", "GST");
  push("grandTotal", "Total payable");
  push("gross", "Amount");
  push("paid", "Paid");
  push("refund", "Refund");
  push("razorpayOrderId", "Razorpay order");
  push("razorpayPaymentId", "Razorpay payment");
  push("internalRef", "Internal reference");
  return headers;
}

function sheetRow(selected: Set<FieldId>, r: ExportRow, headers: string[]): Record<string, string | number> {
  const charges = lineMap(r.charges);
  const taxes = taxMap(r);
  const discounts = lineMap(r.discounts);
  const row: Record<string, string | number> = { "Order ID": r.formattedOrderId ?? "" };
  const set = (id: FieldId, label: string, value: string | number) => {
    if (selected.has(id)) row[label] = value;
  };
  set("createdAt", "Created time", fmtTime(r.createdAt));
  set("updatedAt", "Updated time", fmtTime(r.updatedAt));
  set("app", "App", r.app);
  set("service", "Service", r.service.replace(/_/g, " "));
  set("purpose", "Purpose", r.purpose.replace(/_/g, " "));
  set("orderStatus", "Order status", r.orderStatus);
  set("entityName", "Entity name", r.entityName ?? "");
  set("entityDisplayId", "Entity ID", r.entityDisplayId ?? "");
  set("orderSource", "Delivery", r.orderSource ?? "");
  set("userType", "User type", r.userType ?? "");
  set("isBulk", "Bulk order", r.isBulk ? "Yes" : "No");
  set("overdue", "Overdue", r.overdue ? "Yes" : "No");
  set("paymentStatus", "Payment status", r.paymentStatus || r.normStatus.replace(/_/g, " "));
  set("paymentMode", "Payment mode", (r.paymentMode ?? "").replace(/_/g, " "));
  set("currency", "Currency", r.currency);
  set("itemSubtotal", "Item subtotal", rupees(r.itemSubtotalPaise));
  set("addon", "Add-on total", rupees(r.addonPaise));
  if (selected.has("charges")) {
    row["Charges total"] = rupees([...charges.values()].reduce((a, b) => a + b, 0));
    for (const h of headers) {
      if (h.startsWith("Charge: ")) row[h] = rupees(charges.get(h.slice("Charge: ".length)) ?? 0);
    }
  }
  if (selected.has("taxes")) {
    row["Taxes total"] = rupees([...taxes.values()].reduce((a, b) => a + b, 0));
    for (const h of headers) {
      if (h.startsWith("Tax: ")) row[h] = rupees(taxes.get(h.slice("Tax: ".length)) ?? 0);
    }
  }
  set("tip", "Tip", rupees(r.tipPaise));
  if (selected.has("discounts")) {
    row["Discounts total"] = rupees([...discounts.values()].reduce((a, b) => a + b, 0));
    for (const h of headers) {
      if (h.startsWith("Discount: ")) row[h] = rupees(discounts.get(h.slice("Discount: ".length)) ?? 0);
    }
  }
  set("gatiCash", "GatiCash", rupees(r.gatiCashPaise));
  set("feeSubtotal", "Fee (before tax)", rupees(r.feeSubtotalPaise));
  set("gst", "GST", rupees(r.gstPaise));
  set("grandTotal", "Total payable", rupees(r.grandTotalPaise));
  set("gross", "Amount", rupees(r.grossPaise));
  set("paid", "Paid", rupees(r.paidPaise));
  set("refund", "Refund", rupees(r.refundPaise));
  set("razorpayOrderId", "Razorpay order", r.razorpayOrderId ?? "");
  set("razorpayPaymentId", "Razorpay payment", r.razorpayPaymentId ?? "");
  set("internalRef", "Internal reference", r.internalRef ?? "");
  return row;
}
