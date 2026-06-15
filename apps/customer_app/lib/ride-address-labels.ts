export function rideLabelsFromCheckoutMetadata(
  metadata?: Record<string, unknown> | null
): { pickupLabel?: string; dropLabel?: string } {
  if (!metadata || typeof metadata !== "object") return {};
  const pickupLabel =
    typeof metadata.pickupLabel === "string" ? metadata.pickupLabel.trim() : undefined;
  const dropLabel =
    typeof metadata.dropLabel === "string" ? metadata.dropLabel.trim() : undefined;
  return { pickupLabel, dropLabel };
}
