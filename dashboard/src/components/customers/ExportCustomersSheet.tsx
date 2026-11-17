"use client";

import { useCallback, useLayoutEffect, useState } from "react";
import { ArrowLeft, ArrowUpCircle } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { fetchCustomers } from "@/hooks/queries/useCustomersQuery";
import {
  ALL_CUSTOMER_EXPORT_FIELDS,
  CUSTOMER_EXPORT_FIELD_LABEL,
  downloadCustomersGoogleSheet,
  type CustomerExportFieldId,
} from "@/lib/customers/export-customers-csv";
import {
  resolveTrustTier,
  TRUST_TIER_LABEL,
  type CustomerTrustTier,
} from "@/lib/customers/trust-tier";
import type { CustomerWithStats } from "@/lib/db/operations/customers";

export interface CustomersExportSeed {
  state?: string;
  search?: string;
  stateLabel?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  orderType?: "" | "food" | "parcel" | "person_ride";
}

const PROFILE_FIELDS: { id: CustomerExportFieldId; label: string; locked?: boolean }[][] = [
  [
    { id: "customerId", label: CUSTOMER_EXPORT_FIELD_LABEL.customerId, locked: true },
    { id: "fullName", label: CUSTOMER_EXPORT_FIELD_LABEL.fullName },
    { id: "firstName", label: CUSTOMER_EXPORT_FIELD_LABEL.firstName },
    { id: "lastName", label: CUSTOMER_EXPORT_FIELD_LABEL.lastName },
    { id: "mobile", label: CUSTOMER_EXPORT_FIELD_LABEL.mobile },
    { id: "email", label: CUSTOMER_EXPORT_FIELD_LABEL.email },
  ],
  [
    { id: "state", label: CUSTOMER_EXPORT_FIELD_LABEL.state },
    { id: "status", label: CUSTOMER_EXPORT_FIELD_LABEL.status },
    { id: "riskFlag", label: CUSTOMER_EXPORT_FIELD_LABEL.riskFlag },
    { id: "trustTier", label: CUSTOMER_EXPORT_FIELD_LABEL.trustTier },
    { id: "trustScore", label: CUSTOMER_EXPORT_FIELD_LABEL.trustScore },
    { id: "gatiCash", label: CUSTOMER_EXPORT_FIELD_LABEL.gatiCash },
    { id: "createdAt", label: CUSTOMER_EXPORT_FIELD_LABEL.createdAt },
  ],
];

const ORDER_FIELDS: { id: CustomerExportFieldId; label: string }[][] = [
  [
    { id: "orderTypes", label: CUSTOMER_EXPORT_FIELD_LABEL.orderTypes },
    { id: "totalOrders", label: CUSTOMER_EXPORT_FIELD_LABEL.totalOrders },
    { id: "totalSpent", label: CUSTOMER_EXPORT_FIELD_LABEL.totalSpent },
    { id: "lastOrderAt", label: CUSTOMER_EXPORT_FIELD_LABEL.lastOrderAt },
  ],
  [
    { id: "foodOrders", label: CUSTOMER_EXPORT_FIELD_LABEL.foodOrders },
    { id: "foodSpent", label: CUSTOMER_EXPORT_FIELD_LABEL.foodSpent },
    { id: "parcelOrders", label: CUSTOMER_EXPORT_FIELD_LABEL.parcelOrders },
    { id: "parcelSpent", label: CUSTOMER_EXPORT_FIELD_LABEL.parcelSpent },
    { id: "rideOrders", label: CUSTOMER_EXPORT_FIELD_LABEL.rideOrders },
    { id: "rideSpent", label: CUSTOMER_EXPORT_FIELD_LABEL.rideSpent },
  ],
];

const PROFILE_FIELD_IDS = PROFILE_FIELDS.flat().map((f) => f.id);
const ORDER_FIELD_IDS = ORDER_FIELDS.flat().map((f) => f.id);

