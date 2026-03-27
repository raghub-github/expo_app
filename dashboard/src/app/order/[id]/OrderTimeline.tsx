"use client";

import { useEffect, useState } from "react";

export interface OrderTimelineEntry {
  id: number;
  orderId: number;
  status: string;
  previousStatus: string | null;
  actorType: string;
  actorId: number | null;
  actorName: string | null;
  statusMessage: string | null;
  occurredAt: string;
  /** ETA at time of this status (from order_timelines.expected_by_at). */
  expectedByAt?: string | null;
}

/** First 4 stages always shown on every order page once order is created. */
const FOUR_ALWAYS_STAGES = [
  "Created",
  "Bill Ready",
  "Payment Initiated At",
  "Payment Done",
] as const;

type DisplayEntry = OrderTimelineEntry & { placeholder?: boolean };

interface OrderTimelineProps {
  orderId: number;
  /** When provided, timeline shows instantly with no loading. Parent should fetch timeline with order. */
  initialEntries?: OrderTimelineEntry[] | null;
  /** Current order status label (e.g. for ETA breached styling). */
  currentStatus?: string;
  /** Order created_at (for ETA fallback). */
  orderCreatedAt?: Date | null;
  /** ETA timestamp (expected delivery time). From order.estimatedDeliveryTime or order.createdAt + order.etaSeconds. */
  etaAt?: Date | null;
  /** order_timelines.id of the stage that was current when ETA was first breached (red dot). From DB. */
  etaBreachedTimelineId?: number | null;
}

