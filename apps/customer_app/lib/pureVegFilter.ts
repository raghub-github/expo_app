/** Client-side pure-veg guards — backend `is_pure_veg` plus name/cuisine fallback. */

const MIXED_OR_NON_VEG_RE =
  /\bnon[\s-]?veg\b|\bnonvegetarian\b|\bveg\s*(?:and|&|\+)\s*non|\bnon\s*(?:and|&|\+)\s*veg/i;

const NON_VEG_LABEL_RE =
  /\bchicken\b|\bmutton\b|\bgoat\b|\bfish\b|\bprawn\b|\bseafood\b|\begg\b|\bbeef\b|\bbacon\b|\bkeema\b|\bkebab\b|\btikka\b(?!\s*masala)/i;

const VEG_EXCEPTION_RE =
  /\bpaneer\b|\baloo\b|\bgobi\b|\bdal\b|\bidli\b|\bdosa\b|\bvada\b|\bsambar\b|\brasgulla\b|\bkheer\b|\bthali\b|\bpure\s*veg\b/i;

export function textLooksNonVeg(text: string | null | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;
  if (MIXED_OR_NON_VEG_RE.test(t)) return true;
  if (NON_VEG_LABEL_RE.test(t) && !VEG_EXCEPTION_RE.test(t)) return true;
  return false;
}

export function isMerchantPureVeg(merchant: {
  isPureVeg?: boolean | null;
  name?: string | null;
  cuisines?: string[] | null;
}): boolean {
  const blob = `${merchant.name ?? ""} ${(merchant.cuisines ?? []).join(" ")}`;
  if (textLooksNonVeg(blob)) return false;
  if (merchant.isPureVeg === false) return false;
  return merchant.isPureVeg === true;
}

export function filterPureVegMerchants<T extends {
  isPureVeg?: boolean | null;
  name?: string | null;
  cuisines?: string[] | null;
}>(rows: T[], vegOnly: boolean): T[] {
  if (!vegOnly) return rows;
  return rows.filter((row) => isMerchantPureVeg(row));
}

export function isVegSafeCategoryName(name: string | null | undefined): boolean {
  const n = name?.trim() ?? "";
  if (!n) return true;
  if (MIXED_OR_NON_VEG_RE.test(n)) return false;
  if (
    /\b(chicken|mutton|fish|prawn|seafood|egg|keema|kebab|tandoori chicken|butter chicken|nonveg|non veg)\b/i.test(
      n
    )
  ) {
    return false;
  }
  return true;
}

export function filterVegSafeCategories<T extends { name?: string | null }>(
  rows: T[],
  vegOnly: boolean
): T[] {
  if (!vegOnly) return rows;
  return rows.filter((row) => isVegSafeCategoryName(row.name));
}
