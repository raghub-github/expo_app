/**
 * Sync QR → data URI for thermal / browser / Expo print (58mm & 80mm).
 * Encodes the exact backend pickup token (case-sensitive).
 *
 * Uses PNG (not SVG): expo-print WebViews often drop SVG data-URI images.
 */

import QRCode from "qrcode";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u32be(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array(4);
  for (let i = 0; i < 4; i++) typeBytes[i] = type.charCodeAt(i);
  const crcBuf = concatBytes([typeBytes, data]);
  return concatBytes([u32be(data.length), typeBytes, data, u32be(crc32(crcBuf))]);
}

/** Adler-32 for zlib wrapper. */
function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]!) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/**
 * Build a zlib stream of stored (uncompressed) DEFLATE blocks — no native zlib needed.
 * Works in React Native / Expo where canvas-based QR PNG generation is unavailable.
 */
function zlibStore(raw: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  const max = 65535;
  let offset = 0;
  while (offset < raw.length) {
    const end = Math.min(offset + max, raw.length);
    const slice = raw.subarray(offset, end);
    const isLast = end >= raw.length;
    const len = slice.length;
    const nlen = (~len) & 0xffff;
    chunks.push(
      new Uint8Array([
        isLast ? 0x01 : 0x00,
        len & 0xff,
        (len >> 8) & 0xff,
        nlen & 0xff,
        (nlen >> 8) & 0xff,
      ]),
      slice
    );
    offset = end;
  }
  if (raw.length === 0) {
    chunks.push(new Uint8Array([0x01, 0x00, 0x00, 0xff, 0xff]));
  }
  chunks.push(u32be(adler32(raw)));
  return concatBytes(chunks);
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  if (typeof btoa === "function") return btoa(binary);
  throw new Error("base64_unavailable");
}

function matrixToPngDataUri(
  modules: { size: number; get: (row: number, col: number) => boolean },
  modulePx: number
): string {
  const size = modules.size;
  const dim = size * modulePx;
  // Greyscale PNG: each scanline = filter(0) + width bytes
  const raw = new Uint8Array((dim + 1) * dim);
  for (let y = 0; y < dim; y++) {
    const row = Math.floor(y / modulePx);
    const rowStart = y * (dim + 1);
    raw[rowStart] = 0; // filter none
    for (let x = 0; x < dim; x++) {
      const col = Math.floor(x / modulePx);
      const dark = modules.get(row, col);
      raw[rowStart + 1 + x] = dark ? 0x00 : 0xff;
    }
  }

  const ihdr = concatBytes([
    u32be(dim),
    u32be(dim),
    new Uint8Array([8, 0, 0, 0, 0]), // 8-bit greyscale, non-interlaced
  ]);
  const png = concatBytes([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlibStore(raw)),
    pngChunk("IEND", new Uint8Array(0)),
  ]);

  return `data:image/png;base64,${bytesToBase64(png)}`;
}

/**
 * Returns a scannable QR PNG data URI for the pickup token, or empty string if unavailable.
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
    return matrixToPngDataUri({ size, get }, Math.max(2, Math.floor(moduleScale)));
  } catch {
    return "";
  }
}
