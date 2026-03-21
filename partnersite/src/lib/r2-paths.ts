/**
 * R2 folder structure: parent first, then child.
 * All paths live under: docs/merchants/{merchant_parents.id}/stores/{store_public_id}/...
 * (`merchant_parents.id` is the PK; `store_id` / GMMC… is the store’s public / FK-style identifier.)
 *
 * SINGLE SOURCE OF TRUTH — use these helpers for every upload/read/delete.
 *
 * Structure:
 *
 *   docs/
 *     merchants/
 *       {parent_pk}/                      e.g. 52 (merchant_parents.id)
 *         logo/                             parent logo (registration)
 *           {timestamp}_{name}.{ext}
 *         assets/                           other parent assets (optional)
 *         draft/                            onboarding before store exists
 *           onboarding/
 *             documents/                    KYC / contracts — flat (files only, no subfolders)
 *             bank/                         bank proof + UPI QR during onboarding — flat (parallel to documents/)
 *             assets/banner | assets/gallery  store banner + gallery images during onboarding
 *             menu/                         flat menu reference uploads (step 3 API) — same pattern as documents/
 *             agreement/                  signed merchant contract PDF (step 9 submit)
 *             menu/pdf | menu/csv | menu/images  optional nested paths (e.g. final submit / legacy)
 *             store-media | store-media-gallery/  (logo; legacy gallery naming)
 *         stores/
 *           {store_code}/
 *             onboarding/
 *               documents/                  flat files only
 *               bank/                       flat bank / UPI uploads
 *               assets/banner | assets/gallery
 *               menu/pdf | menu/csv | menu/images
 *               agreement/                  signed contract PDF
 *               (same non-document onboarding types as draft)
 *             menu/                         menu reference files (img/pdf/csv) + post-onboarding edits
 *               items/                      optional per-item folder
 *                 {item_id}/
 *               csv/
 *               pdf/
 *             store-media/                  post-onboarding (editable: logo, banner, gallery)
 *               logo/ | banner/ | gallery/
 *             bank/                         post-onboarding bank/UPI (editable)
 */

export const R2_DOCS_PREFIX = 'docs';

/**
 * Object key prefix for all merchant-scoped paths (menu, stores, onboarding under parent).
 * Default `docs/merchants` → keys like `docs/merchants/42/stores/GMMC1017/...`.
 * If your R2 **bucket is already named `docs`**, set env `R2_MERCHANT_OBJECT_PREFIX=merchants`
 * so keys are `merchants/42/stores/...` at bucket root.
 */
const MERCHANT_PREFIX_ENV =
  typeof process !== 'undefined' && process.env.R2_MERCHANT_OBJECT_PREFIX?.trim()
    ? process.env.R2_MERCHANT_OBJECT_PREFIX.trim().replace(/\/+$/, '')
    : '';
export const R2_MERCHANT_PREFIX =
  MERCHANT_PREFIX_ENV.length > 0 ? MERCHANT_PREFIX_ENV : `${R2_DOCS_PREFIX}/merchants`;

/**
 * Non-document onboarding folders: .../onboarding/{type}/{fileName}
 * KYC / contract files: {@link getOnboardingDocumentsPath} (flat `documents/`).
 * Bank proof + UPI during registration: {@link getOnboardingBankPath} (flat `bank/`).
 * Menu reference files: {@link getOnboardingMenuPdfPath} etc. (`menu/pdf`, `menu/csv`, `menu/images`).
 */
export const R2_ONBOARDING_MENU_FOLDER = 'menu';
export const R2_ONBOARDING_MENU_PDF_SUBFOLDER = 'pdf';
export const R2_ONBOARDING_MENU_CSV_SUBFOLDER = 'csv';
export const R2_ONBOARDING_MENU_IMAGES_SUBFOLDER = 'images';

export const R2_ONBOARDING = {
  MENU_IMAGES: `${R2_ONBOARDING_MENU_FOLDER}/${R2_ONBOARDING_MENU_IMAGES_SUBFOLDER}`,
  MENU_CSV: `${R2_ONBOARDING_MENU_FOLDER}/${R2_ONBOARDING_MENU_CSV_SUBFOLDER}`,
  MENU_PDF: `${R2_ONBOARDING_MENU_FOLDER}/${R2_ONBOARDING_MENU_PDF_SUBFOLDER}`,
  STORE_MEDIA: 'store-media',
  STORE_MEDIA_GALLERY: 'store-media-gallery',
} as const;

