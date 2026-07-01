/**
 * GET /api/attachments/proxy?url=<encoded-url>  OR  ?key=<encoded-r2-key>
 *
 * Serves R2 objects on demand so attachments never show expiry errors.
 * - ?key=: R2 object key (e.g. .../onboarding/documents/file.pdf or .../onboarding/agreement/contract-....pdf). Preferred.
 * - ?url=: Full R2 URL; key is extracted from pathname. Keeps existing stored URLs working.
 *
 * Every request fetches the object from R2 using server credentials and streams it to the client.
 * There is no signed URL sent to the client — so no expiry. Access is effectively "auto-renewed"
 * on every view (images, PDFs, CSV, contracts, etc.). Use this URL format in the DB for all attachments.
 */

import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { isPublicR2CdnBase, normalizeR2ObjectKey } from "@/lib/r2";

function getR2Client(): S3Client {
  const endpoint = process.env.R2_ENDPOINT || "";
  const forcePathStyle =
    String(process.env.R2_S3_FORCE_PATH_STYLE || "").toLowerCase() === "true" ||
    /\.r2\.cloudflarestorage\.com/i.test(endpoint);
  return new S3Client({
    region: process.env.R2_REGION || "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY!,
      secretAccessKey: process.env.R2_SECRET_KEY!,
    },
    forcePathStyle,
  });
}

/** Extract R2 key from a full URL (pathname without leading slash). */
function keyFromUrl(decodedUrl: string): string | null {
  try {
    if (decodedUrl.startsWith("http://") || decodedUrl.startsWith("https://")) {
      const u = new URL(decodedUrl);
      const k = u.pathname.replace(/^\/+/, "");
      return k || null;
    }
  } catch {
    return null;
  }
  return null;
}

/** Parent folder typo seen in DB: GMMMP1005 vs correct GMMP1005 */
function merchantPathTypoVariants(key: string): string[] {
  const out = new Set<string>([key]);
  const gmmmp = key.replace(/\/merchants\/GMMMP(\d+)/gi, "/merchants/GMMP$1");
  if (gmmmp !== key) out.add(gmmmp);
  const extraM = key.replace(/\/merchants\/GMMP(\d+)/gi, "/merchants/GMMMP$1");
  if (extraM !== key) out.add(extraM);
  return [...out];
}

/** .../stores/{id}/menu/file -> onboarding menu type folders (new + legacy nested paths) */
function flatMenuToOnboardingKeys(key: string): string[] {
  const re = /^((?:docs\/)?merchants\/[^/]+\/stores\/[^/]+)\/menu\/([^/]+)$/i;
  const m = key.match(re);
  if (!m) return [];
  const prefix = m[1].startsWith("docs/") ? m[1] : `docs/${m[1]}`;
  const file = m[2];
  const base = `${prefix}/onboarding`;
  return [
    `${base}/menu/${file}`,
    `${base}/menu-pdf/${file}`,
    `${base}/menu-images/${file}`,
    `${base}/menu-csv/${file}`,
    `${base}/menu/pdf/${file}`,
    `${base}/menu/images/${file}`,
    `${base}/menu/csv/${file}`,
  ];
}

/** .../onboarding/menu-{pdf|images|csv}/file or .../onboarding/menu/{pdf|images|csv}/file -> .../menu/file */
function onboardingMenuToFlatKeys(key: string): string[] {
  const out: string[] = [];
  const reNew =
    /^((?:docs\/)?merchants\/[^/]+\/stores\/[^/]+)\/onboarding\/menu-(pdf|images|csv)\/([^/]+)$/i;
  const m1 = key.match(reNew);
  if (m1) {
    const prefix = m1[1].startsWith("docs/") ? m1[1] : `docs/${m1[1]}`;
    out.push(`${prefix}/menu/${m1[3]}`);
  }
  const reOld =
    /^((?:docs\/)?merchants\/[^/]+\/stores\/[^/]+)\/onboarding\/menu\/(?:pdf|images|csv)\/([^/]+)$/i;
  const m2 = key.match(reOld);
  if (m2) {
    const prefix = m2[1].startsWith("docs/") ? m2[1] : `docs/${m2[1]}`;
    out.push(`${prefix}/menu/${m2[2]}`);
  }
  return out;
}

