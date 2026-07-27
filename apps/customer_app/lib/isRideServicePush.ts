/**
 * Ride-service customer pushes (accept / nearby / arrived / drop / completed…).
 * Gates the CX notification chime — food/parcel/marketing stay silent.
 */
export function isRideServicePush(data: Record<string, unknown> | null | undefined): boolean {
  if (!data) return false;

  const live = String(data.liveService ?? "").trim().toLowerCase();
  if (live === "ride") return true;

  const code = String(data.gmType ?? data.template_code ?? data.templateCode ?? "")
    .trim()
    .toUpperCase();
  return code.startsWith("RIDE_");
}