/** Single folder for every onboarding document upload (no subfolders). */
export const R2_ONBOARDING_DOCUMENTS_FOLDER = 'documents';

/** Bank / UPI proofs during onboarding (no subfolders). */
export const R2_ONBOARDING_BANK_FOLDER = 'bank';

/** Signed merchant contract PDF during onboarding (no subfolders). */
export const R2_ONBOARDING_AGREEMENT_FOLDER = 'agreement';

/** Store banner + gallery during onboarding: `.../onboarding/assets/{banner|gallery}` */
export const R2_ONBOARDING_ASSETS_FOLDER = 'assets';
export const R2_ONBOARDING_ASSETS_BANNER_SUBFOLDER = 'banner';
export const R2_ONBOARDING_ASSETS_GALLERY_SUBFOLDER = 'gallery';

/** Logical doc kinds (DB / validation only — not used as R2 path segments). */
export const R2_ONBOARDING_DOCUMENT_TYPES = {
  PAN: 'pan',
  GST: 'gst',
  AADHAAR: 'aadhaar',
  FSSAI: 'fssai',
  PHARMA: 'pharma',
  BANK: 'bank',
  AGREEMENTS: 'agreements',
  OTHER: 'other',
} as const;

export type R2OnboardingDocType = keyof typeof R2_ONBOARDING_DOCUMENT_TYPES;

/**
 * DB typo: parent_merchant_id sometimes stored as GMMMP1005 (triple M). Used for proxy / legacy URL resolution only.
 */
export function normalizeParentMerchantIdForR2(parent: string | null | undefined): string {
  const p = (parent && String(parent).trim()) || "";
  if (!p) return "";
  if (/^GMMMP\d+$/i.test(p)) return p.replace(/^GMMMP/i, "GMMP");
  return p;
}

/**
 * Path segment for `docs/merchants/{segment}/...` — must be `merchant_parents.id` (numeric PK), not `parent_merchant_id` (GMMP…).
 */
export function merchantParentPrimaryKeySegmentForR2(id: string | number | null | undefined): string {
  if (id == null) return "unknown";
  const s = String(id).trim();
  return /^\d+$/.test(s) ? s : "unknown";
}

/** Parent root: `docs/merchants/{merchant_parents.id}` */
export function getParentRoot(parentPrimaryKey: string | number): string {
  const segment = merchantParentPrimaryKeySegmentForR2(parentPrimaryKey);
  return `${R2_MERCHANT_PREFIX}/${segment}`;
}

/** Parent logo folder: `docs/merchants/{merchant_parents.id}/logo` */
export function getParentLogoPath(parentPrimaryKey: string | number): string {
  return `${getParentRoot(parentPrimaryKey)}/logo`;
}

/** Full R2 key for parent logo */
export function getParentLogoKey(parentPrimaryKey: string | number, fileName: string): string {
  const base = getParentLogoPath(parentPrimaryKey);
  return fileName ? `${base}/${fileName}` : base;
}

/** Parent assets folder under `docs/merchants/{merchant_parents.id}/assets` */
export function getParentAssetsPath(parentPrimaryKey: string | number): string {
  return `${getParentRoot(parentPrimaryKey)}/assets`;
}

/** Child store root: `.../stores/{store_public_id}` */
export function getChildStoreRoot(parentPrimaryKey: string | number, childStoreCode: string): string {
  return `${getParentRoot(parentPrimaryKey)}/stores/${String(childStoreCode).trim()}`;
}

/** Draft root (onboarding before child store exists) */
export function getDraftRoot(parentPrimaryKey: string | number): string {
  return `${getParentRoot(parentPrimaryKey)}/draft`;
}

/**
 * Root for onboarding files: either child store or draft.
 * Uses parentId and optionally childStoreId (when created).
 */
