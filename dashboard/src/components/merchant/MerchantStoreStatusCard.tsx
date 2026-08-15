"use client";

import { CalendarClock, ChefHat, Power, Store } from "lucide-react";
import { MerchantStoreScheduleActions } from "@/components/merchant/MerchantStoreScheduleActions";
import { PARTNER_DASHBOARD_TOP_CARD_CLASS } from "@/components/merchant/partner-dashboard-card-styles";
import type { ActiveRushWindowRow, ScheduledTimeOffRow } from "@/lib/storeDashboardScheduledOff";
import { formatStoreActionSourceLabel } from "@/lib/storeActionSource";
import type { StoreStatusBadge } from "@/lib/storeStatusCardFormat";
import { formatHmsCountdown, formatTimeHMS } from "@/lib/storeStatusCardFormat";

export type MerchantStoreStatusCardProps = {
  isStoreOpen: boolean;
  restrictionType: string | null;
  storeStatusBadge: StoreStatusBadge;
  cardDisplaySlots: { start: string; end: string }[];
  cardBreakGapLabel: string | null;
  scheduledTimeOffs: ScheduledTimeOffRow[];
  activeRush?: ActiveRushWindowRow | null;
  formatScheduledTimeOffWindow: (
    startsAt: string,
    endsAt: string
  ) => { primary: string; secondary: string | null };
  isTodayScheduledClosed: boolean;
  scheduleStatusLabel: string | null;
  schedulePhase: string | null;
  showScheduleCountdown: boolean;
  activeCountdownAt: string | null;
  countdownTick: number;
  opensCountdownLabel: string;
  countdownKind: string | null;
  countdownSubtitleWallLabel: string | null;
  closeReasonDisplay: string | null;
  lastToggledByName: string | null;
  lastToggleBy: string | null;
  lastToggleType: string | null;
  lastToggledAt: string | null;
  storeIdLabel?: string | null;
  manualActivationLock: boolean;
  licenseBlockedForOps?: boolean;
  manualLockSubtext?: string;
  showScheduledOffStartsCountdown?: boolean;
  scheduledOffStartsInMs?: number | null;
  isDelisted?: boolean;
  onManualLockChange: (enabled: boolean) => void;
  onStoreToggle: () => void;
  /** When false, power/lock stay visible but disabled (view-only — partnersite layout). */
  canToggleStore?: boolean;
  /** Internal numeric store id — enables schedule-off / rush / close-today actions */
  storeInternalId?: string;
  onOperationsRefresh?: () => void | Promise<void>;
  className?: string;
};

