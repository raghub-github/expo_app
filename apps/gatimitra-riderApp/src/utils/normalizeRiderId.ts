/**
 * Normalize rider identity for API paths and onboarding partition keys.
 * Session may carry `riderId: "1015"` or only `userId: "usr_1015"`.
 * Status APIs require a numeric rider primary key.
 */
export function normalizeRiderId(id: string | null | undefined): string | null {
  const raw = String(id ?? "").trim();
  if (!raw) return null;
  const usr = /^usr_(\d+)$/i.exec(raw);
  if (usr?.[1]) return usr[1];
  if (/^\d+$/.test(raw)) return raw;
  return null;
}

/** Prefer explicit riderId, then derive from usr_* userId. */
export function riderIdFromSession(session: {
  riderId?: string | null;
  userId?: string | null;
} | null | undefined): string | null {
  if (!session) return null;
  return normalizeRiderId(session.riderId) ?? normalizeRiderId(session.userId);
}
