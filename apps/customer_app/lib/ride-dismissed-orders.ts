/** Client-side guard: hide ride tracker after local timeout/cancel until API list catches up. */
const dismissedRideOrderIds = new Set<string>();

function normalizeRideOrderRef(orderId: string): string {
  return orderId.trim();
}

export function rememberDismissedRideOrder(orderId: string): void {
  const id = normalizeRideOrderRef(orderId);
  if (id) dismissedRideOrderIds.add(id);
}

export function isDismissedRideOrder(orderId: string | null | undefined): boolean {
  const id = normalizeRideOrderRef(String(orderId ?? ""));
  if (!id) return false;
  return dismissedRideOrderIds.has(id);
}
