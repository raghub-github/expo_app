import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { getSql, resetDbPoolAsync } from "../db/client.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get(
    "/health",
    {
      schema: {
        response: {
          200: z.object({
            ok: z.literal(true),
            ts: z.string(),
            database: z.enum(["connected", "disconnected"]),
            uptime: z.number(),
          }),
          503: z.object({
            ok: z.literal(false),
            ts: z.string(),
            database: z.enum(["connected", "disconnected"]),
            error: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const startTime = Date.now();
      const uptime = Math.floor((Date.now() - startTime) / 1000);

      // Check database connectivity — never hang forever if the pool is wedged.
      let dbStatus: "connected" | "disconnected" = "disconnected";
      try {
        const sql = getSql();
        await Promise.race([
          sql`SELECT 1`,
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error("db_health_timeout")), 3_000);
          }),
        ]);
        dbStatus = "connected";
      } catch (error) {
        request.log.error({ error }, "Database health check failed");
        dbStatus = "disconnected";
        // Wedged checkout queue — drop dead sockets so the next request can recover.
        void resetDbPoolAsync().catch(() => undefined);
      }

      const response = {
        ok: true as const,
        ts: new Date().toISOString(),
        database: dbStatus,
        uptime: process.uptime(),
      };

      // Return 503 if database is disconnected
      if (dbStatus === "disconnected") {
        return reply.status(503).send({
          ok: false as const,
          ts: new Date().toISOString(),
          database: dbStatus,
          error: "Database connection failed",
        });
      }

      return response;
    },
  );
}