export default function OrderTimeline({ orderId, initialEntries, currentStatus, orderCreatedAt, etaAt, etaBreachedTimelineId }: OrderTimelineProps) {
  const [entries, setEntries] = useState<OrderTimelineEntry[]>(initialEntries ?? []);
  const [loading, setLoading] = useState(!initialEntries);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialEntries != null) {
      setEntries(initialEntries);
      setLoading(false);
      return;
    }
    if (!orderId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/orders/${orderId}/timeline`)
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        if (body?.success && Array.isArray(body.data)) {
          setEntries(body.data);
        } else {
          setEntries([]);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load timeline");
          setEntries([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, initialEntries]);

  const formatTimeShort = (date: Date) => {
    if (!date || isNaN(date.getTime())) return "—";
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear()).slice(-2);
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${day}-${month}-${year} ${hours}:${minutes} ${ampm}`;
  };

  /** Same as other company: round to nearest minute; when only minutes, show "X Minute(s)". */
  const formatAfterBeforeEta = (occurredAt: Date, expectedBy: Date): string => {
    const diffMs = occurredAt.getTime() - expectedBy.getTime();
    const totalMins = Math.round(Math.abs(diffMs) / 60000);
    const part =
      totalMins < 60
        ? `${totalMins} ${totalMins === 1 ? "Minute" : "Minutes"}`
        : formatMinsAsYMoDHM(totalMins).replace(/\./g, ". ");
    return diffMs >= 0 ? `${part} after ETA` : `${part} before ETA`;
  };

  /** Format minutes: only non-zero parts, dot-separated y.mo.d.h.m (e.g. 20d.2h.9m or 1y.2mo.20d.2h.9m). */
  const formatMinsAsYMoDHM = (totalMins: number): string => {
    if (totalMins < 0) return "0m";
    const minsPerYear = 365 * 24 * 60;
    const minsPerMonth = 30 * 24 * 60;
    const minsPerDay = 24 * 60;
    const minsPerHour = 60;
    const years = Math.floor(totalMins / minsPerYear);
    let r = totalMins % minsPerYear;
    const months = Math.floor(r / minsPerMonth);
    r %= minsPerMonth;
    const days = Math.floor(r / minsPerDay);
    r %= minsPerDay;
    const hours = Math.floor(r / minsPerHour);
    const mins = r % minsPerHour;
    const parts: string[] = [];
    if (years > 0) parts.push(`${years}y`);
    if (months > 0) parts.push(`${months}mo`);
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (mins > 0 || parts.length === 0) parts.push(`${mins}m`);
    return parts.join(".");
  };

  /** Format minutes: show only non-zero parts among d, h, m (e.g. 20d.2h.38m) for timeline badges. */
  const formatMinsAsDaysHours = (totalMins: number): string => {
    if (totalMins < 0) return "0m";
    const minsPerDay = 24 * 60;
    const minsPerHour = 60;
    const days = Math.floor(totalMins / minsPerDay);
    const r = totalMins % minsPerDay;
    const hours = Math.floor(r / minsPerHour);
    const mins = r % minsPerHour;
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (mins > 0 || parts.length === 0) parts.push(`${mins}m`);
    return parts.join(".");
  };

  /** Format total minutes as "X years, Y months, Z days, W hours, V minutes" (only non-zero parts). */
  const formatMinsAsYearsMonthsDaysHoursMinutes = (totalMins: number): string => {
    if (totalMins < 0) return "0 minutes";
    const minsPerYear = 365 * 24 * 60;
    const minsPerMonth = 30 * 24 * 60;
    const minsPerDay = 24 * 60;
    const minsPerHour = 60;
    const years = Math.floor(totalMins / minsPerYear);
    let r = totalMins % minsPerYear;
    const months = Math.floor(r / minsPerMonth);
    r %= minsPerMonth;
    const days = Math.floor(r / minsPerDay);
    r %= minsPerDay;
    const hours = Math.floor(r / minsPerHour);
    const minutes = r % minsPerHour;
    const parts: string[] = [];
    if (years > 0) parts.push(`${years} ${years === 1 ? "year" : "years"}`);
    if (months > 0) parts.push(`${months} ${months === 1 ? "month" : "months"}`);
    if (days > 0) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
    if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
    return parts.join(", ");
  };

  const currentStatusLower = (currentStatus ?? "").toLowerCase();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(interval);
  }, []);
  const hasEta = etaAt != null && !isNaN(etaAt.getTime());
  const isDelivered = currentStatusLower === "delivered";
  const isCancelledStatus = currentStatusLower === "cancelled" || currentStatusLower === "rejected";
  const etaBreached = hasEta && !isDelivered && !isCancelledStatus && now.getTime() > etaAt.getTime();
  const minsLeftTillEta = hasEta && !isDelivered && !isCancelledStatus && now.getTime() < etaAt.getTime()
    ? Math.max(0, Math.round((etaAt.getTime() - now.getTime()) / 60000))
    : null;
  const minsElapsedPastEta = hasEta && etaBreached
    ? Math.max(0, Math.round((now.getTime() - etaAt.getTime()) / 60000))
    : null;

  const isCancelled =
    currentStatusLower === "cancelled" || currentStatusLower === "rejected";

  const getStageColor = (index: number, status: string, isEtaBreachedStage: boolean) => {
    const sl = status.toLowerCase();
    if (sl === "cancelled" || sl === "rejected") {
      return { dot: "bg-blue-500", text: "text-blue-600" };
    }
    if (isEtaBreachedStage) {
      return { dot: "bg-red-500", text: "text-red-600" };
    }
    if (sl === "delivered") {
      return { dot: "bg-emerald-500", text: "text-emerald-600" };
    }
    return { dot: "bg-emerald-500", text: "text-emerald-600" };
  };

  if (loading) {
    return (
      <div className="bg-white/95 rounded-lg pl-0 pr-2.5 pt-1 pb-2 shadow-[0_1px_2px_rgba(15,23,42,0.06)] border border-slate-200 mb-4">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 py-1">
          <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-500" />
          Loading timeline…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white/95 rounded-lg pl-0 pr-2.5 pt-1 pb-2 shadow-[0_1px_2px_rgba(15,23,42,0.06)] border border-slate-200 mb-4">
        <div className="text-[10px] text-red-600 py-1">{error}</div>
      </div>
    );
  }

  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const matchStage = (entry: OrderTimelineEntry, stage: string) =>
    norm(entry.status) === norm(stage);

  // Build display entries: first 4 stages always (real or placeholder), then any other statuses
  let displayEntries: DisplayEntry[] = [];
  if (entries.length === 0 && orderCreatedAt) {
    displayEntries = FOUR_ALWAYS_STAGES.map((stage, idx) =>
      stage === "Created"
        ? {
            id: 0,
            orderId,
            status: "Created",
            previousStatus: null,
            actorType: "system",
            actorId: null,
            actorName: null,
            statusMessage: null,
            occurredAt: orderCreatedAt.toISOString(),
            placeholder: false,
          }
        : {
            id: -idx,
            orderId,
            status: stage,
            previousStatus: null,
            actorType: "system",
            actorId: null,
            actorName: null,
            statusMessage: null,
            occurredAt: "",
            placeholder: true,
          }
    );
  } else if (entries.length > 0) {
    const fourSlots: DisplayEntry[] = FOUR_ALWAYS_STAGES.map((stage, idx) => {
      const found = entries.find((e) => matchStage(e, stage));
      if (found) return { ...found, placeholder: false };
      return {
        id: -idx,
        orderId,
        status: stage,
        previousStatus: null,
        actorType: "system",
        actorId: null,
        actorName: null,
        statusMessage: null,
        occurredAt: "",
        placeholder: true,
      };
    });
    const other = entries.filter(
      (e) => !FOUR_ALWAYS_STAGES.some((s) => matchStage(e, s))
    );
    displayEntries = [...fourSlots, ...other];
  }

  const hasDisplay = displayEntries.length > 0;
  if (!hasDisplay) {
    return (
      <div className="bg-white/95 rounded-lg pl-0 pr-2.5 pt-1 pb-2 shadow-[0_1px_2px_rgba(15,23,42,0.06)] border border-slate-200 mb-4">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 py-1">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <i className="bi bi-graph-up text-[10px]" />
          </span>
          No timeline events yet.
        </div>
      </div>
    );
  }

  const n = displayEntries.length;
  const gridCols = Math.min(n, 10);
  /** Min width per column so labels + timestamps don't overlap on small screens when scrolling. */
  const minColPx = 80;
  const timelineContentMinWidth = n * minColPx;
  const cancelledIndex = displayEntries.findIndex(
    (e) =>
      !e.placeholder &&
      (e.status.toLowerCase() === "cancelled" || e.status.toLowerCase() === "rejected")
  );
  const deliveredOrCancelledEntry = displayEntries.find(
    (e) =>
      !e.placeholder &&
      e.occurredAt &&
      (e.status.toLowerCase() === "delivered" || e.status.toLowerCase() === "cancelled")
  );
  const deliveredOrCancelledAfterEta =
    hasEta &&
    (isDelivered || isCancelledStatus) &&
    deliveredOrCancelledEntry?.occurredAt &&
    etaAt &&
    new Date(deliveredOrCancelledEntry.occurredAt).getTime() > etaAt.getTime();
  const breachedIndex =
    etaBreachedTimelineId != null
      ? displayEntries.findIndex(
          (e) => !e.placeholder && e.id === etaBreachedTimelineId
        )
      : -1;
  const breachedIndexResolved =
    breachedIndex >= 0 ? breachedIndex : etaBreached ? n - 1 : -1;
  const breachedEntry =
    breachedIndexResolved >= 0 && breachedIndexResolved < n
      ? displayEntries[breachedIndexResolved]
      : null;
  const showRedFromBreach =
    breachedIndexResolved >= 0 &&
    (etaBreached || deliveredOrCancelledAfterEta);

  return (
    <div className="bg-white/95 rounded-lg pl-2.5 pr-2.5 pt-1 pb-0 shadow-[0_1px_2px_rgba(15,23,42,0.06)] border border-slate-200 relative mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5 min-w-0">
        <div className="min-w-0">
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-medium text-slate-600 bg-slate-100 border border-slate-200 whitespace-nowrap">
            <i className="bi bi-graph-up text-slate-500 text-[10px] sm:hidden" />
            Order progress timeline · Delivery, GatiMitra
          </span>
        </div>
        {/* ETA tag — right corner, same row */}
        <div className="shrink-0 flex items-center gap-1.5">
          {hasEta && !isDelivered && !isCancelledStatus && (
            <>
              {etaBreached && minsElapsedPastEta != null && (
                <span className="px-2.5 py-1 rounded-full text-[9px] font-semibold text-white bg-red-500 border border-red-600 shadow-sm whitespace-nowrap">
                  {breachedEntry
                    ? `Breached at ${breachedEntry.status.replace(/_/g, " ")} · ${formatMinsAsYMoDHM(minsElapsedPastEta)} past`
                    : `ETA breached · ${formatMinsAsYMoDHM(minsElapsedPastEta)} past`}
                </span>
              )}
              {minsLeftTillEta != null && minsLeftTillEta >= 0 && !etaBreached && (
                <span className="px-2.5 py-1 rounded-full text-[9px] font-semibold text-white bg-emerald-500 border border-emerald-600 shadow-sm whitespace-nowrap">
                  {minsLeftTillEta}m left till ETA
                </span>
              )}
            </>
          )}
          {hasEta && (isDelivered || isCancelledStatus) && etaAt && (
            <span
              className={`px-2.5 py-1 rounded-full text-[9px] font-semibold whitespace-nowrap border ${
                deliveredOrCancelledAfterEta
                  ? "text-white bg-red-500 border-red-600 shadow-sm"
                  : (isDelivered || isCancelledStatus) && deliveredOrCancelledEntry?.occurredAt
                    ? "text-white bg-emerald-500 border-emerald-600 shadow-sm"
                    : "text-slate-700 bg-slate-100 border-slate-200"
              }`}
            >
              {deliveredOrCancelledEntry?.occurredAt
                ? isDelivered
                  ? `Was Delivered ${formatAfterBeforeEta(new Date(deliveredOrCancelledEntry.occurredAt), etaAt)}`
                  : `Was Cancelled ${formatAfterBeforeEta(new Date(deliveredOrCancelledEntry.occurredAt), etaAt)}`
                : isDelivered
                  ? "Delivered"
                  : "Cancelled"}
            </span>
          )}
        </div>
      </div>

      <div className="relative mt-1 overflow-x-auto pb-1 sm:overflow-visible">
        <div
          className="relative"
          style={{ minWidth: timelineContentMinWidth, minHeight: 72 }}
        >
          {/* Stage labels: inside scroll so they don't overlap on small screens */}
          <div
            className="grid mb-1 pr-0.5 gap-0"
            style={{ gridTemplateColumns: `repeat(${n}, minmax(${minColPx}px, 1fr))` }}
          >
            {displayEntries.map((entry) => (
              <div
                key={`label-${entry.id ?? entry.occurredAt}`}
                className="px-0.5 text-[8px] sm:text-[9px] font-normal text-center whitespace-nowrap leading-tight text-slate-600"
              >
                {entry.status.replace(/_/g, " ")}
              </div>
            ))}
          </div>
          <div className="absolute top-0 left-0 right-0" style={{ top: "1.25rem" }}>
            <div
              className="grid relative gap-0"
              style={{ gridTemplateColumns: `repeat(${n}, minmax(${minColPx}px, 1fr))` }}
            >
              {n > 1 &&
                displayEntries.slice(0, n - 1).map((_, index) => {
                  const isRedFromBreach =
                    showRedFromBreach && index >= breachedIndexResolved;
                  const isLineToCancelled =
                    cancelledIndex >= 1 && index === cancelledIndex - 1;
                  const isLineFromNotBreachedToBreached =
                    showRedFromBreach &&
                    breachedIndexResolved >= 1 &&
                    index === breachedIndexResolved - 1;
                  const lineColor = isRedFromBreach ? "#ef4444" : "#10b981";
                  const gradientToBlue = `linear-gradient(to right, ${lineColor}, #3b82f6)`;
                  const gradientGreenToRed =
                    "linear-gradient(to right, #10b981, #ef4444)";
                  const useGradient =
                    isLineToCancelled || isLineFromNotBreachedToBreached;
                  const backgroundStyle = isLineToCancelled
                    ? gradientToBlue
                    : isLineFromNotBreachedToBreached
                      ? gradientGreenToRed
                      : undefined;
                  return (
                    <div
                      key={`line-${index}`}
                      className={`absolute top-1/2 h-[2px] transform -translate-y-1/2 z-0 ${!useGradient ? (isRedFromBreach ? "bg-red-500" : "bg-emerald-500") : ""}`}
                      style={{
                        left: `${(index * 100) / n + 50 / n}%`,
                        width: `${100 / n}%`,
                        ...(backgroundStyle ? { background: backgroundStyle } : {}),
                      }}
                    />
                  );
                })}

              {displayEntries.map((entry, index) => {
                const isPlaceholder = entry.placeholder === true;
                const isEtaBreachedStage =
                  etaBreached &&
                  !isPlaceholder &&
                  (etaBreachedTimelineId != null
                    ? entry.id === etaBreachedTimelineId
                    : index === displayEntries.length - 1);
                const isPastBreachPoint = Boolean(
                  showRedFromBreach &&
                    !isPlaceholder &&
                    index >= breachedIndexResolved
                );
                const colors = isPlaceholder
                  ? { dot: "bg-slate-300", text: "text-slate-400" }
                  : getStageColor(index, entry.status, Boolean(isPastBreachPoint));
                const isCancelledEntry =
                  !isPlaceholder &&
                  (entry.status.toLowerCase() === "cancelled" || entry.status.toLowerCase() === "rejected");
                const occurredAt = entry.occurredAt
                  ? new Date(entry.occurredAt)
                  : null;
                const prevEntry = index > 0 ? displayEntries[index - 1] : null;
                const prevAt =
                  prevEntry?.occurredAt && !prevEntry.placeholder
                    ? new Date(prevEntry.occurredAt)
                    : null;
                const durationMinutes =
                  !isPlaceholder &&
                  occurredAt &&
                  prevAt &&
                  !isNaN(prevAt.getTime()) &&
                  !isNaN(occurredAt.getTime())
                    ? Math.round(
                        (occurredAt.getTime() - prevAt.getTime()) / 60000
                      )
                    : 0;

                const durationBadgeClass =
                  isCancelledEntry
                    ? "text-blue-600 bg-blue-50"
                    : isPastBreachPoint
                      ? "text-red-600 bg-red-50"
                      : "text-emerald-700 bg-emerald-50";

                return (
                  <div
                    key={entry.id || `${entry.occurredAt}-${index}`}
                    className="relative flex flex-col items-center"
                    style={{ gridColumn: index + 1 }}
                  >
                    <div className="absolute top-[6px] left-1/2 transform -translate-x-1/2 h-3 w-[1.5px] bg-slate-200" />
                    <div
                      className={`w-3 h-3 rounded-full flex items-center justify-center z-10 border border-white shadow-sm ${colors.dot} relative`}
                    >
                      <div className="absolute w-3 h-3 rounded-full border border-white/70" />
                      <div className="w-1 h-1 rounded-full bg-white" />
                    </div>
                    <div
                      className={`absolute top-[20px] text-[8px] sm:text-[9px] font-normal leading-tight whitespace-nowrap ${colors.text}`}
                    >
                      {occurredAt && !isNaN(occurredAt.getTime())
                        ? formatTimeShort(occurredAt)
                        : "—"}
                    </div>
                    {durationMinutes > 0 && (
                      <div className={`absolute top-[32px] text-[8px] sm:text-[9px] font-normal px-0.5 py-px rounded leading-tight ${durationBadgeClass}`}>
                        {formatMinsAsDaysHours(durationMinutes)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
