/**
 * Cross-path push presentation dedupe (FCM / local schedule / resume).
 *
 * Memory-only by default; host apps may hydrate from OS tray / SecureStore.
 * Never gates backend FCM send — client display/schedule only.
 */

const presentedAt = new Map<string, number>();
const MAX_KEYS = 400;
const TTL_MS = 24 * 60 * 60 * 1000;

function prune(now: number): void {
  for (const [k, at] of presentedAt) {
    if (now - at > TTL_MS) presentedAt.delete(k);
  }
  while (presentedAt.size > MAX_KEYS) {
    const first = presentedAt.keys().next().value;
    if (first == null) break;
    presentedAt.delete(first);
  }
}

/** True if this key was already claimed/presented within TTL. */
export function wasPushPresented(key: string): boolean {
  const k = String(key ?? "").trim();
  if (!k) return false;
  const now = Date.now();
  prune(now);
  const at = presentedAt.get(k);
  return at != null && now - at < TTL_MS;
}

/** Mark presented without claiming (e.g. FCM already shown in OS tray). */
export function rememberPushPresented(key: string): void {
  const k = String(key ?? "").trim();
  if (!k) return;
  const now = Date.now();
  prune(now);
  presentedAt.set(k, now);
}

/**
 * Claim exclusive presentation. Returns false if already presented —
 * caller must NOT schedule a second OS notification.
 */
export function claimPushPresented(key: string): boolean {
  if (wasPushPresented(key)) return false;
  rememberPushPresented(key);
  return true;
}

export function pushPresentationKey(parts: {
  notificationId?: string | null;
  templateCode?: string | null;
  orderId?: string | null;
  assignmentId?: string | null;
  event?: string | null;
}): string {
  const nid = String(parts.notificationId ?? "").trim();
  if (nid) return `nid:${nid}`;
  const orderId = String(parts.orderId ?? "").trim();
  const template = String(parts.templateCode ?? parts.event ?? "")
    .trim()
    .toUpperCase();
  const assignmentId = String(parts.assignmentId ?? "").trim();
  if (orderId && assignmentId && template) {
    return `evt:${template}:${orderId}:${assignmentId}`;
  }
  if (orderId && template) return `evt:${template}:${orderId}`;
  if (orderId) return `order:${orderId}`;
  return `t:${template || "unknown"}`;
}
