import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";
import { getEnv } from "../../config/env.js";

/**
 * R2 Service - Handles all Cloudflare R2 operations
 * 
 * This service ensures transactional integrity with database operations.
 */

let r2Client: S3Client | null = null;
let bucketName: string | null = null;

export function getR2Client(): S3Client {
  if (r2Client) return r2Client;

  const env = getEnv();

  if (!env.R2_ACCESS_KEY || !env.R2_SECRET_KEY || !env.R2_ENDPOINT || !env.R2_BUCKET_NAME) {
    throw new Error("R2 credentials not configured. Required: R2_ACCESS_KEY, R2_SECRET_KEY, R2_ENDPOINT, R2_BUCKET_NAME");
  }

  // Cloudflare R2 requires forcePathStyle: true for custom endpoints
  r2Client = new S3Client({
    region: env.R2_REGION || "auto",
    endpoint: env.R2_ENDPOINT,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY,
      secretAccessKey: env.R2_SECRET_KEY,
    },
    forcePathStyle: true, // Required for R2 custom endpoints
  });

  bucketName = env.R2_BUCKET_NAME;
  
  console.log(`[R2] Client initialized - Bucket: ${bucketName}, Endpoint: ${env.R2_ENDPOINT}`);
  
  return r2Client;
}

export function getBucketName(): string {
  if (bucketName) return bucketName;
  const env = getEnv();
  if (!env.R2_BUCKET_NAME) {
    throw new Error("R2_BUCKET_NAME not configured");
  }
  bucketName = env.R2_BUCKET_NAME;
  return bucketName;
}

export interface UploadResult {
  key: string;
  signedUrl: string;
}

/**
 * Upload file to R2
 * Returns key and signed URL
 */
export async function uploadToR2(
  buffer: Buffer,
  key: string,
  contentType: string = "image/jpeg"
): Promise<UploadResult> {
  const client = getR2Client();
  const bucket = getBucketName();

  try {
    console.log(`[R2] Uploading to bucket: ${bucket}, key: ${key}, size: ${buffer.length} bytes`);
    
    // Upload to R2
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );

    console.log(`[R2] Upload successful for key: ${key}`);

    // Generate signed URL with 7-day expiration (Cloudflare R2 requirement)
    // Signed URLs can be regenerated using the stored r2Key if they expire
    const signedUrl = await getSignedUrl(
      // @aws-sdk private-property variance bug between getSignedUrl's Client
      // generic and S3Client — cast through unknown is the documented fix.
      client as unknown as Parameters<typeof getSignedUrl>[0],
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
      { expiresIn: 604800 } // 7 days (604800 seconds) - R2 maximum allowed
    );

    console.log(`[R2] Generated signed URL for key: ${key}`);
    
    return { key, signedUrl };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[R2] Upload failed for key: ${key}`, errorMessage);
    throw new Error(`R2 upload failed: ${errorMessage}`);
  }
}

/**
 * Delete file from R2
 */
export async function deleteFromR2(key: string): Promise<void> {
  const client = getR2Client();
  const bucket = getBucketName();

  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
  } catch (error) {
    throw new Error(`R2 delete failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get signed URL for existing object
 * @param expiresIn - Expiration time in seconds (default: 7 days - R2 maximum allowed)
 */
export async function getR2SignedUrl(key: string, expiresIn: number = 604800): Promise<string> {
  const client = getR2Client();
  const bucket = getBucketName();

  try {
    const signedUrl = await getSignedUrl(
      client as unknown as Parameters<typeof getSignedUrl>[0],
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
      { expiresIn }
    );

    return signedUrl;
  } catch (error) {
    throw new Error(`Failed to get signed URL: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get object from R2 by key (for proxy/serving without signed URL).
 * Returns buffer and contentType; null if not found.
 * Rejects oversized bodies so callers cannot OOM the process.
 */
export async function getObjectByKey(
  key: string,
  options?: { maxBytes?: number }
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const client = getR2Client();
  const bucket = getBucketName();
  const maxBytes = options?.maxBytes ?? 8 * 1024 * 1024;
  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    if (!response.Body) return null;
    if (response.ContentLength != null && response.ContentLength > maxBytes) {
      try {
        (response.Body as { destroy?: () => void }).destroy?.();
      } catch {
        /* ignore */
      }
      throw new Error(`R2 object too large (${response.ContentLength} bytes)`);
    }
    const buffer = Buffer.from(await response.Body.transformToByteArray());
    if (buffer.byteLength > maxBytes) {
      throw new Error(`R2 object too large (${buffer.byteLength} bytes)`);
    }
    const contentType = response.ContentType ?? "application/octet-stream";
    return { buffer, contentType };
  } catch (err: unknown) {
    const code = (err as { name?: string })?.name;
    if (code === "NoSuchKey") return null;
    throw err;
  }
}

/**
 * Open an R2 object as a Node stream (no full-body Buffer).
 * Caller must pipe/destroy the stream.
 */
export async function getObjectStreamByKey(key: string): Promise<{
  stream: Readable;
  contentType: string;
  contentLength: number | null;
} | null> {
  const client = getR2Client();
  const bucket = getBucketName();
  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    if (!response.Body) return null;
    const body = response.Body as unknown as Readable;
    const stream =
      typeof body.pipe === "function"
        ? body
        : Readable.from(body as unknown as AsyncIterable<Uint8Array>);
    return {
      stream,
      contentType: response.ContentType ?? "application/octet-stream",
      contentLength: response.ContentLength ?? null,
    };
  } catch (err: unknown) {
    const code = (err as { name?: string })?.name;
    if (code === "NoSuchKey") return null;
    throw err;
  }
}

/**
 * Extract key from signed URL
 * R2 signed URLs can be in format: https://bucket.endpoint/key?signature
 * or https://endpoint/bucket/key?signature
 */
export function extractKeyFromSignedUrl(signedUrl: string): string | null {
  try {
    const url = new URL(signedUrl);
    // Remove query parameters
    const pathname = url.pathname;
    const pathParts = pathname.split("/").filter(Boolean);
    
    // R2 URLs typically have format: /bucket/key or just /key
    // Try to find the key part (usually after bucket name)
    if (pathParts.length >= 2) {
      // Assume format: /bucket/key - return everything after bucket
      return pathParts.slice(1).join("/");
    } else if (pathParts.length === 1) {
      // Just /key format
      return pathParts[0];
    }
    
    return null;
  } catch {
    return null;
  }
}

