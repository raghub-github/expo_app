/**
 * Resolve a human display name for analytics cards.
 * Never show role titles like Super Admin / Admin / Agent as the person's name.
 */

const ROLE_LIKE_NAME_RE =
  /^(super[\s_-]*admin|admin|agent|manager|area[\s_-]*manager|support|operator|user|system|guest|test[\s_-]*user|n\/?a|unknown|null|-)$/i;

export function isRoleLikeDisplayName(value: string | null | undefined): boolean {
  const v = String(value || "").trim();
  if (!v) return true;
  if (ROLE_LIKE_NAME_RE.test(v)) return true;
  // Exact enum-ish tokens: SUPER_ADMIN, AREA_MANAGER_MERCHANT, etc.
  if (/^[A-Z][A-Z0-9_]+$/.test(v) && /ADMIN|AGENT|MANAGER|SUPPORT|TEAM|ROLE/.test(v)) {
    return true;
  }
  return false;
}

export function resolveAnalyticsDisplayName(input: {
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  systemUserId?: string | null;
}): string {
  const first = String(input.firstName || "").trim();
  const last = String(input.lastName || "").trim();
  const composed = [first, last].filter(Boolean).join(" ").trim();
  if (composed && !isRoleLikeDisplayName(composed)) return composed;

  const full = String(input.fullName || "").trim();
  if (full && !isRoleLikeDisplayName(full)) return full;

  const email = String(input.email || "").trim();
  if (email.includes("@")) {
    const local = email.split("@")[0]?.trim();
    if (local) {
      // soft-format: bhim.pratap -> Bhim Pratap
      const pretty = local
        .replace(/[._+-]+/g, " ")
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
      if (pretty && !isRoleLikeDisplayName(pretty)) return pretty;
    }
  }

  const id = String(input.systemUserId || "").trim();
  if (id) return id;

  return "User";
}
