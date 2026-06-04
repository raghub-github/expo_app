export type DocumentSide = "front" | "back" | "single";

export function parseDisplayDocType(displayType: string): {
  baseType: string;
  side: DocumentSide;
} {
  if (displayType.endsWith("_front")) {
    return { baseType: displayType.slice(0, -"_front".length), side: "front" };
  }
  if (displayType.endsWith("_back")) {
    return { baseType: displayType.slice(0, -"_back".length), side: "back" };
  }
  return { baseType: displayType, side: "single" };
}

export function isMultiSideBaseType(baseType: string): boolean {
  return baseType === "aadhaar" || baseType === "dl";
}

/** Stable keys — re-upload overwrites the same R2 object (matches rider app). */
export function stableRiderDocumentKey(
  riderId: number,
  docType: string,
  side: DocumentSide = "single"
): string {
  const base = `riders/${riderId}/documents/${docType}`;
  if (side === "single") return `${base}/latest.jpg`;
  return `${base}/${side}.jpg`;
}

export function proxyUrlFromR2Key(key: string): string {
  return `/api/attachments/proxy?key=${encodeURIComponent(key.trim())}`;
}
