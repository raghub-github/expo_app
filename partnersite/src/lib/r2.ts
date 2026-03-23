

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
  
  const ep = config.endpoint || '';
  const forcePathStyle =
    String(process.env.R2_S3_FORCE_PATH_STYLE || '').toLowerCase() === 'true' ||
    /\.r2\.cloudflarestorage\.com/i.test(ep);

  s3Client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
    forcePathStyle,
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
 * Fix object keys that accidentally contain `docs/docs/` (bad URL extraction, double prefix).
 * Does not strip a single `docs/` — existing objects may legitimately use `docs/merchants/...` as the key.
 */
export function normalizeR2ObjectKey(key: string): string {
  let k = (key || "").trim().replace(/^\/+/, "");
  while (k.toLowerCase().startsWith("docs/docs/")) {
    k = k.slice(5);
  }
  return k;
}

/**
 * Unwraps accidentally nested `/api/attachments/proxy?key=...` values (single URL-encoded `key` param
 * that itself was a full proxy URL). Returns the innermost R2 object key.
 */
function unwrapProxyQueryKeyParam(initial: string): string {
  let k = initial.trim();
  for (let depth = 0; depth < 8; depth++) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(k);
    } catch {
      decoded = k;
    }
    const lower = decoded.toLowerCase();
    if (!lower.includes("attachments/proxy")) {
      return normalizeR2ObjectKey(decoded);
    }
    try {
      const u = new URL(
        decoded.startsWith("http://") || decoded.startsWith("https://")
          ? decoded
          : decoded.startsWith("/")
            ? `http://dummy.local${decoded}`
            : `http://dummy.local/${decoded}`
      );
      const inner = u.searchParams.get("key");
      if (inner && inner !== decoded) {
        k = inner;
        continue;
      }
    } catch {
      /* fall through */
    }
    const m = decoded.match(/[?&]key=([^&]+)/);
    if (!m) return normalizeR2ObjectKey(decoded);
    try {
      const next = decodeURIComponent(m[1].replace(/\+/g, "%20"));
      if (!next || next === k || next === decoded) return normalizeR2ObjectKey(decoded);
      k = next;
    } catch {
      return normalizeR2ObjectKey(decoded);
    }
  }
  return normalizeR2ObjectKey(k);
}

/**
 * Extracts the R2 object key from a full image URL
 * Handles various URL formats and extracts the path after the base URL
 */
