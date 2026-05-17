"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCloseReasonForCard } from "@/lib/merchantPortalCloseReasons";
import { partnerSurfaceOnlineFromStoreOperationsBody } from "@/lib/partnerStoreSurfaceOnline";
import {
  parseActiveRushFromApi,
  parseScheduledTimeOffsFromApi,
  type ActiveRushWindowRow,
  type ScheduledTimeOffRow,
} from "@/lib/storeDashboardScheduledOff";
import { computeStoreStatusBadge, formatHmsCountdown } from "@/lib/storeStatusCardFormat";

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
};

export function useStoreStatusCardModel(
  operationsData: StoreOperationsSnapshot | undefined,
  opts: { storeTimezone?: string | null; storeIdLabel?: string | null; onCountdownExpired?: () => void }
) {
  const storeTimeZone =
    typeof opts.storeTimezone === "string" && opts.storeTimezone.trim() !== ""
      ? opts.storeTimezone.trim()
      : "Asia/Kolkata";

  const [todaySlots, setTodaySlots] = useState<{ start: string; end: string }[]>([]);
  const [configuredTodaySlots, setConfiguredTodaySlots] = useState<{ start: string; end: string }[]>([]);
  const [restrictionType, setRestrictionType] = useState<string | null>(null);
  const [withinHoursButRestricted, setWithinHoursButRestricted] = useState(false);
  const [opensAt, setOpensAt] = useState<string | null>(null);
  const [schedulePhase, setSchedulePhase] = useState<string | null>(null);
  const [scheduleStatusLabel, setScheduleStatusLabel] = useState<string | null>(null);
  const [isTodayScheduledClosed, setIsTodayScheduledClosed] = useState(false);
  const [nextScheduleTransitionAt, setNextScheduleTransitionAt] = useState<string | null>(null);
  const [countdownAt, setCountdownAt] = useState<string | null>(null);
  const [countdownKind, setCountdownKind] = useState<string | null>(null);
  const [countdownWallLabel, setCountdownWallLabel] = useState<string | null>(null);
  const [scheduledTimeOffs, setScheduledTimeOffs] = useState<ScheduledTimeOffRow[]>([]);
  const [activeRush, setActiveRush] = useState<ActiveRushWindowRow | null>(null);
  const [lastToggleBy, setLastToggleBy] = useState<string | null>(null);
  const [lastToggleType, setLastToggleType] = useState<string | null>(null);
  const [lastToggledByName, setLastToggledByName] = useState<string | null>(null);
  const [lastToggledAt, setLastToggledAt] = useState<string | null>(null);
  const [manualActivationLock, setManualActivationLock] = useState(false);
  const [countdownTick, setCountdownTick] = useState(0);

  const isStoreOpen = useMemo(() => {
    if (!operationsData || operationsData.operational_status === undefined) return false;
    const surface = partnerSurfaceOnlineFromStoreOperationsBody(operationsData as Record<string, unknown>);
    return surface ?? operationsData.operational_status === "OPEN";
  }, [operationsData]);

  useEffect(() => {
    const d = operationsData;
    if (!d || d.operational_status === undefined) return;
    const slots = d.today_slots || [];
    setTodaySlots(slots);
    setConfiguredTodaySlots(d.configured_today_slots || []);
    setSchedulePhase(typeof d.schedule_phase === "string" ? d.schedule_phase : null);
    setScheduleStatusLabel(typeof d.schedule_status_label === "string" ? d.schedule_status_label : null);
    setIsTodayScheduledClosed(d.is_today_scheduled_closed === true);
    setNextScheduleTransitionAt(
      typeof d.next_schedule_transition_at === "string" ? d.next_schedule_transition_at : null
    );
    setCountdownAt(typeof d.countdown_at === "string" ? d.countdown_at : null);
    setCountdownKind(typeof d.countdown_kind === "string" ? d.countdown_kind : null);
    setCountdownWallLabel(typeof d.countdown_wall_label === "string" ? d.countdown_wall_label : null);
    setScheduledTimeOffs(parseScheduledTimeOffsFromApi(d.scheduled_time_offs));
    setActiveRush(parseActiveRushFromApi(d.active_rush));
    setLastToggleBy(d.last_toggled_by_email ?? null);
    setLastToggleType(d.last_toggle_type ?? null);
    setLastToggledByName(d.last_toggled_by_name ?? null);
    setLastToggledAt(d.last_toggled_at ?? null);
    const rtRaw = d.restriction_type != null ? String(d.restriction_type).trim() : "";
    if (!rtRaw) {
      setRestrictionType(null);
    } else {
      const upper = rtRaw.toUpperCase();
      if (upper === "MANUAL_HOLD" || upper === "CLOSED_TODAY" || upper === "TEMPORARY") {
        setRestrictionType(upper);
      } else if (rtRaw.toLowerCase() === "manual_hold") {
        setRestrictionType("MANUAL_HOLD");
      } else {
        setRestrictionType(upper);
      }
    }
    setWithinHoursButRestricted(d.within_hours_but_restricted === true);
    setOpensAt(d.opens_at ?? null);
    setManualActivationLock(d.block_auto_open === true);
  }, [operationsData]);

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

  const activeCountdownAt = countdownAt ?? opensAt ?? nextScheduleTransitionAt ?? null;
  const showScheduleCountdown = !isStoreOpen && !withinHoursButRestricted && !!activeCountdownAt;

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
      }),
    [isStoreOpen, restrictionType, schedulePhase, isTodayScheduledClosed, countdownKind, scheduledTimeOffs]
  );

  const showScheduledOffStartsCountdown =
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
    const target = activeCountdownAt;
    if (!isStoreOpen && target && !withinHoursButRestricted) {
      const t = setInterval(() => {
        const ms = new Date(target).getTime() - Date.now();
        if (ms <= 0) {
          opts.onCountdownExpired?.();
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
    isStoreOpen,
    activeCountdownAt,
    withinHoursButRestricted,
    showScheduledOffStartsCountdown,
    opts.onCountdownExpired,
  ]);

  return {
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
