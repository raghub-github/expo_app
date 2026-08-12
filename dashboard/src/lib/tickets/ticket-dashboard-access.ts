import { computeEffectiveAccessLevel } from "@/lib/permissions/access-level";

export type TicketAccessPointLike = {
  dashboardType?: string;
  accessPointGroup?: string;
  allowedActions?: string[] | null;
  isActive?: boolean;
};

const TICKET_DASHBOARD_TYPES = new Set([
  "TICKET",
  "TICKET_FOOD",
  "TICKET_PARCEL",
  "TICKET_PERSON_RIDE",
  "TICKET_GENERAL",
  "TICKET_CUSTOMER_FOOD",
  "TICKET_CUSTOMER_PARCEL",
  "TICKET_CUSTOMER_PERSON_RIDE",
]);

function activeTicketPoints(accessPoints: TicketAccessPointLike[] | null | undefined) {
  return (accessPoints ?? []).filter((ap) => {
    if (ap.isActive === false) return false;
    const dt = String(ap.dashboardType || "").toUpperCase();
    return TICKET_DASHBOARD_TYPES.has(dt) || dt.startsWith("TICKET");
  });
}

export function getTicketAccessGroups(
  accessPoints?: TicketAccessPointLike[] | null
): string[] {
  return [
    ...new Set(
      activeTicketPoints(accessPoints).map((ap) => String(ap.accessPointGroup).toUpperCase())
    ),
  ];
}

/** True when user can only view tickets (no TICKET_ACTIONS_*). */
export function isTicketViewOnlyAccess(args: {
  isSuperAdmin?: boolean;
  accessPoints?: TicketAccessPointLike[] | null;
}): boolean {
  if (args.isSuperAdmin) return false;
  const groups = getTicketAccessGroups(args.accessPoints);
  if (groups.length === 0) return true;
  return computeEffectiveAccessLevel("TICKET", groups) === "VIEW_ONLY";
}

export function ticketCanMutate(args: {
  isSuperAdmin?: boolean;
  accessPoints?: TicketAccessPointLike[] | null;
}): boolean {
  if (args.isSuperAdmin) return true;
  const groups = getTicketAccessGroups(args.accessPoints);
  return groups.some((g) => g.startsWith("TICKET_ACTIONS_"));
}
