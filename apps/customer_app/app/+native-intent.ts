/**
 * Native deep-link URL rewriter (Expo Router).
 *
 * Incoming links do NOT match our route tree 1:1, so we normalise them here
 * before Expo Router resolves a screen. Without this, a verified Android App
 * Link like `https://gatimitra.com/addr/<shortCode>?id=<token>` opens the app
 * but lands on the "unmatched route" screen, because the only address screen
 * is `app/address/save.tsx` (path `/address/save`).
 *
 * Supported inputs (all funnel to the Address Save bottom sheet):
 *   https://gatimitra.com/addr/<shortCode>?id=<token>   (verified App Link)
 *   gatimitra://address/save?id=<token>                  (custom scheme)
 *   gatimitra://addr/<shortCode>?id=<token>              (custom scheme, short form)
 *
 * Anything else is passed through untouched.
 *
 * See: https://docs.expo.dev/router/advanced/native-intent/
 */

/** Pull the share token out of an /addr/<shortCode>?id=<token> style URL. */
function extractShareToken(path: string): string | null {
  // `path` may be a full URL (https://…/addr/x?id=y) or a bare path (/addr/x?id=y).
  let query = "";
  const qIndex = path.indexOf("?");
  if (qIndex >= 0) query = path.slice(qIndex + 1);

  const params = new URLSearchParams(query);
  const id = params.get("id");
  return id && id.trim() ? id.trim() : null;
}

/** True when the path targets the shared-address flow (`/addr/...`). */
function isAddrPath(path: string): boolean {
  // Match `/addr/`, `addr/`, or host-embedded `.../addr/...` (custom scheme puts
  // "addr" in the host slot: gatimitra://addr/<code> → host="addr").
  return /(^|\/\/|\/)addr(\/|\?|$)/.test(path);
}

function isReferralPath(path: string): boolean {
  return /(^|\/\/|\/)(ref|invite)(\/|\?|$)/.test(path) || /referral(\?|$)/.test(path);
}

function extractReferralCode(path: string): { code: string; click?: string } | null {
  try {
    const normalized = path.includes("://")
      ? path.replace(/^gatimitra:\/\//, "https://gatimitra.local/")
      : `https://gatimitra.local${path.startsWith("/") ? path : `/${path}`}`;
    const u = new URL(normalized);
    const click = u.searchParams.get("click") || undefined;
    const fromQuery = u.searchParams.get("code") || u.searchParams.get("ref");
    const m = u.pathname.match(/\/(?:ref|invite)\/([A-Za-z0-9_-]+)/i);
    const code = (fromQuery || m?.[1] || "").trim().toUpperCase();
    if (!code) return null;
    return { code, click };
  } catch {
    return null;
  }
}

export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    if (isAddrPath(path)) {
      const token = extractShareToken(path);
      if (token) {
        return `/address/save?id=${encodeURIComponent(token)}`;
      }
      // No token → still route to the save screen so it can show "Invalid link"
      // rather than the unmatched-route screen.
      return `/address/save`;
    }
    if (isReferralPath(path)) {
      const parsed = extractReferralCode(path);
      if (parsed?.code) {
        const q = new URLSearchParams();
        q.set("code", parsed.code);
        if (parsed.click) q.set("click", parsed.click);
        return `/profile/referrals?${q.toString()}&autoApply=1`;
      }
    }
  } catch {
    // Never let a malformed deep link crash cold-start routing.
    void initial;
  }
  return path;
}
