"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bike, Loader2, RefreshCw, Search, X } from "lucide-react";
import { OrderMixedText, OrderNum } from "@/components/orders/orders-typography";

export type SelectableRider = {
  riderId: number;
  name: string | null;
  mobile: string | null;
  distanceKm: number | null;
  distanceFromMxKm?: number | null;
  distanceFromCxKm?: number | null;
  etaMinutes: number | null;
  onlineStatus: "ONLINE" | "BUSY" | "OFFLINE";
  dutyLoadStatus?: "AVAILABLE" | "OCCUPIED";
  activeOrderCount: number;
  completedOrderCount?: number;
  occupiedOrderId?: string | null;
  vehicleType: string | null;
  rating: number | null;
  earningsToday: number | null;
  acceptanceRate: number | null;
  lat?: number | null;
  lng?: number | null;
};

export type RiderSelectionMode = "manual" | "force";

export type RiderSelectionSideSheetProps = {
  open: boolean;
  mode: RiderSelectionMode;
  orderLabel?: string | null;
  orderId: number;
  /** Exclude current assignee from the list when force-assigning. */
  excludeRiderId?: number | null;
  loading?: boolean;
  submitting?: boolean;
  riders: SelectableRider[];
  onClose: () => void;
  onConfirm: (rider: SelectableRider) => void;
  onRefresh?: () => void;
};

