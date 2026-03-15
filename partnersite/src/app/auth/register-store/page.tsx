"use client";
// Utility to safely display numeric values in input fields
const safeNumberInput = (val: number | null | undefined) => (typeof val === 'number' && !isNaN(val) ? val : '');

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import dynamic from 'next/dynamic';
import axios from 'axios';
import { Loader2, Menu, X, HelpCircle } from 'lucide-react';
import MerchantHelpTicket from '@/components/MerchantHelpTicket';
import { createClient } from '@/lib/supabase/client';
import { useSearchParams } from 'next/navigation';
import { handleAuthError, isAuthError, refreshAuthIfNeeded } from '@/lib/auth/client-auth-handler';
import CombinedDocumentStoreSetup from './doc';
import Step3MenuUpload from './Step3MenuUpload';
import PreviewPage from './preview';
import OnboardingPlansPage from './plans';
import AgreementContractPage from './agreement';
import SignatureStepPage from './signature';
import { MERCHANT_PARTNERSHIP_TERMS } from './terms-and-conditions';
import { getOnboardingR2Path } from '@/lib/r2-paths';

const StoreLocationMapboxGL = dynamic(() => import('@/components/StoreLocationMapboxGL'), { ssr: false });
const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
/** Set to "true" to hide "Use current location" (avoids unreliable browser/IP geolocation). */
const disableCurrentLocationButton = process.env.NEXT_PUBLIC_DISABLE_CURRENT_LOCATION === 'true';

interface ParentStore {
  id: number;
  name: string;
}

interface FormData {
  store_name: string;
  owner_full_name: string;
  store_display_name: string;
  store_type: string;
  custom_store_type: string; // Added for OTHERS option
  legal_business_name: string;
  store_email: string;
  store_phones: string[];
  store_description: string;
  
  full_address: string;
  address_line1: string;
  building_name: string;
  floor_number: string;
  unit_number: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  landmark: string;
}

