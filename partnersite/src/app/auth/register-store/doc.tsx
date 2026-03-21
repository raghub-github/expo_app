"use client";

import { useState, useRef, useEffect, useMemo } from 'react';
import { Loader2, ChevronDown } from 'lucide-react';
import { R2Image } from "@/components/R2Image";

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
  };
  [key: string]: any;
}

const IMAGE_EXT_REGEX = /\.(png|jpe?g|webp|gif|bmp)$/i;

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

interface CombinedComponentProps {
  initialDocuments?: Partial<DocumentData> | null;
  initialStoreSetup?: Partial<StoreSetupData> | null;
  onDocumentComplete?: (documents: DocumentData, savedPatch?: Record<string, unknown>) => void | Promise<void>;
  /** Called on every "Save & Continue" to persist current doc data. Returns the built patch so completion can reuse it (avoids duplicate bank/doc uploads). */
  onDocumentSave?: (documents: DocumentData) => void | Promise<Record<string, unknown> | undefined>;
  onStoreSetupComplete?: (storeSetup: StoreSetupData) => void;
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
  initialStoreSetup,
  onDocumentComplete,
  onDocumentSave,
  onStoreSetupComplete,
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
  const [activeSection, setActiveSection] = useState<'pan' | 'aadhar' | 'optional' | 'bank' | 'other'>('pan');
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');
  const [validationType, setValidationType] = useState<'warning' | 'error' | 'info'>('warning');
  const [docFormatErrors, setDocFormatErrors] = useState<Record<string, string>>({});
  const [replaceImageConfirm, setReplaceImageConfirm] = useState<{ onConfirm: () => void } | null>(null);
  const [showGstSection, setShowGstSection] = useState(() => {
    if (typeof window !== 'undefined' && initialDocuments) {
      return !!(initialDocuments.gst_number || initialDocuments.gst_image || initialDocuments.gst_image_url);
    }
    return false;
  });
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
    aadhar: (v: string) => /^\d{12}$/.test((v || '').replace(/\s/g, '')) ? '' : 'Invalid Aadhaar. Must be exactly 12 digits',
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
          return next;
        });
      }
    }
  }, [initialDocuments, currentStep]);
  
  // Reset hydration ref when switching to documents step to force re-hydration
  useEffect(() => {
    if (currentStep === 'documents') {
      lastHydratedDocumentsRef.current = '';
    }
  }, [currentStep]);

  useEffect(() => {
    if (initialStoreSetup && typeof initialStoreSetup === 'object') {
      const logoUrl = typeof initialStoreSetup.logo_preview === 'string' ? initialStoreSetup.logo_preview : (typeof (initialStoreSetup as any).logo_url === 'string' ? (initialStoreSetup as any).logo_url : '');
      const bannerUrl = typeof initialStoreSetup.banner_preview === 'string' ? initialStoreSetup.banner_preview : (typeof (initialStoreSetup as any).banner_url === 'string' ? (initialStoreSetup as any).banner_url : '');
      const rawGalleryUrls = Array.isArray((initialStoreSetup as any).gallery_image_urls)
        ? ((initialStoreSetup as any).gallery_image_urls as unknown[])
        : null;
      const fromPreviews = Array.isArray(initialStoreSetup.gallery_previews)
        ? initialStoreSetup.gallery_previews
        : [];
      const galleryList = (
        rawGalleryUrls && rawGalleryUrls.length > 0
          ? rawGalleryUrls
          : fromPreviews
      ).filter((u): u is string => typeof u === 'string' && u.trim());
      const cuisineTypes = Array.isArray(initialStoreSetup.cuisine_types) ? initialStoreSetup.cuisine_types : undefined;
      const foodCategories = Array.isArray(initialStoreSetup.food_categories) ? initialStoreSetup.food_categories : undefined;
      setStoreSetup((prev) => ({
        ...prev,
        cuisine_types: cuisineTypes ?? prev.cuisine_types,
        food_categories: foodCategories ?? prev.food_categories,
        avg_preparation_time_minutes: typeof initialStoreSetup.avg_preparation_time_minutes === 'number' ? initialStoreSetup.avg_preparation_time_minutes : prev.avg_preparation_time_minutes,
        min_order_amount: typeof initialStoreSetup.min_order_amount === 'number' ? initialStoreSetup.min_order_amount : prev.min_order_amount,
        delivery_radius_km: typeof initialStoreSetup.delivery_radius_km === 'number' && !isNaN(initialStoreSetup.delivery_radius_km) ? initialStoreSetup.delivery_radius_km : prev.delivery_radius_km,
        is_pure_veg: typeof initialStoreSetup.is_pure_veg === 'boolean' ? initialStoreSetup.is_pure_veg : prev.is_pure_veg,
        accepts_online_payment: typeof initialStoreSetup.accepts_online_payment === 'boolean' ? initialStoreSetup.accepts_online_payment : prev.accepts_online_payment,
        accepts_cash: typeof initialStoreSetup.accepts_cash === 'boolean' ? initialStoreSetup.accepts_cash : prev.accepts_cash,
        logo_preview: logoUrl || prev.logo_preview,
        banner_preview: bannerUrl || prev.banner_preview,
        ...(galleryList.length > 0
          ? {
              gallery_previews: galleryList,
              gallery_image_urls: galleryList,
              gallery_images: galleryList.map(() => null),
            }
          : {}),
        store_hours: initialStoreSetup.store_hours && typeof initialStoreSetup.store_hours === 'object'
          ? (() => {
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
              return normalized;
            })()
          : prev.store_hours,
      }));
    }
  }, [initialStoreSetup]);

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
      if (!t(bank?.account_holder_name)) missing.push('Account holder name');
      if (!t(bank?.account_number)) missing.push('Account number');
      if (!t(bank?.ifsc_code)) missing.push('IFSC code');
      if (!t(bank?.bank_name)) missing.push('Bank name');
      if (!bank?.bank_proof_type) missing.push('Bank proof type (Passbook / Cancelled cheque / Statement)');
      if (!hasBankProofFileOrUrl()) missing.push('Bank proof document');
      return missing;
    }
    const missing: string[] = [];
    if (!t(bank?.upi_id)) missing.push('UPI ID');
    if (!hasUpiQrFileOrUrl()) missing.push('UPI QR screenshot');
    return missing;
  };

  const handleDocumentInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setDocuments(prev => {
      if (name === 'pan_number') return { ...prev, [name]: value.toUpperCase().slice(0, 10) };
      if (name === 'gst_number') return { ...prev, [name]: value.toUpperCase().slice(0, 15) };
      if (name === 'trade_license_number' || name === 'shop_establishment_number') return { ...prev, [name]: value.toUpperCase().slice(0, 50) };
      if (name === 'udyam_number') return { ...prev, [name]: value.toUpperCase().replace(/\s/g, '').slice(0, 19) };
      return { ...prev, [name]: value };
    });
    if (name === 'pan_number') setDocFormatErrors(prev => ({ ...prev, pan_number: documentFormatValidators.pan(value.toUpperCase()) }));
    if (name === 'aadhar_number') setDocFormatErrors(prev => ({ ...prev, aadhar_number: documentFormatValidators.aadhar(value.replace(/\s/g, '')) }));
    if (name === 'fssai_number') setDocFormatErrors(prev => ({ ...prev, fssai_number: documentFormatValidators.fssai(value) }));
    if (name === 'gst_number') {
      setDocFormatErrors(prev => ({ ...prev, gst_number: documentFormatValidators.gst(value) }));
      // AM-like dynamic: if merchant starts entering GST, open GST section automatically.
      if (String(value || '').trim().length > 0) setShowGstSection(true);
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
      // AM-like dynamic: if merchant uploads GST certificate, switch toggle to YES automatically.
      if (fieldName === 'gst_image') {
        setShowGstSection(true);
      }
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
      // PAN: holder name + number + image required
      const panOk = documents.pan_holder_name?.trim() && documents.pan_number && hasDocFileOrUrl('pan_image');
      const panFormatOk = !documents.pan_number || !documentFormatValidators.pan(documents.pan_number);
      return !!(panOk && panFormatOk);
    } else if (activeSection === 'aadhar') {
      // Aadhaar: entirely optional; if filled, validate format; images optional
      const hasAadhar = documents.aadhar_holder_name?.trim() || documents.aadhar_number;
      if (!hasAadhar) return true; // Skip - section is optional
      const aadharOk = documents.aadhar_holder_name?.trim() && documents.aadhar_number;
      const aadharFormatOk = !documents.aadhar_number || !documentFormatValidators.aadhar(documents.aadhar_number.replace(/\s/g, ''));
      return !!(aadharOk && aadharFormatOk);
    } else if (activeSection === 'optional') {
      if (isPharmaBusiness()) {
        return !!(documents.drug_license_number && hasDocFileOrUrl('drug_license_image') && documents.drug_license_expiry_date) &&
               !!(documents.pharmacist_registration_number && hasDocFileOrUrl('pharmacist_certificate') && hasDocFileOrUrl('pharmacy_council_registration') && documents.pharmacist_expiry_date);
      }
      if (isFoodBusiness()) {
        const fssaiOk = documents.fssai_number && hasDocFileOrUrl('fssai_image') && documents.fssai_expiry_date;
        const fssaiFormatOk = !documents.fssai_number || !documentFormatValidators.fssai(documents.fssai_number);
        return !!(fssaiOk && fssaiFormatOk);
      }
      if (documents.gst_number && documentFormatValidators.gst(documents.gst_number)) return false;
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
      };
      const method = bank.payout_method || 'bank';
      const t = (s?: string) => String(s || '').trim();
      if (method === 'bank') {
        const hasBank = !!(
          t(bank.account_holder_name) &&
          t(bank.account_number) &&
          t(bank.ifsc_code) &&
          t(bank.bank_name) &&
          bank.bank_proof_type &&
          hasBankProofFileOrUrl()
        );
        const ifscOk = !t(bank.ifsc_code) || !documentFormatValidators.ifsc(bank.ifsc_code || '');
        const accOk = !t(bank.account_number) || !documentFormatValidators.accountNumber(bank.account_number || '');
        return !!(hasBank && ifscOk && accOk);
      }
      return !!(t(bank.upi_id) && hasUpiQrFileOrUrl());
    } else if (activeSection === 'other') {
      return true;
    }
    return true;
  };

  const showDocumentValidationError = (section: 'pan' | 'aadhar' | 'optional' | 'bank' | 'other') => {
    if (section === 'pan') {
      setValidationMessage('Please fill all required fields in the PAN section before proceeding.');
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
    } else if (section === 'optional') {
      if (isPharmaBusiness()) {
        setValidationMessage('Please fill all required pharma documents before proceeding.');
      } else if (isFoodBusiness()) {
        setValidationMessage('FSSAI certificate is required for food businesses.');
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

    setDocumentSaving(true);
    if (activeSection === 'bank') setBankRequiredHighlight(false);
    try {
      const savedPatch = onDocumentSave ? await onDocumentSave(documents) : undefined;
      const patchArg: Record<string, unknown> | undefined =
        typeof savedPatch === 'object' && savedPatch !== null && !Array.isArray(savedPatch)
          ? savedPatch
          : undefined;

      if (activeSection === 'pan') {
        setActiveSection('aadhar');
      } else if (activeSection === 'aadhar') {
        setActiveSection('optional');
      } else if (activeSection === 'optional') {
        setActiveSection('bank');
      } else if (activeSection === 'bank') {
        if (showOtherDocs) setActiveSection('other');
        else {
          if (onDocumentComplete) onDocumentComplete(documents, patchArg);
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
    
    const newForm = {
      ...storeSetup,
      [name]: processedValue,
    };
    setStoreSetup(newForm);
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
      const sectionOrder: Array<'pan' | 'aadhar' | 'optional' | 'bank' | 'other'> = showOtherDocs ? ['pan', 'aadhar', 'optional', 'bank', 'other'] : ['pan', 'aadhar', 'optional', 'bank'];
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
      <div className="rounded-lg bg-indigo-50/80 border border-indigo-100 p-3">
        <div className="flex items-start gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-indigo-900">PAN Card (Mandatory)</p>
            <p className="text-xs text-indigo-700 mt-0.5">Required for verification. Format: ABCDE1234F</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-slate-700 mb-1">
            PAN Card Image <span className="text-rose-500">*</span>
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
              className="w-full rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/50 p-4 text-center hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
            >
              <svg className="w-10 h-10 text-slate-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            <p className="text-sm font-medium text-slate-600">
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
      <div className="rounded-lg bg-indigo-50/80 border border-indigo-100 p-3">
        <div className="flex items-start gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-indigo-900">Aadhaar Card <span className="text-slate-500 text-xs font-normal">(Optional)</span></p>
            <p className="text-xs text-indigo-700 mt-0.5">Identity verification. Images are optional—number and name sufficient.</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
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
              placeholder="1234 5678 9012"
              className={`w-full px-4 py-3 pr-12 text-sm border rounded-xl bg-white focus:outline-none focus:ring-2 ${
                isAadhaarValid
                  ? "border-emerald-500 focus:border-emerald-600 focus:ring-emerald-200"
                  : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
              }`}
              maxLength={12}
              pattern="[0-9]{12}"
              title="12-digit Aadhar number"
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
    </div>
  );

  const renderOptionalSection = () => (
    <div className="space-y-3">
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
                    const isDrugLicValid = !!String(documents.drug_license_number || "").trim();
                    return (
                      <>
                        <input
                          type="text"
                          name="drug_license_number"
                          value={documents.drug_license_number || ""}
                          onChange={handleDocumentInputChange}
                          placeholder="Enter Drug License Number"
                          className={`w-full px-3 py-2 pr-10 text-sm border rounded-xl bg-white focus:outline-none focus:ring-2 ${
                            isDrugLicValid
                              ? "border-emerald-500 focus:border-emerald-600 focus:ring-emerald-200"
                              : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
                          }`}
                          required
                        />
                        {renderValidTick(isDrugLicValid)}
                      </>
                    );
                  })()}
                </div>
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
      {isFoodBusiness() && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700 mb-1">
            FSSAI Certificate <span className="text-red-500">*</span>
          </h4>
          <div className="space-y-3">
            <div className="max-w-xl">
              <input
                type="text"
                name="fssai_number"
                value={documents.fssai_number || ''}
                onChange={handleDocumentInputChange}
                placeholder="FSSAI License Number"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                required
              />
              {docFormatErrors.fssai_number && <p className="text-xs text-rose-600 mt-1">{docFormatErrors.fssai_number}</p>}
              <p className="text-xs text-gray-500 mt-2">
                Required for food businesses as per FSSAI regulations (14 digits)
              </p>
            </div>
            <div>
              <input
                type="file"
                ref={fileInputRefs.fssai}
                onChange={(e) => handleFileChange(e, 'fssai_image')}
                accept=".jpg,.jpeg,.png,.pdf"
                className="hidden"
              />
              {!hasDocFileOrUrl('fssai_image') ? (
                <button
                  type="button"
                  onClick={() => triggerFileInputWithReplaceCheck('fssai_image', fileInputRefs.fssai)}
                  className="w-full rounded-xl border-2 border-dashed border-rose-300 bg-rose-50/40 px-3 py-3 text-sm font-medium text-rose-600 hover:border-rose-500 hover:bg-rose-50"
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
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700 mb-1">
              FSSAI Expiry Date <span className="text-red-500">*</span>
            </h4>
            <div className="w-full md:w-1/2">
              <input
                type="date"
                name="fssai_expiry_date"
                value={documents.fssai_expiry_date || ''}
                onChange={handleDocumentInputChange}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                FSSAI license expiry date (mandatory)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* GST Certificate (Optional) - Highlighted with distinct color */}
      <div className="rounded-xl bg-gradient-to-br from-purple-50 via-indigo-50 to-blue-50 border-2 border-purple-200/60 p-4 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-purple-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h4 className="text-sm font-semibold text-purple-900">GST Certificate (Optional)</h4>
          </div>
          <div className="inline-flex rounded-lg border border-purple-300 bg-white p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => {
                setShowGstSection(false);
                setDocuments((prev) => ({ ...prev, gst_number: '', gst_image: null }));
                removeFile('gst_image');
              }}
              className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                !showGstSection ? 'bg-purple-600 text-white shadow-sm' : 'text-purple-700 hover:text-purple-900 hover:bg-purple-50'
              }`}
            >
              No
            </button>
            <button
              type="button"
              onClick={() => setShowGstSection(true)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                showGstSection ? 'bg-purple-600 text-white shadow-sm' : 'text-purple-700 hover:text-purple-900 hover:bg-purple-50'
              }`}
            >
              Yes
            </button>
          </div>
        </div>
        {showGstSection && (
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
                          ? "border-emerald-500 focus:border-emerald-600 focus:ring-emerald-200"
                          : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
                      }`}
                    />
                    {renderValidTick(isGstValid)}
                  </>
                );
              })()}
            </div>
            {docFormatErrors.gst_number && <p className="text-xs text-rose-600 mt-1">{docFormatErrors.gst_number}</p>}
            <p className="text-xs text-gray-500 mt-2">Optional for non-GST businesses</p>
          </div>
          <div className="space-y-2">
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
        </div>
        )}
      </div>

      {/* Other documents (optional) — shown on this page like AM */}
      <div className="pt-1">
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
                ? 'FSSAI is mandatory for food businesses. GST may be required based on turnover.'
                : 'Optional documents help with faster verification and service access.'}
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
    const missQr = bankRequiredHighlight && !hasUpiQrFileOrUrl();
    const reqRing = (on: boolean) =>
      on ? 'border-rose-500 ring-1 ring-rose-200' : 'border-slate-300';
    return (
      <div className="space-y-3">
        <div className="rounded-xl bg-amber-50/80 border border-amber-100 p-3">
          <div className="flex items-start gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" /><path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" /></svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-900">Payout details</p>
              <p className="text-xs text-amber-800 mt-0.5">Choose Bank account or UPI. Upload proof as required.</p>
            </div>
          </div>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-slate-50/50 p-1">
          <button type="button" onClick={() => setBank('payout_method', 'bank')} className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${isBank ? 'bg-white text-indigo-600 shadow' : 'text-slate-600 hover:text-slate-800'}`}>Bank Account</button>
          <button type="button" onClick={() => setBank('payout_method', 'upi')} className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${!isBank ? 'bg-white text-indigo-600 shadow' : 'text-slate-600 hover:text-slate-800'}`}>UPI</button>
        </div>
        {isBank ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Account holder name <span className="text-rose-500">*</span></label>
                <input type="text" value={bank.account_holder_name} onChange={e => setBank('account_holder_name', e.target.value)} className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white ${reqRing(missName)}`} placeholder="As per bank record" />
              </div>
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
                <select value={bank.account_type || ''} onChange={e => setBank('account_type', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"><option value="">Select</option><option value="savings">Savings</option><option value="current">Current</option></select>
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
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">UPI ID <span className="text-rose-500">*</span></label>
              <input type="text" value={bank.upi_id || ''} onChange={e => setBank('upi_id', e.target.value)} className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white ${reqRing(missUpi)}`} placeholder="e.g. merchant@upi" />
            </div>
            <div>
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
      case 'optional':
        return renderOptionalSection();
      case 'bank':
      default:
        return renderBankSection();
    }
  };

  const renderDocumentStep = () => (
    <>
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
                    onClick={() => setActiveSection('optional')}
                    className="mt-0.5 text-[11px] text-indigo-700 hover:text-indigo-900 hover:underline text-left"
                  >
                    Optional docs recommended.
                  </button>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
              <p className="px-2 py-1 text-xs font-medium text-slate-500">Sections</p>
              {(['pan', 'aadhar', 'optional', 'bank'] as const).map((section) => (
                <button
                  key={section}
                  type="button"
                  onClick={() => setActiveSection(section)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-inset ${
                    activeSection === section ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {section === 'pan'
                    ? 'PAN'
                    : section === 'aadhar'
                    ? 'Aadhaar'
                    : section === 'optional'
                    ? isPharmaBusiness()
                      ? 'Drug Lic. / GST'
                      : isFoodBusiness()
                      ? 'GST / FSSAI'
                      : 'GST / OTHERS'
                    : 'Bank'}
                </button>
              ))}
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
                  disabled={actionLoading || documentSaving}
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
                    : activeSection === 'aadhar' &&
                      !documents.aadhar_holder_name?.trim() &&
                      !documents.aadhar_number?.trim()
                    ? 'Skip Aadhaar & Continue'
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