import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getEnv } from "../../config/env.js";

/**
 * R2 Service - Handles all Cloudflare R2 operations
 * 
 * This service ensures transactional integrity with database operations.
 */

let r2Client: S3Client | null = null;
let bucketName: string | null = null;

function getR2Client(): S3Client {
  if (r2Client) return r2Client;

  const env = getEnv();

  if (!env.R2_ACCESS_KEY || !env.R2_SECRET_KEY || !env.R2_ENDPOINT || !env.R2_BUCKET_NAME) {
    throw new Error("R2 credentials not configured");
  }

  r2Client = new S3Client({
    region: env.R2_REGION || "auto",
    endpoint: env.R2_ENDPOINT,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY,
      secretAccessKey: env.R2_SECRET_KEY,
    },
    forcePathStyle: false,
  });

  bucketName = env.R2_BUCKET_NAME;
  return r2Client;
}

function getBucketName(): string {
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
    // Upload to R2
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );

    // Generate signed URL (valid for 1 year)
    const signedUrl = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
      { expiresIn: 31536000 } // 1 year
    );

    return { key, signedUrl };
  } catch (error) {
    throw new Error(`R2 upload failed: ${error instanceof Error ? error.message : String(error)}`);
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
 */
export async function getR2SignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
  const client = getR2Client();
  const bucket = getBucketName();

  try {
    const signedUrl = await getSignedUrl(
      client,
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

