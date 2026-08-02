/**
 * Types for the pure QR matrix builder inside `qrcode`.
 *
 * We import this deep path instead of the package root because the root entry
 * pulls in the PNG/SVG renderers, which `require('fs')` at module scope and
 * crash React Native (Metro does not honour the package's `browser` field
 * object mappings). The core module only depends on plain JS helpers.
 */
declare module "qrcode/lib/core/qrcode.js" {
  export interface QrCodeMatrix {
    size: number;
    get(row: number, col: number): boolean | number;
  }

  export interface QrCodeSymbol {
    modules: QrCodeMatrix;
  }

  export function create(
    data: string,
    options?: {
      errorCorrectionLevel?: "L" | "M" | "Q" | "H" | "low" | "medium" | "quartile" | "high";
      version?: number;
    },
  ): QrCodeSymbol;
}
