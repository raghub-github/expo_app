/**
 * GatiMitra logo with name for ride invoice PDF headers.
 * Primary: Super Admin → App images → customer.auth.logo_with_name (R2).
 */

import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { getAppStaticAssetById } from "../modules/app-assets/app-assets.service.js";
import { getObjectByKey } from "../services/r2/r2Service.js";

export const RIDE_INVOICE_LOGO_ASSET_ID = "customer.auth.logo_with_name";

export type RideInvoiceLogoSource = {
  buffer: Buffer;
  mime: string;
  filePath?: string;
};

let cached: Promise<RideInvoiceLogoSource | null> | null = null;
let cachedAt = 0;
const CACHE_MS = 5 * 60 * 1000;

function localLogoCandidates(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    join(here, "../../apps/customer_app/public/img/logowithname.png"),
    join(process.cwd(), "../apps/customer_app/public/img/logowithname.png"),
    join(process.cwd(), "apps/customer_app/public/img/logowithname.png"),
  ];
}

function readLocalLogo(): RideInvoiceLogoSource | null {
  for (const p of localLogoCandidates()) {
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

async function loadRideInvoiceLogo(): Promise<RideInvoiceLogoSource | null> {
  try {
    const row = await getAppStaticAssetById(RIDE_INVOICE_LOGO_ASSET_ID);
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
  return readLocalLogo();
}

export async function getRideInvoiceLogoSource(): Promise<RideInvoiceLogoSource | null> {
  const now = Date.now();
  if (!cached || now - cachedAt > CACHE_MS) {
    cachedAt = now;
    cached = loadRideInvoiceLogo();
  }
  return cached;
}
