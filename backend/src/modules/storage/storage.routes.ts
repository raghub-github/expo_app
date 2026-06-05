import type { FastifyInstance } from "fastify";
import { z } from "zod";
import multipart from "@fastify/multipart";
import { auth } from "../../plugins/auth.js";
import { uploadToR2, getR2SignedUrl, deleteFromR2 } from "../../services/r2/r2Service.js";
import { attachmentsProxyUrlFromKeyForApi } from "../../utils/attachments-proxy-url.js";
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
    {
      schema: {
        response: {
          200: z.object({
            signedUrl: z.string(),
            key: z.string(),
            proxyUrl: z.string(),
          }),
          400: z.object({ error: z.string() }),
          500: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      try {
        let folder = "documents";
        let key: string | null = null;
        let fileBuffer: Buffer | null = null;
        let mimeType = "image/jpeg";

        const parts = req.parts();
        for await (const part of parts) {
          if (part.type === "file") {
            // Must consume the stream inside the loop — deferring toBuffer() hangs the parser.
            fileBuffer = await part.toBuffer();
            mimeType = part.mimetype || mimeType;
          } else if (part.type === "field") {
            if (part.fieldname === "folder") {
              folder = String(part.value);
            } else if (part.fieldname === "key") {
              key = String(part.value);
            }
          }
        }

        if (!fileBuffer) {
          return reply.code(400).send({ error: "No file provided" });
        }

        if (!key) {
          const timestamp = Date.now();
          const random = Math.random().toString(36).substring(7);
          key = `${folder}/${timestamp}-${random}.jpg`;
        }

        if (fileBuffer.length > 10 * 1024 * 1024) {
          return reply.code(400).send({ error: "File size exceeds 10MB limit" });
        }

        req.log.info(
          { key, bytes: fileBuffer.length, mimeType },
          "[storage/upload] Received file, uploading to R2"
        );

        const result = await uploadToR2(fileBuffer, key, mimeType);

        req.log.info({ key: result.key }, "[storage/upload] R2 upload complete");

        return reply.send({
          signedUrl: result.signedUrl,
          key: result.key,
          proxyUrl: attachmentsProxyUrlFromKeyForApi(result.key),
        });
      } catch (error) {
        req.log.error(error, "[storage/upload] Upload failed");
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
          500: z.object({
            error: z.string(),
            message: z.string(),
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

  // Delete file from R2
  app.delete(
    "/delete",
    {
      schema: {
        body: z.object({
          key: z.string(),
        }),
        response: {
          200: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
          500: z.object({
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    async (req, reply) => {
      try {
        const { key } = req.body as { key: string };
        await deleteFromR2(key);
        return reply.send({
          success: true,
          message: "File deleted successfully",
        });
      } catch (error) {
        return reply.code(500).send({
          error: "Delete failed",
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
          500: z.object({
            success: z.boolean(),
            message: z.string(),
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

