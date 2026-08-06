/**
 * GET /attachments/proxy?key=<r2_key>
 * Serves file from R2 by key. Use for permanent image URLs (bucket can stay private).
 *
 * Memory-safe: always 302 to a short-lived signed R2 URL so Node never buffers
 * image bodies (category icons in this fleet are often 1–2MB+).
 */
import type { FastifyInstance } from "fastify";
import { getR2SignedUrl } from "../services/r2/r2Service.js";

const CATEGORY_KEY_PREFIX = "user-app-categories/";
const SIGNED_URL_TTL_SEC = 3600;

/** Memoize signed URLs so home grids don't mint a new signature per chip. */
type SignedCacheEntry = { url: string; expiresAtMs: number };
const signedUrlLru = new Map<string, SignedCacheEntry>();
const SIGNED_URL_CACHE_MAX = 500;

function cacheControlForKey(key: string): string {
  if (key.startsWith(CATEGORY_KEY_PREFIX)) {
    // Redirect response only — client caches the final R2 URL until signature expiry.
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

export async function attachmentsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { key?: string } }>(
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
  );
}
