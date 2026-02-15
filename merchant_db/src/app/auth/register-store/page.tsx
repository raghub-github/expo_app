"use client";
// Utility to safely display numeric values in input fields
const safeNumberInput = (val: number | null | undefined) => (typeof val === 'number' && !isNaN(val) ? val : '');

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { useSearchParams } from 'next/navigation';
import CombinedDocumentStoreSetup from './doc';
import PreviewPage from './preview';
import OnboardingPlansPage from './plans';
import AgreementContractPage from './agreement';
import SignatureStepPage from './signature';
import { MERCHANT_PARTNERSHIP_TERMS } from './terms-and-conditions';

const StoreLocationMap = dynamic(() => import('@/components/StoreLocationMap'), { ssr: false });
const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
type MapProvider = 'leaflet' | 'mapbox';

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

type MenuUploadMode = 'IMAGE' | 'CSV';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const StoreRegistrationForm = () => {
  const [step, setStep] = useState(1);
  const [isClient, setIsClient] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [generatedStoreId, setGeneratedStoreId] = useState<string>('');
  const [parentInfo, setParentInfo] = useState<{ id: number | null; name: string | null; parent_merchant_id: string | null } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isFetchingCurrentLocation, setIsFetchingCurrentLocation] = useState(false);
  const [locationAccuracyMeters, setLocationAccuracyMeters] = useState<number | null>(null);
  const [locationNotice, setLocationNotice] = useState<string>('');
  const [storePhonesInput, setStorePhonesInput] = useState('');
  const [mapProvider, setMapProvider] = useState<MapProvider>('mapbox');
  const [progressHydrated, setProgressHydrated] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const mapRef = useRef<any>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const selectedStorePublicId = searchParams.get('store_id');
  const forceNewOnboarding = searchParams.get('new') === '1';

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
    accepts_cash: true,
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
  const [menuUploadError, setMenuUploadError] = useState('');
  const [isImageDragActive, setIsImageDragActive] = useState(false);
  const [isCsvDragActive, setIsCsvDragActive] = useState(false);
  const imageUploadInputRef = useRef<HTMLInputElement>(null);
  const csvUploadInputRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    setIsClient(true);
  }, []);

  const parentIdParam = searchParams.get('parent_id');
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
        if (forceNewOnboarding) {
          setProgressHydrated(true);
          return;
        }

        const progressUrl = selectedStorePublicId
          ? `/api/auth/register-store-progress?storePublicId=${encodeURIComponent(selectedStorePublicId)}`
          : '/api/auth/register-store-progress';
        const res = await fetch(progressUrl);
        const payload = await res.json();
        const progress = res.ok && payload?.success ? payload?.progress : null;

        if (progress) {
          const saved = progress.form_data || {};
          if (saved.step_store?.storeDbId) setDraftStoreDbId(saved.step_store.storeDbId);
          if (saved.step_store?.storePublicId) setDraftStorePublicId(saved.step_store.storePublicId);

          if (saved.step1) {
            setFormData((prev) => ({ ...prev, ...saved.step1 }));
            if (saved.step1.store_phones && Array.isArray(saved.step1.store_phones)) {
              setStorePhonesInput(saved.step1.store_phones.join(', '));
            }
          }
          if (saved.step2) {
            setFormData((prev) => ({ ...prev, ...saved.step2 }));
          }
          if (saved.step3) {
            if (saved.step3.menuUploadMode === 'CSV') setMenuUploadMode('CSV');
            if (saved.step3.menuUploadMode === 'IMAGE') setMenuUploadMode('IMAGE');
            if (Array.isArray(saved.step3.menuImageUrls)) setMenuUploadedImageUrls(saved.step3.menuImageUrls);
            if (saved.step3.menuSpreadsheetUrl) setMenuUploadedSpreadsheetUrl(saved.step3.menuSpreadsheetUrl);
          }
          if (saved.step4) {
            setDocuments((prev) => ({
              ...prev,
              pan_number: saved.step4.pan_number ?? prev.pan_number,
              pan_holder_name: saved.step4.pan_holder_name ?? prev.pan_holder_name,
              aadhar_number: saved.step4.aadhar_number ?? prev.aadhar_number,
              aadhar_holder_name: saved.step4.aadhar_holder_name ?? prev.aadhar_holder_name,
              fssai_number: saved.step4.fssai_number ?? prev.fssai_number,
              gst_number: saved.step4.gst_number ?? prev.gst_number,
              drug_license_number: saved.step4.drug_license_number ?? prev.drug_license_number,
              pharmacist_registration_number:
                saved.step4.pharmacist_registration_number ?? prev.pharmacist_registration_number,
              expiry_date: saved.step4.expiry_date ?? prev.expiry_date,
              fssai_expiry_date: saved.step4.fssai_expiry_date ?? prev.fssai_expiry_date,
              drug_license_expiry_date: saved.step4.drug_license_expiry_date ?? prev.drug_license_expiry_date,
              pharmacist_expiry_date: saved.step4.pharmacist_expiry_date ?? prev.pharmacist_expiry_date,
              other_document_type: saved.step4.other_document_type ?? prev.other_document_type,
              other_document_number: saved.step4.other_document_number ?? prev.other_document_number,
              other_document_name: saved.step4.other_document_name ?? prev.other_document_name,
              other_document_expiry_date: saved.step4.other_document_expiry_date ?? prev.other_document_expiry_date,
              bank:
                saved.step4.bank && typeof saved.step4.bank === 'object'
                  ? { ...(prev.bank || {}), ...saved.step4.bank }
                  : prev.bank,
            }));
          }
          if (saved.step5) {
            setStoreSetup((prev) => ({
              ...prev,
              cuisine_types: Array.isArray(saved.step5.cuisine_types) ? saved.step5.cuisine_types : prev.cuisine_types,
              food_categories: Array.isArray(saved.step5.food_categories) ? saved.step5.food_categories : prev.food_categories,
              avg_preparation_time_minutes:
                typeof saved.step5.avg_preparation_time_minutes === 'number'
                  ? saved.step5.avg_preparation_time_minutes
                  : prev.avg_preparation_time_minutes,
              min_order_amount:
                typeof saved.step5.min_order_amount === 'number' ? saved.step5.min_order_amount : prev.min_order_amount,
              delivery_radius_km:
                typeof saved.step5.delivery_radius_km === 'number' ? saved.step5.delivery_radius_km : prev.delivery_radius_km,
              is_pure_veg: typeof saved.step5.is_pure_veg === 'boolean' ? saved.step5.is_pure_veg : prev.is_pure_veg,
              accepts_online_payment:
                typeof saved.step5.accepts_online_payment === 'boolean'
                  ? saved.step5.accepts_online_payment
                  : prev.accepts_online_payment,
              accepts_cash: typeof saved.step5.accepts_cash === 'boolean' ? saved.step5.accepts_cash : prev.accepts_cash,
              store_hours: normalizeStoreHours(saved.step5.store_hours, prev.store_hours),
              logo_preview: typeof saved.step5.logo_url === 'string' ? saved.step5.logo_url : prev.logo_preview,
              banner_preview: typeof saved.step5.banner_url === 'string' ? saved.step5.banner_url : prev.banner_preview,
              gallery_previews: Array.isArray(saved.step5.gallery_image_urls) ? saved.step5.gallery_image_urls : prev.gallery_previews,
            }));
          }

          if (saved.step7?.selectedPlanId) {
            setSelectedPlanId(saved.step7.selectedPlanId);
          }
          if (Number.isFinite(Number(progress.current_step))) {
            const restoredStep = Math.min(Math.max(Number(progress.current_step), 1), 9);
            setStep(restoredStep);
          }
          return;
        }

        if (selectedStorePublicId) {
          const { data: existingStore } = await supabase
            .from('merchant_stores')
            .select(`
              id,
              store_id,
              store_name,
              store_display_name,
              store_description,
              store_type,
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
              current_onboarding_step
            `)
            .eq('store_id', selectedStorePublicId)
            .maybeSingle();

          if (existingStore) {
            setDraftStoreDbId(existingStore.id);
            setDraftStorePublicId(existingStore.store_id);
            setFormData((prev) => ({
              ...prev,
              store_name: existingStore.store_name ?? prev.store_name,
              store_display_name: existingStore.store_display_name ?? prev.store_display_name,
              store_description: existingStore.store_description ?? prev.store_description,
              store_type: existingStore.store_type ?? prev.store_type,
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
            if (typeof existingStore.current_onboarding_step === 'number') {
              setStep(Math.min(Math.max(existingStore.current_onboarding_step, 1), 9));
            }
          }
        }
      } catch (err) {
        console.error('Failed to hydrate onboarding progress:', err);
      } finally {
        setProgressHydrated(true);
      }
    };

    hydrateProgress();
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
    if (!mapboxToken) return;
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
      if (!best) return;

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

      setFormData((prev) => ({
        ...prev,
        full_address: best.place_name || prev.full_address,
        address_line1: best.text || prev.address_line1,
        city: city || prev.city,
        state: state || prev.state,
        postal_code: postal_code || prev.postal_code,
        country: 'IN',
      }));
      setSearchQuery(best.place_name || '');
    } catch (error) {
      console.error('Reverse geocoding failed:', error);
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

  const handleUseCurrentLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    const getPosition = (options: PositionOptions) =>
      new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, options);
      });

    const collectBestPosition = (options: PositionOptions & { sampleMs?: number; targetAccuracyM?: number }) =>
      new Promise<GeolocationPosition>((resolve, reject) => {
        let best: GeolocationPosition | null = null;
        let watchId: number | null = null;
        const sampleMs = options.sampleMs ?? 12000;
        const targetAccuracyM = options.targetAccuracyM ?? 100;

        const finish = (position?: GeolocationPosition, error?: GeolocationPositionError) => {
          if (watchId != null) navigator.geolocation.clearWatch(watchId);
          clearTimeout(timeoutId);
          if (position) {
            resolve(position);
            return;
          }
          if (best) {
            resolve(best);
            return;
          }
          reject(error ?? new Error('Unable to determine current location'));
        };

        watchId = navigator.geolocation.watchPosition(
          (position) => {
            if (!best || position.coords.accuracy < best.coords.accuracy) {
              best = position;
            }
            // Stop early once we have a precise enough reading.
            if (position.coords.accuracy <= targetAccuracyM) {
              finish(position);
            }
          },
          (error) => {
            finish(undefined, error);
          },
          options
        );

        const timeoutId = window.setTimeout(() => finish(best ?? undefined), sampleMs);
      });

    setIsFetchingCurrentLocation(true);
    setLocationNotice('');
    setLocationAccuracyMeters(null);
    try {
      let bestPosition = await getPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      });

      // If first reading is coarse, briefly watch for better samples.
      if (bestPosition.coords.accuracy > 800) {
        try {
          const watchedBest = await collectBestPosition({
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 0,
            sampleMs: 15000,
            targetAccuracyM: 120,
          });
          if (watchedBest.coords.accuracy < bestPosition.coords.accuracy) {
            bestPosition = watchedBest;
          }
        } catch {
          // Keep first position if watch sampling fails.
        }
      }

      // Final fallback retry with relaxed constraints if still very coarse.
      if (bestPosition.coords.accuracy > 3000) {
        try {
          const retryPosition = await getPosition({
            enableHighAccuracy: false,
            timeout: 12000,
            maximumAge: 3000,
          });
          if (retryPosition.coords.accuracy < bestPosition.coords.accuracy) {
            bestPosition = retryPosition;
          }
        } catch {
          // Keep best known position.
        }
      }

      const { latitude, longitude, accuracy } = bestPosition.coords;
      const roundedAccuracy = Math.round(accuracy);
      setLocationAccuracyMeters(roundedAccuracy);
      setFormData((prev) => ({
        ...prev,
        latitude,
        longitude,
      }));

      if (mapRef.current) {
        const zoom =
          roundedAccuracy <= 50 ? 18 :
          roundedAccuracy <= 150 ? 17 :
          roundedAccuracy <= 1000 ? 16 : 14;
        mapRef.current.flyTo({
          center: [longitude, latitude],
          zoom,
          duration: 1.4,
        });
      }

      await reverseGeocode(latitude, longitude);
      if (roundedAccuracy > 5000) {
        setLocationNotice(
          `Current location found, but GPS accuracy is still low (${roundedAccuracy}m). Please refine by dragging the pin or searching the exact address.`
        );
      } else if (roundedAccuracy > 250) {
        setLocationNotice(`Location found (accuracy ~${roundedAccuracy}m). You can fine-tune by dragging the pin.`);
      } else {
        setLocationNotice(`Location captured accurately (~${roundedAccuracy}m).`);
      }
    } catch (error: any) {
      const message =
        error?.code === 1
          ? 'Location permission denied. Please allow location access in browser settings.'
          : error?.code === 3
          ? 'Location request timed out. Please move near open sky and try again.'
          : 'Unable to fetch current location. Please try again.';
      alert(message);
    } finally {
      setIsFetchingCurrentLocation(false);
    }
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

    if (validFiles.length > 0) {
      setMenuImageFiles((prev) => [...prev, ...validFiles]);
      setMenuUploadedImageUrls([]);
      setMenuUploadMode('IMAGE');
      setMenuSpreadsheetFile(null);
      setMenuUploadedSpreadsheetUrl(null);
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
    setMenuUploadError('');
    setMenuSpreadsheetFile(file);
    setMenuUploadedSpreadsheetUrl(null);
    setMenuUploadMode('CSV');
    setMenuImageFiles([]);
    setMenuUploadedImageUrls([]);
  };

  const removeMenuImage = (index: number) => {
    setMenuImageFiles((prev) => prev.filter((_, i) => i !== index));
    setMenuUploadedImageUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadToR2 = async (file: File, folder: string, filename: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('parent', folder);
    form.append('filename', filename || file.name);
    const res = await fetch('/api/upload/r2', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok || !data?.url) throw new Error(data?.error || 'R2 upload failed');
    return data.url as string;
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
    if (stepNumber === 1) return { step1: sanitizeForProgress(formData) };
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
          menuImageNames: menuImageFiles.map((f) => f.name),
          menuImageUrls: menuUploadedImageUrls,
          menuSpreadsheetName: menuSpreadsheetFile?.name || null,
          menuSpreadsheetUrl: menuUploadedSpreadsheetUrl,
        },
      };
    }
    if (stepNumber === 4) return { step4: sanitizeForProgress(documents) };
    if (stepNumber === 5) return { step5: sanitizeForProgress(storeSetup) };
    return {};
  };

  const saveProgress = useCallback(
    async (params: { currentStep: number; nextStep?: number; markStepComplete?: boolean; formDataPatch?: any }) => {
      try {
        const res = await fetch('/api/auth/register-store-progress', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentStep: params.currentStep,
            nextStep: params.nextStep,
            markStepComplete: !!params.markStepComplete,
            formDataPatch: params.formDataPatch || getStepPatch(params.currentStep),
            storePublicId: selectedStorePublicId || draftStorePublicId || undefined,
            registrationStatus: 'IN_PROGRESS',
          }),
        });
        const payload = await res.json();
        const stepStore = payload?.progress?.form_data?.step_store;
        if (stepStore?.storeDbId) setDraftStoreDbId(stepStore.storeDbId);
        if (stepStore?.storePublicId) setDraftStorePublicId(stepStore.storePublicId);
      } catch (err) {
        console.error('Failed to save onboarding progress:', err);
      }
    },
    [
      formData,
      menuUploadMode,
      menuImageFiles,
      menuSpreadsheetFile,
      menuUploadedImageUrls,
      menuUploadedSpreadsheetUrl,
      documents,
      storeSetup,
      selectedStorePublicId,
      draftStorePublicId,
    ]
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
      return !!menuSpreadsheetFile || !!menuUploadedSpreadsheetUrl;
    }
    return true;
  };

  const nextStep = async () => {
    if (validateStep(step)) {
      setActionLoading(true);
      try {
        let stepPatch = getStepPatch(step);
        if (step === 3) {
          try {
            const folderBase = (parentInfo?.parent_merchant_id || searchParams.get('parent_id') || 'merchant') as string;
            if (menuUploadMode === 'IMAGE' && menuImageFiles.length > 0) {
              const uploaded = await Promise.all(
                menuImageFiles.map((file, idx) =>
                  uploadToR2(file, `${folderBase}/onboarding/menu/images`, `menu_image_${Date.now()}_${idx + 1}`)
                )
              );
              setMenuUploadedImageUrls(uploaded);
              stepPatch = {
                step3: {
                  menuUploadMode,
                  menuImageNames: menuImageFiles.map((f) => f.name),
                  menuImageUrls: uploaded,
                },
              };
            } else if (menuUploadMode === 'CSV' && menuSpreadsheetFile) {
              const uploadedSheetUrl = await uploadToR2(
                menuSpreadsheetFile,
                `${folderBase}/onboarding/menu/csv`,
                `menu_sheet_${Date.now()}`
              );
              setMenuUploadedSpreadsheetUrl(uploadedSheetUrl);
              stepPatch = {
                step3: {
                  menuUploadMode,
                  menuSpreadsheetName: menuSpreadsheetFile.name,
                  menuSpreadsheetUrl: uploadedSheetUrl,
                },
              };
            }
          } catch (uploadErr: any) {
            alert(uploadErr?.message || 'Failed to upload menu file(s). Please try again.');
            return;
          }
        }
        await saveProgress({
          currentStep: step,
          nextStep: step + 1,
          markStepComplete: true,
          formDataPatch: stepPatch,
        });
        setStep(prev => prev + 1);
      } finally {
        setActionLoading(false);
      }
    } else {
      if (step === 1 && formData.store_type === 'OTHERS' && !formData.custom_store_type.trim()) {
        alert('Please specify your store type in the "Custom Store Type" field.');
      } else if (step === 3 && menuUploadMode === 'IMAGE' && menuImageFiles.length === 0 && menuUploadedImageUrls.length === 0) {
        alert('Please upload at least one menu image (max 5 MB each) before continuing.');
      } else if (step === 3 && menuUploadMode === 'CSV' && !menuSpreadsheetFile && !menuUploadedSpreadsheetUrl) {
        alert('Please upload a CSV/XLS/XLSX file before continuing.');
      } else {
        alert('Please fill all required fields before proceeding.');
      }
    }
  };

  const prevStep = async () => {
    setActionLoading(true);
    try {
      await saveProgress({
        currentStep: step,
        nextStep: Math.max(step - 1, 1),
        markStepComplete: false,
        formDataPatch: getStepPatch(step),
      });
      setStep(prev => prev - 1);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDocumentUploadComplete = async (docs: DocumentData) => {
    setDocuments(docs);
    setActionLoading(true);
    try {
      const folderBase = (parentInfo?.parent_merchant_id || searchParams.get('parent_id') || 'merchant') as string;
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
        if (typeof File !== 'undefined' && value instanceof File) {
          const url = await uploadToR2(value, `${folderBase}/onboarding/documents`, `${key}_${Date.now()}`);
          if (key === 'other_document_file') {
            docsPatch.other_document_file_url = url;
          } else {
            docsPatch[`${key}_url`] = url;
          }
        }
      }
      if ((docs as any).bank && typeof (docs as any).bank === 'object') {
        const bank = (docs as any).bank;
        docsPatch.bank = { ...bank };
        if (typeof File !== 'undefined' && bank.bank_proof_file instanceof File) {
          const url = await uploadToR2(bank.bank_proof_file, `${folderBase}/onboarding/bank`, `bank_proof_${Date.now()}`);
          docsPatch.bank.bank_proof_file_url = url;
        }
        if (typeof File !== 'undefined' && bank.upi_qr_file instanceof File) {
          const url = await uploadToR2(bank.upi_qr_file, `${folderBase}/onboarding/bank`, `upi_qr_${Date.now()}`);
          docsPatch.bank.upi_qr_screenshot_url = url;
        }
      }
      await saveProgress({
        currentStep: 4,
        nextStep: 5,
        markStepComplete: true,
        formDataPatch: { step4: docsPatch },
      });
      setStep(5);
    } catch (err: any) {
      alert(err?.message || 'Failed to upload document files. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStoreSetupComplete = async (setup: StoreSetupData) => {
    setStoreSetup(setup);
    setActionLoading(true);
    try {
      const folderBase = (parentInfo?.parent_merchant_id || searchParams.get('parent_id') || 'merchant') as string;
      const step5Patch: any = { ...sanitizeForProgress(setup) };
      if (typeof File !== 'undefined' && setup.logo instanceof File) {
        step5Patch.logo_url = await uploadToR2(setup.logo, `${folderBase}/onboarding/store-media`, `logo_${Date.now()}`);
      }
      if (typeof File !== 'undefined' && setup.banner instanceof File) {
        step5Patch.banner_url = await uploadToR2(setup.banner, `${folderBase}/onboarding/store-media`, `banner_${Date.now()}`);
      }
      const galleryUrls: string[] = [];
      for (let i = 0; i < (setup.gallery_images || []).length; i++) {
        const file = setup.gallery_images[i];
        if (typeof File !== 'undefined' && file instanceof File) {
          const url = await uploadToR2(file, `${folderBase}/onboarding/store-media/gallery`, `gallery_${Date.now()}_${i + 1}`);
          galleryUrls.push(url);
        }
      }
      if (galleryUrls.length > 0) {
        step5Patch.gallery_image_urls = galleryUrls;
      }
      await saveProgress({
        currentStep: 5,
        nextStep: 6,
        markStepComplete: true,
        formDataPatch: { step5: step5Patch },
      });
      setStep(6);
    } catch (err: any) {
      alert(err?.message || 'Failed to upload store media. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegistrationSuccess = (storeId: string) => {
    setGeneratedStoreId(storeId);
    setShowSuccess(true);
    fetch('/api/auth/register-store-progress', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentStep: 9,
        nextStep: 9,
        markStepComplete: true,
        formDataPatch: { final: { submitted: true, storeId } },
        registrationStatus: 'COMPLETED',
      }),
    }).catch((err) => {
      console.error('Failed to finalize onboarding progress:', err);
    });
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
      pan_image: null,
      aadhar_number: '',
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
      accepts_cash: true,
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
    window.open(`/store/${generatedStoreId}`, '_blank');
  };

  const stepLabels = [
    'Restaurant information',
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
      <div className="h-screen bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden">
        {/* Top Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="GatiMitra" className="h-9 w-auto object-contain" />
              <div>
                <h1 className="text-lg font-bold text-slate-800">Registration Complete</h1>
                <div className="text-xs text-slate-600">
                  Store successfully registered with ID: <span className="font-bold text-emerald-700">{generatedStoreId}</span>
                </div>
              </div>
            </div>
            
            <div className="px-3 py-1 bg-emerald-100 text-emerald-800 text-sm font-medium rounded-full">
              ✓ Completed
            </div>
          </div>
        </div>
        
        {/* Success Content */}
        <div className="h-[calc(100vh-64px)] p-4 flex items-center justify-center">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="p-8">
              {/* Success Icon */}
              <div className="flex justify-center mb-6">
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center">
                  <svg className="w-10 h-10 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              
              {/* Success Message */}
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-slate-800 mb-3">Store Successfully Registered!</h2>
                <p className="text-slate-600">
                  Your store has been registered successfully with all documents verified.
                </p>
              </div>
              
              {/* Store ID Card */}
              <div className="bg-gradient-to-r from-indigo-50 to-violet-50 rounded-xl p-6 mb-8 border border-indigo-200">
                <div className="text-center">
                  <div className="text-sm font-medium text-slate-600 mb-2">Your Store ID</div>
                  <div className="text-4xl font-bold text-indigo-700 mb-3 font-mono tracking-wider">
                    {generatedStoreId}
                  </div>
                  <p className="text-sm text-slate-600">
                    This is your unique Store ID. Please save it for future reference.
                  </p>
                </div>
              </div>
              
              {/* Information Box */}
              <div className="bg-slate-50 rounded-lg p-4 mb-8">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="text-sm text-slate-700">
                      Your Store ID (<span className="font-bold">{generatedStoreId}</span>) has been generated and assigned to your store. 
                      You can use this ID for all future references, orders, and communications.
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={handleViewStore}
                  className="flex-1 px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  View Your Store
                </button>
                
                <button
                  onClick={handleRegisterNewStore}
                  className="flex-1 px-6 py-3 border-2 border-indigo-200 text-indigo-700 font-medium rounded-lg hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Register New Store
                </button>
              </div>
              
              {/* Additional Info */}
              <div className="mt-8 pt-6 border-t border-slate-200 text-center">
                <p className="text-sm text-slate-500">
                  Need help? Contact support at <span className="text-indigo-600">support@store.com</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Top Header - extra right padding so fixed Help button doesn't cover Logout */}
      <div className="bg-white border-b border-slate-200 px-6 pr-28 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="GatiMitra" className="h-9 w-auto object-contain" />
            <div>
              <h1 className="text-lg font-bold text-slate-800">Register New Store</h1>
              {parentInfo && (
                <div className="text-xs text-slate-600">
                  Parent: <span className="font-semibold text-indigo-700">{parentInfo.name}</span>
                  <span className="text-slate-500 ml-1">(PID: {parentInfo.parent_merchant_id})</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                window.location.href = '/auth/post-login';
              }}
              className="text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-100"
            >
              ← All Stores
            </button>
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1 rounded-lg">
              <div className="flex items-center">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((stepNum) => (
                  <div key={stepNum} className="flex items-center">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold
                      ${stepNum === step ? 'bg-indigo-600 text-white ring-2 ring-indigo-300' : 
                        stepNum < step ? 'bg-emerald-500 text-white' : 'bg-slate-300 text-slate-500'}`}>
                      {stepNum}
                    </div>
                    {stepNum < 9 && (
                      <div className={`w-2 sm:w-4 h-0.5 mx-0.5 sm:mx-1 ${stepNum < step ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    )}
                  </div>
                ))}
              </div>
              <div className="ml-2 text-xs font-medium text-slate-700">
                Step {step} of 9
              </div>
            </div>
            <div className="hidden xl:block text-xs text-slate-600 bg-slate-50 px-3 py-1 rounded-lg border border-slate-200">
              {stepLabels[step - 1]}
              </div>
            <button
              type="button"
              onClick={() => setShowLogoutConfirm(true)}
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

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

      {/* Main Content - no top padding for steps 7–9 so sub-nav (Back, title) touches main header */}
      <div className={`h-[calc(100vh-64px)] pb-24 overflow-y-auto ${step >= 7 && step <= 9 ? "pt-0 px-2 sm:px-4" : "p-4"}`}>
        {/* Step 1: Basic Store Information */}
        {step === 1 && (
          <div className="min-h-full flex items-start justify-center">
            <div className="w-full max-w-2xl bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="p-6">
                <div className="flex items-center gap-2 mb-6">
                  <div className="p-2 bg-indigo-50 rounded-lg">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h1m0 0h-1m1 0v4m-5-9h10l1 7H4l1-7z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-slate-800">Basic Store Information</h2>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Store Name *
                      </label>
                      <input
                        type="text"
                        name="store_name"
                        value={formData.store_name}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        placeholder="Enter store name"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Owner Full Name *
                      </label>
                      <input
                        type="text"
                        name="owner_full_name"
                        value={formData.owner_full_name}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        placeholder="Owner legal full name"
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Display Name
                      </label>
                      <input
                        type="text"
                        name="store_display_name"
                        value={formData.store_display_name}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        placeholder="Customer facing name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Legal Business Name
                      </label>
                      <input
                        type="text"
                        name="legal_business_name"
                        value={formData.legal_business_name}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        placeholder="Registered legal name"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Store Type *
                      </label>
                      <select
                        name="store_type"
                        value={formData.store_type}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        required
                      >
                        <option value="RESTAURANT">Restaurant</option>
                        <option value="CAFE">Cafe</option>
                        <option value="BAKERY">Bakery</option>
                        <option value="CLOUD_KITCHEN">Cloud Kitchen</option>
                        <option value="GROCERY">Grocery</option>
                        <option value="PHARMA">Pharma</option>
                        <option value="STATIONERY">Stationery</option>
                        <option value="OTHERS">Others</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Store Email *
                      </label>
                      <input
                        type="email"
                        name="store_email"
                        value={formData.store_email}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        placeholder="store@example.com"
                        required
                      />
                    </div>
                  </div>
                  
                  {/* Custom Store Type Field - Only shown when OTHERS is selected */}
                  {formData.store_type === 'OTHERS' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Custom Store Type *
                      </label>
                      <input
                        type="text"
                        name="custom_store_type"
                        value={formData.custom_store_type}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 text-sm border-2 border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        placeholder="Please specify your store type (e.g., Clothing Store, Electronics, etc.)"
                        required
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Please specify what type of store you are registering
                      </p>
                    </div>
                  )}
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Phone Numbers (comma separated)
                    </label>
                    <input
                      type="text"
                      name="store_phones"
                      value={storePhonesInput}
                      onChange={handleInputChange}
                      placeholder="+911234567890, +919876543210"
                      className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Example: +911234567890, +919876543210
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Store Description
                    </label>
                    <textarea
                      name="store_description"
                      value={formData.store_description}
                      onChange={handleInputChange}
                      rows={3}
                      className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                      placeholder="Describe your store, specialties, etc."
                    />
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
            <div className="w-full xl:w-2/5 h-auto xl:h-full">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full overflow-hidden">
                <div className="p-5 h-full overflow-y-auto">
                  <div className="flex items-center gap-2 mb-5">
                    <div className="p-2 bg-indigo-50 rounded-lg">
                      <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <h2 className="text-lg font-bold text-slate-800">Store Location</h2>
                  </div>
                  <div className="space-y-2">
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
                          <button
                            type="button"
                            onClick={handleUseCurrentLocation}
                            disabled={isFetchingCurrentLocation}
                            className="px-3 py-2 text-sm border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 disabled:opacity-50 font-medium whitespace-nowrap"
                          >
                            {isFetchingCurrentLocation ? 'Locating...' : 'Use current location'}
                          </button>
                        </div>
                        {locationNotice && (
                          <div className="mt-2 text-xs rounded-lg px-2.5 py-1.5 border border-amber-200 bg-amber-50 text-amber-700">
                            {locationNotice}
                          </div>
                        )}
                        {searchResults.length > 0 && (
                          <div className="absolute z-50 mt-1 w-full border border-slate-200 rounded-lg bg-white shadow-lg max-h-40 overflow-y-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
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
                    <div className="grid grid-cols-2 gap-3">
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
                    <div className="grid grid-cols-2 gap-3">
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
                    <div className="grid grid-cols-2 gap-3">
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
                    <div className="border border-slate-200 rounded-xl p-4 bg-gradient-to-r from-indigo-50 to-white">
                      <div className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                        GPS Coordinates
                      </div>
                      <div className="grid grid-cols-2 gap-3">
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
                  </div>
                </div>
              </div>
            </div>
            {/* Right Side - Map */}
            <div className="w-full xl:w-3/5 h-[360px] sm:h-[420px] xl:h-full">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full overflow-hidden">
                <div className="p-5 h-full flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-rose-50 rounded-lg">
                        <svg className="w-5 h-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                      </div>
                      <h3 className="font-bold text-slate-800">Location Map</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-1">
                        <button
                          type="button"
                          onClick={() => setMapProvider('mapbox')}
                          className={`px-2.5 py-1 text-xs rounded-md transition ${
                            mapProvider === 'mapbox'
                              ? 'bg-indigo-600 text-white'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          Mapbox
                        </button>
                        <button
                          type="button"
                          onClick={() => setMapProvider('leaflet')}
                          className={`px-2.5 py-1 text-xs rounded-md transition ${
                            mapProvider === 'leaflet'
                              ? 'bg-indigo-600 text-white'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          Leaflet
                        </button>
                      </div>
                      <div className={`px-3 py-1 text-xs font-medium rounded-full ${formData.latitude ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {formData.latitude ? '📍 Location Set' : '📍 Search to set location'}
                      </div>
                    </div>
                  </div>
                  {mapProvider === 'mapbox' && !mapboxToken && (
                    <div className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Mapbox token not found. Add <span className="font-mono">NEXT_PUBLIC_MAPBOX_TOKEN</span> in
                      <span className="font-mono"> .env.local</span> to use Mapbox tile mode.
                    </div>
                  )}
                  <div className="flex-1 rounded-lg overflow-hidden border border-slate-300">
                    <StoreLocationMap
                      ref={mapRef}
                      latitude={formData.latitude}
                      longitude={formData.longitude}
                      mapboxToken={mapboxToken}
                      provider={mapProvider}
                      onLocationChange={(lat, lng) =>
                        setFormData((prev) => ({ ...prev, latitude: lat, longitude: lng }))
                      }
                      onMapClick={handleMapClick}
                    />
                  </div>
                  <div className="mt-4 text-xs text-slate-600">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-rose-500 rounded-full"></div>
                        <span>Drag marker or click on map to set location</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <svg className="w-3 h-3 text-indigo-500" fill="currentColor" viewBox="0 0 20 20">
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
        {step === 3 && (
          <div className="h-full flex items-start justify-center">
            <div className="w-full max-w-6xl h-full overflow-y-auto rounded-2xl bg-white shadow-sm border border-slate-200 p-4 sm:p-6">
              <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-100">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-slate-800">Delivery Menu Upload</h2>
                    <p className="text-xs sm:text-sm text-slate-500">Upload only menu images or one CSV/Excel file. Manual entry will be enabled after verification.</p>
                  </div>
                </div>
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => setMenuUploadMode('IMAGE')}
                    className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition ${
                      menuUploadMode === 'IMAGE' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                    }`}
                  >
                    Menu Images
                  </button>
                  <button
                    type="button"
                    onClick={() => setMenuUploadMode('CSV')}
                    className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition ${
                      menuUploadMode === 'CSV' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                    }`}
                  >
                    CSV / Excel
                  </button>
                </div>
              </div>

              {menuUploadError && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs sm:text-sm text-amber-700">
                  {menuUploadError}
                </div>
              )}

              {menuUploadMode === 'IMAGE' ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsImageDragActive(true);
                  }}
                  onDragLeave={() => setIsImageDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsImageDragActive(false);
                    handleMenuImageUpload(Array.from(e.dataTransfer.files || []));
                  }}
                  className={`rounded-2xl border-2 border-dashed p-6 sm:p-8 transition ${
                    isImageDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-slate-50'
                  }`}
                >
                  <input
                    ref={imageUploadInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    multiple
                    className="hidden"
                    onChange={(e) => handleMenuImageUpload(Array.from(e.target.files || []))}
                  />
                  <div className="text-center">
                    <p className="text-sm sm:text-base font-semibold text-slate-800">Drag & drop menu images here</p>
                    <p className="mt-1 text-xs sm:text-sm text-slate-500">JPG / PNG / WEBP, up to 5 MB per image</p>
                    <button
                      type="button"
                      onClick={() => imageUploadInputRef.current?.click()}
                      className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                    >
                      Upload images
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsCsvDragActive(true);
                  }}
                  onDragLeave={() => setIsCsvDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsCsvDragActive(false);
                    const dropped = Array.from(e.dataTransfer.files || [])[0] || null;
                    handleMenuSpreadsheetUpload(dropped);
                  }}
                  className={`rounded-2xl border-2 border-dashed p-6 sm:p-8 transition ${
                    isCsvDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-slate-50'
                  }`}
                >
                  <input
                    ref={csvUploadInputRef}
                    type="file"
                    accept=".csv,.xls,.xlsx"
                    className="hidden"
                    onChange={(e) => handleMenuSpreadsheetUpload((e.target.files || [])[0] || null)}
                  />
                  <div className="text-center">
                    <p className="text-sm sm:text-base font-semibold text-slate-800">Drag & drop CSV / Excel here</p>
                    <p className="mt-1 text-xs sm:text-sm text-slate-500">Accepted: .csv, .xls, .xlsx</p>
                    <button
                      type="button"
                      onClick={() => csvUploadInputRef.current?.click()}
                      className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                    >
                      Upload spreadsheet
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-6 grid grid-cols-1 gap-3">
                {menuUploadMode === 'IMAGE' && (menuImageFiles.length > 0 || menuUploadedImageUrls.length > 0) && (
                  <>
                    <div className="text-sm font-semibold text-slate-700">Selected images</div>
                    {menuImageFiles.map((file, idx) => (
                      <div key={`${file.name}-${idx}`} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 bg-white">
                        <div className="min-w-0">
                          <p className="text-sm text-slate-700 truncate">{file.name}</p>
                          <p className="text-xs text-slate-500">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeMenuImage(idx)}
                          className="text-xs text-rose-600 hover:text-rose-700"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    {menuImageFiles.length === 0 && menuUploadedImageUrls.map((url, idx) => (
                      <div key={`${url}-${idx}`} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 bg-white">
                        <div className="min-w-0">
                          <p className="text-sm text-slate-700 truncate">Uploaded menu image {idx + 1}</p>
                          <p className="text-xs text-emerald-600">Saved to R2</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeMenuImage(idx)}
                          className="text-xs text-rose-600 hover:text-rose-700"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </>
                )}
                {menuUploadMode === 'CSV' && (menuSpreadsheetFile || menuUploadedSpreadsheetUrl) && (
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 bg-white">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-700 truncate">
                        {menuSpreadsheetFile ? menuSpreadsheetFile.name : 'Uploaded spreadsheet'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {menuSpreadsheetFile
                          ? `${(menuSpreadsheetFile.size / (1024 * 1024)).toFixed(2)} MB`
                          : 'Saved to R2'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuSpreadsheetFile(null);
                        setMenuUploadedSpreadsheetUrl(null);
                      }}
                      className="text-xs text-rose-600 hover:text-rose-700"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Store Documents */}
        {step === 4 && (
          <div className="w-full h-full">
            <CombinedDocumentStoreSetup
              initialDocuments={documents}
              onDocumentComplete={handleDocumentUploadComplete}
              onBack={prevStep}
              actionLoading={actionLoading}
              businessType={formData.store_type === 'OTHERS' ? formData.custom_store_type : formData.store_type}
              storeType={formData.store_type}
            />
          </div>
        )}

        {/* Step 5: Store Configuration */}
        {step === 5 && (
          <div className="w-full h-full">
            <CombinedDocumentStoreSetup
              initialStoreSetup={storeSetup}
              onStoreSetupComplete={handleStoreSetupComplete}
              onBack={async () => {
                setActionLoading(true);
                try {
                  await saveProgress({ currentStep: 5, nextStep: 4, markStepComplete: false, formDataPatch: getStepPatch(5) });
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
              }}
              parentInfo={parentInfo}
              onBack={() => setStep(5)}
              onContinueToPlans={async () => {
                setActionLoading(true);
                try {
                  await saveProgress({ currentStep: 6, nextStep: 7, markStepComplete: true, formDataPatch: {} });
                  setStep(7);
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
              onBack={async () => {
                setActionLoading(true);
                try {
                  await saveProgress({ currentStep: 7, nextStep: 6, markStepComplete: false, formDataPatch: { step7: { selectedPlanId } } });
                  setStep(6);
                } finally {
                  setActionLoading(false);
                }
              }}
              onContinue={async () => {
                setActionLoading(true);
                try {
                  await saveProgress({ currentStep: 7, nextStep: 8, markStepComplete: true, formDataPatch: { step7: { selectedPlanId } } });
                  setStep(8);
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
              logoUrl={typeof process.env.NEXT_PUBLIC_PLATFORM_LOGO_URL === "string" ? process.env.NEXT_PUBLIC_PLATFORM_LOGO_URL : undefined}
              onBack={async () => {
                setActionLoading(true);
                try {
                  await saveProgress({ currentStep: 8, nextStep: 7, markStepComplete: false, formDataPatch: {} });
                  setStep(7);
                } finally {
                  setActionLoading(false);
                }
              }}
              onContinue={async (text) => {
                setContractTextForSignature(text);
                setActionLoading(true);
                try {
                  await saveProgress({ currentStep: 8, nextStep: 9, markStepComplete: true, formDataPatch: {} });
                  setStep(9);
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
              step1={formData}
              step2={formData}
              documents={documents}
              storeSetup={storeSetup}
              menuData={{
                menuUploadMode,
                menuImageFiles: [],
                menuSpreadsheetFile: null,
                menuImageUrls: menuUploadedImageUrls,
                menuSpreadsheetUrl: menuUploadedSpreadsheetUrl,
              }}
              parentInfo={parentInfo}
              agreementTemplate={agreementTemplate}
              defaultAgreementText={agreementTemplate?.content_markdown || MERCHANT_PARTNERSHIP_TERMS}
              contractTextForPdf={contractTextForSignature}
              onBack={async () => {
                setActionLoading(true);
                try {
                  await saveProgress({ currentStep: 9, nextStep: 8, markStepComplete: false, formDataPatch: {} });
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

      {/* Navigation Buttons - Bottom Right */}
      {!showSuccess && step < 4 && (
        <div className="fixed bottom-4 right-6 flex items-center gap-3">
          {step > 1 && (
            <button
              type="button"
              onClick={prevStep}
              disabled={actionLoading}
              className="px-5 py-2.5 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium shadow-sm hover:shadow transition-all disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              ← Previous
            </button>
          )}
          
          <button
            type="button"
            onClick={nextStep}
            disabled={!validateStep(step) || actionLoading}
            className="px-6 py-2.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            {actionLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (step === 2 || step === 3) ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            ) : null}
            {actionLoading ? (step === 2 || step === 3 ? 'Saving...' : 'Loading...') : (step === 2 || step === 3 ? 'Save & Continue' : 'Continue')}
          </button>
        </div>
      )}
    </div>
  );
}

export default StoreRegistrationForm;