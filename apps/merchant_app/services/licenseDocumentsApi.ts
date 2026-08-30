import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";
import * as SecureStore from "expo-secure-store";

function getBase(): string {
  try {
    const config = getConfig();
    const url = config?.apiBaseUrl;
    if (typeof url === "string" && url.trim()) return url.trim().replace(/\/+$/, "");
  } catch {
    /* ignore */
  }
  if (!__DEV__) return "https://api.gatimitra.com";
  return "http://localhost:3000";
}

export type MerchantDocumentPrefix =
  | "pan"
  | "gst"
  | "aadhaar"
  | "fssai"
  | "drug_license"
  | "shop_establishment"
  | "trade_license"
  | "udyam"
  | "pharmacist_certificate"
  | "pharmacy_council_registration"
  | "other";

export type LicenseDocumentActionItem = {
  prefix: MerchantDocumentPrefix;
  label: string;
  status: "expired" | "pending_verification" | "expiring_soon" | "ok";
  expiry_date?: string | null;
  document_number?: string | null;
};

export type LicenseDocumentsStatus = {
  license_blocked: boolean;
  license_expired_documents: LicenseDocumentActionItem[];
  license_pending_verification: LicenseDocumentActionItem[];
  action_items: LicenseDocumentActionItem[];
  uploadable_items: LicenseDocumentActionItem[];
};

const statusInflight = new Map<number, Promise<LicenseDocumentsStatus>>();

export async function fetchLicenseDocumentsStatus(
  storeId: number,
  token: string
): Promise<LicenseDocumentsStatus> {
  const existing = statusInflight.get(storeId);
  if (existing) return existing;

  const promise = (async () => {
    const res = await authFetch(
      `${getBase()}/v1/merchant-partner/stores/${storeId}/license-documents/status`,
      token
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof (body as { error?: string }).error === "string"
          ? (body as { error: string }).error
          : "Could not load licence status"
      );
    }
    return body as LicenseDocumentsStatus;
  })();

  statusInflight.set(storeId, promise);
  try {
    return await promise;
  } finally {
    statusInflight.delete(storeId);
  }
}

export async function uploadLicenseDocument(
  storeId: number,
  token: string,
  params: {
    docType: MerchantDocumentPrefix;
    fileUri: string;
    fileName?: string;
    mimeType?: string;
    documentNumber?: string;
    issueDate?: string;
    expiryDate?: string;
    side?: "front" | "back";
  }
): Promise<{ success: boolean; message?: string }> {
  const cleanUri = String(params.fileUri || "").trim();
  if (!cleanUri) throw new Error("File URI missing");

  let name =
    (params.fileName && params.fileName.trim()) ||
    cleanUri.split("/").pop()?.split("?")[0] ||
    `licence-${Date.now()}.jpg`;
  let mimeType = (params.mimeType && params.mimeType.trim()) || "image/jpeg";
  if (cleanUri.startsWith("content://") && mimeType === "application/octet-stream") {
    mimeType = "image/jpeg";
  }
  if (!/\.[a-z0-9]{2,6}$/i.test(name)) {
    name = mimeType.includes("pdf") ? `${name}.pdf` : `${name}.jpg`;
  }

  const formData = new FormData();
  formData.append("docType", params.docType);
  formData.append("side", params.side ?? "front");
  if (params.documentNumber?.trim()) formData.append("document_number", params.documentNumber.trim());
  if (params.issueDate?.trim()) formData.append("issue_date", params.issueDate.trim());
  if (params.expiryDate?.trim()) formData.append("expiry_date", params.expiryDate.trim());
  formData.append("file", { uri: cleanUri, name, type: mimeType } as any);

  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/license-documents/upload`,
    token,
    { method: "POST", body: formData }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof (body as { error?: string; message?: string }).error === "string"
        ? (body as { error: string }).error
        : typeof (body as { message?: string }).message === "string"
          ? (body as { message: string }).message
          : "Upload failed"
    );
  }
  return body as { success: boolean; message?: string };
}

function licenseWatchKey(storeId: number): string {
  return `mx_license_verify_watch_${storeId}`;
}

export async function markLicenseVerificationWatch(storeId: number): Promise<void> {
  try {
    await SecureStore.setItemAsync(licenseWatchKey(storeId), "1");
  } catch {
    /* ignore */
  }
}

export async function clearLicenseVerificationWatch(storeId: number): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(licenseWatchKey(storeId));
  } catch {
    /* ignore */
  }
}

export async function isLicenseVerificationWatched(storeId: number): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(licenseWatchKey(storeId))) === "1";
  } catch {
    return false;
  }
}
