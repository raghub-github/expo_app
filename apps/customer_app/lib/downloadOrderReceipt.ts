/**
 * Download order summary receipt (Bill Summary) — Zomato-style HTML → PDF via expo-print.
 * Separate from tax invoice PDF at /invoice.pdf (bottom Invoice button).
 */

import { Platform, NativeModules } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { orderService } from "@/services/order.service";

function receiptFilename(formattedOrderId: string): string {
  const safe = formattedOrderId.replace(/[^\w-]+/g, "_");
  return `GatiMitra-Order-Receipt-${safe}.pdf`;
}

function isBlobUtilLinked(): boolean {
  if (Platform.OS !== "android") return false;
  return Boolean(
    NativeModules.ReactNativeBlobUtil ??
      (NativeModules as { RNFetchBlob?: unknown }).RNFetchBlob
  );
}

async function savePdfAndroid(fileUri: string, filename: string): Promise<void> {
  if (!isBlobUtilLinked()) {
    throw new Error(
      "Receipt download requires an updated GatiMitra app. Run: cd apps/customer_app && npx expo run:android"
    );
  }
  const ReactNativeBlobUtil = (await import("react-native-blob-util")).default;
  const path = `${ReactNativeBlobUtil.fs.dirs.DownloadDir}/${filename}`;
  await ReactNativeBlobUtil.fs.cp(fileUri.replace("file://", ""), path);
  await ReactNativeBlobUtil.android.addCompleteDownload({
    title: filename,
    description: "Download complete.",
    mime: "application/pdf",
    path,
    showNotification: true,
  });
}

async function savePdfIos(fileUri: string, filename: string): Promise<void> {
  const dest = `${FileSystem.documentDirectory}${filename}`;
  await FileSystem.copyAsync({ from: fileUri, to: dest });
  const Sharing = await import("expo-sharing");
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(dest, {
      mimeType: "application/pdf",
      dialogTitle: filename,
      UTI: "com.adobe.pdf",
    });
  }
}

async function htmlToPdfUri(html: string): Promise<string> {
  const Print = await import("expo-print");
  const { uri } = await Print.printToFileAsync({ html });
  return uri;
}

export async function downloadOrderReceipt(
  orderId: string,
  formattedOrderId?: string | null
): Promise<void> {
  const filename = receiptFilename(formattedOrderId?.trim() || orderId);
  const { html } = await orderService.fetchOrderReceipt(orderId);

  if (Platform.OS === "web" && typeof window !== "undefined") {
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      w.focus();
      w.print();
    }
    return;
  }

  const pdfUri = await htmlToPdfUri(html);

  if (Platform.OS === "android") {
    await savePdfAndroid(pdfUri, filename);
    return;
  }

  if (Platform.OS === "ios") {
    await savePdfIos(pdfUri, filename);
    return;
  }

  throw new Error("Receipt download is not supported on this device.");
}
