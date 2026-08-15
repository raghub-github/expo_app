"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatCloseReasonForCard } from "@/lib/merchantPortalCloseReasons";
import { partnerSurfaceOnlineFromStoreOperationsBody } from "@/lib/partnerStoreSurfaceOnline";
import {
  parseActiveRushFromApi,
  parseScheduledTimeOffsFromApi,
  type ActiveRushWindowRow,
  type ScheduledTimeOffRow,
} from "@/lib/storeDashboardScheduledOff";
import { computeStoreStatusBadge, formatHmsCountdown } from "@/lib/storeStatusCardFormat";
import { isStoreDelisted } from "@/lib/merchants/store-delist";

export type StoreOperationsSnapshot = {
  operational_status?: string;
  within_operating_hours?: boolean;
  today_slots?: { start: string; end: string }[];
  configured_today_slots?: { start: string; end: string }[];
  close_reason?: string | null;
  block_auto_open?: boolean;
  is_today_scheduled_closed?: boolean;
  schedule_phase?: string | null;
  schedule_status_label?: string | null;
  restriction_type?: string | null;
  within_hours_but_restricted?: boolean;
  opens_at?: string | null;
  next_schedule_transition_at?: string | null;
  countdown_at?: string | null;
  countdown_kind?: string | null;
  countdown_wall_label?: string | null;
  scheduled_time_offs?: unknown;
  active_rush?: unknown;
  last_toggled_by_email?: string | null;
  last_toggle_type?: string | null;
  last_toggled_by_name?: string | null;
  last_toggled_by_id?: string | null;
  last_toggled_at?: string | null;
  is_delisted?: boolean;
  delisted_at?: string | null;
  approval_status?: string | null;
};

const EMPTY_SLOTS: { start: string; end: string }[] = [];

function normalizeRestrictionType(raw: unknown): string | null {
  const rtRaw = raw != null ? String(raw).trim() : "";
  if (!rtRaw) return null;
  const upper = rtRaw.toUpperCase();
  if (upper === "MANUAL_HOLD" || upper === "CLOSED_TODAY" || upper === "TEMPORARY") return upper;
  if (rtRaw.toLowerCase() === "manual_hold") return "MANUAL_HOLD";
  return upper;
}

