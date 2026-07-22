import { Platform } from "react-native";
import { printHtmlDocument } from "@gatimitra/print-utils";

/**
 * Print HTML using the same pipeline everywhere:
 * - Web: hidden iframe (Partner Site parity)
 * - Native: expo-print
 */
export async function printHtml(html: string): Promise<void> {
  if (Platform.OS === "web" && typeof document !== "undefined") {
    printHtmlDocument(html);
    return;
  }
  const Print = await import("expo-print");
  await Print.printAsync({ html });
}
