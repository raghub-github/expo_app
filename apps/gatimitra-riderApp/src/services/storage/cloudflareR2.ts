import { getRiderAppConfig } from "../../config/env";

/**
 * Cloudflare R2 Upload Helper
 * 
 * Uploads images to Cloudflare R2 bucket and returns signed URL.
 * The signed URL is what gets stored in the database, not the raw image.
 */

export interface R2UploadResult {
  signedUrl: string;
  key: string;
}

/**
 * Upload image to Cloudflare R2
 * 
 * @param fileUri - Local file URI (from camera or image picker)
 * @param folder - Folder path in R2 bucket (e.g., "selfies", "documents")
 * @param accessToken - Session access token for authorization
 * @param fileName - Optional custom filename, otherwise generates UUID
 * @returns Signed URL and key
 */
export async function uploadToR2(
  fileUri: string,
  folder: "selfies" | "documents",
  accessToken: string,
  fileName?: string
): Promise<R2UploadResult> {
  const config = getRiderAppConfig();
  const apiBaseUrl = config.apiBaseUrl;
  
  // Generate filename if not provided
  const finalFileName = fileName || `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
  const key = `${folder}/${finalFileName}`;
  
  // Create FormData for React Native
  const formData = new FormData();
  
  // React Native FormData format
  formData.append("file", {
    uri: fileUri,
    type: "image/jpeg",
    name: finalFileName,
  } as any);
  
  formData.append("folder", folder);
  formData.append("key", key);
  
  // Upload via backend endpoint
  const uploadResponse = await fetch(`${apiBaseUrl}/v1/storage/upload`, {
    method: "POST",
    headers: {
      // Don't set Content-Type - let fetch set it with boundary for multipart
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });
  
  if (!uploadResponse.ok) {
    const error = await uploadResponse.json().catch(() => ({ message: "Upload failed" }));
    throw new Error(error.message || "Failed to upload to R2");
  }
  
  const result = await uploadResponse.json() as R2UploadResult;
  return result;
}

/**
 * Get signed URL for existing R2 object (for viewing)
 */
export async function getR2SignedUrl(
  key: string,
  accessToken: string,
  expiresIn: number = 3600
): Promise<string> {
  const config = getRiderAppConfig();
  const apiBaseUrl = config.apiBaseUrl;
  
  const response = await fetch(`${apiBaseUrl}/v1/storage/signed-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ key, expiresIn }),
  });
  
  if (!response.ok) {
    throw new Error("Failed to get signed URL");
  }
  
  const { signedUrl } = await response.json() as { signedUrl: string };
  return signedUrl;
}