interface DocumentData {
  pan_number: string;
  pan_holder_name: string;
  pan_image: File | null;
  aadhar_number: string;
  aadhar_holder_name: string;
  aadhar_front: File | null;
  aadhar_back: File | null;
  fssai_number: string;
  fssai_image: File | null;
  gst_number: string;
  gst_image: File | null;
  drug_license_number: string;
  drug_license_image: File | null;
  pharmacist_registration_number: string;
  pharmacist_certificate: File | null;
  pharmacy_council_registration: File | null;
  expiry_date: string;
  [key: string]: any;
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
  delivery_radius_km: number;
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

type MenuUploadMode = 'IMAGE' | 'PDF' | 'CSV';

const supabase = createClient();

const StoreRegistrationForm = () => {
  // Step state: always start at 1; DB is source of truth after progress is hydrated (no localStorage init).
  const [step, setStepState] = useState(1);
  const stepRestoredRef = useRef(false); // Track if step has been restored from DB
  const setStep = useCallback((newStep: number | ((prev: number) => number)) => {
    setStepState((prev) => {
      const next = typeof newStep === 'function' ? newStep(prev) : newStep;
      const clamped = Math.min(Math.max(next, 1), 9);
      // Only save to localStorage if step was manually changed (not during hydration)
      // This prevents localStorage from overriding DB step on refresh
      if (typeof window !== 'undefined' && stepRestoredRef.current) {
        localStorage.setItem('registerStoreCurrentStep', String(clamped));
      }
      return clamped;
    });
  }, []);
  const [isClient, setIsClient] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const [generatedStoreId, setGeneratedStoreId] = useState<string>('');
  const [parentInfo, setParentInfo] = useState<{ id: number | null; name: string | null; parent_merchant_id: string | null } | null>(null);
  const [currentStoreId, setCurrentStoreId] = useState<string>(''); // Store ID from database after step 1
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isFetchingCurrentLocation, setIsFetchingCurrentLocation] = useState(false);
  const [locationAccuracyMeters, setLocationAccuracyMeters] = useState<number | null>(null);
  const [locationNotice, setLocationNotice] = useState<string>('');
  const [locationInputMode, setLocationInputMode] = useState<'gps' | 'search'>('gps');
  const [storePhonesInput, setStorePhonesInput] = useState('');
  const [progressHydrated, setProgressHydrated] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false); // Separate loading for file uploads only
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const mapRef = useRef<any>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const geolocateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchParams = useSearchParams();
  const selectedStorePublicId = searchParams?.get('store_id');
  const forceNewOnboarding = searchParams?.get('new') === '1';

  const [formData, setFormData] = useState<FormData>({
    store_name: '',
    owner_full_name: '',
    store_display_name: '',
    store_type: 'RESTAURANT',
    custom_store_type: '', // Added for OTHERS option
    legal_business_name: '',
    store_email: '',
    store_phones: [''],
    store_description: '',
    
    full_address: '',
    address_line1: '',
    building_name: '',
    floor_number: '',
    unit_number: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'IN',
    latitude: null,
    longitude: null,
    landmark: '',
  });

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
    expiry_date: '',
  });

  const [storeSetup, setStoreSetup] = useState<StoreSetupData>({
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
  });
  const [menuUploadMode, setMenuUploadMode] = useState<MenuUploadMode>('IMAGE');
  const [menuImageFiles, setMenuImageFiles] = useState<File[]>([]);
  const [menuSpreadsheetFile, setMenuSpreadsheetFile] = useState<File | null>(null);
  const [menuUploadedImageUrls, setMenuUploadedImageUrls] = useState<string[]>([]);
  const [menuUploadedSpreadsheetUrl, setMenuUploadedSpreadsheetUrl] = useState<string | null>(null);
  const [menuUploadedSpreadsheetFileName, setMenuUploadedSpreadsheetFileName] = useState<string | null>(null);
  const [menuUploadedImageNames, setMenuUploadedImageNames] = useState<string[]>([]);
  const [menuPdfFile, setMenuPdfFile] = useState<File | null>(null);
  const [menuUploadedPdfUrl, setMenuUploadedPdfUrl] = useState<string | null>(null);
  const [menuUploadedPdfFileName, setMenuUploadedPdfFileName] = useState<string | null>(null);
  const [menuUploadIds, setMenuUploadIds] = useState<number[]>([]);
  const [menuUploadError, setMenuUploadError] = useState('');
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; variant?: 'warning' | 'error' | 'info'; confirmLabel?: string; onConfirm: () => void; onCancel?: () => void } | null>(null);
  const [isImageDragActive, setIsImageDragActive] = useState(false);
  const [isCsvDragActive, setIsCsvDragActive] = useState(false);
  const [isPdfDragActive, setIsPdfDragActive] = useState(false);
  const imageUploadInputRef = useRef<HTMLInputElement>(null);
  const csvUploadInputRef = useRef<HTMLInputElement>(null);
  const pdfUploadInputRef = useRef<HTMLInputElement>(null);
  const [draftStoreDbId, setDraftStoreDbId] = useState<number | null>(null);
  const [draftStorePublicId, setDraftStorePublicId] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [contractTextForSignature, setContractTextForSignature] = useState<string>('');
  const [agreementTemplate, setAgreementTemplate] = useState<{ id?: number; template_key: string; title: string; version: string; content_markdown: string; pdf_url: string | null } | null>(null);

  const normalizeStoreHours = (incoming: any, fallback: StoreSetupData["store_hours"]) => {
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
    const normalized: any = { ...fallback };
    for (const day of days) {
      const src = incoming?.[day] || {};
      normalized[day] = {
        closed: typeof src.closed === "boolean" ? src.closed : false,
        slot1_open: src.slot1_open ?? src.open ?? fallback[day].slot1_open,
        slot1_close: src.slot1_close ?? src.close ?? fallback[day].slot1_close,
        slot2_open: src.slot2_open ?? "",
        slot2_close: src.slot2_close ?? "",
      };
    }
    return normalized as StoreSetupData["store_hours"];
  };

  // Hydrate form data from progress (database is source of truth; no localStorage).
  const hydrateFormFromProgress = useCallback((progress: any) => {
    if (!progress) return;

    const saved = progress.form_data || {};
    
    // Store information from database
    if (saved.step_store?.storeDbId) setDraftStoreDbId(saved.step_store.storeDbId);
    if (saved.step_store?.storePublicId) {
      setDraftStorePublicId(saved.step_store.storePublicId);
      setCurrentStoreId(saved.step_store.storePublicId);
    }

    // Step 1 data (legal_business_name is kept in sync with store_display_name)
    if (saved.step1) {
      const step1 = saved.step1 as Record<string, unknown>;
      const displayName = (step1.store_display_name as string) ?? '';
      setFormData((prev): FormData => ({
        ...prev,
        ...step1,
        legal_business_name: displayName,
      } as FormData));
      if (saved.step1.store_phones && Array.isArray(saved.step1.store_phones)) {
        setStorePhonesInput(saved.step1.store_phones.join(', '));
      }
    }

    // Step 2 data
    if (saved.step2) {
      setFormData((prev) => ({ ...prev, ...saved.step2 }));
    }

    // Step 3 data — always set from saved so UI matches DB (clear when null/empty after remove or manual DB delete)
    if (saved.step3 != null) {
      const mode = saved.step3.menuUploadMode === 'PDF' ? 'PDF' : saved.step3.menuUploadMode === 'CSV' ? 'CSV' : saved.step3.menuUploadMode === 'IMAGE' ? 'IMAGE' : 'IMAGE';
      setMenuUploadMode(mode);
      setMenuUploadedImageUrls(Array.isArray(saved.step3.menuImageUrls) ? saved.step3.menuImageUrls : []);
      setMenuUploadedImageNames(Array.isArray(saved.step3.menuImageNames) ? saved.step3.menuImageNames : []);
      setMenuUploadedSpreadsheetUrl(saved.step3.menuSpreadsheetUrl ?? null);
      setMenuUploadedSpreadsheetFileName(saved.step3.menuSpreadsheetName ?? null);
      setMenuUploadedPdfUrl(saved.step3.menuPdfUrl ?? null);
      setMenuUploadedPdfFileName(saved.step3.menuPdfFileName ?? null);
      setMenuUploadIds(Array.isArray(saved.step3.menuUploadIds) ? saved.step3.menuUploadIds : []);
    }

    // Step 4 data — always set from saved so UI matches DB (clear URLs when null after remove or manual DB delete)
    if (saved.step4 != null) {
      const s4 = saved.step4 as Record<string, unknown>;
      setDocuments((prev) => ({
        ...prev,
        pan_number: saved.step4.pan_number ?? prev.pan_number,
        pan_holder_name: saved.step4.pan_holder_name ?? prev.pan_holder_name,
        aadhar_number: saved.step4.aadhar_number ?? prev.aadhar_number,
        aadhar_holder_name: saved.step4.aadhar_holder_name ?? prev.aadhar_holder_name,
        fssai_number: saved.step4.fssai_number ?? prev.fssai_number,
        gst_number: saved.step4.gst_number ?? prev.gst_number,
        drug_license_number: saved.step4.drug_license_number ?? prev.drug_license_number,
        pharmacist_registration_number: saved.step4.pharmacist_registration_number ?? prev.pharmacist_registration_number,
        expiry_date: saved.step4.expiry_date ?? prev.expiry_date,
        fssai_expiry_date: saved.step4.fssai_expiry_date ?? prev.fssai_expiry_date,
        drug_license_expiry_date: saved.step4.drug_license_expiry_date ?? prev.drug_license_expiry_date,
        pharmacist_expiry_date: saved.step4.pharmacist_expiry_date ?? prev.pharmacist_expiry_date,
        other_document_type: saved.step4.other_document_type ?? prev.other_document_type,
        other_document_number: saved.step4.other_document_number ?? prev.other_document_number,
        other_document_name: saved.step4.other_document_name ?? prev.other_document_name,
        other_document_expiry_date: saved.step4.other_document_expiry_date ?? prev.other_document_expiry_date,
        pan_image_url: (typeof s4.pan_image_url === 'string' ? s4.pan_image_url : null) ?? null,
        aadhar_front_url: (typeof s4.aadhar_front_url === 'string' ? s4.aadhar_front_url : null) ?? null,
        aadhar_back_url: (typeof s4.aadhar_back_url === 'string' ? s4.aadhar_back_url : null) ?? null,
        fssai_image_url: (typeof s4.fssai_image_url === 'string' ? s4.fssai_image_url : null) ?? null,
        gst_image_url: (typeof s4.gst_image_url === 'string' ? s4.gst_image_url : null) ?? null,
        drug_license_image_url: (typeof s4.drug_license_image_url === 'string' ? s4.drug_license_image_url : null) ?? null,
        pharmacist_certificate_url: (typeof s4.pharmacist_certificate_url === 'string' ? s4.pharmacist_certificate_url : null) ?? null,
        pharmacy_council_registration_url: (typeof s4.pharmacy_council_registration_url === 'string' ? s4.pharmacy_council_registration_url : null) ?? null,
        other_document_file_url: (typeof s4.other_document_file_url === 'string' ? s4.other_document_file_url : null) ?? null,
        bank: saved.step4.bank && typeof saved.step4.bank === 'object'
          ? {
              ...(prev.bank || {}),
              ...saved.step4.bank,
              bank_proof_file_url: (typeof (saved.step4.bank as any).bank_proof_file_url === 'string' ? (saved.step4.bank as any).bank_proof_file_url : null) ?? null,
              upi_qr_screenshot_url: (typeof (saved.step4.bank as any).upi_qr_screenshot_url === 'string' ? (saved.step4.bank as any).upi_qr_screenshot_url : null) ?? null,
            }
          : prev.bank,
      }));
    }

    // Step 5 data
    if (saved.step5) {
      setStoreSetup((prev) => ({
        ...prev,
        cuisine_types: Array.isArray(saved.step5.cuisine_types) ? saved.step5.cuisine_types : prev.cuisine_types,
        food_categories: Array.isArray(saved.step5.food_categories) ? saved.step5.food_categories : prev.food_categories,
        avg_preparation_time_minutes: typeof saved.step5.avg_preparation_time_minutes === 'number'
          ? saved.step5.avg_preparation_time_minutes : prev.avg_preparation_time_minutes,
        min_order_amount: typeof saved.step5.min_order_amount === 'number' ? saved.step5.min_order_amount : prev.min_order_amount,
        delivery_radius_km: typeof saved.step5.delivery_radius_km === 'number' ? saved.step5.delivery_radius_km : prev.delivery_radius_km,
        is_pure_veg: typeof saved.step5.is_pure_veg === 'boolean' ? saved.step5.is_pure_veg : prev.is_pure_veg,
        accepts_online_payment: typeof saved.step5.accepts_online_payment === 'boolean'
          ? saved.step5.accepts_online_payment : prev.accepts_online_payment,
        accepts_cash: typeof saved.step5.accepts_cash === 'boolean' ? saved.step5.accepts_cash : prev.accepts_cash,
        store_hours: normalizeStoreHours(saved.step5.store_hours, prev.store_hours),
        logo_preview: typeof saved.step5.logo_url === 'string' ? saved.step5.logo_url : prev.logo_preview,
        banner_preview: typeof saved.step5.banner_url === 'string' ? saved.step5.banner_url : prev.banner_preview,
        gallery_previews: Array.isArray(saved.step5.gallery_image_urls) ? saved.step5.gallery_image_urls : prev.gallery_previews,
      }));
    }

    // Step 7 data
    if (saved.step7?.selectedPlanId) {
      setSelectedPlanId(saved.step7.selectedPlanId);
    }

    // Step restoration is now handled in hydrateProgress BEFORE calling this function
    // This prevents race conditions and ensures step is restored correctly
  }, [normalizeStoreHours]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const urls = menuImageFiles.map((f) => URL.createObjectURL(f));
    setImagePreviewUrls(urls);
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [menuImageFiles]);

  const parentIdParam = searchParams?.get('parent_id');
  useEffect(() => {
    const fetchParentInfo = async () => {
      const parentId = parentIdParam;
      if (parentId) {
        // Support both parent merchant code and numeric parent id.
        let data: any = null;
        const isNumericParentId = /^\d+$/.test(parentId);
        if (isNumericParentId) {
          const { data: byId } = await supabase
            .from('merchant_parents')
            .select('id, parent_merchant_id, parent_name')
            .eq('id', Number(parentId))
            .maybeSingle();
          data = byId;
        } else {
          const { data: byCode } = await supabase
            .from('merchant_parents')
            .select('id, parent_merchant_id, parent_name')
            .eq('parent_merchant_id', parentId)
            .maybeSingle();
          data = byCode;
        }

        if (data) {
          setParentInfo({
            id: data.id,
            name: data.parent_name,
            parent_merchant_id: data.parent_merchant_id
          });
        } else {
          setParentInfo({ id: isNumericParentId ? Number(parentId) : null, name: null, parent_merchant_id: parentId });
        }
      }
    };
    fetchParentInfo();
  }, [parentIdParam]);

  useEffect(() => {
    const hydrateProgress = async () => {
      try {
        if (forceNewOnboarding && typeof window !== 'undefined') {
          localStorage.removeItem('registerStoreCurrentStepStoreId');
          localStorage.removeItem('registerStoreCurrentStep');
          localStorage.removeItem('registerStoreStep');
          localStorage.removeItem('registerStoreSection');
          localStorage.removeItem('registerStoreCuisineSelection');
        }
        const storeId = forceNewOnboarding ? '' : (selectedStorePublicId || (typeof window !== 'undefined' ? localStorage.getItem('registerStoreCurrentStepStoreId') : null) || '');
        const progressParams = new URLSearchParams();
        if (forceNewOnboarding) progressParams.set('forceNew', '1');
        else if (storeId) progressParams.set('storePublicId', storeId);
        const url = `/api/auth/register-store-progress?${progressParams.toString()}`;
        const res = await fetch(url);
        const payload = await res.json();
        
        if (!res.ok) {
          if (payload.code === 'SESSION_INVALID' || res.status === 401) {
            console.log('User not authenticated, redirecting to login');
            if (typeof window !== 'undefined') {
              window.location.href = '/auth/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
            }
            return;
          }
          console.error('Failed to load progress:', payload.error);
          // Mark as restored even on error to prevent localStorage issues
          stepRestoredRef.current = true;
          setProgressHydrated(true);
          return;
        }

        const progress = res.ok && payload?.success ? payload?.progress : null;

        if (progress) {
          // IMPORTANT: Restore step FIRST before hydrating form data to prevent race conditions
          if (Number.isFinite(Number(progress.current_step))) {
            const restoredStep = Math.min(Math.max(Number(progress.current_step), 1), 9);
            console.log('Restoring step from DB:', restoredStep, 'current_step:', progress.current_step);
            setStep(restoredStep);
            stepRestoredRef.current = true; // Mark restored BEFORE hydration
          }
          
          hydrateFormFromProgress(progress);
          const storePublicId = (progress.form_data as any)?.step_store?.storePublicId;
          if (storePublicId && typeof window !== 'undefined') {
            localStorage.setItem('registerStoreCurrentStepStoreId', storePublicId);
          }
          setProgressHydrated(true);
          return;
        }
        
        // If no progress found, mark as restored anyway to allow localStorage updates
        stepRestoredRef.current = true;

        if (selectedStorePublicId) {
          // Load all store data from database
          const { data: existingStore } = await supabase
            .from('merchant_stores')
            .select(`
              id,
              store_id,
              store_name,
              store_display_name,
              store_description,
              store_type,
              custom_store_type,
              store_email,
              store_phones,
              full_address,
              city,
              state,
              postal_code,
              country,
              latitude,
              longitude,
              landmark,
              current_onboarding_step,
              cuisine_types,
              food_categories,
              avg_preparation_time_minutes,
              min_order_amount,
              delivery_radius_km,
              is_pure_veg,
              accepts_online_payment,
              accepts_cash,
              logo_url,
              banner_url,
              gallery_images
            `)
            .eq('store_id', selectedStorePublicId)
            .maybeSingle();

          if (existingStore) {
            setDraftStoreDbId(existingStore.id);
            setDraftStorePublicId(existingStore.store_id);
            
            // Load Step 1 & 2 data (legal_business_name = store_display_name)
            const displayName = existingStore.store_display_name ?? '';
            setFormData((prev) => ({
              ...prev,
              store_name: existingStore.store_name ?? prev.store_name,
              store_display_name: displayName,
              legal_business_name: displayName,
              store_description: existingStore.store_description ?? prev.store_description,
              store_type: existingStore.store_type ?? prev.store_type,
              custom_store_type: (existingStore as any).custom_store_type ?? prev.custom_store_type,
              store_email: existingStore.store_email ?? prev.store_email,
              store_phones: Array.isArray(existingStore.store_phones) ? existingStore.store_phones : prev.store_phones,
              full_address: existingStore.full_address ?? prev.full_address,
              city: existingStore.city ?? prev.city,
              state: existingStore.state ?? prev.state,
              postal_code: existingStore.postal_code ?? prev.postal_code,
              country: existingStore.country ?? prev.country,
              latitude: typeof existingStore.latitude === 'number' ? existingStore.latitude : prev.latitude,
              longitude: typeof existingStore.longitude === 'number' ? existingStore.longitude : prev.longitude,
              landmark: existingStore.landmark ?? prev.landmark,
            }));
            
            if (Array.isArray(existingStore.store_phones)) {
              setStorePhonesInput(existingStore.store_phones.join(', '));
            }
            if (existingStore.full_address) {
              setSearchQuery(existingStore.full_address);
            }
            
            // Load Step 5 data (store setup)
            setStoreSetup((prev) => ({
              ...prev,
              cuisine_types: Array.isArray(existingStore.cuisine_types) ? existingStore.cuisine_types : prev.cuisine_types,
              food_categories: Array.isArray(existingStore.food_categories) ? existingStore.food_categories : prev.food_categories,
              avg_preparation_time_minutes: typeof existingStore.avg_preparation_time_minutes === 'number'
                ? existingStore.avg_preparation_time_minutes : prev.avg_preparation_time_minutes,
              min_order_amount: typeof existingStore.min_order_amount === 'number' ? existingStore.min_order_amount : prev.min_order_amount,
              delivery_radius_km: typeof existingStore.delivery_radius_km === 'number' ? existingStore.delivery_radius_km : prev.delivery_radius_km,
              is_pure_veg: typeof existingStore.is_pure_veg === 'boolean' ? existingStore.is_pure_veg : prev.is_pure_veg,
              accepts_online_payment: typeof existingStore.accepts_online_payment === 'boolean'
                ? existingStore.accepts_online_payment : prev.accepts_online_payment,
              accepts_cash: typeof existingStore.accepts_cash === 'boolean' ? existingStore.accepts_cash : prev.accepts_cash,
              logo_preview: existingStore.logo_url ?? prev.logo_preview,
              banner_preview: existingStore.banner_url ?? prev.banner_preview,
              gallery_previews: Array.isArray(existingStore.gallery_images) ? existingStore.gallery_images : prev.gallery_previews,
            }));
            
            // Load Step 4 data (documents)
            const { data: storeDocuments } = await supabase
              .from('merchant_store_documents')
              .select('*')
              .eq('store_id', existingStore.id)
              .maybeSingle();
            
            if (storeDocuments) {
              setDocuments((prev) => ({
                ...prev,
                pan_number: storeDocuments.pan_document_number ?? prev.pan_number,
                pan_holder_name: storeDocuments.pan_holder_name ?? prev.pan_holder_name,
                aadhar_number: storeDocuments.aadhaar_document_number ?? prev.aadhar_number,
                aadhar_holder_name: storeDocuments.aadhaar_holder_name ?? prev.aadhar_holder_name,
                fssai_number: storeDocuments.fssai_document_number ?? prev.fssai_number,
                gst_number: storeDocuments.gst_document_number ?? prev.gst_number,
                drug_license_number: storeDocuments.drug_license_document_number ?? prev.drug_license_number,
                pharmacist_registration_number: storeDocuments.pharmacist_certificate_document_number ?? prev.pharmacist_registration_number,
                fssai_expiry_date: storeDocuments.fssai_expiry_date ?? prev.fssai_expiry_date,
                drug_license_expiry_date: storeDocuments.drug_license_expiry_date ?? prev.drug_license_expiry_date,
                pharmacist_expiry_date: storeDocuments.pharmacist_certificate_expiry_date ?? prev.pharmacist_expiry_date,
                other_document_type: storeDocuments.other_document_type ?? prev.other_document_type,
                other_document_number: storeDocuments.other_document_number ?? prev.other_document_number,
                other_document_name: storeDocuments.other_document_name ?? prev.other_document_name,
                other_document_expiry_date: storeDocuments.other_expiry_date ?? prev.other_document_expiry_date,
                pan_image_url: storeDocuments.pan_document_url ?? (prev as any).pan_image_url,
                aadhar_front_url: storeDocuments.aadhaar_document_url ?? (prev as any).aadhar_front_url,
                aadhar_back_url: (storeDocuments.aadhaar_document_metadata as any)?.back_url ?? (prev as any).aadhar_back_url,
                fssai_image_url: storeDocuments.fssai_document_url ?? (prev as any).fssai_image_url,
                gst_image_url: storeDocuments.gst_document_url ?? (prev as any).gst_image_url,
                drug_license_image_url: storeDocuments.drug_license_document_url ?? (prev as any).drug_license_image_url,
                pharmacist_certificate_url: storeDocuments.pharmacist_certificate_document_url ?? (prev as any).pharmacist_certificate_url,
                pharmacy_council_registration_url: storeDocuments.pharmacy_council_registration_document_url ?? (prev as any).pharmacy_council_registration_url,
                other_document_file_url: storeDocuments.other_document_url ?? (prev as any).other_document_file_url,
              }));
              
              // Load bank account data
              const { data: bankAccount } = await supabase
                .from('merchant_store_bank_accounts')
                .select('*')
                .eq('store_id', existingStore.id)
                .eq('is_active', true)
                .maybeSingle();
              
              if (bankAccount) {
                setDocuments((prev) => ({
                  ...prev,
                  bank: {
                    payout_method: bankAccount.payout_method === 'upi' ? 'upi' : 'bank',
                    account_holder_name: bankAccount.account_holder_name ?? '',
                    account_number: bankAccount.account_number ?? '',
                    ifsc_code: bankAccount.ifsc_code ?? '',
                    bank_name: bankAccount.bank_name ?? '',
                    branch_name: bankAccount.branch_name ?? '',
                    account_type: bankAccount.account_type ?? '',
                    upi_id: bankAccount.upi_id ?? '',
                    bank_proof_type: bankAccount.bank_proof_type ?? undefined,
                    bank_proof_file_url: bankAccount.bank_proof_file_url ?? undefined,
                    upi_qr_screenshot_url: bankAccount.upi_qr_screenshot_url ?? undefined,
                  },
                }));
              }
            }
            
            // Load Step 5 operating hours
            const { data: operatingHours } = await supabase
              .from('merchant_store_operating_hours')
              .select('*')
              .eq('store_id', existingStore.id)
              .maybeSingle();
            
            if (operatingHours) {
              const convertTime = (time: string | null) => time || '';
              const convertToSlot = (day: string) => ({
                closed: !operatingHours[`${day}_open` as keyof typeof operatingHours],
                slot1_open: convertTime(operatingHours[`${day}_slot1_start` as keyof typeof operatingHours] as string | null),
                slot1_close: convertTime(operatingHours[`${day}_slot1_end` as keyof typeof operatingHours] as string | null),
                slot2_open: convertTime(operatingHours[`${day}_slot2_start` as keyof typeof operatingHours] as string | null),
                slot2_close: convertTime(operatingHours[`${day}_slot2_end` as keyof typeof operatingHours] as string | null),
              });
              
              setStoreSetup((prev) => ({
                ...prev,
                store_hours: {
                  monday: convertToSlot('monday'),
                  tuesday: convertToSlot('tuesday'),
                  wednesday: convertToSlot('wednesday'),
                  thursday: convertToSlot('thursday'),
                  friday: convertToSlot('friday'),
                  saturday: convertToSlot('saturday'),
                  sunday: convertToSlot('sunday'),
                },
              }));
            }
            
            // Load Step 3 menu data (use signed-URL API so CSV/image links open correctly)
            try {
              const menuRes = await fetch(`/api/auth/store-menu-media-signed?storeDbId=${existingStore.id}`);
              const menuData = menuRes.ok ? await menuRes.json() : null;
              if (menuData?.success) {
                if (Array.isArray(menuData.menuImageUrls) && menuData.menuImageUrls.length > 0) {
                  setMenuUploadedImageUrls(menuData.menuImageUrls);
                  setMenuUploadMode('IMAGE');
                }
                if (menuData.menuSpreadsheetUrl) {
                  setMenuUploadedSpreadsheetUrl(menuData.menuSpreadsheetUrl);
                  setMenuUploadMode('CSV');
                }
              }
            } catch {
              // Fallback: load from Supabase (raw URLs may not open for private R2)
              const { data: menuMedia } = await supabase
                .from('merchant_store_media_files')
                .select('public_url, r2_key, source_entity')
                .eq('store_id', existingStore.id)
                .eq('media_scope', 'MENU_REFERENCE')
                .eq('is_active', true);
              if (menuMedia && menuMedia.length > 0) {
                const menuImages = menuMedia.filter(m => m.source_entity === 'ONBOARDING_MENU_IMAGE').map(m => m.public_url).filter(Boolean);
                const menuSheet = menuMedia.find(m => m.source_entity === 'ONBOARDING_MENU_SHEET')?.public_url;
                if (menuImages.length > 0) {
                  setMenuUploadedImageUrls(menuImages as string[]);
                  setMenuUploadMode('IMAGE');
                }
                if (menuSheet) {
                  setMenuUploadedSpreadsheetUrl(menuSheet);
                  setMenuUploadMode('CSV');
                }
              }
            }
            
            if (typeof existingStore.current_onboarding_step === 'number') {
              setStep(Math.min(Math.max(existingStore.current_onboarding_step, 1), 9));
              stepRestoredRef.current = true;
            }
          }
        }
      } catch (err) {
        console.error('Failed to hydrate onboarding progress:', err);
      } finally {
        // Mark as restored even if hydration failed, to prevent localStorage from overriding
        if (!stepRestoredRef.current) {
          stepRestoredRef.current = true;
        }
        setProgressHydrated(true);
      }
    };

    hydrateProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intended: run on mount and when store/forceNew change only
  }, [forceNewOnboarding, selectedStorePublicId]);

  useEffect(() => {
    if (step < 6) return;
    let cancelled = false;
    const fetchTemplate = async () => {
      try {
        const params = new URLSearchParams();
        if (formData?.store_type) params.set("storeType", formData.store_type);
        if (formData?.city) params.set("city", formData.city);
        const res = await fetch(`/api/auth/merchant-agreement-template?${params.toString()}`);
        const payload = await res.json();
        if (!cancelled && res.ok && payload?.success && payload?.template) {
          setAgreementTemplate(payload.template);
        }
      } catch {
        // keep null, use default terms
      }
    };
    fetchTemplate();
    return () => { cancelled = true; };
  }, [step, formData?.store_type, formData?.city]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchResults([]);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchLocation = useCallback(async () => {
    if (!searchQuery.trim()) return;
    if (!mapboxToken) {
      alert('Map search is not configured. Add NEXT_PUBLIC_MAPBOX_TOKEN to .env.local');
      return;
    }
    setIsSearching(true);
    try {
      const response = await axios.get(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json`,
        {
          params: {
            access_token: mapboxToken,
            country: 'IN',
            limit: 10,
            language: 'en',
            types: 'address,place,postcode,poi,neighborhood,locality',
            proximity: '77.1025,28.7041',
            autocomplete: true
          }
        }
      );
      if (response.data.features.length > 0) {
        const uniqueResults = response.data.features.filter(
          (result: any, index: number, self: any[]) =>
            index === self.findIndex((r: any) => r.place_name === result.place_name)
        );
        setSearchResults(uniqueResults);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Error searching location:', error);
      alert('Error searching location. Please try again.');
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length > 2) {
        searchLocation();
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, searchLocation]);

  const selectLocation = useCallback((result: any) => {
    const [longitude, latitude] = result.center;
    
    const context = result.context || [];
    let city = '';
    let state = '';
    let postal_code = '';
    
    context.forEach((item: any) => {
      const id = item.id;
      if (id.includes('postcode')) {
        postal_code = item.text;
      } else if (id.includes('place') || id.includes('locality') || id.includes('district')) {
        city = item.text;
      } else if (id.includes('region')) {
        state = item.text;
      }
    });

    if (!postal_code) {
      const postalMatch = result.place_name.match(/\b\d{6}\b/);
      if (postalMatch) {
        postal_code = postalMatch[0];
      }
    }

    if (!city) {
      city = result.text;
    }

    setFormData(prev => ({
      ...prev,
      full_address: result.place_name,
      address_line1: result.text,
      city,
      state,
      postal_code,
      country: 'IN',
      latitude,
      longitude,
    }));

    setSearchResults([]);
    setSearchQuery(result.place_name);
    
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [longitude, latitude],
        zoom: 16,
        duration: 1.4,
      });
    }
  }, []);

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    const setAddressFromResult = (placeName: string, addressLine1: string, city: string, state: string, postalCode: string) => {
      setFormData((prev) => ({
        ...prev,
        full_address: placeName || prev.full_address,
        address_line1: addressLine1 || prev.address_line1,
        city: city || prev.city,
        state: state || prev.state,
        postal_code: postalCode || prev.postal_code,
        country: 'IN',
      }));
      setSearchQuery(placeName || '');
    };

    if (mapboxToken) {
      try {
        const response = await axios.get(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json`,
          {
            params: {
              access_token: mapboxToken,
              country: 'IN',
              limit: 1,
              language: 'en',
            },
          }
        );
        const best = response.data?.features?.[0];
        if (best) {
          const context = best.context || [];
          let city = '';
          let state = '';
          let postal_code = '';
          context.forEach((item: any) => {
            const id = item.id;
            if (id.includes('postcode')) postal_code = item.text;
            else if (id.includes('place') || id.includes('locality') || id.includes('district')) city = item.text;
            else if (id.includes('region')) state = item.text;
          });
          setAddressFromResult(best.place_name || '', best.text || '', city, state, postal_code);
          return;
        }
      } catch (err) {
        console.error('Mapbox reverse geocoding failed:', err);
      }
    }

    try {
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/reverse`,
        {
          params: { lat, lon: lng, format: 'json', addressdetails: 1, 'accept-language': 'en' },
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'GatiMitra-StoreRegistration/1.0 (https://gatismitra.com)',
          },
        }
      );
      const a = response.data?.address || {};
      const placeName = response.data?.display_name || '';
      const city = a.city || a.town || a.village || a.county || a.state_district || '';
      const state = a.state || '';
      const postalCode = a.postcode || '';
      setAddressFromResult(placeName, placeName.split(',')[0] || '', city, state, postalCode);
    } catch (err) {
      console.error('Nominatim reverse geocoding failed:', err);
    }
  }, [mapboxToken]);

  const handleMapClick = useCallback(async (event: any) => {
    const { lng, lat } = event.lngLat;
    
    setFormData(prev => ({
      ...prev,
      latitude: lat,
      longitude: lng,
    }));
    
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [lng, lat],
        zoom: 16,
        duration: 1.2,
      });
    }

    reverseGeocode(lat, lng);
  }, [reverseGeocode]);

  const handleUseCurrentLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      alert('Geolocation is not supported by your browser. Please use address search or enter the address manually.');
      return;
    }
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      alert('Location access works only on secure pages (HTTPS or localhost). Please use address search to set location.');
      return;
    }
    if (!mapboxToken) {
      alert('Mapbox token is required for the map. Add NEXT_PUBLIC_MAPBOX_TOKEN to .env.local');
      return;
    }
    if (geolocateTimeoutRef.current) {
      clearTimeout(geolocateTimeoutRef.current);
      geolocateTimeoutRef.current = null;
    }
    setIsFetchingCurrentLocation(true);
    setLocationNotice('');
    setLocationAccuracyMeters(null);

    const clearLoading = () => {
      if (geolocateTimeoutRef.current) {
        clearTimeout(geolocateTimeoutRef.current);
        geolocateTimeoutRef.current = null;
      }
      setIsFetchingCurrentLocation(false);
    };

    geolocateTimeoutRef.current = setTimeout(() => {
      geolocateTimeoutRef.current = null;
      setIsFetchingCurrentLocation((prev) => {
        if (prev) setLocationNotice('Location request timed out. Use address search or enter the address manually.');
        return false;
      });
    }, 20000);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearLoading();
        const { latitude: lat, longitude: lng, accuracy } = position.coords;
        const accuracyM = typeof accuracy === 'number' && accuracy >= 0 ? accuracy : null;

        // Always set the location when we get a position; let the user refine with pin or search if needed.
        setFormData((prev) => ({ ...prev, latitude: lat, longitude: lng }));
        if (accuracyM != null) setLocationAccuracyMeters(accuracyM);

        if (accuracyM != null && accuracyM <= 500) {
          setLocationNotice('Location captured. You can fine-tune by dragging the pin or searching.');
        } else if (accuracyM != null && accuracyM <= 1500) {
          setLocationNotice('Location set. If it’s not right, drag the pin or search for your address.');
        } else {
          setLocationNotice('Location set. If it’s wrong, drag the pin or use address search for the exact address.');
        }

        reverseGeocode(lat, lng);
        const zoom = accuracyM != null && accuracyM < 10000
          ? Math.max(14, 17 - Math.log2(accuracyM / 50))
          : 15;
        mapRef.current?.flyTo?.({ center: [lng, lat], zoom, duration: 1.2 });
      },
      () => {
        clearLoading();
        setLocationNotice('Could not get location. Use address search or enter the address manually.');
      },
      { enableHighAccuracy: true, timeout: 18000, maximumAge: 0 }
    );
  }, [reverseGeocode]);

  const applyManualCoordinates = () => {
    if (formData.latitude == null || formData.longitude == null) {
      alert('Please enter both latitude and longitude.');
      return;
    }
    if (formData.latitude < -90 || formData.latitude > 90) {
      alert('Latitude must be between -90 and 90.');
      return;
    }
    if (formData.longitude < -180 || formData.longitude > 180) {
      alert('Longitude must be between -180 and 180.');
      return;
    }
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [formData.longitude, formData.latitude],
        zoom: 16,
        duration: 1.4,
      });
    }
    reverseGeocode(formData.latitude, formData.longitude);
  };

  /** When user enters GPS and hits Search: reverse geocode and fill full address, city, state, postal code. */
  const handleGpsSearch = async () => {
    if (formData.latitude == null || formData.longitude == null) {
      alert('Please enter both latitude and longitude.');
      return;
    }
    if (formData.latitude < -90 || formData.latitude > 90) {
      alert('Latitude must be between -90 and 90.');
      return;
    }
    if (formData.longitude < -180 || formData.longitude > 180) {
      alert('Longitude must be between -180 and 180.');
      return;
    }
    if (!mapboxToken) {
      alert('Location search is not configured. Add NEXT_PUBLIC_MAPBOX_TOKEN to use GPS search.');
      return;
    }
    setIsSearching(true);
    try {
      await reverseGeocode(formData.latitude, formData.longitude);
      if (mapRef.current) {
        mapRef.current.flyTo({
          center: [formData.longitude, formData.latitude],
          zoom: 16,
          duration: 1.4,
        });
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else if (name === 'store_phones') {
      // Keep raw text so comma typing remains smooth, while persisting parsed array.
      setStorePhonesInput(value);
      setFormData(prev => ({
        ...prev,
        store_phones: value
          .split(',')
          .map(phone => phone.trim())
          .filter(phone => phone.length > 0),
      }));
    } else if (name === 'store_type') {
      setFormData(prev => ({ 
        ...prev, 
        [name]: value,
        custom_store_type: value === 'OTHERS' ? prev.custom_store_type : '' // Clear custom type if not OTHERS
      }));
    } else if (name === 'store_display_name') {
      setFormData(prev => ({
        ...prev,
        store_display_name: value,
        legal_business_name: value,
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleMenuImageUpload = (files: File[]) => {
    const validImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    const validFiles: File[] = [];
    const rejected: string[] = [];

    files.forEach((file) => {
      if (!validImageTypes.includes(file.type)) {
        rejected.push(`${file.name} (invalid image type)`);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        rejected.push(`${file.name} (exceeds 5 MB)`);
        return;
      }
      validFiles.push(file);
    });

    if (rejected.length > 0) {
      setMenuUploadError(`Some files were skipped: ${rejected.join(', ')}`);
    } else {
      setMenuUploadError('');
    }

    const MAX_IMAGES = 5;
    const currentCount = menuImageFiles.length + menuUploadedImageUrls.length;
    if (currentCount + validFiles.length > MAX_IMAGES) {
      setMenuUploadError(`Maximum ${MAX_IMAGES} images allowed. You have ${currentCount} and tried to add ${validFiles.length}.`);
      return;
    }
    if (validFiles.length > 0) {
      // Append new images; never replace when adding more of the same type (replace only on tab switch)
      setMenuImageFiles((prev) => [...prev, ...validFiles]);
      setMenuUploadMode('IMAGE');
    }
  };

  const handleMenuSpreadsheetUpload = (file: File | null) => {
    if (!file) return;
    const lower = file.name.toLowerCase();
    const isSpreadsheet = lower.endsWith('.csv') || lower.endsWith('.xls') || lower.endsWith('.xlsx');
    if (!isSpreadsheet) {
      setMenuUploadError('Only CSV, XLS, and XLSX files are allowed for spreadsheet upload.');
      return;
    }
    const hasExisting = menuSpreadsheetFile || menuUploadedSpreadsheetUrl;
    if (hasExisting) {
      setConfirmModal({
        title: 'Change uploaded file?',
        message: 'You are about to replace the current file. This action cannot be undone.',
        variant: 'warning',
        onConfirm: () => {
          setMenuUploadError('');
          setMenuSpreadsheetFile(file);
          setMenuUploadedSpreadsheetUrl(null);
          setMenuUploadedSpreadsheetFileName(null);
          setMenuUploadMode('CSV');
          setMenuImageFiles([]);
          setMenuUploadedImageUrls([]);
          setMenuUploadedImageNames([]);
          setConfirmModal(null);
        },
        onCancel: () => setConfirmModal(null),
      });
      return;
    }
    setMenuUploadError('');
    setMenuSpreadsheetFile(file);
    setMenuUploadedSpreadsheetUrl(null);
    setMenuUploadMode('CSV');
    setMenuImageFiles([]);
    setMenuUploadedImageUrls([]);
    setMenuUploadedImageNames([]);
  };

  const handleMenuPdfUpload = (file: File | null) => {
    if (!file) return;
    if ((file.type || '').toLowerCase() !== 'application/pdf') {
      setMenuUploadError('Only PDF files are allowed.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMenuUploadError('PDF must be under 5 MB.');
      return;
    }
    setMenuUploadError('');
    setMenuPdfFile(file);
    setMenuUploadedPdfUrl(null);
    setMenuUploadedPdfFileName(null);
    setMenuUploadMode('PDF');
    setMenuImageFiles([]);
    setMenuUploadedImageUrls([]);
    setMenuUploadedImageNames([]);
    setMenuSpreadsheetFile(null);
    setMenuUploadedSpreadsheetUrl(null);
    setMenuUploadedSpreadsheetFileName(null);
  };

  const handleRemovePendingImage = (idx: number) => {
    setConfirmModal({
      title: 'Remove image?',
      message: 'Remove from list (not uploaded yet).',
      variant: 'warning',
      onConfirm: () => {
        setMenuImageFiles((p) => p.filter((_, i) => i !== idx));
        setConfirmModal(null);
      },
      onCancel: () => setConfirmModal(null),
    });
  };

  const handleRemoveUploadedImage = async (idx: number) => {
    const id = menuUploadIds[idx];
    if (draftStoreDbId && id) {
      try {
        await fetch('/api/auth/register-store-menu-uploads?id=' + String(id), { method: 'DELETE', credentials: 'include' });
      } catch (e) {
        console.warn('Delete menu upload failed:', e);
      }
    }
    const newUrls = menuUploadedImageUrls.filter((_, i) => i !== idx);
    const newNames = menuUploadedImageNames.filter((_, i) => i !== idx);
    const newIds = menuUploadIds.filter((_, i) => i !== idx);
    setMenuUploadedImageUrls(newUrls);
    setMenuUploadedImageNames(newNames);
    setMenuUploadIds(newIds);
    setConfirmModal(null);
    await saveStepData(3, false, {
      step3: {
        menuUploadMode,
        menuImageNames: newNames,
        menuImageUrls: newUrls,
        menuUploadIds: newIds,
        menuSpreadsheetName: menuUploadedSpreadsheetFileName ?? null,
        menuSpreadsheetUrl: menuUploadedSpreadsheetUrl ?? null,
        menuPdfUrl: menuUploadedPdfUrl ?? null,
        menuPdfFileName: menuUploadedPdfFileName ?? null,
      },
    }, true);
  };

  const handleRemoveCsvFile = async () => {
    const id = menuUploadIds[0];
    if (draftStoreDbId && id) {
      try {
        await fetch('/api/auth/register-store-menu-uploads?id=' + String(id), { method: 'DELETE', credentials: 'include' });
      } catch (e) {
        console.warn('Delete menu upload failed:', e);
      }
    }
    setMenuSpreadsheetFile(null);
    setMenuUploadedSpreadsheetUrl(null);
    setMenuUploadedSpreadsheetFileName(null);
    setMenuUploadIds([]);
    setConfirmModal(null);
    await saveStepData(3, false, {
      step3: {
        menuUploadMode,
        menuImageNames: menuUploadedImageNames,
        menuImageUrls: menuUploadedImageUrls,
        menuSpreadsheetName: null,
        menuSpreadsheetUrl: null,
        menuUploadIds: [],
        menuPdfUrl: menuUploadedPdfUrl ?? null,
        menuPdfFileName: menuUploadedPdfFileName ?? null,
      },
    }, true);
  };

  const handleRemovePdfFile = async () => {
    const id = menuUploadIds[0];
    if (draftStoreDbId && id) {
      try {
        await fetch('/api/auth/register-store-menu-uploads?id=' + String(id), { method: 'DELETE', credentials: 'include' });
      } catch (e) {
        console.warn('Delete menu upload failed:', e);
      }
    }
    setMenuPdfFile(null);
    setMenuUploadedPdfUrl(null);
    setMenuUploadedPdfFileName(null);
    setMenuUploadIds([]);
    setConfirmModal(null);
    await saveStepData(3, false, {
      step3: {
        menuUploadMode,
        menuPdfUrl: null,
        menuPdfFileName: null,
        menuUploadIds: [],
        menuImageNames: menuUploadedImageNames,
        menuImageUrls: menuUploadedImageUrls,
        menuSpreadsheetName: menuUploadedSpreadsheetFileName ?? null,
        menuSpreadsheetUrl: menuUploadedSpreadsheetUrl ?? null,
      },
    }, true);
  };

  const handleMenuUploadModeClick = (mode: 'IMAGE' | 'PDF' | 'CSV') => {
    if (menuUploadMode === mode) return;
    const hasUploads = menuImageFiles.length > 0 || menuUploadedImageUrls.length > 0 || !!menuSpreadsheetFile || !!menuUploadedSpreadsheetUrl || !!menuPdfFile || !!menuUploadedPdfUrl;
    if (hasUploads) {
      setConfirmModal({
        title: 'Switch upload type?',
        message: 'Switching upload type will delete all previous files from the server. Continue?',
        variant: 'warning',
        confirmLabel: 'Yes, switch',
        onConfirm: async () => {
          if (draftStoreDbId) {
            try {
              const form = new FormData();
              form.append('action', 'switch_type');
              form.append('store_id', String(draftStoreDbId));
              form.append('new_attachment_type', mode === 'IMAGE' ? 'images' : mode === 'PDF' ? 'pdf' : 'csv');
              await fetch('/api/auth/register-store-menu-uploads', { method: 'POST', credentials: 'include', body: form });
            } catch (e) {
              console.warn('Switch-type API failed:', e);
            }
          }
          setMenuUploadMode(mode);
          setMenuImageFiles([]);
          setMenuUploadedImageUrls([]);
          setMenuUploadedImageNames([]);
          setMenuSpreadsheetFile(null);
          setMenuUploadedSpreadsheetUrl(null);
          setMenuUploadedSpreadsheetFileName(null);
          setMenuPdfFile(null);
          setMenuUploadedPdfUrl(null);
          setMenuUploadedPdfFileName(null);
          setMenuUploadIds([]);
          setConfirmModal(null);
        },
        onCancel: () => setConfirmModal(null),
      });
    } else {
      setMenuUploadMode(mode);
    }
  };

  const uploadToR2 = async (file: File, folder: string, filename: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('parent', folder);
    form.append('filename', filename || file.name);
    const res = await fetch('/api/upload/r2', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok || !data?.url) throw new Error(data?.error || 'R2 upload failed');
    // Return the R2 key (path) instead of signed URL so we can generate fresh signed URLs when needed
    return (data.key || data.path || data.url) as string;
  };

  /** Delete existing R2 object when merchant replaces attachment (discard + new file). */
  const deleteR2ObjectIfExists = async (urlOrKey: string | null | undefined): Promise<void> => {
    if (!urlOrKey || typeof urlOrKey !== 'string' || !urlOrKey.trim()) return;
    try {
      await fetch('/api/auth/delete-r2-object', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urlOrKey: urlOrKey.trim() }),
      });
    } catch {
      // Non-blocking; replacement upload will still create new file
    }
  };

  const sanitizeForProgress = (value: any): any => {
    if (typeof File !== 'undefined' && value instanceof File) {
      return {
        name: value.name,
        size: value.size,
        type: value.type,
        lastModified: value.lastModified,
      };
    }
    if (Array.isArray(value)) return value.map(sanitizeForProgress);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, sanitizeForProgress(v)])
      );
    }
    return value;
  };

  const getStepPatch = (stepNumber: number) => {
    if (stepNumber === 1) {
      // Step 1 only: store name, owner, display name, legal name, type, email, phones, description
      // Do NOT include location/address fields (those are step 2)
      const step1Only = {
        store_name: formData.store_name,
        owner_full_name: formData.owner_full_name,
        store_display_name: formData.store_display_name,
        legal_business_name: formData.legal_business_name,
        store_type: formData.store_type,
        custom_store_type: formData.custom_store_type,
        store_email: formData.store_email,
        store_phones: formData.store_phones,
        store_description: formData.store_description,
      };
      return { step1: sanitizeForProgress(step1Only) };
    }
    if (stepNumber === 2) {
      const step2Data = {
        full_address: formData.full_address,
        address_line1: formData.address_line1,
        building_name: formData.building_name,
        floor_number: formData.floor_number,
        unit_number: formData.unit_number,
        city: formData.city,
        state: formData.state,
        postal_code: formData.postal_code,
        country: formData.country,
        latitude: formData.latitude,
        longitude: formData.longitude,
        landmark: formData.landmark,
      };
      return { step2: sanitizeForProgress(step2Data) };
    }
    if (stepNumber === 3) {
      return {
        step3: {
          menuUploadMode,
          menuImageNames: menuImageFiles.length > 0 ? menuImageFiles.map((f) => f.name) : menuUploadedImageNames,
          menuImageUrls: menuUploadedImageUrls,
          menuSpreadsheetName: menuSpreadsheetFile?.name ?? menuUploadedSpreadsheetFileName ?? null,
          menuSpreadsheetUrl: menuUploadedSpreadsheetUrl,
          menuPdfFileName: menuPdfFile?.name ?? menuUploadedPdfFileName ?? null,
          menuPdfUrl: menuUploadedPdfUrl,
          menuUploadIds,
        },
      };
    }
    if (stepNumber === 4) return { step4: sanitizeForProgress(documents) };
    if (stepNumber === 5) return { step5: sanitizeForProgress(storeSetup) };
    if (stepNumber === 6) return { step6: { completed: true, completedAt: new Date().toISOString() } };
    return {};
  };

  // Save progress with proper UPSERT logic. Optional formDataPatchOverride used for step 3 so uploaded URLs are saved before state updates.
  // Non-blocking by default: returns immediately, saves in background. Set blocking=true to wait for completion.
  const saveStepData = useCallback(
    async (currentStep: number, isComplete: boolean = false, formDataPatchOverride?: Record<string, unknown>, blocking: boolean = false): Promise<{ success: boolean; error?: string; progress?: any }> => {
      const saveOperation = async () => {
        try {
          // Check authentication (non-blocking check)
          const authOk = await refreshAuthIfNeeded();
          if (!authOk) {
            console.log('Authentication required, cannot save progress');
            return { success: false, error: 'Authentication required' };
          }

          const stepPatch = formDataPatchOverride ?? getStepPatch(currentStep);

          // Save to progress table (single source of truth; no duplicates)
          const progressRes = await fetch('/api/auth/register-store-progress', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              currentStep: currentStep,
              nextStep: isComplete ? currentStep + 1 : currentStep,
              markStepComplete: isComplete,
              formDataPatch: stepPatch,
              storePublicId: currentStoreId || draftStorePublicId || (typeof searchParams?.get === 'function' ? searchParams.get('store_id') ?? undefined : undefined) || undefined,
              registrationStatus: 'IN_PROGRESS',
            }),
          });

          const progressPayload = await progressRes.json();
          
          if (!progressRes.ok) {
            if (progressPayload.code === 'SESSION_INVALID' || progressRes.status === 401) {
              console.log('User not authenticated, redirecting to login');
              if (typeof window !== 'undefined') {
                window.location.href = '/auth/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
              }
              return { success: false, error: 'Authentication required' };
            }
            throw new Error(progressPayload.error || 'Failed to save progress');
          }

          // Update store ID from database response and persist so refresh loads same progress
          const stepStore = progressPayload?.progress?.form_data?.step_store;
          if (stepStore?.storePublicId && stepStore.storePublicId !== currentStoreId) {
            setCurrentStoreId(stepStore.storePublicId);
            setDraftStorePublicId(stepStore.storePublicId);
            if (typeof window !== 'undefined') {
              localStorage.setItem('registerStoreCurrentStepStoreId', stepStore.storePublicId);
            }
          }
          if (stepStore?.storeDbId && stepStore.storeDbId !== draftStoreDbId) {
            setDraftStoreDbId(stepStore.storeDbId);
          }

          return { success: true, progress: progressPayload?.progress };
        } catch (err) {
          console.error('Failed to save step data:', err);
          if (isAuthError(err)) {
            await handleAuthError(err, 'save-progress');
          }
          return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
        }
      };

      // Queue saves to prevent race conditions
      const queued = saveQueueRef.current.then(() => saveOperation());
      saveQueueRef.current = queued.then(() => {});
      
      if (blocking) {
        return await queued;
      } else {
        // Non-blocking: fire and forget, but queue to prevent race conditions
        saveQueueRef.current.catch(() => {}); // Suppress unhandled rejection warnings
        return { success: true }; // Optimistic return
      }
    },
    [currentStoreId, draftStorePublicId, draftStoreDbId, getStepPatch, refreshAuthIfNeeded, handleAuthError, searchParams]
  );

  // Wrapper for steps 5–9 that saves with explicit nextStep (e.g. when going back or to agreement/signature).
  const saveProgress = useCallback(
    async (opts: { currentStep: number; nextStep: number; markStepComplete: boolean; formDataPatch: Record<string, unknown> }) => {
      const authOk = await refreshAuthIfNeeded();
      if (!authOk) return { success: false, error: 'Authentication required' };
      try {
        const res = await fetch('/api/auth/register-store-progress', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentStep: opts.currentStep,
            nextStep: opts.nextStep,
            markStepComplete: opts.markStepComplete,
            formDataPatch: opts.formDataPatch,
            storePublicId: currentStoreId || draftStorePublicId || undefined,
            registrationStatus: 'IN_PROGRESS',
          }),
        });
        
        // Handle network errors
        if (!res.ok) {
          let errorMessage = 'Failed to save progress';
          try {
            const errorPayload = await res.json();
            if (errorPayload.code === 'SESSION_INVALID' || res.status === 401) {
              if (typeof window !== 'undefined') {
                window.location.href = '/auth/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
              }
              return { success: false, error: 'Authentication required' };
            }
            errorMessage = errorPayload.error || errorPayload.message || `HTTP ${res.status}: ${res.statusText}`;
          } catch (parseError) {
            // If JSON parsing fails, use status text
            errorMessage = `HTTP ${res.status}: ${res.statusText || 'Unknown error'}`;
          }
          // Don't throw for non-critical errors - just log and return
          console.warn('Progress save failed (non-critical):', errorMessage);
          return { success: false, error: errorMessage };
        }
        
        // Parse successful response
        let payload;
        try {
          payload = await res.json();
        } catch (parseError) {
          console.warn('Failed to parse progress response (non-critical):', parseError);
          return { success: false, error: 'Invalid response format' };
        }
        
        const stepStore = payload?.progress?.form_data?.step_store;
        if (stepStore?.storePublicId && stepStore.storePublicId !== currentStoreId) {
          setCurrentStoreId(stepStore.storePublicId);
          setDraftStorePublicId(stepStore.storePublicId);
        }
        if (stepStore?.storeDbId && stepStore.storeDbId !== draftStoreDbId) {
          setDraftStoreDbId(stepStore.storeDbId);
        }
        return { success: true, progress: payload?.progress };
      } catch (err) {
        // Handle network errors, timeouts, etc.
        const errorMessage = err instanceof Error ? err.message : 'Network error';
        console.warn('Progress save error (non-critical):', errorMessage);
        
        // Only handle auth errors, don't throw for others
        if (isAuthError(err)) {
          await handleAuthError(err, 'save-progress');
          return { success: false, error: 'Authentication required' };
        }
        
        // Return error but don't break the flow
        return { success: false, error: errorMessage };
      }
    },
    [currentStoreId, draftStorePublicId, draftStoreDbId]
  );

  const validateStep = (stepNumber: number): boolean => {
    if (stepNumber === 1) {
      // Check if store_type is OTHERS and custom_store_type is provided
      if (formData.store_type === 'OTHERS' && !formData.custom_store_type.trim()) {
        return false;
      }
      return !!(formData.store_name && formData.owner_full_name && formData.store_type && formData.store_email);
    }
    if (stepNumber === 2) {
      return !!(
        formData.full_address &&
        formData.city &&
        formData.state &&
        formData.latitude != null &&
        formData.longitude != null
      );
    }
    if (stepNumber === 3) {
      if (menuUploadMode === 'IMAGE') return menuImageFiles.length > 0 || menuUploadedImageUrls.length > 0;
      if (menuUploadMode === 'PDF') return !!menuPdfFile || !!menuUploadedPdfUrl;
      return !!menuSpreadsheetFile || !!menuUploadedSpreadsheetUrl;
    }
    return true;
  };

  const nextStep = async () => {
    if (validateStep(step)) {
      // Step 3: use menu uploads API (R2 + DB via merchant_store_media_files), then save progress
      if (step === 3) {
        setUploadLoading(true);
        try {
          const storeId = draftStoreDbId;
          const hasNewFiles = menuImageFiles.length > 0 || menuSpreadsheetFile !== null || menuPdfFile !== null;
          let step3Patch: Record<string, unknown> | undefined;

          if (storeId && hasNewFiles) {
            const form = new FormData();
            form.append('store_id', String(storeId));
            const at = menuUploadMode === 'IMAGE' ? 'images' : menuUploadMode === 'PDF' ? 'pdf' : 'csv';
            form.append('attachment_type', at);
            if (menuUploadMode === 'IMAGE' && menuImageFiles.length > 0) {
              menuImageFiles.forEach((f) => form.append('files', f));
            } else if (menuUploadMode === 'CSV' && menuSpreadsheetFile) {
              form.append('file', menuSpreadsheetFile);
            } else if (menuUploadMode === 'PDF' && menuPdfFile) {
              form.append('file', menuPdfFile);
            }
            const res = await fetch('/api/auth/register-store-menu-uploads', { method: 'POST', credentials: 'include', body: form });
            const data = await res.json();
            if (!res.ok) {
              alert(data?.error || 'Upload failed. Please try again.');
              return;
            }
            const files = (data.files || []) as { id: number; file_url: string; file_name: string | null; file_size: number | null }[];
            const ids = files.map((f) => f.id);
            const urls = files.map((f) => f.file_url);
            const names = files.map((f) => f.file_name ?? '');
            if (menuUploadMode === 'IMAGE') {
              setMenuUploadedImageUrls(urls);
              setMenuUploadedImageNames(names);
              setMenuUploadIds(ids);
              setMenuImageFiles([]);
              step3Patch = { step3: { menuUploadMode: 'IMAGE', menuImageUrls: urls, menuImageNames: names, menuUploadIds: ids, menuSpreadsheetUrl: null, menuSpreadsheetName: null, menuPdfUrl: null, menuPdfFileName: null } };
            } else if (menuUploadMode === 'CSV') {
              setMenuUploadedSpreadsheetUrl(urls[0] ?? null);
              setMenuUploadedSpreadsheetFileName(names[0] ?? null);
              setMenuUploadIds(ids);
              setMenuSpreadsheetFile(null);
              step3Patch = { step3: { menuUploadMode: 'CSV', menuSpreadsheetUrl: urls[0] ?? null, menuSpreadsheetName: names[0] ?? null, menuUploadIds: ids, menuImageUrls: [], menuImageNames: [], menuPdfUrl: null, menuPdfFileName: null } };
            } else {
              setMenuUploadedPdfUrl(urls[0] ?? null);
              setMenuUploadedPdfFileName(names[0] ?? null);
              setMenuUploadIds(ids);
              setMenuPdfFile(null);
              step3Patch = { step3: { menuUploadMode: 'PDF', menuPdfUrl: urls[0] ?? null, menuPdfFileName: names[0] ?? null, menuUploadIds: ids, menuImageUrls: [], menuImageNames: [], menuSpreadsheetUrl: null, menuSpreadsheetName: null } };
            }
          } else {
            step3Patch = getStepPatch(3) as Record<string, unknown>;
          }

          const result = await saveStepData(step, true, step3Patch, true);
          if (!result?.success) {
            alert(result?.error || 'Data could not be saved. Please try again.');
            return;
          }
          setStep((prev) => prev + 1);
        } catch (uploadErr: unknown) {
          alert(uploadErr instanceof Error ? uploadErr.message : 'Failed to upload menu file(s). Please try again.');
        } finally {
          setUploadLoading(false);
        }
      } else {
        // For steps 1, 2, 4, 5, 6: Save to DB immediately on "Save & Continue", then navigate only on success
        const currentStep = step;
        setActionLoading(true);
        try {
          const result = await saveStepData(currentStep, true, undefined, true);
          if (!result?.success) {
            alert(result?.error || 'Data could not be saved. Please try again.');
            return;
          }
          setStep(prev => prev + 1);
        } catch (saveErr: any) {
          console.error('Failed to save step data:', saveErr);
          alert(saveErr?.message || 'Failed to save your progress. Please try again.');
        } finally {
          setActionLoading(false);
        }
      }
    } else {
      if (step === 1 && formData.store_type === 'OTHERS' && !formData.custom_store_type.trim()) {
        alert('Please specify your store type in the "Custom Store Type" field.');
      } else if (step === 3 && menuUploadMode === 'IMAGE' && menuImageFiles.length === 0 && menuUploadedImageUrls.length === 0) {
        alert('Please upload at least one menu image (max 5) before continuing.');
      } else if (step === 3 && menuUploadMode === 'PDF' && !menuPdfFile && !menuUploadedPdfUrl) {
        alert('Please upload a PDF file before continuing.');
      } else if (step === 3 && menuUploadMode === 'CSV' && !menuSpreadsheetFile && !menuUploadedSpreadsheetUrl) {
        alert('Please upload a CSV/Excel file before continuing.');
      } else {
        alert('Please fill all required fields before proceeding.');
      }
    }
  };

  const prevStep = async () => {
    const currentStep = step;
    setActionLoading(true);
    try {
      // Persist current step to DB before navigating back (blocking so edits are saved)
      await saveStepData(currentStep, false, undefined, true);
      setStep((prev) => prev - 1);
    } catch (saveErr: any) {
      console.error('Failed to save step data when going back:', saveErr);
      setStep((prev) => prev - 1);
    } finally {
      setActionLoading(false);
    }
  };

  /** Merge saved doc patch (URLs) into documents state so we don't re-upload the same file on next Save & Next. */
  const applyDocPatchToDocuments = useCallback((prev: DocumentData, patch: Record<string, unknown>): DocumentData => {
    const next = { ...prev } as DocumentData;
    const urlPairs: [string, string][] = [
      ['pan_image', 'pan_image_url'],
      ['aadhar_front', 'aadhar_front_url'],
      ['aadhar_back', 'aadhar_back_url'],
      ['fssai_image', 'fssai_image_url'],
      ['gst_image', 'gst_image_url'],
      ['drug_license_image', 'drug_license_image_url'],
      ['pharmacist_certificate', 'pharmacist_certificate_url'],
      ['pharmacy_council_registration', 'pharmacy_council_registration_url'],
      ['other_document_file', 'other_document_file_url'],
    ];
    for (const [fileKey, urlKey] of urlPairs) {
      const url = patch[urlKey];
      if (typeof url === 'string') {
        (next as any)[urlKey] = url;
        (next as any)[fileKey] = null;
      }
    }
    if (patch.bank && typeof patch.bank === 'object') {
      const bankPatch = patch.bank as Record<string, unknown>;
      next.bank = { ...(prev.bank || {}), ...bankPatch } as any;
      if (typeof bankPatch.bank_proof_file_url === 'string') {
        next.bank.bank_proof_file_url = bankPatch.bank_proof_file_url;
        next.bank.bank_proof_file = null;
      }
      if (typeof bankPatch.upi_qr_screenshot_url === 'string') {
        next.bank.upi_qr_screenshot_url = bankPatch.upi_qr_screenshot_url;
        next.bank.upi_qr_file = null;
      }
    }
    return next;
  }, []);

  /** Build step4 patch from current documents: upload files to R2 and include all names/numbers/URLs. */
  const buildDocumentStep4Patch = useCallback(
    async (docs: DocumentData): Promise<Record<string, unknown>> => {
      const parentId = (parentInfo?.parent_merchant_id || searchParams?.get('parent_id') || 'merchant') as string;
      const childStoreId = currentStoreId || draftStorePublicId;
      const documentsPath = getOnboardingR2Path(parentId, childStoreId, 'DOCUMENTS');
      const bankPath = getOnboardingR2Path(parentId, childStoreId, 'BANK');
      const docsPatch: any = { ...sanitizeForProgress(docs) };
      const uploadableDocKeys = [
        'pan_image',
        'aadhar_front',
        'aadhar_back',
        'fssai_image',
        'gst_image',
        'drug_license_image',
        'pharmacist_certificate',
        'pharmacy_council_registration',
        'other_document_file',
      ];
      for (const key of uploadableDocKeys) {
        const value = (docs as any)[key];
        const urlKey = key === 'other_document_file' ? 'other_document_file_url' : `${key}_url`;
        if (typeof File !== 'undefined' && value instanceof File) {
          const existingUrl = (docs as any)[urlKey];
          if (existingUrl && typeof existingUrl === 'string') {
            await deleteR2ObjectIfExists(existingUrl);
          }
          const url = await uploadToR2(value, documentsPath, `${key}_${Date.now()}`);
          docsPatch[urlKey] = url;
        } else {
          docsPatch[urlKey] = (docs as any)[urlKey] ?? null;
        }
      }
      if ((docs as any).bank && typeof (docs as any).bank === 'object') {
        const bank = (docs as any).bank;
        docsPatch.bank = { ...bank };
        if (typeof File !== 'undefined' && bank.bank_proof_file instanceof File) {
          if (bank.bank_proof_file_url && typeof bank.bank_proof_file_url === 'string') {
            await deleteR2ObjectIfExists(bank.bank_proof_file_url);
          }
          const url = await uploadToR2(bank.bank_proof_file, bankPath, `bank_proof_${Date.now()}`);
          docsPatch.bank.bank_proof_file_url = url;
        } else {
          docsPatch.bank.bank_proof_file_url = bank.bank_proof_file_url ?? null;
        }
        if (typeof File !== 'undefined' && bank.upi_qr_file instanceof File) {
          if (bank.upi_qr_screenshot_url && typeof bank.upi_qr_screenshot_url === 'string') {
            await deleteR2ObjectIfExists(bank.upi_qr_screenshot_url);
          }
          const url = await uploadToR2(bank.upi_qr_file, bankPath, `upi_qr_${Date.now()}`);
          docsPatch.bank.upi_qr_screenshot_url = url;
        } else {
          docsPatch.bank.upi_qr_screenshot_url = bank.upi_qr_screenshot_url ?? null;
        }
      }
      return docsPatch;
    },
    [parentInfo?.parent_merchant_id, searchParams, currentStoreId, draftStorePublicId]
  );

  /** Save current document data to DB on every "Save & Continue" (without moving to step 5). Returns the built patch so completion can reuse it and avoid duplicate uploads. */
  const saveDocumentProgress = useCallback(
    async (docs: DocumentData): Promise<Record<string, unknown> | undefined> => {
      setDocuments(docs);
      try {
        const docsPatch = await buildDocumentStep4Patch(docs);
        setDocuments((prev) => applyDocPatchToDocuments(prev, docsPatch));
        saveStepData(4, false, { step4: docsPatch }, false).catch(err => {
          console.error('Background document save failed:', err);
        });
        return docsPatch;
      } catch (err: any) {
        console.error('Failed to build document patch:', err);
        return undefined;
      }
    },
    [buildDocumentStep4Patch, saveStepData, applyDocPatchToDocuments]
  );

  const handleDocumentUploadComplete = async (docs: DocumentData, savedPatch?: Record<string, unknown>) => {
    setDocuments(docs);
    setActionLoading(true);
    setUploadLoading(true);
    try {
      const docsPatch = savedPatch ?? (await buildDocumentStep4Patch(docs));
      setDocuments((prev) => applyDocPatchToDocuments(prev, docsPatch));
      await saveStepData(4, true, { step4: docsPatch }, true);
      setStep(5);
    } catch (err: any) {
      alert(err?.message || 'Failed to upload document files. Please try again.');
    } finally {
      setActionLoading(false);
      setUploadLoading(false);
    }
  };

  /** Save store hours instantly to DB when toggles/slots change. Persists so refresh keeps toggles/slots. */
  const saveStoreHoursProgress = useCallback(
    async (hours: StoreSetupData['store_hours']) => {
      setStoreSetup(prev => ({ ...prev, store_hours: hours }));
      try {
        const currentStep5 = sanitizeForProgress(storeSetup);
        const step5Patch = { step5: { ...currentStep5, store_hours: hours } };
        saveStepData(5, false, step5Patch, false).catch(err => {
          console.error('Store hours save failed:', err);
        });
      } catch (err: any) {
        console.error('Store hours save failed:', err);
      }
    },
    [storeSetup, saveStepData]
  );

  /** Save Store Features (pure veg, online payment, cash) instantly to DB when any toggle changes. */
  const saveStoreFeaturesProgress = useCallback(
    (patch: { is_pure_veg?: boolean; accepts_online_payment?: boolean; accepts_cash?: boolean }) => {
      setStoreSetup(prev => ({ ...prev, ...patch }));
      try {
        const currentStep5 = sanitizeForProgress(storeSetup);
        const step5Patch = { step5: { ...currentStep5, ...patch } };
        saveStepData(5, false, step5Patch, false).catch(err => {
          console.error('Store features save failed:', err);
        });
      } catch (err: any) {
        console.error('Store features save failed:', err);
      }
    },
    [storeSetup, saveStepData]
  );

  const handleStoreSetupComplete = async (setup: StoreSetupData) => {
    setStoreSetup(setup);
    setActionLoading(true);

    const hasFilesToUpload =
      (typeof File !== 'undefined' && setup.logo instanceof File) ||
      (typeof File !== 'undefined' && setup.banner instanceof File) ||
      (Array.isArray(setup.gallery_images) && setup.gallery_images.some(img => typeof File !== 'undefined' && img instanceof File));

    let step5Patch: Record<string, unknown>;
    if (hasFilesToUpload) {
      setUploadLoading(true);
      try {
        const parentId = (parentInfo?.parent_merchant_id || searchParams?.get('parent_id') || 'merchant') as string;
        const childStoreId = currentStoreId || draftStorePublicId;
        const storeMediaPath = getOnboardingR2Path(parentId, childStoreId, 'STORE_MEDIA');
        const storeMediaGalleryPath = getOnboardingR2Path(parentId, childStoreId, 'STORE_MEDIA_GALLERY');
        step5Patch = { ...sanitizeForProgress(setup) } as Record<string, unknown>;
        let uploadedLogoUrl: string | undefined;
        let uploadedBannerUrl: string | undefined;
        let uploadedGalleryUrls: string[] = [];
        const existingLogoUrl = (storeSetup as any).logo_url || (storeSetup as any).logo_preview;
        const existingBannerUrl = (storeSetup as any).banner_url || (storeSetup as any).banner_preview;
        const existingGalleryUrls = Array.isArray((storeSetup as any).gallery_previews) ? (storeSetup as any).gallery_previews : (Array.isArray((storeSetup as any).gallery_image_urls) ? (storeSetup as any).gallery_image_urls : []);
        if (typeof File !== 'undefined' && setup.logo instanceof File) {
          if (existingLogoUrl && typeof existingLogoUrl === 'string') await deleteR2ObjectIfExists(existingLogoUrl);
          uploadedLogoUrl = await uploadToR2(setup.logo, storeMediaPath, `logo_${Date.now()}`);
          (step5Patch as any).logo_url = uploadedLogoUrl;
        }
        if (typeof File !== 'undefined' && setup.banner instanceof File) {
          if (existingBannerUrl && typeof existingBannerUrl === 'string') await deleteR2ObjectIfExists(existingBannerUrl);
          uploadedBannerUrl = await uploadToR2(setup.banner, storeMediaPath, `banner_${Date.now()}`);
          (step5Patch as any).banner_url = uploadedBannerUrl;
        }
        for (let i = 0; i < (setup.gallery_images || []).length; i++) {
          const file = setup.gallery_images[i];
          if (typeof File !== 'undefined' && file instanceof File) {
            const existingUrl = existingGalleryUrls[i] && typeof existingGalleryUrls[i] === 'string' ? existingGalleryUrls[i] : null;
            if (existingUrl) await deleteR2ObjectIfExists(existingUrl);
            const url = await uploadToR2(file, storeMediaGalleryPath, `gallery_${Date.now()}_${i + 1}`);
            uploadedGalleryUrls.push(url);
          }
        }
        if (uploadedGalleryUrls.length > 0) {
          (step5Patch as any).gallery_image_urls = uploadedGalleryUrls;
        }
        // Update storeSetup with uploaded URLs so preview can display them
        setStoreSetup((prev) => ({
          ...prev,
          ...(uploadedLogoUrl && { logo_url: uploadedLogoUrl, logo_preview: prev.logo_preview || uploadedLogoUrl }),
          ...(uploadedBannerUrl && { banner_url: uploadedBannerUrl, banner_preview: prev.banner_preview || uploadedBannerUrl }),
          ...(uploadedGalleryUrls.length > 0 && { gallery_image_urls: uploadedGalleryUrls, gallery_previews: prev.gallery_previews?.length ? prev.gallery_previews : uploadedGalleryUrls }),
        }));
      } catch (err: any) {
        setUploadLoading(false);
        setActionLoading(false);
        alert(err?.message || 'Failed to upload store media. Please try again.');
        return;
      } finally {
        setUploadLoading(false);
      }
    } else {
      step5Patch = sanitizeForProgress(setup) as Record<string, unknown>;
    }

    try {
      const result = await saveStepData(5, true, { step5: step5Patch }, true);
      if (!result.success) {
        setActionLoading(false);
        alert(result.error || 'Failed to save Store Configuration. Please try again.');
        return;
      }
      setStep(6);
      if (typeof window !== 'undefined') window.localStorage.removeItem('registerStoreCuisineSelection');
    } catch (err: any) {
      console.error('Store setup save failed:', err);
      alert(err?.message || 'Failed to save Store Configuration. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegistrationSuccess = async (storeId: string) => {
    setGeneratedStoreId(storeId);
    setShowSuccess(true);
    // Update progress in background without blocking UI
    try {
      await saveProgress({ 
        currentStep: 9, 
        nextStep: 9, 
        markStepComplete: true, 
        formDataPatch: { final: { submitted: true, storeId } } 
      });
    } catch (err) {
      console.error('Background progress update failed (non-critical):', err);
      // Don't show error to user as registration is already successful
    }
  };

  const handleRegisterNewStore = () => {
    setFormData({
      store_name: '',
      owner_full_name: '',
      store_display_name: '',
      store_type: 'RESTAURANT',
      custom_store_type: '',
      legal_business_name: '',
      store_email: '',
      store_phones: [''],
      store_description: '',
      
      full_address: '',
      address_line1: '',
      building_name: '',
      floor_number: '',
      unit_number: '',
      city: '',
      state: '',
      postal_code: '',
      country: 'IN',
      latitude: null,
      longitude: null,
      landmark: '',
    });
    setDocuments({
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
      expiry_date: '',
    });
    setStoreSetup({
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
    });
    setMenuUploadMode('IMAGE');
    setMenuImageFiles([]);
    setMenuSpreadsheetFile(null);
    setMenuUploadedImageUrls([]);
    setMenuUploadedSpreadsheetUrl(null);
    setMenuPdfFile(null);
    setMenuUploadedPdfUrl(null);
    setMenuUploadedPdfFileName(null);
    setMenuUploadIds([]);
    setDraftStoreDbId(null);
    setDraftStorePublicId(null);
    setSelectedPlanId(null);
    setContractTextForSignature('');
    setAgreementTemplate(null);
    setMenuUploadError('');
    setShowSuccess(false);
    setStorePhonesInput('');
    setStep(1);
  };

  const handleViewStore = () => {
    window.location.href = '/auth/post-login';
  };

  const stepLabels = [
    'Store Informations',
    'Location details',
    'Menu setup',
    'Restaurant documents',
    'Operational details',
    'Preview',
    'Commission plan',
    'Agreement',
    'Sign & submit',
  ];

  if (!isClient || !progressHydrated) {
    return <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-white"><div>Loading...</div></div>;
  }

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 overflow-auto hide-scrollbar">
        {/* Top Header - logo only; success message is in main content below */}
        <div className="bg-white border-b border-slate-200 px-3 sm:px-6 py-2.5 sm:py-3 shadow-sm">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <img src="/logo.png" alt="GatiMitra" className="h-8 sm:h-9 w-auto object-contain shrink-0" />
            <span className="text-base sm:text-lg font-semibold text-slate-800 truncate">GatiMitra</span>
          </div>
        </div>
        
        {/* Success Content - responsive padding and scroll */}
        <div className="min-h-[calc(100vh-52px)] p-3 sm:p-4 flex items-center justify-center py-6 sm:py-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="w-full max-w-2xl bg-white rounded-xl sm:rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="p-4 sm:p-6 md:p-8">
              {/* Success Icon */}
              <div className="flex justify-center mb-4 sm:mb-6">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-emerald-100 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 sm:w-10 sm:h-10 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              
              {/* Success Message */}
              <div className="text-center mb-6 sm:mb-8">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-2 sm:mb-3">Store Successfully Registered!</h2>
                <p className="text-sm sm:text-base text-slate-600">
                  Your store has been registered successfully with all documents verified.
                </p>
              </div>
              
              {/* Store ID Card */}
              <div className="bg-gradient-to-r from-indigo-50 to-violet-50 rounded-lg sm:rounded-xl p-4 sm:p-6 mb-6 sm:mb-8 border border-indigo-200">
                <div className="text-center">
                  <div className="text-xs sm:text-sm font-medium text-slate-600 mb-1 sm:mb-2">Your Store ID</div>
                  <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-indigo-700 mb-2 sm:mb-3 font-mono tracking-wider break-all">
                    {generatedStoreId}
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600">
                    This is your unique Store ID. Please save it for future reference.
                  </p>
                </div>
              </div>
              
              {/* Information Box */}
              <div className="bg-slate-50 rounded-lg p-3 sm:p-4 mb-6 sm:mb-8">
                <div className="flex items-start gap-2 sm:gap-3">
                  <svg className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm text-slate-700">
                      Your Store ID (<span className="font-bold">{generatedStoreId}</span>) has been generated and assigned to your store. 
                      You can use this ID for all future references, orders, and communications.
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Action Buttons - responsive */}
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <button
                  onClick={handleViewStore}
                  className="flex-1 px-4 sm:px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
                >
                  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  View Your Store
                </button>
                <button
                  onClick={handleRegisterNewStore}
                  className="flex-1 px-4 sm:px-6 py-3 border-2 border-indigo-200 text-indigo-700 font-medium rounded-lg hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
                >
                  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Register New Store
                </button>
              </div>
              
              {/* Additional Info */}
              <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-slate-200 text-center">
                <p className="text-xs sm:text-sm text-slate-500">
                  Need help? Contact support at <a href="mailto:partnerhelp@gatimitra.in" className="text-indigo-600 hover:underline">partnerhelp@gatimitra.in</a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const step3MenuUploadProps = {
    menuUploadMode,
    onModeClick: handleMenuUploadModeClick,
    menuImageFiles,
    menuUploadedImageUrls,
    menuUploadedImageNames,
    menuUploadIds,
    menuSpreadsheetFile,
    menuUploadedSpreadsheetUrl,
    menuUploadedSpreadsheetFileName,
    menuPdfFile,
    menuUploadedPdfUrl,
    menuUploadedPdfFileName,
    setConfirmModal,
    menuUploadError,
    isImageDragActive,
    setIsImageDragActive,
    isPdfDragActive,
    setIsPdfDragActive,
    isCsvDragActive,
    setIsCsvDragActive,
    onMenuImageUpload: handleMenuImageUpload,
    onMenuPdfUpload: handleMenuPdfUpload,
    onMenuSpreadsheetUpload: handleMenuSpreadsheetUpload,
    imageUploadInputRef,
    pdfUploadInputRef,
    csvUploadInputRef,
    imagePreviewUrls,
    onRemovePendingImage: handleRemovePendingImage,
    onRemoveUploadedImage: handleRemoveUploadedImage,
    onRemoveCsvFile: handleRemoveCsvFile,
    onRemovePdfFile: handleRemovePdfFile,
  };

  return (
    <div className="h-screen max-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col overflow-hidden">
      {/* Fixed Header - never scrolls; fixed so it never shifts on scroll */}
      <header className="fixed top-0 left-0 right-0 flex-none bg-white border-b border-slate-200 px-3 sm:px-6 py-2 sm:py-2.5 shadow-sm z-30">
        <div className="flex items-center justify-between gap-2">
          {/* Left: logo; on mobile PID below logo, on desktop title + parent */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <img src="/logo.png" alt="GatiMitra" className="h-8 sm:h-9 w-auto object-contain shrink-0" />
            <div className="min-w-0 flex-1">
              {/* Desktop up to lg: title + parent in header; on lg+ they move to sidebar */}
              <div className="hidden sm:block lg:hidden">
                <h1 className="text-base font-bold text-slate-800 truncate">Register New Store</h1>
                {parentInfo && (
                  <div className="text-xs text-slate-600 truncate">
                    Parent: <span className="font-semibold text-indigo-700">{parentInfo.name}</span>
                    <span className="text-slate-500 ml-1">(PID: {parentInfo.parent_merchant_id})</span>
                  </div>
                )}
              </div>
              {/* Mobile only: PID and Store ID below logo */}
              {parentInfo && (
                <div className="sm:hidden text-[11px] text-slate-600 truncate mt-0.5 space-y-0.5">
                  <div>PID: {parentInfo.parent_merchant_id}</div>
                  {(currentStoreId || draftStorePublicId) && (
                    <div className="font-mono font-semibold text-indigo-700">Store ID: {currentStoreId || draftStorePublicId}</div>
                  )}
                </div>
              )}
            </div>
          </div>
          {/* Right: mobile = Burger only; desktop = All Stores + Logout (Help is in sidebar) */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={() => { window.location.href = '/auth/post-login'; }}
              className="hidden sm:inline-flex text-xs sm:text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-1.5 sm:px-3 rounded-lg hover:bg-indigo-100"
            >
              ← All Stores
            </button>
            <button
              type="button"
              onClick={() => setShowLogoutConfirm(true)}
              className="hidden sm:inline-flex text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Logout
            </button>
            {/* Mobile/tablet: burger menu - always visible on small screens */}
            <button
              type="button"
              onClick={() => setShowMobileMenu(true)}
              className="md:hidden flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-sm"
              aria-label="Open menu"
            >
              <Menu className="w-6 h-6 shrink-0" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile/tablet burger menu overlay */}
      {showMobileMenu && (
        <div className="fixed inset-0 z-[2100] md:hidden" aria-hidden="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowMobileMenu(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-72 max-w-[85vw] bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <span className="font-semibold text-slate-800">Menu</span>
              <button type="button" onClick={() => setShowMobileMenu(false)} className="p-2 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto hide-scrollbar">
              <button
                type="button"
                onClick={() => { setShowMobileMenu(false); window.location.href = '/auth/post-login'; }}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-indigo-200 bg-indigo-50 text-indigo-700 font-semibold hover:bg-indigo-100 hover:border-indigo-300 shadow-sm transition-colors"
              >
                <span aria-hidden="true">←</span>
                All Stores
              </button>
              {parentInfo && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Parent</p>
                      <p className="text-sm font-semibold text-slate-800 mt-0.5">{parentInfo.name ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Parent ID (PID)</p>
                      <p className="text-sm font-mono font-semibold text-slate-800 mt-0.5">{parentInfo.parent_merchant_id}</p>
                    </div>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => { setShowMobileMenu(false); setShowLogoutConfirm(true); }}
                className="w-full inline-flex items-center justify-center px-4 py-3 rounded-xl border-2 border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-50 hover:border-slate-400 shadow-sm transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Body: reserve space for fixed header (pt-14); sidebar fixed, main scrollable only */}
      <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden pt-14">
        {/* Sidebar - fixed position so it never scrolls; parent info + title at top, then steps + Help */}
        <aside className="fixed left-0 top-14 bottom-0 w-14 min-w-[3.5rem] sm:w-52 md:w-56 lg:w-60 flex-none bg-white border-r border-slate-200 flex flex-col py-2 sm:py-3 overflow-hidden z-20">
          {/* Title + Parent Name & Parent ID (PID) – visible whenever sidebar shows labels (sm+) */}
          <div className="hidden sm:block flex-none border-b border-slate-200 pb-2 mb-1 px-2 sm:px-3 space-y-2">
            <h2 className="text-sm font-bold text-slate-800 truncate">Register New Store</h2>
            {parentInfo && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-2 space-y-1.5">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">Parent Name</p>
                  <p className="text-xs font-semibold text-slate-800 truncate mt-0.5" title={parentInfo.name ?? undefined}>
                    {parentInfo.name ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">Parent ID (PID)</p>
                  <p className="text-xs font-mono font-bold text-indigo-700 truncate mt-0.5" title={parentInfo.parent_merchant_id ?? undefined}>
                    {parentInfo.parent_merchant_id ?? '—'}
                  </p>
                </div>
              </div>
            )}
            {(currentStoreId || draftStorePublicId) && (
              <p className="text-[11px] sm:text-xs text-slate-600 truncate pt-1 border-t border-slate-100">
                <span className="font-medium text-slate-500">Store ID</span>
                <span className="ml-1 font-mono font-semibold text-indigo-700">{currentStoreId || draftStorePublicId}</span>
              </p>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 sm:px-3 space-y-0.5 hide-scrollbar">
            {stepLabels.map((label, idx) => {
              const stepNum = idx + 1;
              const isCurrent = stepNum === step;
              const isDone = stepNum < step;
              // Only allow going to steps up to and including current: can go back to any completed step, or stay on current; cannot skip ahead
              const canGoTo = stepNum <= step;
              return (
                <button
                  key={stepNum}
                  type="button"
                  disabled={!canGoTo}
                  onClick={() => {
                    if (canGoTo && stepNum !== step) {
                      setStep(stepNum);
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('registerStoreCurrentStep', String(stepNum));
                      }
                    }
                  }}
                  className={`w-full flex items-center gap-2 py-1 sm:py-1.5 px-2 rounded-lg text-left transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-inset disabled:opacity-60 disabled:cursor-not-allowed disabled:pointer-events-none ${
                    isCurrent ? 'bg-indigo-50 border border-indigo-200' : canGoTo ? 'hover:bg-slate-50 cursor-pointer' : ''
                  }`}
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-disabled={!canGoTo}
                >
                  <div
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold shrink-0
                      ${isCurrent ? 'bg-indigo-600 text-white ring-2 ring-indigo-300' : isDone ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}
                  >
                    {stepNum}
                  </div>
                  <span className={`hidden sm:block text-xs font-medium truncate ${isCurrent ? 'text-indigo-800' : isDone ? 'text-slate-700' : 'text-slate-500'}`}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
          {/* Bottom: Step X of 9 (desktop) + Help button */}
          <div className="flex-none border-t border-slate-200 pt-3 pb-2 px-2 sm:px-3 space-y-2">
            <div className="hidden sm:block text-xs font-semibold text-slate-600 sm:px-2">
              Step {step} of 9
            </div>
            <button
              type="button"
              onClick={() => setShowHelpModal(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 text-sm font-medium"
              title="Help"
            >
              <HelpCircle className="w-5 h-5 shrink-0" />
              <span className="hidden sm:inline">Help</span>
            </button>
          </div>
        </aside>

        {/* Main content area - only this scrolls; margin-left for fixed sidebar */}
        <main className="flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden ml-14 sm:ml-52 md:ml-56 lg:ml-60">

      {/* Logout confirmation modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[2200] flex items-center justify-center p-4 bg-black/50">
          <div className="relative z-[2201] w-full max-w-sm rounded-xl bg-white shadow-xl border border-slate-200 p-6">
            <p className="text-slate-800 font-medium mb-4">Are you sure you want to logout? You can sign in with another account or register later.</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  window.location.href = "/auth/login";
                }}
                className="flex-1 py-2.5 rounded-lg bg-slate-800 text-white font-medium hover:bg-slate-700"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Centralized confirmation / warning modal (GatiMitra style, centered) */}
      {confirmModal && (
        <div className="fixed inset-0 z-[2210] flex items-center justify-center p-4 bg-black/50" aria-modal="true" role="dialog">
          <div className={`relative z-[2211] w-full max-w-md rounded-xl bg-white shadow-xl border p-6 text-center ${
            confirmModal.variant === 'error' ? 'border-red-200' : confirmModal.variant === 'warning' ? 'border-amber-200' : 'border-slate-200'
          }`}>
            {(confirmModal.variant === 'warning' || confirmModal.variant === 'error') && (
              <div className="flex justify-center mb-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  confirmModal.variant === 'error' ? 'bg-red-100' : 'bg-amber-100'
                }`}>
                  <span className={`text-2xl font-bold ${
                    confirmModal.variant === 'error' ? 'text-red-600' : 'text-amber-600'
                  }`}>!</span>
                </div>
              </div>
            )}
            <h3 className={`text-lg font-bold mb-2 ${
              confirmModal.variant === 'error' ? 'text-red-800' : confirmModal.variant === 'warning' ? 'text-slate-800' : 'text-slate-800'
            }`}>
              {confirmModal.title}
            </h3>
            <p className="text-sm text-slate-600 mb-6">{confirmModal.message}</p>
            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={() => { confirmModal.onCancel?.(); setConfirmModal(null); }}
                className="px-4 py-2.5 rounded-lg border-2 border-indigo-500 bg-white text-indigo-600 font-medium hover:bg-indigo-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { confirmModal.onConfirm(); }}
                className={`px-4 py-2.5 rounded-lg font-medium text-white ${
                  confirmModal.variant === 'error' ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {confirmModal.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Raise a ticket form - same as header Help; opens from sidebar Help; uses same API/DB */}
      <MerchantHelpTicket
        pageContext="store-onboarding"
        hideTrigger
        open={showHelpModal}
        onOpenChange={setShowHelpModal}
      />

      {/* Scrollable content container - ONLY this div scrolls; compact padding to reduce scroll need */}
      <div
        ref={mainScrollRef}
        className={`flex-1 min-h-0 min-w-0 pb-24 sm:pb-28 overflow-y-auto overflow-x-hidden overscroll-contain hide-scrollbar ${step >= 7 && step <= 9 ? "pt-0 px-2 sm:px-4 md:px-6" : "p-2 sm:p-3 md:px-5"}`}
      >
        {/* Step 1: Basic Store Information - form module exactly centered with proper gap from header and bottom */}
        {step === 1 && (
          <div className="min-h-full flex items-center justify-center py-8 sm:py-12">
            <div className="w-full max-w-2xl space-y-6 mx-auto">
              {/* Step 1 form: Basic Store Information */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                <div className="p-4 sm:p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 bg-indigo-50 rounded-lg">
                      <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h1m0 0h-1m1 0v4m-5-9h10l1 7H4l1-7z" />
                      </svg>
                    </div>
                    <h2 className="text-base font-bold text-slate-800">Basic Store Information</h2>
                  </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Store Name *
                      </label>
                      <input
                        type="text"
                        name="store_name"
                        value={formData.store_name}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        placeholder="Enter store name"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Owner Full Name *
                      </label>
                      <input
                        type="text"
                        name="owner_full_name"
                        value={formData.owner_full_name}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        placeholder="Owner legal full name"
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Display Name
                      </label>
                      <input
                        type="text"
                        name="store_display_name"
                        value={formData.store_display_name}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        placeholder="Customer facing name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Legal Business Name
                      </label>
                      <input
                        type="text"
                        name="legal_business_name"
                        value={formData.legal_business_name}
                        readOnly
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-slate-50 text-slate-700 cursor-not-allowed"
                        placeholder="Same as Display Name (auto-filled)"
                        title="Filled automatically from Display Name"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Store Type *
                      </label>
                      <select
                        name="store_type"
                        value={formData.store_type}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        required
                      >
                        <option value="RESTAURANT">Restaurant</option>
                        <option value="CAFE">Cafe</option>
                        <option value="BAKERY">Bakery</option>
                        <option value="CLOUD_KITCHEN">Cloud Kitchen</option>
                        <option value="GROCERY">Grocery</option>
                        <option value="PHARMA">Pharma</option>
                        <option value="STATIONERY">Stationery</option>
                        <option value="ELECTRONICS_ECOMMERCE">Electronics and E-commerce</option>
                        <option value="OTHERS">Others</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Store Email *
                      </label>
                      <input
                        type="email"
                        name="store_email"
                        value={formData.store_email}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        placeholder="store@example.com"
                        required
                      />
                    </div>
                  </div>
                  
                  {/* Custom Store Type Field - Only shown when OTHERS is selected */}
                  {formData.store_type === 'OTHERS' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Custom Store Type *
                      </label>
                      <input
                        type="text"
                        name="custom_store_type"
                        value={formData.custom_store_type}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 text-sm border-2 border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        placeholder="Please specify your store type (e.g., Clothing Store, Electronics, etc.)"
                        required
                      />
                      <p className="text-xs text-slate-500 mt-0.5">
                        Please specify what type of store you are registering
                      </p>
                    </div>
                  )}
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Phone Numbers (comma separated)
                    </label>
                    <input
                      type="text"
                      name="store_phones"
                      value={storePhonesInput}
                      onChange={handleInputChange}
                      placeholder="+911234567890, +919876543210"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                    />
                    <p className="text-xs text-slate-500 mt-0.5">
                      Example: +911234567890, +919876543210
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Store Description
                    </label>
                    <textarea
                      name="store_description"
                      value={formData.store_description}
                      onChange={handleInputChange}
                      rows={2}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white resize-y min-h-[4.5rem]"
                      placeholder="Describe your store, specialties, etc."
                    />
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>
        )}

        {/* Step 2: Store Location */}
        {step === 2 && (
          <div className="h-full flex flex-col xl:flex-row gap-4">
            {/* Left Side - Form */}
            <div className="w-full xl:w-2/5 h-auto xl:h-full min-w-0">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full overflow-hidden">
                <div className="p-3 sm:p-5 h-full overflow-y-auto hide-scrollbar">
                  <div className="flex items-center gap-2 mb-4 sm:mb-5">
                    <div className="p-2 bg-indigo-50 rounded-lg">
                      <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <h2 className="text-lg font-bold text-slate-800">Store Location</h2>
                  </div>

                  {/* Toggle: GPS Coordinates (default) | Search Location */}
                  <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 mb-4">
                    <button
                      type="button"
                      onClick={() => setLocationInputMode('gps')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                        locationInputMode === 'gps'
                          ? 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                          : 'text-slate-600 hover:text-slate-800'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                      </svg>
                      GPS Coordinates
                    </button>
                    <button
                      type="button"
                      onClick={() => setLocationInputMode('search')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                        locationInputMode === 'search'
                          ? 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                          : 'text-slate-600 hover:text-slate-800'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      Search Location
                    </button>
                  </div>

                  <div className="space-y-2">
                    {/* Option 1: GPS Coordinates at top (default) – enter lat/lng, hit Search to fill address */}
                    {locationInputMode === 'gps' && (
                      <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50/80 to-white p-4">
                        <label className="block text-sm font-medium text-slate-700 mb-3">
                          GPS Coordinates *
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <div className="text-xs text-slate-600 mb-1">Latitude</div>
                            <input
                              type="number"
                              step="any"
                              value={formData.latitude ?? ''}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  latitude: e.target.value === '' ? null : Number(e.target.value),
                                }))
                              }
                              className="font-mono w-full text-sm bg-white px-3 py-2 rounded-lg border border-slate-300 text-slate-800"
                              placeholder="e.g. 22.5726459"
                            />
                          </div>
                          <div>
                            <div className="text-xs text-slate-600 mb-1">Longitude</div>
                            <input
                              type="number"
                              step="any"
                              value={formData.longitude ?? ''}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  longitude: e.target.value === '' ? null : Number(e.target.value),
                                }))
                              }
                              className="font-mono w-full text-sm bg-white px-3 py-2 rounded-lg border border-slate-300 text-slate-800"
                              placeholder="e.g. 88.363895"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleGpsSearch}
                          disabled={isSearching}
                          className="mt-3 px-4 py-2.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {isSearching ? 'Searching...' : 'Search'}
                        </button>
                        <p className="text-xs text-slate-500 mt-2">
                          Enter latitude &amp; longitude, then click Search to auto-fill address, city, state and postal code.
                        </p>
                      </div>
                    )}

                    {/* Option 2: Search by address / place name */}
                    {locationInputMode === 'search' && (
                      <div ref={searchRef}>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Search Location *
                        </label>
                        <div className="relative">
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="text"
                              value={searchQuery}
                              onChange={e => setSearchQuery(e.target.value)}
                              placeholder="Enter address, postal code, city..."
                              className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white min-w-0"
                            />
                            <button
                              type="button"
                              onClick={searchLocation}
                              disabled={isSearching}
                              className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium whitespace-nowrap"
                            >
                              {isSearching ? 'Searching...' : 'Search'}
                            </button>
                            {!disableCurrentLocationButton && (
                              <button
                                type="button"
                                onClick={handleUseCurrentLocation}
                                disabled={isFetchingCurrentLocation}
                                title="Use your device GPS for store location (may be approximate)"
                                className="px-3 py-2 text-sm border border-indigo-300 text-indigo-700 rounded-lg bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed font-medium whitespace-nowrap"
                              >
                                {isFetchingCurrentLocation ? 'Getting location...' : 'Use current location'}
                              </button>
                            )}
                          </div>
                          {locationNotice && (
                            <div className="mt-2 text-xs rounded-lg px-2.5 py-1.5 border border-amber-200 bg-amber-50 text-amber-700">
                              {locationNotice}
                            </div>
                          )}
                          {searchResults.length > 0 && (
                            <div className="absolute z-50 mt-1 w-full border border-slate-200 rounded-lg bg-white shadow-lg max-h-40 overflow-y-auto hide-scrollbar">
                              {searchResults.map((result, idx) => (
                                <div
                                  key={idx}
                                  onClick={() => {
                                    selectLocation(result);
                                    setSearchResults([]);
                                  }}
                                  className="p-3 hover:bg-indigo-50 cursor-pointer border-b border-slate-100 last:border-b-0 text-sm"
                                >
                                  <div className="font-medium text-slate-800">{result.text}</div>
                                  <div className="text-xs text-slate-600 truncate mt-1">{result.place_name}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Enter exact address, postal code, or location name
                        </p>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Full Address *
                      </label>
                      <textarea
                        name="full_address"
                        value={formData.full_address}
                        onChange={handleInputChange}
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        placeholder="Complete address with landmarks"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Flat / Unit No.
                        </label>
                        <input
                          type="text"
                          name="unit_number"
                          value={formData.unit_number}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                          placeholder="e.g. A-302"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Floor / Tower
                        </label>
                        <input
                          type="text"
                          name="floor_number"
                          value={formData.floor_number}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                          placeholder="e.g. 3rd Floor"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Building / Complex Name
                      </label>
                      <input
                        type="text"
                        name="building_name"
                        value={formData.building_name}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        placeholder="Building, block, complex name"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          City *
                        </label>
                        <input
                          type="text"
                          name="city"
                          value={formData.city}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          State *
                        </label>
                        <input
                          type="text"
                          name="state"
                          value={formData.state}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Postal Code *
                        </label>
                        <input
                          type="text"
                          name="postal_code"
                          value={formData.postal_code}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                          required
                          autoComplete="postal-code"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Landmark
                        </label>
                        <input
                          type="text"
                          name="landmark"
                          value={formData.landmark}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                          placeholder="Nearby landmark"
                        />
                      </div>
                    </div>
                    {/* When Search mode: show coordinates box so user can paste lat/lng and "Set location from coordinates". When GPS mode: show compact read-only. */}
                    {locationInputMode === 'search' ? (
                      <div className="border border-slate-200 rounded-xl p-4 bg-gradient-to-r from-indigo-50 to-white">
                        <div className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                          <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                          </svg>
                          GPS Coordinates
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <div className="text-xs text-slate-600 mb-2">Latitude</div>
                            <input
                              type="number"
                              name="latitude"
                              step="any"
                              value={formData.latitude ?? ''}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  latitude: e.target.value === '' ? null : Number(e.target.value),
                                }))
                              }
                              className="font-mono w-full text-sm bg-white p-3 rounded-lg border border-slate-300 text-slate-800"
                              placeholder="e.g. 22.5726459"
                            />
                          </div>
                          <div>
                            <div className="text-xs text-slate-600 mb-2">Longitude</div>
                            <input
                              type="number"
                              name="longitude"
                              step="any"
                              value={formData.longitude ?? ''}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  longitude: e.target.value === '' ? null : Number(e.target.value),
                                }))
                              }
                              className="font-mono w-full text-sm bg-white p-3 rounded-lg border border-slate-300 text-slate-800"
                              placeholder="e.g. 88.363895"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={applyManualCoordinates}
                          className="mt-3 px-4 py-2 text-xs font-medium rounded-lg border border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                        >
                          Set location from coordinates
                        </button>
                        {formData.latitude && formData.longitude && (
                          <div className="mt-3 text-xs text-emerald-600 flex items-center gap-1">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Location set at coordinates
                            {locationAccuracyMeters != null ? ` (~${locationAccuracyMeters}m accuracy)` : ''}
                          </div>
                        )}
                      </div>
                    ) : (
                      formData.latitude != null && formData.longitude != null && (
                        <div className="text-xs text-slate-500 flex items-center gap-2">
                          <span className="font-mono">Lat {formData.latitude}, Long {formData.longitude}</span>
                          {locationAccuracyMeters != null && (
                            <span className="text-emerald-600">~{locationAccuracyMeters}m accuracy</span>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>
            {/* Right Side - Map (stacks below form on small/medium) */}
            <div className="w-full xl:w-3/5 min-h-[280px] h-[280px] sm:h-[360px] xl:min-h-0 xl:h-full">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full overflow-hidden">
                <div className="p-3 sm:p-5 h-full flex flex-col">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3 sm:mb-4">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-rose-50 rounded-lg shrink-0">
                        <svg className="w-5 h-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                      </div>
                      <h3 className="font-bold text-slate-800 text-sm sm:text-base">Location Map</h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className={`px-3 py-1 text-xs font-medium rounded-full ${formData.latitude ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {formData.latitude ? '📍 Location Set' : '📍 Search to set location'}
                      </div>
                    </div>
                  </div>
                  {!mapboxToken && (
                    <div className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Mapbox token not found. Add <span className="font-mono">NEXT_PUBLIC_MAPBOX_TOKEN</span> in
                      <span className="font-mono"> .env.local</span> to use the map.
                    </div>
                  )}
                  <div className="flex-1 rounded-lg overflow-hidden border border-slate-300">
                    {mapboxToken ? (
                      <StoreLocationMapboxGL
                        ref={mapRef}
                        latitude={formData.latitude}
                        longitude={formData.longitude}
                        mapboxToken={mapboxToken}
                        onLocationChange={(lat, lng) =>
                          setFormData((prev) => ({ ...prev, latitude: lat, longitude: lng }))
                        }
                        onMapClick={handleMapClick}
                      />
                    ) : (
                      <div className="h-full min-h-[300px] w-full flex items-center justify-center bg-slate-100 text-slate-500 text-sm rounded-lg">
                        Add NEXT_PUBLIC_MAPBOX_TOKEN to load the map
                      </div>
                    )}
                  </div>
                  <div className="mt-3 sm:mt-4 text-xs text-slate-600">
                    <div className="flex flex-col xs:flex-row flex-wrap gap-1 sm:gap-3">
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-rose-500 rounded-full shrink-0"></div>
                        <span>Drag marker or click on map to set location</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <svg className="w-3 h-3 text-indigo-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                        </svg>
                        <span>Search for exact address</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Menu Setup */}
        {step === 3 ? <Step3MenuUpload {...step3MenuUploadProps} /> : null}

        {/* Step 4: Store Documents */}
        {step === 4 && (
          <div className="w-full h-full">
            <CombinedDocumentStoreSetup
              key={`step-4-docs-${selectedStorePublicId || draftStorePublicId || 'new'}`}
              initialDocuments={documents}
              onDocumentComplete={(docs) => void handleDocumentUploadComplete(docs as unknown as DocumentData)}
              onDocumentSave={(docs) => saveDocumentProgress(docs as unknown as DocumentData)}
              onBack={prevStep}
              actionLoading={actionLoading}
              businessType={formData.store_type === 'OTHERS' ? formData.custom_store_type : formData.store_type}
              storeType={formData.store_type}
              initialStep="documents"
            />
          </div>
        )}

        {/* Step 5: Store Configuration */}
        {step === 5 && (
          <div className="w-full h-full">
            <CombinedDocumentStoreSetup
              initialStoreSetup={storeSetup}
              onStoreSetupComplete={handleStoreSetupComplete}
              onStoreHoursSave={(hours) => saveStoreHoursProgress(hours)}
              onStoreFeaturesSave={saveStoreFeaturesProgress}
              onBack={async () => {
                setActionLoading(true);
                try {
                  await saveProgress({ currentStep: 5, nextStep: 4, markStepComplete: false, formDataPatch: getStepPatch(5) });
                  setStep(4);
                  const storeId = selectedStorePublicId || (typeof window !== 'undefined' ? localStorage.getItem('registerStoreCurrentStepStoreId') : null) || '';
                  const url = storeId ? `/api/auth/register-store-progress?storePublicId=${encodeURIComponent(storeId)}` : '/api/auth/register-store-progress';
                  fetch(url)
                    .then((res) => res.json())
                    .then((payload) => {
                      if (payload?.success && payload?.progress) {
                        const saved = payload.progress.form_data || {};
                        if (saved.step4 != null) {
                          const s4 = saved.step4 as Record<string, unknown>;
                          setDocuments((prev) => ({
                            ...prev,
                            pan_number: saved.step4.pan_number ?? prev.pan_number,
                            pan_holder_name: saved.step4.pan_holder_name ?? prev.pan_holder_name,
                            aadhar_number: saved.step4.aadhar_number ?? prev.aadhar_number,
                            aadhar_holder_name: saved.step4.aadhar_holder_name ?? prev.aadhar_holder_name,
                            fssai_number: saved.step4.fssai_number ?? prev.fssai_number,
                            gst_number: saved.step4.gst_number ?? prev.gst_number,
                            drug_license_number: saved.step4.drug_license_number ?? prev.drug_license_number,
                            pharmacist_registration_number: saved.step4.pharmacist_registration_number ?? prev.pharmacist_registration_number,
                            expiry_date: saved.step4.expiry_date ?? prev.expiry_date,
                            fssai_expiry_date: saved.step4.fssai_expiry_date ?? prev.fssai_expiry_date,
                            drug_license_expiry_date: saved.step4.drug_license_expiry_date ?? prev.drug_license_expiry_date,
                            pharmacist_expiry_date: saved.step4.pharmacist_expiry_date ?? prev.pharmacist_expiry_date,
                            other_document_type: saved.step4.other_document_type ?? prev.other_document_type,
                            other_document_number: saved.step4.other_document_number ?? prev.other_document_number,
                            other_document_name: saved.step4.other_document_name ?? prev.other_document_name,
                            other_document_expiry_date: saved.step4.other_document_expiry_date ?? prev.other_document_expiry_date,
                            pan_image_url: (typeof s4.pan_image_url === 'string' ? s4.pan_image_url : null) ?? null,
                            aadhar_front_url: (typeof s4.aadhar_front_url === 'string' ? s4.aadhar_front_url : null) ?? null,
                            aadhar_back_url: (typeof s4.aadhar_back_url === 'string' ? s4.aadhar_back_url : null) ?? null,
                            fssai_image_url: (typeof s4.fssai_image_url === 'string' ? s4.fssai_image_url : null) ?? null,
                            gst_image_url: (typeof s4.gst_image_url === 'string' ? s4.gst_image_url : null) ?? null,
                            drug_license_image_url: (typeof s4.drug_license_image_url === 'string' ? s4.drug_license_image_url : null) ?? null,
                            pharmacist_certificate_url: (typeof s4.pharmacist_certificate_url === 'string' ? s4.pharmacist_certificate_url : null) ?? null,
                            pharmacy_council_registration_url: (typeof s4.pharmacy_council_registration_url === 'string' ? s4.pharmacy_council_registration_url : null) ?? null,
                            other_document_file_url: (typeof s4.other_document_file_url === 'string' ? s4.other_document_file_url : null) ?? null,
                            bank: saved.step4.bank && typeof saved.step4.bank === 'object'
                              ? {
                                  ...(prev.bank || {}),
                                  ...saved.step4.bank,
                                  bank_proof_file_url: (typeof (saved.step4.bank as any).bank_proof_file_url === 'string' ? (saved.step4.bank as any).bank_proof_file_url : null) ?? null,
                                  upi_qr_screenshot_url: (typeof (saved.step4.bank as any).upi_qr_screenshot_url === 'string' ? (saved.step4.bank as any).upi_qr_screenshot_url : null) ?? null,
                                }
                              : prev.bank,
                          }));
                        }
                      }
                    })
                    .catch((err) => console.error('Background hydrate failed:', err));
                } catch (err) {
                  console.error('Failed to save step 5 data:', err);
                  setStep(4);
                } finally {
                  setActionLoading(false);
                }
              }}
              actionLoading={actionLoading}
              businessType={formData.store_type === 'OTHERS' ? formData.custom_store_type : formData.store_type}
              storeType={formData.store_type}
              initialStep="store-setup"
            />
          </div>
        )}

        {/* Step 6: Preview */}
        {step === 6 && (
          <div className="w-full h-full">
            <PreviewPage
              step1={{
                ...formData,
                __draftStoreDbId: draftStoreDbId,
                __draftStorePublicId: draftStorePublicId,
              }}
              step2={formData}
              documents={documents}
              storeSetup={storeSetup}
              menuData={{
                menuUploadMode,
                menuImageFiles: [],
                menuSpreadsheetFile: null,
                menuImageUrls: menuUploadedImageUrls,
                menuSpreadsheetUrl: menuUploadedSpreadsheetUrl,
                menuPdfUrl: menuUploadedPdfUrl,
                menuPdfFileName: menuUploadedPdfFileName,
              }}
              parentInfo={parentInfo}
              onBack={async () => {
                setActionLoading(true);
                try {
                  await saveProgress({ currentStep: 6, nextStep: 5, markStepComplete: false, formDataPatch: getStepPatch(6) });
                  setStep(5);
                } catch (err) {
                  console.error('Failed to save step 6 data:', err);
                  setStep(5);
                } finally {
                  setActionLoading(false);
                }
              }}
              onContinueToPlans={async () => {
                setActionLoading(true);
                try {
                  await saveProgress({ currentStep: 6, nextStep: 7, markStepComplete: true, formDataPatch: getStepPatch(6) });
                  setStep(7);
                } catch (err) {
                  console.error('Failed to save step 6 data:', err);
                  alert('Failed to save your progress. Please try again.');
                } finally {
                  setActionLoading(false);
                }
              }}
              actionLoading={actionLoading}
            />
          </div>
        )}

        {/* Step 7: Onboarding plans */}
        {step === 7 && (
          <div className="w-full h-full">
            <OnboardingPlansPage
              selectedPlanId={selectedPlanId}
              onSelectPlan={setSelectedPlanId}
              parentInfo={parentInfo}
              step1={formData}
              onBack={async () => {
                setActionLoading(true);
                try {
                  await saveProgress({ currentStep: 7, nextStep: 6, markStepComplete: false, formDataPatch: { step7: { selectedPlanId: selectedPlanId || 'FREE' } } });
                  setStep(6);
                } catch (err) {
                  console.error('Failed to save step 7 data:', err);
                  setStep(6);
                } finally {
                  setActionLoading(false);
                }
              }}
              onContinue={async () => {
                setActionLoading(true);
                try {
                  await saveProgress({ currentStep: 7, nextStep: 8, markStepComplete: true, formDataPatch: { step7: { selectedPlanId: selectedPlanId || 'FREE' } } });
                  setStep(8);
                } catch (err) {
                  console.error('Failed to save step 7 data:', err);
                  alert('Failed to save your progress. Please try again.');
                } finally {
                  setActionLoading(false);
                }
              }}
              actionLoading={actionLoading}
            />
          </div>
        )}

        {/* Step 8: Agreement contract */}
        {step === 8 && (
          <div className="w-full h-full">
            <AgreementContractPage
              step1={formData}
              step2={formData}
              documents={documents}
              parentInfo={parentInfo}
              termsContent={agreementTemplate?.content_markdown || MERCHANT_PARTNERSHIP_TERMS}
              logoUrl={typeof process.env.NEXT_PUBLIC_PLATFORM_LOGO_URL === "string" && process.env.NEXT_PUBLIC_PLATFORM_LOGO_URL ? process.env.NEXT_PUBLIC_PLATFORM_LOGO_URL : "/logo.png"}
              onBack={async () => {
                setActionLoading(true);
                try {
                  await saveProgress({ currentStep: 8, nextStep: 7, markStepComplete: false, formDataPatch: {} });
                  setStep(7);
                } catch (err) {
                  console.error('Failed to save step 8 data:', err);
                  setStep(7);
                } finally {
                  setActionLoading(false);
                }
              }}
              onContinue={async (text) => {
                setActionLoading(true);
                try {
                  await saveProgress({ currentStep: 8, nextStep: 9, markStepComplete: true, formDataPatch: {} });
                  setContractTextForSignature(text);
                  setStep(9);
                } catch (err) {
                  console.error('Failed to save step 8 data:', err);
                  alert('Failed to save your progress. Please try again.');
                } finally {
                  setActionLoading(false);
                }
              }}
              actionLoading={actionLoading}
            />
          </div>
        )}

        {/* Step 9: Digital signature & submit */}
        {step === 9 && (
          <div className="w-full h-full">
            <SignatureStepPage
              step1={{
                ...formData,
                __draftStoreDbId: draftStoreDbId ?? undefined,
                __draftStorePublicId: draftStorePublicId ?? undefined,
                store_public_id: currentStoreId || draftStorePublicId, // Pass the Store ID for final submission
              }}
              step2={formData}
              documents={documents}
              storeSetup={storeSetup}
              menuData={{
                menuUploadMode,
                menuImageFiles: [],
                menuSpreadsheetFile: null,
                menuImageUrls: menuUploadedImageUrls,
                menuSpreadsheetUrl: menuUploadedSpreadsheetUrl,
                menuPdfUrl: menuUploadedPdfUrl,
                menuPdfFileName: menuUploadedPdfFileName,
              }}
              parentInfo={parentInfo}
              agreementTemplate={agreementTemplate}
              defaultAgreementText={agreementTemplate?.content_markdown || MERCHANT_PARTNERSHIP_TERMS}
              contractTextForPdf={contractTextForSignature}
              logoUrl={typeof process.env.NEXT_PUBLIC_PLATFORM_LOGO_URL === "string" && process.env.NEXT_PUBLIC_PLATFORM_LOGO_URL ? process.env.NEXT_PUBLIC_PLATFORM_LOGO_URL : "/logo.png"}
              onBack={async () => {
                setActionLoading(true);
                try {
                  await saveProgress({ currentStep: 9, nextStep: 8, markStepComplete: false, formDataPatch: {} });
                  setStep(8);
                } catch (err) {
                  console.error('Failed to save step 9 data:', err);
                  setStep(8);
                } finally {
                  setActionLoading(false);
                }
              }}
              actionLoading={actionLoading}
              onSuccess={handleRegistrationSuccess}
            />
          </div>
        )}
      </div>
        </main>
      </div>

      {/* Bottom navigation bar - starts after sidebar so Help button never overlaps */}
      {!showSuccess && step < 4 && (
        <div
          className="fixed bottom-0 left-14 sm:left-[13rem] md:left-56 lg:left-60 right-0 z-30 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.08)]"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 min-h-[56px] max-w-full">
            <div className="flex-1 min-w-0" />
            <div className="flex items-center gap-3 flex-shrink-0">
              {step > 1 && (
                <button
                  type="button"
                  onClick={prevStep}
                  disabled={uploadLoading || actionLoading}
                  className="px-4 py-2.5 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  {uploadLoading || actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  ← Previous
                </button>
              )}
              <button
                type="button"
                onClick={nextStep}
                disabled={uploadLoading || actionLoading}
                className="px-5 py-2.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {uploadLoading || actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                )}
                {uploadLoading ? 'Uploading...' : actionLoading ? 'Saving...' : 'Save & Continue'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StoreRegistrationFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
      <div className="text-center space-y-4">
        <div className="inline-flex p-4 rounded-full bg-blue-100">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
        </div>
        <p className="text-sm font-medium text-slate-700">Loading registration form...</p>
      </div>
    </div>
  );
}

export default function StoreRegistrationPage() {
  return (
    <Suspense fallback={<StoreRegistrationFallback />}>
      <StoreRegistrationForm />
    </Suspense>
  );
}