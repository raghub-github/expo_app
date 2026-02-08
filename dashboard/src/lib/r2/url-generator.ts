/**
 * R2 Signed URL Generator
 * Auto-generates and renews signed URLs for R2 stored documents
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// R2 Configuration from environment variables
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'rider-documents';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL; // Optional: if using public URL

// Validate configuration
const isR2Configured = R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY;

// Initialize R2 client
let r2Client: S3Client | null = null;
if (isR2Configured) {
  r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID!,
      secretAccessKey: R2_SECRET_ACCESS_KEY!,
    },
  });
}

/**
 * Generate a signed URL for an R2 object
 * @param r2Key - The R2 storage key (path in bucket)
 * @param expiresIn - Expiry time in seconds (default: 3600 = 1 hour)
 * @returns Signed URL or original key if R2 not configured
 */
export async function generateSignedUrl(
  r2Key: string,
  expiresIn: number = 3600
): Promise<string> {
  if (!r2Key) return '';
  
  // If R2 is not configured, return the key as-is (fallback)
  if (!r2Client || !isR2Configured) {
    console.warn('R2 not configured. Returning original key.');
    return r2Key;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: r2Key,
    });

    const url = await getSignedUrl(r2Client, command, { expiresIn });
    return url;
  } catch (error) {
    console.error('Error generating R2 signed URL:', error);
    // Fallback to original key or public URL if available
    if (R2_PUBLIC_URL) {
      return `${R2_PUBLIC_URL}/${r2Key}`;
    }
    return r2Key;
  }
}

/**
 * Batch generate signed URLs for multiple R2 keys
 * @param r2Keys - Array of R2 storage keys
 * @param expiresIn - Expiry time in seconds
 * @returns Object mapping r2Key to signed URL
 */
export async function batchGenerateSignedUrls(
  r2Keys: string[],
  expiresIn: number = 3600
): Promise<Record<string, string>> {
  const urls: Record<string, string> = {};
  
  if (!r2Keys || r2Keys.length === 0) return urls;

  // Filter out empty keys
  const validKeys = r2Keys.filter(key => key && key.trim() !== '');
  
  if (validKeys.length === 0) return urls;

  // Generate URLs in parallel
  await Promise.all(
    validKeys.map(async (key) => {
      try {
        urls[key] = await generateSignedUrl(key, expiresIn);
      } catch (error) {
        console.error(`Error generating signed URL for ${key}:`, error);
        urls[key] = key; // Fallback to original key
      }
    })
  );
  
  return urls;
}

/**
 * Check if a signed URL is expired or needs renewal
 * @param url - The signed URL to check
 * @param renewalThreshold - Time in seconds before expiry to trigger renewal (default: 1800 = 30 minutes)
 * @returns true if URL needs renewal
 */
export function needsUrlRenewal(
  url: string,
  renewalThreshold: number = 1800
): boolean {
  if (!url || url.trim() === '') return true;

  try {
    const urlObj = new URL(url);
    
    // Check for common signed URL parameters
    const expiresParam = 
      urlObj.searchParams.get('X-Amz-Expires') || 
      urlObj.searchParams.get('Expires') ||
      urlObj.searchParams.get('x-amz-expires');
    
    const dateParam = 
      urlObj.searchParams.get('X-Amz-Date') ||
      urlObj.searchParams.get('x-amz-date');
    
    if (!expiresParam || !dateParam) {
      // No expiry info found, assume it needs renewal
      return true;
    }
    
    // Parse the date (format: YYYYMMDDTHHMMSSZ)
    const year = parseInt(dateParam.substring(0, 4));
    const month = parseInt(dateParam.substring(4, 6)) - 1; // JS months are 0-indexed
    const day = parseInt(dateParam.substring(6, 8));
    const hour = parseInt(dateParam.substring(9, 11));
    const minute = parseInt(dateParam.substring(11, 13));
    const second = parseInt(dateParam.substring(13, 15));
    
    const signedDate = new Date(Date.UTC(year, month, day, hour, minute, second));
    const expiresInSeconds = parseInt(expiresParam);
    const expiresAt = signedDate.getTime() + (expiresInSeconds * 1000);
    
    const now = Date.now();
    const timeUntilExpiry = expiresAt - now;
    const thresholdMs = renewalThreshold * 1000;
    
    // Renew if expires in less than threshold time
    return timeUntilExpiry < thresholdMs;
  } catch (error) {
    console.error('Error checking URL expiry:', error);
    return true; // If we can't parse the URL, assume it needs renewal
  }
}

/**
 * Refresh document URLs if they need renewal
 * @param documents - Array of documents with fileUrl and r2Key
 * @returns Documents with refreshed URLs
 */
export async function refreshDocumentUrls<T extends { fileUrl: string; r2Key?: string | null }>(
  documents: T[]
): Promise<T[]> {
  if (!documents || documents.length === 0) return documents;

  // Find documents that need URL renewal
  const docsNeedingRenewal = documents.filter(doc => 
    doc.r2Key && 
    (!doc.fileUrl || needsUrlRenewal(doc.fileUrl))
  );

  if (docsNeedingRenewal.length === 0) return documents;

  // Get fresh signed URLs
  const r2Keys = docsNeedingRenewal
    .map(doc => doc.r2Key)
    .filter((key): key is string => !!key);
  
  const freshUrls = await batchGenerateSignedUrls(r2Keys);

  // Update documents with fresh URLs
  return documents.map(doc => {
    if (doc.r2Key && freshUrls[doc.r2Key]) {
      return { ...doc, fileUrl: freshUrls[doc.r2Key] };
    }
    return doc;
  });
}

/**
 * Get time until URL expires in human-readable format
 * @param url - The signed URL
 * @returns String like "30 minutes" or "2 hours" or null if can't determine
 */
export function getUrlExpiryTime(url: string): string | null {
  if (!url) return null;

  try {
    const urlObj = new URL(url);
    const expiresParam = urlObj.searchParams.get('X-Amz-Expires') || urlObj.searchParams.get('Expires');
    const dateParam = urlObj.searchParams.get('X-Amz-Date');
    
    if (!expiresParam || !dateParam) return null;
    
    const year = parseInt(dateParam.substring(0, 4));
    const month = parseInt(dateParam.substring(4, 6)) - 1;
    const day = parseInt(dateParam.substring(6, 8));
    const hour = parseInt(dateParam.substring(9, 11));
    const minute = parseInt(dateParam.substring(11, 13));
    const second = parseInt(dateParam.substring(13, 15));
    
    const signedDate = new Date(Date.UTC(year, month, day, hour, minute, second));
    const expiresInSeconds = parseInt(expiresParam);
    const expiresAt = signedDate.getTime() + (expiresInSeconds * 1000);
    
    const now = Date.now();
    const timeUntilExpiry = expiresAt - now;
    
    if (timeUntilExpiry < 0) return 'Expired';
    
    const minutes = Math.floor(timeUntilExpiry / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    return 'Less than a minute';
  } catch {
    return null;
  }
}