/** `.../onboarding/menu/{pdf|csv|images}/f` <-> legacy `.../onboarding/menu-{pdf|csv|images}/f` */
function onboardingMenuLayoutVariants(key: string): string[] {
  const out: string[] = [];
  const base = "(?:docs\\/)?merchants\\/[^/]+(?:\\/stores\\/[^/]+|\\/draft)";
  const reNested = new RegExp(
    `^(${base})\\/onboarding\\/menu\\/(pdf|csv|images)\\/([^/]+)$`,
    "i",
  );
  const m = key.match(reNested);
  if (m) {
    const p = m[1];
    const prefix = p.startsWith("docs/") ? p : `docs/${p}`;
    const type = m[2].toLowerCase();
    const file = m[3];
    const legacySeg =
      type === "pdf" ? "menu-pdf" : type === "csv" ? "menu-csv" : "menu-images";
    out.push(`${prefix}/onboarding/${legacySeg}/${file}`);
  }
  const reLegacy = new RegExp(
    `^(${base})\\/onboarding\\/menu-(pdf|images|csv)\\/([^/]+)$`,
    "i",
  );
  const m2 = key.match(reLegacy);
  if (m2) {
    const p = m2[1];
    const prefix = p.startsWith("docs/") ? p : `docs/${p}`;
    const kind = m2[2].toLowerCase();
    const file = m2[3];
    const sub = kind === "pdf" ? "pdf" : kind === "csv" ? "csv" : "images";
    out.push(`${prefix}/onboarding/menu/${sub}/${file}`);
  }
  return out;
}

/** Flat `.../onboarding/menu/{file}` (step 3) <-> `.../stores/{id}/menu/{file}` legacy */
function onboardingFlatMenuReferenceVariants(key: string): string[] {
  const out: string[] = [];
  const reOnb =
    /^((?:docs\/)?merchants\/[^/]+(?:\/stores\/[^/]+|\/draft))\/onboarding\/menu\/([^/]+)$/i;
  const m = key.match(reOnb);
  if (m) {
    const p = m[1].startsWith("docs/") ? m[1] : `docs/${m[1]}`;
    const file = m[2];
    if (file && !/^(pdf|csv|images)$/i.test(file)) {
      out.push(`${p}/menu/${file}`);
    }
  }
  const reStore =
    /^((?:docs\/)?merchants\/[^/]+\/stores\/[^/]+)\/menu\/([^/]+)$/i;
  const m2 = key.match(reStore);
  if (m2 && !m2[0].toLowerCase().includes("/onboarding/")) {
    const p = m2[1].startsWith("docs/") ? m2[1] : `docs/${m2[1]}`;
    const file = m2[2];
    if (file) out.push(`${p}/onboarding/menu/${file}`);
  }
  return out;
}

const LEGACY_ONBOARDING_DOC_SEGMENTS =
  "pan|aadhaar|fssai|gst|bank|agreements|pharma|other";

/**
 * Flat layout: .../onboarding/documents/{file}
 * Legacy: .../onboarding/{type}/{file} or .../onboarding/documents/{type}/{file}
 */