export function getOnboardingR2Base(
  parentPrimaryKey: string | number,
  childStoreId: string | null | undefined
): string {
  const parentSeg = merchantParentPrimaryKeySegmentForR2(parentPrimaryKey);
  const child = childStoreId && String(childStoreId).trim();
  const root = child ? getChildStoreRoot(parentSeg, child) : getDraftRoot(parentSeg);
  return `${root}/onboarding`;
}

/** Prefix for menu / store-media onboarding folders: ".../onboarding/menu/pdf", ".../onboarding/store-media", etc. */
export function getOnboardingR2Path(
  parentPrimaryKey: string | number,
  childStoreId: string | null | undefined,
  subPath: keyof typeof R2_ONBOARDING
): string {
  const base = getOnboardingR2Base(parentPrimaryKey, childStoreId);
  const segment = R2_ONBOARDING[subPath];
  return segment ? `${base}/${segment}` : base;
}

/** `.../onboarding/menu/pdf` — menu PDF while registering. */
export function getOnboardingMenuPdfPath(
  parentPrimaryKey: string | number,
  childStoreId: string | null | undefined
): string {
  return getOnboardingR2Path(parentPrimaryKey, childStoreId, 'MENU_PDF');
}

/** `.../onboarding/menu/csv` — menu sheet (CSV/Excel) while registering. */
export function getOnboardingMenuCsvPath(
  parentPrimaryKey: string | number,
  childStoreId: string | null | undefined
): string {
  return getOnboardingR2Path(parentPrimaryKey, childStoreId, 'MENU_CSV');
}

/** `.../onboarding/menu/images` — menu image uploads while registering. */
export function getOnboardingMenuImagesPath(
  parentPrimaryKey: string | number,
  childStoreId: string | null | undefined
): string {
  return getOnboardingR2Path(parentPrimaryKey, childStoreId, 'MENU_IMAGES');
}

/** Flat folder for all onboarding documents: `.../onboarding/documents` (files only; no subdirs). */
export function getOnboardingDocumentsPath(
  parentPrimaryKey: string | number,
  childStoreId: string | null | undefined
): string {
  return `${getOnboardingR2Base(parentPrimaryKey, childStoreId)}/${R2_ONBOARDING_DOCUMENTS_FOLDER}`;
}

/** Flat folder for bank proof + UPI QR: `.../onboarding/bank` */
export function getOnboardingBankPath(
  parentPrimaryKey: string | number,
  childStoreId: string | null | undefined
): string {
  return `${getOnboardingR2Base(parentPrimaryKey, childStoreId)}/${R2_ONBOARDING_BANK_FOLDER}`;
}

/** Flat folder for signed agreement PDF: `.../onboarding/agreement` */
export function getOnboardingAgreementPath(
  parentPrimaryKey: string | number,
  childStoreId: string | null | undefined
): string {
  return `${getOnboardingR2Base(parentPrimaryKey, childStoreId)}/${R2_ONBOARDING_AGREEMENT_FOLDER}`;
}

/**
 * Flat folder for registration step-3 menu uploads: `.../onboarding/menu/{fileName}`
 * (parallel to `documents/` and `bank/` — all types: images, PDF, CSV).
 */
export function getOnboardingMenuReferenceFlatPath(
  parentPrimaryKey: string | number,
  childStoreId: string | null | undefined
): string {
  return `${getOnboardingR2Base(parentPrimaryKey, childStoreId)}/${R2_ONBOARDING_MENU_FOLDER}`;
}

/** Single canonical PDF object per store under onboarding menu (overwrites on re-upload). */
export function getOnboardingMenuReferenceCanonicalPdfKey(
  parentPrimaryKey: string | number,
  childStoreId: string | null | undefined
): string {
  return `${getOnboardingMenuReferenceFlatPath(parentPrimaryKey, childStoreId)}/menu-reference.pdf`;
}

/** Single canonical sheet object per extension (overwrites when same type; switch ext replaces key). */
export function getOnboardingMenuReferenceCanonicalSheetKey(
  parentPrimaryKey: string | number,
  childStoreId: string | null | undefined,
  ext: "csv" | "xlsx" | "xls"
): string {
  return `${getOnboardingMenuReferenceFlatPath(parentPrimaryKey, childStoreId)}/menu-reference-sheet.${ext}`;
}

