import { useQuery } from "@tanstack/react-query";
import { useSessionStore } from "@/src/stores/sessionStore";
import { getRiderAppConfig } from "@/src/config/env";
import { getJson } from "@/src/services/http";

const API_BASE = () => getRiderAppConfig().apiBaseUrl;

export type IncentiveCategory = "incentive" | "surge" | "peak";

export type IncentiveTier = {
  tierNo: number;
  minOrders: number;
  rewardAmount: number;
  unlocked: boolean;
  isCurrent: boolean;
};

export type IncentiveTimeWindow = {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  durationLabel: string;
  completed: boolean;
};

export type RiderIncentiveProgram = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: IncentiveCategory;
  service: string;
  recurrenceType: string;
  isLive: boolean;
  isSpecialDay: boolean;
  riderStatus: string;
  lockedReason: string | null;
  requiresGmitraMax: boolean;
  cycleLabel: string;
  cycleStartAt: string;
  cycleEndAt: string;
  maxReward: number;
  completedOrders: number;
  projectedReward: number | null;
  tiers: IncentiveTier[];
  timeWindows: IncentiveTimeWindow[];
  mandatoryLoginSlots: number;
  mandatoryLoginCompleted: number;
  minLoginDays: number | null;
};

export type IncentiveFilterChip = {
  key: string;
  label: string;
  count: number;
};

export type RiderIncentivesResponse = {
  success: boolean;
  date: string;
  dateBadges?: Record<string, string>;
  filters: IncentiveFilterChip[];
  programs: RiderIncentiveProgram[];
};

function authHeaders(token: string) {
  return { authorization: `Bearer ${token}` };
}

export function useRiderIncentives(date: string, filter: string = "all") {
  const session = useSessionStore((s) => s.session);

  return useQuery({
    queryKey: ["rider", "incentives", date, filter],
    queryFn: async () => {
      const params = new URLSearchParams({ date, filter });
      const json = await getJson<RiderIncentivesResponse>(
        `${API_BASE()}/v1/rider/incentives?${params.toString()}`,
        { headers: authHeaders(session!.accessToken) }
      );
      return {
        date: json.date,
        dateBadges: json.dateBadges ?? {},
        filters: json.filters ?? [],
        programs: json.programs ?? [],
      };
    },
    enabled: Boolean(session?.accessToken),
    staleTime: 30_000,
    retry: 2,
  });
}

export function buildCurrentWeekDates(anchorDateStr?: string): string[] {
  const anchor = anchorDateStr ?? todayIst();
  const d = new Date(`${anchor}T12:00:00+05:30`);
  const weekStartOffset = d.getUTCDay();
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(d);
    day.setUTCDate(d.getUTCDate() - weekStartOffset + i);
    dates.push(day.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
  }
  return dates;
}

/** @deprecated use buildCurrentWeekDates */
export function buildDateStrip(centerDate: string, radius = 3): string[] {
  return buildCurrentWeekDates(centerDate);
}

export function formatStripDay(dateStr: string, todayStr: string): { dow: string; day: string; isToday: boolean } {
  const d = new Date(`${dateStr}T12:00:00+05:30`);
  const dow = d.toLocaleDateString("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" });
  const day = d.toLocaleDateString("en-IN", { day: "numeric", timeZone: "Asia/Kolkata" });
  return { dow, day, isToday: dateStr === todayStr };
}

export function todayIst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
