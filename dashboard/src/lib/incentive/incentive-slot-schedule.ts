export type SlotDayMode = "full_week" | "weekdays" | "weekends" | "specific_days";

export type SlotWindowInput = {
  start_time: string;
  end_time: string;
  label?: string | null;
};

export type IncentiveTimeWindowPayload = {
  day_of_week: number | null;
  start_time: string;
  end_time: string;
  label?: string | null;
};

export const DAY_OF_WEEK_OPTIONS = [
  { value: 0, label: "Sun", full: "Sunday" },
  { value: 1, label: "Mon", full: "Monday" },
  { value: 2, label: "Tue", full: "Tuesday" },
  { value: 3, label: "Wed", full: "Wednesday" },
  { value: 4, label: "Thu", full: "Thursday" },
  { value: 5, label: "Fri", full: "Friday" },
  { value: 6, label: "Sat", full: "Saturday" },
] as const;

export const WEEKEND_DAYS = [0, 6];
export const WEEKDAY_DAYS = [1, 2, 3, 4, 5];
export const FULL_WEEK_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function resolveActiveDays(mode: SlotDayMode, specificDays: number[]): number[] {
  switch (mode) {
    case "weekdays":
      return [...WEEKDAY_DAYS];
    case "weekends":
      return [...WEEKEND_DAYS];
    case "specific_days":
      return [...specificDays].sort((a, b) => a - b);
    default:
      return [...FULL_WEEK_DAYS];
  }
}

export function normalizeTimeInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  return trimmed;
}

export function slotDayModeLabel(mode: SlotDayMode): string {
  switch (mode) {
    case "full_week":
      return "Full week";
    case "weekdays":
      return "Weekdays";
    case "weekends":
      return "Weekends";
    case "specific_days":
      return "Specific days";
  }
}

export function buildIncentiveTimeWindows(params: {
  slot_mode: "all_day" | "custom_slots";
  slot_day_mode: SlotDayMode;
  specific_days: number[];
  slot_windows: SlotWindowInput[];
}): IncentiveTimeWindowPayload[] {
  const days = resolveActiveDays(params.slot_day_mode, params.specific_days);

  const slots =
    params.slot_mode === "all_day"
      ? [{ start_time: "00:00:00", end_time: "23:59:59", label: "All day" }]
      : params.slot_windows
          .filter((s) => s.start_time.trim() !== "" && s.end_time.trim() !== "")
          .map((s) => ({
            start_time: normalizeTimeInput(s.start_time),
            end_time: normalizeTimeInput(s.end_time),
            label: s.label?.trim() || null,
          }));

  if (slots.length === 0) return [];

  if (params.slot_day_mode === "full_week") {
    return slots.map((slot) => ({
      day_of_week: null,
      start_time: slot.start_time,
      end_time: slot.end_time,
      label: slot.label,
    }));
  }

  const windows: IncentiveTimeWindowPayload[] = [];
  for (const day of days) {
    for (const slot of slots) {
      windows.push({
        day_of_week: day,
        start_time: slot.start_time,
        end_time: slot.end_time,
        label: slot.label,
      });
    }
  }
  return windows;
}

export function validateSlotSchedule(params: {
  slot_mode: "all_day" | "custom_slots";
  slot_day_mode: SlotDayMode;
  specific_days: number[];
  slot_windows: SlotWindowInput[];
}): string | null {
  if (params.slot_day_mode === "specific_days" && params.specific_days.length === 0) {
    return "Select at least one day for specific-days schedule.";
  }

  if (params.slot_mode === "custom_slots") {
    const valid = params.slot_windows.filter(
      (s) => s.start_time.trim() !== "" && s.end_time.trim() !== "",
    );
    if (valid.length === 0) {
      return "Add at least one custom slot window with start and end time.";
    }
    for (const slot of valid) {
      if (normalizeTimeInput(slot.start_time) >= normalizeTimeInput(slot.end_time)) {
        return "Each slot window end time must be after start time.";
      }
    }
  }

  return null;
}
