/**
 * Request a small, display-sized WebP derivative from the backend image proxy.
 *
 * Store/menu images are served through `/v1/attachments/proxy?key=...`, which now
 * generates and caches a resized WebP when given `w`/`q`/`f` params (see
 * backend/src/routes/attachments.routes.ts). Cards should ask for the width they
 * actually paint — a 96pt thumbnail fetches ~10 KB instead of a 1–4 MB original.
 *
 * SINGLE SWAP POINT: to move resizing to a CDN edge (e.g. Cloudflare
 * `/cdn-cgi/image/...`) later, change only `sizedImageUrl` — call sites stay put.
 *
 * Widths are given in layout POINTS; we multiply by device pixel ratio (capped)
 * and snap to the backend's width ladder so the derivative cache can't explode.
 */
import { PixelRatio } from "react-native";

// Mirror of the backend WIDTH_LADDER (attachments.routes.ts). Requests snap up.
const WIDTH_LADDER = [64, 96, 128, 160, 200, 240, 320, 400, 480, 640, 800, 1080];
const MAX_DPR = 2; // 2× is plenty for photos; avoids fetching 3× on flagship phones

function snapWidth(px: number): number {
  const n = Math.round(px);
  for (const w of WIDTH_LADDER) if (n <= w) return w;
  return WIDTH_LADDER[WIDTH_LADDER.length - 1];
}

/** True when this URL is a resizable backend attachments-proxy URL. */
function isResizableProxyUrl(u: string): boolean {
  return u.includes("/attachments/proxy") && /[?&]key=/.test(u);
}

/**
 * @param url   Absolute (or relative) image URL already resolved for display.
 * @param wPts  Target width in layout points (the slot width, not pixels).
 * @param opts  Optional quality (60|72|82) and format (webp default).
 */
export function sizedImageUrl(
  url: string | null | undefined,
  wPts: number,
  opts?: { q?: 60 | 72 | 82; format?: "webp" | "jpeg" }
): string | null {
  if (!url) return null;
  const u = url.trim();
  if (!u) return null;
  // Only our proxy URLs can be resized. Leave signed/absolute/data URLs untouched.
  if (!isResizableProxyUrl(u)) return u;

  const dpr = Math.min(PixelRatio.get() || 1, MAX_DPR);
  const width = snapWidth(wPts * dpr);

  try {
    const isAbsolute = /^https?:\/\//i.test(u);
    const parsed = new URL(isAbsolute ? u : `https://local.invalid${u.startsWith("/") ? "" : "/"}${u}`);
    parsed.searchParams.set("w", String(width));
    if (opts?.q) parsed.searchParams.set("q", String(opts.q));
    parsed.searchParams.set("f", opts?.format ?? "webp");
    return isAbsolute ? parsed.toString() : `${parsed.pathname}${parsed.search}`;
  } catch {
    return u;
  }
}
