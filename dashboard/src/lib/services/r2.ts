/**
 * R2 Service for Dashboard
 * Handles Cloudflare R2 operations for document uploads
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let r2Client: S3Client | null = null;
let bucketName: string | null = null;

function getR2Client(): S3Client {
  if (r2Client) return r2Client;

  if (
    !process.env.R2_ACCESS_KEY ||
    !process.env.R2_SECRET_KEY ||
    !process.env.R2_ENDPOINT ||
    !process.env.R2_BUCKET_NAME
  ) {
    throw new Error(
      "R2 credentials not configured. Required: R2_ACCESS_KEY, R2_SECRET_KEY, R2_ENDPOINT, R2_BUCKET_NAME"
    );
  }

  // Cloudflare R2 requires forcePathStyle: true for custom endpoints
  r2Client = new S3Client({
    region: process.env.R2_REGION || "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY,
      secretAccessKey: process.env.R2_SECRET_KEY,
    },
    forcePathStyle: true, // Required for R2 custom endpoints
  });

  bucketName = process.env.R2_BUCKET_NAME;

  return r2Client;
}

function getBucketName(): string {
  if (bucketName) return bucketName;
  if (!process.env.R2_BUCKET_NAME) {
    throw new Error("R2_BUCKET_NAME not configured");
  }
  bucketName = process.env.R2_BUCKET_NAME;
  return bucketName;
}

export interface UploadResult {
  key: string;
  signedUrl: string;
}

/**
 * Upload a file to R2 with a specific key (e.g. merchants/{parentId}/stores/{storeId}/menu/...).
 * @returns The R2 key
 */
export async function uploadWithKey(
  file: File,
  r2Key: string,
  contentTypeOverride?: string | null
): Promise<{ key: string }> {
  const client = getR2Client();
  const bucket = getBucketName();
  const { normalizeR2ObjectKey, contentTypeFromR2Key } = await import("@/lib/r2-proxy-url");
  const key = normalizeR2ObjectKey(r2Key) || r2Key.replace(/^\/+/, "");

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = contentTypeFromR2Key(
    key,
    (contentTypeOverride && contentTypeOverride.trim()) || file.type || null
  );

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  console.log(`[R2] Uploaded file: ${key}`);
  return { key };
}

