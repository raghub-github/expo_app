/** Strip query/hash and accidental nested proxy wrappers from an R2 object key. */
export function normalizeR2ObjectKey(raw: string): string {
  let key = String(raw ?? "").trim();
  if (!key) return "";

  if (key.startsWith("http://") || key.startsWith("https://")) {
    try {
      const u = new URL(key);
      if (
        u.pathname.startsWith("/api/attachments/proxy") ||
        u.pathname.startsWith("/v1/attachments/proxy")
      ) {
        const nested = u.searchParams.get("key");
        key = nested ? nested.trim() : decodeURIComponent(u.pathname.replace(/^\/+/, ""));
      } else {
        key = decodeURIComponent(u.pathname.replace(/^\/+/, ""));
        const bucketSegment = key.split("/")[0];
        if (bucketSegment && !bucketSegment.includes(".")) {
          key = key.split("/").slice(1).join("/");
        }
      }
    } catch {
      return "";
    }
  }

  const q = key.indexOf("?");
  if (q >= 0) key = key.slice(0, q);
  const h = key.indexOf("#");
  if (h >= 0) key = key.slice(0, h);

  key = key.replace(/^\/+/, "");
  if (key.startsWith("docs/orders/")) {
    key = key.slice("docs/".length);
  }
  return key;
}

function unwrapNestedProxyKey(raw: string): string {
  let k = String(raw ?? "").trim();
  if (!k) return "";

  for (let i = 0; i < 8; i++) {
    if (/%2f/i.test(k)) {
      try {
        const decoded = decodeURIComponent(k);
        if (decoded !== k) {
          k = decoded;
          continue;
        }
      } catch {
        break;
      }
    }

    const lower = k.toLowerCase();
    if (!lower.includes("attachments/proxy")) {
      return normalizeR2ObjectKey(k);
    }

    try {
      const u = new URL(
        k.startsWith("http://") || k.startsWith("https://")
          ? k
          : k.startsWith("/")
            ? `https://local.invalid${k}`
            : `https://local.invalid/${k}`
      );
      const inner = u.searchParams.get("key");
      if (inner && inner !== k) {
        k = inner.trim();
        continue;
      }
    } catch {
      /* fall through */
    }
    return normalizeR2ObjectKey(k);
  }
  return normalizeR2ObjectKey(k);
}

/** Extract R2 object key from stored `/api/attachments/proxy?key=...` URL or raw key. */
export function extractR2KeyFromProxyUrl(url: string): string {
  return unwrapNestedProxyKey(url);
}

function withDocsPrefixToggle(key: string, into: Set<string>) {
  const t = key.trim();
  if (!t) return;
  into.add(t);
  if (t.startsWith("docs/")) {
    const rest = t.slice("docs/".length);
    if (rest) into.add(rest);
  } else if (t.startsWith("merchants/")) {
    into.add(`docs/${t}`);
  }
}

function merchantPathTypoVariants(key: string): string[] {
  const out = new Set<string>([key]);
  const gmmmp = key.replace(/\/merchants\/GMMMP(\d+)/gi, "/merchants/GMMP$1");
  if (gmmmp !== key) out.add(gmmmp);
  const extraM = key.replace(/\/merchants\/GMMP(\d+)/gi, "/merchants/GMMMP$1");
  if (extraM !== key) out.add(extraM);
  return [...out];
}

const ONBOARDING_DOC_TYPES = ["pan", "aadhaar", "fssai", "gst", "bank", "agreements", "pharma", "other"] as const;

function guessedOnboardingDocType(fileName: string): string | null {
  const m = fileName.match(/^(fssai|pan|gst|aadhaar|aadhar|bank|drug|trade|udyam)/i);
  if (!m) return null;
  const t = m[1].toLowerCase();
  if (t === "aadhar") return "aadhaar";
  if (t === "drug" || t === "trade" || t === "udyam") return "other";
  return t;
}

