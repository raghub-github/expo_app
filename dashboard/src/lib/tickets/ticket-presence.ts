/** Roles that participate in ticket-room copresence (dashboard = agent). */
export type TicketPresenceRole = "agent" | "merchant" | "rider";

export type TicketPresencePayload = {
  user_id: string;
  role: TicketPresenceRole;
  name?: string;
};

const ROLES: TicketPresenceRole[] = ["agent", "merchant", "rider"];

function isTicketPresenceRole(v: unknown): v is TicketPresenceRole {
  return typeof v === "string" && (ROLES as string[]).includes(v);
}

/**
 * True when this viewer's role is represented in the room and at least one other role is present.
 * Presence keys dedupe tabs; each value entry may include multiple metas per key in edge cases.
 */
function roleFromPresenceMeta(meta: object): TicketPresenceRole | null {
  const rec = meta as Record<string, unknown>;
  const candidates = [rec.role, rec.user_role, (rec.payload as Record<string, unknown> | undefined)?.role];
  for (const c of candidates) {
    if (isTicketPresenceRole(c)) return c;
  }
  return null;
}

export function computeTicketCopresenceLive(
  presenceState: Record<string, unknown[]>,
  selfRole: TicketPresenceRole
): boolean {
  const rolesPresent = new Set<TicketPresenceRole>();
  for (const metas of Object.values(presenceState)) {
    if (!Array.isArray(metas)) continue;
    for (const meta of metas) {
      if (meta == null || typeof meta !== "object") continue;
      const r = roleFromPresenceMeta(meta);
      if (r) rolesPresent.add(r);
    }
  }
  if (!rolesPresent.has(selfRole)) return false;
  for (const r of rolesPresent) {
    if (r !== selfRole) return true;
  }
  return false;
}

export function countDistinctTicketPresenceRoles(presenceState: Record<string, unknown[]>): number {
  const rolesPresent = new Set<TicketPresenceRole>();
  for (const metas of Object.values(presenceState)) {
    if (!Array.isArray(metas)) continue;
    for (const meta of metas) {
      if (meta == null || typeof meta !== "object") continue;
      const r = roleFromPresenceMeta(meta);
      if (r) rolesPresent.add(r);
    }
  }
  return rolesPresent.size;
}

export type TicketOtherAgentViewer = {
  userId: string;
  displayName: string;
};

function userIdFromPresenceMeta(meta: object): string | null {
  const rec = meta as Record<string, unknown>;
  const top = [rec.user_id, rec.userId, rec.sub].find((v) => typeof v === "string" && v.trim());
  if (top) return (top as string).trim();
  const nested = rec.payload;
  if (nested != null && typeof nested === "object") {
    const p = nested as Record<string, unknown>;
    const inner = [p.user_id, p.userId, p.sub].find((v) => typeof v === "string" && v.trim());
    if (inner) return (inner as string).trim();
  }
  return null;
}

function displayNameFromPresenceMeta(meta: object): string {
  const rec = meta as Record<string, unknown>;
  const top = [rec.name, rec.displayName, rec.full_name].find((v) => typeof v === "string" && v.trim());
  if (top) return (top as string).trim();
  const nested = rec.payload;
  if (nested != null && typeof nested === "object") {
    const p = nested as Record<string, unknown>;
    const inner = [p.name, p.displayName, p.full_name].find((v) => typeof v === "string" && v.trim());
    if (inner) return (inner as string).trim();
  }
  return "";
}

/**
 * Other dashboard agents (role agent) in the ticket presence room, excluding the current user.
 * Merchants, riders, and any non-agent roles are ignored.
 */
export function listOtherTicketAgentViewers(
  presenceState: Record<string, unknown[]>,
  selfUserId: string
): TicketOtherAgentViewer[] {
  const self = selfUserId.trim();
  if (!self) return [];

  const byId = new Map<string, string>();

  for (const [presenceKey, metas] of Object.entries(presenceState)) {
    if (!Array.isArray(metas)) continue;
    const keyTrim = presenceKey.trim();
    for (const meta of metas) {
      if (meta == null || typeof meta !== "object") continue;
      if (roleFromPresenceMeta(meta) !== "agent") continue;
      // Phoenix key is our presence key (Supabase auth user id); use it if payload omits user_id.
      const uid = userIdFromPresenceMeta(meta) ?? (keyTrim || null);
      if (!uid || uid === self) continue;
      const name = displayNameFromPresenceMeta(meta);
      const label = name || "Agent";
      const prev = byId.get(uid);
      if (prev === undefined) byId.set(uid, label);
      else if (prev === "Agent" && name) byId.set(uid, label);
    }
  }

  const out = Array.from(byId.entries()).map(([userId, displayName]) => ({
    userId,
    displayName,
  }));
  out.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }));
  return out;
}
