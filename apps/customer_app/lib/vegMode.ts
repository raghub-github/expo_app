/** Veg Mode calendar + store-scope helpers. Weekdays use JS Date#getDay() (0=Sun … 6=Sat). */

export type VegModeStoreScope = "all_restaurants" | "pure_veg_only";

export type VegModePrefs = {
  enabled: boolean;
  storeScope: VegModeStoreScope;
  /** null = every day; otherwise selected JS weekday numbers. */
  weekdays: number[] | null;
};

export const VEG_MODE_WEEKDAY_CHIPS: readonly { label: string; day: number }[] = [
  { label: "M", day: 1 },
  { label: "T", day: 2 },
  { label: "W", day: 3 },
  { label: "T", day: 4 },
  { label: "F", day: 5 },
  { label: "S", day: 6 },
  { label: "S", day: 0 },
];

export function calendarDay(now: Date = new Date()): number {
  return now.getDay();
}

export function normalizeWeekdays(raw: unknown): number[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const days = [
    ...new Set(
      raw
        .map((d) => Number(d))
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    ),
  ].sort((a, b) => a - b);
  return days.length > 0 ? days : null;
}

export function isWeekdayActive(weekdays: number[] | null, day: number = calendarDay()): boolean {
  if (weekdays == null) return true;
  return weekdays.includes(day);
}

export function isVegModeActiveToday(prefs: Pick<VegModePrefs, "enabled" | "weekdays">, day: number = calendarDay()): boolean {
  return prefs.enabled === true && isWeekdayActive(prefs.weekdays, day);
}

/** Visual VEG MODE switch — on only when prefs are enabled and today is a veg day. */
export function isVegToggleOn(prefs: Pick<VegModePrefs, "enabled" | "weekdays">, day: number = calendarDay()): boolean {
  return isVegModeActiveToday(prefs, day);
}

/**
 * Hide mixed/non-veg stores. True only when Veg Mode is active today AND
 * the user chose "Pure Veg restaurants only".
 */
export function isVegStoreFilterActive(
  prefs: Pick<VegModePrefs, "enabled" | "storeScope" | "weekdays">,
  day: number = calendarDay()
): boolean {
  return isVegModeActiveToday(prefs, day) && prefs.storeScope === "pure_veg_only";
}

export function parseStoredVegMode(raw: unknown): VegModePrefs {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const hasEnabledKey = Object.prototype.hasOwnProperty.call(obj, "enabled");
  const legacyOn = !hasEnabledKey && obj.vegOnly === true;
  const storeScope: VegModeStoreScope =
    obj.storeScope === "pure_veg_only" || (legacyOn && obj.storeScope == null)
      ? "pure_veg_only"
      : "all_restaurants";
  return {
    // Explicit `enabled: false` must stay off — never re-enable via leftover `vegOnly`.
    enabled: hasEnabledKey ? obj.enabled === true : legacyOn,
    storeScope,
    weekdays: normalizeWeekdays(obj.weekdays),
  };
}

export type VegModeRemotePayload = VegModePrefs & { updatedAt?: string };

export function mergeVegModePrefs(
  local: VegModePrefs & { updatedAt?: string },
  remote: VegModeRemotePayload | null
): VegModePrefs & { updatedAt?: string } {
  if (!remote) return local;
  const localTs = Date.parse(local.updatedAt ?? "") || 0;
  const remoteTs = Date.parse(remote.updatedAt ?? "") || 0;
  // Strict newer-wins. Ties keep local so a stale/default remote cannot flip the toggle on.
  if (remoteTs > localTs) {
    return {
      enabled: remote.enabled === true,
      storeScope: remote.storeScope === "pure_veg_only" ? "pure_veg_only" : "all_restaurants",
      weekdays: normalizeWeekdays(remote.weekdays),
      updatedAt: remote.updatedAt,
    };
  }
  return local;
}