function formatDistance(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return "—";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(2)} km`;
}

function onlineLabel(s: string): string {
  const u = s.toUpperCase();
  if (u === "ONLINE") return "Online";
  if (u === "BUSY") return "Busy";
  return "Offline";
}

function onlineDotClass(s: string): string {
  const u = s.toUpperCase();
  if (u === "ONLINE") return "bg-emerald-500";
  if (u === "BUSY") return "bg-orange-500";
  return "bg-slate-400";
}

/** Merchant-centric radius options for Force Assignment (max 10 km). */
const FORCE_RADIUS_KM_OPTIONS = [1, 2, 3, 5, 10] as const;
type ForceRadiusKm = (typeof FORCE_RADIUS_KM_OPTIONS)[number];
const DEFAULT_FORCE_RADIUS_KM: ForceRadiusKm = 3;

function mxDistanceKm(r: SelectableRider): number | null {
  const km = r.distanceFromMxKm ?? r.distanceKm;
  return km != null && Number.isFinite(km) ? km : null;
}

/**
 * Force / rider-picker sheet — same shell pattern as Order Chat History
 * (full-viewport overlay + right drawer with slide-in).
 */
export function RiderSelectionSideSheet({
  open,
  mode,
  orderLabel,
  orderId: _orderId,
  excludeRiderId,
  loading = false,
  submitting = false,
  riders,
  onClose,
  onConfirm,
  onRefresh,
}: RiderSelectionSideSheetProps) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [onlineOnly, setOnlineOnly] = useState(true);
  const [topCountInput, setTopCountInput] = useState("");
  const [radiusKm, setRadiusKm] = useState<ForceRadiusKm>(DEFAULT_FORCE_RADIUS_KM);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelectedIds([]);
      setOnlineOnly(true);
      setTopCountInput("");
      setRadiusKm(DEFAULT_FORCE_RADIUS_KM);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    let list = riders.filter((r) => r.riderId !== excludeRiderId);
    // Merchant (mx) distance — backend already caps at 10 km.
    list = list.filter((r) => {
      const d = mxDistanceKm(r);
      return d != null && d <= radiusKm;
    });
    if (onlineOnly) {
      list = list.filter((r) => r.onlineStatus === "ONLINE" || r.onlineStatus === "BUSY");
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          String(r.riderId).includes(q) ||
          (r.name ?? "").toLowerCase().includes(q) ||
          (r.mobile ?? "").includes(q) ||
          (r.occupiedOrderId ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [riders, excludeRiderId, onlineOnly, query, radiusKm]);

  // Drop selections that fall outside the current radius / filters.
  useEffect(() => {
    const allowed = new Set(filtered.map((r) => r.riderId));
    setSelectedIds((prev) => {
      const next = prev.filter((id) => allowed.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [filtered]);

  const allSelected =
    filtered.length > 0 && filtered.every((r) => selectedIds.includes(r.riderId));

  const selectTopCount = useCallback(
    (count: number) => {
      const n = Math.max(0, Math.min(filtered.length, Math.floor(count)));
      setSelectedIds(filtered.slice(0, n).map((r) => r.riderId));
      setTopCountInput(n > 0 ? String(n) : "");
    },
    [filtered]
  );

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
      setTopCountInput("");
      return;
    }
    setSelectedIds(filtered.map((r) => r.riderId));
    setTopCountInput(filtered.length > 0 ? String(filtered.length) : "");
  };

  const toggleRider = (riderId: number) => {
    setSelectedIds((prev) => {
      if (prev.includes(riderId)) return prev.filter((id) => id !== riderId);
      return [...prev, riderId];
    });
  };

  /** Confirm uses the topmost selected rider in the current list order. */
  const primarySelected =
    filtered.find((r) => selectedIds.includes(r.riderId)) ?? null;

  const handleConfirm = useCallback(() => {
    if (!primarySelected || submitting) return;
    onConfirm(primarySelected);
  }, [primarySelected, submitting, onConfirm]);

  if (!open || typeof document === "undefined") return null;

  const isForce = mode === "force";
  const title = isForce ? "Force Assignment" : "Assign Rider";
  const formattedLabel = orderLabel?.trim() || null;
  const confirmLabel = isForce ? "Send Assignment Offer" : "Assign Selected Rider";

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex justify-end bg-slate-900/50 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-xl flex-col border-l border-slate-200 bg-[#F3F4F6] shadow-2xl animate-[slideInRight_0.28s_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold leading-tight text-slate-900">{title}</h2>
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                {formattedLabel ? (
                  <OrderNum className="inline-flex rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800 ring-1 ring-sky-200">
                    {formattedLabel}
                  </OrderNum>
                ) : null}
                <span>Select a rider for this order</span>
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 cursor-pointer"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
              <span className="whitespace-nowrap pr-1 text-[10px] text-slate-500">
                Total:{" "}
                <OrderNum className="font-semibold text-slate-800">
                  {filtered.length}
                </OrderNum>
                {selectedIds.length > 0 ? (
                  <>
                    {" · "}
                    <OrderNum>{selectedIds.length}</OrderNum> selected
                  </>
                ) : null}
              </span>
            </div>
          </div>
        </header>

        <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 space-y-2.5">
          <div className="flex flex-nowrap items-stretch gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, ID, or mobile…"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-2 text-xs outline-none focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
              />
            </div>
            <input
              type="number"
              min={0}
              max={filtered.length || undefined}
              inputMode="numeric"
              value={topCountInput}
              disabled={filtered.length === 0 || loading}
              onChange={(e) => {
                const raw = e.target.value;
                setTopCountInput(raw);
                if (raw.trim() === "") {
                  setSelectedIds([]);
                  return;
                }
                const n = Number(raw);
                if (Number.isFinite(n)) selectTopCount(n);
              }}
              placeholder="Count"
              title="Auto-select top N riders from the list"
              className="w-16 shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs outline-none focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100 disabled:opacity-50"
            />
            <label className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-slate-700 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                disabled={filtered.length === 0 || loading}
                className="rounded border-slate-300"
              />
              Select all
            </label>
          </div>

          <div className="flex flex-nowrap items-center gap-3 overflow-x-auto">
            <div className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap">
              <button
                type="button"
                role="switch"
                aria-checked={onlineOnly}
                aria-label="On duty / busy only"
                onClick={() => {
                  setOnlineOnly((v) => !v);
                  setTopCountInput("");
                }}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors ${
                  onlineOnly
                    ? "border-violet-600 bg-violet-600"
                    : "border-slate-300 bg-slate-200"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                    onlineOnly ? "translate-x-[1.125rem]" : "translate-x-0.5"
                  }`}
                />
              </button>
              <button
                type="button"
                onClick={() => {
                  setOnlineOnly((v) => !v);
                  setTopCountInput("");
                }}
                className="cursor-pointer text-xs text-slate-600"
              >
                On duty / busy only
              </button>
            </div>

            <div className="ml-auto inline-flex shrink-0 flex-nowrap items-center gap-1.5 whitespace-nowrap">
              <label
                htmlFor="force-assign-radius"
                className="text-[10px] font-medium text-slate-500"
              >
                Radius
              </label>
              <select
                id="force-assign-radius"
                value={radiusKm}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if ((FORCE_RADIUS_KM_OPTIONS as readonly number[]).includes(n)) {
                    setRadiusKm(n as ForceRadiusKm);
                    setTopCountInput("");
                  }
                }}
                className="w-[4.75rem] cursor-pointer rounded-lg border border-sky-300 bg-white px-1.5 py-1 text-xs text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                title="Filter riders by distance from merchant (max 10 km)"
              >
                {FORCE_RADIUS_KM_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r} km
                  </option>
                ))}
              </select>
            </div>

            {onRefresh ? (
              <button
                type="button"
                onClick={onRefresh}
                className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-xs font-medium text-violet-700 hover:underline"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                Refresh
              </button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {loading ? (
            <div className="flex min-h-[280px] items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading eligible riders…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-2 px-6 text-center">
              <Bike className="h-10 w-10 text-slate-300" strokeWidth={1.5} />
              <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
                No riders match
              </p>
              <p className="text-[11px] text-slate-400">
                {riders.length === 0
                  ? "No riders with live GPS within 10 km of the merchant."
                  : onlineOnly
                    ? "Try turning off “On duty / busy only” or increase Radius."
                    : "Try increasing Radius."}
              </p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((r) => {
                const active = selectedIds.includes(r.riderId);
                const mxKm = r.distanceFromMxKm ?? r.distanceKm;
                const cxKm = r.distanceFromCxKm ?? null;
                const completed = r.completedOrderCount ?? 0;
                const loadStatus =
                  r.dutyLoadStatus ??
                  (r.activeOrderCount > 0 ? "OCCUPIED" : "AVAILABLE");
                const occupiedId = r.occupiedOrderId?.trim() || null;

                return (
                  <li key={r.riderId}>
                    <button
                      type="button"
                      onClick={() => toggleRider(r.riderId)}
                      className={`w-full rounded-lg border px-2 py-2 text-left transition ${
                        active
                          ? "border-violet-500 bg-violet-50/70 ring-1 ring-violet-400"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="grid grid-cols-[18px_minmax(0,1.05fr)_minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.75fr)] items-start gap-x-1.5">
                        <span
                          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                            active
                              ? "border-violet-600 bg-violet-600 text-white"
                              : "border-slate-300 bg-white"
                          }`}
                          aria-hidden
                        >
                          {active ? (
                            <span className="text-[9px] font-bold leading-none">✓</span>
                          ) : null}
                        </span>

                        <div className="min-w-0 text-[10px] leading-snug text-slate-600">
                          <p className="truncate">
                            Rider id -{" "}
                            <OrderNum className="font-semibold text-slate-900">
                              {r.riderId}
                            </OrderNum>
                          </p>
                          <p className="truncate">
                            Rider no -{" "}
                            <span className="font-medium text-slate-800">
                              {r.mobile || "—"}
                            </span>
                          </p>
                        </div>

                        <div className="min-w-0 text-[10px] leading-snug text-slate-600">
                          <p className="truncate">
                            Rider name -{" "}
                            <span className="font-semibold text-slate-900">
                              {r.name || `Rider #${r.riderId}`}
                            </span>
                          </p>
                          <p className="inline-flex items-center gap-1 truncate">
                            Status -{" "}
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${onlineDotClass(r.onlineStatus)}`}
                              aria-hidden
                            />
                            <span className="font-medium text-slate-800">
                              {onlineLabel(r.onlineStatus)}
                            </span>
                          </p>
                        </div>

                        <div className="min-w-0 text-[10px] leading-snug text-slate-600">
                          <p className="truncate">
                            Completed -{" "}
                            <OrderNum className="font-semibold text-slate-900">
                              {completed}
                            </OrderNum>
                          </p>
                          <p className="truncate">
                            Status -{" "}
                            {loadStatus === "OCCUPIED" ? (
                              <span className="font-medium text-orange-700">
                                Occupied
                                {occupiedId ? (
                                  <>
                                    {" · "}
                                    <OrderMixedText className="font-semibold text-slate-800">
                                      {occupiedId}
                                    </OrderMixedText>
                                  </>
                                ) : null}
                              </span>
                            ) : (
                              <span className="font-medium text-emerald-700">Available</span>
                            )}
                          </p>
                        </div>

                        <div className="min-w-0 text-[10px] leading-snug text-slate-600">
                          <p className="truncate">
                            Dist mx -{" "}
                            <span className="font-medium text-slate-800">
                              {formatDistance(mxKm)}
                            </span>
                          </p>
                          <p className="truncate">
                            Dist cx -{" "}
                            <span className="font-medium text-slate-800">
                              {formatDistance(cxKm)}
                            </span>
                          </p>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Always visible assignment actions */}
        <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!primarySelected || submitting}
            onClick={handleConfirm}
            className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 bg-violet-600 hover:bg-violet-700"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-1.5 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                Working…
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
