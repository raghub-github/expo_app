import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listRiderIncentives } from "../../lib/rider-incentive-list.service.js";

function parseRiderIdFromAuth(sub: string): number | null {
  const match = sub.match(/usr_(\d+)/);
  return match ? parseInt(match[1]!, 10) : null;
}

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  filter: z.enum(["all", "incentive", "surge", "peak"]).optional(),
});

export function registerRiderIncentiveRoutes(app: FastifyInstance) {
  app.get("/incentives", async (req, reply) => {
    const riderId = parseRiderIdFromAuth(req.auth!.sub);
    if (riderId == null) {
      return reply.code(403).send({ success: false, error: "rider_not_found" });
    }

    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) {
      return reply.code(400).send({ success: false, error: "invalid_query" });
    }

    try {
      const result = await listRiderIncentives({
        riderId,
        riderUserId: req.auth!.sub,
        date: query.data.date,
        filter: query.data.filter,
      });
      return reply.send({ success: true, ...result });
    } catch (err) {
      app.log.error({ err }, "GET /rider/incentives failed");
      return reply.code(500).send({ success: false, error: "failed_to_load_incentives" });
    }
  });
}
