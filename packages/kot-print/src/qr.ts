/**
 * Sync QR → data URI for thermal / browser / Expo print (58mm & 80mm).
 * Encodes the exact backend pickup token (case-sensitive).
 *
 * Uses PNG (not SVG): expo-print WebViews often drop SVG data-URI images.
 */

/// <reference path="./qrcode-core.d.ts" />
import * as QrCodeCore from "qrcode/lib/core/qrcode.js";

type QrModules = { modules: { size: number; get: (row: number, col: number) => boolean | number } };

type QrByteSegment = { data: Uint8Array; mode: "byte" };

type QrFactory = {
  create: (
    value: string | QrByteSegment[],
    options: { errorCorrectionLevel: "M" }
  ) => QrModules;
};

/** UTF-8 bytes without TextEncoder, which React Native / Hermes does not ship. */
function encodeUtf8(value: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < value.length; i++) {
    let code = value.charCodeAt(i);
    // Combine surrogate pairs into a single code point.
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
        i++;
      }
    }
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }
  return new Uint8Array(out);
}

/**
 * `qrcode` encodes byte-mode data with `TextEncoder`, which does not exist in
 * the app runtimes. Handing it pre-encoded bytes keeps every token — lowercase,
 * hyphenated, anything — on a path that never touches that global.
 */
function createQrSymbol(factory: QrFactory, value: string): QrModules {
  try {
    return factory.create([{ data: encodeUtf8(value), mode: "byte" }], {
      errorCorrectionLevel: "M",
    });
  } catch {
    // Older `qrcode` builds only accept a plain string.
    return factory.create(value, { errorCorrectionLevel: "M" });
  }
}

/**
 * Webpack exposes qrcode as a namespace while Metro can nest the same
 * CommonJS package under one or more `default` wrappers. Walk a few layers.
 */
function resolveQrFactory(): QrFactory | null {
  let current: unknown = QrCodeCore;
  for (let depth = 0; depth < 4 && current; depth++) {
    const candidate = current as {
      create?: QrFactory["create"];
      default?: unknown;
    };
    if (typeof candidate.create === "function") {
      return { create: candidate.create };
    }
    current = candidate.default;
  }
  return null;
}

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
  // Pure JS encoder — React Native / Hermes often lack Buffer and btoa.
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += alphabet[(triple >> 18) & 63];
    out += alphabet[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? alphabet[(triple >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? alphabet[triple & 63] : "=";
  }
  return out;
}

function matrixToPngDataUri(
  modules: { size: number; get: (row: number, col: number) => boolean },
  modulePx: number
): string {
  const size = modules.size;
  // ISO/IEC 18004 requires a 4-module quiet zone around a QR symbol.
  const quietModules = 4;
  const matrixWithQuietZone = size + quietModules * 2;
  const dim = matrixWithQuietZone * modulePx;
  // Greyscale PNG: each scanline = filter(0) + width bytes
  const raw = new Uint8Array((dim + 1) * dim);
  for (let y = 0; y < dim; y++) {
    const row = Math.floor(y / modulePx) - quietModules;
    const rowStart = y * (dim + 1);
    raw[rowStart] = 0; // filter none
    for (let x = 0; x < dim; x++) {
      const col = Math.floor(x / modulePx) - quietModules;
      const inside = row >= 0 && row < size && col >= 0 && col < size;
      const dark = inside && modules.get(row, col);
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
    const factory = resolveQrFactory();
    if (!factory) return "";
    const qr = createQrSymbol(factory, value);
    const size = qr.modules.size;
    const get = (row: number, col: number) => Boolean(qr.modules.get(row, col));
    return matrixToPngDataUri({ size, get }, Math.max(2, Math.floor(moduleScale)));
  } catch {
    return "";
  }
}

/**
 * HTML table QR — expo-print / Android WebView often drop PNG data-URI images.
 * Partner Site and Merchant App share this so the printed ticket always matches.
 */
export function pickupTokenToQrTableHtml(
  token: string | null | undefined,
  modulePx = 3
): string {
  const value = String(token ?? "").trim();
  if (!value) return "";
  try {
    const factory = resolveQrFactory();
    if (!factory) return "";
    const qr = createQrSymbol(factory, value);
    const size = qr.modules.size;
    const quiet = 4;
    const dim = size + quiet * 2;
    const px = Math.max(2, Math.floor(modulePx));
    const rows: string[] = [];
    for (let y = 0; y < dim; y++) {
      const cells: string[] = [];
      const row = y - quiet;
      for (let x = 0; x < dim; x++) {
        const col = x - quiet;
        const dark =
          row >= 0 && row < size && col >= 0 && col < size && Boolean(qr.modules.get(row, col));
        cells.push(
          `<td style="width:${px}px;height:${px}px;padding:0;margin:0;border:0;background:${dark ? "#000" : "#fff"};font-size:0;line-height:0;"></td>`
        );
      }
      rows.push(`<tr>${cells.join("")}</tr>`);
    }
    const side = dim * px;
    return `<table class="qr-table" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;border-spacing:0;margin:10px auto 0;width:${side}px;height:${side}px;">${rows.join("")}</table>`;
  } catch {
    return "";
  }
}
