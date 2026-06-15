/**
 * Download order tax invoice PDF to the device (Android DownloadManager notification).
 */

import { Platform, NativeModules } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { getConfig } from "@/config/env";
import { STORAGE_KEYS } from "@/constants";
import { getItem } from "@/utils/storage";

function invoiceFilename(formattedOrderId: string): string {
  const safe = formattedOrderId.replace(/[^\w-]+/g, "_");
  return `GatiMitra-Invoice-${safe}.pdf`;
}

function invoiceDownloadUrl(orderId: string): string {
  const base = getConfig().apiBaseUrl.replace(/\/$/, "");
  return `${base}/v1/orders/${encodeURIComponent(orderId)}/invoice.pdf`;
}

function isBlobUtilLinked(): boolean {
  if (Platform.OS !== "android") return false;
  return Boolean(
    NativeModules.ReactNativeBlobUtil ??
      (NativeModules as { RNFetchBlob?: unknown }).RNFetchBlob
  );
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getItem(STORAGE_KEYS.AUTH_TOKEN);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function downloadPdfAndroid(url: string, filename: string): Promise<void> {
  const headers = await authHeaders();

  if (isBlobUtilLinked()) {
    const ReactNativeBlobUtil = (await import("react-native-blob-util")).default;
    await ReactNativeBlobUtil.config({
      fileCache: true,
      appendExt: "pdf",
      addAndroidDownloads: {
        useDownloadManager: true,
        notification: true,
        title: filename,
        description: "Download complete.",
        mime: "application/pdf",
        mediaScannable: true,
        storeInDownloads: true,
      },
    }).fetch("GET", url, headers);
    return;
  }

  throw new Error(
    "Invoice download requires an updated GatiMitra app. Run: cd apps/customer_app && npx expo run:android"
  );
}

async function downloadPdfIos(url: string, filename: string): Promise<void> {
  const headers = await authHeaders();
  const dest = `${FileSystem.documentDirectory}${filename}`;
  const result = await FileSystem.downloadAsync(url, dest, { headers });
  if (result.status < 200 || result.status >= 300) {
    throw new Error("Could not download invoice.");
  }
}

async function downloadPdfWeb(url: string, filename: string): Promise<void> {
  const headers = await authHeaders();
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error("Could not download invoice.");
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

export async function downloadOrderInvoice(
  orderId: string,
  formattedOrderId?: string | null
): Promise<void> {
  const filename = invoiceFilename(formattedOrderId?.trim() || orderId);
  const url = invoiceDownloadUrl(orderId);

  if (Platform.OS === "web" && typeof document !== "undefined") {
    await downloadPdfWeb(url, filename);
    return;
  }

  if (Platform.OS === "android") {
    await downloadPdfAndroid(url, filename);
    return;
  }

  if (Platform.OS === "ios") {
    await downloadPdfIos(url, filename);
    return;
  }

  throw new Error("Invoice download is not supported on this device.");
}