/** Flat `.../onboarding/documents/{file}` vs legacy `.../onboarding/{type}/{file}`. */
function onboardingDocumentsPathVariants(key: string): string[] {
  const out: string[] = [];
  const mFlat = key.match(
    /^((?:docs\/)?merchants\/[^/]+(?:\/stores\/[^/]+|\/draft))\/onboarding\/documents\/([^/]+)$/i
  );
  if (mFlat) {
    const prefix = mFlat[1];
    const file = mFlat[2];
    const type = guessedOnboardingDocType(file);
    const types = type ? [type] : [...ONBOARDING_DOC_TYPES];
    for (const seg of types) {
      out.push(`${prefix}/onboarding/${seg}/${file}`);
      out.push(`${prefix}/onboarding/documents/${seg}/${file}`);
    }
  }
  const typeAlt = ONBOARDING_DOC_TYPES.join("|");
  const mLeg = key.match(
    new RegExp(
      `^((?:docs\\/)?merchants\\/[^/]+(?:\\/stores\\/[^/]+|\\/draft))\\/onboarding\\/(${typeAlt})\\/([^/]+)$`,
      "i"
    )
  );
  if (mLeg) {
    out.push(`${mLeg[1]}/onboarding/documents/${mLeg[3]}`);
  }
  const mNest = key.match(
    new RegExp(
      `^((?:docs\\/)?merchants\\/[^/]+(?:\\/stores\\/[^/]+|\\/draft))\\/onboarding\\/documents\\/(${typeAlt})\\/([^/]+)$`,
      "i"
    )
  );
  if (mNest) {
    out.push(`${mNest[1]}/onboarding/documents/${mNest[3]}`);
    out.push(`${mNest[1]}/onboarding/${mNest[2]}/${mNest[3]}`);
  }
  return out;
}

/** Files uploaded before the child store existed live under `.../draft/onboarding/`. */
function storesVsDraftOnboardingVariants(key: string): string[] {
  const m = key.match(
    /^((?:docs\/)?merchants\/[^/]+)\/stores\/[^/]+\/(onboarding\/.+)$/i
  );
  if (!m) return [];
  return [`${m[1]}/draft/${m[2]}`];
}

/** Candidate object keys to try when the stored prefix (`docs/`) does not match R2. */
export function r2LookupKeyVariants(raw: string): string[] {
  const primary = unwrapNestedProxyKey(raw);
  if (!primary) return [];
  const out = new Set<string>();
  const add = (k: string) => {
    for (const typo of merchantPathTypoVariants(k)) withDocsPrefixToggle(typo, out);
  };
  add(primary);
  for (const v of onboardingDocumentsPathVariants(primary)) add(v);
  for (const v of storesVsDraftOnboardingVariants(primary)) {
    add(v);
    for (const nested of onboardingDocumentsPathVariants(v)) add(nested);
  }
  return [...out];
}

export function r2ObjectFileName(raw: string): string {
  const primary = unwrapNestedProxyKey(raw);
  if (!primary) return "";
  const last = primary.split("/").pop() || "";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/**
 * ListObjects prefixes when the exact FSSAI/KYC key is missing
 * (draft vs stores, documents vs type folder).
 */
export function r2OnboardingSearchPrefixes(raw: string): string[] {
  const primary = unwrapNestedProxyKey(raw);
  if (!primary) return [];
  const m = primary.match(/^((?:docs\/)?merchants\/[^/]+)\/(stores\/[^/]+|draft)\/onboarding(?:\/.*)?$/i);
  if (!m) return [];
  const parent = m[1];
  const loc = m[2];
  const file = r2ObjectFileName(primary);
  const type = guessedOnboardingDocType(file);
  const out = new Set<string>();
  const add = (p: string) => withDocsPrefixToggle(p.replace(/\/+$/, ""), out);
  add(`${parent}/${loc}/onboarding`);
  add(`${parent}/${loc}/onboarding/documents`);
  if (type) add(`${parent}/${loc}/onboarding/${type}`);
  if (/^stores\//i.test(loc)) {
    add(`${parent}/draft/onboarding`);
    add(`${parent}/draft/onboarding/documents`);
    if (type) add(`${parent}/draft/onboarding/${type}`);
  }
  return [...out];
}

/** Stable relative proxy URL stored in DB and used by <img src>. */
export function toAttachmentProxyUrl(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return null;
  const key = unwrapNestedProxyKey(trimmed);
  if (!key) return null;
  return `/api/attachments/proxy?key=${encodeURIComponent(key)}`;
}

export function contentTypeFromR2Key(
  key: string,
  fallback?: string | null
): string {
  const fb = (fallback || "").trim();
  if (fb && fb !== "application/octet-stream") return fb;
  const ext = key.split(".").pop()?.toLowerCase() || "";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "pdf") return "application/pdf";
  if (ext === "csv") return "text/csv";
  if (ext === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === "xls") return "application/vnd.ms-excel";
  return fb || "application/octet-stream";
}

export async function deleteR2ObjectForStoredUrl(url: string | null | undefined): Promise<void> {
  const raw = String(url ?? "").trim();
  if (!raw) return;
  const { deleteDocument } = await import("@/lib/services/r2");
  const key = extractR2KeyFromProxyUrl(raw) || raw;
  if (!key) return;
  try {
    await deleteDocument(key);
  } catch {
    /* non-fatal */
  }
}
