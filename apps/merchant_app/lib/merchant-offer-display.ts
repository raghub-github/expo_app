/** Merchant-facing Boost vs BOGO line display rules. */

export function normalizeMerchantOfferType(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[-\s]+/g, "_");
}

export function isBogoOfferType(type: string | null | undefined): boolean {
  const t = normalizeMerchantOfferType(type);
  return t === "BOGO" || t === "BUY_X_GET_Y" || t === "BUY_N_GET_M";
}

export function isBoostOfferType(
  type: string | null | undefined,
  label?: string | null
): boolean {
  const t = normalizeMerchantOfferType(type);
  if (isBogoOfferType(t)) return false;
  if (t === "BOOST" || t === "PERCENTAGE" || t === "FLAT") return true;
  if (/\bboost\b/i.test(label ?? "")) return true;
  return false;
}

/** Badge text for BOGO — never show a struck price for these lines. */
export function formatBogoOfferBadge(
  label: string | null | undefined,
  buyQty?: number | null,
  getQty?: number | null
): string {
  const word = (n: number): string => {
    const w = [
      "Zero",
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
      "Six",
      "Seven",
      "Eight",
      "Nine",
      "Ten",
    ];
    return w[n] ?? String(n);
  };
  const toNum = (s: string): number => {
    const map: Record<string, number> = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
    };
    const key = s.toLowerCase();
    if (map[key] != null) return map[key]!;
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 1;
  };
  const raw = (label ?? "").trim();
  const m = raw.match(
    /buy\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*get\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten)/i
  );
  if (m) {
    return `Buy ${word(toNum(m[1]!))} Get ${word(toNum(m[2]!))}`;
  }
  if (
    buyQty != null &&
    getQty != null &&
    Number.isFinite(buyQty) &&
    Number.isFinite(getQty) &&
    buyQty > 0 &&
    getQty > 0
  ) {
    return `Buy ${word(Math.floor(buyQty))} Get ${word(Math.floor(getQty))}`;
  }
  if (/buy\s*one\s*get\s*one/i.test(raw)) return "Buy One Get One";
  return raw || "Buy One Get One";
}

export function formatBoostOfferBadge(_label?: string | null): string {
  return "Boost Offer Applied";
}

export function resolveMerchantOfferBadge(opts: {
  offerType?: string | null;
  offerLabel?: string | null;
  buyQty?: number | null;
  getQty?: number | null;
}): { kind: "bogo" | "boost" | "other" | null; badge: string | null } {
  const { offerType, offerLabel } = opts;
  const t = normalizeMerchantOfferType(offerType);
  // Prefer stored type over label text — Boost titles must never become BOGO badges.
  if (t === "BOOST" || t === "PERCENTAGE" || t === "FLAT") {
    return { kind: "boost", badge: formatBoostOfferBadge(offerLabel) };
  }
  if (isBogoOfferType(offerType)) {
    return {
      kind: "bogo",
      badge: formatBogoOfferBadge(offerLabel, opts.buyQty, opts.getQty),
    };
  }
  if (
    /\bboost\b/i.test(offerLabel ?? "") ||
    /flat\s*\d+(\.\d+)?\s*%/i.test(offerLabel ?? "") ||
    /flat\s+offer\s+applied/i.test(offerLabel ?? "")
  ) {
    return { kind: "boost", badge: formatBoostOfferBadge() };
  }
  if (/buy\s*\d*\s*get/i.test(offerLabel ?? "") || /buy\s*one\s*get/i.test(offerLabel ?? "")) {
    return {
      kind: "bogo",
      badge: formatBogoOfferBadge(offerLabel, opts.buyQty, opts.getQty),
    };
  }
  const raw = (offerLabel ?? "").trim();
  if (!raw) return { kind: null, badge: null };
  if (/flat\s*\d+(\.\d+)?\s*%/i.test(raw)) {
    return { kind: "boost", badge: formatBoostOfferBadge() };
  }
  return { kind: "other", badge: raw };
}