/** Post-onboarding menu PDF — one object per store. */
export function getMerchantMenuCanonicalPdfKey(storeId: string, parentId?: string | null): string {
  return `${getMerchantMenuPath(storeId, parentId)}/menu-reference.pdf`;
}

/** Post-onboarding menu sheet — one object per extension. */
export function getMerchantMenuCanonicalSheetKey(
  storeId: string,
  ext: "csv" | "xlsx" | "xls",
  parentId?: string | null
): string {
  return `${getMerchantMenuPath(storeId, parentId)}/menu-reference-sheet.${ext}`;
}

/** `.../onboarding/assets/banner` — store banner image(s) while registering. */
export function getOnboardingAssetsBannerPath(
  parentPrimaryKey: string | number,
  childStoreId: string | null | undefined
): string {
  return `${getOnboardingR2Base(parentPrimaryKey, childStoreId)}/${R2_ONBOARDING_ASSETS_FOLDER}/${R2_ONBOARDING_ASSETS_BANNER_SUBFOLDER}`;
}

/**
 * `.../onboarding/assets/gallery` — store gallery images while registering.
 * R2 has no empty “folders”: the `gallery/` prefix only appears in the console after at least one object is uploaded here.
 */
export function getOnboardingAssetsGalleryPath(
  parentPrimaryKey: string | number,
  childStoreId: string | null | undefined
): string {
  return `${getOnboardingR2Base(parentPrimaryKey, childStoreId)}/${R2_ONBOARDING_ASSETS_FOLDER}/${R2_ONBOARDING_ASSETS_GALLERY_SUBFOLDER}`;
}

/**
 * Same as {@link getOnboardingDocumentsPath}. `docType` is ignored (kept for call-site compatibility).
 */
export function getOnboardingDocumentPath(
  parentPrimaryKey: string | number,
  childStoreId: string | null | undefined,
  _docType?: R2OnboardingDocType
): string {
  return getOnboardingDocumentsPath(parentPrimaryKey, childStoreId);
}

/** `merchant_parents.id` as string — same segment as {@link getParentRoot}. */
export function getMerchantMenuParentKeySegment(parentPrimaryKey: string | number | null | undefined): string {
  return merchantParentPrimaryKeySegmentForR2(parentPrimaryKey);
}

/**
 * Menu reference + menu item files under R2. Always uses `docs/merchants/...` so partner menu uploads
 * match the bucket layout regardless of `R2_MERCHANT_OBJECT_PREFIX` (that env only affects non-menu paths).
 *
 * With parent: `docs/merchants/{merchant_parents.id}/stores/{storePublicId}/menu`
 * Legacy (no parent): `docs/merchants/{storePublicId}/menu`
 */
export const R2_MENU_REFERENCE_PREFIX = `${R2_DOCS_PREFIX}/merchants`;

export function getMerchantMenuPath(storeId: string, parentId?: string | null): string {
  const sid = String(storeId || "").trim() || "unknown";
  if (parentId && String(parentId).trim()) {
    const p = getMerchantMenuParentKeySegment(parentId);
    return `${R2_MENU_REFERENCE_PREFIX}/${p}/stores/${sid}/menu`;
  }
  return `${R2_MENU_REFERENCE_PREFIX}/${sid}/menu`;
}

/** Post-onboarding menu item images folder: ".../menu/items/{itemId}" (optional; can use menu/ with unique filenames). */
export function getMerchantMenuItemPath(storeId: string, itemId: string, parentId?: string | null): string {
  return `${getMerchantMenuPath(storeId, parentId)}/items/${itemId}`;
}

/** Post-onboarding menu CSV folder: ".../menu/csv". */
export function getMerchantMenuCsvPath(storeId: string, parentId?: string | null): string {
  return `${getMerchantMenuPath(storeId, parentId)}/csv`;
}

/** Post-onboarding menu PDF folder: ".../menu/pdf". */
export function getMerchantMenuPdfPath(storeId: string, parentId?: string | null): string {
  return `${getMerchantMenuPath(storeId, parentId)}/pdf`;
}

/**
 * Post-onboarding store assets: "docs/merchants/{parentId}/stores/{storeId}/assets".
 * If parentId is omitted, falls back to "docs/merchants/{storeId}/assets".
 */
