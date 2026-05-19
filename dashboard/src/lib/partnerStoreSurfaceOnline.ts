/**
 * Partner UI “accepting / live” indicator: operational OPEN **and** inside an active slot
 * (`within_operating_hours`, false during mid-day break and outside configured hours).
 * Matches store-operations GET semantics (Partner Site).
 */
export function partnerSurfaceOnlineFromStoreOperationsBody(
  data: Record<string, unknown>
): boolean | null {
  const opRaw = data.operational_status;
  if (typeof opRaw !== "string") return null;
  const opOpen = opRaw.trim().toUpperCase() === "OPEN";
  const wh = data.within_operating_hours;
  if (typeof wh === "boolean") {
    return opOpen && wh;
  }
  return opOpen;
}
