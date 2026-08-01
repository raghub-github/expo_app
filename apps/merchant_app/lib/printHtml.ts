import { Platform } from "react-native";
import { printHtmlDocument } from "@gatimitra/print-utils";

const PT_PER_MM = 72 / 25.4;
/** Cap a receipt page at A4 height; thermal rolls just keep feeding. */
const RECEIPT_PAGE_HEIGHT_PT = Math.round(297 * PT_PER_MM);

export type PrintHtmlOptions = {
  /** Thermal roll width, so the receipt keeps its physical size on paper. */
  pageWidthMm?: number | null;
};

/**
 * expo-print rejects overlapping jobs, and a second render started while the
 * first one is still laying out can take the whole process down.
 */
let printInFlight = false;

/**
 * Print HTML using the same pipeline everywhere:
 * - Web: hidden iframe (Partner Site parity)
 * - Native: expo-print
 */
export async function printHtml(html: string, options?: PrintHtmlOptions): Promise<void> {
  if (Platform.OS === "web" && typeof document !== "undefined") {
    printHtmlDocument(html);
    return;
  }
  if (printInFlight) return;
  printInFlight = true;
  try {
    const Print = await import("expo-print");
    const widthMm = options?.pageWidthMm ?? null;
    const page =
      widthMm && widthMm > 0
        ? { width: Math.round(widthMm * PT_PER_MM), height: RECEIPT_PAGE_HEIGHT_PT }
        : {};
    // Handing `html` straight to printAsync leaves the print adapter bound to a
    // WebView that expo-print stops retaining once the promise resolves, which
    // crashes natively on receipts that embed the pickup QR. Rendering the PDF
    // first keeps that WebView alive for the whole render.
    const file = await Print.printToFileAsync({ html, ...page });
    await Print.printAsync({ uri: file.uri });
  } finally {
    printInFlight = false;
  }
}