/** Partner Site mx dashboard store status card — pixel-matched layout & styles. */
export function MerchantStoreStatusCard({
  isStoreOpen,
  restrictionType,
  storeStatusBadge,
  cardDisplaySlots,
  cardBreakGapLabel,
  scheduledTimeOffs,
  activeRush = null,
  formatScheduledTimeOffWindow,
  isTodayScheduledClosed,
  scheduleStatusLabel,
  schedulePhase,
  showScheduleCountdown,
  activeCountdownAt,
  countdownTick,
  opensCountdownLabel,
  countdownKind,
  countdownSubtitleWallLabel,
  closeReasonDisplay,
  lastToggledByName,
  lastToggleBy,
  lastToggleType,
  lastToggledAt,
  storeIdLabel,
  manualActivationLock,
  licenseBlockedForOps = false,
  manualLockSubtext,
  showScheduledOffStartsCountdown = false,
  scheduledOffStartsInMs = null,
  isDelisted = false,
  onManualLockChange,
  onStoreToggle,
  canToggleStore = true,
  storeInternalId,
  onOperationsRefresh,
  className = "",
}: MerchantStoreStatusCardProps) {
  const lockHelp =
    manualLockSubtext ??
    (licenseBlockedForOps
      ? "Locked while licence is expired — upload & verify first"
      : "Prevents automatic opening");
  const controlsLocked = !canToggleStore || licenseBlockedForOps;

  return (
    <div
      className={`${PARTNER_DASHBOARD_TOP_CARD_CLASS} ${
        isStoreOpen
          ? "border-emerald-200/70"
          : restrictionType === "MANUAL_HOLD"
            ? "border-amber-200/70"
            : "border-red-200/70"
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-sm">
              <Store className="h-[16px] w-[16px]" strokeWidth={2} />
            </span>
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Store status
            </h2>
            <span
              className={`inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${storeStatusBadge.pill}`}
            >
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${storeStatusBadge.dot}`} />
                <span className="min-w-0">{storeStatusBadge.label}</span>
              </span>
              {showScheduledOffStartsCountdown && scheduledOffStartsInMs != null ? (
                <span
                  className="inline-flex shrink-0 items-center border-l border-current/20 pl-2 tabular-nums text-[10px] font-semibold opacity-95"
                  aria-live="polite"
                >
                  {scheduledOffStartsInMs <= 0
                    ? "Starting soon"
                    : `Starts in ${formatHmsCountdown(scheduledOffStartsInMs)}`}
                </span>
              ) : null}
            </span>
          </div>
          {cardDisplaySlots.length === 0 ? (
            <div className="rounded-lg bg-slate-50/90 px-2.5 py-2 ring-1 ring-slate-200/70">
              <p className="text-sm font-semibold text-slate-500">—</p>
            </div>
          ) : cardDisplaySlots.length === 1 ? (
            <div className="rounded-lg bg-slate-50/90 px-2.5 py-2 ring-1 ring-slate-200/70">
              <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500 mb-0.5">
                Today&apos;s hours
              </p>
              <p className="text-lg sm:text-xl font-bold text-slate-900 tabular-nums leading-tight tracking-tight">
                {formatTimeHMS(cardDisplaySlots[0].start)} – {formatTimeHMS(cardDisplaySlots[0].end)}
              </p>
            </div>
          ) : (
            <div className="mt-1 space-y-1">
              {cardDisplaySlots.map((slot, idx) => (
                <div
                  key={`${slot.start}-${slot.end}-${idx}`}
                  className="flex items-center justify-between gap-2 rounded-md bg-slate-50/90 px-2 py-1 ring-1 ring-slate-200/70"
                >
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 shrink-0">
                    {idx === 0 ? "Slot 1" : "Slot 2"}
                  </span>
                  <span className="text-[11px] font-semibold tabular-nums text-slate-900 text-right">
                    {formatTimeHMS(slot.start)} – {formatTimeHMS(slot.end)}
                  </span>
                </div>
              ))}
              {cardBreakGapLabel && (
                <p className="text-[9px] font-medium text-amber-700 pl-0.5">
                  Break {cardBreakGapLabel}
                </p>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onStoreToggle}
          disabled={!canToggleStore}
          title={
            !canToggleStore
              ? "View-only access — store open/close locked"
              : isStoreOpen
                ? "Close store"
                : "Open store"
          }
          className={`shrink-0 flex h-10 w-10 items-center justify-center rounded-full text-white shadow-sm transition-transform hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:scale-100 ${
            isStoreOpen
              ? "bg-emerald-500 hover:bg-emerald-600 focus-visible:ring-emerald-500"
              : restrictionType === "MANUAL_HOLD"
                ? "bg-amber-500 hover:bg-amber-600 focus-visible:ring-amber-500"
                : "bg-red-500 hover:bg-red-600 focus-visible:ring-red-500"
          }`}
          aria-label={isStoreOpen ? "Close store" : "Open store"}
        >
          <Power size={18} strokeWidth={2.25} />
        </button>
      </div>

      <div className="flex flex-col gap-1.5 mt-2">
        {scheduledTimeOffs.length > 0 && (
          <div className="rounded-lg bg-amber-50/95 px-2.5 py-2 ring-1 ring-amber-200/80">
            <div className="flex items-start gap-2">
              <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-800" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wide text-amber-950">
                  Scheduled time-off
                </p>
                <ul className="mt-1.5 space-y-1.5">
                  {scheduledTimeOffs.map((row) => {
                    const { primary, secondary } = formatScheduledTimeOffWindow(
                      row.starts_at,
                      row.ends_at
                    );
                    return (
                      <li key={row.id} className="text-[11px] leading-snug text-amber-950">
                        <span
                          className={`font-semibold ${
                            row.phase === "active" ? "text-rose-800" : "text-amber-900"
                          }`}
                        >
                          {row.phase === "active" ? "Active" : "Upcoming"}
                        </span>
                        <span className="text-amber-950/90">
                          {" "}
                          · {primary}
                          {secondary ? ` · ${secondary}` : ""}
                          {row.reason ? ` · ${row.reason}` : ""}
                          {row.marked_from ? (
                            <> · via {formatStoreActionSourceLabel(row.marked_from)}</>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        )}
        {activeRush && activeRush.remaining_minutes > 0 && (
          <div className="rounded-lg bg-orange-50/95 px-2.5 py-2 ring-1 ring-orange-200/80">
            <div className="flex items-start gap-2">
              <ChefHat className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-800" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wide text-orange-950">Rush hour</p>
                <p className="mt-1 text-[11px] leading-snug text-orange-950">
                  <span className="font-semibold text-orange-900">Active</span>
                  <span className="text-orange-950/90">
                    {" "}
                    · ~{activeRush.remaining_minutes} min left
                    {activeRush.marked_from ? (
                      <> · via {formatStoreActionSourceLabel(activeRush.marked_from)}</>
                    ) : null}
                  </span>
                </p>
              </div>
            </div>
          </div>
        )}
        {!isTodayScheduledClosed && scheduleStatusLabel && !isStoreOpen && schedulePhase !== "BREAK" && !isDelisted && (
          <p className="text-[10px] font-medium text-slate-500">{scheduleStatusLabel}</p>
        )}
        {isDelisted ? (
          <div className="rounded-lg bg-red-50/90 px-2.5 py-2 ring-1 ring-red-200/80">
            <p className="text-[11px] font-semibold text-red-800 leading-snug">
              Delisted — this store stays closed until GatiMitra relists it.
            </p>
          </div>
        ) : null}
        {!isDelisted &&
          showScheduleCountdown &&
          activeCountdownAt &&
          (() => {
            void countdownTick;
            const ms = new Date(activeCountdownAt).getTime() - Date.now();
            const countdownText = formatHmsCountdown(ms);
            const isPreBreak = countdownKind === "break_starts_in" || schedulePhase === "PRE_BREAK";
            const boxClass = isPreBreak
              ? "rounded-lg bg-amber-50/90 px-2.5 py-2 ring-1 ring-amber-200/80"
              : "rounded-lg bg-red-50/90 px-2.5 py-2 ring-1 ring-red-200/80";
            const textClass = isPreBreak ? "text-amber-900" : "text-red-800";
            const subClass = isPreBreak ? "text-amber-700/90" : "text-red-600/90";
            const dotClass = isPreBreak ? "text-amber-400/90" : "text-red-400/90";
            return (
              <div className={boxClass}>
                <p className={`flex flex-nowrap items-center gap-x-2 text-[11px] ${textClass} leading-snug`}>
                  <span className="font-semibold shrink-0 whitespace-nowrap">
                    {opensCountdownLabel}{" "}
                    <span className="tabular-nums">{countdownText}</span>
                  </span>
                  {countdownSubtitleWallLabel && ms > 0 && (
                    <>
                      <span className={`${dotClass} shrink-0`} aria-hidden>
                        ·
                      </span>
                      <span className={`text-[10px] font-medium whitespace-nowrap ${subClass}`}>
                        {countdownKind === "reopens_in" || schedulePhase === "BREAK"
                          ? `Next slot at ${countdownSubtitleWallLabel}`
                          : `At ${countdownSubtitleWallLabel}`}
                      </span>
                    </>
                  )}
                </p>
              </div>
            );
          })()}
        {!isDelisted && !isStoreOpen && closeReasonDisplay && (
          <p className="text-[11px] text-slate-600 leading-snug line-clamp-3" title={closeReasonDisplay}>
            <span className="font-semibold text-slate-700">Close reason: </span>
            {closeReasonDisplay}
          </p>
        )}
        {!isDelisted && (lastToggledByName || lastToggleBy || lastToggleType) && lastToggledAt && (
          <div className="rounded-lg bg-slate-50/90 px-2.5 py-2 ring-1 ring-slate-200/70">
            <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500 mb-0.5">
              Last activity
            </p>
            <p className="text-[11px] text-slate-600 leading-snug">
              {(() => {
                const typeUp = String(lastToggleType || "").toUpperCase();
                const toggledAtDate = new Date(lastToggledAt);
                const timeStr = toggledAtDate.toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: true,
                });
                const dateStr = toggledAtDate.toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                });
                const email = lastToggleBy || "";
                const emailNorm = String(email).toLowerCase();
                const isGatiMitraAgent =
                  emailNorm.includes("gatimitra") ||
                  emailNorm.endsWith("@gatimitra.in") ||
                  emailNorm.endsWith("@gatimitra.com");
                if (typeUp.startsWith("AUTO")) {
                  return `${isStoreOpen ? "Auto on" : "Auto closed"} · ${timeStr} · ${dateStr}`;
                }
                if (isGatiMitraAgent) {
                  return `${isStoreOpen ? "Opened" : "Closed"} by GatiMitra (agent: ${email || "unknown"}) · ${timeStr} · ${dateStr}`;
                }
                const who = lastToggledByName || lastToggleBy || "Owner";
                return `${isStoreOpen ? "Opened" : "Closed"} by ${who}${storeIdLabel ? ` (ID: ${storeIdLabel})` : ""} · ${timeStr} · ${dateStr}`;
              })()}
            </p>
          </div>
        )}
      </div>

      {canToggleStore && !isDelisted && storeInternalId && onOperationsRefresh ? (
        <MerchantStoreScheduleActions storeId={storeInternalId} onRefresh={onOperationsRefresh} />
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2 pt-2.5 border-t border-slate-200/80 shrink-0">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-slate-800">Manual activation lock</p>
          <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
            {!canToggleStore ? "View-only — lock cannot be changed" : lockHelp}
          </p>
        </div>
        <label
          className={`relative inline-flex shrink-0 items-center ${
            controlsLocked ? "cursor-not-allowed opacity-50" : "cursor-pointer"
          }`}
          title={
            !canToggleStore
              ? "View-only access — manual lock disabled"
              : licenseBlockedForOps
                ? "Cannot change while store is closed due to expired licence"
                : undefined
          }
        >
          <input
            type="checkbox"
            checked={manualActivationLock}
            disabled={controlsLocked}
            onChange={(e) => {
              if (controlsLocked) return;
              onManualLockChange(e.target.checked);
            }}
            className="peer sr-only"
          />
          <div className="relative h-6 w-11 rounded-full bg-slate-200 transition-colors after:absolute after:left-[3px] after:top-[3px] after:h-[18px] after:w-[18px] after:rounded-full after:border after:border-slate-200/80 after:bg-white after:shadow-sm after:transition-transform after:content-[''] peer-focus-visible:ring-2 peer-focus-visible:ring-orange-400 peer-focus-visible:ring-offset-2 peer-checked:bg-red-600 peer-checked:after:translate-x-[22px]" />
        </label>
      </div>
    </div>
  );
}
