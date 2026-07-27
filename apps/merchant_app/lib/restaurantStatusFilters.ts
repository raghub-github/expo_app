/** Filter keys for multi-restaurant status list (Partner-style). */

import type { OperatingHours } from "@/services/outletApi";
import {
  getNextOpenClose,
  nowInStoreTz,
  operatingHoursToFlatRow,
} from "@/lib/merchantStoreNextOpenIso";

export type RestaurantStatusFilterId =
  | "online"
  | "temporarily_closed"
  | "in_rush"
  | "outside_slot"
  | "all_offline"
  | "offline_action_required";

export const RESTAURANT_STATUS_FILTERS: {
  id: RestaurantStatusFilterId;
  label: string;
}[] = [
  { id: "online", label: "Online" },
  { id: "temporarily_closed", label: "Temporarily closed" },
  { id: "in_rush", label: "In rush mode" },
  { id: "outside_slot", label: "Outside delivery slot timings" },
  { id: "all_offline", label: "All offline restaurants" },
  { id: "offline_action_required", label: "Offline: Action required" },
];

export type RestaurantStatusSnapshot = {
  isOpen: boolean;
  withinOperatingHours: boolean;
  rushActive: boolean;
  statusReason: string | null;
  unavailableReason: string | null;
  restrictionType: string | null;
  manualCloseUntil: string | null;
  manualActivationLock: boolean;
  scheduleEndPrompt: boolean;
};

function norm(v: string | null | undefined): string {
  return String(v ?? "").trim().toLowerCase();
}

export function isTemporarilyClosed(s: RestaurantStatusSnapshot): boolean {
  if (s.isOpen) return false;
  const r = norm(s.statusReason);
  const u = norm(s.unavailableReason);
  if (r === "manual_close" || u === "manual_close") return true;
  if (s.manualCloseUntil) {
    const t = new Date(s.manualCloseUntil).getTime();
    if (Number.isFinite(t) && t > Date.now()) return true;
  }
  return false;
}

export function isOutsideDeliverySlot(s: RestaurantStatusSnapshot): boolean {
  if (s.withinOperatingHours === false) return true;
  const r = norm(s.statusReason);
  const u = norm(s.unavailableReason);
  return (
    r === "outside_operating_hours" ||
    r === "schedule_closed" ||
    u === "outside_operating_hours" ||
    u === "schedule_closed"
  );
}

export function needsOfflineAction(s: RestaurantStatusSnapshot): boolean {
  if (s.isOpen) return false;
  if (s.manualActivationLock) return true;
  if (s.scheduleEndPrompt) return true;
  const r = norm(s.statusReason);
  const u = norm(s.unavailableReason);
  return r === "manual_lock" || r === "forced_lock" || u === "manual_indefinite";
}

export function matchesRestaurantStatusFilter(
  s: RestaurantStatusSnapshot,
  filter: RestaurantStatusFilterId | null
): boolean {
  if (!filter) return true;
  switch (filter) {
    case "online":
      return s.isOpen;
    case "temporarily_closed":
      return isTemporarilyClosed(s);
    case "in_rush":
      return s.rushActive;
    case "outside_slot":
      return isOutsideDeliverySlot(s);
    case "all_offline":
      return !s.isOpen;
    case "offline_action_required":
      return needsOfflineAction(s);
    default:
      return true;
  }
}

export function deliveryStatusLabel(s: RestaurantStatusSnapshot): string {
  if (s.isOpen) return "Receiving orders";
  if (isTemporarilyClosed(s)) return "Temporarily closed";
  if (isOutsideDeliverySlot(s)) return "Outside delivery hours";
  if (needsOfflineAction(s)) return "Action required";
  return "Not receiving orders";
}

