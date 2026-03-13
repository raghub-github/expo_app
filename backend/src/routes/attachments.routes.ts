/**
 * GET /attachments/proxy?key=<r2_key>
 * Serves file from R2 by key. Use for permanent image URLs (bucket can stay private).
 */
import type { FastifyInstance } from "fastify";
import { getObjectByKey } from "../services/r2/r2Service.js";

export async function attachmentsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { key?: string } }>(
    "/attachments/proxy",
    async (req, reply) => {
      const key = req.query?.key;
      if (!key || typeof key !== "string") {
        return reply.code(400).send({ error: "Missing key parameter" });
      }
      try {
        const result = await getObjectByKey(key);
        if (!result) {
          return reply.code(404).send({ error: "File not found" });
        }
        return reply
          .code(200)
          .header("Content-Type", result.contentType)
          .header("Cache-Control", "private, max-age=3600")
          .send(result.buffer);
      } catch (e) {
        req.log.error(e, "attachments/proxy");
        return reply.code(500).send({ error: "Failed to load file" });
      }
    }
  );
}
