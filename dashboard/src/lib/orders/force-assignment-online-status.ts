/**
 * Force Assignment picker status — same duty rule as Core fleet (WAITING / ONLINE),
 * not Geo Rx dispatch eligibility.
 *
 * Geo Availability marks duty-ON + GPS older than the freshness window as STALE.
 * The picker used to collapse that unknown status to OFFLINE, so on-duty riders
 * (correctly WAITING in Core) all showed Offline in the sheet.
 */
export type ForceAssignmentOnlineStatus = "ONLINE" | "BUSY" | "OFFLINE";

export function mapForceAssignmentOnlineStatus(
  geoStatus: string | null | undefined,
  occupied: boolean
): ForceAssignmentOnlineStatus {
  const status = String(geoStatus ?? "OFFLINE").trim().toUpperCase();
  if (status === "BUSY") return "BUSY";
  if (status === "ONLINE") return "ONLINE";
  // Duty ON, GPS stale — still on duty, same as Core WAITING / ON THE WAY.
  if (status === "STALE") return occupied ? "BUSY" : "ONLINE";
  return "OFFLINE";
}

export function isForceAssignmentOnDuty(status: string | null | undefined): boolean {
  const u = String(status ?? "").trim().toUpperCase();
  return u === "ONLINE" || u === "BUSY" || u === "STALE";
}
