/**
 * GET /attachments/proxy?key=<r2_key>
 * Serves file from R2 by key. Use for permanent image URLs (bucket can stay private).
 *
 * Hot paths (e.g. user-app-categories) are served from an in-process LRU so home
 * category chips do not re-fetch R2 on every icon request.
 */
import type { FastifyInstance } from "fastify";
import { getObjectByKey } from "../services/r2/r2Service.js";

const CATEGORY_KEY_PREFIX = "user-app-categories/";
const LRU_MAX = 250;
type CacheEntry = { buffer: Buffer; contentType: string };
const objectLru = new Map<string, CacheEntry>();

function lruGet(key: string): CacheEntry | null {
  const hit = objectLru.get(key);
  if (!hit) return null;
  objectLru.delete(key);
  objectLru.set(key, hit);
  return hit;
}

function lruSet(key: string, entry: CacheEntry): void {
  if (objectLru.has(key)) objectLru.delete(key);
  objectLru.set(key, entry);
  while (objectLru.size > LRU_MAX) {
    const oldest = objectLru.keys().next().value;
    if (oldest == null) break;
    objectLru.delete(oldest);
  }
}

function cacheControlForKey(key: string): string {
  // Content-addressed category icons — safe to cache aggressively on device/CDN.
  if (key.startsWith(CATEGORY_KEY_PREFIX)) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=86400, stale-while-revalidate=604800";
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
        let result = lruGet(decodedKey);
        if (!result) {
          const fromR2 = await getObjectByKey(decodedKey);
          if (!fromR2) {
            return reply.code(404).send({ error: "File not found" });
          }
          result = { buffer: fromR2.buffer, contentType: fromR2.contentType };
          if (
            decodedKey.startsWith(CATEGORY_KEY_PREFIX) ||
            result.buffer.byteLength <= 512 * 1024
          ) {
            lruSet(decodedKey, result);
          }
        }

        return reply
          .code(200)
          .header("Content-Type", result.contentType)
          .header("Cache-Control", cacheControlForKey(decodedKey))
          .header("Vary", "Accept")
          .send(result.buffer);
      } catch (e) {
        req.log.error(e, "attachments/proxy");
        return reply.code(500).send({ error: "Failed to load file" });
      }
    }
  );
}
