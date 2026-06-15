export function formatRiderSearchQuery(riderId: number): string {
  return `GMR${riderId}`;
}

export function buildRidersHomeUrl(riderId: number, search?: string | null): string {
  const query = (search?.trim() || formatRiderSearchQuery(riderId)).replace(/^GMR/i, "GMR");
  return `/dashboard/riders?search=${encodeURIComponent(query)}`;
}

export function buildRiderDetailUrl(riderId: number, returnTo: string): string {
  return `/dashboard/riders/${riderId}?returnTo=${encodeURIComponent(returnTo)}`;
}

export function resolveRiderDashboardReturnUrl(
  returnTo: string | null | undefined,
  riderId: number,
): string {
  if (returnTo) {
    try {
      const decoded = decodeURIComponent(returnTo);
      if (decoded.startsWith("/dashboard/riders")) return decoded;
    } catch {
      if (returnTo.startsWith("/dashboard/riders")) return returnTo;
    }
  }
  return buildRidersHomeUrl(riderId);
}
