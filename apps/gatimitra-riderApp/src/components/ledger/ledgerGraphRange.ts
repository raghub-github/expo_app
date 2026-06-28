import {
  endOfDay,
  formatDateRangeChip,
  startOfDay,
} from "@/src/components/profile/OrderHistoryDateRangeSheet";

/** Monday 00:00 of the week containing `date` (ISO week: Mon–Sun). */
export function startOfWeekMonday(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - daysFromMonday);
  return d;
}

/** Sunday 23:59:59.999 of the week containing `date` (Mon–Sun). */
export function endOfWeekSunday(date: Date): Date {
  const d = startOfWeekMonday(date);
  d.setDate(d.getDate() + 6);
  return endOfDay(d);
}

/** Current calendar week: Monday 00:00 through Sunday end of day. */
export function getDefaultLedgerGraphRange(): { from: Date; to: Date } {
  const now = new Date();
  return {
    from: startOfWeekMonday(now),
    to: endOfWeekSunday(now),
  };
}

export function resolveLedgerGraphRange(
  customFrom: Date | null,
  customTo: Date | null,
): { from: Date; to: Date } {
  if (customFrom && customTo) {
    const from = startOfDay(customFrom);
    const to = endOfDay(customTo);
    if (from.getTime() <= to.getTime()) return { from, to };
    return { from: startOfDay(customTo), to: endOfDay(customFrom) };
  }

  if (customFrom) {
    return {
      from: startOfWeekMonday(customFrom),
      to: endOfWeekSunday(customFrom),
    };
  }

  if (customTo) {
    return {
      from: startOfWeekMonday(customTo),
      to: endOfWeekSunday(customTo),
    };
  }

  return getDefaultLedgerGraphRange();
}

export function formatLedgerGraphHeaderRange(from: Date, to: Date): string {
  return formatDateRangeChip(from, to);
}
