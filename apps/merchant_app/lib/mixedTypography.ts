import { MerchantFonts } from "@/constants/typography";

export type TypographySegmentKind = "alpha" | "numeric";

/** Split display copy so alphabetic runs use Lora and numeric runs use Poppins. */
export function splitMixedTypography(
  text: string
): Array<{ kind: TypographySegmentKind; value: string }> {
  const segments: Array<{ kind: TypographySegmentKind; value: string }> = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i]!;

    if (ch === "₹" || /\d/.test(ch)) {
      let j = i;
      if (text[j] === "₹") j++;
      while (j < text.length && /[\d.,]/.test(text[j]!)) j++;
      if (text[j] === "%") j++;
      segments.push({ kind: "numeric", value: text.slice(i, j) });
      i = j;
      continue;
    }

    // Letters (Latin + common Indic scripts) → Lora
    if (/[a-zA-Z\u0900-\u097F\u0A80-\u0AFF\u0B80-\u0BFF]/.test(ch)) {
      let j = i;
      while (
        j < text.length &&
        /[a-zA-Z\u0900-\u097F\u0A80-\u0AFF\u0B80-\u0BFF]/.test(text[j]!)
      ) {
        j++;
      }
      segments.push({ kind: "alpha", value: text.slice(i, j) });
      i = j;
      continue;
    }

    let j = i;
    while (
      j < text.length &&
      !/[₹\d]/.test(text[j]!) &&
      !/[a-zA-Z\u0900-\u097F\u0A80-\u0AFF\u0B80-\u0BFF]/.test(text[j]!)
    ) {
      j++;
    }
    const slice = text.slice(i, j);
    const prev = segments[segments.length - 1];
    if (prev) {
      prev.value += slice;
    } else {
      segments.push({ kind: "alpha", value: slice });
    }
    i = j;
  }

  return segments.length > 0 ? segments : [{ kind: "alpha", value: text }];
}

export function isBoldFontWeight(fontWeight: string | number | undefined): boolean {
  if (fontWeight == null) return false;
  if (fontWeight === "bold") return true;
  const n = typeof fontWeight === "number" ? fontWeight : Number.parseInt(String(fontWeight), 10);
  return Number.isFinite(n) && n >= 600;
}

export function segmentFontFamily(kind: TypographySegmentKind, bold: boolean): string {
  if (kind === "numeric") {
    return bold ? MerchantFonts.poppinsBold : MerchantFonts.poppinsSemiBold;
  }
  return bold ? MerchantFonts.loraBold : MerchantFonts.loraRegular;
}

const BRAND_FACES = new Set<string>(Object.values(MerchantFonts));

/** Keep mono / icon / third-party faces untouched by the global Text patch. */
export function isNonBrandFontFamily(fontFamily: string | undefined): boolean {
  if (!fontFamily) return false;
  if (BRAND_FACES.has(fontFamily)) return false;
  return true;
}
