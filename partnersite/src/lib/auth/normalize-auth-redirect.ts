/** Normalize post-login redirect paths (query param, sessionStorage, OAuth next). */
export function normalizeAuthRedirect(raw: string | null | undefined): string {
  const fallback = "/partners/all-stores";
  if (!raw?.trim()) return fallback;

  let next = raw.trim();
  let suffix = "";

  const qIdx = next.indexOf("?");
  const hIdx = next.indexOf("#");
  if (qIdx >= 0) {
    suffix = next.slice(qIdx);
    next = next.slice(0, qIdx);
  } else if (hIdx >= 0) {
    suffix = next.slice(hIdx);
    next = next.slice(0, hIdx);
  }

  if (next.startsWith("http")) {
    try {
      const u = new URL(next);
      next = u.pathname;
      suffix = u.search + u.hash;
    } catch {
      return fallback;
    }
  }

  if (next.startsWith("./")) next = `/${next.slice(2)}`;
  else if (next.startsWith(".")) next = `/${next.replace(/^\.+\/?/, "")}`;

  next = next.replace(/\/partners\/all_stores\b/g, "/partners/all-stores");

  if (!next.startsWith("/")) return fallback;
  if (next === "/auth" || next === "/auth/") return fallback;

  return next + suffix;
}
