import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";

const getBase = () => getConfig().apiBaseUrl;

export interface ActivityFeedItem {
  id: number;
  store_id: number;
  section: string;
  action: string;
  entity_id: number | null;
  entity_name: string | null;
  summary: string;
  diff: Record<string, unknown> | null;
  actor_type: string;
  actor_name: string | null;
  actor_email: string | null;
  source: string;
  created_at: string;
}

function normalizeCreatedAt(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    let raw = value.trim();
    // Postgres timestamptz: "2026-08-11 07:44:01.123456+00"
    if (/^\d{4}-\d{2}-\d{2} \d/.test(raw)) {
      raw = raw.replace(" ", "T");
    }
    const attempts = [raw, raw.includes("T") ? raw : raw.replace(" ", "T"), `${raw}Z`, `${raw.replace(" ", "T")}Z`];
    for (const candidate of attempts) {
      const d = new Date(candidate);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  }
  return "";
}

function normalizeActivityFeedItem(raw: Record<string, unknown>): ActivityFeedItem {
  return {
    id: Number(raw.id),
    store_id: Number(raw.store_id),
    section: String(raw.section ?? ""),
    action: String(raw.action ?? ""),
    entity_id: raw.entity_id != null ? Number(raw.entity_id) : null,
    entity_name: raw.entity_name != null ? String(raw.entity_name) : null,
    summary: String(raw.summary ?? ""),
    diff: (raw.diff as Record<string, unknown> | null) ?? null,
    actor_type: String(raw.actor_type ?? ""),
    actor_name: raw.actor_name != null ? String(raw.actor_name) : null,
    actor_email: raw.actor_email != null ? String(raw.actor_email) : null,
    source: String(raw.source ?? ""),
    created_at: normalizeCreatedAt(raw.created_at ?? raw.createdAt),
  };
}

export async function fetchActivityFeed(
  storeId: number,
  token: string,
  options?: {
    limit?: number;
    section?: string;
    source?: string;
    actor_type?: string;
    action?: string;
    since?: string;
  }
): Promise<ActivityFeedItem[]> {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.section) params.set("section", options.section);
  if (options?.source) params.set("source", options.source);
  if (options?.actor_type) params.set("actor_type", options.actor_type);
  if (options?.action) params.set("action", options.action);
  if (options?.since) params.set("since", options.since);
  const qs = params.toString();
  const url = `${getBase()}/v1/merchant-partner/stores/${storeId}/activity-feed${qs ? `?${qs}` : ""}`;
  const res = await authFetch(url, token);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to load activity feed");
  }
  const data = (await res.json()) as { activities?: unknown[] };
  const rows = Array.isArray(data.activities) ? data.activities : [];
  return rows.map((row) =>
    normalizeActivityFeedItem(row && typeof row === "object" ? (row as Record<string, unknown>) : {})
  );
}
