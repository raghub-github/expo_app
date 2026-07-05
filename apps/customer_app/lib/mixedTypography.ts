import { StoreFonts } from "@/constants/storeTypography";

export type TypographySegmentKind = "alpha" | "numeric";

/** Split display copy so alphabetic runs use Lora and numeric runs use Poppins. */
export function splitMixedTypography(text: string): Array<{ kind: TypographySegmentKind; value: string }> {
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

    if (/[a-zA-Z]/.test(ch)) {
      let j = i;
      while (j < text.length && /[a-zA-Z]/.test(text[j]!)) j++;
      segments.push({ kind: "alpha", value: text.slice(i, j) });
      i = j;
      continue;
    }

    let j = i;
    while (j < text.length && !/[₹\d]/.test(text[j]!) && !/[a-zA-Z]/.test(text[j]!)) j++;
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
  const n = typeof fontWeight === "number" ? fontWeight : Number.parseInt(fontWeight, 10);
  return Number.isFinite(n) && n >= 600;
}

export function segmentFontFamily(kind: TypographySegmentKind, bold: boolean): string {
  if (kind === "numeric") {
    return bold ? StoreFonts.poppinsBold : StoreFonts.poppinsSemiBold;
  }
  return bold ? StoreFonts.loraBold : StoreFonts.loraRegular;
}