export function getMerchantAssetsPath(storeId: string, parentId?: string | null): string {
  if (parentId && String(parentId).trim()) {
    return `${getParentRoot(parentId)}/stores/${storeId}/assets`;
  }
  return `${R2_MERCHANT_PREFIX}/${storeId}/assets`;
}

/** Post-onboarding store-media subfolder: logo, banner, or gallery (editable from dashboard). */
export function getMerchantStoreMediaPath(
  storeId: string,
  sub: 'logo' | 'banner' | 'gallery',
  parentId?: string | null
): string {
  const base = parentId && String(parentId).trim()
    ? `${getParentRoot(parentId)}/stores/${storeId}/store-media`
    : `${R2_MERCHANT_PREFIX}/${storeId}/store-media`;
  return `${base}/${sub}`;
}

/**
 * Menu reference uploads (onboarding step 3): `docs/merchants/{parentPk}/stores/{storePublicId}/menu/{fileName}`.
 * Alternate layout .../merchants/{parent}/menu/{storePublicId}/ is resolved by /api/attachments/proxy.
 */
export function getMenuUploadR2Key(
  parentPrimaryKey: string | number,
  storePublicId: string,
  _attachmentType: "images" | "pdf" | "csv",
  uniqueFileName: string
): string {
  const fileName = (uniqueFileName && String(uniqueFileName).trim()) || "";
  const base = getMerchantMenuPath(storePublicId, String(parentPrimaryKey));
  return fileName ? `${base}/${fileName}` : base;
}

/** Offer images: "merchants/{parentId}/stores/{storeId}/offers" or "merchants/{storeId}/offers" */
export function getOffersR2Path(storeId: string, parentId?: string | null): string {
  if (parentId && String(parentId).trim()) {
    return `${getParentRoot(parentId)}/stores/${storeId}/offers`;
  }
  return `${R2_MERCHANT_PREFIX}/${storeId}/offers`;
}

/**
 * Post-onboarding bank/UPI attachments: "merchants/{parentId}/stores/{storeId}/bank/{fileName}"
 * Used when merchant adds or edits bank/UPI from Payments; fileName should be unique (e.g. proof_{bankAccountId}_{ts}.ext).
 */
export function getMerchantBankAttachmentPath(
  storeId: string,
  fileName: string,
  parentId?: string | null
): string {
  const base = parentId && String(parentId).trim()
    ? `${getParentRoot(parentId)}/stores/${storeId}/bank`
    : `${R2_MERCHANT_PREFIX}/${storeId}/bank`;
  return fileName ? `${base}/${fileName}` : base;
}

/** DB `mime_type` for menu spreadsheet rows from stored original filename (CSV / Excel). */
export function menuSpreadsheetMimeFromFileName(fileName: string | null | undefined): string {
  const n = (fileName || "").toLowerCase();
  if (n.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (n.endsWith(".xls")) return "application/vnd.ms-excel";
  if (n.endsWith(".csv")) return "text/csv";
  return "application/octet-stream";
}

/**
 * Menu reference object basename for dashboard uploads:
 * `merchants/.../menu/{timestamp}_{sanitizedFileName}`.
 */
export function getMenuReferenceUploadFileName(originalFileName: string): string {
  const ts = Date.now();
  const sanitized =
    (originalFileName || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "file";
  return `${ts}_${sanitized}`;
}

/** Safe R2 object name for onboarding menu sheet upload; keeps .csv / .xls / .xlsx. */
export function safeMenuSpreadsheetObjectName(file: File): string {
  const raw = file.name || "menu";
  const base = raw.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "menu_sheet";
  const lower = base.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".xlsx") || lower.endsWith(".xls")) return base;
  const mime = (file.type || "").toLowerCase();
  const stem = base.includes(".") ? base.slice(0, base.lastIndexOf(".")) : base;
  if (mime.includes("spreadsheetml")) return `${stem || "menu_sheet"}.xlsx`;
  if (mime === "application/vnd.ms-excel") return `${stem || "menu_sheet"}.xls`;
  if (mime.includes("csv") || mime === "text/plain") return `${stem || "menu_sheet"}.csv`;
  return `${stem || "menu_sheet"}.csv`;
}
