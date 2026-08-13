import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withSqlRetry } from "../../db/client.js";
import {
  listLearningCentreVideosForClient,
  parseLearningCentreAudience,
} from "./learning-centre.service.js";

const appParamSchema = z.enum(["customer", "rider", "merchant"]);

const videoSchema = z.object({
  id: z.number(),
  sectionTitle: z.string(),
  videoTitle: z.string(),
  youtubeUrl: z.string(),
  youtubeId: z.string(),
  thumbnailUrl: z.string().nullable(),
  durationLabel: z.string().nullable(),
  sectionNumber: z.number(),
  sortOrder: z.number(),
});

const sectionSchema = z.object({
  title: z.string(),
  sectionNumber: z.number(),
  videos: z.array(videoSchema),
});

export async function learningCentreRoutes(app: FastifyInstance) {
  /** Public — apps fetch Learning Centre videos (no auth). */
  app.get(
    "/:app",
    {
      schema: {
        params: z.object({ app: appParamSchema }),
        response: {
          200: z.object({
            app: appParamSchema,
            revision: z.string(),
            sections: z.array(sectionSchema),
          }),
          400: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const { app: appName } = req.params as { app: string };
      const parsed = parseLearningCentreAudience(appName);
      if (!parsed) {
        return reply.code(400).send({ error: "Invalid app. Use customer, rider, or merchant." });
      }

      const payload = await withSqlRetry(() => listLearningCentreVideosForClient(parsed));
      reply.header("Cache-Control", "no-store, no-cache, must-revalidate");
      reply.header("Pragma", "no-cache");
      return reply.send({ app: parsed, revision: payload.revision, sections: payload.sections });
    }
  );
}
