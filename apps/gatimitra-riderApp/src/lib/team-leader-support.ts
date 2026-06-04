/** Support contact constants — wire to env when available. */
export const TEAM_LEADER_SUPPORT_PHONE = "18001234567";
export const TEAM_LEADER_SUPPORT_PHONE_DISPLAY = "1800-123-4567";
export const TEAM_LEADER_WHATSAPP_PHONE = "919876543210";

const SUPPORT_OPEN_HOUR = 8;
const SUPPORT_CLOSE_HOUR = 22;

export function isWithinSupportHours(now = new Date()): boolean {
  try {
    const parts = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      hour12: false,
    }).formatToParts(now);
    const hourPart = parts.find((p) => p.type === "hour");
    const hour = hourPart ? Number(hourPart.value) : now.getHours();
    return hour >= SUPPORT_OPEN_HOUR && hour < SUPPORT_CLOSE_HOUR;
  } catch {
    return true;
  }
}

export function buildTeamLeaderWhatsAppMessage(params: {
  riderName: string | null | undefined;
  riderId: string | null | undefined;
}): string {
  const name = (params.riderName ?? "").trim() || "Rider";
  const id = (params.riderId ?? "").trim() || "—";
  return [
    "Hi, I am a GatiMitra rider and need help from my team leader.",
    "",
    `Rider name: ${name}`,
    `Rider ID: ${id}`,
  ].join("\n");
}

export function resolveRiderIdentityForSupport(
  profile: {
    name?: string | null;
    riderDisplayId?: string | null;
    riderId?: string | null;
  } | null | undefined,
  sessionRiderId?: string | null,
): { name: string; riderId: string } {
  const name = (profile?.name ?? "").trim() || "GatiMitra Rider";
  const riderId =
    (profile?.riderDisplayId ?? "").trim() ||
    (profile?.riderId ?? "").trim() ||
    (sessionRiderId ?? "").trim() ||
    "—";
  return { name, riderId };
}
