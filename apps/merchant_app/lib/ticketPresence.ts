/** Mirrors dashboard ticket-presence rules (kept local so the app stays self-contained). */

export type TicketPresenceRole = "agent" | "merchant" | "rider";

const ROLES: TicketPresenceRole[] = ["agent", "merchant", "rider"];

function isTicketPresenceRole(v: unknown): v is TicketPresenceRole {
  return typeof v === "string" && (ROLES as string[]).includes(v);
}

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