export function extractR2KeyFromUrl(imageUrl: string): string | null {
  if (!imageUrl) return null;
  
  try {
    const normalizedImageUrl = imageUrl.trim();

    // Proxy URL (Next.js dashboard/partnersite or Fastify backend), extract key from query param
    if (
      (normalizedImageUrl.includes('/api/attachments/proxy') ||
        normalizedImageUrl.includes('/v1/attachments/proxy')) &&
      normalizedImageUrl.includes('key=')
    ) {
      try {
        const u = new URL(normalizedImageUrl, 'http://dummy');
        const k = u.searchParams.get('key');
        return (k && unwrapProxyQueryKeyParam(k)) || null;
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

/** R2 object key for deletes — `r2_key` / `public_url` / `menu_url` may be proxy (`/api/attachments/proxy?key=...`) or raw key. */
export function r2KeyFromMenuMediaRow(row: {
  menu_url?: string | null;
  public_url?: string | null;
  r2_key?: string | null;
}): string | null {
  const rk = row.r2_key?.trim();
  if (rk) {
    const fromRk = extractR2KeyFromUrl(rk);
    if (fromRk) return normalizeR2ObjectKey(fromRk);
    if (!/^https?:\/\//i.test(rk) && !rk.startsWith("/api/")) {
      return normalizeR2ObjectKey(rk);
    }
  }
  const fromMenu = row.menu_url ? extractR2KeyFromUrl(row.menu_url) : null;
  const fromPub = row.public_url ? extractR2KeyFromUrl(row.public_url) : null;
  if (fromMenu) return normalizeR2ObjectKey(fromMenu);
  if (fromPub) return normalizeR2ObjectKey(fromPub);
  return null;
}

/** True when pathname (after optional `{bucket}/` prefix) is our merchant object layout. */
function isMerchantR2ObjectPath(pathNoLeadingSlash: string): boolean {
  let path = pathNoLeadingSlash.replace(/^\/+/, "");
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  if (bucket && path.length >= bucket.length + 1) {
    const prefix = `${bucket}/`;
    if (path.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase()) {
      path = path.slice(prefix.length);
    }
  }
  if (path.startsWith("docs/merchants/")) return true;
  if (/^merchants\/[^/]+\/(stores|draft|logo)\b/i.test(path)) return true;
  if (path.includes("docs/merchants/")) return true;
  return false;
}

/** R2 public / S3-style URLs whose object key we can derive for stable proxy storage. */
export function isR2HostedHttpUrl(trimmed: string): boolean {
  try {
    const u = new URL(trimmed);
    const h = u.hostname.toLowerCase();
    if (h.endsWith(".r2.dev")) return true;
    if (h.endsWith(".r2.cloudflarestorage.com")) return true;
    const base = process.env.R2_PUBLIC_BASE_URL?.trim();
    if (base) {
      try {
        const bu = new URL(base);
        if (bu.hostname === h) return true;
      } catch {
        /* ignore */
      }
    }
    const path = u.pathname.replace(/^\/+/, "");
    return isMerchantR2ObjectPath(path);
  } catch {
    return false;
  }
}

/** Pathname → object key for PutObject/GetObject (strip optional bucket prefix from path-style R2 URLs). */
function objectKeyForProxyFromHttpUrl(trimmed: string): string | null {
  if (!isR2HostedHttpUrl(trimmed)) return null;
  const extracted = extractR2KeyFromUrl(trimmed);
  if (!extracted) return null;
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  let k = normalizeR2ObjectKey(extracted);
  if (bucket) {
    const prefix = `${bucket}/`;
    if (k.startsWith(prefix)) k = normalizeR2ObjectKey(k.slice(prefix.length));
  }
  return k || null;
}

/**
 * Converts an R2 key, proxy URL, or R2 HTTPS URL (incl. presigned) into a storable URL.
 * Prefers `/api/attachments/proxy?key=...` so DB rows do not expire (unlike presigned URLs).
 * Non-R2 https URLs (e.g. third-party) are left unchanged.
 */
export function toStoredDocumentUrl(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Same-origin or absolute app URL: normalize to relative proxy (stable in DB).
  if (trimmed.includes("/api/attachments/proxy") && trimmed.includes("key=")) {
    const k = extractR2KeyFromUrl(trimmed);
    if (k) return `/api/attachments/proxy?key=${encodeURIComponent(normalizeR2ObjectKey(k))}`;
  }
  if (trimmed.startsWith("/api/attachments/proxy")) return trimmed;
  if (trimmed.includes("://")) {
    const key = objectKeyForProxyFromHttpUrl(trimmed);
    if (key) {
      return `/api/attachments/proxy?key=${encodeURIComponent(key)}`;
    }
    return trimmed;
  }
  const key = normalizeR2ObjectKey(trimmed.replace(/^\/+/, ""));
  return `/api/attachments/proxy?key=${encodeURIComponent(key)}`;
}

/**
 * Normalize onboarding/store media (banner, gallery, logo) to `/api/attachments/proxy?key=...`.
 * Handles presigned HTTPS URLs, path-style `bucket/docs/...` paths, and raw keys.
 * Drops transient client URLs (blob, data).
 */
export function normalizeMerchantStoreMediaUrl(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const t = value.trim();
  if (!t || t.startsWith("data:") || t.startsWith("blob:")) return null;
  if (t.includes("/api/attachments/proxy") && t.includes("key=")) {
    const k = extractR2KeyFromUrl(t);
    if (k) return `/api/attachments/proxy?key=${encodeURIComponent(normalizeR2ObjectKey(k))}`;
  }
  if (t.startsWith("/api/attachments/proxy")) return t;
  const viaToStored = toStoredDocumentUrl(t) ?? t;
  if (viaToStored.startsWith("/api/attachments/proxy")) return viaToStored;
  let k =
    extractR2KeyFromUrl(t) ||
    (!t.includes("://") ? normalizeR2ObjectKey(t.replace(/^\/+/, "")) : null);
  if (!k) return viaToStored.includes("://") ? viaToStored : null;
  k = normalizeR2ObjectKey(k);
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  if (bucket) {
    const prefix = `${bucket}/`;
    if (k.length >= prefix.length && k.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase()) {
      k = normalizeR2ObjectKey(k.slice(prefix.length));
    }
  }
  if (isMerchantR2ObjectPath(k)) {
    return `/api/attachments/proxy?key=${encodeURIComponent(k)}`;
  }
  if (!t.includes("://")) {
    return `/api/attachments/proxy?key=${encodeURIComponent(k)}`;
  }
  return viaToStored;
}

/**
 * URL stored as `public_url` for R2 objects: full CDN/custom domain when `R2_PUBLIC_BASE_URL`
 * is set (e.g. https://pub-xxx.r2.dev), otherwise the app proxy (works when the bucket is private).
 */
export function publicUrlForR2Key(key: string): string {
  const trimmed = normalizeR2ObjectKey((key || "").trim().replace(/^\/+/, ""));
  if (!trimmed) return `/api/attachments/proxy?key=`;
  const base = process.env.R2_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  if (base) {
    return `${base}/${trimmed}`;
  }
  return `/api/attachments/proxy?key=${encodeURIComponent(trimmed)}`;
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
  const objectKey = normalizeR2ObjectKey(key);
  const s3 = getS3Client();
  const bucketName = getBucketName();
  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: objectKey,
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
  const raw = prefix.trim();
  const basePrefix = raw ? normalizeR2ObjectKey(raw) : "";
  const normalizedPrefix = basePrefix ? (basePrefix.endsWith("/") ? basePrefix : `${basePrefix}/`) : "";
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
  const objectKey = normalizeR2ObjectKey(key);
  const s3 = getS3Client();
  const bucketName = getBucketName();
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: objectKey,
  });
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}

const DEFAULT_MENU_SIGNED_URL_TTL_SEC = 86400 * 7;

/**
 * After a successful menu PutObject: presigned GET URL for `public_url` in DB.
 * Falls back to {@link publicUrlForR2Key} if signing fails.
 */
export async function signedPublicUrlForMenuR2Key(r2Key: string): Promise<string> {
  const trimmed = normalizeR2ObjectKey((r2Key || "").trim().replace(/^\/+/, ""));
  if (!trimmed) return publicUrlForR2Key(r2Key);
  const raw = process.env.R2_MENU_SIGNED_URL_TTL_SEC;
  const parsed = raw != null && String(raw).trim() !== "" ? Number(raw) : DEFAULT_MENU_SIGNED_URL_TTL_SEC;
  const ttl = Number.isFinite(parsed) && parsed >= 60 ? parsed : DEFAULT_MENU_SIGNED_URL_TTL_SEC;
  try {
    return await getR2SignedUrl(trimmed, ttl);
  } catch (e) {
    console.warn("[R2] Menu signed URL failed, using proxy/public base URL:", e);
    return publicUrlForR2Key(trimmed);
  }
}

export async function uploadToR2(
  file: File,
  key: string,
  contentTypeOverride?: string | null
): Promise<string> {
  const objectKey = normalizeR2ObjectKey(key);
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
  const contentType =
    (contentTypeOverride && String(contentTypeOverride).trim()) ||
    ((file as any).type && String((file as any).type).trim()) ||
    'application/octet-stream';
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: objectKey,
    Body: body,
    ContentType: contentType,
  });
  await s3.send(command);
  return objectKey;
}

/** S3 PutObject via R2 — same as `uploadToR2` (buffer from file/blob). */
export async function uploadWithKey(
  file: File,
  r2Key: string,
  contentTypeOverride?: string | null
): Promise<string> {
  return uploadToR2(file, r2Key, contentTypeOverride);
}