function onboardingDocumentsPathVariants(key: string): string[] {
  const out: string[] = [];
  const typeAlt = LEGACY_ONBOARDING_DOC_SEGMENTS.split("|");

  const flatDoc = new RegExp(
    `^((?:docs\\/)?merchants\\/[^/]+(?:\\/stores\\/[^/]+|\\/draft))\\/onboarding\\/documents\\/([^/]+)$`,
    "i",
  );
  const mFlat = key.match(flatDoc);
  if (mFlat) {
    const prefix = mFlat[1].startsWith("docs/") ? mFlat[1] : `docs/${mFlat[1]}`;
    const file = mFlat[2];
    if (file) {
      for (const seg of typeAlt) {
        out.push(`${prefix}/onboarding/${seg}/${file}`);
      }
      for (const seg of typeAlt) {
        out.push(`${prefix}/onboarding/documents/${seg}/${file}`);
      }
    }
  }

  const legacyType = new RegExp(
    `^((?:docs\\/)?merchants\\/[^/]+(?:\\/stores\\/[^/]+|\\/draft))\\/onboarding\\/(${LEGACY_ONBOARDING_DOC_SEGMENTS})\\/(.+)$`,
    "i",
  );
  const mLeg = key.match(legacyType);
  if (mLeg) {
    const prefix = mLeg[1].startsWith("docs/") ? mLeg[1] : `docs/${mLeg[1]}`;
    const file = mLeg[3];
    if (file) out.push(`${prefix}/onboarding/documents/${file}`);
  }

  const nestedUnderDocuments = new RegExp(
    `^((?:docs\\/)?merchants\\/[^/]+(?:\\/stores\\/[^/]+|\\/draft))\\/onboarding\\/documents\\/(${LEGACY_ONBOARDING_DOC_SEGMENTS})\\/(.+)$`,
    "i",
  );
  const mNest = key.match(nestedUnderDocuments);
  if (mNest) {
    const prefix = mNest[1].startsWith("docs/") ? mNest[1] : `docs/${mNest[1]}`;
    const typeSeg = mNest[2];
    const file = mNest[3];
    if (file) {
      out.push(`${prefix}/onboarding/documents/${file}`);
      out.push(`${prefix}/onboarding/${typeSeg}/${file}`);
    }
  }

  return out;
}

/** Legacy gallery path .../onboarding/store-media/gallery/ <-> .../onboarding/store-media-gallery/ */
function onboardingStoreMediaGalleryVariants(key: string): string[] {
  const out: string[] = [];
  const reOld =
    /^((?:docs\/)?merchants\/[^/]+(?:\/stores\/[^/]+|\/draft))\/onboarding\/store-media\/gallery\/(.+)$/i;
  const m = key.match(reOld);
  if (m) {
    const prefix = m[1].startsWith("docs/") ? m[1] : `docs/${m[1]}`;
    out.push(`${prefix}/onboarding/store-media-gallery/${m[2]}`);
  }
  const reNew =
    /^((?:docs\/)?merchants\/[^/]+(?:\/stores\/[^/]+|\/draft))\/onboarding\/store-media-gallery\/(.+)$/i;
  const m2 = key.match(reNew);
  if (m2) {
    const prefix = m2[1].startsWith("docs/") ? m2[1] : `docs/${m2[1]}`;
    out.push(`${prefix}/onboarding/store-media/gallery/${m2[2]}`);
  }
  return out;
}

