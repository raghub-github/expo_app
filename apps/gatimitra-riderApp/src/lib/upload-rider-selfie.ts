import {
  buildRiderSelfieKey,
  deleteFromR2,
  uploadToR2,
} from "@/src/services/storage/cloudflareR2";
import { postJson } from "@/src/services/http";
import { getRiderAppConfig } from "@/src/config/env";
import { useOnboardingStore } from "@/src/stores/onboardingStore";

const API_BASE = () => getRiderAppConfig().apiBaseUrl;

function documentFileEntry(upload: { proxyUrl: string; key: string }) {
  return [
    {
      side: "single" as const,
      fileUrl: upload.proxyUrl,
      r2Key: upload.key,
      mimeType: "image/jpeg",
    },
  ];
}

function extractR2KeyFromProxyOrUrl(raw: string | null | undefined): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (value.startsWith("riders/")) return value;
  try {
    const u = new URL(value, "https://local.invalid");
    const key = u.searchParams.get("key");
    if (key?.trim()) return key.trim();
  } catch {
    /* ignore */
  }
  const marker = "/riders/";
  const idx = value.indexOf(marker);
  if (idx >= 0) {
    const rest = value.slice(idx + 1);
    return rest.split("?")[0] || null;
  }
  return null;
}

export async function uploadRiderSelfieDocument(opts: {
  riderId: number;
  localUri: string;
  accessToken: string;
  /** Previous selfie URL/key — deleted from R2 after successful replace. */
  previousSelfieUrl?: string | null;
}): Promise<string> {
  const { riderId, localUri, accessToken, previousSelfieUrl } = opts;
  const uploadedKeys: string[] = [];

  const fromStore = useOnboardingStore.getState().data;
  const previousKey =
    extractR2KeyFromProxyOrUrl(previousSelfieUrl) ||
    extractR2KeyFromProxyOrUrl(fromStore.selfieSignedUrl) ||
    extractR2KeyFromProxyOrUrl(fromStore.selfieUri);

  try {
    const upload = await uploadToR2(
      localUri,
      "documents",
      accessToken,
      buildRiderSelfieKey(riderId)
    );
    uploadedKeys.push(upload.key);

    await postJson(
      `${API_BASE()}/v1/rider/onboarding/save-document`,
      {
        riderId,
        docType: "selfie",
        fileUrl: upload.proxyUrl,
        r2Key: upload.key,
        files: documentFileEntry(upload),
        autoVerify: true,
      },
      { headers: { authorization: `Bearer ${accessToken}` } }
    );

    // Belt-and-suspenders: backend also deletes replaced keys; clear any leftover old object.
    if (previousKey && previousKey !== upload.key) {
      try {
        await deleteFromR2(previousKey, accessToken);
      } catch {
        /* non-fatal — backend save-document also sweeps old keys */
      }
    }

    return upload.proxyUrl;
  } catch (error) {
    for (const key of uploadedKeys) {
      try {
        await deleteFromR2(key, accessToken);
      } catch {
        // best-effort rollback
      }
    }
    throw error;
  }
}
