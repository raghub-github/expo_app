import {
  buildRiderSelfieKey,
  deleteFromR2,
  uploadToR2,
} from "@/src/services/storage/cloudflareR2";
import { postJson } from "@/src/services/http";
import { getRiderAppConfig } from "@/src/config/env";

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

export async function uploadRiderSelfieDocument(opts: {
  riderId: number;
  localUri: string;
  accessToken: string;
}): Promise<string> {
  const { riderId, localUri, accessToken } = opts;
  const uploadedKeys: string[] = [];

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
      },
      { headers: { authorization: `Bearer ${accessToken}` } }
    );

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
