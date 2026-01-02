import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { getSql } from "../db/client.js";

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

      // Check database connectivity
      let dbStatus: "connected" | "disconnected" = "disconnected";
      try {
        const sql = getSql();
        await sql`SELECT 1`;
        dbStatus = "connected";
      } catch (error) {
        request.log.error({ error }, "Database health check failed");
        dbStatus = "disconnected";
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


