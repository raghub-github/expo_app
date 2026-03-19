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

export async function fetchActivityFeed(
  storeId: number,
  token: string,
  options?: { limit?: number; section?: string; source?: string; actor_type?: string; action?: string }
): Promise<ActivityFeedItem[]> {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.section) params.set("section", options.section);
  if (options?.source) params.set("source", options.source);
  if (options?.actor_type) params.set("actor_type", options.actor_type);
  if (options?.action) params.set("action", options.action);
  const qs = params.toString();
  const url = `${getBase()}/v1/merchant-partner/stores/${storeId}/activity-feed${qs ? `?${qs}` : ""}`;
  const res = await authFetch(url, token);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || "Failed to load activity feed");
  }
  const data = await res.json();
  return (data as any).activities ?? [];
}