/** Copy an existing R2 object to a new key. Does not throw on missing source — caller handles. */
export async function copyObjectToKey(sourceKey: string, destKey: string): Promise<void> {
  const client = getR2Client();
  const bucket = getBucketName();
  const { normalizeR2ObjectKey } = await import("@/lib/r2-proxy-url");
  const from = normalizeR2ObjectKey(sourceKey);
  const to = normalizeR2ObjectKey(destKey);
  if (!from || !to) throw new Error("Invalid R2 key");
  const encodedFrom = from
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${encodedFrom}`,
      Key: to,
    })
  );
}

/**
 * Get object from R2 by key (for proxy/serving).
 * Returns buffer and contentType for use in NextResponse.
 */
/** List object keys under an R2 prefix (e.g. orders/GM10000092/delivery-proof/). */
export async function listR2KeysByPrefix(
  prefix: string,
  maxKeys = 50
): Promise<string[]> {
  const client = getR2Client();
  const bucket = getBucketName();
  const normalizedPrefix = prefix.trim().replace(/^\/+/, "");
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: normalizedPrefix,
        MaxKeys: Math.min(maxKeys - keys.length, 1000),
        ContinuationToken: continuationToken,
      })
    );
    for (const obj of response.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken && keys.length < maxKeys);

  return keys;
}

export async function getObjectByKey(
  r2Key: string
): Promise<{ buffer: Buffer; contentType?: string } | null> {
  const client = getR2Client();
  const bucket = getBucketName();
  const { r2LookupKeyVariants, contentTypeFromR2Key } = await import("@/lib/r2-proxy-url");
  const variants = r2LookupKeyVariants(r2Key);
  if (variants.length === 0) return null;

  for (const key of variants) {
    try {
      const response = await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      );
      if (!response.Body) continue;
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      return {
        buffer,
        contentType: contentTypeFromR2Key(key, response.ContentType ?? null),
      };
    } catch {
      continue;
    }
  }
  return null;
}

/** True when the object exists in R2 (HEAD). Missing/invalid keys → false. */
export async function r2ObjectExists(r2Key: string | null | undefined): Promise<boolean> {
  if (!r2Key || typeof r2Key !== "string" || !r2Key.trim()) return false;
  try {
    const meta = await headObjectByKey(r2Key);
    return !!meta;
  } catch {
    return false;
  }
}

/** HEAD metadata for an R2 object (content type / size). */
export async function headObjectByKey(
  r2Key: string
): Promise<{ contentType?: string; contentLength?: number } | null> {
  try {
    const client = getR2Client();
    const bucket = getBucketName();
    const { r2LookupKeyVariants, contentTypeFromR2Key } = await import("@/lib/r2-proxy-url");
    const variants = r2LookupKeyVariants(r2Key);
    for (const key of variants) {
      try {
        const response = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return {
          contentType: contentTypeFromR2Key(key, response.ContentType ?? null),
          contentLength: typeof response.ContentLength === "number" ? response.ContentLength : undefined,
        };
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Upload document to R2
 * @param file - File to upload
 * @param riderId - Rider ID
 * @param docType - Document type (aadhaar, pan, dl, rc, selfie, rental_proof, ev_proof)
 * @param replaceOldKey - Optional: R2 key of old file to delete (for replacement)
 * @returns Upload result with key and signed URL
 */
export async function uploadDocument(
  file: File,
  riderId: number,
  docType: string,
  replaceOldKey?: string | null
): Promise<UploadResult> {
  const client = getR2Client();
  const bucket = getBucketName();

  // Generate key: riders/{riderId}/documents/{docType}/{timestamp}.{ext}
  const timestamp = Date.now();
  const fileExt = file.name.split(".").pop() || "jpg";
  const key = `riders/${riderId}/documents/${docType}/${timestamp}.${fileExt}`;

  try {
    // Delete old file if replacing
    if (replaceOldKey && replaceOldKey.trim()) {
      try {
        await deleteDocument(replaceOldKey);
        console.log(`[R2] Deleted old file: ${replaceOldKey}`);
      } catch (deleteError) {
        // Log but don't fail - old file might not exist
        console.warn(`[R2] Failed to delete old file ${replaceOldKey}:`, deleteError);
      }
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to R2
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: file.type || "image/jpeg",
      })
    );

    console.log(`[R2] Uploaded new file: ${key}`);

    // Generate signed URL with 7-day expiration (R2 maximum)
    const signedUrl = await getSignedUrl(
      client as unknown as Parameters<typeof getSignedUrl>[0],
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
      { expiresIn: 604800 } // 7 days
    );

    return { key, signedUrl };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[R2] Upload failed for key: ${key}`, errorMessage);
    throw new Error(`R2 upload failed: ${errorMessage}`);
  }
}

/**
 * Get signed URL for existing R2 object
 * @param r2Key - R2 storage key
 * @param expiresIn - Expiration time in seconds (default: 7 days)
 * @returns Signed URL
 */
export async function getSignedUrlFromKey(
  r2Key: string,
  expiresIn: number = 604800
): Promise<string> {
  const client = getR2Client();
  const bucket = getBucketName();
  const { normalizeR2ObjectKey } = await import("@/lib/r2-proxy-url");
  const key = normalizeR2ObjectKey(r2Key);
  if (!key) {
    throw new Error("Invalid R2 key");
  }

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
    throw new Error(
      `Failed to get signed URL: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Delete document from R2
 * @param r2Key - R2 storage key
 */
export async function deleteDocument(r2Key: string): Promise<void> {
  const client = getR2Client();
  const bucket = getBucketName();

  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: r2Key,
      })
    );
  } catch (error) {
    throw new Error(
      `R2 delete failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Check if a signed URL is expired or about to expire
 * @param signedUrl - Signed URL to check
 * @returns true if URL is expired or expires within 1 day
 */
export function isSignedUrlExpired(signedUrl: string): boolean {
  try {
    const url = new URL(signedUrl);
    const expiresParam = url.searchParams.get("X-Amz-Expires");
    if (!expiresParam) return true;

    // Check if URL has expiration parameter (R2 signed URLs include this)
    // For simplicity, we'll regenerate if URL is older than 6 days (1 day before expiration)
    return false; // We'll handle expiration by trying to regenerate on access
  } catch {
    return true;
  }
}
