/**
 * Notification target user lookup helpers.
 * Digits-only input maps to canonical public ids (e.g. `100001` → `GM100001`).
 */
export function expandNotificationUserIdCandidates(raw: string): {
  exactIds: string[];
  riderPk: number | null;
  riderExplicit: boolean;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { exactIds: [], riderPk: null, riderExplicit: false };

  const compact = trimmed.toUpperCase().replace(/\s+/g, "");

  const usrMatch = trimmed.match(/^usr_(\d+)$/i);
  const gmrMatch = compact.match(/^GMR(\d+)$/);
  if (usrMatch || gmrMatch) {
    const pk = Number(usrMatch?.[1] ?? gmrMatch?.[1]);
    if (Number.isFinite(pk) && pk > 0) {
      return {
        exactIds: [usrMatch ? trimmed : `usr_${pk}`],
        riderPk: pk,
        riderExplicit: true,
      };
    }
  }

  const exactIds: string[] = [trimmed];

  if (/^\d+$/.test(compact)) {
    exactIds.push(`GM${compact}`, `GMMP${compact}`);
    return {
      exactIds: [...new Set(exactIds)],
      riderPk: Number(compact),
      riderExplicit: false,
    };
  }

  if (/^GM\d+$/i.test(compact)) exactIds.push(compact);
  if (/^GMMP\d+$/i.test(compact)) exactIds.push(compact);
  if (/^GMR\d+$/i.test(compact)) {
    exactIds.push(compact);
    const pk = Number(compact.replace(/^GMR/i, ""));
    if (Number.isFinite(pk) && pk > 0) {
      return {
        exactIds: [...new Set(exactIds)],
        riderPk: pk,
        riderExplicit: true,
      };
    }
  }

  return { exactIds: [...new Set(exactIds)], riderPk: null, riderExplicit: false };
}
