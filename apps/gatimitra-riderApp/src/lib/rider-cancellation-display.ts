export type RiderCancellationActor = "customer" | "rider" | "admin" | "system" | null;

export function normalizeRiderCancellationActor(
  raw: string | null | undefined
): RiderCancellationActor {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (t === "customer") return "customer";
  if (t === "rider") return "rider";
  if (t === "admin") return "admin";
  if (t === "system") return "system";
  return null;
}

/** Rider-facing cancellation headline for the full-screen ack sheet. */
export function riderCancellationTitle(actor: RiderCancellationActor): string {
  switch (actor) {
    case "customer":
      return "Cancelled by User";
    case "rider":
      return "Cancelled by You";
    case "admin":
    case "system":
      return "Cancelled by Gatimitra Team";
    default:
      return "Cancelled by Gatimitra Team";
  }
}
