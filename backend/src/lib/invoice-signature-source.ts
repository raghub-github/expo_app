/**
 * Authorised signatory image for tax invoices (HTML + PDF).
 * Primary: Super Admin → App images → customer.orders.invoice_signature (R2).
 * Fallback: backend/assets/invoice-signature.png on disk.
 */

import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { getAppStaticAssetById } from "../modules/app-assets/app-assets.service.js";
import { getObjectByKey } from "../services/r2/r2Service.js";

export const INVOICE_SIGNATURE_ASSET_ID = "customer.orders.invoice_signature";

export type InvoiceSignatureSource = {
  buffer: Buffer;
  mime: string;
  /** Local path when loaded from disk (PDFKit-friendly). */
  filePath?: string;
};

let cached: Promise<InvoiceSignatureSource | null> | null = null;
let cachedAt = 0;
const CACHE_MS = 5 * 60 * 1000;

function localSignatureCandidates(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    join(here, "../assets/invoice-signature.png"),
    join(here, "../../assets/invoice-signature.png"),
    join(process.cwd(), "assets/invoice-signature.png"),
    join(process.cwd(), "../apps/customer_app/public/img/signature.png"),
  ];
}

function readLocalSignature(): InvoiceSignatureSource | null {
  for (const p of localSignatureCandidates()) {
    if (!existsSync(p)) continue;
    const buffer = readFileSync(p);
    if (buffer.length === 0) continue;
    return { buffer, mime: "image/png", filePath: p };
  }
  return null;
}

function mimeFromContentType(contentType: string): string {
  const ct = contentType.split(";")[0]?.trim().toLowerCase() || "image/png";
  return ct.startsWith("image/") ? ct : "image/png";
}

async function loadInvoiceSignature(): Promise<InvoiceSignatureSource | null> {
  try {
    const row = await getAppStaticAssetById(INVOICE_SIGNATURE_ASSET_ID);
    const r2Key = row?.r2Key?.trim();
    if (r2Key) {
      const obj = await getObjectByKey(r2Key);
      if (obj?.buffer?.length) {
        return { buffer: obj.buffer, mime: mimeFromContentType(obj.contentType) };
      }
    }
  } catch {
    /* R2 / DB unavailable — fall through to local file */
  }
  return readLocalSignature();
}

export async function getInvoiceSignatureSource(): Promise<InvoiceSignatureSource | null> {
  const now = Date.now();
  if (!cached || now - cachedAt > CACHE_MS) {
    cachedAt = now;
    cached = loadInvoiceSignature();
  }
  return cached;
}

export async function getInvoiceSignatureDataUri(): Promise<string | null> {
  const src = await getInvoiceSignatureSource();
  if (!src) return null;
  return `data:${src.mime};base64,${src.buffer.toString("base64")}`;
}
