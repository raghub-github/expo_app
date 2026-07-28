"use client";

import { useState, useRef, useEffect, useMemo, type ReactNode } from 'react';
import { Loader2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { R2Image } from "@/components/R2Image";
import { refreshAuthIfNeeded } from "@/lib/auth/client-auth-handler";
import { DigilockerConsentSheet, openDigilockerLoadingPopup } from "@/components/onboarding/DigilockerConsentSheet";
import {
  isMaskedAadhaar,
  maskAadhaarNumber,
  normalizeAadhaarVerifiedDetails,
} from "@/lib/mask-aadhaar";
import { pickGstFetchedBusinessInfo, pickBankFetchedInfo, pickUpiFetchedInfo } from "@/lib/merchant-doc-auto-verification";
import { rejectionDetailForDocType } from "@/lib/merchant-store-document-rejection";

/** Cashfree requires https:// — DigiLocker return page notifies the opener via postMessage. */
function digilockerRedirectUrl(): string {
  if (typeof window === "undefined") {
    return "https://partner.gatimitra.com/auth/digilocker-return";
  }
  try {
    const u = new URL("/auth/digilocker-return", window.location.origin);
    u.protocol = "https:";
    // Same-tab / mobile fallback: bounce back to this exact docs page after consent.
    u.searchParams.set("return", window.location.href);
    return u.toString();
  } catch {
    return "https://partner.gatimitra.com/auth/digilocker-return";
  }
}

interface DocumentData {
  pan_number: string;
  pan_holder_name: string;
  pan_image: File | null;
  pan_image_url?: string;
  aadhar_number: string;
  aadhar_holder_name: string;
  aadhar_front: File | null;
  aadhar_front_url?: string;
  aadhar_back: File | null;
  aadhar_back_url?: string;
  fssai_number: string;
  fssai_image: File | null;
  fssai_image_url?: string;
  gst_number: string;
  gst_image: File | null;
  gst_image_url?: string;
  gst_legal_business_name?: string;
  gst_principal_place_of_business?: string;
  gst_effective_registration_date?: string;
  drug_license_number: string;
  drug_license_image: File | null;
  drug_license_image_url?: string;
  pharmacist_registration_number: string;
  pharmacist_certificate: File | null;
  pharmacist_certificate_url?: string;
  pharmacy_council_registration: File | null;
  pharmacy_council_registration_url?: string;
  fssai_expiry_date: string;
  drug_license_expiry_date: string;
  pharmacist_expiry_date: string;
  trade_license_number: string;
  trade_license_document: File | null;
  trade_license_document_url?: string;
  trade_license_expiry_date: string;
  shop_establishment_number: string;
  shop_establishment_document: File | null;
  shop_establishment_document_url?: string;
  shop_establishment_expiry_date: string;
  udyam_number: string;
  udyam_document: File | null;
  udyam_document_url?: string;
  other_document_type: string;
  other_document_number: string;
  other_document_name: string;
  other_document_file: File | null;
  other_document_file_url?: string;
  other_document_expiry_date: string;
  bank?: {
    payout_method: 'bank' | 'upi';
    account_holder_name: string;
    account_number: string;
    ifsc_code: string;
    bank_name: string;
    branch_name?: string;
    account_type?: string;
    upi_id?: string;
    bank_proof_type?: 'passbook' | 'cancelled_cheque' | 'bank_statement';
    bank_proof_file?: File | null;
    bank_proof_file_url?: string;
    upi_qr_file?: File | null;
    upi_qr_screenshot_url?: string;
    bank_is_verified?: boolean;
    upi_verified?: boolean;
    upi_verified_details?: Record<string, unknown> | null;
    bank_verified_at?: string | null;
    bank_verification_method?: string | null;
    bank_verified_details?: Record<string, unknown> | null;
  };
  [key: string]: any;
}

const IMAGE_EXT_REGEX = /\.(png|jpe?g|webp|gif|bmp)$/i;

/** Non-empty admin rejection reason from merchant_store_documents.*_rejection_reason */
function adminRejectionText(d: Record<string, unknown>, key: string): string | null {
  const v = d[key];
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function SectionRejectedBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        active ? 'bg-rose-400/95 text-white' : 'bg-rose-100 text-rose-800'
      }`}
    >
      Rejected
    </span>
  );
}

function AdminRejectionBanner({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 shadow-sm">
      <p className="text-sm font-semibold text-rose-900">{title}</p>
      <div className="mt-1.5 text-xs text-rose-800 whitespace-pre-wrap break-words">{children}</div>
    </div>
  );
}

/** Mirrors merchant_store_documents.*_rejection_reason — hydrated from GET progress / parent. */
const DOC_REJECTION_FIELDS = [
  'pan_rejection_reason',
  'gst_rejection_reason',
  'aadhaar_rejection_reason',
  'fssai_rejection_reason',
  'drug_license_rejection_reason',
  'pharmacist_certificate_rejection_reason',
  'pharmacy_council_registration_rejection_reason',
  'trade_license_rejection_reason',
  'shop_establishment_rejection_reason',
  'udyam_rejection_reason',
  'other_rejection_reason',
  'bank_proof_rejection_reason',
] as const;

const MIN_STORE_DELIVERY_RADIUS_KM = 1;
const MAX_STORE_DELIVERY_RADIUS_KM = 8;

/** Client-side: turn R2 public / S3-style URLs into same-origin proxy (private buckets break raw https in <img>). */
function httpR2UrlToProxyIfNeeded(s: string): string | null {
  try {
    const u = new URL(s);
    const h = u.hostname.toLowerCase();
    if (!h.endsWith('.r2.dev') && !h.endsWith('.r2.cloudflarestorage.com')) return null;
    let path = u.pathname.replace(/^\/+/, '');
    if (!path) return null;
    const pl = path.toLowerCase();
    if (pl.startsWith('docs/merchants/') || /^merchants\/[^/]+\/(stores|draft)\b/i.test(path)) {
      return `/api/attachments/proxy?key=${encodeURIComponent(path)}`;
    }
    const docIdx = path.toLowerCase().indexOf('docs/merchants/');
    if (docIdx >= 0) return `/api/attachments/proxy?key=${encodeURIComponent(path.slice(docIdx))}`;
    const merMatch = path.match(/(^|\/)(merchants\/[^/]+\/(?:stores|draft)\/.+)/i);
    if (merMatch?.[2]) return `/api/attachments/proxy?key=${encodeURIComponent(merMatch[2])}`;
    const slash = path.indexOf('/');
    if (slash > 0 && !path.startsWith('docs/')) {
      const rest = path.slice(slash + 1);
      if (rest.startsWith('docs/') || /^merchants\/[^/]+\//i.test(rest)) {
        return `/api/attachments/proxy?key=${encodeURIComponent(rest)}`;
      }
    }
    return `/api/attachments/proxy?key=${encodeURIComponent(path)}`;
  } catch {
    return null;
  }
}

const isImageUrlForPreview = (url?: string) => {
  if (!url || typeof url !== 'string') return false;
  const clean = url.split('?')[0];
  if (IMAGE_EXT_REGEX.test(clean)) return true;
  try {
    const u = new URL(url, 'http://localhost');
    if (!u.pathname.includes('attachments/proxy')) return false;
    const key = u.searchParams.get('key');
    if (!key) return false;
    try {
      const decoded = decodeURIComponent(key);
      return IMAGE_EXT_REGEX.test(decoded);
    } catch {
      return IMAGE_EXT_REGEX.test(key);
    }
  } catch {
    return false;
  }
};

function useImagePreview(file: File | null, existingUrl?: string) {
  const [objectUrl, setObjectUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (file && file.type && file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setObjectUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    }
    setObjectUrl(undefined);
    return;
  }, [file]);

  if (file && (file as any).type && (file as any).type.startsWith('image/') && objectUrl) {
    return objectUrl;
  }
  if (!existingUrl || typeof existingUrl !== 'string') return undefined;
  const trimmed = existingUrl.trim();
  if (!trimmed || isLikelyPdf(null, trimmed)) return undefined;
  if (isImageUrlForPreview(trimmed)) {
    return normalizeDocumentThumbSrc(trimmed) ?? trimmed;
  }
  const normalized = normalizeDocumentThumbSrc(trimmed);
  if (normalized?.includes('/api/attachments/proxy?')) return normalized;
  return undefined;
}

function isLikelyPdf(file: File | null, url?: string): boolean {
  if (file?.type === 'application/pdf') return true;
  if (!url) return false;
  const pathOnly = url.split('?')[0].toLowerCase();
  if (pathOnly.endsWith('.pdf')) return true;
  try {
    const u = new URL(url, 'http://localhost');
    const k = u.searchParams.get('key');
    if (k && decodeURIComponent(k).toLowerCase().endsWith('.pdf')) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Turns stored step4 / DB values into a same-origin URL the browser can load in <img> or <iframe>.
 * Handles: /api/attachments/proxy?key=…, missing leading slash, and bare R2 object keys.
 */
function normalizeDocumentThumbSrc(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (s.startsWith('blob:') || s.startsWith('data:')) return s;
  if (s.startsWith('http://') || s.startsWith('https://')) {
    const proxied = httpR2UrlToProxyIfNeeded(s);
    if (proxied) return proxied;
    return s;
  }
  let t = s;
  if (/^api\/attachments\/proxy/i.test(t)) t = `/${t}`;
  if (t.startsWith('/api/attachments/proxy')) return t;
  if (/^(?:docs\/)?merchants\//i.test(t) || t.includes('/onboarding/')) {
    return `/api/attachments/proxy?key=${encodeURIComponent(t)}`;
  }
  return t.startsWith('/') ? t : null;
}

type DocPreviewPayload = {
  title: string;
  file: File | null;
  url?: string;
  imagePreviewUrl?: string;
};

function DocPreviewOverlay({
  payload,
  onClose,
}: {
  payload: DocPreviewPayload;
  onClose: () => void;
}) {
  const { title, file, url, imagePreviewUrl } = payload;
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (file) {
      const u = URL.createObjectURL(file);
      setBlobUrl(u);
      return () => URL.revokeObjectURL(u);
    }
    setBlobUrl(null);
    return;
  }, [file]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pdf = isLikelyPdf(file, url);
  const resolvedRemote = url ? normalizeDocumentThumbSrc(url) : null;
  const pdfSrc = pdf ? blobUrl || resolvedRemote || url || '' : '';
  const remoteImgSrc =
    !pdf && !imagePreviewUrl && !(blobUrl && file?.type?.startsWith('image/')) && url
      ? resolvedRemote
      : null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm"
      aria-modal="true"
      role="dialog"
      aria-labelledby="doc-preview-title"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 id="doc-preview-title" className="text-sm font-semibold text-slate-800">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close preview"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-slate-50 p-4">
          {pdf ? (
            pdfSrc ? (
              <iframe title={title} src={pdfSrc} className="h-[min(75vh,720px)] w-full rounded-lg border border-slate-200 bg-white" />
            ) : (
              <p className="py-8 text-center text-sm text-slate-600">PDF preview is not available.</p>
            )
          ) : imagePreviewUrl ? (
            <img src={imagePreviewUrl} alt={title} className="mx-auto max-h-[min(75vh,720px)] w-full object-contain" />
          ) : blobUrl && file?.type?.startsWith('image/') ? (
            <img src={blobUrl} alt={title} className="mx-auto max-h-[min(75vh,720px)] w-full object-contain" />
          ) : remoteImgSrc ? (
            <img src={remoteImgSrc} alt={title} className="mx-auto max-h-[min(75vh,720px)] w-full object-contain" />
          ) : (
            <p className="py-8 text-center text-sm text-slate-600">Preview is not available for this file type.</p>
          )}
        </div>
      </div>
    </div>
  );
}

interface StoreSetupData {
  logo: File | null;
  logo_preview: string;
  banner: File | null;
  banner_preview: string;
  gallery_images: (File | null)[];
  gallery_previews: string[];
  cuisine_types: string[];
  food_categories: string[];
  avg_preparation_time_minutes: number;
  min_order_amount: number;
  /** Default 5; `''` while the field is cleared (e.g. backspace). */
  delivery_radius_km: number | '';
  is_pure_veg: boolean;
  accepts_online_payment: boolean;
  accepts_cash: boolean;
  store_hours: {
    monday: { closed: boolean; slot1_open: string; slot1_close: string; slot2_open: string; slot2_close: string };
    tuesday: { closed: boolean; slot1_open: string; slot1_close: string; slot2_open: string; slot2_close: string };
    wednesday: { closed: boolean; slot1_open: string; slot1_close: string; slot2_open: string; slot2_close: string };
    thursday: { closed: boolean; slot1_open: string; slot1_close: string; slot2_open: string; slot2_close: string };
    friday: { closed: boolean; slot1_open: string; slot1_close: string; slot2_open: string; slot2_close: string };
    saturday: { closed: boolean; slot1_open: string; slot1_close: string; slot2_open: string; slot2_close: string };
    sunday: { closed: boolean; slot1_open: string; slot1_close: string; slot2_open: string; slot2_close: string };
  };
  [key: string]: any;
}

type DocActiveSection = 'pan' | 'aadhar' | 'licence' | 'gst' | 'bank' | 'other';

function normalizeStep4ActiveSection(raw: string): DocActiveSection | null {
  const section = raw === 'optional' ? 'licence' : raw;
  const valid = new Set<DocActiveSection>(['pan', 'aadhar', 'licence', 'gst', 'bank', 'other']);
  return valid.has(section as DocActiveSection) ? (section as DocActiveSection) : null;
}

/** Which Store Documents tabs have open admin rejections (for verification-fix lock). */
function rejectedDocSectionsFromDocuments(
  d: Record<string, unknown>,
  bankRejectionExtra?: string | null
): DocActiveSection[] {
  const out: DocActiveSection[] = [];
  if (adminRejectionText(d, 'pan_rejection_reason')) out.push('pan');
  if (adminRejectionText(d, 'aadhaar_rejection_reason')) out.push('aadhar');

  const detailRoot =
    (d.step4_rejection_details && typeof d.step4_rejection_details === 'object'
      ? d.step4_rejection_details
      : null) ||
    (d.step_rejection_detail && typeof d.step_rejection_detail === 'object'
      ? d.step_rejection_detail
      : null);

  const licenceRejected = Boolean(
    adminRejectionText(d, 'fssai_rejection_reason') ||
      adminRejectionText(d, 'drug_license_rejection_reason') ||
      adminRejectionText(d, 'pharmacist_certificate_rejection_reason') ||
      adminRejectionText(d, 'pharmacy_council_registration_rejection_reason') ||
      adminRejectionText(d, 'trade_license_rejection_reason') ||
      adminRejectionText(d, 'shop_establishment_rejection_reason') ||
      adminRejectionText(d, 'udyam_rejection_reason') ||
      adminRejectionText(d, 'other_rejection_reason') ||
      rejectionDetailForDocType(detailRoot, 'fssai') ||
      rejectionDetailForDocType(detailRoot, 'drug_license') ||
      rejectionDetailForDocType(detailRoot, 'pharmacist_certificate') ||
      rejectionDetailForDocType(detailRoot, 'pharmacy_council_registration') ||
      rejectionDetailForDocType(detailRoot, 'trade_license') ||
      rejectionDetailForDocType(detailRoot, 'shop_establishment') ||
      rejectionDetailForDocType(detailRoot, 'udyam') ||
      rejectionDetailForDocType(detailRoot, 'other')
  );
  if (licenceRejected) out.push('licence');

  if (
    adminRejectionText(d, 'gst_rejection_reason') ||
    rejectionDetailForDocType(detailRoot, 'gst')
  ) {
    out.push('gst');
  }

  const bankFromDoc = adminRejectionText(d, 'bank_proof_rejection_reason');
  const bankExtra =
    typeof bankRejectionExtra === 'string' && bankRejectionExtra.trim()
      ? bankRejectionExtra.trim()
      : null;
  if (bankFromDoc || bankExtra || rejectionDetailForDocType(detailRoot, 'bank_proof')) {
    out.push('bank');
  }

  // PAN / Aadhaar from structured detail when reason string is empty
  if (!out.includes('pan') && rejectionDetailForDocType(detailRoot, 'pan')) out.unshift('pan');
  if (!out.includes('aadhar') && rejectionDetailForDocType(detailRoot, 'aadhaar')) {
    const panIdx = out.indexOf('pan');
    out.splice(panIdx >= 0 ? panIdx + 1 : 0, 0, 'aadhar');
  }

  return out;
}

interface CombinedComponentProps {
  initialDocuments?: Partial<DocumentData> | null;
  /** Active dashboard verification step 6 (bank) rejection text when not yet on `bank_proof_rejection_reason`. */
  verificationBankRejectionReason?: string | null;
  /**
   * When true (partner step 4 locked for verification fix): open the first rejected doc tab
   * and disable all non-rejected tabs (PAN / Aadhaar / GST / Bank / etc.).
   */
  verificationDocFixActive?: boolean;
  initialStoreSetup?: Partial<StoreSetupData> | null;
  onDocumentComplete?: (documents: DocumentData, savedPatch?: Record<string, unknown>) => void | Promise<void>;
  /** Called on every "Save & Continue" to persist current doc data. Returns the built patch so completion can reuse it (avoids duplicate bank/doc uploads). */
  onDocumentSave?: (documents: DocumentData) => void | Promise<Record<string, unknown> | undefined>;
  onStoreSetupComplete?: (storeSetup: StoreSetupData) => void;
  /** Live sync of Step 5 form state to parent (cuisines, radius, hours, etc.). */
  onStoreSetupChange?: (storeSetup: StoreSetupData) => void;
  /** Called instantly when store hours toggles/slots change to persist to DB. */
  onStoreHoursSave?: (hours: StoreSetupData['store_hours']) => void | Promise<void>;
  /** Called instantly when Store Features toggles (pure veg, online payment, cash) change to persist to DB. */
  onStoreFeaturesSave?: (patch: { is_pure_veg?: boolean; accepts_online_payment?: boolean; accepts_cash?: boolean }) => void | Promise<void>;
  onBack: () => void;
  actionLoading?: boolean;
  businessType?: string;
  storeType?: string;
  initialStep?: 'documents' | 'store-setup';
}

const defaultStoreSetupData: StoreSetupData = {
  logo: null,
  logo_preview: "",
  banner: null,
  banner_preview: "",
  gallery_images: [],
  gallery_previews: [],
  cuisine_types: [],
  food_categories: [],
  avg_preparation_time_minutes: 30,
  min_order_amount: 0,
  delivery_radius_km: 5,
  is_pure_veg: false,
  accepts_online_payment: true,
  accepts_cash: false,
  store_hours: {
    monday: { closed: false, slot1_open: "09:00", slot1_close: "22:00", slot2_open: "", slot2_close: "" },
    tuesday: { closed: false, slot1_open: "09:00", slot1_close: "22:00", slot2_open: "", slot2_close: "" },
    wednesday: { closed: false, slot1_open: "09:00", slot1_close: "22:00", slot2_open: "", slot2_close: "" },
    thursday: { closed: false, slot1_open: "09:00", slot1_close: "22:00", slot2_open: "", slot2_close: "" },
    friday: { closed: false, slot1_open: "09:00", slot1_close: "22:00", slot2_open: "", slot2_close: "" },
    saturday: { closed: false, slot1_open: "10:00", slot1_close: "23:00", slot2_open: "", slot2_close: "" },
    sunday: { closed: false, slot1_open: "10:00", slot1_close: "22:00", slot2_open: "", slot2_close: "" },
  },
};

const CombinedDocumentStoreSetup: React.FC<CombinedComponentProps> = ({
  initialDocuments,
  verificationBankRejectionReason = null,
  verificationDocFixActive = false,
  initialStoreSetup,
  onDocumentComplete,
  onDocumentSave,
  onStoreSetupComplete,
  onStoreSetupChange,
  onStoreHoursSave,
  onStoreFeaturesSave,
  onBack,
  actionLoading = false,
  businessType = 'RESTAURANT',
  storeType = '',
  initialStep = 'documents',
}) => {
  const showOtherDocs = (storeType || '').toUpperCase() === 'OTHERS';
  const [currentStep, setCurrentStep] = useState<'documents' | 'store-setup'>(initialStep);
  
  // Reset currentStep when initialStep prop changes (e.g., navigating between steps)
  useEffect(() => {
    if (initialStep && initialStep !== currentStep) {
      setCurrentStep(initialStep);
    }
  }, [initialStep]);
  const [activeSection, setActiveSection] = useState<DocActiveSection>('pan');
  const docSectionOrder: DocActiveSection[] = showOtherDocs
    ? ['pan', 'aadhar', 'licence', 'gst', 'bank', 'other']
    : ['pan', 'aadhar', 'licence', 'gst', 'bank'];
  // Sidebar may only open sections already reached via Save & Continue (not skip ahead).
  const [maxReachedSectionIdx, setMaxReachedSectionIdx] = useState(0);
  useEffect(() => {
    const idx = docSectionOrder.indexOf(activeSection);
    if (idx >= 0) {
      setMaxReachedSectionIdx((prev) => Math.max(prev, idx));
    }
  }, [activeSection, showOtherDocs]);
  const goToSectionFromSidebar = (section: DocActiveSection) => {
    const idx = docSectionOrder.indexOf(section);
    if (idx > maxReachedSectionIdx) return;
    setActiveSection(section);
  };
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');
  const [validationType, setValidationType] = useState<'warning' | 'error' | 'info'>('warning');
  const [docFormatErrors, setDocFormatErrors] = useState<Record<string, string>>({});
  const [replaceImageConfirm, setReplaceImageConfirm] = useState<{ onConfirm: () => void } | null>(null);
  const [showOptionalExtraDocuments, setShowOptionalExtraDocuments] = useState(false);
  const [docPreviewPayload, setDocPreviewPayload] = useState<DocPreviewPayload | null>(null);
  const [documentSaving, setDocumentSaving] = useState(false);
  /** After a failed Save on Bank tab, outline empty required fields until the user edits. */
  const [bankRequiredHighlight, setBankRequiredHighlight] = useState(false);
  useEffect(() => {
    if (activeSection !== 'bank') setBankRequiredHighlight(false);
  }, [activeSection]);

  const isNewFileSelected = (fieldName: keyof DocumentData) => {
    const v = documents[fieldName];
    return typeof File !== 'undefined' && v instanceof File;
  };
  // Treat "uploading" as: we are in a document save AND a new File is present for this field.
  const isUploadingField = (fieldName: keyof DocumentData) => documentSaving && isNewFileSelected(fieldName);
  const isUploadingBankFile = (bankKey: 'bank_proof_file' | 'upi_qr_file') => {
    const bank = documents.bank;
    if (!bank) return false;
    const v = (bank as any)[bankKey];
    return documentSaving && typeof File !== 'undefined' && v instanceof File;
  };
  const documentFormatValidators = {
    pan: (v: string) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test((v || '').replace(/\s/g, '')) ? '' : 'Invalid PAN. Format: 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F)',
    aadhar: (v: string) => {
      const raw = (v || '').trim();
      if (isMaskedAadhaar(raw)) return '';
      return /^\d{12}$/.test(raw.replace(/\s/g, '')) ? '' : 'Invalid Aadhaar. Must be exactly 12 digits';
    },
    fssai: (v: string) => /^\d{14}$/.test((v || '').replace(/\s/g, '')) ? '' : 'Invalid FSSAI. Must be 14 digits',
    gst: (v: string) => {
      const s = (v || '').replace(/\s/g, '').toUpperCase();
      if (!s) return '';
      return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(s) ? '' : 'Invalid GSTIN. Format: 2 digit state + 10 char PAN + 2 digit entity + Z + 1 char (15 chars total)';
    },
    tradeLicense: (v: string) => {
      const s = (v || '').replace(/\s+/g, ' ').trim().toUpperCase();
      if (!s) return '';
      return /^[A-Z0-9][A-Z0-9/\-.\s]{2,48}[A-Z0-9]$/.test(s) ? '' : 'Invalid Trade License. Use 4–50 chars (letters/numbers, / - . allowed)';
    },
    shopEstablishment: (v: string) => {
      const s = (v || '').replace(/\s+/g, ' ').trim().toUpperCase();
      if (!s) return '';
      return /^[A-Z0-9][A-Z0-9/\-.\s]{2,48}[A-Z0-9]$/.test(s) ? '' : 'Invalid Shop & Establishment number. Use 4–50 chars (letters/numbers, / - . allowed)';
    },
    udyam: (v: string) => {
      const s = (v || '').replace(/\s/g, '').toUpperCase();
      if (!s) return '';
      return /^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/.test(s) ? '' : 'Invalid Udyam. Format: UDYAM-XX-00-0000000';
    },
    otherDocNumber: (v: string) => {
      const s = (v || '').trim();
      if (!s) return '';
      return s.length >= 4 && s.length <= 30 ? '' : 'Invalid number. Use 4–30 characters.';
    },
    ifsc: (v: string) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test((v || '').replace(/\s/g, '').toUpperCase()) ? '' : 'Invalid IFSC. Format: 4 letters, 0, 6 alphanumeric (e.g. SBIN0001234)',
    accountNumber: (v: string) => /^\d{9,18}$/.test((v || '').replace(/\s/g, '')) ? '' : 'Invalid account number. Must be 9–18 digits',
  };

  // HTML <input type="date"> only accepts YYYY-MM-DD.
  // Supabase may return ISO timestamps or formatted dates (e.g. DD-MM-YYYY).
  const toInputDate = (raw: unknown): string => {
    if (typeof raw !== 'string') return '';
    const v = raw.trim();
    if (!v) return '';
    // ISO or already-correct (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ)
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    // Common display format DD-MM-YYYY
    const m = v.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    // Fallback: try Date.parse
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
    return '';
  };

  const [documents, setDocuments] = useState<DocumentData>({
    pan_number: '',
    pan_holder_name: '',
    pan_image: null,
    aadhar_number: '',
    aadhar_holder_name: '',
    aadhar_front: null,
    aadhar_back: null,
    fssai_number: '',
    fssai_image: null,
    gst_number: '',
    gst_legal_business_name: '',
    gst_principal_place_of_business: '',
    gst_effective_registration_date: '',
    gst_image: null,
    drug_license_number: '',
    drug_license_image: null,
    pharmacist_registration_number: '',
    pharmacist_certificate: null,
    pharmacy_council_registration: null,
    fssai_expiry_date: '',
    drug_license_expiry_date: '',
    pharmacist_expiry_date: '',
    trade_license_number: '',
    trade_license_document: null,
    trade_license_expiry_date: '',
    shop_establishment_number: '',
    shop_establishment_document: null,
    shop_establishment_expiry_date: '',
    udyam_number: '',
    udyam_document: null,
    other_document_type: '',
    other_document_number: '',
    other_document_name: '',
    other_document_file: null,
    other_document_expiry_date: '',
    bank: {
      payout_method: 'bank',
      account_holder_name: '',
      account_number: '',
      ifsc_code: '',
      bank_name: '',
      branch_name: '',
      account_type: '',
      upi_id: '',
      bank_proof_type: undefined,
      bank_proof_file: null,
      upi_qr_file: null,
    },
  });

  // ── Automatic verification (Cashfree via backend policy engine) ─────────
  // Per-document verification modes set in the super-admin Policy Center:
  //   manual  → classic upload flow (agents review by hand)
  //   auto    → number-only; if verification fails the user is BLOCKED (retry later)
  //   hybrid  → number-only; if verification fails, fall back to uploading the doc
  type DocVerifyState = {
    state: 'idle' | 'verifying' | 'verified' | 'failed' | 'manual';
    details?: Record<string, unknown>;
    error?: string;
  };
  const [docModes, setDocModes] = useState<Record<string, string>>({});
  const [panVerify, setPanVerify] = useState<DocVerifyState>({ state: 'idle' });
  const [gstVerify, setGstVerify] = useState<DocVerifyState>({ state: 'idle' });
  const [bankVerify, setBankVerify] = useState<DocVerifyState>({ state: 'idle' });
  const [upiVerify, setUpiVerify] = useState<DocVerifyState>({ state: 'idle' });
  const [aadhaarVerify, setAadhaarVerify] = useState<
    DocVerifyState & { pending?: boolean; digilockerUrl?: string }
  >({ state: 'idle' });
  const aadhaarPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const digilockerPopupRef = useRef<Window | null>(null);
  /**
   * Last successful auto-verify fingerprint + fetched details.
   * Kept even if the user temporarily edits away — typing the same values back
   * restores verified UI without calling Cashfree again.
   */
  const panVerifiedNumberRef = useRef<string | null>(null);
  const panVerifiedDetailsRef = useRef<Record<string, unknown> | null>(null);
  const gstVerifiedNumberRef = useRef<string | null>(null);
  const gstVerifiedDetailsRef = useRef<Record<string, unknown> | null>(null);
  const bankVerifiedKeyRef = useRef<string | null>(null);
  const bankVerifiedDetailsRef = useRef<Record<string, unknown> | null>(null);
  const upiVerifiedKeyRef = useRef<string | null>(null);
  const upiVerifiedDetailsRef = useRef<Record<string, unknown> | null>(null);
  const aadhaarVerifiedNumberRef = useRef<string | null>(null);
  const aadhaarVerifiedDetailsRef = useRef<Record<string, unknown> | null>(null);
  const [storePublicId, setStorePublicId] = useState('');
  /** Instant DB uniqueness for FSSAI / Drug Licence. */
  const [licenceDup, setLicenceDup] = useState<{
    fssai: string;
    drug: string;
    checkingFssai: boolean;
    checkingDrug: boolean;
    fssaiOk: boolean;
    drugOk: boolean;
  }>({
    fssai: '',
    drug: '',
    checkingFssai: false,
    checkingDrug: false,
    fssaiOk: false,
    drugOk: false,
  });
  const licenceDupReqRef = useRef(0);

  useEffect(() => {
    try {
      setStorePublicId(new URLSearchParams(window.location.search).get('store_id') || '');
    } catch { /* SSR guard */ }
    fetch('/api/onboarding/verification-modes')
      .then((r) => r.json())
      .then((d) => { if (d?.modes) setDocModes(d.modes as Record<string, string>); })
      .catch(() => {});
  }, []);

  // Instant FSSAI / Drug Licence duplicate check against DB
  useEffect(() => {
    const fssai = String(documents.fssai_number || '').replace(/\D/g, '');
    const drug = String(documents.drug_license_number || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');
    const bt = (businessType || storeType || '').toUpperCase().replace(/\s+/g, '_');
    const food = [
      'RESTAURANT',
      'CAFE',
      'BAKERY',
      'CLOUD_KITCHEN',
      'FOOD_TRUCK',
      'ICE_CREAM_PARLOR',
      'GROCERY',
    ].includes(bt);
    const pharma = bt === 'PHARMA';
    const reqId = ++licenceDupReqRef.current;
    const timers: Array<ReturnType<typeof setTimeout>> = [];

    const applyResult = (kind: 'fssai' | 'drug', msg: string, checked: boolean) => {
      setLicenceDup((prev) => ({
        ...prev,
        [kind]: msg,
        ...(kind === 'fssai'
          ? { checkingFssai: false, fssaiOk: checked && !msg }
          : { checkingDrug: false, drugOk: checked && !msg }),
      }));
      setDocFormatErrors((prev) => {
        const key = kind === 'fssai' ? 'fssai_number' : 'drug_license_number';
        const prevMsg = prev[key] || '';
        const wasDup =
          prevMsg.includes('already registered') ||
          prevMsg.includes('Duplicates are not allowed');
        if (msg) return { ...prev, [key]: msg };
        if (wasDup) return { ...prev, [key]: '' };
        return prev;
      });
    };

    const runCheck = (kind: 'fssai' | 'drug', number: string, ready: boolean) => {
      if (!ready) {
        applyResult(kind, '', false);
        return;
      }
      setLicenceDup((prev) => ({
        ...prev,
        ...(kind === 'fssai'
          ? { checkingFssai: true, fssaiOk: false }
          : { checkingDrug: true, drugOk: false }),
      }));
      timers.push(
        setTimeout(async () => {
          try {
            const params = new URLSearchParams({ kind, number });
            const pub = (storePublicId || '').trim();
            if (pub) params.set('storePublicId', pub);
            const res = await fetch(
              `/api/onboarding/check-licence-duplicate?${params.toString()}`,
              { credentials: 'include' },
            );
            const data = await res.json().catch(() => ({}));
            if (licenceDupReqRef.current !== reqId) return;
            applyResult(
              kind,
              data?.duplicate === true
                ? String(
                    data.message ||
                      (kind === 'fssai'
                        ? 'This FSSAI number is already registered. Duplicates are not allowed.'
                        : 'This Drug Licence number is already registered. Duplicates are not allowed.'),
                  )
                : '',
              data?.checked === true || data?.duplicate === false,
            );
          } catch {
            if (licenceDupReqRef.current !== reqId) return;
            setLicenceDup((prev) => ({
              ...prev,
              ...(kind === 'fssai'
                ? { checkingFssai: false, fssaiOk: false }
                : { checkingDrug: false, drugOk: false }),
            }));
          }
        }, 450),
      );
    };

    runCheck('fssai', fssai, fssai.length === 14 && food);
    runCheck('drug', drug, drug.length >= 5 && pharma);

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [
    documents.fssai_number,
    documents.drug_license_number,
    storePublicId,
    storeType,
    businessType,
  ]);

  const panMode = (docModes['pan'] as 'manual' | 'auto' | 'hybrid' | 'disabled') || 'manual';
  const gstMode = (docModes['gstin'] as 'manual' | 'auto' | 'hybrid' | 'disabled') || 'manual';
  const aadhaarMode = (docModes['aadhaar_digilocker'] as 'manual' | 'auto' | 'hybrid' | 'disabled') || 'manual';
  const bankMode =
    (docModes['bank_account'] as 'manual' | 'auto' | 'hybrid' | 'disabled') ||
    (docModes['bank'] as 'manual' | 'auto' | 'hybrid' | 'disabled') ||
    'manual';
  const upiMode =
    (docModes['upi_penny_drop'] as 'manual' | 'auto' | 'hybrid' | 'disabled') ||
    (docModes['upi'] as 'manual' | 'auto' | 'hybrid' | 'disabled') ||
    bankMode;
  /** Electronic path active for this doc kind? */
  const isElectronic = (m: string) => m === 'auto' || m === 'hybrid';
  /** Upload area allowed right now for a doc, given its mode + verify state. */
  const uploadAllowedFor = (mode: string, vs: DocVerifyState) => {
    if (!isElectronic(mode)) return true; // manual/disabled → classic upload
    if (vs.state === 'manual') return true; // engine queued it for agents → evidence upload
    if (vs.state === 'failed') return true; // auto OR hybrid: provider failed → show manual upload
    return false; // not attempted / verifying / verified (no image needed)
  };

  /** Clear active verify UI when fields change; restore if values match last success. */
  useEffect(() => {
    const num = (documents.pan_number || '').trim().toUpperCase();
    if (panVerifiedNumberRef.current && panVerifiedNumberRef.current === num) {
      if (panVerify.state === 'verified' && documents.pan_is_verified) return;
      const details = panVerifiedDetailsRef.current || { pan_status: 'VALID' };
      const registered = typeof details.registered_name === 'string' ? details.registered_name : '';
      setPanVerify({ state: 'verified', details });
      setDocuments((prev) => ({
        ...prev,
        ...(registered ? { pan_holder_name: registered } : {}),
        pan_is_verified: true,
        pan_verified_details: details,
        pan_verification_method: prev.pan_verification_method || 'CASHFREE_AUTO',
        pan_verified_at: prev.pan_verified_at || new Date().toISOString(),
      }));
      return;
    }
    if (panVerify.state === 'idle' && !documents.pan_is_verified) return;
    setPanVerify({ state: 'idle' });
    setDocuments((prev) => ({
      ...prev,
      pan_is_verified: false,
      pan_verified_details: null,
      pan_verification_method: null,
      pan_verified_at: null,
    }));
  }, [documents.pan_number]);
  useEffect(() => {
    const num = (documents.gst_number || '').trim().toUpperCase();
    if (gstVerifiedNumberRef.current && gstVerifiedNumberRef.current === num) {
      if (gstVerify.state === 'verified' && documents.gst_is_verified) return;
      const details = gstVerifiedDetailsRef.current || {};
      const gstInfo = pickGstFetchedBusinessInfo(details);
      setGstVerify({ state: 'verified', details });
      setDocuments((prev) => ({
        ...prev,
        gst_is_verified: true,
        gst_verified_details: details,
        gst_verification_method: prev.gst_verification_method || 'CASHFREE_AUTO',
        gst_verified_at: prev.gst_verified_at || new Date().toISOString(),
        ...(gstInfo.legal_business_name
          ? { gst_legal_business_name: gstInfo.legal_business_name }
          : {}),
        ...(gstInfo.principal_place_of_business
          ? { gst_principal_place_of_business: gstInfo.principal_place_of_business }
          : {}),
        ...(gstInfo.effective_registration_date
          ? { gst_effective_registration_date: gstInfo.effective_registration_date }
          : {}),
      }));
      return;
    }
    if (gstVerify.state === 'idle' && !documents.gst_is_verified) return;
    setGstVerify({ state: 'idle' });
    setDocuments((prev) => ({
      ...prev,
      gst_is_verified: false,
      gst_verified_details: null,
      gst_verification_method: null,
      gst_verified_at: null,
      gst_legal_business_name: '',
      gst_principal_place_of_business: '',
      gst_effective_registration_date: '',
    }));
  }, [documents.gst_number]);
  useEffect(() => {
    const acc = String(documents.bank?.account_number || '').replace(/\D/g, '');
    const ifsc = String(documents.bank?.ifsc_code || '').trim().toUpperCase();
    const key = acc && ifsc ? `${acc}|${ifsc}` : '';
    if (bankVerifiedKeyRef.current && bankVerifiedKeyRef.current === key) {
      if (bankVerify.state === 'verified' && documents.bank?.bank_is_verified) return;
      const details = bankVerifiedDetailsRef.current || {};
      const bankInfo = pickBankFetchedInfo(details);
      setBankVerify({ state: 'verified', details });
      setDocuments((prev) => ({
        ...prev,
        bank: {
          ...(prev.bank || {}),
          bank_is_verified: true,
          bank_verified_details: details,
          bank_verification_method: prev.bank?.bank_verification_method || 'CASHFREE_AUTO',
          bank_verified_at: prev.bank?.bank_verified_at || new Date().toISOString(),
          ...(bankInfo.name_at_bank ? { account_holder_name: bankInfo.name_at_bank } : {}),
          ...(bankInfo.bank_name ? { bank_name: bankInfo.bank_name } : {}),
          ...(bankInfo.branch_name ? { branch_name: bankInfo.branch_name } : {}),
          ...(bankInfo.account_type ? { account_type: bankInfo.account_type } : {}),
        } as DocumentData['bank'],
      }));
      return;
    }
    if (bankVerify.state === 'idle' && !documents.bank?.bank_is_verified) return;
    setBankVerify({ state: 'idle' });
    setDocuments((prev) => ({
      ...prev,
      bank: {
        ...(prev.bank || {}),
        bank_is_verified: false,
        bank_verified_details: null,
        bank_verification_method: null,
        bank_verified_at: null,
      } as DocumentData['bank'],
    }));
  }, [documents.bank?.account_number, documents.bank?.ifsc_code]);
  useEffect(() => {
    const vpa = String(documents.bank?.upi_id || '').trim().toLowerCase();
    if (upiVerifiedKeyRef.current && upiVerifiedKeyRef.current === vpa) {
      if (upiVerify.state === 'verified' && documents.bank?.upi_verified) return;
      const details = upiVerifiedDetailsRef.current || {};
      setUpiVerify({ state: 'verified', details });
      setDocuments((prev) => ({
        ...prev,
        bank: {
          ...(prev.bank || {}),
          upi_verified: true,
          upi_verified_details: details,
        } as DocumentData['bank'],
      }));
      return;
    }
    if (upiVerify.state === 'idle' && !documents.bank?.upi_verified) return;
    setUpiVerify({ state: 'idle' });
    setDocuments((prev) => ({
      ...prev,
      bank: {
        ...(prev.bank || {}),
        upi_verified: false,
        upi_verified_details: null,
      } as DocumentData['bank'],
    }));
  }, [documents.bank?.upi_id]);
  useEffect(() => {
    const num = (documents.aadhar_number || '').replace(/\D/g, '');
    const currentMasked = maskAadhaarNumber(documents.aadhar_number);
    const verifiedMasked = maskAadhaarNumber(aadhaarVerifiedNumberRef.current);
    const matchesSnap =
      !!aadhaarVerifiedNumberRef.current &&
      (aadhaarVerifiedNumberRef.current === num ||
        (!!currentMasked && !!verifiedMasked && currentMasked === verifiedMasked) ||
        aadhaarVerifiedNumberRef.current === currentMasked ||
        aadhaarVerifiedNumberRef.current === documents.aadhar_number);
    if (matchesSnap) {
      if (aadhaarVerify.state === 'verified' && documents.aadhaar_is_verified) return;
      // DigiLocker start stamps the number ref before success — don't fake "verified".
      if (!aadhaarVerifiedDetailsRef.current && !documents.aadhaar_is_verified) return;
      const details = aadhaarVerifiedDetailsRef.current || {};
      setAadhaarVerify({ state: 'verified', details });
      setDocuments((prev) => ({
        ...prev,
        aadhaar_is_verified: true,
        aadhaar_verified_details: details,
        aadhaar_verification_method: prev.aadhaar_verification_method || 'CASHFREE_AUTO',
        aadhaar_verified_at: prev.aadhaar_verified_at || new Date().toISOString(),
      }));
      return;
    }
    if (aadhaarVerify.state === 'idle' && !documents.aadhaar_is_verified) return;
    if (aadhaarPollRef.current) {
      clearInterval(aadhaarPollRef.current);
      aadhaarPollRef.current = null;
    }
    setAadhaarVerify({ state: 'idle' });
    setDocuments((prev) => ({
      ...prev,
      aadhaar_is_verified: false,
      aadhaar_verified_details: null,
      aadhaar_verification_method: null,
      aadhaar_verified_at: null,
    }));
  }, [documents.aadhar_number]);

  const cancelDigilockerFlow = () => {
    if (aadhaarPollRef.current) {
      clearInterval(aadhaarPollRef.current);
      aadhaarPollRef.current = null;
    }
    if (digilockerPopupRef.current && !digilockerPopupRef.current.closed) {
      try {
        digilockerPopupRef.current.close();
      } catch {
        /* ignore */
      }
    }
    digilockerPopupRef.current = null;
    setAadhaarVerify({ state: 'idle' });
  };

  const pollAadhaarStatusOnce = async () => {
    const id = (storePublicId || '').trim();
    if (!id) return;
    try {
      const res = await fetch(
        `/api/onboarding/verify-document/status?storeId=${encodeURIComponent(id)}&docKind=aadhaar`,
        { credentials: 'include' },
      );
      const d = await res.json().catch(() => ({}));
      if (d?.verified) {
        if (aadhaarPollRef.current) {
          clearInterval(aadhaarPollRef.current);
          aadhaarPollRef.current = null;
        }
        if (digilockerPopupRef.current && !digilockerPopupRef.current.closed) {
          try {
            digilockerPopupRef.current.close();
          } catch {
            /* ignore */
          }
        }
        digilockerPopupRef.current = null;
        const details = (d.verifiedData as Record<string, unknown>) || {};
        const normalized = normalizeAadhaarVerifiedDetails(details);
        const entered = (documents.aadhar_number || '').replace(/\D/g, '');
        const masked =
          normalized.maskedAadhaar ||
          maskAadhaarNumber(entered) ||
          maskAadhaarNumber(documents.aadhar_number);
        aadhaarVerifiedNumberRef.current = masked || entered || null;
        aadhaarVerifiedDetailsRef.current = details;
        setAadhaarVerify({ state: 'verified', details });
        setDocFormatErrors((prev) => ({ ...prev, aadhar_number: '' }));
        setDocuments((prev) => ({
          ...prev,
          aadhar_number: masked || prev.aadhar_number,
          ...(normalized.name ? { aadhar_holder_name: normalized.name } : {}),
          aadhaar_is_verified: true,
          aadhaar_verified_details: details,
          aadhaar_verification_method: 'CASHFREE_DIGILOCKER',
          aadhaar_verified_at: new Date().toISOString(),
        }));
        toast.success('Aadhaar verified via DigiLocker.');
      } else if (
        d?.status === 'rejected' ||
        d?.status === 'failed' ||
        d?.status === 'expired' ||
        d?.status === 'consent_denied'
      ) {
        if (aadhaarPollRef.current) {
          clearInterval(aadhaarPollRef.current);
          aadhaarPollRef.current = null;
        }
        setAadhaarVerify({
          state: 'failed',
          error: String(
            d?.statusReason ||
              (d?.status === 'expired'
                ? 'DigiLocker link expired. Please try again.'
                : d?.status === 'consent_denied'
                  ? 'DigiLocker consent was denied. Please try again.'
                  : 'DigiLocker verification failed.'),
          ),
        });
      }
    } catch {
      /* keep polling */
    }
  };

  const verifyDocNow = async (kind: 'pan' | 'gstin' | 'aadhaar' | 'bank' | 'upi') => {
    const setter =
      kind === 'pan'
        ? setPanVerify
        : kind === 'gstin'
          ? setGstVerify
          : kind === 'bank'
            ? setBankVerify
            : kind === 'upi'
              ? setUpiVerify
            : setAadhaarVerify;
    if (kind === 'pan') {
      const pan = (documents.pan_number || '').trim().toUpperCase();
      if (!pan || documentFormatValidators.pan(pan)) return;
    } else if (kind === 'gstin') {
      const gstin = (documents.gst_number || '').trim().toUpperCase();
      if (!gstin || documentFormatValidators.gst(gstin)) return;
    } else if (kind === 'bank') {
      const acc = String(documents.bank?.account_number || '').replace(/\D/g, '');
      const ifsc = String(documents.bank?.ifsc_code || '').trim().toUpperCase();
      if (!acc || documentFormatValidators.accountNumber(acc)) return;
      if (!ifsc || documentFormatValidators.ifsc(ifsc)) return;
    } else if (kind === 'upi') {
      const vpa = String(documents.bank?.upi_id || '').trim().toLowerCase();
      if (!vpa || !/^[a-z0-9.\-_]{2,256}@[a-z0-9]{2,64}$/i.test(vpa)) return;
    } else {
      const aadhaar = (documents.aadhar_number || '').replace(/\D/g, '');
      if (!aadhaar || documentFormatValidators.aadhar(aadhaar)) return;
    }
    const resolvedStoreId =
      (storePublicId || '').trim() ||
      (typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('store_id') || ''
        : '');
    if (!resolvedStoreId) {
      toast.error('Store id missing — reload this page and try again.');
      return;
    }
    if (resolvedStoreId !== storePublicId) setStorePublicId(resolvedStoreId);

    // Open DigiLocker loading window on user gesture (Cashfree pattern — cannot iframe DigiLocker).
    if (kind === 'aadhaar') {
      digilockerPopupRef.current = openDigilockerLoadingPopup();
    }

    setter({ state: 'verifying' });
    try {
      await refreshAuthIfNeeded();
      const body: Record<string, unknown> =
        kind === 'pan'
          ? {
              storeId: resolvedStoreId,
              docKind: 'pan',
              pan: (documents.pan_number || '').trim().toUpperCase(),
              name: (documents.pan_holder_name || '').trim() || undefined,
            }
          : kind === 'gstin'
            ? { storeId: resolvedStoreId, docKind: 'gstin', gstin: (documents.gst_number || '').trim().toUpperCase() }
            : kind === 'bank'
              ? {
                  storeId: resolvedStoreId,
                  docKind: 'bank',
                  bankAccount: String(documents.bank?.account_number || '').replace(/\D/g, ''),
                  ifsc: String(documents.bank?.ifsc_code || '').trim().toUpperCase(),
                  name: String(documents.bank?.account_holder_name || '').trim() || undefined,
                }
            : kind === 'upi'
              ? {
                  storeId: resolvedStoreId,
                  docKind: 'upi',
                  vpa: String(documents.bank?.upi_id || '').trim().toLowerCase(),
                  name: String(documents.bank?.account_holder_name || '').trim() || undefined,
                }
            : { storeId: resolvedStoreId, docKind: 'aadhaar', redirectUrl: digilockerRedirectUrl() };

      const postVerify = () =>
        fetch('/api/onboarding/verify-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });

      let res = await postVerify();
      if (res.status === 401) {
        await refreshAuthIfNeeded();
        res = await postVerify();
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        const errMsg = String(data?.error || 'Not authenticated — please log in again.');
        if (digilockerPopupRef.current && !digilockerPopupRef.current.closed) {
          digilockerPopupRef.current.close();
          digilockerPopupRef.current = null;
        }
        setter({ state: 'failed', error: errMsg });
        toast.error(errMsg);
        return;
      }
      if (data?.outcome === 'verified') {
        if (digilockerPopupRef.current && !digilockerPopupRef.current.closed) {
          digilockerPopupRef.current.close();
          digilockerPopupRef.current = null;
        }
        const details = (data.verifiedData as Record<string, unknown>) || {};
        setter({ state: 'verified', details });
        if (kind === 'pan') {
          const registered = (details as { registered_name?: string })?.registered_name;
          const panNum = (documents.pan_number || '').trim().toUpperCase();
          panVerifiedNumberRef.current = panNum || null;
          panVerifiedDetailsRef.current = details;
          setDocuments((prev) => ({
            ...prev,
            ...(registered ? { pan_holder_name: registered } : {}),
            pan_is_verified: true,
            pan_verified_at: new Date().toISOString(),
            pan_verification_method: 'CASHFREE_AUTO',
            pan_verified_details: details,
          }));
          toast.success(
            data.pendingReview
              ? 'PAN matched. Our team may still review it — you can continue.'
              : 'PAN verified successfully.',
          );
        } else if (kind === 'gstin') {
          const gstNum = (documents.gst_number || '').trim().toUpperCase();
          gstVerifiedNumberRef.current = gstNum || null;
          gstVerifiedDetailsRef.current = details;
          const gstInfo = pickGstFetchedBusinessInfo(details);
          setDocuments((prev) => ({
            ...prev,
            gst_is_verified: true,
            gst_verified_at: new Date().toISOString(),
            gst_verification_method: 'CASHFREE_AUTO',
            gst_verified_details: details,
            ...(gstInfo.legal_business_name
              ? { gst_legal_business_name: gstInfo.legal_business_name }
              : {}),
            ...(gstInfo.principal_place_of_business
              ? { gst_principal_place_of_business: gstInfo.principal_place_of_business }
              : {}),
            ...(gstInfo.effective_registration_date
              ? { gst_effective_registration_date: gstInfo.effective_registration_date }
              : {}),
          }));
          toast.success('GSTIN verified successfully.');
        } else if (kind === 'bank') {
          const acc = String(documents.bank?.account_number || '').replace(/\D/g, '');
          const ifsc = String(documents.bank?.ifsc_code || '').trim().toUpperCase();
          bankVerifiedKeyRef.current = acc && ifsc ? `${acc}|${ifsc}` : null;
          bankVerifiedDetailsRef.current = details;
          const bankInfo = pickBankFetchedInfo(details);
          setDocuments((prev) => ({
            ...prev,
            bank: {
              ...(prev.bank || {
                payout_method: 'bank',
                account_holder_name: '',
                account_number: '',
                ifsc_code: '',
                bank_name: '',
              }),
              bank_is_verified: true,
              bank_verified_at: new Date().toISOString(),
              bank_verification_method: 'CASHFREE_AUTO',
              bank_verified_details: details,
              ...(bankInfo.name_at_bank
                ? { account_holder_name: bankInfo.name_at_bank }
                : {}),
              ...(bankInfo.bank_name ? { bank_name: bankInfo.bank_name } : {}),
              ...(bankInfo.branch_name ? { branch_name: bankInfo.branch_name } : {}),
              ...(bankInfo.account_type ? { account_type: bankInfo.account_type } : {}),
            },
          }));
          toast.success('Bank account verified successfully.');
        } else if (kind === 'upi') {
          const vpa = String(documents.bank?.upi_id || '').trim().toLowerCase();
          upiVerifiedKeyRef.current = vpa || null;
          upiVerifiedDetailsRef.current = details;
          const upiInfo = pickUpiFetchedInfo(details);
          setDocuments((prev) => ({
            ...prev,
            bank: {
              ...(prev.bank || {
                payout_method: 'bank',
                account_holder_name: '',
                account_number: '',
                ifsc_code: '',
                bank_name: '',
              }),
              upi_id: vpa,
              upi_verified: true,
              upi_verified_details: details,
              ...(upiInfo.name_at_bank
                ? { account_holder_name: prev.bank?.account_holder_name || upiInfo.name_at_bank }
                : {}),
            },
          }));
          toast.success('UPI ID verified successfully.');
        }
      } else if (data?.outcome === 'digilocker' && data?.url) {
        const digilockerUrl = String(data.url);
        aadhaarVerifiedNumberRef.current = (documents.aadhar_number || '').replace(/\D/g, '') || null;
        setAadhaarVerify({
          state: 'verifying',
          pending: true,
          digilockerUrl,
        });
        toast.message('Complete DigiLocker OTP in the window beside this panel.');
        startAadhaarPolling();
      } else if (data?.outcome === 'manual') {
        if (digilockerPopupRef.current && !digilockerPopupRef.current.closed) {
          digilockerPopupRef.current.close();
          digilockerPopupRef.current = null;
        }
        setter({ state: 'manual' });
        toast.message('Queued for manual review — upload the document image to continue.');
        if (kind === 'pan' && typeof document !== 'undefined') {
          requestAnimationFrame(() => {
            document.getElementById('pan-manual-upload')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          });
        }
      } else {
        if (digilockerPopupRef.current && !digilockerPopupRef.current.closed) {
          digilockerPopupRef.current.close();
          digilockerPopupRef.current = null;
        }
        const errMsg = String(data?.error || 'Verification failed.');
        setter({ state: 'failed', error: errMsg });
        toast.error(errMsg);
        if (kind === 'pan' && typeof document !== 'undefined') {
          requestAnimationFrame(() => {
            document.getElementById('pan-manual-upload')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          });
        }
      }
    } catch {
      if (digilockerPopupRef.current && !digilockerPopupRef.current.closed) {
        digilockerPopupRef.current.close();
        digilockerPopupRef.current = null;
      }
      const errMsg = 'Could not reach the verification service.';
      setter({ state: 'failed', error: errMsg });
      toast.error(errMsg);
    }
  };

  const startAadhaarPolling = () => {
    if (aadhaarPollRef.current) clearInterval(aadhaarPollRef.current);
    const startedAt = Date.now();
    void pollAadhaarStatusOnce();
    aadhaarPollRef.current = setInterval(async () => {
      if (Date.now() - startedAt > 3 * 60_000) {
        if (aadhaarPollRef.current) clearInterval(aadhaarPollRef.current);
        setAadhaarVerify({ state: 'failed', error: 'DigiLocker verification timed out. Please try again.' });
        return;
      }
      await pollAadhaarStatusOnce();
    }, 2_500);
  };

  useEffect(() => () => {
    if (aadhaarPollRef.current) clearInterval(aadhaarPollRef.current);
  }, []);

  /** Human-readable fetched details from the provider (status etc.; names omitted for auto-verify UI). */
  const verifiedDetailRows = (details?: Record<string, unknown>): Array<[string, string]> => {
    if (!details) return [];
    const pick: Array<[string, string]> = [];
    const label: Record<string, string> = {
      name_match_result: 'Name match',
      name_match_score: 'Name match score',
      legal_name_of_business: 'Legal Name of Business',
      trade_name_of_business: 'Trade name',
      principal_place_address: 'Principal Place of Business',
      gst_in_status: 'GSTIN status',
      date_of_registration: 'Effective Date of Registration',
      constitution_of_business: 'Business constitution',
      taxpayer_type: 'Taxpayer type',
      pan_status: 'PAN status',
      category: 'Category',
      name_at_bank: 'Name at bank',
      bank_name: 'Bank',
      branch_name: 'Branch',
      account_type: 'Account type',
      account_status: 'Account status',
      vpa: 'UPI ID',
      status: 'Status',
      type: 'Type',
    };
    const preferredOrder = [
      'legal_name_of_business',
      'principal_place_address',
      'date_of_registration',
      'name_at_bank',
      'vpa',
      'bank_name',
      'branch_name',
      'account_type',
      'account_status',
      'gst_in_status',
      'taxpayer_type',
      'trade_name_of_business',
      'constitution_of_business',
    ];
    const seen = new Set<string>();
    for (const k of preferredOrder) {
      const v = details[k];
      if (v == null || typeof v === 'object') continue;
      const l = label[k];
      if (!l || seen.has(l)) continue;
      const display =
        k === 'account_type'
          ? String(v).toUpperCase() === 'SAVINGS'
            ? 'Savings'
            : String(v).toUpperCase() === 'CURRENT'
              ? 'Current'
              : String(v)
          : String(v);
      pick.push([l, display]);
      seen.add(l);
    }
    for (const [k, v] of Object.entries(details)) {
      if (v == null || typeof v === 'object') continue;
      // Never surface holder/registered names in auto-verify success UI
      if (
        k === 'registered_name' ||
        k === 'name_provided' ||
        k === 'name' ||
        k === 'full_name' ||
        k === 'aadhaar_name'
      ) {
        continue;
      }
      const l = label[k];
      if (!l || seen.has(l)) continue;
      const display =
        k === 'account_type'
          ? String(v).toUpperCase() === 'SAVINGS'
            ? 'Savings'
            : String(v).toUpperCase() === 'CURRENT'
              ? 'Current'
              : String(v)
          : String(v);
      pick.push([l, display]);
      seen.add(l);
    }
    return pick.slice(0, 8);
  };

  // Live image previews for key documents (only when file/URL is an image)
  const panPreviewUrl = useImagePreview(documents.pan_image, documents.pan_image_url);
  const aadharFrontPreviewUrl = useImagePreview(documents.aadhar_front, documents.aadhar_front_url);
  const aadharBackPreviewUrl = useImagePreview(documents.aadhar_back, documents.aadhar_back_url);
  const fssaiPreviewUrl = useImagePreview(documents.fssai_image, documents.fssai_image_url);
  const gstPreviewUrl = useImagePreview(documents.gst_image, documents.gst_image_url);
  const drugLicensePreviewUrl = useImagePreview(documents.drug_license_image, documents.drug_license_image_url);
  const pharmacistCertPreviewUrl = useImagePreview(documents.pharmacist_certificate, documents.pharmacist_certificate_url);
  const pharmacyCouncilPreviewUrl = useImagePreview(documents.pharmacy_council_registration, documents.pharmacy_council_registration_url);
  const tradeLicenseDocPreviewUrl = useImagePreview(documents.trade_license_document, documents.trade_license_document_url);
  const shopEstDocPreviewUrl = useImagePreview(documents.shop_establishment_document, documents.shop_establishment_document_url);
  const udyamDocPreviewUrl = useImagePreview(documents.udyam_document, documents.udyam_document_url);
  const otherDocFilePreviewUrl = useImagePreview(documents.other_document_file, documents.other_document_file_url);
  const bankProofPreviewUrl = useImagePreview(documents.bank?.bank_proof_file ?? null, documents.bank?.bank_proof_file_url);
  const upiQrPreviewUrl = useImagePreview(documents.bank?.upi_qr_file ?? null, documents.bank?.upi_qr_screenshot_url);

const [storeSetup, setStoreSetup] = useState<StoreSetupData>(defaultStoreSetupData);
  const getMediaSrcAndKey = (value: string | null | undefined): { src: string | null; fileKey: string | null } => {
    if (!value) return { src: null, fileKey: null };
    const trimmed = value.trim();
    if (!trimmed) return { src: null, fileKey: null };

    // Proxy URL: /api/attachments/proxy?key=docs/...
    if (trimmed.startsWith("/api/attachments/proxy")) {
      try {
        const url = new URL(trimmed, "http://dummy");
        const key = url.searchParams.get("key");
        return { src: trimmed, fileKey: key };
      } catch {
        return { src: trimmed, fileKey: null };
      }
    }

    // Local previews (before upload): use directly, do NOT treat as keys.
    if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
      return { src: trimmed, fileKey: null };
    }

    // Full HTTP(S): same-app attachment proxy (extract key for R2Image retries)
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      try {
        const u = new URL(trimmed);
        if (u.pathname.includes("/attachments/proxy")) {
          const key = u.searchParams.get("key");
          return { src: trimmed, fileKey: key };
        }
      } catch {
        /* fall through */
      }
      return { src: trimmed, fileKey: null };
    }

    // Raw R2 key like "docs/merchants/..."
    return { src: trimmed, fileKey: trimmed };
  };
  const [allCuisines, setAllCuisines] = useState<string[]>([]);
  const [cuisineSearch, setCuisineSearch] = useState('');
  const [presetToggles, setPresetToggles] = useState({
    sameAsMonday: false,
    weekdayWeekend: false,
    lunchDinner: false,
    is24Hours: false,
  });

  const docRejection = useMemo(() => {
    const d = documents as Record<string, unknown>;
    const bankFromDoc = adminRejectionText(d, 'bank_proof_rejection_reason');
    const bankFromVerification =
      typeof verificationBankRejectionReason === 'string' && verificationBankRejectionReason.trim()
        ? verificationBankRejectionReason.trim()
        : null;
    return {
      pan: adminRejectionText(d, 'pan_rejection_reason'),
      aadhaar: adminRejectionText(d, 'aadhaar_rejection_reason'),
      bank_proof: bankFromDoc ?? bankFromVerification,
    };
  }, [documents, verificationBankRejectionReason]);

  const optionalRejectionItems = useMemo(() => {
    const d = documents as Record<string, unknown>;
    const pairs: [string, string][] = [
      ['FSSAI', 'fssai_rejection_reason'],
      ['Drug license', 'drug_license_rejection_reason'],
      ['Pharmacist certificate', 'pharmacist_certificate_rejection_reason'],
      ['Pharmacy council registration', 'pharmacy_council_registration_rejection_reason'],
      ['Trade license', 'trade_license_rejection_reason'],
      ['Shop & establishment', 'shop_establishment_rejection_reason'],
      ['Udyam', 'udyam_rejection_reason'],
      ['Other document', 'other_rejection_reason'],
    ];
    const out: { label: string; reason: string }[] = [];
    for (const [label, key] of pairs) {
      const r = adminRejectionText(d, key);
      if (r) out.push({ label, reason: r });
    }
    return out;
  }, [documents]);

  const gstRejectionReason = useMemo(() => {
    const d = documents as Record<string, unknown>;
    return adminRejectionText(d, 'gst_rejection_reason');
  }, [documents]);

  const rejectedDocSections = useMemo(
    () =>
      rejectedDocSectionsFromDocuments(
        documents as Record<string, unknown>,
        verificationBankRejectionReason
      ),
    [documents, verificationBankRejectionReason]
  );
  const rejectedDocSectionSet = useMemo(
    () => new Set<DocActiveSection>(rejectedDocSections),
    [rejectedDocSections]
  );

  // Verification fix: land on first rejected doc tab (e.g. FSSAI → licence), not Bank.
  useEffect(() => {
    if (!verificationDocFixActive || currentStep !== 'documents') return;
    if (rejectedDocSections.length === 0) return;
    if (!rejectedDocSectionSet.has(activeSection)) {
      setActiveSection(rejectedDocSections[0]!);
    }
  }, [
    verificationDocFixActive,
    currentStep,
    rejectedDocSections,
    rejectedDocSectionSet,
    activeSection,
  ]);

  const goToSectionFromSidebarLocked = (section: DocActiveSection) => {
    if (verificationDocFixActive) {
      if (!rejectedDocSectionSet.has(section)) return;
      setActiveSection(section);
      return;
    }
    goToSectionFromSidebar(section);
  };

  // Sync from parent when navigating back so saved data is shown (including persisted document URLs)
  // Track the last hydrated initialDocuments to detect when it changes
  const lastHydratedDocumentsRef = useRef<string>('');
  
  useEffect(() => {
    // Always hydrate when we're on documents step and initialDocuments is provided
    if (currentStep === 'documents' && initialDocuments && typeof initialDocuments === 'object') {
      // Create a hash of the initialDocuments to detect changes
      const documentsHash = JSON.stringify({
        pan_number: initialDocuments.pan_number,
        pan_holder_name: initialDocuments.pan_holder_name,
        pan_is_verified: (initialDocuments as any).pan_is_verified ?? false,
        gst_is_verified: (initialDocuments as any).gst_is_verified ?? false,
        aadhaar_is_verified: (initialDocuments as any).aadhaar_is_verified ?? false,
        aadhar_number: initialDocuments.aadhar_number,
        trade_license_number: (initialDocuments as any).trade_license_number,
        shop_establishment_number: (initialDocuments as any).shop_establishment_number,
        udyam_number: (initialDocuments as any).udyam_number,
        trade_license_expiry_date: (initialDocuments as any).trade_license_expiry_date,
        shop_establishment_expiry_date: (initialDocuments as any).shop_establishment_expiry_date,
        pan_image_url: (initialDocuments as any).pan_image_url,
        aadhar_front_url: (initialDocuments as any).aadhar_front_url,
        aadhar_back_url: (initialDocuments as any).aadhar_back_url,
        fssai_image_url: (initialDocuments as any).fssai_image_url,
        gst_image_url: (initialDocuments as any).gst_image_url,
        drug_license_image_url: (initialDocuments as any).drug_license_image_url,
        pharmacist_certificate_url: (initialDocuments as any).pharmacist_certificate_url,
        pharmacy_council_registration_url: (initialDocuments as any).pharmacy_council_registration_url,
        trade_license_document_url: (initialDocuments as any).trade_license_document_url,
        shop_establishment_document_url: (initialDocuments as any).shop_establishment_document_url,
        udyam_document_url: (initialDocuments as any).udyam_document_url,
        other_document_file_url: (initialDocuments as any).other_document_file_url,
        ...Object.fromEntries(
          DOC_REJECTION_FIELDS.map((k) => [k, (initialDocuments as Record<string, unknown>)[k] ?? null])
        ),
      });
      
      // Always hydrate when step changes to documents, or when documents data changes
      if (documentsHash !== lastHydratedDocumentsRef.current) {
        lastHydratedDocumentsRef.current = documentsHash;
        setDocuments((prev) => {
          const next: DocumentData = { ...prev };
          if (typeof initialDocuments.pan_number === 'string') next.pan_number = initialDocuments.pan_number;
          if (typeof initialDocuments.pan_holder_name === 'string') next.pan_holder_name = initialDocuments.pan_holder_name;
          if (typeof initialDocuments.aadhar_number === 'string') next.aadhar_number = initialDocuments.aadhar_number;
          if (typeof initialDocuments.aadhar_holder_name === 'string') next.aadhar_holder_name = initialDocuments.aadhar_holder_name;
          if (typeof initialDocuments.fssai_number === 'string') next.fssai_number = initialDocuments.fssai_number;
          if (typeof initialDocuments.gst_number === 'string') next.gst_number = initialDocuments.gst_number;
          // Restore persisted auto-verification flags/details (DB source of truth)
          const initAny = initialDocuments as Record<string, unknown>;
          if (typeof initAny.gst_legal_business_name === 'string') {
            next.gst_legal_business_name = initAny.gst_legal_business_name;
          }
          if (typeof initAny.gst_principal_place_of_business === 'string') {
            next.gst_principal_place_of_business = initAny.gst_principal_place_of_business;
          }
          if (typeof initAny.gst_effective_registration_date === 'string') {
            next.gst_effective_registration_date = toInputDate(
              initAny.gst_effective_registration_date as string,
            );
          }
          if (initAny.pan_is_verified != null) next.pan_is_verified = Boolean(initAny.pan_is_verified);
          if (initAny.pan_verified_at != null) next.pan_verified_at = initAny.pan_verified_at;
          if (initAny.pan_verification_method != null) next.pan_verification_method = initAny.pan_verification_method;
          if (initAny.pan_verified_details != null) next.pan_verified_details = initAny.pan_verified_details;
          if (initAny.gst_is_verified != null) next.gst_is_verified = Boolean(initAny.gst_is_verified);
          if (initAny.gst_verified_at != null) next.gst_verified_at = initAny.gst_verified_at;
          if (initAny.gst_verification_method != null) next.gst_verification_method = initAny.gst_verification_method;
          if (initAny.gst_verified_details != null) next.gst_verified_details = initAny.gst_verified_details;
          if (initAny.aadhaar_is_verified != null) next.aadhaar_is_verified = Boolean(initAny.aadhaar_is_verified);
          if (initAny.aadhaar_verified_at != null) next.aadhaar_verified_at = initAny.aadhaar_verified_at;
          if (initAny.aadhaar_verification_method != null) next.aadhaar_verification_method = initAny.aadhaar_verification_method;
          if (initAny.aadhaar_verified_details != null) next.aadhaar_verified_details = initAny.aadhaar_verified_details;
          if (typeof initialDocuments.drug_license_number === 'string') next.drug_license_number = initialDocuments.drug_license_number;
          if (typeof initialDocuments.pharmacist_registration_number === 'string') next.pharmacist_registration_number = initialDocuments.pharmacist_registration_number;
          if (typeof initialDocuments.trade_license_number === 'string') next.trade_license_number = initialDocuments.trade_license_number ?? '';
          if (typeof initialDocuments.shop_establishment_number === 'string') next.shop_establishment_number = initialDocuments.shop_establishment_number ?? '';
          if (typeof initialDocuments.udyam_number === 'string') next.udyam_number = initialDocuments.udyam_number ?? '';
          if (typeof initialDocuments.expiry_date === 'string') next.expiry_date = toInputDate(initialDocuments.expiry_date);
          if (typeof initialDocuments.fssai_expiry_date === 'string') next.fssai_expiry_date = toInputDate(initialDocuments.fssai_expiry_date);
          if (typeof initialDocuments.drug_license_expiry_date === 'string') next.drug_license_expiry_date = toInputDate(initialDocuments.drug_license_expiry_date);
          if (typeof initialDocuments.pharmacist_expiry_date === 'string') next.pharmacist_expiry_date = toInputDate(initialDocuments.pharmacist_expiry_date);
          if (typeof initialDocuments.trade_license_expiry_date === 'string') next.trade_license_expiry_date = toInputDate(initialDocuments.trade_license_expiry_date);
          if (typeof initialDocuments.shop_establishment_expiry_date === 'string') next.shop_establishment_expiry_date = toInputDate(initialDocuments.shop_establishment_expiry_date);
          if (typeof initialDocuments.other_document_type === 'string') next.other_document_type = initialDocuments.other_document_type ?? '';
          if (typeof initialDocuments.other_document_number === 'string') next.other_document_number = initialDocuments.other_document_number ?? '';
          if (typeof initialDocuments.other_document_name === 'string') next.other_document_name = initialDocuments.other_document_name ?? '';
          if (typeof initialDocuments.other_document_expiry_date === 'string') next.other_document_expiry_date = toInputDate(initialDocuments.other_document_expiry_date);
          const docUrlToFileKey: [string, string][] = [
            ['pan_image_url', 'pan_image'],
            ['aadhar_front_url', 'aadhar_front'],
            ['aadhar_back_url', 'aadhar_back'],
            ['fssai_image_url', 'fssai_image'],
            ['gst_image_url', 'gst_image'],
            ['drug_license_image_url', 'drug_license_image'],
            ['pharmacist_certificate_url', 'pharmacist_certificate'],
            ['pharmacy_council_registration_url', 'pharmacy_council_registration'],
            ['trade_license_document_url', 'trade_license_document'],
            ['shop_establishment_document_url', 'shop_establishment_document'],
            ['udyam_document_url', 'udyam_document'],
            ['other_document_file_url', 'other_document_file'],
          ];
          for (const [urlKey, fileKey] of docUrlToFileKey) {
            if (typeof (initialDocuments as any)[urlKey] === 'string') {
              (next as any)[urlKey] = (initialDocuments as any)[urlKey];
              (next as any)[fileKey] = null;
            }
          }
          if (initialDocuments.bank && typeof initialDocuments.bank === 'object') {
            next.bank = { ...(prev.bank || {}), ...initialDocuments.bank };
            if (typeof (initialDocuments.bank as any).bank_proof_file_url === 'string') {
              (next.bank as any).bank_proof_file_url = (initialDocuments.bank as any).bank_proof_file_url;
              (next.bank as any).bank_proof_file = null;
            }
            if (typeof (initialDocuments.bank as any).upi_qr_screenshot_url === 'string') {
              (next.bank as any).upi_qr_screenshot_url = (initialDocuments.bank as any).upi_qr_screenshot_url;
              (next.bank as any).upi_qr_file = null;
            }
          }
          const init = initialDocuments as Record<string, unknown>;
          for (const k of DOC_REJECTION_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(init, k)) {
              const v = init[k];
              (next as Record<string, unknown>)[k] = typeof v === 'string' ? v : null;
            }
          }
          return next;
        });

        // Restore verify UI from DB flags so refresh does not ask to re-verify.
        const init = initialDocuments as Record<string, unknown>;
        if (init.pan_is_verified && typeof initialDocuments.pan_number === 'string') {
          const panNum = initialDocuments.pan_number.trim().toUpperCase();
          panVerifiedNumberRef.current = panNum || null;
          const details =
            (init.pan_verified_details && typeof init.pan_verified_details === 'object'
              ? (init.pan_verified_details as Record<string, unknown>)
              : null) || { pan_status: 'VALID' };
          panVerifiedDetailsRef.current = details;
          setPanVerify({ state: 'verified', details });
        }
        if (init.gst_is_verified && typeof initialDocuments.gst_number === 'string') {
          const gstNum = initialDocuments.gst_number.trim().toUpperCase();
          gstVerifiedNumberRef.current = gstNum || null;
          const details =
            (init.gst_verified_details && typeof init.gst_verified_details === 'object'
              ? (init.gst_verified_details as Record<string, unknown>)
              : {}) || {};
          gstVerifiedDetailsRef.current = details;
          setGstVerify({ state: 'verified', details });
        }
        {
          const bank = (init.bank && typeof init.bank === 'object' ? init.bank : null) as Record<
            string,
            unknown
          > | null;
          if (bank) {
            if (bank.bank_is_verified) {
              const acc = String(bank.account_number || '').replace(/\D/g, '');
              const ifsc = String(bank.ifsc_code || '').trim().toUpperCase();
              bankVerifiedKeyRef.current = acc && ifsc ? `${acc}|${ifsc}` : null;
              const details =
                bank.bank_verified_details && typeof bank.bank_verified_details === 'object'
                  ? (bank.bank_verified_details as Record<string, unknown>)
                  : {};
              bankVerifiedDetailsRef.current = details;
              setBankVerify({ state: 'verified', details });
            }
            if (bank.upi_verified) {
              const vpa = String(bank.upi_id || '').trim().toLowerCase();
              upiVerifiedKeyRef.current = vpa || null;
              const details =
                (bank.upi_verified_details && typeof bank.upi_verified_details === 'object'
                  ? (bank.upi_verified_details as Record<string, unknown>)
                  : null) ||
                (bank.bank_verified_details &&
                typeof bank.bank_verified_details === 'object' &&
                !bank.bank_is_verified
                  ? (bank.bank_verified_details as Record<string, unknown>)
                  : {});
              upiVerifiedDetailsRef.current = details;
              setUpiVerify({ state: 'verified', details });
            }
          }
        }
        if (init.aadhaar_is_verified) {
          const aNum = typeof initialDocuments.aadhar_number === 'string' ? initialDocuments.aadhar_number.trim() : '';
          aadhaarVerifiedNumberRef.current = aNum || null;
          const details =
            (init.aadhaar_verified_details && typeof init.aadhaar_verified_details === 'object'
              ? (init.aadhaar_verified_details as Record<string, unknown>)
              : {}) || {};
          aadhaarVerifiedDetailsRef.current = details;
          setAadhaarVerify({ state: 'verified', details });
        }

        // After reload: jump to the first incomplete doc subsection (don't stay on a finished PAN).
        // Verification fix: always open the first rejected tab (FSSAI → licence), never Bank just because it was last saved.
        const rejectedOnLoad = rejectedDocSectionsFromDocuments(
          init as Record<string, unknown>,
          verificationBankRejectionReason
        );
        if (verificationDocFixActive && rejectedOnLoad.length > 0) {
          setActiveSection(rejectedOnLoad[0]!);
        } else {
          const savedSection = typeof init.step4_active_section === 'string' ? String(init.step4_active_section) : '';
          const normalizedSection = savedSection ? normalizeStep4ActiveSection(savedSection) : null;
          if (normalizedSection) {
            setActiveSection(normalizedSection);
          } else {
            const panDone = Boolean(init.pan_is_verified);
            const bank = (init.bank && typeof init.bank === 'object' ? init.bank : null) as Record<string, unknown> | null;
            const bankStarted = Boolean(
              (bank?.account_number && String(bank.account_number).trim()) ||
                (bank?.upi_id && String(bank.upi_id).trim()) ||
                (bank?.bank_proof_file_url && String(bank.bank_proof_file_url).trim())
            );
            const licenceStarted = Boolean(
              (typeof init.fssai_number === 'string' && init.fssai_number.trim()) ||
                (typeof init.drug_license_number === 'string' && init.drug_license_number.trim()) ||
                (typeof init.trade_license_number === 'string' && init.trade_license_number.trim()) ||
                (typeof init.shop_establishment_number === 'string' && init.shop_establishment_number.trim()) ||
                (typeof init.udyam_number === 'string' && init.udyam_number.trim())
            );
            const gstStarted = Boolean(typeof init.gst_number === 'string' && init.gst_number.trim());
            if (bankStarted) setActiveSection('bank');
            else if (licenceStarted) setActiveSection('licence');
            else if (gstStarted) setActiveSection('gst');
            else if (panDone) setActiveSection('aadhar');
          }
        }
      }
    }
  }, [initialDocuments, currentStep, verificationDocFixActive, verificationBankRejectionReason]);
  
  // Reset hydration ref when switching to documents step to force re-hydration
  useEffect(() => {
    if (currentStep === 'documents') {
      lastHydratedDocumentsRef.current = '';
    }
  }, [currentStep]);

  // Hydrate Step 5 once from parent progress. Do NOT re-apply on every parent
  // echo (hours/features autosave) — that used to wipe cuisine_types with [].
  const didHydrateStoreSetupRef = useRef(false);
  useEffect(() => {
    if (!initialStoreSetup || typeof initialStoreSetup !== 'object') return;
    if (didHydrateStoreSetupRef.current) return;
    didHydrateStoreSetupRef.current = true;

    const logoUrl =
      typeof initialStoreSetup.logo_preview === 'string'
        ? initialStoreSetup.logo_preview
        : typeof (initialStoreSetup as any).logo_url === 'string'
          ? (initialStoreSetup as any).logo_url
          : '';
    const bannerUrl =
      typeof initialStoreSetup.banner_preview === 'string'
        ? initialStoreSetup.banner_preview
        : typeof (initialStoreSetup as any).banner_url === 'string'
          ? (initialStoreSetup as any).banner_url
          : '';
    const rawGalleryUrls = Array.isArray((initialStoreSetup as any).gallery_image_urls)
      ? ((initialStoreSetup as any).gallery_image_urls as unknown[])
      : null;
    const fromPreviews = Array.isArray(initialStoreSetup.gallery_previews)
      ? initialStoreSetup.gallery_previews
      : [];
    const galleryList = (
      rawGalleryUrls && rawGalleryUrls.length > 0 ? rawGalleryUrls : fromPreviews
    ).filter((u): u is string => typeof u === 'string' && u.trim() !== '');
    const cuisineTypes = Array.isArray(initialStoreSetup.cuisine_types)
      ? initialStoreSetup.cuisine_types.filter(
          (c): c is string => typeof c === 'string' && c.trim() !== '',
        )
      : [];
    const foodCategories = Array.isArray(initialStoreSetup.food_categories)
      ? initialStoreSetup.food_categories.filter(
          (c): c is string => typeof c === 'string' && c.trim() !== '',
        )
      : [];

    setStoreSetup((prev) => {
      let nextHours = prev.store_hours;
      if (initialStoreSetup.store_hours && typeof initialStoreSetup.store_hours === 'object') {
        const normalized: StoreSetupData['store_hours'] = { ...prev.store_hours };
        Object.entries(initialStoreSetup.store_hours).forEach(([day, hours]: [string, any]) => {
          if (hours && typeof hours === 'object') {
            normalized[day as keyof typeof normalized] = {
              closed: typeof hours.closed === 'boolean' ? hours.closed : false,
              slot1_open: hours.slot1_open || '',
              slot1_close: hours.slot1_close || '',
              slot2_open: hours.slot2_open || '',
              slot2_close: hours.slot2_close || '',
            };
          }
        });
        nextHours = normalized;
      }
      return {
        ...prev,
        cuisine_types: cuisineTypes.length > 0 ? cuisineTypes : prev.cuisine_types,
        food_categories: foodCategories.length > 0 ? foodCategories : prev.food_categories,
        avg_preparation_time_minutes:
          typeof initialStoreSetup.avg_preparation_time_minutes === 'number'
            ? initialStoreSetup.avg_preparation_time_minutes
            : prev.avg_preparation_time_minutes,
        min_order_amount:
          typeof initialStoreSetup.min_order_amount === 'number'
            ? initialStoreSetup.min_order_amount
            : prev.min_order_amount,
        delivery_radius_km:
          typeof initialStoreSetup.delivery_radius_km === 'number' &&
          !isNaN(initialStoreSetup.delivery_radius_km)
            ? initialStoreSetup.delivery_radius_km
            : prev.delivery_radius_km,
        is_pure_veg:
          typeof initialStoreSetup.is_pure_veg === 'boolean'
            ? initialStoreSetup.is_pure_veg
            : prev.is_pure_veg,
        accepts_online_payment:
          typeof initialStoreSetup.accepts_online_payment === 'boolean'
            ? initialStoreSetup.accepts_online_payment
            : prev.accepts_online_payment,
        accepts_cash:
          typeof initialStoreSetup.accepts_cash === 'boolean'
            ? initialStoreSetup.accepts_cash
            : prev.accepts_cash,
        logo_preview: logoUrl || prev.logo_preview,
        banner_preview: bannerUrl || prev.banner_preview,
        ...(galleryList.length > 0
          ? {
              gallery_previews: galleryList,
              gallery_image_urls: galleryList,
              gallery_images: galleryList.map(() => null),
            }
          : {}),
        store_hours: nextHours,
      };
    });
  }, [initialStoreSetup]);

  // Keep parent Step 5 snapshot aligned so hours/features autosave includes cuisines.
  // Skip the initial mount echo so we don't overwrite parent progress with defaults.
  const skipParentStoreSetupSyncRef = useRef(true);
  useEffect(() => {
    if (skipParentStoreSetupSyncRef.current) {
      skipParentStoreSetupSyncRef.current = false;
      return;
    }
    onStoreSetupChange?.(storeSetup);
  }, [storeSetup, onStoreSetupChange]);

  // Sync presetToggles with actual store_hours data
  useEffect(() => {
    if (!storeSetup.store_hours) return;
    
    const hours = storeSetup.store_hours;
    const monday = hours.monday;
    
    // Check if 24x7 (all days have 00:00 to 23:59 or similar)
    const is24Hours = Object.values(hours).every(day => 
      !day.closed && 
      (day.slot1_open === '00:00' || day.slot1_open === '0:00') && 
      (day.slot1_close === '23:59' || day.slot1_close === '23:59:59' || day.slot1_close === '24:00')
    );
    
    // Check if same as Monday (all days match Monday exactly)
    const sameAsMonday = Object.entries(hours).every(([day, dayHours]) => 
      day === 'monday' || (
        dayHours.closed === monday.closed &&
        dayHours.slot1_open === monday.slot1_open &&
        dayHours.slot1_close === monday.slot1_close &&
        dayHours.slot2_open === monday.slot2_open &&
        dayHours.slot2_close === monday.slot2_close
      )
    );
    
    // Check if weekday + weekend pattern (Mon-Fri same, Sat-Sun same but different)
    const weekdayDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;
    const weekendDays = ['saturday', 'sunday'] as const;
    const weekdayHours = weekdayDays.map(day => hours[day]);
    const weekendHours = weekendDays.map(day => hours[day]);
    
    const weekdaySame = weekdayDays.every(day => {
      const dayHours = hours[day];
      const firstWeekday = hours.monday;
      return (
        dayHours.closed === firstWeekday.closed &&
        dayHours.slot1_open === firstWeekday.slot1_open &&
        dayHours.slot1_close === firstWeekday.slot1_close &&
        dayHours.slot2_open === firstWeekday.slot2_open &&
        dayHours.slot2_close === firstWeekday.slot2_close
      );
    });
    
    const weekendSame = weekendDays.every(day => {
      const dayHours = hours[day];
      const firstWeekend = hours.saturday;
      return (
        dayHours.closed === firstWeekend.closed &&
        dayHours.slot1_open === firstWeekend.slot1_open &&
        dayHours.slot1_close === firstWeekend.slot1_close &&
        dayHours.slot2_open === firstWeekend.slot2_open &&
        dayHours.slot2_close === firstWeekend.slot2_close
      );
    });
    
    const weekdayWeekend = weekdaySame && weekendSame && 
      JSON.stringify(weekdayHours[0]) !== JSON.stringify(weekendHours[0]);
    
    // Check if lunch + dinner (all days have both slots filled)
    const lunchDinner = Object.values(hours).every(day => 
      !day.closed && 
      day.slot1_open && day.slot1_close && 
      day.slot2_open && day.slot2_close
    );
    
    setPresetToggles({
      sameAsMonday: sameAsMonday && !is24Hours,
      weekdayWeekend: weekdayWeekend && !is24Hours && !sameAsMonday,
      lunchDinner: lunchDinner && !is24Hours,
      is24Hours: is24Hours,
    });
  }, [storeSetup.store_hours]);

  const fileInputRefs = {
    pan: useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement | null>,
    aadharFront: useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement | null>,
    aadharBack: useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement | null>,
    fssai: useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement | null>,
    gst: useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement | null>,
    drugLicense: useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement | null>,
    pharmacistCert: useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement | null>,
    pharmacyCouncil: useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement | null>,
    tradeLicense: useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement | null>,
    shopEstablishment: useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement | null>,
    udyam: useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement | null>,
    otherDoc: useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement | null>,
    bankProof: useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement | null>,
    upiQr: useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement | null>,
  };

  const isFoodBusiness = () => {
    const foodBusinessTypes = ['RESTAURANT', 'CAFE', 'BAKERY', 'CLOUD_KITCHEN', 'FOOD_TRUCK', 'ICE_CREAM_PARLOR'];
    return businessType && foodBusinessTypes.includes(businessType.toUpperCase());
  };

  const isPharmaBusiness = () => {
    return businessType && businessType.toUpperCase() === 'PHARMA';
  };

  const getDocUrlKey = (fileKey: string) => (fileKey === 'other_document_file' ? 'other_document_file_url' : `${fileKey}_url`);
  const hasDocFileOrUrl = (fileKey: keyof DocumentData) => {
    const file = documents[fileKey];
    if (typeof File !== 'undefined' && file instanceof File) return true;
    const url = (documents as any)[getDocUrlKey(String(fileKey))];
    return typeof url === 'string';
  };
  const hasBankProofFileOrUrl = () => {
    const bank = documents.bank;
    if (!bank) return false;
    if (typeof File !== 'undefined' && bank.bank_proof_file instanceof File) return true;
    return typeof bank.bank_proof_file_url === 'string';
  };
  const hasUpiQrFileOrUrl = () => {
    const bank = documents.bank;
    if (!bank) return false;
    if (typeof File !== 'undefined' && bank.upi_qr_file instanceof File) return true;
    return typeof bank.upi_qr_screenshot_url === 'string';
  };

  const getBankPayoutMissingLabels = (): string[] => {
    const bank = documents.bank;
    const method = bank?.payout_method || 'bank';
    const t = (s?: string) => String(s || '').trim();
    if (method === 'bank') {
      const missing: string[] = [];
      const bankVerified = bankVerify.state === 'verified' || Boolean(bank?.bank_is_verified);
      if (!t(bank?.account_number)) missing.push('Account number');
      if (!t(bank?.ifsc_code)) missing.push('IFSC code');
      if (isElectronic(bankMode)) {
        if (bankMode === 'auto' && !bankVerified) missing.push('Bank account verification');
        if (bankVerified && !['SAVINGS', 'CURRENT', 'savings', 'current'].includes(String(bank?.account_type || '').trim())) {
          missing.push('Account type');
        }
        if (!bankVerified) {
          if (!t(bank?.account_holder_name)) missing.push('Account holder name');
          if (!t(bank?.bank_name)) missing.push('Bank name');
          if (!bank?.bank_proof_type) missing.push('Bank proof type (Passbook / Cancelled cheque / Statement)');
          if (!hasBankProofFileOrUrl()) missing.push('Bank proof document');
        }
      } else {
        if (!t(bank?.account_holder_name)) missing.push('Account holder name');
        if (!t(bank?.bank_name)) missing.push('Bank name');
        if (!bank?.bank_proof_type) missing.push('Bank proof type (Passbook / Cancelled cheque / Statement)');
        if (!hasBankProofFileOrUrl()) missing.push('Bank proof document');
      }
      return missing;
    }
    const missing: string[] = [];
    if (!t(bank?.upi_id)) missing.push('UPI ID');
    const upiVerified = upiVerify.state === 'verified' || Boolean(bank?.upi_verified);
    if (isElectronic(upiMode)) {
      if (upiMode === 'auto' && !upiVerified) missing.push('UPI verification');
      if (!upiVerified && !hasUpiQrFileOrUrl()) missing.push('UPI QR screenshot');
    } else if (!hasUpiQrFileOrUrl()) {
      missing.push('UPI QR screenshot');
    }
    return missing;
  };

  const handleDocumentInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setDocuments(prev => {
      if (name === 'pan_number') return { ...prev, [name]: value.toUpperCase().slice(0, 10) };
      if (name === 'aadhar_number') {
        const nextVal = isMaskedAadhaar(value)
          ? value.trim().toUpperCase()
          : value.replace(/\D/g, '').slice(0, 12);
        return { ...prev, [name]: nextVal };
      }
      if (name === 'gst_number') return { ...prev, [name]: value.toUpperCase().slice(0, 15) };
      if (name === 'trade_license_number' || name === 'shop_establishment_number') return { ...prev, [name]: value.toUpperCase().slice(0, 50) };
      if (name === 'udyam_number') return { ...prev, [name]: value.toUpperCase().replace(/\s/g, '').slice(0, 19) };
      return { ...prev, [name]: value };
    });
    if (name === 'pan_number') setDocFormatErrors(prev => ({ ...prev, pan_number: documentFormatValidators.pan(value.toUpperCase()) }));
    if (name === 'aadhar_number') {
      const nextVal = isMaskedAadhaar(value)
        ? value.trim().toUpperCase()
        : value.replace(/\D/g, '').slice(0, 12);
      setDocFormatErrors(prev => ({
        ...prev,
        aadhar_number: nextVal ? documentFormatValidators.aadhar(nextVal) : '',
      }));
    }
    if (name === 'fssai_number') setDocFormatErrors(prev => ({ ...prev, fssai_number: documentFormatValidators.fssai(value) }));
    if (name === 'drug_license_number') {
      const s = String(value || '').trim();
      setDocFormatErrors((prev) => ({
        ...prev,
        drug_license_number: s && s.length < 5 ? 'Invalid Drug Licence. Please check the number.' : '',
      }));
    }
    if (name === 'gst_number') {
      setDocFormatErrors(prev => ({ ...prev, gst_number: documentFormatValidators.gst(value) }));
    }
    if (name === 'trade_license_number') setDocFormatErrors(prev => ({ ...prev, trade_license_number: documentFormatValidators.tradeLicense(value) }));
    if (name === 'shop_establishment_number') setDocFormatErrors(prev => ({ ...prev, shop_establishment_number: documentFormatValidators.shopEstablishment(value) }));
    if (name === 'udyam_number') setDocFormatErrors(prev => ({ ...prev, udyam_number: documentFormatValidators.udyam(value) }));
    if (name === 'other_document_number') setDocFormatErrors(prev => ({ ...prev, other_document_number: documentFormatValidators.otherDocNumber(value) }));
  };

  const validateDocFormats = (): { valid: boolean; firstError: string } => {
    const err: Record<string, string> = {};
    if (documents.pan_number) err.pan_number = documentFormatValidators.pan(documents.pan_number);
    if (documents.aadhar_number) err.aadhar_number = documentFormatValidators.aadhar(documents.aadhar_number);
    if (documents.fssai_number) err.fssai_number = documentFormatValidators.fssai(documents.fssai_number);
    if (documents.gst_number) err.gst_number = documentFormatValidators.gst(documents.gst_number);
    if (documents.trade_license_number) err.trade_license_number = documentFormatValidators.tradeLicense(documents.trade_license_number);
    if (documents.shop_establishment_number) err.shop_establishment_number = documentFormatValidators.shopEstablishment(documents.shop_establishment_number);
    if (documents.udyam_number) err.udyam_number = documentFormatValidators.udyam(documents.udyam_number);
    if (documents.other_document_number) err.other_document_number = documentFormatValidators.otherDocNumber(documents.other_document_number);
    const bank = documents.bank;
    if (bank?.ifsc_code) err.ifsc_code = documentFormatValidators.ifsc(bank.ifsc_code);
    if (bank?.account_number) err.account_number = documentFormatValidators.accountNumber(bank.account_number);
    setDocFormatErrors(prev => ({ ...prev, ...err }));
    const firstError = Object.values(err).find(Boolean) || '';
    return { valid: !firstError, firstError };
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, fieldName: keyof DocumentData) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
      if (!validTypes.includes(file.type) || file.size > 5 * 1024 * 1024) {
        setValidationMessage('File must be JPG, PNG, or PDF and less than 5MB');
        setValidationType('error');
        setShowValidationModal(true);
        return;
      }
      setDocuments(prev => ({ ...prev, [fieldName]: file }));
    }
  };

  const renderValidTick = (show: boolean) => {
    if (!show) return null;
    return (
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[11px]">
          ✓
        </span>
      </span>
    );
  };

  const validateDocumentSection = () => {
    if (activeSection === 'pan') {
      // PAN rules depend on the admin policy mode:
      //   manual   → name + number + card image (agent reviews by hand)
      //   auto     → name + number + MUST be automatically verified; no upload path
      //   hybrid   → automatically verified, OR (verification attempted+failed AND image uploaded)
      // Electronic modes only need the number — the name is auto-sourced from
      // the store owner and back-filled from the provider's registered name.
      const numberOk = !!documents.pan_number && !documentFormatValidators.pan(documents.pan_number);
      const baseOk = isElectronic(panMode)
        ? numberOk
        : numberOk && !!documents.pan_holder_name?.trim();
      if (!baseOk) return false;
      // auto + hybrid: verified OR (provider failed/manual → image uploaded as fallback)
      if (panMode === 'auto' || panMode === 'hybrid') {
        if (panVerify.state === 'verified' || documents.pan_is_verified) return true;
        if (panVerify.state === 'failed' || panVerify.state === 'manual') {
          return hasDocFileOrUrl('pan_image');
        }
        // Not attempted yet — must Verify first, unless an image is already on file.
        return hasDocFileOrUrl('pan_image');
      }
      // manual / disabled → classic evidence upload required
      return hasDocFileOrUrl('pan_image');
    } else if (activeSection === 'aadhar') {
      // Fully optional — hybrid/auto DigiLocker must never block Skip / Continue.
      const num = (documents.aadhar_number || '').replace(/\s/g, '').trim();
      if (!num && !documents.aadhar_holder_name?.trim()) return true;
      // Only block if they typed an invalid number (clear the field to skip).
      if (num && documentFormatValidators.aadhar(num)) return false;
      return true;
    } else if (activeSection === 'licence') {
      if (licenceDup.fssai || licenceDup.drug || licenceDup.checkingFssai || licenceDup.checkingDrug) {
        return false;
      }
      if (isPharmaBusiness()) {
        return !!(documents.drug_license_number && hasDocFileOrUrl('drug_license_image') && documents.drug_license_expiry_date) &&
               !!(documents.pharmacist_registration_number && hasDocFileOrUrl('pharmacist_certificate') && hasDocFileOrUrl('pharmacy_council_registration') && documents.pharmacist_expiry_date) &&
               !docFormatErrors.drug_license_number &&
               licenceDup.drugOk;
      }
      if (isFoodBusiness()) {
        const fssaiOk = documents.fssai_number && hasDocFileOrUrl('fssai_image') && documents.fssai_expiry_date;
        const fssaiFormatOk = !documents.fssai_number || !documentFormatValidators.fssai(documents.fssai_number);
        return !!(fssaiOk && fssaiFormatOk && !docFormatErrors.fssai_number && licenceDup.fssaiOk);
      }
      // Optional-but-recommended licences: if any field is started, require the full set.
      const tradeStarted = !!documents.trade_license_number || hasDocFileOrUrl('trade_license_document') || !!documents.trade_license_expiry_date;
      if (tradeStarted) {
        const tradeOk =
          !!documents.trade_license_number &&
          !documentFormatValidators.tradeLicense(documents.trade_license_number) &&
          hasDocFileOrUrl('trade_license_document') &&
          !!documents.trade_license_expiry_date;
        if (!tradeOk) return false;
      }
      const shopStarted = !!documents.shop_establishment_number || hasDocFileOrUrl('shop_establishment_document') || !!documents.shop_establishment_expiry_date;
      if (shopStarted) {
        const shopOk =
          !!documents.shop_establishment_number &&
          !documentFormatValidators.shopEstablishment(documents.shop_establishment_number) &&
          hasDocFileOrUrl('shop_establishment_document');
        // Expiry date is optional here (some certificates don't have expiry); if provided, must be valid date string (handled by input).
        if (!shopOk) return false;
      }
      const udyamStarted = !!documents.udyam_number || hasDocFileOrUrl('udyam_document');
      if (udyamStarted) {
        const udyamOk =
          !!documents.udyam_number &&
          !documentFormatValidators.udyam(documents.udyam_number) &&
          hasDocFileOrUrl('udyam_document');
        if (!udyamOk) return false;
      }
      return true;
    } else if (activeSection === 'gst') {
      const gstNum = (documents.gst_number || '').trim();
      if (!gstNum && !hasDocFileOrUrl('gst_image')) return true;
      if (gstNum && documentFormatValidators.gst(gstNum)) return false;
      if (gstNum && isElectronic(gstMode)) {
        const gstVerified = gstVerify.state === 'verified' || Boolean((documents as { gst_is_verified?: boolean }).gst_is_verified);
        if (gstMode === 'auto' && !gstVerified) return false;
        if (gstMode === 'hybrid' && !gstVerified && !hasDocFileOrUrl('gst_image')) return false;
      }
      return true;
    } else if (activeSection === 'other') {
      // "Other docs" tab mirrors optional recommended validations too.
      if (documents.trade_license_number && documentFormatValidators.tradeLicense(documents.trade_license_number)) return false;
      if (documents.shop_establishment_number && documentFormatValidators.shopEstablishment(documents.shop_establishment_number)) return false;
      if (documents.udyam_number && documentFormatValidators.udyam(documents.udyam_number)) return false;
      return true;
    } else if (activeSection === 'bank') {
      const bank = (documents.bank || {}) as {
        payout_method?: string;
        account_holder_name?: string;
        account_number?: string;
        ifsc_code?: string;
        bank_name?: string;
        bank_proof_type?: string;
        upi_id?: string;
        bank_is_verified?: boolean;
      };
      const method = bank.payout_method || 'bank';
      const t = (s?: string) => String(s || '').trim();
      if (method === 'bank') {
        const ifscOk = !t(bank.ifsc_code) || !documentFormatValidators.ifsc(bank.ifsc_code || '');
        const accOk = !t(bank.account_number) || !documentFormatValidators.accountNumber(bank.account_number || '');
        if (!t(bank.account_number) || !t(bank.ifsc_code) || !ifscOk || !accOk) return false;
        const bankVerified = bankVerify.state === 'verified' || Boolean(bank.bank_is_verified);
        if (isElectronic(bankMode)) {
          if (bankMode === 'auto') return bankVerified;
          if (bankVerified) return true;
          // hybrid fallback: manual details + proof
          return !!(
            t(bank.account_holder_name) &&
            t(bank.bank_name) &&
            bank.bank_proof_type &&
            hasBankProofFileOrUrl()
          );
        }
        return !!(
          t(bank.account_holder_name) &&
          t(bank.bank_name) &&
          bank.bank_proof_type &&
          hasBankProofFileOrUrl()
        );
      }
      const upiOk = !!t(bank.upi_id) && /^[a-z0-9.\-_]{2,256}@[a-z0-9]{2,64}$/i.test(t(bank.upi_id));
      if (!upiOk) return false;
      const upiVerified =
        upiVerify.state === 'verified' || Boolean((bank as { upi_verified?: boolean }).upi_verified);
      if (isElectronic(upiMode)) {
        if (upiMode === 'auto') return upiVerified;
        if (upiVerified) return true;
        return hasUpiQrFileOrUrl();
      }
      return hasUpiQrFileOrUrl();
    } else if (activeSection === 'other') {
      return true;
    }
    return true;
  };

  const showDocumentValidationError = (section: DocActiveSection) => {
    if (section === 'pan') {
      if ((panMode === 'auto' || panMode === 'hybrid') && panVerify.state !== 'verified' && !hasDocFileOrUrl('pan_image')) {
        setValidationMessage(
          panVerify.state === 'failed' || panVerify.state === 'manual'
            ? 'Instant verification did not succeed — please upload a clear PAN card image to continue.'
            : 'Please verify your PAN automatically (tap "Verify PAN"), or upload the PAN card image.'
        );
      } else {
        setValidationMessage('Please fill all required fields in the PAN section before proceeding.');
      }
    } else if (section === 'aadhar') {
      setValidationMessage('Please fill all required fields in the Aadhar section before proceeding.');
    } else if (section === 'bank') {
      const missing = getBankPayoutMissingLabels();
      if (missing.length > 0) {
        setValidationMessage(
          `Please fill all required fields before continuing.\n\nStill needed:\n• ${missing.join('\n• ')}`
        );
      } else {
        setValidationMessage(
          'Please correct your bank details (check IFSC and account number format) before continuing.'
        );
      }
    } else if (section === 'licence') {
      if (licenceDup.fssai || licenceDup.drug) {
        setValidationMessage(
          licenceDup.fssai ||
            licenceDup.drug ||
            'This licence number is already registered. Enter a different number — duplicates are not allowed.',
        );
      } else if (licenceDup.checkingFssai || licenceDup.checkingDrug) {
        setValidationMessage('Please wait while we check if this licence number is already registered.');
      } else if (isPharmaBusiness()) {
        setValidationMessage('Please fill all required pharma documents before proceeding.');
      } else if (isFoodBusiness()) {
        setValidationMessage('FSSAI certificate is required for food businesses.');
      } else {
        setValidationMessage('');
        return false;
      }
    } else if (section === 'gst') {
      const gstBlocked =
        !!documents.gst_number?.trim() &&
        isElectronic(gstMode) &&
        gstVerify.state !== 'verified' &&
        !(documents as { gst_is_verified?: boolean }).gst_is_verified &&
        (gstMode === 'auto' || !hasDocFileOrUrl('gst_image'));
      if (gstBlocked) {
        setValidationMessage(
          gstMode === 'auto'
            ? (gstVerify.state === 'failed'
                ? 'GSTIN verification failed. Re-check the number or try again after some time — automatic verification is required.'
                : 'Please verify your GSTIN automatically (tap "Verify GSTIN") before proceeding.')
            : (gstVerify.state === 'failed' || gstVerify.state === 'manual'
                ? 'Instant GSTIN verification did not succeed — please upload the GST certificate to continue.'
                : 'Please verify your GSTIN automatically (tap "Verify GSTIN"), or upload the GST certificate.')
        );
      } else if (documents.gst_number && documentFormatValidators.gst(documents.gst_number)) {
        setValidationMessage('Please enter a valid 15-character GSTIN, or clear the field to skip this section.');
      } else {
        setValidationMessage('');
        return false;
      }
    }
    setValidationType('error');
    setShowValidationModal(true);
    return true;
  };

  const handleDocumentSaveAndContinue = async () => {
    const formatResult = validateDocFormats();
    if (!formatResult.valid) {
      if (activeSection === 'bank') setBankRequiredHighlight(true);
      setValidationMessage(formatResult.firstError || 'Please correct the invalid document format(s) before proceeding.');
      setValidationType('error');
      setShowValidationModal(true);
      return;
    }
    if (!validateDocumentSection()) {
      if (activeSection === 'bank') setBankRequiredHighlight(true);
      showDocumentValidationError(activeSection);
      return;
    }

    if (
      activeSection === 'aadhar' &&
      aadhaarVerify.state === 'verifying'
    ) {
      setValidationMessage(
        'DigiLocker verification is in progress. Complete consent in the DigiLocker tab, or wait for it to finish/fail before continuing.',
      );
      setValidationType('error');
      setShowValidationModal(true);
      return;
    }

    setDocumentSaving(true);
    if (activeSection === 'bank') setBankRequiredHighlight(false);
    try {
      const savedPatch = onDocumentSave ? await onDocumentSave(documents) : undefined;
      const patchArg: Record<string, unknown> | undefined =
        typeof savedPatch === 'object' && savedPatch !== null && !Array.isArray(savedPatch)
          ? savedPatch
          : undefined;

      let nextSection: DocActiveSection | null = null;
      if (verificationDocFixActive) {
        // Stay within rejected tabs only — never auto-advance to Bank/GST/PAN.
        const curIdx = rejectedDocSections.indexOf(activeSection);
        const nextRejected =
          curIdx >= 0 && curIdx < rejectedDocSections.length - 1
            ? rejectedDocSections[curIdx + 1]!
            : null;
        if (nextRejected) {
          setActiveSection(nextRejected);
          if (onDocumentSave) {
            void onDocumentSave({
              ...documents,
              step4_active_section: nextRejected,
            } as DocumentData & { step4_active_section?: string });
          }
        } else if (onDocumentComplete) {
          onDocumentComplete(documents, patchArg);
        }
        return;
      }
      if (activeSection === 'pan') {
        nextSection = 'aadhar';
      } else if (activeSection === 'aadhar') {
        nextSection = 'licence';
      } else if (activeSection === 'licence') {
        nextSection = 'gst';
      } else if (activeSection === 'gst') {
        nextSection = 'bank';
      } else if (activeSection === 'bank') {
        if (showOtherDocs) nextSection = 'other';
        else {
          if (onDocumentComplete) onDocumentComplete(documents, patchArg);
          return;
        }
      } else if (activeSection === 'other') {
        let shouldProceed = true;
        if (isPharmaBusiness()) {
          if (!documents.drug_license_number || !hasDocFileOrUrl('drug_license_image') || !documents.drug_license_expiry_date ||
              !documents.pharmacist_registration_number || !hasDocFileOrUrl('pharmacist_certificate') ||
              !hasDocFileOrUrl('pharmacy_council_registration') || !documents.pharmacist_expiry_date) {
            setValidationMessage('All pharma documents are required. Please complete all fields.');
            setValidationType('error');
            setShowValidationModal(true);
            shouldProceed = false;
          }
        } else if (isFoodBusiness()) {
          if (!documents.fssai_number || !hasDocFileOrUrl('fssai_image') || !documents.fssai_expiry_date) {
            setValidationMessage('FSSAI certificate is required for food businesses. Please complete this section.');
            setValidationType('error');
            setShowValidationModal(true);
            shouldProceed = false;
          }
        }
        if (shouldProceed) {
          setShowValidationModal(false);
          if (onDocumentComplete) onDocumentComplete(documents, patchArg);
        }
        return;
      }

      if (nextSection) {
        setActiveSection(nextSection);
        // Persist subsection so reload resumes on the next incomplete section
        if (onDocumentSave) {
          void onDocumentSave({
            ...documents,
            step4_active_section: nextSection,
          } as DocumentData & { step4_active_section?: string });
        }
      }
    } catch (e) {
      console.error('Document save failed:', e);
    } finally {
      setDocumentSaving(false);
    }
  };

  const handleStoreSetupChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    let processedValue: any = value;
    
    if (type === "checkbox") {
      processedValue = checked;
    } else if (type === "number") {
      if (value === "") {
        processedValue = name === "delivery_radius_km" ? "" : null;
      } else {
        const numValue = parseFloat(value);
        if (!Number.isNaN(numValue) && name === "delivery_radius_km") {
          processedValue = numValue;
        } else {
          processedValue = !Number.isNaN(numValue) ? numValue : name === "delivery_radius_km" ? "" : null;
        }
      }
    }
    
    setStoreSetup((prev) => ({
      ...prev,
      [name]: processedValue,
    }));
  };

  const MAX_GALLERY_IMAGES = 5;

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'logo' | 'banner') => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const newForm = {
        ...storeSetup,
        [field]: file,
        // clear any persisted URL when changing
        ...(field === 'logo' && { logo_url: undefined }),
        ...(field === 'banner' && { banner_url: undefined }),
        [`${field}_preview`]: reader.result as string,
      };
      setStoreSetup(newForm);
    };
    reader.readAsDataURL(file);
  };

  const handleGalleryImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const allFiles = e.target.files ? Array.from(e.target.files) : [];
    if (allFiles.length === 0) return;

    // Count total images including already selected (previews/urls) to enforce max
    const existingCount =
      (Array.isArray(storeSetup.gallery_previews) ? storeSetup.gallery_previews.length : 0) ||
      (Array.isArray((storeSetup as any).gallery_image_urls) ? (storeSetup as any).gallery_image_urls.length : 0);

    const slotsLeft = MAX_GALLERY_IMAGES - existingCount;
    if (slotsLeft <= 0) {
      setValidationType('error');
      setValidationMessage(`You can upload maximum ${MAX_GALLERY_IMAGES} gallery images.`);
      setShowValidationModal(true);
      return;
    }

    const filesToAdd = allFiles.slice(0, slotsLeft);
    if (allFiles.length > slotsLeft) {
      setValidationType('error');
      setValidationMessage(`You can upload maximum ${MAX_GALLERY_IMAGES} gallery images.`);
      setShowValidationModal(true);
    }
    if (filesToAdd.length === 0) return;

    const newImages: (File | null)[] = Array.isArray(storeSetup.gallery_images)
      ? [...storeSetup.gallery_images]
      : [];
    const newPreviews = Array.isArray(storeSetup.gallery_previews) ? [...storeSetup.gallery_previews] : [];
    const nextUrls: string[] = Array.isArray((storeSetup as any).gallery_image_urls)
      ? [...((storeSetup as any).gallery_image_urls as string[])]
      : [];
    while (newImages.length < newPreviews.length) newImages.push(null);
    while (nextUrls.length < newPreviews.length) nextUrls.push('');

    let loaded = 0;

    filesToAdd.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        newImages.push(file);
        newPreviews.push(reader.result as string);
        nextUrls.push('');
        loaded++;
        if (loaded === filesToAdd.length) {
          setStoreSetup((prev) => ({
            ...(prev as any),
            gallery_images: newImages,
            gallery_previews: newPreviews,
            gallery_image_urls: nextUrls,
          }));
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveLogo = () => {
    setStoreSetup(prev => ({
      ...(prev as any),
      logo: null,
      logo_preview: '',
      logo_url: undefined,
    }));
  };

  const handleRemoveBanner = () => {
    setStoreSetup(prev => ({
      ...(prev as any),
      banner: null,
      banner_preview: '',
      banner_url: undefined,
    }));
  };

  const handleRemoveGalleryImage = (index: number) => {
    setStoreSetup(prev => {
      const nextImages = Array.isArray(prev.gallery_images) ? [...prev.gallery_images] : [];
      const nextPreviews = Array.isArray(prev.gallery_previews) ? [...prev.gallery_previews] : [];
      const nextUrls = Array.isArray((prev as any).gallery_image_urls)
        ? [...((prev as any).gallery_image_urls as string[])]
        : [];
      if (index >= 0) {
        if (nextImages.length > index) nextImages.splice(index, 1);
        if (nextPreviews.length > index) nextPreviews.splice(index, 1);
        if (nextUrls.length > index) nextUrls.splice(index, 1);
      }
      return {
        ...(prev as any),
        gallery_images: nextImages,
        gallery_previews: nextPreviews,
        gallery_image_urls: nextUrls,
      };
    });
  };

  const handleStoreHoursChange = (
    day: string,
    field: 'closed' | 'slot1_open' | 'slot1_close' | 'slot2_open' | 'slot2_close',
    value: string | boolean
  ) => {
    const newHours = {
      ...storeSetup.store_hours,
      [day]: {
        ...storeSetup.store_hours[day as keyof typeof storeSetup.store_hours],
        [field]: value
      }
    };
    const newForm = { ...storeSetup, store_hours: newHours };
    setStoreSetup(newForm);
    // Instant save to DB
    if (onStoreHoursSave) {
      onStoreHoursSave(newHours);
    }
  };

  const toggleDayOpen = (day: string) => {
    const currentDay = storeSetup.store_hours[day as keyof typeof storeSetup.store_hours];
    const isCurrentlyClosed = currentDay.closed;
    const newHours = {
      ...storeSetup.store_hours,
      [day]: {
        ...currentDay,
        closed: !isCurrentlyClosed, // Toggle: if currently closed, make it open
        // If opening and no slot1 exists, initialize with defaults; if closing, clear slots
        slot1_open: isCurrentlyClosed ? (currentDay.slot1_open || '09:00') : '',
        slot1_close: isCurrentlyClosed ? (currentDay.slot1_close || '22:00') : '',
        slot2_open: isCurrentlyClosed ? (currentDay.slot2_open || '') : '',
        slot2_close: isCurrentlyClosed ? (currentDay.slot2_close || '') : '',
      }
    };
    setStoreSetup(prev => ({ ...prev, store_hours: newHours }));
    if (onStoreHoursSave) {
      onStoreHoursSave(newHours);
    }
  };

  const addSlot = (day: string) => {
    const currentDay = storeSetup.store_hours[day as keyof typeof storeSetup.store_hours];
    if (currentDay.slot2_open && currentDay.slot2_close) return; // Already has slot 2
    const newHours = {
      ...storeSetup.store_hours,
      [day]: {
        ...currentDay,
        slot2_open: (currentDay.slot2_open && currentDay.slot2_close) ? currentDay.slot2_open : '18:00',
        slot2_close: (currentDay.slot2_open && currentDay.slot2_close) ? currentDay.slot2_close : '22:00',
      }
    };
    setStoreSetup(prev => ({ ...prev, store_hours: newHours }));
    if (onStoreHoursSave) {
      onStoreHoursSave(newHours);
    }
  };

  const removeSlot2 = (day: string) => {
    const currentDay = storeSetup.store_hours[day as keyof typeof storeSetup.store_hours];
    const newHours = {
      ...storeSetup.store_hours,
      [day]: {
        ...currentDay,
        slot2_open: '',
        slot2_close: '',
      }
    };
    setStoreSetup(prev => ({ ...prev, store_hours: newHours }));
    if (onStoreHoursSave) {
      onStoreHoursSave(newHours);
    }
  };

  const applyHoursPreset = (preset: 'same_as_monday' | 'lunch_dinner' | 'full_day' | 'weekday_weekend') => {
    const hours = { ...storeSetup.store_hours };
    let nextHours: typeof hours;
    
    if (preset === 'same_as_monday') {
      const monday = { ...hours.monday };
      nextHours = Object.keys(hours).reduce((acc, day) => {
        acc[day as keyof typeof hours] = { ...monday };
        return acc;
      }, { ...hours });
      setPresetToggles(prev => ({ ...prev, sameAsMonday: true, weekdayWeekend: false, lunchDinner: false, is24Hours: false }));
    } else if (preset === 'lunch_dinner') {
      nextHours = Object.keys(hours).reduce((acc, day) => {
        acc[day as keyof typeof hours] = {
          closed: false,
          slot1_open: '11:00',
          slot1_close: '15:00',
          slot2_open: '18:00',
          slot2_close: '23:00',
        };
        return acc;
      }, { ...hours });
      setPresetToggles(prev => ({ ...prev, sameAsMonday: false, weekdayWeekend: false, lunchDinner: true, is24Hours: false }));
    } else if (preset === 'full_day') {
      nextHours = Object.keys(hours).reduce((acc, day) => {
        acc[day as keyof typeof hours] = {
          closed: false,
          slot1_open: '00:00',
          slot1_close: '23:59',
          slot2_open: '',
          slot2_close: '',
        };
        return acc;
      }, { ...hours });
      setPresetToggles(prev => ({ ...prev, sameAsMonday: false, weekdayWeekend: false, lunchDinner: false, is24Hours: true }));
    } else {
      nextHours = { ...hours };
      (['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const).forEach((day) => {
        nextHours[day] = {
          closed: false,
          slot1_open: '09:00',
          slot1_close: '22:00',
          slot2_open: '',
          slot2_close: '',
        };
      });
      (['saturday', 'sunday'] as const).forEach((day) => {
        nextHours[day] = {
          closed: false,
          slot1_open: '10:00',
          slot1_close: '23:00',
          slot2_open: '',
          slot2_close: '',
        };
      });
      setPresetToggles(prev => ({ ...prev, sameAsMonday: false, weekdayWeekend: true, lunchDinner: false, is24Hours: false }));
    }
    
    setStoreSetup((prev) => ({ ...prev, store_hours: nextHours }));
    if (onStoreHoursSave) {
      onStoreHoursSave(nextHours);
    }
  };

  const timeToMinutes = (value: string) => {
    const [h, m] = (value || '').split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  };

  const validateStoreHours = (): string | null => {
    // Check if at least one day is open
    const hasOpenDay = Object.values(storeSetup.store_hours).some(hours => !hours.closed);
    if (!hasOpenDay) {
      return 'At least one day must be marked as open';
    }

    for (const [day, hours] of Object.entries(storeSetup.store_hours)) {
      if (hours.closed) continue;

      if (!hours.slot1_open || !hours.slot1_close) {
        return `${day.charAt(0).toUpperCase() + day.slice(1)}: Slot 1 is required for open day`;
      }
      const s1Start = timeToMinutes(hours.slot1_open);
      const s1End = timeToMinutes(hours.slot1_close);
      if (s1Start == null || s1End == null || s1Start >= s1End) {
        return `${day.charAt(0).toUpperCase() + day.slice(1)}: Slot 1 end time must be after start time`;
      }

      const hasSlot2 = !!(hours.slot2_open || hours.slot2_close);
      if (hasSlot2) {
        if (!hours.slot2_open || !hours.slot2_close) {
          return `${day.charAt(0).toUpperCase() + day.slice(1)}: Fill both start and end for Slot 2`;
        }
        const s2Start = timeToMinutes(hours.slot2_open);
        const s2End = timeToMinutes(hours.slot2_close);
        if (s2Start == null || s2End == null || s2Start >= s2End) {
          return `${day.charAt(0).toUpperCase() + day.slice(1)}: Slot 2 end time must be after start time`;
        }
        if (s2Start <= s1End) {
          return `${day.charAt(0).toUpperCase() + day.slice(1)}: Slot 2 must start after Slot 1 ends`;
        }
      }
    }
    return null;
  };

  useEffect(() => {
    const loadCuisines = async () => {
      try {
        const res = await fetch('/api/cuisines');
        if (!res.ok) return;
        const data = await res.json();
        let list: string[] = [];
        if (Array.isArray(data)) {
          list = data.filter((item) => typeof item === 'string');
        } else if (Array.isArray((data as any)?.cuisines)) {
          list = (data as any).cuisines.filter((item: unknown) => typeof item === 'string');
        }
        setAllCuisines(list);
      } catch (err) {
        console.error('Failed to load cuisines:', err);
      }
    };
    loadCuisines();
  }, []);

  const filteredCuisines = useMemo<string[]>(() => {
    const query = cuisineSearch.trim().toLowerCase();
    if (!query) return allCuisines;
    return allCuisines.filter((cuisine) => cuisine.toLowerCase().includes(query));
  }, [allCuisines, cuisineSearch]);

  const toggleCuisine = (cuisine: string) => {
    setStoreSetup((prev) => {
      const exists = prev.cuisine_types.includes(cuisine);
      if (exists) {
        return { ...prev, cuisine_types: prev.cuisine_types.filter((c) => c !== cuisine) };
      }
      // Limit to 10 cuisines
      if (prev.cuisine_types.length >= 10) {
        setValidationType('error');
        setValidationMessage('You can select a maximum of 10 cuisines. For more cuisines, please upgrade your plan.');
        setShowValidationModal(true);
        return prev;
      }
      return { ...prev, cuisine_types: [...prev.cuisine_types, cuisine] };
    });
  };

  const handleStoreSetupSaveAndContinue = () => {
    // Validate cuisines (required, max 10)
    if (!storeSetup.cuisine_types || storeSetup.cuisine_types.length === 0) {
      setValidationType('error');
      setValidationMessage('Please select at least one cuisine. You can select up to 10 cuisines.');
      setShowValidationModal(true);
      return;
    }
    if (storeSetup.cuisine_types.length > 10) {
      setValidationType('error');
      setValidationMessage('You can select a maximum of 10 cuisines. For more cuisines, please upgrade your plan.');
      setShowValidationModal(true);
      return;
    }

    // Validate Store Features (at least one required)
    if (!storeSetup.is_pure_veg && !storeSetup.accepts_online_payment && !storeSetup.accepts_cash) {
      setValidationType('error');
      setValidationMessage('Please select at least one store feature (Pure Vegetarian, Online Payment, or Cash on Delivery).');
      setShowValidationModal(true);
      return;
    }

    // Validate store hours
    const hoursError = validateStoreHours();
    if (hoursError) {
      setValidationType('error');
      setValidationMessage(hoursError);
      setShowValidationModal(true);
      return;
    }

    const dr = storeSetup.delivery_radius_km;
    if (
      dr === '' ||
      typeof dr !== 'number' ||
      Number.isNaN(dr) ||
      dr < MIN_STORE_DELIVERY_RADIUS_KM ||
      dr > MAX_STORE_DELIVERY_RADIUS_KM
    ) {
      setValidationType('error');
      setValidationMessage(
        `Please enter a delivery radius between ${MIN_STORE_DELIVERY_RADIUS_KM} and ${MAX_STORE_DELIVERY_RADIUS_KM} km.`
      );
      setShowValidationModal(true);
      return;
    }

    // All validations passed, proceed
    if (onStoreSetupComplete) {
      onStoreSetupComplete(storeSetup);
    }
  };

  const triggerFileInput = (ref: React.RefObject<HTMLInputElement | null>) => {
    if (ref.current) {
      ref.current.value = '';
      ref.current.click();
    }
  };

  const triggerFileInputWithReplaceCheck = (fieldKey: keyof DocumentData, ref: React.RefObject<HTMLInputElement | null>) => {
    if (hasDocFileOrUrl(fieldKey)) {
      setReplaceImageConfirm({
        onConfirm: () => {
          triggerFileInput(ref);
          setReplaceImageConfirm(null);
        },
      });
    } else {
      triggerFileInput(ref);
    }
  };

  const removeFile = (fieldName: keyof DocumentData) => {
    const urlKey = getDocUrlKey(String(fieldName));
    setDocuments(prev => {
      const next = { ...prev, [fieldName]: null } as DocumentData;
      (next as any)[urlKey] = null; // explicit null so API and R2 delete
      if (onDocumentSave) {
        void Promise.resolve().then((): Record<string, unknown> | undefined => {
          onDocumentSave!(next);
          return undefined;
        });
      }
      return next;
    });
  };

  const goToPrevSection = () => {
    if (currentStep === 'store-setup') {
      setCurrentStep('documents');
    } else if (currentStep === 'documents') {
      if (verificationDocFixActive) {
        const curIdx = rejectedDocSections.indexOf(activeSection);
        if (curIdx > 0) {
          setActiveSection(rejectedDocSections[curIdx - 1]!);
        } else {
          onBack();
        }
        return;
      }
      const sectionOrder: DocActiveSection[] = showOtherDocs
        ? ['pan', 'aadhar', 'licence', 'gst', 'bank', 'other']
        : ['pan', 'aadhar', 'licence', 'gst', 'bank'];
      const currentIndex = sectionOrder.indexOf(activeSection);
      if (currentIndex > 0) {
        setActiveSection(sectionOrder[currentIndex - 1]);
      } else {
        onBack();
      }
    }
  };

  const handleModalAction = (proceed: boolean) => {
    setShowValidationModal(false);
    if (proceed && validationType === 'warning') {
      if (onDocumentComplete) {
        onDocumentComplete(documents);
      }
    }
  };

  const renderUploadedDocumentPanel = (args: {
    viewTitle: string;
    file: File | null;
    url?: string;
    imagePreviewUrl?: string;
    onChange: () => void;
    onRemove: () => void;
    uploading?: boolean;
  }) => {
    const { viewTitle, file, url, imagePreviewUrl, onChange, onRemove, uploading } = args;
    const displayName = file?.name || (url ? 'Uploaded document' : 'Uploaded');
    const sizeMb = file ? (file.size / 1024 / 1024).toFixed(2) + ' MB' : null;
    const pdfOnly = isLikelyPdf(file, url) && !imagePreviewUrl;
    const thumbSrc =
      imagePreviewUrl ||
      (!url || isLikelyPdf(file, url) ? null : normalizeDocumentThumbSrc(url));
    const openPreview = () => setDocPreviewPayload({ title: viewTitle, file, url, imagePreviewUrl });
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-2.5 sm:p-3">
        <div className="flex flex-col items-stretch gap-2.5 sm:flex-row sm:items-center sm:gap-3">
          <button
            type="button"
            onClick={openPreview}
            className="group relative mx-auto flex h-[104px] w-[140px] shrink-0 cursor-zoom-in items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:mx-0 sm:h-[112px] sm:w-[150px]"
            aria-label={`Open ${viewTitle} preview`}
          >
            {thumbSrc ? (
              <>
                <img src={thumbSrc} alt="" className="max-h-full max-w-full object-contain" />
                <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-slate-900/70 px-1.5 py-0.5 text-[9px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                  Enlarge
                </span>
              </>
            ) : (
              <div className="flex flex-col items-center gap-1 px-2 py-3 text-center text-slate-600">
                <svg className="h-8 w-8 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-[11px] font-medium leading-tight text-slate-700">{pdfOnly ? 'PDF' : 'File'}</p>
                <p className="text-[10px] leading-tight text-slate-500">Tap · View</p>
              </div>
            )}
          </button>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-slate-800 sm:text-sm" title={displayName}>
                {displayName}
              </p>
              {sizeMb ? (
                <p className="text-[10px] text-slate-500 sm:text-xs">{sizeMb}</p>
              ) : url ? (
                <p className="text-[10px] text-slate-500 sm:text-xs">Saved</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={openPreview}
                className="rounded-md border border-indigo-200 bg-white px-2 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-50 sm:px-2.5 sm:text-xs"
              >
                View
              </button>
              <button
                type="button"
                onClick={onChange}
                disabled={!!uploading}
                className="rounded-md border border-indigo-200 bg-white px-2 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 sm:px-2.5 sm:text-xs"
              >
                Change
              </button>
              <button
                type="button"
                onClick={onRemove}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                title="Remove"
              >
                <span className="sr-only">Remove</span>
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderReplaceImageModal = () => (
    replaceImageConfirm && (
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" aria-modal="true" role="dialog">
        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-md w-full border border-amber-200">
          <div className="flex items-center gap-3 mb-4 text-amber-600">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900">Replace document?</h3>
          </div>
          <p className="text-slate-600 text-sm sm:text-base mb-6">
            The existing file will be replaced. This action cannot be undone. Do you want to continue?
          </p>
          <div className="flex flex-row justify-end gap-3">
            <button
              type="button"
              onClick={() => setReplaceImageConfirm(null)}
              className="px-4 py-2.5 text-sm font-medium rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => { replaceImageConfirm.onConfirm(); }}
              className="px-4 py-2.5 text-sm font-medium rounded-xl bg-amber-600 text-white hover:bg-amber-700"
            >
              Yes, replace
            </button>
          </div>
        </div>
      </div>
    )
  );

  const renderValidationModal = () => (
    showValidationModal && (
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" aria-modal="true" role="dialog" onClick={(e) => {
        // Close modal when clicking backdrop
        if (e.target === e.currentTarget) {
          setShowValidationModal(false);
        }
      }}>
        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-md w-full border border-slate-200 animate-in fade-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
          <div className={`flex items-center gap-3 mb-4 ${validationType === 'error' ? 'text-rose-600' : validationType === 'warning' ? 'text-amber-600' : 'text-blue-600'}`}>
            {validationType === 'error' ? (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-rose-100">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
            ) : validationType === 'warning' ? (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
            )}
            <h3 className="text-lg sm:text-xl font-semibold text-slate-900">
              {validationType === 'error' ? 'Required Field Missing' : validationType === 'warning' ? 'Warning' : 'Information'}
            </h3>
          </div>
          <p className="text-slate-700 text-sm sm:text-base mb-6 leading-relaxed whitespace-pre-line text-left">
            {validationMessage}
          </p>
          <div className="flex flex-row justify-end gap-3">
            {validationType === 'error' ? (
              <button
                type="button"
                onClick={() => setShowValidationModal(false)}
                className="px-5 py-2.5 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition"
              >
                OK, I'll Fix It
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleModalAction(false)}
                  className="px-4 py-2.5 text-sm font-medium rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleModalAction(true)}
                  className="px-4 py-2.5 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition"
                >
                  Continue Anyway
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  );

  const renderPanSection = () => (
    <div className="space-y-2">
      {docRejection.pan && (
        <AdminRejectionBanner title="Rejected by verification team — please update and save">
          {docRejection.pan}
        </AdminRejectionBanner>
      )}
      <div className="rounded-lg bg-indigo-50/80 border border-indigo-100 p-3">
        <div className="flex items-start gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-indigo-900">PAN Card (Mandatory)</p>
            <p className="text-xs text-indigo-700 mt-0.5">
              PAN number is verified automatically — no card image needed when it verifies. Format: ABCDE1234F
            </p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Electronic modes only ask for the number — the name is matched
            against the store owner automatically and back-filled from the
            provider's registered name on success. */}
        {!isElectronic(panMode) && (
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Name as on PAN <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            name="pan_holder_name"
            value={documents.pan_holder_name || ''}
            onChange={handleDocumentInputChange}
            placeholder="Full name as on PAN card"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
            autoComplete="name"
          />
        </div>
        )}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            PAN Number <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            {/** AM-like: green border + tick when valid */}
            {(() => {
              const isPanValid = !!documents.pan_number && !docFormatErrors.pan_number;
              return (
                <>
            <input
              type="text"
              name="pan_number"
              value={documents.pan_number || ''}
              onChange={handleDocumentInputChange}
              placeholder="ABCDE1234F"
              className={`w-full px-3 py-2 pr-10 text-sm border rounded-lg bg-white font-medium tracking-wider uppercase focus:outline-none focus:ring-2 ${
                isPanValid
                  ? "border-emerald-500 focus:border-emerald-600 focus:ring-emerald-200"
                  : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
              }`}
              required
              maxLength={10}
              pattern="[A-Z]{5}[0-9]{4}[A-Z]{1}"
              title="Format: ABCDE1234F"
              style={{ textTransform: 'uppercase' }}
              autoComplete="off"
            />
            {renderValidTick(isPanValid)}
                </>
              );
            })()}
          </div>
          {docFormatErrors.pan_number && <p className="text-xs text-rose-600 mt-1">{docFormatErrors.pan_number}</p>}
          <p className="text-xs text-slate-500 mt-1.5">10 characters, auto uppercase (e.g. ABCDE1234F)</p>
        </div>

        {/* ── Automatic verification (auto / hybrid modes) ── */}
        {isElectronic(panMode) && (
          <div className="md:col-span-2">
            {panVerify.state === 'verified' ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[11px]">✓</span>
                  PAN verified automatically
                </p>
                {verifiedDetailRows(panVerify.details).length > 0 && (
                  <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                    {verifiedDetailRows(panVerify.details).map(([l, v]) => (
                      <div key={l} className="flex gap-1.5 text-xs">
                        <dt className="text-emerald-700">{l}:</dt>
                        <dd className="font-medium text-emerald-900">{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <p className="mt-1.5 text-xs text-emerald-700">No card image needed. You can continue.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={
                    panVerify.state === 'verifying' ||
                    !(documents.pan_number || '').trim() ||
                    !!documentFormatValidators.pan((documents.pan_number || '').trim())
                  }
                  onClick={() => verifyDocNow('pan')}
                  className="inline-flex w-fit items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {panVerify.state === 'verifying' ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Verifying…</>
                  ) : (
                    'Verify PAN'
                  )}
                </button>
                {panVerify.state === 'failed' && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <p className="font-semibold">Instant verification didn't succeed.</p>
                    <p className="text-xs mt-0.5">
                      {panVerify.error || 'The details could not be verified automatically.'} Upload a
                      clear PAN card image below — our team will verify it manually.
                    </p>
                  </div>
                )}
                {panVerify.state === 'manual' && (
                  <p className="text-xs text-slate-500">
                    Your PAN has been queued for manual verification by our team. You can upload the
                    card image below to speed it up.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {uploadAllowedFor(panMode, panVerify) && (
        <div className="md:col-span-2 space-y-1.5" id="pan-manual-upload">
          <label className="block text-xs font-medium text-slate-700">
            {isElectronic(panMode) ? (
              <>PAN Card Image <span className="text-rose-500">*</span> <span className="text-slate-400">(required — automatic verification did not succeed)</span></>
            ) : (
              <>PAN Card Image <span className="text-rose-500">*</span></>
            )}
          </label>
          <input
            type="file"
            ref={fileInputRefs.pan}
            onChange={(e) => handleFileChange(e, 'pan_image')}
            accept=".jpg,.jpeg,.png,.pdf"
            className="hidden"
          />
          {!hasDocFileOrUrl('pan_image') ? (
            <button
              type="button"
              onClick={() => triggerFileInputWithReplaceCheck('pan_image', fileInputRefs.pan)}
              className="w-full rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/40 p-6 text-center hover:border-indigo-500 hover:bg-indigo-50 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
            >
              <svg className="w-10 h-10 text-indigo-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            <p className="text-sm font-semibold text-slate-700">
              {isUploadingField('pan_image') ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
                </span>
              ) : (
                'Upload PAN Card Image'
              )}
            </p>
              <p className="text-xs text-slate-500 mt-1">JPG, PNG or PDF · Max 5MB</p>
            </button>
          ) : (
            renderUploadedDocumentPanel({
              viewTitle: 'PAN card',
              file: documents.pan_image,
              url: documents.pan_image_url,
              imagePreviewUrl: panPreviewUrl,
              onChange: () => triggerFileInputWithReplaceCheck('pan_image', fileInputRefs.pan),
              onRemove: () => removeFile('pan_image'),
              uploading: isUploadingField('pan_image'),
            })
          )}
        </div>
        )}
      </div>
      <div className="rounded-xl bg-amber-50/80 border border-amber-100 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-900">Note</p>
            <p className="text-xs text-amber-800 mt-0.5">
              PAN must be valid and belong to the business owner or authorized signatory.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAadharSection = () => (
    <div className="space-y-3">
      {docRejection.aadhaar && (
        <AdminRejectionBanner title="Rejected by verification team — please update and save">
          {docRejection.aadhaar}
        </AdminRejectionBanner>
      )}
      <div className="rounded-lg bg-indigo-50/80 border border-indigo-100 p-3">
        <div className="flex items-start gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-indigo-900">Aadhaar Card <span className="text-slate-500 text-xs font-normal">(Optional)</span></p>
            <p className="text-xs text-indigo-700 mt-0.5">
          {isElectronic(aadhaarMode)
            ? 'Optional — DigiLocker verify, or skip and continue anytime.'
            : 'Identity verification. Images are optional—number and name sufficient.'}
        </p>
          </div>
        </div>
      </div>
      <div className={`grid grid-cols-1 ${isElectronic(aadhaarMode) ? '' : 'md:grid-cols-2'} gap-4 sm:gap-5`}>
        {!isElectronic(aadhaarMode) && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Name as on Aadhaar <span className="text-slate-500 text-xs font-normal">(if providing)</span>
          </label>
          <input
            type="text"
            name="aadhar_holder_name"
            value={documents.aadhar_holder_name || ''}
            onChange={handleDocumentInputChange}
            placeholder="Full name as on Aadhaar card"
            className="w-full px-4 py-3 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
            autoComplete="name"
          />
        </div>
        )}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Aadhaar Number <span className="text-slate-500 text-xs font-normal">(if providing)</span>
          </label>
          <div className="relative">
            {(() => {
              const isAadhaarValid = !!documents.aadhar_number && !docFormatErrors.aadhar_number;
              return (
                <>
            <input
              type="text"
              name="aadhar_number"
              value={documents.aadhar_number || ''}
              onChange={handleDocumentInputChange}
              placeholder="123456789012"
              inputMode={isMaskedAadhaar(documents.aadhar_number) ? 'text' : 'numeric'}
              autoComplete="off"
              readOnly={aadhaarVerify.state === 'verified' || !!(documents as { aadhaar_is_verified?: boolean }).aadhaar_is_verified}
              className={`w-full px-4 py-3 pr-12 text-sm border rounded-xl bg-white focus:outline-none focus:ring-2 ${
                isAadhaarValid
                  ? "border-emerald-500 focus:border-emerald-600 focus:ring-emerald-200"
                  : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
              } ${aadhaarVerify.state === 'verified' || (documents as { aadhaar_is_verified?: boolean }).aadhaar_is_verified ? 'bg-emerald-50/40' : ''}`}
              maxLength={isMaskedAadhaar(documents.aadhar_number) ? 14 : 12}
              title="12-digit Aadhaar number"
            />
            {renderValidTick(isAadhaarValid)}
                </>
              );
            })()}
          </div>
          {docFormatErrors.aadhar_number && <p className="text-xs text-rose-600 mt-1">{docFormatErrors.aadhar_number}</p>}
          <p className="text-xs text-slate-500 mt-1.5">12 digits, no spaces</p>
        </div>
      </div>

      {/* ── Aadhaar Automatic verification via DigiLocker (auto / hybrid) ── */}
      {isElectronic(aadhaarMode) && (
        <div>
          {aadhaarVerify.state === 'verified' ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[11px]">✓</span>
                Aadhaar verified via DigiLocker
              </p>
              {(() => {
                const rows = normalizeAadhaarVerifiedDetails(
                  aadhaarVerify.details ||
                    (documents as { aadhaar_verified_details?: Record<string, unknown> }).aadhaar_verified_details ||
                    null,
                ).rows;
                if (!rows.length) {
                  return (
                    <p className="mt-1.5 text-xs text-emerald-700">No card images needed. You can continue.</p>
                  );
                }
                return (
                  <>
                    <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      {rows.map(([label, value]) => (
                        <div key={label} className="flex gap-1.5 text-left">
                          <dt className="text-emerald-700 shrink-0">{label}:</dt>
                          <dd className="font-medium text-emerald-900 break-words">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-1.5 text-xs text-emerald-700">No card images needed. You can continue.</p>
                  </>
                );
              })()}
            </div>
          ) : aadhaarVerify.state === 'verifying' && aadhaarVerify.pending ? (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800 space-y-2">
              <p className="font-semibold flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Waiting for DigiLocker confirmation…
              </p>
              <p className="text-xs mt-0.5">
                Complete OTP in the DigiLocker window — this panel updates when verified.
              </p>
              <button
                type="button"
                onClick={cancelDigilockerFlow}
                className="inline-flex w-fit items-center rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-medium text-indigo-800 hover:bg-indigo-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={
                  aadhaarVerify.state === 'verifying' ||
                  !(documents.aadhar_number || '').replace(/\D/g, '').trim() ||
                  !!documentFormatValidators.aadhar((documents.aadhar_number || '').replace(/\D/g, ''))
                }
                onClick={() => verifyDocNow('aadhaar')}
                className="inline-flex w-fit items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {aadhaarVerify.state === 'verifying' ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Starting DigiLocker…</>
                ) : (
                  'Verify with DigiLocker'
                )}
              </button>
              <p className="text-xs text-slate-500">
                Enter a valid 12-digit Aadhaar number first, then verify with DigiLocker — or skip this optional step.
              </p>
              {aadhaarVerify.state === 'failed' && aadhaarMode === 'auto' && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  <span className="font-semibold">Aadhaar verification failed. </span>
                  {aadhaarVerify.error || 'DigiLocker verification did not complete.'} Please try again
                  after some time — Automatic verification is required.
                </div>
              )}
              {aadhaarVerify.state === 'failed' && aadhaarMode === 'hybrid' && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <span className="font-semibold">DigiLocker verification didn't complete. </span>
                  You can upload your Aadhaar card images below instead — our team will verify them manually.
                </div>
              )}
              {aadhaarVerify.state === 'manual' && (
                <p className="text-xs text-slate-500">
                  Aadhaar queued for manual verification. Upload the card images below to speed it up.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {(uploadAllowedFor(aadhaarMode, aadhaarVerify) || hasDocFileOrUrl('aadhar_front') || hasDocFileOrUrl('aadhar_back')) && aadhaarVerify.state !== 'verified' && (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Front Side <span className="text-slate-500 text-xs font-normal">(optional)</span>
            </label>
            <input type="file" ref={fileInputRefs.aadharFront} onChange={(e) => handleFileChange(e, 'aadhar_front')} accept=".jpg,.jpeg,.png,.pdf" className="hidden" />
            {!hasDocFileOrUrl('aadhar_front') ? (
              <button type="button" onClick={() => triggerFileInputWithReplaceCheck('aadhar_front', fileInputRefs.aadharFront)} className="w-full rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-6 text-center hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
                <svg className="w-10 h-10 text-slate-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <p className="text-sm font-medium text-slate-600">
                  {isUploadingField('aadhar_front') ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
                    </span>
                  ) : (
                    'Upload Front'
                  )}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Photo & details</p>
              </button>
            ) : (
              renderUploadedDocumentPanel({
                viewTitle: 'Aadhaar front',
                file: documents.aadhar_front,
                url: documents.aadhar_front_url,
                imagePreviewUrl: aadharFrontPreviewUrl,
                onChange: () => triggerFileInputWithReplaceCheck('aadhar_front', fileInputRefs.aadharFront),
                onRemove: () => removeFile('aadhar_front'),
                uploading: isUploadingField('aadhar_front'),
              })
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Back Side <span className="text-slate-500 text-xs font-normal">(optional)</span>
            </label>
            <input type="file" ref={fileInputRefs.aadharBack} onChange={(e) => handleFileChange(e, 'aadhar_back')} accept=".jpg,.jpeg,.png,.pdf" className="hidden" />
            {!hasDocFileOrUrl('aadhar_back') ? (
              <button type="button" onClick={() => triggerFileInputWithReplaceCheck('aadhar_back', fileInputRefs.aadharBack)} className="w-full rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-6 text-center hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
                <svg className="w-10 h-10 text-slate-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <p className="text-sm font-medium text-slate-600">
                  {isUploadingField('aadhar_back') ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
                    </span>
                  ) : (
                    'Upload Back'
                  )}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Address side</p>
              </button>
            ) : (
              renderUploadedDocumentPanel({
                viewTitle: 'Aadhaar back',
                file: documents.aadhar_back,
                url: documents.aadhar_back_url,
                imagePreviewUrl: aadharBackPreviewUrl,
                onChange: () => triggerFileInputWithReplaceCheck('aadhar_back', fileInputRefs.aadharBack),
                onRemove: () => removeFile('aadhar_back'),
                uploading: isUploadingField('aadhar_back'),
              })
            )}
          </div>
        </div>
      )}
      {!isElectronic(aadhaarMode) && (
      <div className="rounded-xl bg-amber-50/80 border border-amber-100 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-900">Note</p>
            <p className="text-xs text-amber-800 mt-0.5">Both sides must be clear and readable.</p>
          </div>
        </div>
      </div>
      )}
    </div>
  );

  const renderLicenceSection = () => (
    <div className="space-y-3">
      {optionalRejectionItems.length > 0 && (
        <AdminRejectionBanner title="Verification feedback — please fix the items below and save">
          <ul className="list-disc space-y-1.5 pl-4">
            {optionalRejectionItems.map((item) => (
              <li key={item.label}>
                <span className="font-semibold">{item.label}: </span>
                {item.reason}
              </li>
            ))}
          </ul>
        </AdminRejectionBanner>
      )}
      {/* Show banner only for Food/Pharma businesses (mandatory docs), hide for optional */}
      {(isFoodBusiness() || isPharmaBusiness()) && (
          <div className={`rounded-lg border p-2.5 ${
          isFoodBusiness() ? 'bg-rose-50/80 border-rose-100' : 'bg-violet-50/80 border-violet-100'
        }`}>
          <div className="flex items-start gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              isFoodBusiness() ? 'bg-rose-100 text-rose-600' : 'bg-violet-100 text-violet-600'
            }`}>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <p className={`text-sm font-semibold ${
                isFoodBusiness() ? 'text-yellow-800' : 'text-violet-900'
              }`}>
                {isFoodBusiness() ? 'FSSAI Certificate (Mandatory)' : 'Pharma Documents (Mandatory)'}
              </p>
              <p className={`text-xs mt-0.5 ${
                isFoodBusiness() ? 'text-yellow-700' : 'text-violet-700'
              }`}>
                {isFoodBusiness()
                  ? `FSSAI license is mandatory for ${businessType.toLowerCase()} as per food safety regulations.`
                  : 'Drug License and Pharmacist details mandatory for pharmacy as per drug regulations.'}
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Pharma-specific Documents */}
      {isPharmaBusiness() && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Left: numbers + dates */}
            <div className="space-y-2">
              <div className="space-y-1.5">
                <h4 className="text-sm font-medium text-gray-700">
                  Drug License Number <span className="text-red-500">*</span>
                </h4>
                <div className="relative">
                  {(() => {
                    const isDrugLicValid =
                      !!String(documents.drug_license_number || "").trim() &&
                      !docFormatErrors.drug_license_number &&
                      !licenceDup.drug &&
                      !licenceDup.checkingDrug &&
                      licenceDup.drugOk;
                    return (
                      <>
                        <input
                          type="text"
                          name="drug_license_number"
                          value={documents.drug_license_number || ""}
                          onChange={handleDocumentInputChange}
                          placeholder="Enter Drug License Number"
                          className={`w-full px-3 py-2 pr-10 text-sm border rounded-xl bg-white focus:outline-none focus:ring-2 ${
                            docFormatErrors.drug_license_number || licenceDup.drug
                              ? "border-rose-400 focus:border-rose-500 focus:ring-rose-200"
                              : isDrugLicValid
                              ? "border-emerald-500 focus:border-emerald-600 focus:ring-emerald-200"
                              : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
                          }`}
                          required
                        />
                        {licenceDup.checkingDrug ? (
                          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                            <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                          </span>
                        ) : (
                          renderValidTick(isDrugLicValid)
                        )}
                      </>
                    );
                  })()}
                </div>
                {(docFormatErrors.drug_license_number || licenceDup.drug) && (
                  <p className="text-xs text-rose-600 mt-1">
                    {docFormatErrors.drug_license_number || licenceDup.drug}
                  </p>
                )}
                {licenceDup.checkingDrug && !docFormatErrors.drug_license_number && (
                  <p className="text-xs text-slate-500 mt-1 inline-flex items-center gap-1">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Checking Drug Licence uniqueness…
                  </p>
                )}
                <p className="text-xs text-gray-500">
                  Retail (Form 20/21) or Wholesale (Form 20B/21B) License
                </p>
              </div>

              <div className="space-y-1.5">
                <h4 className="text-sm font-medium text-gray-700">
                  Drug License Expiry Date <span className="text-red-500">*</span>
                </h4>
                <input
                  type="date"
                  name="drug_license_expiry_date"
                  value={documents.drug_license_expiry_date || ""}
                  onChange={handleDocumentInputChange}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  required
                />
                <p className="text-xs text-gray-500">Drug license expiry date</p>
              </div>

              <div className="space-y-1.5">
                <h4 className="text-sm font-medium text-gray-700">
                  Pharmacist Registration Number <span className="text-red-500">*</span>
                </h4>
                <div className="relative">
                  {(() => {
                    const isPharmRegValid = !!String(documents.pharmacist_registration_number || "").trim();
                    return (
                      <>
                        <input
                          type="text"
                          name="pharmacist_registration_number"
                          value={documents.pharmacist_registration_number || ""}
                          onChange={handleDocumentInputChange}
                          placeholder="Enter Pharmacist Registration Number"
                          className={`w-full px-3 py-2 pr-10 text-sm border rounded-xl bg-white focus:outline-none focus:ring-2 ${
                            isPharmRegValid
                              ? "border-emerald-500 focus:border-emerald-600 focus:ring-emerald-200"
                              : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
                          }`}
                          required
                        />
                        {renderValidTick(isPharmRegValid)}
                      </>
                    );
                  })()}
                </div>
                <p className="text-xs text-gray-500">State Pharmacy Council Registration Number</p>
              </div>

              <div className="space-y-1.5">
                <h4 className="text-sm font-medium text-gray-700">
                  Pharmacist Certificate Expiry Date <span className="text-red-500">*</span>
                </h4>
                <input
                  type="date"
                  name="pharmacist_expiry_date"
                  value={documents.pharmacist_expiry_date || ""}
                  onChange={handleDocumentInputChange}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  required
                />
                <p className="text-xs text-gray-500">Pharmacist certificate expiry date</p>
              </div>
            </div>

            {/* Right: all uploads stacked */}
            <div className="space-y-2">
              {/* Drug licence upload */}
              <div className="space-y-1.5">
                <span className="block text-sm font-medium text-gray-700">
                  Drug Licence Upload <span className="text-red-500">*</span>
                </span>
                <input
                  type="file"
                  ref={fileInputRefs.drugLicense}
                  onChange={(e) => handleFileChange(e, "drug_license_image")}
                  accept=".jpg,.jpeg,.png,.pdf"
                  className="hidden"
                />
                {!hasDocFileOrUrl("drug_license_image") ? (
                  <button
                    type="button"
                    onClick={() =>
                      triggerFileInputWithReplaceCheck("drug_license_image", fileInputRefs.drugLicense)
                    }
                    className="w-full rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/60 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    {isUploadingField('drug_license_image') ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
                      </span>
                    ) : (
                      'Upload Drug Licence'
                    )}
                  </button>
                ) : (
                  renderUploadedDocumentPanel({
                    viewTitle: 'Drug licence',
                    file: documents.drug_license_image,
                    url: documents.drug_license_image_url,
                    imagePreviewUrl: drugLicensePreviewUrl,
                    onChange: () => triggerFileInputWithReplaceCheck("drug_license_image", fileInputRefs.drugLicense),
                    onRemove: () => removeFile("drug_license_image"),
                    uploading: isUploadingField('drug_license_image'),
                  })
                )}
              </div>

              {/* Pharmacist certificate upload */}
              <div className="space-y-1.5">
                <span className="block text-sm font-medium text-gray-700">
                  Pharmacist Certificate <span className="text-red-500">*</span>
                </span>
                <input
                  type="file"
                  ref={fileInputRefs.pharmacistCert}
                  onChange={(e) => handleFileChange(e, "pharmacist_certificate")}
                  accept=".jpg,.jpeg,.png,.pdf"
                  className="hidden"
                />
                {!hasDocFileOrUrl("pharmacist_certificate") ? (
                  <button
                    type="button"
                    onClick={() =>
                      triggerFileInputWithReplaceCheck("pharmacist_certificate", fileInputRefs.pharmacistCert)
                    }
                    className="w-full rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/60 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    {isUploadingField('pharmacist_certificate') ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
                      </span>
                    ) : (
                      'Upload Pharmacist Certificate'
                    )}
                  </button>
                ) : (
                  renderUploadedDocumentPanel({
                    viewTitle: 'Pharmacist certificate',
                    file: documents.pharmacist_certificate,
                    url: documents.pharmacist_certificate_url,
                    imagePreviewUrl: pharmacistCertPreviewUrl,
                    onChange: () => triggerFileInputWithReplaceCheck("pharmacist_certificate", fileInputRefs.pharmacistCert),
                    onRemove: () => removeFile("pharmacist_certificate"),
                    uploading: isUploadingField('pharmacist_certificate'),
                  })
                )}
              </div>

              {/* Council registration upload */}
              <div className="space-y-1.5">
                <span className="block text-sm font-medium text-gray-700">
                  State Pharmacy Council Registration <span className="text-red-500">*</span>
                </span>
                <input
                  type="file"
                  ref={fileInputRefs.pharmacyCouncil}
                  onChange={(e) => handleFileChange(e, "pharmacy_council_registration")}
                  accept=".jpg,.jpeg,.png,.pdf"
                  className="hidden"
                />
                {!hasDocFileOrUrl("pharmacy_council_registration") ? (
                  <button
                    type="button"
                    onClick={() =>
                      triggerFileInputWithReplaceCheck(
                        "pharmacy_council_registration",
                        fileInputRefs.pharmacyCouncil
                      )
                    }
                    className="w-full rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/60 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    {isUploadingField('pharmacy_council_registration') ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
                      </span>
                    ) : (
                      'Upload Council Registration'
                    )}
                  </button>
                ) : (
                  renderUploadedDocumentPanel({
                    viewTitle: 'Pharmacy council registration',
                    file: documents.pharmacy_council_registration,
                    url: documents.pharmacy_council_registration_url,
                    imagePreviewUrl: pharmacyCouncilPreviewUrl,
                    onChange: () =>
                      triggerFileInputWithReplaceCheck("pharmacy_council_registration", fileInputRefs.pharmacyCouncil),
                    onRemove: () => removeFile("pharmacy_council_registration"),
                    uploading: isUploadingField('pharmacy_council_registration'),
                  })
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* FSSAI (for food businesses) */}
      {isFoodBusiness() && (() => {
        const fssaiUnlocked =
          licenceDup.fssaiOk &&
          !licenceDup.checkingFssai &&
          !licenceDup.fssai &&
          !docFormatErrors.fssai_number &&
          String(documents.fssai_number || '').replace(/\D/g, '').length === 14;
        return (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700 mb-1">
            FSSAI Certificate <span className="text-red-500">*</span>
          </h4>
          <div className="space-y-3">
            <div className="max-w-xl">
              <div className="relative">
                <input
                  type="text"
                  name="fssai_number"
                  value={documents.fssai_number || ''}
                  onChange={handleDocumentInputChange}
                  placeholder="FSSAI License Number"
                  maxLength={14}
                  inputMode="numeric"
                  className={`w-full px-3 py-2 pr-10 text-sm border rounded-xl focus:ring-2 bg-white ${
                    docFormatErrors.fssai_number || licenceDup.fssai
                      ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                      : licenceDup.fssaiOk
                        ? 'border-emerald-500 focus:border-emerald-600 focus:ring-emerald-200'
                        : 'border-slate-300 focus:ring-indigo-500 focus:border-indigo-500'
                  }`}
                  required
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                  {licenceDup.checkingFssai ? (
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                  ) : licenceDup.fssaiOk && !docFormatErrors.fssai_number && !licenceDup.fssai ? (
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-white text-[10px]">
                      ✓
                    </span>
                  ) : null}
                </span>
              </div>
              {docFormatErrors.fssai_number && <p className="text-xs text-rose-600 mt-1">{docFormatErrors.fssai_number}</p>}
              {licenceDup.checkingFssai && (
                <p className="text-xs text-indigo-600 mt-1">Checking FSSAI number…</p>
              )}
              {!docFormatErrors.fssai_number && !licenceDup.checkingFssai && (
              <p className="text-xs text-gray-500 mt-2">
                Required for food businesses as per FSSAI regulations (14 digits)
              </p>
              )}
            </div>
            <div className={!fssaiUnlocked ? 'opacity-50 pointer-events-none' : undefined}>
              <input
                type="file"
                ref={fileInputRefs.fssai}
                onChange={(e) => handleFileChange(e, 'fssai_image')}
                accept=".jpg,.jpeg,.png,.pdf"
                className="hidden"
                disabled={!fssaiUnlocked}
              />
              {!hasDocFileOrUrl('fssai_image') ? (
                <button
                  type="button"
                  disabled={!fssaiUnlocked}
                  onClick={() => triggerFileInputWithReplaceCheck('fssai_image', fileInputRefs.fssai)}
                  className="w-full rounded-xl border-2 border-dashed border-rose-300 bg-rose-50/40 px-3 py-3 text-sm font-medium text-rose-600 hover:border-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isUploadingField('fssai_image') ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
                    </span>
                  ) : (
                    'Upload Certificate'
                  )}
                </button>
              ) : (
                renderUploadedDocumentPanel({
                  viewTitle: 'FSSAI certificate',
                  file: documents.fssai_image,
                  url: documents.fssai_image_url,
                  imagePreviewUrl: fssaiPreviewUrl,
                  onChange: () => triggerFileInputWithReplaceCheck('fssai_image', fileInputRefs.fssai),
                  onRemove: () => removeFile('fssai_image'),
                  uploading: isUploadingField('fssai_image'),
                })
              )}
            </div>
          </div>
          
          {/* FSSAI Expiry Date */}
          <div className={`space-y-2 ${!fssaiUnlocked ? 'opacity-50 pointer-events-none' : ''}`}>
            <h4 className="text-sm font-medium text-gray-700 mb-1">
              FSSAI Expiry Date <span className="text-red-500">*</span>
            </h4>
            <div className="w-full md:w-1/2">
              <input
                type="date"
                name="fssai_expiry_date"
                value={documents.fssai_expiry_date || ''}
                onChange={handleDocumentInputChange}
                disabled={!fssaiUnlocked}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white disabled:bg-slate-50 disabled:cursor-not-allowed"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                {fssaiUnlocked
                  ? 'FSSAI license expiry date (mandatory)'
                  : 'Enter a unique 14-digit FSSAI number first'}
              </p>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Other documents (optional) — shown on this page like AM */}
      <div
        className={`pt-1 ${
          isFoodBusiness() &&
          !(
            licenceDup.fssaiOk &&
            !licenceDup.checkingFssai &&
            !licenceDup.fssai &&
            !docFormatErrors.fssai_number
          )
            ? 'opacity-50 pointer-events-none'
            : ''
        }`}
      >
        {renderOtherDocumentsSection()}
      </div>

      <div className="rounded-xl bg-indigo-50/80 border border-indigo-100 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-indigo-900">Note</p>
            <p className="text-xs text-indigo-700 mt-0.5">
              {isPharmaBusiness()
                ? 'Pharma documents are mandatory. Store cannot operate without valid Drug License and Pharmacist details.'
                : isFoodBusiness()
                ? 'FSSAI is mandatory for food businesses.'
                : 'Optional documents help with faster verification and service access.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderGstSection = () => (
    <div className="space-y-3">
      {gstRejectionReason && (
        <AdminRejectionBanner title="Verification feedback — please fix the items below and save">
          <p>
            <span className="font-semibold">GST: </span>
            {gstRejectionReason}
          </p>
        </AdminRejectionBanner>
      )}

      <div className="rounded-xl bg-gradient-to-br from-purple-50 via-indigo-50 to-blue-50 border-2 border-purple-200/60 p-4 space-y-3 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-purple-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-purple-900">GST Certificate (Optional)</h4>
            <p className="text-xs text-purple-800 mt-0.5">
              GST registration is optional for many small businesses. If you have a GSTIN, enter it below
              {isElectronic(gstMode) ? ' — we can verify it instantly with Cashfree when electronic verification is enabled.' : '.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-purple-200/50">
          <div>
            <div className="relative">
              {(() => {
                const isGstValid = !!String(documents.gst_number || '').trim() && !docFormatErrors.gst_number;
                return (
                  <>
                    <input
                      type="text"
                      name="gst_number"
                      value={documents.gst_number || ''}
                      onChange={handleDocumentInputChange}
                      placeholder="GSTIN (15 characters)"
                      className={`w-full px-3 py-2 pr-10 text-sm border rounded-xl bg-white focus:outline-none focus:ring-2 ${
                        isGstValid
                          ? 'border-emerald-500 focus:border-emerald-600 focus:ring-emerald-200'
                          : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-500'
                      }`}
                    />
                    {renderValidTick(isGstValid)}
                  </>
                );
              })()}
            </div>
            {docFormatErrors.gst_number && <p className="text-xs text-rose-600 mt-1">{docFormatErrors.gst_number}</p>}
            <p className="text-xs text-gray-500 mt-2">Leave blank and tap Skip to continue without GST</p>
          </div>

          {isElectronic(gstMode) && !!String(documents.gst_number || '').trim() && (
            <div>
              {gstVerify.state === 'verified' || (documents as { gst_is_verified?: boolean }).gst_is_verified ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[11px]">✓</span>
                    GSTIN verified automatically
                  </p>
                  {verifiedDetailRows(gstVerify.details).length > 0 && (
                    <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                      {verifiedDetailRows(gstVerify.details).map(([l, v]) => (
                        <div key={l} className="flex gap-1.5 text-xs">
                          <dt className="text-emerald-700">{l}:</dt>
                          <dd className="font-medium text-emerald-900">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <p className="mt-1.5 text-xs text-emerald-700">No certificate upload needed.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={
                      gstVerify.state === 'verifying' ||
                      !(documents.gst_number || '').trim() ||
                      !!documentFormatValidators.gst((documents.gst_number || '').trim())
                    }
                    onClick={() => verifyDocNow('gstin')}
                    className="inline-flex w-fit items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {gstVerify.state === 'verifying' ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Verifying…</>
                    ) : (
                      'Verify GSTIN'
                    )}
                  </button>
                  {gstVerify.state === 'failed' && gstMode === 'auto' && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                      <span className="font-semibold">GSTIN verification failed. </span>
                      {gstVerify.error || 'The GSTIN could not be verified.'} Re-check the number or
                      try again after some time — automatic verification is required.
                    </div>
                  )}
                  {gstVerify.state === 'failed' && gstMode === 'hybrid' && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                      <span className="font-semibold">Instant verification didn&apos;t succeed. </span>
                      Upload your GST certificate below — our team will verify it manually.
                    </div>
                  )}
                  {gstVerify.state === 'manual' && (
                    <p className="text-xs text-slate-500">
                      GSTIN queued for manual verification. Upload the certificate to speed it up.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Manual GST business details: only in manual mode, or after auto-verify fails / falls back */}
          {!!String(documents.gst_number || '').trim() &&
            !(documents as { gst_is_verified?: boolean }).gst_is_verified &&
            gstVerify.state !== 'verified' &&
            (!isElectronic(gstMode) ||
              gstVerify.state === 'failed' ||
              gstVerify.state === 'manual') && (
            <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {isElectronic(gstMode) &&
                (gstVerify.state === 'failed' || gstVerify.state === 'manual') && (
                <p className="sm:col-span-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Auto verification didn&apos;t succeed — enter business details manually (and upload certificate if needed).
                </p>
              )}
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Legal Name of Business
                </label>
                <input
                  type="text"
                  name="gst_legal_business_name"
                  value={documents.gst_legal_business_name || ''}
                  onChange={handleDocumentInputChange}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter legal name of business"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Principal Place of Business
                </label>
                <textarea
                  name="gst_principal_place_of_business"
                  value={documents.gst_principal_place_of_business || ''}
                  onChange={handleDocumentInputChange}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter principal place of business"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Effective Date of Registration
                </label>
                <input
                  type="date"
                  name="gst_effective_registration_date"
                  value={(documents.gst_effective_registration_date || '').slice(0, 10)}
                  onChange={handleDocumentInputChange}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}

          {(!isElectronic(gstMode) || gstVerify.state === 'failed' || gstVerify.state === 'manual' || hasDocFileOrUrl('gst_image')) &&
            gstVerify.state !== 'verified' &&
            !(documents as { gst_is_verified?: boolean }).gst_is_verified && (
            <div className="space-y-2 md:col-span-2">
              <input
                type="file"
                ref={fileInputRefs.gst}
                onChange={(e) => handleFileChange(e, 'gst_image')}
                accept=".jpg,.jpeg,.png,.pdf"
                className="hidden"
              />
              {!hasDocFileOrUrl('gst_image') ? (
                <button
                  type="button"
                  onClick={() => triggerFileInputWithReplaceCheck('gst_image', fileInputRefs.gst)}
                  className="w-full rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/60 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                >
                  {isUploadingField('gst_image') ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
                    </span>
                  ) : (
                    'Upload GST certificate'
                  )}
                </button>
              ) : (
                renderUploadedDocumentPanel({
                  viewTitle: 'GST certificate',
                  file: documents.gst_image,
                  url: documents.gst_image_url,
                  imagePreviewUrl: gstPreviewUrl,
                  onChange: () => triggerFileInputWithReplaceCheck('gst_image', fileInputRefs.gst),
                  onRemove: () => removeFile('gst_image'),
                  uploading: isUploadingField('gst_image'),
                })
              )}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-indigo-50/80 border border-indigo-100 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-indigo-900">Note</p>
            <p className="text-xs text-indigo-700 mt-0.5">
              You can skip this section if you are not GST-registered. If you enter a GSTIN and automatic verification is enabled, you must verify before continuing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderBankSection = () => {
    const bank = documents.bank || {
      payout_method: 'bank' as const,
      account_holder_name: '',
      account_number: '',
      ifsc_code: '',
      bank_name: '',
      branch_name: '',
      account_type: '',
      upi_id: '',
      bank_proof_type: undefined as 'passbook' | 'cancelled_cheque' | 'bank_statement' | undefined,
      bank_proof_file: null as File | null,
      upi_qr_file: null as File | null,
    };
    const setBank = (field: string, value: string | 'bank' | 'upi' | undefined) => {
      setBankRequiredHighlight(false);
      setDocuments(prev => ({ ...prev, bank: { ...(prev.bank || bank), [field]: value } }));
    };
    const setBankFile = (field: 'bank_proof_file' | 'upi_qr_file', file: File | null) => {
      setBankRequiredHighlight(false);
      setDocuments(prev => {
        const nextBank = { ...(prev.bank || bank), [field]: file };
        if (file === null) {
          if (field === 'bank_proof_file') nextBank.bank_proof_file_url = undefined;
          else nextBank.upi_qr_screenshot_url = undefined;
        }
        return { ...prev, bank: nextBank };
      });
    };
    const isBank = (bank.payout_method || 'bank') === 'bank';
    const t = (s?: string) => String(s || '').trim();
    const missName = bankRequiredHighlight && !t(bank.account_holder_name);
    const missAcc = bankRequiredHighlight && !t(bank.account_number);
    const missIfsc = bankRequiredHighlight && !t(bank.ifsc_code);
    const missBank = bankRequiredHighlight && !t(bank.bank_name);
    const missProofType = bankRequiredHighlight && !bank.bank_proof_type;
    const missProofFile = bankRequiredHighlight && !!bank.bank_proof_type && !hasBankProofFileOrUrl();
    const missUpi = bankRequiredHighlight && !t(bank.upi_id);
    const upiAlreadyVerified =
      upiVerify.state === 'verified' || Boolean(bank.upi_verified);
    const missQr =
      bankRequiredHighlight &&
      !upiAlreadyVerified &&
      !hasUpiQrFileOrUrl() &&
      (!isElectronic(upiMode) || uploadAllowedFor(upiMode, upiVerify));
    const reqRing = (on: boolean) =>
      on ? 'border-rose-500 ring-1 ring-rose-200' : 'border-slate-300';
    return (
      <div className="space-y-3">
        {docRejection.bank_proof && (
          <AdminRejectionBanner title="Bank proof rejected — please upload a clearer proof and save">
            {docRejection.bank_proof}
          </AdminRejectionBanner>
        )}
        <div className="rounded-xl bg-amber-50/80 border border-amber-100 p-3">
          <div className="flex items-start gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" /><path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" /></svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-amber-900">Payout details</p>
                {docRejection.bank_proof ? <SectionRejectedBadge active={false} /> : null}
              </div>
              <p className="text-xs text-amber-800 mt-0.5">Choose Bank Account or UPI for payouts. Switch the toggle to verify each separately.</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-2">
          <p className="text-xs font-medium text-slate-700">Use for payout <span className="text-rose-500">*</span></p>
          <div className="flex rounded-lg border border-slate-200 bg-white p-1">
            <button type="button" onClick={() => setBank('payout_method', 'bank')} className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${isBank ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:text-slate-800'}`}>Bank Account</button>
            <button type="button" onClick={() => setBank('payout_method', 'upi')} className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${!isBank ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:text-slate-800'}`}>UPI</button>
          </div>
        </div>

        {isBank && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800">Bank account</p>
            {(bankVerify.state === 'verified' || bank.bank_is_verified) && (
              <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">Verified</span>
            )}
          </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Account number <span className="text-rose-500">*</span></label>
                <input type="text" value={bank.account_number} onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 18); setBank('account_number', v); setDocFormatErrors(prev => ({ ...prev, account_number: documentFormatValidators.accountNumber(v) })); }} className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white font-mono ${reqRing(missAcc)}`} placeholder="e.g. 123456789012" />
                {docFormatErrors.account_number && <p className="text-xs text-rose-600 mt-1">{docFormatErrors.account_number}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">IFSC code <span className="text-rose-500">*</span></label>
                <input type="text" value={bank.ifsc_code} onChange={e => { const v = e.target.value.toUpperCase().slice(0, 11); setBank('ifsc_code', v); setDocFormatErrors(prev => ({ ...prev, ifsc_code: documentFormatValidators.ifsc(v) })); }} className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white font-mono uppercase ${reqRing(missIfsc)}`} placeholder="e.g. SBIN0001234" style={{ textTransform: 'uppercase' }} />
                {docFormatErrors.ifsc_code && <p className="text-xs text-rose-600 mt-1">{docFormatErrors.ifsc_code}</p>}
              </div>
            </div>

            {isElectronic(bankMode) && !!String(bank.account_number || '').trim() && !!String(bank.ifsc_code || '').trim() && (
              <div className="space-y-2">
                {bankVerify.state === 'verified' || bank.bank_is_verified ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[11px]">✓</span>
                      Bank account verified automatically
                    </p>
                    {verifiedDetailRows(bankVerify.details || bank.bank_verified_details || undefined).map(([l, v]) => (
                      <p key={l} className="mt-1 text-xs text-emerald-800">
                        <span className="font-medium">{l}:</span> {v}
                      </p>
                    ))}
                    <div className="mt-2 max-w-xs">
                      <label className="block text-xs font-medium text-emerald-900 mb-1">
                        Account type <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={
                          ["SAVINGS", "CURRENT"].includes(String(bank.account_type || "").toUpperCase())
                            ? String(bank.account_type).toUpperCase()
                            : ""
                        }
                        onChange={(e) => setBank("account_type", e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-emerald-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="">Select</option>
                        <option value="SAVINGS">Savings</option>
                        <option value="CURRENT">Current</option>
                      </select>
                      <p className="mt-1 text-[11px] text-emerald-700">
                        Cashfree does not return account type — please confirm Savings or Current.
                      </p>
                    </div>
                    <p className="mt-1.5 text-xs text-emerald-700">No bank proof upload needed for bank payout.</p>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={
                      bankVerify.state === 'verifying' ||
                      !!documentFormatValidators.accountNumber(String(bank.account_number || '')) ||
                      !!documentFormatValidators.ifsc(String(bank.ifsc_code || ''))
                    }
                    onClick={() => verifyDocNow('bank')}
                    className="inline-flex w-fit items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {bankVerify.state === 'verifying' ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Verifying…</>
                    ) : (
                      'Verify Bank Account'
                    )}
                  </button>
                )}
                {bankVerify.state === 'failed' && (
                  <div className={`rounded-lg border p-3 text-xs ${bankMode === 'auto' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                    <span className="font-semibold">
                      {bankMode === 'auto' ? 'Bank verification failed. ' : "Instant verification didn't succeed. "}
                    </span>
                    {bankVerify.error || 'Please check account number / IFSC.'}
                    {bankMode === 'hybrid' ? ' Enter details manually and upload bank proof.' : ' Retry later — automatic verification is required.'}
                  </div>
                )}
              </div>
            )}

            {!(bankVerify.state === 'verified' || bank.bank_is_verified) &&
              (!isElectronic(bankMode) || uploadAllowedFor(bankMode, bankVerify)) && (
              <>
                {isElectronic(bankMode) && uploadAllowedFor(bankMode, bankVerify) && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Auto verification didn&apos;t succeed — enter bank details manually and upload proof.
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Account holder name <span className="text-rose-500">*</span></label>
                    <input type="text" value={bank.account_holder_name} onChange={e => setBank('account_holder_name', e.target.value)} className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white ${reqRing(missName)}`} placeholder="As per bank record" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Bank name <span className="text-rose-500">*</span></label>
                    <input type="text" value={bank.bank_name} onChange={e => setBank('bank_name', e.target.value)} className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white ${reqRing(missBank)}`} placeholder="e.g. State Bank of India" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Branch name</label>
                    <input type="text" value={bank.branch_name || ''} onChange={e => setBank('branch_name', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" placeholder="Optional" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Account type</label>
                    <select value={bank.account_type || ''} onChange={e => setBank('account_type', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"><option value="">Select</option><option value="SAVINGS">Savings</option><option value="CURRENT">Current</option></select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Bank proof <span className="text-rose-500">*</span></label>
                  <p className="text-xs text-slate-500 mb-1.5">Upload one: Passbook, Cancelled cheque, or Bank statement</p>
                  <div className={`flex flex-wrap gap-2 mb-2 rounded-lg p-2 -m-0.5 ${missProofType ? 'ring-2 ring-rose-200 border border-rose-300' : ''}`}>
                    {(['passbook', 'cancelled_cheque', 'bank_statement'] as const).map((proofKind) => (
                      <label key={proofKind} className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="bank_proof_type" checked={(bank.bank_proof_type || '') === proofKind} onChange={() => setBank('bank_proof_type', proofKind)} className="rounded-full border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                        <span className="text-sm text-slate-700 capitalize">{proofKind.replace('_', ' ')}</span>
                      </label>
                    ))}
                  </div>
                  <input type="file" ref={fileInputRefs.bankProof} onChange={(e) => { const f = e.target.files?.[0]; if (f) setBankFile('bank_proof_file', f); }} accept=".jpg,.jpeg,.png,.pdf" className="hidden" />
                  {!hasBankProofFileOrUrl() ? (
                    <button type="button" onClick={() => fileInputRefs.bankProof.current?.click()} className={`w-full rounded-lg border-2 border-dashed py-3 text-center text-sm text-slate-600 hover:border-indigo-400 hover:bg-indigo-50/50 ${missProofFile ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-slate-50/50'}`}>
                      {isUploadingBankFile('bank_proof_file') ? (
                        <span className="inline-flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
                        </span>
                      ) : (
                        'Upload passbook / cancelled cheque / statement'
                      )}
                    </button>
                  ) : (
                    renderUploadedDocumentPanel({
                      viewTitle: 'Bank proof',
                      file: bank.bank_proof_file ?? null,
                      url: bank.bank_proof_file_url,
                      imagePreviewUrl: bankProofPreviewUrl,
                      onChange: () => fileInputRefs.bankProof.current?.click(),
                      onRemove: () => setBankFile('bank_proof_file', null),
                      uploading: isUploadingBankFile('bank_proof_file'),
                    })
                  )}
                </div>
              </>
            )}
        </div>
        )}

        {!isBank && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800">UPI</p>
            {(upiVerify.state === 'verified' || bank.upi_verified) && (
              <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">Verified</span>
            )}
          </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">UPI ID <span className="text-rose-500">*</span></label>
              <input
                type="text"
                value={bank.upi_id || ''}
                onChange={e => setBank('upi_id', e.target.value.trim().toLowerCase())}
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white ${reqRing(missUpi)}`}
                placeholder="e.g. merchant@upi"
              />
            </div>

            {isElectronic(upiMode) && !!String(bank.upi_id || '').trim() && (
              <div className="space-y-2">
                {upiVerify.state === 'verified' || bank.upi_verified ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[11px]">✓</span>
                      UPI ID verified automatically
                    </p>
                    {verifiedDetailRows(upiVerify.details || bank.upi_verified_details || undefined).map(([l, v]) => (
                      <p key={l} className="mt-1 text-xs text-emerald-800">
                        <span className="font-medium">{l}:</span> {v}
                      </p>
                    ))}
                    <p className="mt-1.5 text-xs text-emerald-700">No QR screenshot needed for UPI payout.</p>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={
                      upiVerify.state === 'verifying' ||
                      !/^[a-z0-9.\-_]{2,256}@[a-z0-9]{2,64}$/i.test(String(bank.upi_id || '').trim())
                    }
                    onClick={() => verifyDocNow('upi')}
                    className="inline-flex w-fit items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {upiVerify.state === 'verifying' ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Verifying…</>
                    ) : (
                      'Verify UPI ID'
                    )}
                  </button>
                )}
                {upiVerify.state === 'failed' && (
                  <div className={`rounded-lg border p-3 text-xs ${upiMode === 'auto' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                    <span className="font-semibold">
                      {upiMode === 'auto' ? 'UPI verification failed. ' : "Instant verification didn't succeed. "}
                    </span>
                    {upiVerify.error || 'Please check the UPI ID.'}
                    {upiMode === 'hybrid' ? ' Upload a UPI QR screenshot where the UPI ID is clearly visible.' : ' Retry later — automatic verification is required.'}
                  </div>
                )}
              </div>
            )}

            {!(upiVerify.state === 'verified' || bank.upi_verified) &&
              (!isElectronic(upiMode) || uploadAllowedFor(upiMode, upiVerify)) && (
              <div>
                {isElectronic(upiMode) && uploadAllowedFor(upiMode, upiVerify) && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                    Auto verification didn&apos;t succeed — upload a QR screenshot with UPI ID visible.
                  </p>
                )}
                <label className="block text-xs font-medium text-slate-700 mb-1">UPI QR screenshot <span className="text-rose-500">*</span></label>
                <p className="text-xs text-slate-500 mb-1.5">Upload screenshot where UPI ID is clearly visible on the QR</p>
                <input type="file" ref={fileInputRefs.upiQr} onChange={(e) => { const f = e.target.files?.[0]; if (f) setBankFile('upi_qr_file', f); }} accept=".jpg,.jpeg,.png,.pdf" className="hidden" />
                {!hasUpiQrFileOrUrl() ? (
                  <button type="button" onClick={() => fileInputRefs.upiQr.current?.click()} className={`w-full rounded-lg border-2 border-dashed py-3 text-center text-sm text-slate-600 hover:border-indigo-400 hover:bg-indigo-50/50 ${missQr ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-slate-50/50'}`}>
                    {isUploadingBankFile('upi_qr_file') ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
                      </span>
                    ) : (
                      'Upload QR screenshot (UPI ID visible)'
                    )}
                  </button>
                ) : (
                  renderUploadedDocumentPanel({
                    viewTitle: 'UPI QR screenshot',
                    file: bank.upi_qr_file ?? null,
                    url: bank.upi_qr_screenshot_url,
                    imagePreviewUrl: upiQrPreviewUrl,
                    onChange: () => fileInputRefs.upiQr.current?.click(),
                    onRemove: () => setBankFile('upi_qr_file', null),
                    uploading: isUploadingBankFile('upi_qr_file'),
                  })
                )}
              </div>
            )}
        </div>
        )}
      </div>
    );
  };

  const renderOtherDocumentsSection = () => (
    <div className="space-y-2 sm:space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs sm:text-sm font-semibold text-gray-700">Other licences &amp; extra documents</p>
          <p className="text-[10px] sm:text-xs text-slate-500">Optional — trade licence, shop &amp; establishment, Udyam, or another document</p>
        </div>
        <button
          type="button"
          onClick={() => setShowOptionalExtraDocuments((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] sm:text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300"
          aria-expanded={showOptionalExtraDocuments}
        >
          {showOptionalExtraDocuments ? 'Hide' : 'Show'}
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${showOptionalExtraDocuments ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </div>
      {showOptionalExtraDocuments && (
        <>
          <h4 className="text-xs sm:text-sm font-semibold text-gray-700">Other licences (optional but recommended)</h4>
      {/* Trade licence */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5 items-start">
        <div>
          <label className="block text-[10px] sm:text-xs font-medium text-slate-700 mb-1">Trade Licence Number</label>
          <div className="relative">
            <input
              type="text"
              name="trade_license_number"
              value={documents.trade_license_number || ''}
              onChange={handleDocumentInputChange}
              placeholder="e.g. TL/2026/0001234/W2"
              className={`w-full pr-9 px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm rounded-lg focus:ring-1 bg-white uppercase ${
                documents.trade_license_number && !docFormatErrors.trade_license_number
                  ? 'border border-emerald-500 focus:ring-emerald-200 focus:border-emerald-500'
                  : 'border border-slate-300 focus:ring-indigo-500 focus:border-indigo-500'
              }`}
              maxLength={50}
              autoComplete="off"
              style={{ textTransform: 'uppercase' }}
            />
            {renderValidTick(!!documents.trade_license_number && !docFormatErrors.trade_license_number)}
          </div>
          {docFormatErrors.trade_license_number && <p className="text-xs text-rose-600 mt-1">{docFormatErrors.trade_license_number}</p>}
        </div>
        <div>
          <label className="block text-[10px] sm:text-xs font-medium text-slate-700 mb-1">Trade Licence Document</label>
          <input type="file" ref={fileInputRefs.tradeLicense} onChange={(e) => handleFileChange(e, 'trade_license_document')} accept=".jpg,.jpeg,.png,.pdf" className="hidden" />
          {!hasDocFileOrUrl('trade_license_document') ? (
            <button type="button" onClick={() => triggerFileInputWithReplaceCheck('trade_license_document', fileInputRefs.tradeLicense)} className="w-full rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/50 py-3 text-center text-xs sm:text-sm text-slate-600 hover:border-indigo-400 hover:bg-indigo-50/50">
              {isUploadingField('trade_license_document') ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
                </span>
              ) : (
                'Upload trade licence'
              )}
            </button>
          ) : (
            renderUploadedDocumentPanel({
              viewTitle: 'Trade licence',
              file: documents.trade_license_document,
              url: documents.trade_license_document_url,
              imagePreviewUrl: tradeLicenseDocPreviewUrl,
              onChange: () => triggerFileInputWithReplaceCheck('trade_license_document', fileInputRefs.tradeLicense),
              onRemove: () => removeFile('trade_license_document'),
              uploading: isUploadingField('trade_license_document'),
            })
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
        <div>
          <label className="block text-[10px] sm:text-xs font-medium text-slate-700 mb-1">Trade Licence Expiry Date</label>
          <input type="date" name="trade_license_expiry_date" value={documents.trade_license_expiry_date || ''} onChange={handleDocumentInputChange} className="w-full px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white" />
        </div>
        <div />
      </div>

      {/* Shop & establishment */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5 items-start pt-1">
        <div>
          <label className="block text-[10px] sm:text-xs font-medium text-slate-700 mb-1">Shop &amp; Establishment Number</label>
          <div className="relative">
            <input
              type="text"
              name="shop_establishment_number"
              value={documents.shop_establishment_number || ''}
              onChange={handleDocumentInputChange}
              placeholder="e.g. BREGHJKLL"
              className={`w-full pr-9 px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm rounded-lg focus:ring-1 bg-white uppercase ${
                documents.shop_establishment_number && !docFormatErrors.shop_establishment_number
                  ? 'border border-emerald-500 focus:ring-emerald-200 focus:border-emerald-500'
                  : 'border border-slate-300 focus:ring-indigo-500 focus:border-indigo-500'
              }`}
              maxLength={50}
              autoComplete="off"
              style={{ textTransform: 'uppercase' }}
            />
            {renderValidTick(!!documents.shop_establishment_number && !docFormatErrors.shop_establishment_number)}
          </div>
          {docFormatErrors.shop_establishment_number && <p className="text-xs text-rose-600 mt-1">{docFormatErrors.shop_establishment_number}</p>}
        </div>
        <div>
          <label className="block text-[10px] sm:text-xs font-medium text-slate-700 mb-1">Shop &amp; Establishment Document</label>
          <input type="file" ref={fileInputRefs.shopEstablishment} onChange={(e) => handleFileChange(e, 'shop_establishment_document')} accept=".jpg,.jpeg,.png,.pdf" className="hidden" />
          {!hasDocFileOrUrl('shop_establishment_document') ? (
            <button type="button" onClick={() => triggerFileInputWithReplaceCheck('shop_establishment_document', fileInputRefs.shopEstablishment)} className="w-full rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/50 py-3 text-center text-xs sm:text-sm text-slate-600 hover:border-indigo-400 hover:bg-indigo-50/50">
              {isUploadingField('shop_establishment_document') ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
                </span>
              ) : (
                'Upload shop & establishment'
              )}
            </button>
          ) : (
            renderUploadedDocumentPanel({
              viewTitle: 'Shop & establishment',
              file: documents.shop_establishment_document,
              url: documents.shop_establishment_document_url,
              imagePreviewUrl: shopEstDocPreviewUrl,
              onChange: () => triggerFileInputWithReplaceCheck('shop_establishment_document', fileInputRefs.shopEstablishment),
              onRemove: () => removeFile('shop_establishment_document'),
              uploading: isUploadingField('shop_establishment_document'),
            })
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
        <div>
          <label className="block text-[10px] sm:text-xs font-medium text-slate-700 mb-1">Shop &amp; Establishment Expiry Date (optional)</label>
          <input type="date" name="shop_establishment_expiry_date" value={documents.shop_establishment_expiry_date || ''} onChange={handleDocumentInputChange} className="w-full px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white" />
        </div>
        <div />
      </div>

      {/* Udyam */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5 items-start pt-1">
        <div>
          <label className="block text-[10px] sm:text-xs font-medium text-slate-700 mb-1">Udyam Registration Number</label>
          <div className="relative">
            <input
              type="text"
              name="udyam_number"
              value={documents.udyam_number || ''}
              onChange={handleDocumentInputChange}
              placeholder="e.g. UDYAM-MH-19-0054448"
              className={`w-full pr-9 px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm rounded-lg focus:ring-1 bg-white uppercase ${
                documents.udyam_number && !docFormatErrors.udyam_number
                  ? 'border border-emerald-500 focus:ring-emerald-200 focus:border-emerald-500'
                  : 'border border-slate-300 focus:ring-indigo-500 focus:border-indigo-500'
              }`}
              maxLength={19}
              autoComplete="off"
              style={{ textTransform: 'uppercase' }}
            />
            {renderValidTick(!!documents.udyam_number && !docFormatErrors.udyam_number)}
          </div>
          {docFormatErrors.udyam_number && <p className="text-xs text-rose-600 mt-1">{docFormatErrors.udyam_number}</p>}
        </div>
        <div>
          <label className="block text-[10px] sm:text-xs font-medium text-slate-700 mb-1">Udyam Certificate</label>
          <input type="file" ref={fileInputRefs.udyam} onChange={(e) => handleFileChange(e, 'udyam_document')} accept=".jpg,.jpeg,.png,.pdf" className="hidden" />
          {!hasDocFileOrUrl('udyam_document') ? (
            <button type="button" onClick={() => triggerFileInputWithReplaceCheck('udyam_document', fileInputRefs.udyam)} className="w-full rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/50 py-3 text-center text-xs sm:text-sm text-slate-600 hover:border-indigo-400 hover:bg-indigo-50/50">
              {isUploadingField('udyam_document') ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
                </span>
              ) : (
                'Upload udyam certificate'
              )}
            </button>
          ) : (
            renderUploadedDocumentPanel({
              viewTitle: 'Udyam certificate',
              file: documents.udyam_document,
              url: documents.udyam_document_url,
              imagePreviewUrl: udyamDocPreviewUrl,
              onChange: () => triggerFileInputWithReplaceCheck('udyam_document', fileInputRefs.udyam),
              onRemove: () => removeFile('udyam_document'),
              uploading: isUploadingField('udyam_document'),
            })
          )}
        </div>
      </div>

          <h4 className="text-xs sm:text-sm font-semibold text-gray-700 pt-1">Other Document (Optional)</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
        <div>
          <label className="block text-[10px] sm:text-xs font-medium text-slate-700 mb-1">Document Type</label>
          <input type="text" name="other_document_type" value={documents.other_document_type || ''} onChange={handleDocumentInputChange} placeholder="e.g. Rent Agreement, NOC" className="w-full px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white" maxLength={50} autoComplete="off" />
        </div>
        <div>
          <label className="block text-[10px] sm:text-xs font-medium text-slate-700 mb-1">Document Number</label>
          <div className="relative">
            <input
              type="text"
              name="other_document_number"
              value={documents.other_document_number || ''}
              onChange={handleDocumentInputChange}
              placeholder="Document number"
              className={`w-full pr-9 px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm rounded-lg focus:ring-1 bg-white ${
                documents.other_document_number && !docFormatErrors.other_document_number
                  ? 'border border-emerald-500 focus:ring-emerald-200 focus:border-emerald-500'
                  : 'border border-slate-300 focus:ring-indigo-500 focus:border-indigo-500'
              }`}
              maxLength={30}
              autoComplete="off"
            />
            {renderValidTick(!!documents.other_document_number && !docFormatErrors.other_document_number)}
          </div>
          {docFormatErrors.other_document_number && (
            <p className="text-xs text-rose-600 mt-1">{docFormatErrors.other_document_number}</p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
        <div>
          <label className="block text-[10px] sm:text-xs font-medium text-slate-700 mb-1">Document Name</label>
          <input type="text" name="other_document_name" value={documents.other_document_name || ''} onChange={handleDocumentInputChange} placeholder="Document name" className="w-full px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white" maxLength={50} autoComplete="off" />
        </div>
        <div>
          <label className="block text-[10px] sm:text-xs font-medium text-slate-700 mb-1">Expiry Date (if applicable)</label>
          <input type="date" name="other_document_expiry_date" value={documents.other_document_expiry_date || ''} onChange={handleDocumentInputChange} className="w-full px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white" />
        </div>
      </div>
      <div>
        <label className="block text-[10px] sm:text-xs font-medium text-slate-700 mb-1">Document File</label>
        <input type="file" ref={fileInputRefs.otherDoc} onChange={(e) => handleFileChange(e, 'other_document_file')} accept=".jpg,.jpeg,.png,.pdf" className="hidden" />
        {!hasDocFileOrUrl('other_document_file') ? (
          <button type="button" onClick={() => triggerFileInputWithReplaceCheck('other_document_file', fileInputRefs.otherDoc)} className="w-full rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/50 p-3 sm:p-4 text-center hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:ring-offset-1">
            <svg className="w-6 h-6 sm:w-7 sm:h-7 text-slate-400 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
            <p className="text-xs sm:text-sm font-medium text-slate-600">
              {isUploadingField('other_document_file') ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
                </span>
              ) : (
                'Upload Document File'
              )}
            </p>
            <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5">JPG, PNG or PDF · Max 5MB</p>
          </button>
        ) : (
          renderUploadedDocumentPanel({
            viewTitle: 'Other document',
            file: documents.other_document_file,
            url: documents.other_document_file_url,
            imagePreviewUrl: otherDocFilePreviewUrl,
            onChange: () => triggerFileInputWithReplaceCheck('other_document_file', fileInputRefs.otherDoc),
            onRemove: () => removeFile('other_document_file'),
            uploading: isUploadingField('other_document_file'),
          })
        )}
      </div>
        </>
      )}
    </div>
  );

  const renderDocumentStepContent = () => {
    switch (activeSection) {
      case 'pan':
        return renderPanSection();
      case 'aadhar':
        return renderAadharSection();
      case 'licence':
        return renderLicenceSection();
      case 'gst':
        return renderGstSection();
      case 'bank':
      default:
        return renderBankSection();
    }
  };

  const renderDocumentStep = () => (
    <>
      <DigilockerConsentSheet
        open={aadhaarVerify.state === 'verifying'}
        url={aadhaarVerify.digilockerUrl || null}
        preparing={aadhaarVerify.state === 'verifying' && !aadhaarVerify.digilockerUrl}
        popupRef={digilockerPopupRef}
        onClose={cancelDigilockerFlow}
        onConsentActivity={() => {
          void pollAadhaarStatusOnce();
        }}
      />
      {renderReplaceImageModal()}
      {renderValidationModal()}
      <div className="w-full min-h-full max-w-full bg-slate-50/50 overflow-x-hidden">
        <div className="mx-auto flex w-full max-w-6xl flex-col lg:flex-row gap-3 sm:gap-4 p-3 sm:p-4">
          {/* Left: title + business type + tabs */}
          <aside className="w-full lg:w-52 xl:w-60 shrink-0 flex flex-col gap-2 sm:gap-3 min-w-0 lg:sticky lg:top-4 lg:self-start">
            <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
              <h2 className="text-base sm:text-lg font-semibold text-slate-800">Store Documents</h2>
              <p className="mt-0.5 text-xs text-slate-600">Upload required documents for verification.</p>
              <div className="mt-3 rounded-lg bg-indigo-50/80 border border-indigo-100 p-2.5">
                <p className="text-xs font-semibold text-indigo-900">{businessType.replace('_', ' ')}</p>
                {isFoodBusiness() ? (
                  <p className="mt-0.5 text-[11px] text-indigo-700">FSSAI mandatory for food.</p>
                ) : isPharmaBusiness() ? (
                  <p className="mt-0.5 text-[11px] text-indigo-700">Drug License & Pharmacist mandatory.</p>
                ) : (
                  <button
                    type="button"
                    onClick={() => goToSectionFromSidebarLocked('licence')}
                    disabled={
                      verificationDocFixActive
                        ? !rejectedDocSectionSet.has('licence')
                        : docSectionOrder.indexOf('licence') > maxReachedSectionIdx
                    }
                    className="mt-0.5 text-[11px] text-indigo-700 hover:text-indigo-900 hover:underline text-left disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
                  >
                    Optional docs recommended.
                  </button>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
              <p className="px-2 py-1 text-xs font-medium text-slate-500">Sections</p>
              {(['pan', 'aadhar', 'licence', 'gst', 'bank'] as const).map((section) => {
                const isActive = activeSection === section;
                const sIdx = docSectionOrder.indexOf(section);
                const lockedByProgress = sIdx > maxReachedSectionIdx;
                const lockedByVerificationFix =
                  verificationDocFixActive && !rejectedDocSectionSet.has(section);
                const locked = verificationDocFixActive
                  ? lockedByVerificationFix
                  : lockedByProgress;
                const showRejected =
                  section === 'pan'
                    ? !!docRejection.pan
                    : section === 'aadhar'
                      ? !!docRejection.aadhaar
                      : section === 'licence'
                        ? optionalRejectionItems.length > 0
                        : section === 'gst'
                          ? !!gstRejectionReason
                          : !!docRejection.bank_proof;
                const sectionLabel =
                  section === 'pan'
                    ? 'PAN'
                    : section === 'aadhar'
                      ? 'Aadhaar'
                      : section === 'licence'
                        ? isPharmaBusiness()
                          ? 'Drug Lic.'
                          : isFoodBusiness()
                            ? 'FSSAI'
                            : 'OTHERS'
                        : section === 'gst'
                          ? 'GST'
                          : 'Bank';
                return (
                <button
                  key={section}
                  type="button"
                  onClick={() => {
                    if (locked) return;
                    goToSectionFromSidebarLocked(section);
                  }}
                  disabled={locked}
                  aria-disabled={locked}
                  title={
                    locked
                      ? verificationDocFixActive
                        ? 'Only rejected documents can be edited'
                        : 'Use Save & Continue to open the next section'
                      : undefined
                  }
                  className={`w-full rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-inset ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : locked
                        ? 'cursor-not-allowed text-slate-400'
                        : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span>{sectionLabel}</span>
                    {showRejected ? <SectionRejectedBadge active={isActive} /> : null}
                  </span>
                </button>
                );
              })}
            </div>
          </aside>

          {/* Right: content + inline actions (no fixed footer) */}
          <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-[320px] sm:min-h-[380px]">
              <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4">
                {renderDocumentStepContent()}
              </div>
              <div className="shrink-0 border-t border-slate-200 bg-slate-50/80 px-3 sm:px-4 py-2 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={goToPrevSection}
                  disabled={actionLoading || documentSaving}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                >
                  {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Previous
                </button>
                <button
                  type="button"
                  onClick={handleDocumentSaveAndContinue}
                  disabled={
                    actionLoading ||
                    documentSaving ||
                    !validateDocumentSection() ||
                    (activeSection === 'aadhar' && aadhaarVerify.state === 'verifying')
                  }
                  title={
                    activeSection === 'aadhar' && aadhaarVerify.state === 'verifying'
                      ? 'Finish DigiLocker verification first — skip is locked while it is running'
                      : !validateDocumentSection()
                      ? activeSection === 'aadhar'
                        ? 'Clear invalid Aadhaar number to skip, or enter a valid 12-digit number'
                        : activeSection === 'gst'
                          ? !(documents.gst_number || '').trim()
                            ? 'Clear invalid GSTIN to skip, or enter a valid 15-character GSTIN'
                            : 'Verify GSTIN or upload certificate to continue'
                          : 'Complete this section to continue'
                      : undefined
                  }
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                >
                  {actionLoading || documentSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                  {actionLoading || documentSaving
                    ? 'Saving...'
                    : activeSection === 'aadhar' && aadhaarVerify.state === 'verifying'
                    ? 'Waiting for DigiLocker…'
                    : activeSection === 'aadhar' &&
                      aadhaarVerify.state !== 'verified' &&
                      !(documents as { aadhaar_is_verified?: boolean }).aadhaar_is_verified
                    ? 'Skip / Save & Continue'
                    : activeSection === 'gst' &&
                      gstVerify.state !== 'verified' &&
                      !(documents as { gst_is_verified?: boolean }).gst_is_verified &&
                      !(documents.gst_number || '').trim()
                    ? 'Skip / Save & Continue'
                    : 'Save & Continue'}
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );

  const renderStoreSetupStep = () => (
    <div className="w-full min-h-full max-w-full overflow-x-hidden">
      <div className="flex flex-col min-h-full w-full relative bg-[#f8fafc] max-w-full sm:max-w-[98%] md:max-w-[96%] lg:max-w-[94%] xl:max-w-[92%] mx-auto px-3 sm:px-4 md:px-5 lg:px-6">
        <div className="flex-shrink-0 p-2 sm:p-3">
          <div className="mb-2">
            <h2 className="text-base sm:text-lg font-semibold text-gray-800 mb-0.5">Store Configuration</h2>
            <p className="text-gray-600 text-xs mb-1.5">Configure your store settings and preferences</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-28 sm:pb-32 px-2 sm:px-3 md:px-4">
          <div className="space-y-4 sm:space-y-5">
            {/* Top Section: Store Features (left) | Delivery Radius (right) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              <div className="border border-slate-200 rounded-lg p-3 sm:p-4 bg-white shadow-sm">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Store Features <span className="text-red-500">*</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="flex items-center justify-between gap-2 sm:gap-3 p-2 sm:p-2.5 border border-slate-200 rounded-lg bg-white">
                    <div>
                      <div className="text-xs sm:text-sm font-medium text-gray-700">Pure Vegetarian</div>
                      <div className="text-xs text-gray-500">Serves only veg food</div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={storeSetup.is_pure_veg}
                      onClick={() => {
                        const next = !storeSetup.is_pure_veg;
                        setStoreSetup(prev => ({ ...prev, is_pure_veg: next }));
                        onStoreFeaturesSave?.({ is_pure_veg: next, accepts_online_payment: storeSetup.accepts_online_payment, accepts_cash: storeSetup.accepts_cash });
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${storeSetup.is_pure_veg ? 'bg-indigo-600' : 'bg-slate-200'}`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 shrink-0 transform rounded-full bg-white shadow ring-0 transition ${storeSetup.is_pure_veg ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 sm:gap-3 p-2 sm:p-2.5 border border-slate-200 rounded-lg bg-white">
                    <div>
                      <div className="text-xs sm:text-sm font-medium text-gray-700">Online Payment</div>
                      <div className="text-xs text-gray-500">Accept digital payments</div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={storeSetup.accepts_online_payment}
                      onClick={() => {
                        const next = !storeSetup.accepts_online_payment;
                        setStoreSetup(prev => ({ ...prev, accepts_online_payment: next }));
                        onStoreFeaturesSave?.({ is_pure_veg: storeSetup.is_pure_veg, accepts_online_payment: next, accepts_cash: storeSetup.accepts_cash });
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${storeSetup.accepts_online_payment ? 'bg-indigo-600' : 'bg-slate-200'}`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 shrink-0 transform rounded-full bg-white shadow ring-0 transition ${storeSetup.accepts_online_payment ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 sm:gap-3 p-2 sm:p-2.5 border border-slate-200 rounded-lg bg-white">
                    <div>
                      <div className="text-xs sm:text-sm font-medium text-gray-700">Cash on Delivery</div>
                      <div className="text-xs text-gray-500">Accept cash payments</div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={storeSetup.accepts_cash}
                      onClick={() => {
                        const next = !storeSetup.accepts_cash;
                        setStoreSetup(prev => ({ ...prev, accepts_cash: next }));
                        onStoreFeaturesSave?.({ is_pure_veg: storeSetup.is_pure_veg, accepts_online_payment: storeSetup.accepts_online_payment, accepts_cash: next });
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${storeSetup.accepts_cash ? 'bg-indigo-600' : 'bg-slate-200'}`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 shrink-0 transform rounded-full bg-white shadow ring-0 transition ${storeSetup.accepts_cash ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="border border-slate-200 rounded-lg p-3 sm:p-4 bg-white shadow-sm">
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Delivery Radius (km)</label>
                {(() => {
                  const drNum =
                    typeof storeSetup.delivery_radius_km === 'number' &&
                    !Number.isNaN(storeSetup.delivery_radius_km)
                      ? storeSetup.delivery_radius_km
                      : null;
                  const deliveryRadiusOutOfRange =
                    drNum !== null &&
                    (drNum < MIN_STORE_DELIVERY_RADIUS_KM || drNum > MAX_STORE_DELIVERY_RADIUS_KM);
                  return (
                    <>
                      <input
                        name="delivery_radius_km"
                        type="number"
                        value={
                          storeSetup.delivery_radius_km === ''
                            ? ''
                            : typeof storeSetup.delivery_radius_km === 'number' &&
                                !Number.isNaN(storeSetup.delivery_radius_km)
                              ? storeSetup.delivery_radius_km
                              : 5
                        }
                        onChange={handleStoreSetupChange}
                        className={`w-full px-3 py-2.5 sm:py-3 text-sm border rounded-lg sm:rounded-xl focus:ring-2 focus:ring-indigo-500 bg-white ${
                          deliveryRadiusOutOfRange
                            ? 'border-amber-500 focus:border-amber-500'
                            : 'border-slate-300 focus:border-indigo-500'
                        }`}
                        min={MIN_STORE_DELIVERY_RADIUS_KM}
                        max={MAX_STORE_DELIVERY_RADIUS_KM}
                        step={0.5}
                        placeholder="5"
                        aria-invalid={deliveryRadiusOutOfRange}
                      />
                      {deliveryRadiusOutOfRange ? (
                        <p className="text-xs text-amber-700 mt-1.5" role="alert">
                          Delivery radius must be between {MIN_STORE_DELIVERY_RADIUS_KM} and{' '}
                          {MAX_STORE_DELIVERY_RADIUS_KM} km.
                        </p>
                      ) : (
                        <p className="text-xs text-gray-500 mt-1.5">
                          Max delivery distance ({MIN_STORE_DELIVERY_RADIUS_KM}–{MAX_STORE_DELIVERY_RADIUS_KM} km)
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Main Section: Left Column (Logo, Banner, Gallery, Cuisine) | Right Column (Operating Hours) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
              {/* Left Column */}
              <div className="space-y-4 sm:space-y-5">
                <div className="border border-slate-200 rounded-lg p-3 sm:p-4 bg-white shadow-sm">
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Store Banner
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => handleImageChange(e, 'banner')}
                    className="w-full px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm border border-slate-300 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white file:mr-2 file:py-1 file:px-2 file:text-xs file:rounded file:border-0 file:bg-indigo-50 file:text-indigo-700"
                  />
                  {(() => {
                    const media = getMediaSrcAndKey(storeSetup.banner_preview);
                    if (!media.src) return null;
                    return (
                      <div className="mt-1.5 space-y-2">
                        <R2Image
                          src={media.src}
                          fileKey={media.fileKey ?? undefined}
                          alt="Banner"
                          className="h-14 sm:h-20 w-full object-cover rounded shadow border"
                        />
                        <button
                          type="button"
                          onClick={handleRemoveBanner}
                          className="text-xs px-2 py-1 rounded-md border border-rose-200 text-rose-700 hover:bg-rose-50"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })()}
                  <p className="text-xs text-gray-500 mt-1">JPG, PNG</p>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 sm:p-4 bg-white shadow-sm">
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Gallery Images
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleGalleryImagesChange}
                    className="w-full px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm border border-slate-300 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-indigo-500 bg-white file:mr-2 file:py-1 file:px-2 file:text-xs file:rounded file:border-0 file:bg-indigo-50 file:text-indigo-700"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {storeSetup.gallery_previews &&
                      storeSetup.gallery_previews.map((src, idx) => {
                        const media = getMediaSrcAndKey(src);
                        if (!media.src) return null;
                        return (
                          <div key={idx} className="relative group">
                            <R2Image
                              src={media.src}
                              fileKey={media.fileKey ?? undefined}
                              alt={`Gallery ${idx + 1}`}
                              className="h-12 w-12 sm:h-14 sm:w-14 object-cover rounded border"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveGalleryImage(idx)}
                              className="absolute -top-1 -right-1 rounded-full bg-rose-600 text-white text-[10px] w-4 h-4 flex items-center justify-center shadow hover:bg-rose-700"
                              title="Remove"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Multiple images (JPG, PNG) · Max {MAX_GALLERY_IMAGES}</p>
                </div>

                <div className="rounded-lg sm:rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                    <div>
                      <h3 className="text-xs sm:text-sm font-semibold text-slate-800 flex items-center gap-2">
                        <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        Cuisine Selection <span className="text-red-500">*</span>
                      </h3>
                      <p className="text-xs text-slate-500">Pick cuisines your store serves (max 10).</p>
                    </div>
                    <div className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 w-fit font-medium">
                      Selected: {storeSetup.cuisine_types.length}
                    </div>
                  </div>
                  <input
                    type="text"
                    value={cuisineSearch}
                    onChange={(e) => setCuisineSearch(e.target.value)}
                    placeholder="Search cuisines..."
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-indigo-500 bg-white mb-2"
                  />
                  {storeSetup.cuisine_types.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {storeSetup.cuisine_types.map((cuisine) => (
                        <button
                          key={`selected-${cuisine}`}
                          type="button"
                          onClick={() => toggleCuisine(cuisine)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                        >
                          {cuisine}
                          <span className="text-indigo-500">x</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="max-h-44 sm:max-h-52 overflow-y-auto rounded-lg border border-slate-200 p-2.5 sm:p-3 bg-slate-50/70">
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      {filteredCuisines.map((cuisine: string) => {
                        const selected = storeSetup.cuisine_types.includes(cuisine);
                        return (
                          <button
                            key={cuisine}
                            type="button"
                            onClick={() => toggleCuisine(cuisine)}
                            className={`px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm rounded-full border transition ${
                              selected
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400 hover:text-indigo-700'
                            }`}
                          >
                            {cuisine}
                          </button>
                        );
                      })}
                    </div>
                    {filteredCuisines.length === 0 && (
                      <p className="text-xs text-slate-500 py-1.5">No cuisine found.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column - Operating Hours */}
              <div className="border border-slate-200 rounded-lg p-3 sm:p-4 bg-white shadow-sm">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Store Hours (Two Slots Per Day) <span className="text-red-500">*</span>
                </h3>

                {/* Preset Toggles */}
                <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="flex items-center justify-between gap-2 p-2 border border-slate-200 rounded-lg bg-slate-50">
                    <span className="text-xs font-medium text-gray-700">Same as Mon</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={presetToggles.sameAsMonday}
                      onClick={() => {
                        if (!presetToggles.sameAsMonday) {
                          applyHoursPreset('same_as_monday');
                        } else {
                          setPresetToggles(prev => ({ ...prev, sameAsMonday: false }));
                        }
                      }}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500 ${presetToggles.sameAsMonday ? 'bg-indigo-600' : 'bg-slate-300'}`}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 shrink-0 transform rounded-full bg-white shadow ring-0 transition ${presetToggles.sameAsMonday ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 p-2 border border-slate-200 rounded-lg bg-slate-50">
                    <span className="text-xs font-medium text-gray-700">Weekday + Weekend</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={presetToggles.weekdayWeekend}
                      onClick={() => {
                        if (!presetToggles.weekdayWeekend) {
                          applyHoursPreset('weekday_weekend');
                        } else {
                          setPresetToggles(prev => ({ ...prev, weekdayWeekend: false }));
                        }
                      }}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500 ${presetToggles.weekdayWeekend ? 'bg-indigo-600' : 'bg-slate-300'}`}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 shrink-0 transform rounded-full bg-white shadow ring-0 transition ${presetToggles.weekdayWeekend ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 p-2 border border-slate-200 rounded-lg bg-slate-50">
                    <span className="text-xs font-medium text-gray-700">Lunch + Dinner</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={presetToggles.lunchDinner}
                      onClick={() => {
                        if (!presetToggles.lunchDinner) {
                          applyHoursPreset('lunch_dinner');
                        } else {
                          setPresetToggles(prev => ({ ...prev, lunchDinner: false }));
                        }
                      }}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500 ${presetToggles.lunchDinner ? 'bg-indigo-600' : 'bg-slate-300'}`}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 shrink-0 transform rounded-full bg-white shadow ring-0 transition ${presetToggles.lunchDinner ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 p-2 border border-slate-200 rounded-lg bg-slate-50">
                    <span className="text-xs font-medium text-gray-700">24x7</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={presetToggles.is24Hours}
                      onClick={() => {
                        if (!presetToggles.is24Hours) {
                          applyHoursPreset('full_day');
                        } else {
                          setPresetToggles(prev => ({ ...prev, is24Hours: false }));
                        }
                      }}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500 ${presetToggles.is24Hours ? 'bg-indigo-600' : 'bg-slate-300'}`}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 shrink-0 transform rounded-full bg-white shadow ring-0 transition ${presetToggles.is24Hours ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>

                {/* Mark Open Days */}
                <div className="mb-4">
                  <h4 className="text-xs font-semibold text-gray-800 mb-1.5">Mark open days</h4>
                  <p className="text-xs text-gray-500 mb-2">Don't forget to uncheck your off-day.</p>
                  <div className="flex flex-wrap gap-2">
                    {(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const).map((day) => {
                      const isOpen = !storeSetup.store_hours[day].closed;
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDayOpen(day)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition ${
                            isOpen
                              ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                              : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'
                          }`}
                        >
                          {isOpen && (
                            <svg className="w-4 h-4 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                          <span className="text-xs font-medium capitalize">{day}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Time Slots for Open Days */}
                <div className="space-y-2">
                  {(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const).map((day) => {
                    const hours = storeSetup.store_hours[day];
                    const isOpen = !hours.closed;
                    const hasSlot1 = !!(hours.slot1_open && hours.slot1_close);
                    const hasSlot2 = !!(hours.slot2_open && hours.slot2_close);
                    
                    if (!isOpen) return null;

                    return (
                      <div key={day} className="border border-slate-200 rounded-lg p-2 bg-slate-50/50">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-semibold text-gray-700 capitalize">{day}</span>
                          {hasSlot1 && !hasSlot2 && (
                            <button
                              type="button"
                              onClick={() => addSlot(day)}
                              className="text-xs px-2 py-0.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition"
                            >
                              + Add Slot
                            </button>
                          )}
                        </div>
                        
                        {/* Slot 1 */}
                        {hasSlot1 ? (
                          <div className="mb-1.5">
                            <div className="text-xs text-slate-500 mb-0.5">Slot 1</div>
                            <div className="grid grid-cols-2 gap-1">
                              <input
                                type="time"
                                value={hours.slot1_open || ''}
                                onChange={(e) => handleStoreHoursChange(day, 'slot1_open', e.target.value)}
                                className="w-full px-1.5 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 bg-white"
                              />
                              <input
                                type="time"
                                value={hours.slot1_close || ''}
                                onChange={(e) => handleStoreHoursChange(day, 'slot1_close', e.target.value)}
                                className="w-full px-1.5 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 bg-white"
                              />
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              const newHours = {
                                ...storeSetup.store_hours,
                                [day]: {
                                  ...hours,
                                  slot1_open: '09:00',
                                  slot1_close: '22:00',
                                }
                              };
                              setStoreSetup(prev => ({ ...prev, store_hours: newHours }));
                              if (onStoreHoursSave) onStoreHoursSave(newHours);
                            }}
                            className="w-full text-xs px-2 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition mb-1.5"
                          >
                            + Add Slot 1
                          </button>
                        )}
                        
                        {/* Slot 2 */}
                        {hasSlot2 && (
                          <div>
                            <div className="flex items-center justify-between mb-0.5">
                              <div className="text-xs text-slate-500">Slot 2</div>
                              <button
                                type="button"
                                onClick={() => removeSlot2(day)}
                                className="text-xs text-red-600 hover:text-red-700"
                              >
                                Remove
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-1">
                              <input
                                type="time"
                                value={hours.slot2_open || ''}
                                onChange={(e) => handleStoreHoursChange(day, 'slot2_open', e.target.value)}
                                className="w-full px-1.5 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 bg-white"
                              />
                              <input
                                type="time"
                                value={hours.slot2_close || ''}
                                onChange={(e) => handleStoreHoursChange(day, 'slot2_close', e.target.value)}
                                className="w-full px-1.5 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 bg-white"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar - starts after sidebar so Help button does not overlap */}
        <div
          className="fixed bottom-0 left-14 sm:left-[13rem] md:left-56 lg:left-60 right-0 z-50 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.08)]"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}
        >
          <div className="flex items-center justify-end gap-2 px-3 sm:px-4 py-2 min-h-[48px]">
            <button
              type="button"
              onClick={goToPrevSection}
              disabled={actionLoading}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Previous
            </button>
            <button
              type="button"
              onClick={handleStoreSetupSaveAndContinue}
              disabled={actionLoading}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> : (
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
              Save & Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full h-full">
      {renderValidationModal()}
      {docPreviewPayload && (
        <DocPreviewOverlay
          payload={docPreviewPayload}
          onClose={() => setDocPreviewPayload(null)}
        />
      )}
      {currentStep === 'documents' && renderDocumentStep()}
      {currentStep === 'store-setup' && renderStoreSetupStep()}
    </div>
  );
};

export default CombinedDocumentStoreSetup;