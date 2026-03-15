

// Only import once at the top

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';


import { getSignedUrl } from '@aws-sdk/s3-request-presigner';


// Lazy initialization of S3Client to ensure environment variables are loaded
let s3Client: S3Client | null = null;
let cachedBucketName: string | null = null;

function getR2Config() {
  // Read environment variables at runtime
  const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY?.trim();
  const R2_SECRET_KEY = process.env.R2_SECRET_KEY?.trim();
  const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME?.trim();
  const R2_REGION = process.env.R2_REGION?.trim();
  const R2_ENDPOINT = process.env.R2_ENDPOINT?.trim();

  // Only validate R2 credentials on the server, not in the browser
  const isServer = typeof window === 'undefined';
  if (isServer) {
    // Validate that required variables are present and not empty
    const missingVars: string[] = [];
    if (!R2_ACCESS_KEY || R2_ACCESS_KEY.length === 0) missingVars.push('R2_ACCESS_KEY');
    if (!R2_SECRET_KEY || R2_SECRET_KEY.length === 0) missingVars.push('R2_SECRET_KEY');
    if (!R2_BUCKET_NAME || R2_BUCKET_NAME.length === 0) missingVars.push('R2_BUCKET_NAME');
    if (!R2_ENDPOINT || R2_ENDPOINT.length === 0) missingVars.push('R2_ENDPOINT');
    
    if (missingVars.length > 0) {
      console.error('[R2] Missing or empty required environment variables:', missingVars);
      throw new Error(`Missing required R2 environment variables: ${missingVars.join(', ')}`);
    }
  }

  const region = (R2_REGION && R2_REGION.length > 0) ? R2_REGION : 'auto';
  
  return {
    accessKey: R2_ACCESS_KEY!,
    secretKey: R2_SECRET_KEY!,
    bucketName: R2_BUCKET_NAME!,
    region: region,
    endpoint: R2_ENDPOINT!,
  };
}

function getS3Client(): S3Client {
  if (s3Client) {
    return s3Client;
  }

  const config = getR2Config();
  
  // Validate credentials before creating client
  if (!config.accessKey || !config.secretKey) {
    throw new Error('R2 credentials are invalid: accessKey or secretKey is missing');
  }
  
  if (!config.endpoint) {
    throw new Error('R2 endpoint is missing');
  }
  
  s3Client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
    forcePathStyle: false, // Cloudflare R2 uses virtual-hosted-style by default
  });

  return s3Client;
}

// Helper to get bucket name at runtime (cached after first read)
function getBucketName(): string {
  if (cachedBucketName) {
    return cachedBucketName;
  }
  
  const config = getR2Config();
  cachedBucketName = config.bucketName;
  return cachedBucketName;
}

/**
 * Extracts the R2 object key from a full image URL
 * Handles various URL formats and extracts the path after the base URL
 */
export function extractR2KeyFromUrl(imageUrl: string): string | null {
  if (!imageUrl) return null;
  
  try {
    const normalizedImageUrl = imageUrl.trim();

    // If it's our proxy URL, extract key from query param
    if (normalizedImageUrl.includes('/api/attachments/proxy') && normalizedImageUrl.includes('key=')) {
      try {
        const u = new URL(normalizedImageUrl, 'http://dummy');
        const k = u.searchParams.get('key');
        return (k && decodeURIComponent(k)) || null;
      } catch {
        return null;
      }
    }

    // If it's a full URL (http:// or https://), extract pathname
    if (normalizedImageUrl.startsWith('http://') || normalizedImageUrl.startsWith('https://')) {
      try {
        const url = new URL(normalizedImageUrl);
        // Return pathname without leading slash (e.g., "/storeId/timestamp_file.jpg" -> "storeId/timestamp_file.jpg")
        const key = url.pathname.replace(/^\/+/, '');
        return key || null;
      } catch (e) {
        console.error('[R2] Failed to parse URL:', normalizedImageUrl);
        // Fallback: try to extract path after domain using regex
        const match = normalizedImageUrl.match(/https?:\/\/[^\/]+(\/.+)/);
        if (match && match[1]) {
          return match[1].replace(/^\/+/, '');
        }
        return null;
      }
    }

    // Try using base URL if available (more precise extraction)
    const baseUrl = process.env.R2_PUBLIC_BASE_URL;
    if (baseUrl) {
      const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
      // If the URL starts with the base URL, extract the path after it
      if (normalizedImageUrl.startsWith(normalizedBaseUrl)) {
        const key = normalizedImageUrl.substring(normalizedBaseUrl.length).replace(/^\/+/, '');
        return key || null;
      }
    }

    // If it's already a key (no http:// or https://), return as-is
    if (!normalizedImageUrl.includes('://')) {
      return normalizedImageUrl.replace(/^\/+/, '');
    }

    return null;
  } catch (error) {
    console.error('[R2] Error extracting key from URL:', error);
    return null;
  }
}

