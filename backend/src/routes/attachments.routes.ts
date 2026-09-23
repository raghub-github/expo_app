/**
 * GET /attachments/proxy?key=<r2_key>[&w=<width>][&q=<quality>][&f=webp|jpeg]
 *
 * Without resize params: 302 → short-lived signed R2 URL of the original object
 * (memory-safe: Node never buffers the body).
 *
 * With resize params: serve a small, cache-forever WebP/JPEG DERIVATIVE at the
 * requested display width. Derivatives are generated once with sharp and written
 * back to R2 under a deterministic `_derivatives/...` key (cache-aside), so every
 * later request is an O(1) HEAD + redirect. This is what makes list/store cards
 * paint instantly and keeps bandwidth/R2-egress flat as the store count grows —
 * a 96px card fetches an ~8–20 KB WebP instead of the 1–4 MB original.
 *
 * FAIL-OPEN: if sharp is unavailable, resize errors, or the cold-resize
 * concurrency cap is hit, we fall back to the original 302 — never a broken image
 * and never a request that melts the event loop.
 */
import type { FastifyInstance } from "fastify";
import {
  getR2SignedUrl,
  getObjectByKey,
  uploadToR2,
  objectExists,
} from "../services/r2/r2Service.js";
import { getEnv } from "../config/env.js";

const CATEGORY_KEY_PREFIX = "user-app-categories/";
const SIGNED_URL_TTL_SEC = 3600;

/** Memoize signed URLs so home grids don't mint a new signature per chip. */
type SignedCacheEntry = { url: string; expiresAtMs: number };
const signedUrlLru = new Map<string, SignedCacheEntry>();
const SIGNED_URL_CACHE_MAX = 500;

// ── Derivative (resize) config ────────────────────────────────────────────
// A small fixed ladder of widths bounds how many derivatives can ever exist
// per image (≈ widths × qualities × formats), so the cache can't explode from
// arbitrary client widths. Requested widths snap UP to the next rung.
const WIDTH_LADDER = [64, 96, 128, 160, 200, 240, 320, 400, 480, 640, 800, 1080] as const;
const MAX_WIDTH = WIDTH_LADDER[WIDTH_LADDER.length - 1];
const QUALITY_LADDER = [60, 72, 82] as const;
const DEFAULT_QUALITY = 72;
const ORIGINAL_MAX_BYTES = 15 * 1024 * 1024; // cap the original we pull into sharp
const DERIVATIVE_CACHE_CONTROL = "public, max-age=604800, immutable"; // 7d; keys change on re-upload
// Cold (cache-miss) resizes are CPU/RAM heavy. Cap concurrency; over the cap we
// degrade gracefully to the original instead of queueing/OOMing.
const MAX_CONCURRENT_COLD_RESIZE = 4;
let coldResizeInFlight = 0;
// Collapse a burst of identical first-hits into one generate.
const generateInFlight = new Map<string, Promise<void>>();

function snapWidth(raw: number): number {
  const n = Math.round(raw);
  for (const w of WIDTH_LADDER) if (n <= w) return w;
  return MAX_WIDTH;
}
function snapQuality(raw: number): number {
  if (!Number.isFinite(raw)) return DEFAULT_QUALITY;
  let best = QUALITY_LADDER[0] as number;
  let bestDiff = Math.abs(raw - best);
  for (const q of QUALITY_LADDER) {
    const d = Math.abs(raw - q);
    if (d < bestDiff) {
      best = q;
      bestDiff = d;
    }
  }
  return best;
}

function cacheControlForKey(key: string): string {
  if (key.startsWith(CATEGORY_KEY_PREFIX)) {
    return "private, max-age=300";
  }
  return "private, max-age=300";
}

async function signedUrlCached(key: string): Promise<string> {
  const now = Date.now();
  const hit = signedUrlLru.get(key);
  // Refresh 5 minutes before expiry.
  if (hit && hit.expiresAtMs - now > 5 * 60_000) {
    signedUrlLru.delete(key);
    signedUrlLru.set(key, hit);
    return hit.url;
  }
  const url = await getR2SignedUrl(key, SIGNED_URL_TTL_SEC);
  signedUrlLru.set(key, { url, expiresAtMs: now + SIGNED_URL_TTL_SEC * 1000 });
  while (signedUrlLru.size > SIGNED_URL_CACHE_MAX) {
    const oldest = signedUrlLru.keys().next().value;
    if (oldest == null) break;
    signedUrlLru.delete(oldest);
  }
  return url;
}

/** Lazy, cached sharp import — null (once) if the native module is unavailable. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SharpFactory = (input?: Buffer, opts?: Record<string, unknown>) => any;
let sharpModule: SharpFactory | null | undefined;
async function loadSharp(): Promise<SharpFactory | null> {
  if (sharpModule !== undefined) return sharpModule;
  try {
    const mod = (await import("sharp")) as unknown as { default?: SharpFactory } & SharpFactory;
    sharpModule = (mod.default ?? mod) as SharpFactory;
  } catch {
    sharpModule = null;
  }
  return sharpModule;
}

/** Stable public URL when a public bucket domain is configured, else a signed URL. */
async function derivativeRedirectUrl(key: string): Promise<string> {
  const pub = getEnv().R2_PUBLIC_BASE_URL;
  if (pub) {
    const base = pub.replace(/\/+$/, "");
    const encoded = key.split("/").map(encodeURIComponent).join("/");
    return `${base}/${encoded}`;
  }
  return signedUrlCached(key);
}

