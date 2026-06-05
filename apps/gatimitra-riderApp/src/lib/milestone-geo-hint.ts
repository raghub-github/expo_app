import type { MilestoneGeoState } from "@/src/hooks/useMilestoneGeoFence";

const LOCATION_LABELS: Record<string, string> = {
  reach_store: "restaurant",
  mark_picked_up: "restaurant",
  reach_customer: "customer location",
  mark_delivered: "customer location",
  reach_pickup: "pickup location",
  pickup_confirmation: "pickup location",
  reach_drop: "drop location",
  delivery_confirmation: "drop location",
  start_ride: "pickup location",
  reach_destination: "destination",
  complete_ride: "destination",
};

export function formatMilestoneGeoHint(
  radiusMeters: number,
  milestoneKey?: string
): string {
  const label =
    (milestoneKey && LOCATION_LABELS[milestoneKey]) || "target location";
  return `Move within ${radiusMeters} meters of the ${label} to continue.`;
}

/** Same rules as food navigation: lock only when API returned a radius and rider is outside it. */
export function resolveMilestoneGeoUi(
  geo?: MilestoneGeoState,
  milestoneKey?: string
): { locked: boolean; hintText: string | null } {
  if (!geo || geo.radiusMeters <= 0) {
    return { locked: false, hintText: null };
  }

  const locked = !geo.withinRadius;
  const hintText = locked
    ? geo.blockedMessage ?? formatMilestoneGeoHint(geo.radiusMeters, milestoneKey)
    : null;

  return { locked, hintText };
}

/** Person ride pickup: enforce every configured radius (e.g. reach_pickup + pickup_confirmation). */
export function mergeMilestoneGeoLocks(
  ...states: Array<{ locked: boolean; hintText: string | null }>
): { locked: boolean; hintText: string | null } {
  const lockedWithHint = states.find((s) => s.locked && s.hintText);
  if (lockedWithHint) return lockedWithHint;
  const locked = states.find((s) => s.locked);
  if (locked) return { locked: true, hintText: locked.hintText };
  return { locked: false, hintText: null };
}
