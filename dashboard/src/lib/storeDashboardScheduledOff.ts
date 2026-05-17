import { normalizeStoreActionSource, type StoreActionSource } from "@/lib/storeActionSource";

export type ScheduledTimeOffRow = {
  id: number;
  reason: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  phase: "active" | "upcoming";
  marked_from: StoreActionSource | null;
};

export type ActiveRushWindowRow = {
  is_active: boolean;
  duration_minutes: number | null;
  remaining_minutes: number;
  started_at: string | null;
  ends_at: string | null;
  marked_from: StoreActionSource | null;
};

export function parseScheduledTimeOffsFromApi(raw: unknown): ScheduledTimeOffRow[] {
  if (!Array.isArray(raw)) return [];
  const out: ScheduledTimeOffRow[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = Number(o.id);
    const starts_at = typeof o.starts_at === "string" ? o.starts_at : "";
    const ends_at = typeof o.ends_at === "string" ? o.ends_at : "";
    const status = typeof o.status === "string" ? o.status : "";
    const phaseRaw = o.phase;
    const phase = phaseRaw === "active" || phaseRaw === "upcoming" ? phaseRaw : null;
    const reason =
      typeof o.reason === "string" && o.reason.trim() !== "" ? o.reason.trim() : null;
    if (!Number.isFinite(id) || !starts_at || !ends_at || !phase) continue;
    out.push({
      id,
      reason,
      starts_at,
      ends_at,
      status,
      phase,
      marked_from: normalizeStoreActionSource(o.marked_from),
    });
  }
  return out;
}

export function parseActiveRushFromApi(raw: unknown): ActiveRushWindowRow | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.is_active !== true) return null;
  const remaining = Number(o.remaining_minutes);
  return {
    is_active: true,
    duration_minutes:
      typeof o.duration_minutes === "number" ? o.duration_minutes : null,
    remaining_minutes: Number.isFinite(remaining) ? remaining : 0,
    started_at: typeof o.started_at === "string" ? o.started_at : null,
    ends_at: typeof o.ends_at === "string" ? o.ends_at : null,
    marked_from: normalizeStoreActionSource(o.marked_from),
  };
}
