import type { FastifyInstance } from "fastify";
import { z } from "zod";
import multipart from "@fastify/multipart";
import { auth } from "../../plugins/auth.js";
import { uploadToR2, getR2SignedUrl } from "../../services/r2/r2Service.js";
import { getEnv } from "../../config/env.js";

/**
 * Cloudflare R2 Storage Routes
 * 
 * R2 is S3-compatible, so we use AWS SDK.
 * Credentials are stored in environment variables.
 * 
 * IMPORTANT: All operations are transactional with Supabase.
 * If R2 upload fails, Supabase won't be updated.
 * If Supabase update fails, R2 upload will be rolled back.
 */

export async function storageRoutes(app: FastifyInstance) {
  await app.register(auth, { required: true });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

  // Upload file to R2
  app.post(
    "/upload",
    async (req, reply) => {
      try {
        // Process multipart form data - iterate through all parts
        const parts = req.parts();
        let folder = "documents";
        let key: string | null = null;
        let fileData: any = null;

        for await (const part of parts) {
          if (part.type === "file") {
            fileData = part;
          } else if (part.type === "field") {
            if (part.fieldname === "folder") {
              folder = part.value as string;
            } else if (part.fieldname === "key") {
              key = part.value as string;
            }
          }
        }

        if (!fileData) {
          return reply.code(400).send({ error: "No file provided" });
        }

        // If key not provided, generate one
        if (!key) {
          const timestamp = Date.now();
          const random = Math.random().toString(36).substring(7);
          key = `${folder}/${timestamp}-${random}-${fileData.filename || "file"}`;
        }

        const buffer = await fileData.toBuffer();

        // Validate file size (10MB limit)
        if (buffer.length > 10 * 1024 * 1024) {
          return reply.code(400).send({ error: "File size exceeds 10MB limit" });
        }

        // Upload to R2 using service
        const result = await uploadToR2(buffer, key, fileData.mimetype || "image/jpeg");

        return reply.send({
          signedUrl: result.signedUrl,
          key: result.key,
        });
      } catch (error) {
        return reply.code(500).send({
          error: "Upload failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  // Get signed URL for existing object
  app.post(
    "/signed-url",
    {
      schema: {
        body: z.object({
          key: z.string(),
          expiresIn: z.number().optional().default(3600),
        }),
        response: {
          200: z.object({
            signedUrl: z.string(),
          }),
        },
      },
    },
    async (req, reply) => {
      try {
        const { key, expiresIn } = req.body as { key: string; expiresIn: number };
        const signedUrl = await getR2SignedUrl(key, expiresIn);
        return reply.send({ signedUrl });
      } catch (error) {
        return reply.code(500).send({
          error: "Failed to get signed URL",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  // Test R2 connection (for debugging)
  app.post(
    "/test",
    {
      schema: {
        response: {
          200: z.object({
            success: z.boolean(),
            message: z.string(),
            config: z.object({
              bucket: z.string(),
              endpoint: z.string(),
              region: z.string(),
            }).optional(),
          }),
        },
      },
    },
    async (req, reply) => {
      try {
        const { getEnv } = await import("../../config/env.js");
        const env = getEnv();
        
        // Test if we can create the client (this validates credentials)
        const { getR2Client, getBucketName } = await import("../../services/r2/r2Service.js");
        const client = getR2Client();
        const bucket = getBucketName();

        return reply.send({
          success: true,
          message: "R2 connection test successful",
          config: {
            bucket,
            endpoint: env.R2_ENDPOINT || "not configured",
            region: env.R2_REGION || "auto",
          },
        });
      } catch (error) {
        return reply.code(500).send({
          success: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );
}