function derivativeKeyFor(originalKey: string, width: number, quality: number, fmt: "webp" | "jpeg"): string {
  const ext = fmt === "jpeg" ? "jpg" : "webp";
  const clean = originalKey.replace(/^\/+/, "");
  return `_derivatives/v1/w${width}q${quality}/${clean}.${ext}`;
}

/** Generate one derivative and write it back to R2. Throws on any failure. */
async function generateDerivative(args: {
  originalKey: string;
  derivativeKey: string;
  width: number;
  quality: number;
  fmt: "webp" | "jpeg";
}): Promise<void> {
  const sharp = await loadSharp();
  if (!sharp) throw new Error("sharp_unavailable");
  const original = await getObjectByKey(args.originalKey, { maxBytes: ORIGINAL_MAX_BYTES });
  if (!original) throw new Error("original_missing");

  let pipeline = sharp(original.buffer, { failOn: "none" })
    .rotate() // honour EXIF orientation
    .resize({ width: args.width, withoutEnlargement: true });
  pipeline =
    args.fmt === "jpeg"
      ? pipeline.jpeg({ quality: args.quality, mozjpeg: true })
      : pipeline.webp({ quality: args.quality });
  const out: Buffer = await pipeline.toBuffer();
  await uploadToR2(out, args.derivativeKey, args.fmt === "jpeg" ? "image/jpeg" : "image/webp");
}

export async function attachmentsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { key?: string; w?: string; q?: string; f?: string } }>(
    "/attachments/proxy",
    async (req, reply) => {
      const key = req.query?.key;
      if (!key || typeof key !== "string") {
        return reply.code(400).send({ error: "Missing key parameter" });
      }
      const decodedKey = (() => {
        try {
          return decodeURIComponent(key);
        } catch {
          return key;
        }
      })();

      // Never resize a derivative (guards against accidental recursion).
      const wantsResize =
        req.query?.w != null &&
        String(req.query.w).trim() !== "" &&
        !decodedKey.startsWith("_derivatives/");

      // ── Original passthrough (unchanged legacy behaviour) ──────────────
      if (!wantsResize) {
        try {
          const signed = await signedUrlCached(decodedKey);
          return reply
            .header("Cache-Control", cacheControlForKey(decodedKey))
            .redirect(signed, 302);
        } catch (e) {
          req.log.error(e, "attachments/proxy");
          return reply.code(500).send({ error: "Failed to load file" });
        }
      }

      // ── Resized derivative (cache-aside) ───────────────────────────────
      const width = snapWidth(Number(req.query?.w));
      const quality = snapQuality(req.query?.q != null ? Number(req.query.q) : DEFAULT_QUALITY);
      const fmt: "webp" | "jpeg" =
        String(req.query?.f ?? "webp").toLowerCase() === "jpeg" ||
        String(req.query?.f ?? "").toLowerCase() === "jpg"
          ? "jpeg"
          : "webp";
      const derivativeKey = derivativeKeyFor(decodedKey, width, quality, fmt);

      const fallbackToOriginal = async () => {
        try {
          const signed = await signedUrlCached(decodedKey);
          return reply.header("Cache-Control", cacheControlForKey(decodedKey)).redirect(signed, 302);
        } catch (e) {
          req.log.error(e, "attachments/proxy fallback");
          return reply.code(500).send({ error: "Failed to load file" });
        }
      };

      try {
        // 1) Already generated? Cheap HEAD → redirect.
        if (await objectExists(derivativeKey)) {
          const url = await derivativeRedirectUrl(derivativeKey);
          return reply.header("Cache-Control", DERIVATIVE_CACHE_CONTROL).redirect(url, 302);
        }

        // 2) Cold miss — generate once (coalesced), bounded concurrency.
        let gen = generateInFlight.get(derivativeKey);
        if (!gen) {
          if (coldResizeInFlight >= MAX_CONCURRENT_COLD_RESIZE) {
            // Too busy to resize right now — serve the original so the user is
            // never blocked. The derivative will be built on a later request.
            return fallbackToOriginal();
          }
          coldResizeInFlight += 1;
          gen = generateDerivative({ originalKey: decodedKey, derivativeKey, width, quality, fmt })
            .finally(() => {
              coldResizeInFlight -= 1;
              generateInFlight.delete(derivativeKey);
            });
          generateInFlight.set(derivativeKey, gen);
        }
        await gen;

        const url = await derivativeRedirectUrl(derivativeKey);
        return reply.header("Cache-Control", DERIVATIVE_CACHE_CONTROL).redirect(url, 302);
      } catch (e) {
        // sharp missing / decode failure / R2 hiccup → original, never broken.
        req.log.warn({ err: e, derivativeKey }, "attachments/proxy resize fell back to original");
        return fallbackToOriginal();
      }
    }
  );
}
