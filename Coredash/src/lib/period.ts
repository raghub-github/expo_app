export const PERIODS = ["today", "7d", "30d", "90d"] as const;
export type Period = (typeof PERIODS)[number];

export function isPeriod(value: string | null | undefined): value is Period {
  return PERIODS.includes(value as Period);
}

export function parsePeriod(value: string | null | undefined): Period {
  return isPeriod(value) ? value : "7d";
}

export function periodBounds(
  period: Period,
  now = new Date()
): { from: string; to: string; previousFrom: string } {
  const to = now;
  const from = new Date(now);
  if (period === "today") {
    const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    ist.setHours(0, 0, 0, 0);
    const offset =
      now.getTime() - new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).getTime();
    const start = new Date(ist.getTime() + offset);
    const prev = new Date(start.getTime() - 24 * 60 * 60 * 1000);
    return {
      from: start.toISOString(),
      to: to.toISOString(),
      previousFrom: prev.toISOString(),
    };
  }
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  from.setTime(now.getTime() - days * 24 * 60 * 60 * 1000);
  const previousFrom = new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    previousFrom: previousFrom.toISOString(),
  };
}

export function periodLabel(period: Period): string {
  switch (period) {
    case "today":
      return "Today";
    case "7d":
      return "Last 7 days";
    case "30d":
      return "Last 30 days";
    case "90d":
      return "Last 90 days";
  }
}