/** Normalize API times ("22:30", "22:30:00", ISO) → "HH:mm". */
export function normalizeHm(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  const hm = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (hm) {
    const h = Math.min(23, Math.max(0, Number(hm[1]) || 0));
    const m = Math.min(59, Math.max(0, Number(hm[2]) || 0));
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    try {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(d);
      const h = parts.find((p) => p.type === "hour")?.value ?? "00";
      const m = parts.find((p) => p.type === "minute")?.value ?? "00";
      return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
    } catch {
      return null;
    }
  }
  return null;
}

/** Display "10:30 PM" style (MerchantHeader parity). */
export function formatSlotTime12h(t: string | null | undefined): string {
  const hm = normalizeHm(t);
  if (!hm) return "";
  const [hStr, mStr] = hm.split(":");
  const h = Number(hStr);
  const m = Number(mStr ?? "0");
  if (!Number.isFinite(h)) return hm;
  const isPM = h >= 12;
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const displayM = m.toString().padStart(2, "0");
  return `${displayH}:${displayM} ${isPM ? "PM" : "AM"}`;
}

export function formatSlotLabel(nextOpen?: string | null, nextClose?: string | null): string {
  const open = formatSlotTime12h(nextOpen);
  const close = formatSlotTime12h(nextClose);
  if (open && close) return `${open} – ${close}`;
  if (open) return `Opens ${open}`;
  if (close) return `Closes ${close}`;
  return "See details";
}

/**
 * Current delivery slot from operating hours (IST) — preferred over raw API next_open/close.
 * Falls back to API fields when hours are unavailable.
 */
export function formatCurrentDeliverySlot(
  hours: OperatingHours | null | undefined,
  nextOpen?: string | null,
  nextClose?: string | null
): string {
  if (hours?.is_24_hours) return "Open 24 hours";

  if (hours) {
    const { dayOfWeek, minutesSinceMidnight } = nowInStoreTz();
    const flat = operatingHoursToFlatRow(hours);
    const computed = getNextOpenClose(flat, dayOfWeek, minutesSinceMidnight);

    const dayKeys = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ] as const;
    const dayKey = dayKeys[dayOfWeek];
    const closedDays = Array.isArray(hours.closed_days) ? hours.closed_days : [];
    if (closedDays.some((d) => String(d).toLowerCase() === dayKey)) {
      if (computed.next_open_time) return `Opens ${formatSlotTime12h(computed.next_open_time)}`;
      return "Closed today";
    }

    const sourceKey = hours.same_for_all_days ? "monday" : dayKey;
    const daySlots = hours[sourceKey];
    if (!daySlots?.open) {
      if (computed.next_open_time) return `Opens ${formatSlotTime12h(computed.next_open_time)}`;
      return "Closed today";
    }

    // Within a slot → show that slot's full range (correct close time from hours table).
    const endGrace = 30 / 60;
    const parseMin = (t: string | null | undefined) => {
      const hm = normalizeHm(t);
      if (!hm) return null;
      const [h, m] = hm.split(":").map(Number);
      return h * 60 + m;
    };
    const candidates: Array<{ start: string; end: string }> = [];
    if (daySlots.slot1_start && daySlots.slot1_end) {
      candidates.push({ start: daySlots.slot1_start, end: daySlots.slot1_end });
    }
    if (daySlots.slot2_start && daySlots.slot2_end) {
      candidates.push({ start: daySlots.slot2_start, end: daySlots.slot2_end });
    }
    for (const slot of candidates) {
      const startMin = parseMin(slot.start);
      const endMin = parseMin(slot.end);
      if (startMin == null || endMin == null || endMin <= startMin) continue;
      if (minutesSinceMidnight >= startMin && minutesSinceMidnight <= endMin + endGrace) {
        return `${formatSlotTime12h(slot.start)} – ${formatSlotTime12h(slot.end)}`;
      }
    }

    if (computed.next_open_time) return `Opens ${formatSlotTime12h(computed.next_open_time)}`;
    if (computed.next_close_time) return `Closes ${formatSlotTime12h(computed.next_close_time)}`;
  }

  return formatSlotLabel(nextOpen, nextClose);
}
