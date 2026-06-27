import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withSqlRetry } from "../../db/client.js";
import {
  listAppStaticAssetsForClient,
  parseAppStaticAssetAppParam,
} from "./app-assets.service.js";

const appParamSchema = z.enum(["customer", "rider", "merchant"]);

const assetItemSchema = z.object({
  id: z.string(),
  section: z.string(),
  label: z.string(),
  description: z.string(),
  proxyUrl: z.string().nullable(),
  url: z.string().nullable(),
  sortOrder: z.number(),
});

export async function appAssetsRoutes(app: FastifyInstance) {
  /** Public — mobile apps fetch managed static images (no auth). */
  app.get(
    "/:app",
    {
      schema: {
        params: z.object({ app: appParamSchema }),
        response: {
          200: z.object({
            app: appParamSchema,
            assets: z.record(z.string(), assetItemSchema),
            items: z.array(assetItemSchema),
          }),
          400: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const { app: appName } = req.params as { app: string };
      const parsed = parseAppStaticAssetAppParam(appName);
      if (!parsed) {
        return reply.code(400).send({ error: "Invalid app. Use customer, rider, or merchant." });
      }

      const items = await withSqlRetry(() => listAppStaticAssetsForClient(parsed));
      const assets: Record<string, z.infer<typeof assetItemSchema>> = {};
      for (const item of items) {
        const shortKey = item.id.startsWith(`${parsed}.`)
          ? item.id.slice(parsed.length + 1)
          : item.id;
        assets[shortKey] = item;
      }

      return reply.send({ app: parsed, assets, items });
    }
  );
}
