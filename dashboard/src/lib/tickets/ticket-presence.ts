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
export function computeTicketCopresenceLive(
  presenceState: Record<string, unknown[]>,
  selfRole: TicketPresenceRole
): boolean {
  const rolesPresent = new Set<TicketPresenceRole>();
  for (const metas of Object.values(presenceState)) {
    if (!Array.isArray(metas)) continue;
    for (const meta of metas) {
      if (meta == null || typeof meta !== "object") continue;
      const r = (meta as Record<string, unknown>).role;
      if (isTicketPresenceRole(r)) rolesPresent.add(r);
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
      const r = (meta as Record<string, unknown>).role;
      if (isTicketPresenceRole(r)) rolesPresent.add(r);
    }
  }
  return rolesPresent.size;
}
