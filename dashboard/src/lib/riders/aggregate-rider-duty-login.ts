/**
 * Activity Logs duty metrics from duty_logs ON/OFF pairs.
 * - firstLoginAt: earliest duty ON (toggle online) that day
 * - lastLogoutAt: latest duty OFF/AUTO_OFF (toggle offline) that day
 * - totalLoginSeconds: sum of (OFF − ON) per session, clipped to range
 */

export type DutyLogRow = {
  status: string;
  serviceTypes: unknown;
  timestamp: Date | string;
};

export type DayServiceLoginAgg = {
  totalLoginSeconds: number;
  firstLoginAt: Date | null;
  lastLogoutAt: Date | null;
};

const VALID_SERVICES = ["food", "parcel", "person_ride"] as const;

export function normalizeDutyServices(serviceTypes: unknown): string[] {
  const services = Array.isArray(serviceTypes)
    ? (serviceTypes as string[])
        .map((s) => String(s).toLowerCase())
        .filter((s): s is (typeof VALID_SERVICES)[number] =>
          (VALID_SERVICES as readonly string[]).includes(s)
        )
    : [];
  return services.length ? [...services] : [...VALID_SERVICES];
}

function toDate(ts: Date | string): Date {
  return ts instanceof Date ? ts : new Date(ts);
}

/** Calendar day in Asia/Kolkata (matches rider operations). */
export function riderActivityDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

function dayKeyIndia(d: Date): string {
  return riderActivityDayKey(d);
}

function startOfIndiaDay(d: Date): Date {
  return new Date(`${dayKeyIndia(d)}T00:00:00+05:30`);
}

function endOfIndiaDay(d: Date): Date {
  return new Date(`${dayKeyIndia(d)}T23:59:59.999+05:30`);
}

export type DutySession = {
  onAt: Date;
  offAt: Date | null;
  services: string[];
};

/** Pair duty_logs into ON → OFF/AUTO_OFF sessions (open session ends at `now`). */
export function buildDutySessions(
  dutyRows: DutyLogRow[],
  priorOn: DutyLogRow | null | undefined
): DutySession[] {
  const sessions: DutySession[] = [];
  let pendingOn: { timestamp: Date; services: string[] } | null = null;

  if (priorOn?.status === "ON") {
    pendingOn = {
      timestamp: toDate(priorOn.timestamp),
      services: normalizeDutyServices(priorOn.serviceTypes),
    };
  }

  for (const row of dutyRows) {
    const ts = toDate(row.timestamp);
    if (row.status === "ON") {
      pendingOn = {
        timestamp: ts,
        services: normalizeDutyServices(row.serviceTypes),
      };
    } else if (
      (row.status === "OFF" || row.status === "AUTO_OFF") &&
      pendingOn
    ) {
      sessions.push({
        onAt: pendingOn.timestamp,
        offAt: ts,
        services: pendingOn.services,
      });
      pendingOn = null;
    }
  }

  if (pendingOn) {
    sessions.push({
      onAt: pendingOn.timestamp,
      offAt: null,
      services: pendingOn.services,
    });
  }

  return sessions;
}

export function aggregateDutyLoginByDayService(
  sessions: DutySession[],
  fromDate: Date,
  toDate: Date,
  now: Date = new Date()
): Record<string, Record<string, DayServiceLoginAgg>> {
  const dayLogin: Record<string, Record<string, DayServiceLoginAgg>> = {};

  const ensure = (day: string, svc: string): DayServiceLoginAgg => {
    if (!dayLogin[day]) dayLogin[day] = {};
    if (!dayLogin[day][svc]) {
      dayLogin[day][svc] = {
        totalLoginSeconds: 0,
        firstLoginAt: null,
        lastLogoutAt: null,
      };
    }
    return dayLogin[day][svc];
  };

  for (const session of sessions) {
    const sessionEnd = session.offAt ?? now;

    if (session.onAt >= fromDate && session.onAt <= toDate) {
      const onDay = dayKeyIndia(session.onAt);
      for (const svc of session.services) {
        const agg = ensure(onDay, svc);
        if (!agg.firstLoginAt || session.onAt < agg.firstLoginAt) {
          agg.firstLoginAt = session.onAt;
        }
      }
    }

    if (session.offAt && session.offAt >= fromDate && session.offAt <= toDate) {
      const offDay = dayKeyIndia(session.offAt);
      for (const svc of session.services) {
        const agg = ensure(offDay, svc);
        if (!agg.lastLogoutAt || session.offAt > agg.lastLogoutAt) {
          agg.lastLogoutAt = session.offAt;
        }
      }
    }

    let cursor = new Date(
      Math.max(
        session.onAt.getTime(),
        fromDate.getTime(),
        startOfIndiaDay(session.onAt).getTime()
      )
    );
    const effectiveEnd = new Date(
      Math.min(sessionEnd.getTime(), toDate.getTime())
    );
    if (cursor >= effectiveEnd) continue;

    while (cursor < effectiveEnd) {
      const dayEnd = endOfIndiaDay(cursor);
      const segmentEnd = new Date(
        Math.min(effectiveEnd.getTime(), dayEnd.getTime())
      );
      if (cursor < segmentEnd) {
        const sec = Math.max(
          0,
          Math.floor((segmentEnd.getTime() - cursor.getTime()) / 1000)
        );
        const day = dayKeyIndia(cursor);
        for (const svc of session.services) {
          ensure(day, svc).totalLoginSeconds += sec;
        }
      }
      const nextDay = new Date(dayEnd.getTime() + 1);
      if (nextDay <= cursor) break;
      cursor = nextDay;
    }
  }

  return dayLogin;
}
