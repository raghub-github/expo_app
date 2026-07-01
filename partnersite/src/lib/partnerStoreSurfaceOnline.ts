/**
 * Partner UI “accepting / live” indicator: operational OPEN **and** inside an active slot
 * (`within_operating_hours`, false during mid-day break and outside configured hours).
 * Matches store-operations GET semantics.
 */
export function partnerSurfaceOnlineFromStoreOperationsBody(
  data: Record<string, unknown>
): boolean | null {
  if (typeof data.surface_online === 'boolean') return data.surface_online;
  if (typeof data.is_open === 'boolean') return data.is_open;
  const opRaw = data.operational_status;
  if (typeof opRaw !== 'string') return null;
  const opOpen = opRaw.trim().toUpperCase() === 'OPEN';
  const wh = data.within_operating_hours;
  if (typeof wh === 'boolean') {
    return opOpen && wh;
  }
  return opOpen;
}