export function useStoreStatusCardModel(
  operationsData: StoreOperationsSnapshot | undefined,
  opts: { storeTimezone?: string | null; storeIdLabel?: string | null; onCountdownExpired?: () => void }
) {
  const storeTimeZone =
    typeof opts.storeTimezone === "string" && opts.storeTimezone.trim() !== ""
      ? opts.storeTimezone.trim()
      : "Asia/Kolkata";
  const onCountdownExpiredRef = useRef(opts.onCountdownExpired);
  onCountdownExpiredRef.current = opts.onCountdownExpired;

  const [manualActivationLock, setManualActivationLock] = useState(false);
  const [countdownTick, setCountdownTick] = useState(0);

  const isDelisted = isStoreDelisted(operationsData);
  const d = operationsData;

  const todaySlots = d?.today_slots?.length ? d.today_slots : EMPTY_SLOTS;
  const configuredTodaySlots = d?.configured_today_slots?.length ? d.configured_today_slots : EMPTY_SLOTS;
  const schedulePhase = typeof d?.schedule_phase === "string" ? d.schedule_phase : null;
  const scheduleStatusLabel = typeof d?.schedule_status_label === "string" ? d.schedule_status_label : null;
  const isTodayScheduledClosed = d?.is_today_scheduled_closed === true;
  const nextScheduleTransitionAt =
    typeof d?.next_schedule_transition_at === "string" ? d.next_schedule_transition_at : null;
  const countdownAt = typeof d?.countdown_at === "string" ? d.countdown_at : null;
  const countdownKind = typeof d?.countdown_kind === "string" ? d.countdown_kind : null;
  const countdownWallLabel = typeof d?.countdown_wall_label === "string" ? d.countdown_wall_label : null;
  const lastToggleBy = d?.last_toggled_by_email ?? null;
  const lastToggleType = d?.last_toggle_type ?? null;
  const lastToggledByName = d?.last_toggled_by_name ?? null;
  const lastToggledAt = d?.last_toggled_at ?? null;
  const restrictionType = normalizeRestrictionType(d?.restriction_type);
  const withinHoursButRestricted = d?.within_hours_but_restricted === true;
  const opensAt = d?.opens_at ?? null;
  const blockAutoOpen = d?.block_auto_open === true;

  const scheduledTimeOffs = useMemo(
    () => parseScheduledTimeOffsFromApi(d?.scheduled_time_offs),
    [d?.scheduled_time_offs]
  );
  const activeRush = useMemo(() => parseActiveRushFromApi(d?.active_rush), [d?.active_rush]);

  const isStoreOpen = useMemo(() => {
    if (isDelisted) return false;
    if (!d || d.operational_status === undefined) return false;
    const surface = partnerSurfaceOnlineFromStoreOperationsBody(d as Record<string, unknown>);
    return surface ?? d.operational_status === "OPEN";
  }, [d, isDelisted]);

  useEffect(() => {
    setManualActivationLock(blockAutoOpen);
  }, [blockAutoOpen]);

  const closeReasonDisplay = useMemo(() => {
    const r = operationsData?.close_reason;
    return formatCloseReasonForCard(r != null && String(r).trim() !== "" ? String(r).trim() : null);
  }, [operationsData?.close_reason]);

  const cardDisplaySlots = useMemo(() => {
    if (configuredTodaySlots.length > 0) return configuredTodaySlots;
    if (todaySlots.length > 0) return todaySlots;
    return [];
  }, [configuredTodaySlots, todaySlots]);

  const cardBreakGapLabel = useMemo(() => {
    if (cardDisplaySlots.length < 2) return null;
    const toMin = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return (h ?? 0) * 60 + (m ?? 0);
    };
    const end1 = toMin(cardDisplaySlots[0].end);
    const start2 = toMin(cardDisplaySlots[1].start);
    if (start2 > end1) {
      const fmt = (t: string) => {
        const parts = t.split(":");
        if (parts.length === 2) return `${t}:00`;
        return t;
      };
      return `${fmt(cardDisplaySlots[0].end)} – ${fmt(cardDisplaySlots[1].start)}`;
    }
    return null;
  }, [cardDisplaySlots]);

  const activeCountdownAt = isDelisted
    ? null
    : countdownAt ?? opensAt ?? nextScheduleTransitionAt ?? null;
  const showScheduleCountdown =
    !isDelisted && !isStoreOpen && !withinHoursButRestricted && !!activeCountdownAt;

  const opensCountdownLabel = useMemo(() => {
    if (countdownKind === "break_starts_in") return "Break starts in";
    if (countdownKind === "reopens_in") return "Reopens in";
    if (isTodayScheduledClosed || schedulePhase === "OFF_DAY" || countdownKind === "next_online_in") {
      return "Next online in";
    }
    if (schedulePhase === "BREAK") return "Reopens in";
    if (schedulePhase === "PRE_BREAK") return "Break starts in";
    if (!isStoreOpen && schedulePhase === "OUTSIDE_HOURS") return "Opens in";
    if (!isStoreOpen && countdownKind == null && activeCountdownAt) return "Opens in";
    return "Opens in";
  }, [countdownKind, isTodayScheduledClosed, schedulePhase, isStoreOpen, activeCountdownAt]);

  const countdownSubtitleWallLabel = useMemo(() => {
    if (countdownWallLabel && String(countdownWallLabel).trim() !== "") return countdownWallLabel;
    if (!activeCountdownAt) return null;
    try {
      return new Date(activeCountdownAt).toLocaleString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return null;
    }
  }, [countdownWallLabel, activeCountdownAt]);

  const storeStatusBadge = useMemo(
    () =>
      computeStoreStatusBadge({
        isStoreOpen,
        restrictionType,
        schedulePhase,
        isTodayScheduledClosed,
        countdownKind,
        scheduledTimeOffs,
        isDelisted,
      }),
    [isStoreOpen, restrictionType, schedulePhase, isTodayScheduledClosed, countdownKind, scheduledTimeOffs, isDelisted]
  );

  const showScheduledOffStartsCountdown =
    !isDelisted &&
    isStoreOpen &&
    !scheduledTimeOffs.some((x) => x.phase === "active") &&
    scheduledTimeOffs.some((x) => x.phase === "upcoming");

  const scheduledOffStartsInMs = useMemo(() => {
    void countdownTick;
    let bestTs: number | null = null;
    const now = Date.now();
    for (const row of scheduledTimeOffs) {
      if (row.phase !== "upcoming") continue;
      const t = new Date(row.starts_at).getTime();
      if (!Number.isFinite(t) || t <= now) continue;
      if (bestTs == null || t < bestTs) bestTs = t;
    }
    return bestTs != null ? bestTs - now : null;
  }, [scheduledTimeOffs, countdownTick]);

  const formatScheduledTimeOffWindow = useCallback(
    (startsAt: string, endsAt: string) => {
      try {
        const s = new Date(startsAt);
        const e = new Date(endsAt);
        if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
          return { primary: `${startsAt} – ${endsAt}`, secondary: null as string | null };
        }
        const dOpts: Intl.DateTimeFormatOptions = {
          timeZone: storeTimeZone,
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        };
        const tOpts: Intl.DateTimeFormatOptions = {
          timeZone: storeTimeZone,
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        };
        const d1 = s.toLocaleDateString("en-IN", dOpts);
        const d2 = e.toLocaleDateString("en-IN", dOpts);
        const t1 = s.toLocaleTimeString("en-IN", tOpts);
        const t2 = e.toLocaleTimeString("en-IN", tOpts);
        if (d1 === d2) return { primary: d1, secondary: `${t1} – ${t2}` };
        return { primary: `${d1}, ${t1} → ${d2}, ${t2}`, secondary: null };
      } catch {
        return { primary: `${startsAt} – ${endsAt}`, secondary: null };
      }
    },
    [storeTimeZone]
  );

  useEffect(() => {
    if (isDelisted) return;
    const target = activeCountdownAt;
    if (!isStoreOpen && target && !withinHoursButRestricted) {
      const t = setInterval(() => {
        const ms = new Date(target).getTime() - Date.now();
        if (ms <= 0) {
          onCountdownExpiredRef.current?.();
          return;
        }
        setCountdownTick((n) => n + 1);
      }, 1000);
      return () => clearInterval(t);
    }
    if (showScheduledOffStartsCountdown) {
      const t = setInterval(() => setCountdownTick((n) => n + 1), 1000);
      return () => clearInterval(t);
    }
  }, [
    isDelisted,
    isStoreOpen,
    activeCountdownAt,
    withinHoursButRestricted,
    showScheduledOffStartsCountdown,
  ]);

  return {
    isDelisted,
    isStoreOpen,
    restrictionType,
    storeStatusBadge,
    cardDisplaySlots,
    cardBreakGapLabel,
    scheduledTimeOffs,
    activeRush,
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
    manualActivationLock,
    setManualActivationLock,
    showScheduledOffStartsCountdown,
    scheduledOffStartsInMs,
  };
}
