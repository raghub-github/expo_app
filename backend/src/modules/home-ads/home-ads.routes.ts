import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withSqlRetry } from "../../db/client.js";
import {
  listEnabledHomeAdsForClient,
  parseHomeAdAudience,
} from "./home-ads.service.js";

const appParamSchema = z.enum(["customer", "rider", "merchant"]);
const placementSchema = z.enum(["home", "orders"]);

const adSchema = z.object({
  id: z.number(),
  title: z.string(),
  body: z.string(),
  imageUrl: z.string().nullable(),
  ctaLabel: z.string().nullable(),
  ctaUrl: z.string().nullable(),
  ctaAction: z.enum(["bottom_sheet", "share", "redirect"]),
  sheetTitle: z.string().nullable(),
  sheetBody: z.string().nullable(),
  sortOrder: z.number(),
});

export async function homeAdsRoutes(app: FastifyInstance) {
  /** Public — only enabled ads for the app + placement. Empty list when none active. */
  app.get(
    "/:app",
    {
      schema: {
        params: z.object({ app: appParamSchema }),
        querystring: z.object({
          placement: placementSchema.optional(),
        }),
        response: {
          200: z.object({
            app: appParamSchema,
            placement: placementSchema,
            ads: z.array(adSchema),
          }),
          400: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const { app: appName } = req.params as { app: string };
      const q = req.query as { placement?: string };
      const parsed = parseHomeAdAudience(appName);
      if (!parsed) {
        return reply.code(400).send({ error: "Invalid app. Use customer, rider, or merchant." });
      }
      const placement = q.placement === "orders" ? "orders" : "home";
      const ads = await withSqlRetry(() => listEnabledHomeAdsForClient(parsed, placement));
      // Short private cache so admin enable/disable reaches apps quickly.
      reply.header("Cache-Control", "private, max-age=5, must-revalidate");
      return reply.send({ app: parsed, placement, ads });
    }
  );
}
