/**
 * Sync QR → data URI for thermal / browser print (58mm & 80mm).
 * Encodes the exact backend pickup token (case-sensitive).
 */

import QRCode from "qrcode";

function matrixToSvgDataUri(
  modules: { size: number; get: (row: number, col: number) => boolean },
  modulePx: number
): string {
  const size = modules.size;
  const dim = size * modulePx;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges">`,
    `<rect width="100%" height="100%" fill="#fff"/>`,
  ];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!modules.get(r, c)) continue;
      parts.push(
        `<rect x="${c * modulePx}" y="${r * modulePx}" width="${modulePx}" height="${modulePx}" fill="#000"/>`
      );
    }
  }
  parts.push("</svg>");
  const svg = parts.join("");
  const encoded =
    typeof btoa === "function"
      ? btoa(svg)
      : Buffer.from(svg, "utf8").toString("base64");
  return `data:image/svg+xml;base64,${encoded}`;
}

/**
 * Returns a scannable QR data URI for the pickup token, or empty string if unavailable.
 * @param moduleScale pixels per QR module (3 ≈ 132px for typical EC level M).
 */
export function pickupTokenToQrDataUri(
  token: string | null | undefined,
  moduleScale = 3
): string {
  const value = String(token ?? "").trim();
  if (!value) return "";
  try {
    const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
    const size = qr.modules.size;
    const get = (row: number, col: number) => Boolean(qr.modules.get(row, col));
    return matrixToSvgDataUri({ size, get }, Math.max(2, Math.floor(moduleScale)));
  } catch {
    return "";
  }
}
