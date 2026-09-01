import { normalizeWallTimeToHHMM } from "@/lib/wallTimeHHMM";

export type DayType =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export const WEEKDAY_KEYS: readonly DayType[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export type TimeSlot = {
  id: string;
  openingTime: string;
  closingTime: string;
};

export type DaySchedule = {
  day: DayType;
  label: string;
  isOpen: boolean;
  slots: TimeSlot[];
  is24Hours: boolean;
  isOutletClosed: boolean;
  duration: string;
  operationalHours: number;
  operationalMinutes: number;
};

export function parseDbBool(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value == null || value === "") return false;
  const s = String(value).trim().toLowerCase();
  if (s === "true" || s === "t" || s === "yes" || s === "1") return true;
  if (s === "false" || s === "f" || s === "no" || s === "0") return false;
  return Boolean(value);
}

export function calculateOperationalTime(slots: TimeSlot[]): { hours: number; minutes: number } {
  if (slots.length === 0) return { hours: 0, minutes: 0 };
  let totalMinutes = 0;
  for (const slot of slots) {
    const [openHour, openMinute] = slot.openingTime.split(":").map(Number);
    const [closeHour, closeMinute] = slot.closingTime.split(":").map(Number);
    let openingMinutes = openHour * 60 + openMinute;
    let closingMinutes = closeHour * 60 + closeMinute;
    if (closingMinutes < openingMinutes) closingMinutes += 24 * 60;
    totalMinutes += closingMinutes - openingMinutes;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return { hours, minutes };
}

export function getCurrentDayKeyInTimeZone(timeZone?: string | null): DayType {
  const tz =
    (timeZone && String(timeZone).trim()) ||
    (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "") ||
    "Asia/Kolkata";
  const dayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" });
  const dayStr = dayFormatter.format(new Date()).toLowerCase();
  const map: DayType[] = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const idx = map.indexOf(dayStr as DayType);
  return map[idx >= 0 ? idx : 1];
}

export const initialSchedule: DaySchedule[] = WEEKDAY_KEYS.map((day) => ({
  day,
  label: day.toUpperCase(),
  isOpen: false,
  slots: [],
  is24Hours: false,
  isOutletClosed: false,
  duration: "0.0 hrs",
  operationalHours: 0,
  operationalMinutes: 0,
}));

/** Map GET operating-hours JSON to partnersite DaySchedule[]. */
export function mapDbToSchedule(data: Record<string, unknown>): {
  schedule: DaySchedule[];
  sameForAll: boolean;
  force24Hours: boolean;
  closedDay: DayType | null;
} {
  const loadedSchedule: DaySchedule[] = WEEKDAY_KEYS.map((day) => {
    const rawOpen = parseDbBool(data[`${day}_open`]);
    const slots: TimeSlot[] = [];
    let is24Hours = false;

    const s1Start = normalizeWallTimeToHHMM(data[`${day}_slot1_start`]);
    const s1End = normalizeWallTimeToHHMM(data[`${day}_slot1_end`]);
    const s2Start = normalizeWallTimeToHHMM(data[`${day}_slot2_start`]);
    const s2End = normalizeWallTimeToHHMM(data[`${day}_slot2_end`]);

    const dayDurationMin = Number(data[`${day}_total_duration_minutes`]) || 0;

    let hadSlot1FromPrimary = false;
    if (s1Start && s1End) {
      const midnightPair = s1Start === "00:00" && s1End === "00:00";
      const treatAsEmptyPlaceholder = midnightPair && !data.is_24_hours && dayDurationMin === 0;
      if (!treatAsEmptyPlaceholder || !!data.is_24_hours) {
        slots.push({ id: "1", openingTime: s1Start, closingTime: s1End });
        hadSlot1FromPrimary = true;
        if (s1Start === "00:00" && (s1End === "23:59" || (s1End === "00:00" && !!data.is_24_hours))) {
          is24Hours = true;
        }
      }
    }
    if (is24Hours && slots.length === 0) {
      slots.push({ id: "1", openingTime: "00:00", closingTime: "23:59" });
    }
    if (hadSlot1FromPrimary) {
      if (s2Start && s2End) slots.push({ id: "2", openingTime: s2Start, closingTime: s2End });
    } else if (s2Start && s2End) {
      slots.push({ id: "1", openingTime: s2Start, closingTime: s2End });
    }

    const durationFromSlots = calculateOperationalTime(
      slots.length > 0 ? slots : [{ id: "1", openingTime: "00:00", closingTime: "23:59" }]
    );
    let minutes = Number(data[`${day}_total_duration_minutes`]) || 0;
    if (slots.length > 0) {
      minutes = durationFromSlots.hours * 60 + durationFromSlots.minutes;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return {
      day,
      label: day.toUpperCase(),
      isOpen: rawOpen,
      slots,
      is24Hours,
      isOutletClosed: false,
      duration: `${hours}.${mins.toString().padStart(2, "0")} hrs`,
      operationalHours: hours,
      operationalMinutes: mins,
    };
  });

  const populatedDays = loadedSchedule.filter((day) => day.slots.length > 0);
  const referenceDay = populatedDays.find((d) => d.day === "monday") ?? populatedDays[0] ?? null;
  const dbDayOpen = (d: DayType) => parseDbBool(data[`${d}_open`]);
  const shouldMirrorAll = !!data.same_for_all_days || !!data.is_24_hours;
  const shouldFillOpenDaysMissingSlots =
    referenceDay != null &&
    !shouldMirrorAll &&
    populatedDays.length > 0 &&
    loadedSchedule.some((d) => dbDayOpen(d.day) && d.slots.length === 0);

  const normalizedSchedule = referenceDay
    ? loadedSchedule.map((day) => {
        if (day.slots.length > 0) return day;
        const copySlots =
          (shouldMirrorAll && dbDayOpen(day.day)) ||
          (shouldFillOpenDaysMissingSlots && dbDayOpen(day.day)) ||
          (!shouldMirrorAll &&
            populatedDays.length === 1 &&
            dbDayOpen(day.day) &&
            day.slots.length === 0);
        if (!copySlots) return day;
        return {
          ...day,
          slots: referenceDay.slots.map((slot) => ({
            ...slot,
            id: `${day.day}-${slot.id}-${slot.openingTime}-${slot.closingTime}`,
          })),
          is24Hours: referenceDay.is24Hours,
          duration: referenceDay.duration,
          operationalHours: referenceDay.operationalHours,
          operationalMinutes: referenceDay.operationalMinutes,
        };
      })
    : loadedSchedule;

  const offDays = WEEKDAY_KEYS.filter((d) => !parseDbBool(data[`${d}_open`]));
  return {
    schedule: normalizedSchedule,
    sameForAll: !!data.same_for_all_days,
    force24Hours: !!data.is_24_hours,
    closedDay: offDays.length > 0 ? offDays[0] : null,
  };
}

/** Build PATCH body for dashboard operating-hours API (full week). */
export function scheduleToPatchPayload(
  schedule: DaySchedule[],
  sameForAll: boolean,
  force24Hours: boolean
): Record<string, unknown> {
  const closedDays = schedule
    .filter((day) => !day.isOpen || day.isOutletClosed)
    .map((day) => day.day);

  const payload: Record<string, unknown> = {
    same_for_all_days: sameForAll,
    is_24_hours: force24Hours,
    closed_days: closedDays.length > 0 ? closedDays : [],
  };

  for (const day of schedule) {
    const prefix = day.day;
    const isOpen = day.isOpen && !day.isOutletClosed;
    payload[`${prefix}_open`] = isOpen;
    if (force24Hours || computeIs24FromSlots(day.slots)) {
      payload[`${prefix}_slot1_start`] = "00:00";
      payload[`${prefix}_slot1_end`] = "23:59";
      payload[`${prefix}_slot2_start`] = null;
      payload[`${prefix}_slot2_end`] = null;
    } else {
      payload[`${prefix}_slot1_start`] = day.slots[0]?.openingTime || null;
      payload[`${prefix}_slot1_end`] = day.slots[0]?.closingTime || null;
      payload[`${prefix}_slot2_start`] = day.slots[1]?.openingTime || null;
      payload[`${prefix}_slot2_end`] = day.slots[1]?.closingTime || null;
    }
  }

  return payload;
}

export function slotHasTimingData(slot?: TimeSlot | null): boolean {
  return !!(slot?.openingTime?.trim() && slot?.closingTime?.trim());
}

/**
 * A day is 24-hour ONLY when it has exactly one slot spanning the whole day.
 * Derived from slots so editing 00:00–23:59 (or adding a 2nd slot) does not stay
 * sticky — otherwise PATCH rewrites 00:00–23:59 and evening-slot UI stays locked.
 */
export function computeIs24FromSlots(slots: TimeSlot[]): boolean {
  if (slots.length !== 1) return false;
  const s = slots[0];
  return s?.openingTime === "00:00" && (s?.closingTime === "23:59" || s?.closingTime === "00:00");
}