/** `.../onboarding/assets/{banner|gallery}/file` <-> legacy `store-media` / `store-media-gallery` */
function onboardingStoreAssetsPathVariants(key: string): string[] {
  const out: string[] = [];
  const reAssetsBanner =
    /^((?:docs\/)?merchants\/[^/]+(?:\/stores\/[^/]+|\/draft))\/onboarding\/assets\/banner\/([^/]+)$/i;
  const mb = key.match(reAssetsBanner);
  if (mb) {
    const prefix = mb[1].startsWith("docs/") ? mb[1] : `docs/${mb[1]}`;
    out.push(`${prefix}/onboarding/store-media/${mb[2]}`);
  }
  const reAssetsGallery =
    /^((?:docs\/)?merchants\/[^/]+(?:\/stores\/[^/]+|\/draft))\/onboarding\/assets\/gallery\/([^/]+)$/i;
  const mg = key.match(reAssetsGallery);
  if (mg) {
    const prefix = mg[1].startsWith("docs/") ? mg[1] : `docs/${mg[1]}`;
    out.push(`${prefix}/onboarding/store-media-gallery/${mg[2]}`);
  }
  const reLegacyBanner =
    /^((?:docs\/)?merchants\/[^/]+(?:\/stores\/[^/]+|\/draft))\/onboarding\/store-media\/(banner[^/]*)$/i;
  const lb = key.match(reLegacyBanner);
  if (lb) {
    const prefix = lb[1].startsWith("docs/") ? lb[1] : `docs/${lb[1]}`;
    out.push(`${prefix}/onboarding/assets/banner/${lb[2]}`);
  }
  const reLegacyGallery =
    /^((?:docs\/)?merchants\/[^/]+(?:\/stores\/[^/]+|\/draft))\/onboarding\/store-media-gallery\/([^/]+)$/i;
  const lg = key.match(reLegacyGallery);
  if (lg) {
    const prefix = lg[1].startsWith("docs/") ? lg[1] : `docs/${lg[1]}`;
    out.push(`${prefix}/onboarding/assets/gallery/${lg[2]}`);
  }
  return out;
}

/**
 * Signed contract PDF: `.../onboarding/agreement/{file}` <-> same filename under `documents/` (legacy submit).
 * Only applies to obvious contract names (*.pdf, contract-approval- / partner-agreement- prefixes).
 */
function onboardingAgreementPathVariants(key: string): string[] {
  const out: string[] = [];
  const m = key.match(
    /^((?:docs\/)?merchants\/[^/]+(?:\/stores\/[^/]+|\/draft))\/onboarding\/(agreement|documents)\/([^/]+)$/i,
  );
  if (!m) return out;
  const prefix = m[1].startsWith("docs/") ? m[1] : `docs/${m[1]}`;
  const folder = m[2].toLowerCase();
  const file = m[3];
  if (!file || !/\.pdf$/i.test(file)) return out;
  if (!/^contract-approval-/i.test(file) && !/^partner-agreement/i.test(file))
    return out;
  const other = folder === "agreement" ? "documents" : "agreement";
  out.push(`${prefix}/onboarding/${other}/${file}`);
  return out;
}