const ACCOUNT_STATUSES = ["ACTIVE", "SUSPENDED", "BLOCKED", "DEACTIVATED"] as const;
const RISK_FLAGS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const SERVICES: { value: "food" | "parcel" | "person_ride"; label: string }[] = [
  { value: "food", label: "Food" },
  { value: "parcel", label: "Parcel" },
  { value: "person_ride", label: "Person Ride" },
];
const TRUST_TIERS = Object.keys(TRUST_TIER_LABEL) as CustomerTrustTier[];

const checkboxClass =
  "h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500";
const radioClass = "h-4 w-4 cursor-pointer border-gray-300 text-blue-600 focus:ring-blue-500";
const dateClass =
  "mt-1 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400";

export function ExportCustomersSheet({
  isOpen,
  onClose,
  seed,
}: {
  isOpen: boolean;
  onClose: () => void;
  seed: CustomersExportSeed;
}) {
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<Set<CustomerExportFieldId>>(
    () => new Set(ALL_CUSTOMER_EXPORT_FIELDS)
  );
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusMode, setStatusMode] = useState<"all" | "specific">("all");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [riskMode, setRiskMode] = useState<"all" | "specific">("all");
  const [risks, setRisks] = useState<string[]>([]);
  const [serviceMode, setServiceMode] = useState<"all" | "specific">("all");
  const [services, setServices] = useState<string[]>([]);
  const [trustMode, setTrustMode] = useState<"all" | "specific">("all");
  const [trustTiers, setTrustTiers] = useState<string[]>([]);
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
    setSelected(new Set(ALL_CUSTOMER_EXPORT_FIELDS));
    setDateFrom(seed.dateFrom || "");
    setDateTo(seed.dateTo || "");
    setStatusMode(seed.status ? "specific" : "all");
    setStatuses(seed.status ? [seed.status] : []);
    setRiskMode("all");
    setRisks([]);
    setServiceMode(seed.orderType ? "specific" : "all");
    setServices(seed.orderType ? [seed.orderType] : []);
    setTrustMode("all");
    setTrustTiers([]);
    setExporting(false);
  }, [isOpen, seed]);

  const toggleField = (id: CustomerExportFieldId) => {
    if (id === "customerId") return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setGroup = (ids: CustomerExportFieldId[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (id === "customerId") {
          next.add(id);
          continue;
        }
        if (on) next.add(id);
        else next.delete(id);
      }
      next.add("customerId");
      return next;
    });
  };

  const toggleValue = (list: string[], value: string, setList: (v: string[]) => void) => {
    setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  };

  const runExport = useCallback(async () => {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      toast("From date must be on or before To date.", "error");
      return;
    }
    if (statusMode === "specific" && statuses.length === 0) {
      toast("Select at least one account status, or choose All.", "error");
      return;
    }
    if (riskMode === "specific" && risks.length === 0) {
      toast("Select at least one risk flag, or choose All.", "error");
      return;
    }
    if (serviceMode === "specific" && services.length === 0) {
      toast("Select at least one service, or choose All.", "error");
      return;
    }
    if (trustMode === "specific" && trustTiers.length === 0) {
      toast("Select at least one trust tier, or choose All.", "error");
      return;
    }

    setExporting(true);
    try {
      const all: CustomerWithStats[] = [];
      const statusFilter =
        statusMode === "specific" && statuses.length === 1 ? statuses[0] : undefined;
      // API supports a single status + single orderType; multi-select filtered client-side.
      const apiOrderType =
        serviceMode === "specific" && services.length === 1
          ? (services[0] as "food" | "parcel" | "person_ride")
          : undefined;

      let pageNum = 1;
      let totalPages = 1;
      do {
        const result = await fetchCustomers({
          page: pageNum,
          limit: 200,
          search: seed.search || undefined,
          state: seed.state || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          status: statusFilter,
          orderType: apiOrderType,
        });
        all.push(...result.customers);
        totalPages = Math.max(1, result.pagination.totalPages);
        pageNum += 1;
      } while (pageNum <= totalPages && pageNum <= 500);

      let filtered = all;

      if (statusMode === "specific" && statuses.length > 1) {
        const want = new Set(statuses.map((s) => s.toUpperCase()));
        filtered = filtered.filter((c) => want.has((c.accountStatus || "").toUpperCase()));
      }

      if (riskMode === "specific") {
        const want = new Set(risks.map((s) => s.toUpperCase()));
        filtered = filtered.filter((c) => want.has((c.riskFlag || "").toUpperCase()));
      }

      if (serviceMode === "specific" && services.length > 0) {
        const want = new Set(services);
        filtered = filtered.filter((c) =>
          c.orderStats.some((s) => s.orderType && want.has(s.orderType) && s.totalOrders > 0)
        );
      }

      if (trustMode === "specific") {
        const want = new Set(trustTiers.map((s) => s.toUpperCase()));
        filtered = filtered.filter((c) =>
          want.has(resolveTrustTier(c.trustTier, c.trustScore))
        );
      }

      const slug = (seed.stateLabel || seed.state || "customers")
        .replace(/\s+/g, "-")
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, "");

      downloadCustomersGoogleSheet(filtered, `customers-${slug || "export"}`, {
        stateLabel: seed.stateLabel || seed.state,
        fields: selected,
      });

      const n = filtered.length;
      toast(
        n === 0
          ? "No customers matched these filters"
          : n === 1
            ? "Exported 1 customer"
            : `Exported ${n} customers`,
        n === 0 ? "error" : "success"
      );
      if (n > 0) onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Export failed", "error");
    } finally {
      setExporting(false);
    }
  }, [
    dateFrom,
    dateTo,
    onClose,
    riskMode,
    risks,
    seed,
    selected,
    serviceMode,
    services,
    statusMode,
    statuses,
    toast,
    trustMode,
    trustTiers,
  ]);

  if (!mounted) return null;

  const profileCount = PROFILE_FIELD_IDS.filter((id) => selected.has(id)).length;
  const orderCount = ORDER_FIELD_IDS.filter((id) => selected.has(id)).length;
  const sectionShell = "rounded-lg border border-gray-200 bg-white overflow-hidden";
  const sectionTitleRow =
    "flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/60 px-4 py-2.5";

  return (
    <div className="fixed inset-0 z-[200] flex justify-end" role="presentation">
      <button
        type="button"
        aria-label="Close export panel"
        className={`absolute inset-0 cursor-pointer border-0 bg-black/50 transition-opacity duration-300 ease-out ${
          entered ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        className={`relative z-10 flex h-full w-full max-w-lg flex-col border-l border-gray-200 bg-white shadow-2xl transition-transform duration-300 ease-out ${
          entered ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-customers-title"
      >
        <div className="flex shrink-0 items-center gap-2.5 border-b border-gray-200 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-blue-100 bg-blue-50 text-blue-600">
            <ArrowUpCircle className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="export-customers-title" className="text-lg font-semibold text-blue-900">
              Export customers
            </h2>
            {seed.stateLabel ? (
              <p className="truncate text-xs text-gray-500">{seed.stateLabel}</p>
            ) : null}
          </div>
        </div>

        {step === 1 ? (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-3">
              <div className="flex flex-col gap-3">
                <DateRangeFilterCard
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  onFrom={setDateFrom}
                  onTo={setDateTo}
                  dateClass={dateClass}
                />
                <FieldCard
                  title="Profile & account"
                  count={profileCount}
                  shell={sectionShell}
                  titleRow={sectionTitleRow}
                  fields={PROFILE_FIELDS}
                  selected={selected}
                  onToggle={toggleField}
                  onSelectAll={(on) => setGroup(PROFILE_FIELD_IDS, on)}
                />
                <FieldCard
                  title="Orders & spend"
                  count={orderCount}
                  shell={sectionShell}
                  titleRow={sectionTitleRow}
                  fields={ORDER_FIELDS}
                  selected={selected}
                  onToggle={toggleField}
                  onSelectAll={(on) => setGroup(ORDER_FIELD_IDS, on)}
                />
              </div>
            </div>
            <div className="shrink-0 border-t border-gray-200 px-5 py-4">
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="cursor-pointer rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-blue-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-4">
              <div className="space-y-4">
                <DateRangeFilterCard
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  onFrom={setDateFrom}
                  onTo={setDateTo}
                  dateClass={dateClass}
                />

                <ScopeCard
                  title="Account status"
                  mode={statusMode}
                  onMode={setStatusMode}
                  allLabel="All statuses"
                >
                  <CheckList
                    options={ACCOUNT_STATUSES.map((s) => ({
                      value: s,
                      label: s.charAt(0) + s.slice(1).toLowerCase(),
                    }))}
                    selected={statuses}
                    onToggle={(v) => toggleValue(statuses, v, setStatuses)}
                  />
                </ScopeCard>

                <ScopeCard
                  title="Risk flag"
                  mode={riskMode}
                  onMode={setRiskMode}
                  allLabel="All risk levels"
                >
                  <CheckList
                    options={RISK_FLAGS.map((s) => ({
                      value: s,
                      label: s.charAt(0) + s.slice(1).toLowerCase(),
                    }))}
                    selected={risks}
                    onToggle={(v) => toggleValue(risks, v, setRisks)}
                  />
                </ScopeCard>

                <ScopeCard
                  title="Service used"
                  mode={serviceMode}
                  onMode={setServiceMode}
                  allLabel="All services"
                >
                  <CheckList
                    options={SERVICES}
                    selected={services}
                    onToggle={(v) => toggleValue(services, v, setServices)}
                  />
                </ScopeCard>

                <ScopeCard
                  title="Trust tier"
                  mode={trustMode}
                  onMode={setTrustMode}
                  allLabel="All trust tiers"
                >
                  <CheckList
                    options={TRUST_TIERS.map((s) => ({
                      value: s,
                      label: TRUST_TIER_LABEL[s],
                    }))}
                    selected={trustTiers}
                    onToggle={(v) => toggleValue(trustTiers, v, setTrustTiers)}
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

function DateRangeFilterCard({
  dateFrom,
  dateTo,
  onFrom,
  onTo,
  dateClass,
}: {
  dateFrom: string;
  dateTo: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  dateClass: string;
}) {
  const hasRange = Boolean(dateFrom || dateTo);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Created date range</h3>
        {hasRange ? (
          <button
            type="button"
            onClick={() => {
              onFrom("");
              onTo("");
            }}
            className="cursor-pointer text-xs font-medium text-blue-600 hover:underline"
          >
            Clear (export all)
          </button>
        ) : null}
      </div>
      <p className="mb-3 text-xs text-gray-500">
        Optional. Leave From / To empty to export all customers.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-medium text-gray-600">
          From
          <input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => onFrom(e.target.value)}
            className={dateClass}
          />
        </label>
        <label className="block text-xs font-medium text-gray-600">
          To
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => onTo(e.target.value)}
            className={dateClass}
          />
        </label>
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
  fields: { id: CustomerExportFieldId; label: string; locked?: boolean }[][];
  selected: Set<CustomerExportFieldId>;
  onToggle: (id: CustomerExportFieldId) => void;
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
                <label
                  key={f.id}
                  className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700"
                >
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
          <input
            type="radio"
            checked={mode === "all"}
            onChange={() => onMode("all")}
            className={radioClass}
          />
          {allLabel}
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input
            type="radio"
            checked={mode === "specific"}
            onChange={() => onMode("specific")}
            className={radioClass}
          />
          Select
        </label>
        {mode === "specific" ? <div className="ml-6">{children}</div> : null}
      </div>
    </div>
  );
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
        <label
          key={o.value}
          className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700"
        >
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
