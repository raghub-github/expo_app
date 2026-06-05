export type ServiceLimitForm = {
  service_type: "food" | "parcel" | "person_ride";
  max_active_assignments: number;
  exclusive_mode: boolean;
};

export type GlobalAssignmentForm = {
  allow_cross_service_assignments: boolean;
  person_ride_exclusive_mode: boolean;
};

const LABELS: Record<string, string> = {
  food: "Food delivery",
  parcel: "Parcel delivery",
  person_ride: "Person ride",
};

/** Mirrors backend buildAssignmentRuleSummary for live Admin preview. */
export function buildServiceAssignmentRuleSummary(
  limits: ServiceLimitForm[],
  global: GlobalAssignmentForm
): string[] {
  const byType = Object.fromEntries(limits.map((l) => [l.service_type, l])) as Record<
    string,
    ServiceLimitForm
  >;

  const food = byType.food?.max_active_assignments ?? 0;
  const parcel = byType.parcel?.max_active_assignments ?? 0;
  const ride = byType.person_ride?.max_active_assignments ?? 0;

  const lines: string[] = [
    `${LABELS.food}: up to ${food} active order(s).`,
    `${LABELS.parcel}: up to ${parcel} active order(s).`,
    `${LABELS.person_ride}: up to ${ride} active ride(s).`,
  ];

  if (global.person_ride_exclusive_mode) {
    lines.push(
      "Person ride exclusive: an active ride blocks Food, Parcel, and extra rides; active Food/Parcel block new person rides."
    );
  }

  if (global.allow_cross_service_assignments) {
    lines.push("Cross-service ON: each service limit applies independently.");
  } else {
    lines.push(
      "Cross-service OFF: only the same service can stack until that service limit is reached (no Food + Parcel + Ride mix)."
    );
  }

  return lines;
}
