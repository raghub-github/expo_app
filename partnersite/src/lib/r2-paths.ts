/**
 * R2 folder structure: parent first, then child.
 * All paths live under: docs/merchants/{parent_code}/ [then optionally stores/{store_code}/]
 *
 * SINGLE SOURCE OF TRUTH — use these helpers for every upload/read/delete.
 *
 * Structure:
 *
 *   docs/
 *     merchants/
 *       {parent_code}/                      e.g. GMMP1005 (parent first)
 *         logo/                             parent logo (registration)
 *           {timestamp}_{name}.{ext}
 *         assets/                           other parent assets (optional)
 *         draft/                            onboarding before store exists
 *           onboarding/
 *             documents/
 *               pan/
 *               aadhaar/
 *               fssai/
 *               gst/
 *               bank/
 *               agreements/
 *               other/
 *             menu/
 *               images/
 *               csv/
 *               pdf/
 *             store-media/
 *               logo/
 *               banner/
 *             store-media/
 *               gallery/
 *             bank/
 *             agreements/
 *         stores/
 *           {store_code}/                   e.g. GMMC1017 (child)
 *             onboarding/
 *               documents/
 *                 pan/ | aadhaar/ | fssai/ | gst/ | bank/ | agreements/ | other/
 *               menu/
 *                 images/ | csv/ | pdf/
 *               store-media/  (logo, banner)
 *               store-media/gallery/
 *               bank/
 *               agreements/
 *             menu/                         post-onboarding (editable)
 *               items/                      optional per-item folder
 *                 {item_id}/
 *               csv/
 *               pdf/
 *             store-media/                  post-onboarding (editable: logo, banner, gallery)
 *               logo/ | banner/ | gallery/
 *             bank/                         post-onboarding bank/UPI (editable)
 *             documents/                    read-only refs; do not overwrite PAN/Aadhaar/GST/FSSAI/contract
 */

export const R2_DOCS_PREFIX = 'docs';
export const R2_MERCHANT_PREFIX = `${R2_DOCS_PREFIX}/merchants`;

export const R2_ONBOARDING = {
  DOCUMENTS: 'documents',
  MENU_IMAGES: 'menu/images',
  MENU_CSV: 'menu/csv',
  MENU_PDF: 'menu/pdf',
  STORE_MEDIA: 'store-media',
  STORE_MEDIA_GALLERY: 'store-media/gallery',
  BANK: 'bank',
  AGREEMENTS: 'agreements',
} as const;

/** Document subfolder names under onboarding/documents (for PAN, Aadhaar, FSSAI, GST, bank, contract, etc.) */
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

/** Parent root: "docs/merchants/{parentMerchantCode}" — use merchant code (e.g. GMMP1005), not numeric id. */
export function getParentRoot(parentMerchantCode: string): string {
  const id = (parentMerchantCode && String(parentMerchantCode).trim()) || 'unknown';
  return `${R2_MERCHANT_PREFIX}/${id}`;
}

/** Parent logo folder: "docs/merchants/{parentId}/logo" */
export function getParentLogoPath(parentId: string): string {
  return `${getParentRoot(parentId)}/logo`;
}

/** Full R2 key for parent logo: "docs/merchants/{parentId}/logo/{fileName}" */
export function getParentLogoKey(parentId: string, fileName: string): string {
  const base = getParentLogoPath(parentId);
  return fileName ? `${base}/${fileName}` : base;
}

/** Parent assets folder: "merchants/{parentId}/assets" */
export function getParentAssetsPath(parentId: string): string {
  return `${getParentRoot(parentId)}/assets`;
}

/** Child store root: "merchants/{parentId}/stores/{childStoreCode}" */
export function getChildStoreRoot(parentId: string, childStoreCode: string): string {
  return `${getParentRoot(parentId)}/stores/${String(childStoreCode).trim()}`;
}

/** Draft root (onboarding before child store exists): "merchants/{parentId}/draft" */
export function getDraftRoot(parentId: string): string {
  return `${getParentRoot(parentId)}/draft`;
}

/**
 * Root for onboarding files: either child store or draft.
 * Uses parentId and optionally childStoreId (when created).
 */
export function getOnboardingR2Base(
  parentId: string,
  childStoreId: string | null | undefined
): string {
  const parent = (parentId && String(parentId).trim()) || 'unknown';
  const child = childStoreId && String(childStoreId).trim();
  const root = child ? getChildStoreRoot(parent, child) : getDraftRoot(parent);
  return `${root}/onboarding`;
}

/** Full path for onboarding upload (e.g. ".../onboarding/documents", ".../onboarding/menu/images") */
export function getOnboardingR2Path(
  parentId: string,
  childStoreId: string | null | undefined,
  subPath: keyof typeof R2_ONBOARDING
): string {
  const base = getOnboardingR2Base(parentId, childStoreId);
  const segment = R2_ONBOARDING[subPath];
  return segment ? `${base}/${segment}` : base;
}

/**
 * Path for onboarding documents by type: ".../onboarding/documents/pan", ".../onboarding/documents/aadhaar", etc.
 * Use for PAN, Aadhaar, FSSAI, GST, bank, agreements so each type has its own folder.
 */
export function getOnboardingDocumentPath(
  parentId: string,
  childStoreId: string | null | undefined,
  docType: R2OnboardingDocType
): string {
  const documentsBase = getOnboardingR2Path(parentId, childStoreId, 'DOCUMENTS');
  const sub = R2_ONBOARDING_DOCUMENT_TYPES[docType] ?? R2_ONBOARDING_DOCUMENT_TYPES.OTHER;
  return `${documentsBase}/${sub}`;
}

/**
 * Post-onboarding menu root: "docs/merchants/{parentId}/stores/{storeId}/menu".
 * If parentId is omitted, falls back to "docs/merchants/{storeId}/menu".
 */
export function getMerchantMenuPath(storeId: string, parentId?: string | null): string {
  if (parentId && String(parentId).trim()) {
    return `${getParentRoot(parentId)}/stores/${storeId}/menu`;
  }
  return `${R2_MERCHANT_PREFIX}/${storeId}/menu`;
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
 * Menu uploads (onboarding step 3): strict one-type-per-store.
 * Path (hierarchical): docs/merchants/{parent_code}/stores/{store_code}/onboarding/menu/{images|pdf|csv}/{uniqueId}.{ext}
 * - parent_code: merchant_parents.parent_merchant_id (e.g. GMMP1007)
 * - store_code: merchant_stores.store_id (e.g. GMMC1017)
 * - attachment_type: 'images' | 'pdf' | 'csv'
 */
export const R2_MENU_UPLOADS_PREFIX = "menu-uploads";

export function getMenuUploadR2Key(
  parentMerchantId: string,
  storePublicId: string,
  attachmentType: "images" | "pdf" | "csv",
  uniqueFileName: string
): string {
  const parent = (parentMerchantId && String(parentMerchantId).trim()) || "unknown";
  const store = (storePublicId && String(storePublicId).trim()) || "unknown";
  const subPath: "MENU_IMAGES" | "MENU_PDF" | "MENU_CSV" =
    attachmentType === "images" ? "MENU_IMAGES" :
    attachmentType === "pdf" ? "MENU_PDF" :
    "MENU_CSV";
  const base = getOnboardingR2Path(parent, store, subPath);
  const fileName = (uniqueFileName && String(uniqueFileName).trim()) || "";
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
