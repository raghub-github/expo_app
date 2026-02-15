

// Only import once at the top

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';


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

  // Debug: Log R2 env variables (mask secrets)
  if (typeof window === 'undefined') {
    console.log('[R2][DEBUG] ENV', {
      R2_ACCESS_KEY: R2_ACCESS_KEY ? R2_ACCESS_KEY.slice(0, 4) + '...' : undefined,
      R2_SECRET_KEY: R2_SECRET_KEY ? R2_SECRET_KEY.slice(0, 4) + '...' : undefined,
      R2_BUCKET_NAME,
      R2_REGION,
      R2_ENDPOINT,
      R2_PUBLIC_BASE_URL: process.env.R2_PUBLIC_BASE_URL,
    });
  }

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

export async function deleteFromR2(key: string): Promise<void> {
  if (!key) {
    throw new Error('Key is required for deletion');
  }
  const s3 = getS3Client();
  const bucketName = getBucketName();
  console.log('[R2][DEBUG] Deleting from R2', { key, bucketName });
  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });
  try {
    const result = await s3.send(command);
    console.log('[R2][DEBUG] Delete result', result);
  } catch (err) {
    console.error('[R2][ERROR] Delete failed', err);
    throw err;
  }
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
