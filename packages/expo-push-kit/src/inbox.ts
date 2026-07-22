/**
 * In-app notification inbox client for the three mobile apps.
 *
 * Talks to the backend at /v1/notifications/{inbox,:id/click,:id/read,read-all,preferences}.
 * Auth is the app's normal Bearer token (customer/merchant/rider JWT).
 *
 * Pure TS — no React dependency. The UI screen imports this and renders.
 */

export type InboxItem = {
  notification_id: string;
  template_code: string | null;
  title: string | null;
  body: string | null;
  image_url: string | null;
  deep_link: string | null;
  priority: string;
  status: string;
  queued_at: string;
  delivered_at: string | null;
  clicked_at: string | null;
  metadata: Record<string, unknown> | null;
};

export type InboxPage = { items: InboxItem[]; unread: number };

export type NotificationPreference = {
  type: string;
  push: boolean;
  in_app: boolean;
  browser: boolean;
  email: boolean;
};

export type NotificationApiConfig = {
  baseUrl: string;
  getAuthHeader: () => Promise<string | null>;
};

async function authedFetch<T>(cfg: NotificationApiConfig, path: string, init: RequestInit = {}): Promise<T> {
  const bearer = await cfg.getAuthHeader();
  const res = await fetch(cfg.baseUrl.replace(/\/$/, "") + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(bearer ? { Authorization: bearer.startsWith("Bearer ") ? bearer : `Bearer ${bearer}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`notification api ${path} → ${res.status}`);
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function loadInbox(cfg: NotificationApiConfig, opts: { limit?: number; offset?: number } = {}): Promise<InboxPage> {
  const qs = new URLSearchParams();
  if (opts.limit) qs.set("limit", String(opts.limit));
  if (opts.offset) qs.set("offset", String(opts.offset));
  return authedFetch<InboxPage>(cfg, `/v1/notifications/inbox?${qs.toString()}`);
}

export async function markClickedRemote(cfg: NotificationApiConfig, notificationId: string): Promise<void> {
  await authedFetch<void>(cfg, `/v1/notifications/${notificationId}/click`, { method: "POST" });
}

export async function markReadRemote(cfg: NotificationApiConfig, notificationId: string): Promise<void> {
  await authedFetch<void>(cfg, `/v1/notifications/${notificationId}/read`, { method: "POST" });
}

export async function markAllReadRemote(cfg: NotificationApiConfig): Promise<void> {
  await authedFetch<void>(cfg, `/v1/notifications/read-all`, { method: "POST" });
}

export async function loadPreferences(cfg: NotificationApiConfig): Promise<{ items: NotificationPreference[] }> {
  return authedFetch<{ items: NotificationPreference[] }>(cfg, `/v1/notifications/preferences`);
}

export async function setPreference(
  cfg: NotificationApiConfig,
  type: string,
  patch: Partial<Pick<NotificationPreference, "push" | "in_app" | "browser" | "email">>,
): Promise<void> {
  await authedFetch<void>(cfg, `/v1/notifications/preferences/${encodeURIComponent(type)}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}
