import { getRiderAppConfig } from "../../config/env";

/**
 * Cloudflare R2 Upload Helper
 *
 * Uploads via backend `/v1/storage/upload` (same bucket as dashboard).
 * DB should store stable proxy URLs: `/v1/attachments/proxy?key=...`
 */

export interface R2UploadResult {
  signedUrl: string;
  key: string;
  proxyUrl: string;
}

const UPLOAD_TIMEOUT_MS = 90_000;

function proxyUrlFromKey(key: string): string {
  return `/v1/attachments/proxy?key=${encodeURIComponent(key)}`;
}

/** Stable R2 keys — re-upload overwrites the same object (no duplicate files in bucket). */
export function buildRiderDocumentKey(
  riderId: string | number,
  docType: string,
  side: "front" | "back" | "single" = "single"
): string {
  const base = `riders/${riderId}/documents/${docType}`;
  if (side === "single") return `${base}/latest.jpg`;
  return `${base}/${side}.jpg`;
}

/** Selfie uses a dedicated folder (matches legacy dashboard layout). */
export function buildRiderSelfieKey(riderId: string | number): string {
  return `riders/${riderId}/documents/selfie/latest.jpg`;
}

/** Live delivery proof photo — one folder per order. */
export function buildOrderDeliveryProofKey(orderRef: string): string {
  const safe = String(orderRef).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "order";
  return `orders/${safe}/delivery-proof/${Date.now()}.jpg`;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function uploadToR2(
  fileUri: string,
  folder: "selfies" | "documents" | string,
  accessToken: string,
  fileName?: string
): Promise<R2UploadResult> {
  const config = getRiderAppConfig();
  const apiBaseUrl = config.apiBaseUrl;

  let key: string;
  if (fileName?.includes("/")) {
    key = fileName;
  } else {
    const finalFileName = fileName || `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
    key = `${folder}/${finalFileName}`;
  }

  const finalFileName = key.split("/").pop() || `${Date.now()}.jpg`;

  // Multipart uploads on mobile networks (LTE, moving, weak signal) fail transiently far more
  // often than JSON requests. Retry a few times with backoff before surfacing an error — this is
  // the main cause of the onboarding "Upload failed: Network request failed" that stalled the
  // PAN/selfie/DL steps. Each attempt rebuilds FormData (a consumed body can't be re-sent).
  const MAX_ATTEMPTS = 3;
  let uploadResponse: Response | null = null;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const body = new FormData();
    body.append("folder", folder);
    body.append("key", key);
    body.append("file", { uri: fileUri, type: "image/jpeg", name: finalFileName } as any);
    try {
      uploadResponse = await fetchWithTimeout(
        `${apiBaseUrl}/v1/storage/upload`,
        { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body },
        UPLOAD_TIMEOUT_MS
      );
      break; // got an HTTP response (ok or not) — stop retrying
    } catch (err) {
      lastErr = err;
      if (err instanceof Error && err.name === "AbortError") {
        // A timeout is unlikely to succeed on an immediate retry — fail fast.
        throw new Error("Upload timed out. Check your network and try again.");
      }
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 700 * attempt)); // 0.7s, 1.4s backoff
        continue;
      }
    }
  }
  if (!uploadResponse) {
    throw new Error(
      lastErr instanceof Error
        ? `Upload failed after ${MAX_ATTEMPTS} attempts: ${lastErr.message}. Check your internet connection and try again.`
        : "Upload failed. Check your internet connection and try again."
    );
  }

  const rawText = await uploadResponse.text().catch(() => "");
  let payload: Record<string, unknown> = {};
  try {
    payload = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
  } catch {
    payload = {};
  }

  if (!uploadResponse.ok) {
    const message =
      (typeof payload.message === "string" && payload.message) ||
      (typeof payload.error === "string" && payload.error) ||
      rawText ||
      "Failed to upload to R2";
    throw new Error(message);
  }

  const signedUrl = String(payload.signedUrl ?? "");
  const resultKey = String(payload.key ?? key);
  const proxyUrl =
    (typeof payload.proxyUrl === "string" && payload.proxyUrl) || proxyUrlFromKey(resultKey);

  if (!resultKey) {
    throw new Error("Upload succeeded but server returned no storage key");
  }

  return {
    signedUrl,
    key: resultKey,
    proxyUrl,
  };
}

export async function getR2SignedUrl(
  key: string,
  accessToken: string,
  expiresIn: number = 3600
): Promise<string> {
  const config = getRiderAppConfig();
  const apiBaseUrl = config.apiBaseUrl;

  const response = await fetchWithTimeout(
    `${apiBaseUrl}/v1/storage/signed-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ key, expiresIn }),
    },
    30_000
  );

  if (!response.ok) {
    throw new Error("Failed to get signed URL");
  }

  const { signedUrl } = (await response.json()) as { signedUrl: string };
  return signedUrl;
}

export async function deleteFromR2(key: string, accessToken: string): Promise<void> {
  const config = getRiderAppConfig();
  const apiBaseUrl = config.apiBaseUrl;

  const response = await fetchWithTimeout(
    `${apiBaseUrl}/v1/storage/delete`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ key }),
    },
    30_000
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Delete failed" }));
    throw new Error((error as { message?: string }).message || "Failed to delete from R2");
  }
}