/** Menu reference: .../stores/{storeId}/menu/file <-> .../menu/{storeId}/file (legacy vs current layout) */
function menuReferencePathVariants(key: string): string[] {
  const out: string[] = [];
  const reOld = /^((?:docs\/)?merchants\/[^/]+)\/stores\/([^/]+)\/menu\/(.+)$/i;
  const mOld = key.match(reOld);
  if (mOld && !key.includes("/onboarding/")) {
    const base = mOld[1].replace(/^docs\//, "");
    const storeId = mOld[2];
    const file = mOld[3];
    out.push(`${base}/menu/${storeId}/${file}`);
    out.push(`docs/${base}/menu/${storeId}/${file}`);
  }
  const reNew = /^((?:docs\/)?merchants\/[^/]+)\/menu\/([^/]+)\/(.+)$/i;
  const mNew = key.match(reNew);
  if (mNew && !key.includes("/onboarding/") && !key.includes("/stores/")) {
    const base = mNew[1].replace(/^docs\//, "");
    const storeId = mNew[2];
    const file = mNew[3];
    out.push(`${base}/stores/${storeId}/menu/${file}`);
    out.push(`docs/${base}/stores/${storeId}/menu/${file}`);
  }
  return out;
}

/**
 * R2 keys historically used `merchants/...`, `docs/merchants/...`, flat `/menu/`,
 * `/onboarding/menu/...`, legacy `/onboarding/{pan|...}/`, or flat `/onboarding/documents/{file}`.
 * DB sometimes has parent typo GMMMP vs GMMP.
 */
function expandR2LookupCandidates(primary: string): string[] {
  const k = primary.trim();
  if (!k) return [];
  const seen = new Set<string>();
  const add = (s: string) => {
    const t = s.trim();
    if (t) seen.add(t);
  };

  const roots = merchantPathTypoVariants(k);
  for (const root of roots) {
    add(root);
    if (root.startsWith("merchants/") && !root.startsWith("docs/")) {
      add(`docs/${root}`);
    } else if (root.startsWith("docs/")) {
      const noDocs = root.replace(/^docs\//, "");
      if (noDocs) add(noDocs);
    }
    for (const ob of onboardingMenuToFlatKeys(root)) {
      add(ob);
      if (ob.startsWith("merchants/") && !ob.startsWith("docs/"))
        add(`docs/${ob}`);
      else if (ob.startsWith("docs/")) {
        const nd = ob.replace(/^docs\//, "");
        if (nd) add(nd);
      }
    }
    for (const ob of onboardingMenuLayoutVariants(root)) {
      add(ob);
      if (ob.startsWith("merchants/") && !ob.startsWith("docs/"))
        add(`docs/${ob}`);
      else if (ob.startsWith("docs/")) {
        const nd = ob.replace(/^docs\//, "");
        if (nd) add(nd);
      }
    }
    for (const ob of onboardingFlatMenuReferenceVariants(root)) {
      add(ob);
      if (ob.startsWith("merchants/") && !ob.startsWith("docs/"))
        add(`docs/${ob}`);
      else if (ob.startsWith("docs/")) {
        const nd = ob.replace(/^docs\//, "");
        if (nd) add(nd);
      }
    }
    for (const ob of flatMenuToOnboardingKeys(root)) {
      add(ob);
    }
    for (const ob of menuReferencePathVariants(root)) {
      add(ob);
      if (ob.startsWith("merchants/") && !ob.startsWith("docs/"))
        add(`docs/${ob}`);
      else if (ob.startsWith("docs/")) {
        const nd = ob.replace(/^docs\//, "");
        if (nd) add(nd);
      }
    }
    for (const ob of onboardingDocumentsPathVariants(root)) {
      add(ob);
      if (ob.startsWith("merchants/") && !ob.startsWith("docs/"))
        add(`docs/${ob}`);
      else if (ob.startsWith("docs/")) {
        const nd = ob.replace(/^docs\//, "");
        if (nd) add(nd);
      }
    }
    for (const ob of onboardingStoreMediaGalleryVariants(root)) {
      add(ob);
      if (ob.startsWith("merchants/") && !ob.startsWith("docs/"))
        add(`docs/${ob}`);
      else if (ob.startsWith("docs/")) {
        const nd = ob.replace(/^docs\//, "");
        if (nd) add(nd);
      }
    }
    for (const ob of onboardingStoreAssetsPathVariants(root)) {
      add(ob);
      if (ob.startsWith("merchants/") && !ob.startsWith("docs/"))
        add(`docs/${ob}`);
      else if (ob.startsWith("docs/")) {
        const nd = ob.replace(/^docs\//, "");
        if (nd) add(nd);
      }
    }
    for (const ob of onboardingAgreementPathVariants(root)) {
      add(ob);
      if (ob.startsWith("merchants/") && !ob.startsWith("docs/"))
        add(`docs/${ob}`);
      else if (ob.startsWith("docs/")) {
        const nd = ob.replace(/^docs\//, "");
        if (nd) add(nd);
      }
    }
    if (/\/menu_sheet_\d+$/.test(root)) {
      add(`${root}.csv`);
      if (root.startsWith("merchants/") && !root.startsWith("docs/"))
        add(`docs/${root}.csv`);
    }
  }

  return [...seen];
}

/**
 * Neutral 200x200 placeholder SVG returned when an image key was not found in
 * R2. Rendered by <img> without a console error, so a missing merchant logo /
 * gallery image doesn't produce red rows in every dashboard load.
 */
function MISSING_IMAGE_SVG(): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">` +
    `<rect width="200" height="200" fill="#f1f5f9"/>` +
    `<rect x="30" y="60" width="140" height="90" rx="8" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="2"/>` +
    `<circle cx="70" cy="95" r="10" fill="#94a3b8"/>` +
    `<path d="M40 145 L80 110 L110 130 L145 100 L160 145 Z" fill="#cbd5e1"/>` +
    `<text x="100" y="180" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="12" fill="#64748b">No image</text>` +
    `</svg>`
  );
}

/** Allow only our R2-related URLs for security. */
function isAllowedR2Url(decodedUrl: string): boolean {
  const base = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "";
  if (base && (decodedUrl.startsWith(base + "/") || decodedUrl === base))
    return true;
  if (/\.r2\.cloudflarestorage\.com/i.test(decodedUrl)) return true;
  if (/\.r2\.dev/i.test(decodedUrl)) return true;
  return false;
}

export async function GET(request: NextRequest) {
  try {
    const keyParam = request.nextUrl.searchParams.get("key");
    const urlParam = request.nextUrl.searchParams.get("url");

    let key: string | null = null;

    if (keyParam?.trim()) {
      try {
        key = decodeURIComponent(keyParam.trim());
      } catch {
        return NextResponse.json(
          { error: "Invalid key parameter" },
          { status: 400 },
        );
      }
    } else if (urlParam?.trim()) {
      let decodedUrl: string;
      try {
        decodedUrl = decodeURIComponent(urlParam.trim());
      } catch {
        return NextResponse.json(
          { error: "Invalid url parameter" },
          { status: 400 },
        );
      }
      if (!isAllowedR2Url(decodedUrl)) {
        return NextResponse.json({ error: "URL not allowed" }, { status: 403 });
      }
      key = keyFromUrl(decodedUrl);
    }

    if (!key?.trim()) {
      return NextResponse.json(
        { error: "Missing key or url parameter" },
        { status: 400 },
      );
    }

    // Some DB rows accidentally store double-encoded keys like `docs%252Fmerchants%252F...`.
    // Decode repeatedly so both `docs%2F...` and `docs%252F...` work.
    key = key.trim();
    for (let i = 0; i < 3; i++) {
      if (!/%2f/i.test(key)) break;
      try {
        const decoded = decodeURIComponent(key);
        if (decoded === key) break;
        key = decoded;
      } catch {
        break;
      }
    }
    key = normalizeR2ObjectKey(key);

    const publicBase = process.env.R2_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
    const usePublicRedirect =
      process.env.R2_PROXY_USE_PUBLIC_REDIRECT === "true" ||
      process.env.R2_PROXY_USE_PUBLIC_REDIRECT === "1";
    if (
      usePublicRedirect &&
      publicBase &&
      isPublicR2CdnBase(publicBase) &&
      !request.headers.get("range")
    ) {
      const publicPath = key.split("/").map(encodeURIComponent).join("/");
      return NextResponse.redirect(`${publicBase}/${publicPath}`, 307);
    }

    const bucket = process.env.R2_BUCKET_NAME;
    if (
      !bucket ||
      !process.env.R2_ACCESS_KEY ||
      !process.env.R2_SECRET_KEY ||
      !process.env.R2_ENDPOINT
    ) {
      return NextResponse.json({ error: "R2 not configured" }, { status: 500 });
    }

    const client = getR2Client();
    const rangeHeader = request.headers.get("range");
    const candidates = expandR2LookupCandidates(key.trim());
    let lastError: unknown = null;

    for (const objectKey of candidates) {
      try {
        const cmd = new GetObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          ...(rangeHeader ? { Range: rangeHeader } : {}),
        });
        const response = await client.send(cmd);
        if (!response.Body) {
          lastError = new Error("Empty object");
          continue;
        }
        const contentType = response.ContentType ?? "application/octet-stream";
        const headers = new Headers();
        headers.set("Content-Type", contentType);
        headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
        headers.set("Accept-Ranges", "bytes");
        const lowerType = contentType.toLowerCase();
        if (lowerType.includes("pdf") || lowerType.startsWith("image/")) {
          headers.set("Content-Disposition", "inline");
        }
        headers.set("X-Frame-Options", "SAMEORIGIN");
        if (response.ContentLength != null) {
          headers.set("Content-Length", String(response.ContentLength));
        }
        if (response.ContentRange) {
          headers.set("Content-Range", response.ContentRange);
        }
        headers.set("Access-Control-Allow-Origin", "*");
        const status = rangeHeader && response.ContentRange ? 206 : 200;
        return new NextResponse(response.Body as unknown as BodyInit, {
          status,
          headers,
        });
      } catch (e: unknown) {
        lastError = e;
        const name =
          e && typeof e === "object" && "name" in e
            ? String((e as { name?: unknown }).name)
            : "";
        if (name === "NoSuchKey") continue;
        if (name === "NotFound") continue;
        console.error("[attachments/proxy] GetObject:", objectKey, e);
        throw e;
      }
    }

    // Bucket name accidentally prefixed on key (legacy)
    const trimmed = key.trim();
    if (trimmed.startsWith(bucket + "/")) {
      const inner = trimmed.slice(bucket.length + 1);
      for (const objectKey of expandR2LookupCandidates(inner)) {
        try {
          const cmd = new GetObjectCommand({
            Bucket: bucket,
            Key: objectKey,
            ...(rangeHeader ? { Range: rangeHeader } : {}),
          });
          const response = await client.send(cmd);
          if (response.Body) {
            const contentType =
              response.ContentType ?? "application/octet-stream";
            const headers = new Headers();
            headers.set("Content-Type", contentType);
            headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
            headers.set("Accept-Ranges", "bytes");
            const lowerType = contentType.toLowerCase();
            if (lowerType.includes("pdf") || lowerType.startsWith("image/")) {
              headers.set("Content-Disposition", "inline");
            }
            headers.set("X-Frame-Options", "SAMEORIGIN");
            if (response.ContentLength != null) {
              headers.set("Content-Length", String(response.ContentLength));
            }
            if (response.ContentRange) {
              headers.set("Content-Range", response.ContentRange);
            }
            headers.set("Access-Control-Allow-Origin", "*");
            const status = rangeHeader && response.ContentRange ? 206 : 200;
            return new NextResponse(response.Body as unknown as BodyInit, {
              status,
              headers,
            });
          }
        } catch (e: unknown) {
          const name =
            e && typeof e === "object" && "name" in e
              ? String((e as { name?: unknown }).name)
              : "";
          if (name !== "NoSuchKey" && name !== "NotFound")
            console.error("[attachments/proxy] Retry:", e);
        }
      }
    }

    if (lastError && (lastError as { name?: string }).name !== "NoSuchKey") {
      console.error(
        "[attachments/proxy] Exhausted keys for:",
        key.slice(0, 120),
        lastError,
      );
    }
    // Image URLs (loaded via <img>): return a placeholder 200 so the browser
    // renders a fallback without logging a red 404 in the console. Documents
    // (PDF, CSV, other) still 404 — those hit dedicated viewers that need to
    // surface the missing-file error.
    const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)(\?|$)/i;
    if (IMAGE_EXT.test(key)) {
      const placeholder = MISSING_IMAGE_SVG();
      return new NextResponse(placeholder, {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=300",
          "X-Attachment-Fallback": "missing-object",
        },
      });
    }
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (err: unknown) {
    console.error("[attachments/proxy] Error:", err);
    return NextResponse.json(
      { error: "Failed to load attachment" },
      { status: 500 },
    );
  }
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
