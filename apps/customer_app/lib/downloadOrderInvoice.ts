/**
 * Download order tax invoice PDF to the device (Android DownloadManager notification).
 * Parcel orders use the ride-style fare invoice from GET /v1/orders/:id/invoice.pdf.
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

async function readInvoiceErrorMessage(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return "Could not download invoice.";
    try {
      const json = JSON.parse(text) as { message?: string; error?: string };
      return (
        (typeof json.message === "string" && json.message.trim()) ||
        (typeof json.error === "string" && json.error.trim()) ||
        "Could not download invoice."
      );
    } catch {
      return text.slice(0, 180) || "Could not download invoice.";
    }
  } catch {
    return "Could not download invoice.";
  }
}

async function fetchInvoicePdfBytes(url: string): Promise<ArrayBuffer> {
  const headers = await authHeaders();
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(await readInvoiceErrorMessage(response));
  }
  return response.arrayBuffer();
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  if (typeof btoa === "function") return btoa(binary);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Buffer } = require("buffer") as typeof import("buffer");
  return Buffer.from(bytes).toString("base64");
}

async function writePdfToCache(filename: string, bytes: ArrayBuffer): Promise<string> {
  const dest = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(dest, arrayBufferToBase64(bytes), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return dest;
}

async function sharePdfUri(fileUri: string, filename: string): Promise<void> {
  const Sharing = await import("expo-sharing");
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: "application/pdf",
      dialogTitle: filename,
      UTI: "com.adobe.pdf",
    });
  }
}

async function downloadPdfAndroid(url: string, filename: string): Promise<void> {
  if (isBlobUtilLinked()) {
    const headers = await authHeaders();
    const ReactNativeBlobUtil = (await import("react-native-blob-util")).default;
    const res = await ReactNativeBlobUtil.config({
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

    const status = res.info()?.status ?? 0;
    if (status < 200 || status >= 300) {
      let message = "Could not download invoice.";
      try {
        const json = JSON.parse(await res.text()) as { message?: string; error?: string };
        message =
          (typeof json.message === "string" && json.message.trim()) ||
          (typeof json.error === "string" && json.error.trim()) ||
          message;
      } catch {
        /* keep default */
      }
      throw new Error(message);
    }
    return;
  }

  // Expo Go / unlinked native module — write to cache and open the share sheet.
  const bytes = await fetchInvoicePdfBytes(url);
  const fileUri = await writePdfToCache(filename, bytes);
  await sharePdfUri(fileUri, filename);
}

async function downloadPdfIos(url: string, filename: string): Promise<void> {
  const headers = await authHeaders();
  const dest = `${FileSystem.documentDirectory}${filename}`;
  const result = await FileSystem.downloadAsync(url, dest, { headers });
  if (result.status < 200 || result.status >= 300) {
    let message = "Could not download invoice.";
    try {
      const text = await FileSystem.readAsStringAsync(dest);
      const json = JSON.parse(text) as { message?: string; error?: string };
      message =
        (typeof json.message === "string" && json.message.trim()) ||
        (typeof json.error === "string" && json.error.trim()) ||
        message;
    } catch {
      /* keep default */
    }
    throw new Error(message);
  }
  await sharePdfUri(dest, filename);
}

async function downloadPdfWeb(url: string, filename: string): Promise<void> {
  const bytes = await fetchInvoicePdfBytes(url);
  const blob = new Blob([bytes], { type: "application/pdf" });
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
