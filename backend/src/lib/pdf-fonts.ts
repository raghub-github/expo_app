import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type PDFDocument from "pdfkit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PDF_FONT_REGULAR = "DejaVuSans";
export const PDF_FONT_BOLD = "DejaVuSans-Bold";

function isValidTtf(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size < 10_000) return false;
    const head = fs.readFileSync(filePath).subarray(0, 4);
    return head[0] === 0x00 && head[1] === 0x01 && head[2] === 0x00 && head[3] === 0x00;
  } catch {
    return false;
  }
}

function resolveFontPath(filename: string): string {
  const candidates = [
    path.resolve(__dirname, "../../assets/fonts", filename),
    path.resolve(process.cwd(), "assets/fonts", filename),
    path.resolve(process.cwd(), "backend/assets/fonts", filename),
  ];
  for (const candidate of candidates) {
    if (isValidTtf(candidate)) return candidate;
  }
  throw new Error(
    `Invoice PDF font "${filename}" is missing or invalid. Expected a .ttf under backend/assets/fonts/.`
  );
}

const regularPath = resolveFontPath("DejaVuSans.ttf");
const boldPath = resolveFontPath("DejaVuSans-Bold.ttf");

export function registerInvoicePdfFonts(doc: InstanceType<typeof PDFDocument>): void {
  doc.registerFont(PDF_FONT_REGULAR, regularPath);
  doc.registerFont(PDF_FONT_BOLD, boldPath);
}

export function pdfFont(bold = false): string {
  return bold ? PDF_FONT_BOLD : PDF_FONT_REGULAR;
}

/** Rapido-style: "₹ 485.20" with en-IN grouping. */
export function fmtPdfInr(amount: number): string {
  const v = Math.round((Number(amount) || 0) * 100) / 100;
  return `\u20B9 ${v.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