/**
 * Converts an R2 key or proxy URL into a storable document URL.
 * - If value is already a full URL (https://...), returns as-is.
 * - If value is a key or proxy URL, returns /api/attachments/proxy?key=... (fallback for non-async paths).
 */
export function toStoredDocumentUrl(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("://")) return trimmed;
  if (trimmed.startsWith("/api/attachments/proxy")) return trimmed;
  const key = trimmed.replace(/^\/+/, "");
  return `/api/attachments/proxy?key=${encodeURIComponent(key)}`;
}

/** Default expiry for stored document signed URLs (7 days). */
const DEFAULT_DOCUMENT_SIGNED_EXPIRY_SEC = 86400 * 7;

/**
 * Returns a proper signed URL for storage in DB (same format as upload response).
 * - Full URL (https://...): returned as-is.
 * - Key or proxy URL: generates R2 signed URL (7-day expiry) so "View document" links work.
 */
export async function toStoredDocumentUrlSigned(
  value: string | null | undefined,
  expiresInSeconds = DEFAULT_DOCUMENT_SIGNED_EXPIRY_SEC
): Promise<string | null> {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) return trimmed;
  const key = extractR2KeyFromUrl(trimmed) || trimmed.replace(/^\/+/, "");
  if (!key) return null;
  try {
    return await getR2SignedUrl(key, expiresInSeconds);
  } catch {
    return null;
  }
}

export async function deleteFromR2(key: string): Promise<void> {
  if (!key) {
    throw new Error('Key is required for deletion');
  }
  const s3 = getS3Client();
  const bucketName = getBucketName();
  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });
  try {
    await s3.send(command);
  } catch (err) {
    console.error('[R2][ERROR] Delete failed', err);
    throw err;
  }
}

/**
 * List object keys under a prefix (e.g. docs/merchants/GMMP1005/stores/GMMC1017/onboarding/menu/images/).
 */
export async function listR2KeysByPrefix(prefix: string, maxKeys = 1000): Promise<string[]> {
  const s3 = getS3Client();
  const bucketName = getBucketName();
  const normalizedPrefix = prefix.trim() ? (prefix.endsWith('/') ? prefix : `${prefix}/`) : prefix;
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: normalizedPrefix,
      MaxKeys: Math.min(maxKeys - keys.length, 1000),
      ContinuationToken: continuationToken,
    });
    const response = await s3.send(command);
    const contents = response.Contents || [];
    for (const obj of contents) {
      if (obj.Key) keys.push(obj.Key);
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken && keys.length < maxKeys);
  return keys;
}

/**
 * Delete all objects under a prefix. Use to clean up old onboarding menu files when replacing from dashboard.
 */
export async function deleteFromR2ByPrefix(prefix: string): Promise<number> {
  const keys = await listR2KeysByPrefix(prefix);
  if (keys.length === 0) return 0;
  const s3 = getS3Client();
  const bucketName = getBucketName();
  const BATCH = 1000;
  let deleted = 0;
  for (let i = 0; i < keys.length; i += BATCH) {
    const chunk = keys.slice(i, i + BATCH);
    const command = new DeleteObjectsCommand({
      Bucket: bucketName,
      Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
    });
    await s3.send(command);
    deleted += chunk.length;
  }
  return deleted;
}

export async function getR2SignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  const s3 = getS3Client();
  const bucketName = getBucketName();
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}


export async function uploadToR2(file: File, key: string): Promise<string> {
  // Convert File/Blob to Buffer/Uint8Array for Node.js AWS SDK
  let body: Buffer | Uint8Array;
  if (typeof file.arrayBuffer === 'function') {
    // File/Blob from browser FormData
    const ab = await file.arrayBuffer();
    body = Buffer.from(ab);
  } else {
    // Already a Buffer/Uint8Array
    body = file as any;
  }
  const s3 = getS3Client();
  const bucketName = getBucketName();
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: body,
    ContentType: (file as any).type || 'application/octet-stream',
  });
  await s3.send(command);
  return `${key}`;
}
