"use client";

import { useState, useRef, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';

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
  fssai_expiry_date: string;
  drug_license_expiry_date: string;
  pharmacist_expiry_date: string;
  other_document_type: string;
  other_document_number: string;
  other_document_name: string;
  other_document_file: File | null;
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
    upi_qr_file?: File | null;
  };
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

interface CombinedComponentProps {
  initialDocuments?: Partial<DocumentData> | null;
  initialStoreSetup?: Partial<StoreSetupData> | null;
  onDocumentComplete?: (documents: DocumentData) => void;
  onStoreSetupComplete?: (storeSetup: StoreSetupData) => void;
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
};

const CombinedDocumentStoreSetup: React.FC<CombinedComponentProps> = ({
  initialDocuments,
  initialStoreSetup,
  onDocumentComplete,
  onStoreSetupComplete,
  onBack,
  actionLoading = false,
  businessType = 'RESTAURANT',
  storeType = '',
  initialStep = 'documents',
}) => {
  const showOtherDocs = (storeType || '').toUpperCase() === 'OTHERS';
  const [currentStep, setCurrentStep] = useState<'documents' | 'store-setup'>(
    typeof window !== 'undefined' && localStorage.getItem('registerStoreStep')
      ? (localStorage.getItem('registerStoreStep') as 'documents' | 'store-setup')
      : initialStep
  );
  const [activeSection, setActiveSection] = useState<'pan' | 'aadhar' | 'optional' | 'bank' | 'other'>(
    typeof window !== 'undefined' && localStorage.getItem('registerStoreSection')
      ? (localStorage.getItem('registerStoreSection') as 'pan' | 'aadhar' | 'optional' | 'bank' | 'other')
      : 'pan'
  );
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');
  const [validationType, setValidationType] = useState<'warning' | 'error' | 'info'>('warning');
  
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

  const [storeSetup, setStoreSetup] = useState<StoreSetupData>(defaultStoreSetupData);
  const [allCuisines, setAllCuisines] = useState<string[]>([]);
  const [cuisineSearch, setCuisineSearch] = useState('');

  // Sync from parent when navigating back so saved data is shown
  useEffect(() => {
    if (initialDocuments && typeof initialDocuments === 'object') {
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
        if (typeof initialDocuments.expiry_date === 'string') next.expiry_date = initialDocuments.expiry_date;
        if (typeof initialDocuments.fssai_expiry_date === 'string') next.fssai_expiry_date = initialDocuments.fssai_expiry_date ?? '';
        if (typeof initialDocuments.drug_license_expiry_date === 'string') next.drug_license_expiry_date = initialDocuments.drug_license_expiry_date ?? '';
        if (typeof initialDocuments.pharmacist_expiry_date === 'string') next.pharmacist_expiry_date = initialDocuments.pharmacist_expiry_date ?? '';
        if (typeof initialDocuments.other_document_type === 'string') next.other_document_type = initialDocuments.other_document_type ?? '';
        if (typeof initialDocuments.other_document_number === 'string') next.other_document_number = initialDocuments.other_document_number ?? '';
        if (typeof initialDocuments.other_document_name === 'string') next.other_document_name = initialDocuments.other_document_name ?? '';
        if (typeof initialDocuments.other_document_expiry_date === 'string') next.other_document_expiry_date = initialDocuments.other_document_expiry_date ?? '';
        if (initialDocuments.bank && typeof initialDocuments.bank === 'object') {
          next.bank = { ...(prev.bank || {}), ...initialDocuments.bank };
        }
        return next;
      });
    }
  }, [initialDocuments]);

  useEffect(() => {
    if (initialStoreSetup && typeof initialStoreSetup === 'object') {
      setStoreSetup((prev) => ({
        ...prev,
        cuisine_types: Array.isArray(initialStoreSetup.cuisine_types) ? initialStoreSetup.cuisine_types : prev.cuisine_types,
        food_categories: Array.isArray(initialStoreSetup.food_categories) ? initialStoreSetup.food_categories : prev.food_categories,
        avg_preparation_time_minutes: typeof initialStoreSetup.avg_preparation_time_minutes === 'number' ? initialStoreSetup.avg_preparation_time_minutes : prev.avg_preparation_time_minutes,
        min_order_amount: typeof initialStoreSetup.min_order_amount === 'number' ? initialStoreSetup.min_order_amount : prev.min_order_amount,
        delivery_radius_km: typeof initialStoreSetup.delivery_radius_km === 'number' ? initialStoreSetup.delivery_radius_km : prev.delivery_radius_km,
        is_pure_veg: typeof initialStoreSetup.is_pure_veg === 'boolean' ? initialStoreSetup.is_pure_veg : prev.is_pure_veg,
        accepts_online_payment: typeof initialStoreSetup.accepts_online_payment === 'boolean' ? initialStoreSetup.accepts_online_payment : prev.accepts_online_payment,
        accepts_cash: typeof initialStoreSetup.accepts_cash === 'boolean' ? initialStoreSetup.accepts_cash : prev.accepts_cash,
        logo_preview: typeof initialStoreSetup.logo_preview === 'string' ? initialStoreSetup.logo_preview : (typeof (initialStoreSetup as any).logo_url === 'string' ? (initialStoreSetup as any).logo_url : prev.logo_preview),
        banner_preview: typeof initialStoreSetup.banner_preview === 'string' ? initialStoreSetup.banner_preview : (typeof (initialStoreSetup as any).banner_url === 'string' ? (initialStoreSetup as any).banner_url : prev.banner_preview),
        gallery_previews: Array.isArray(initialStoreSetup.gallery_previews) ? initialStoreSetup.gallery_previews : (Array.isArray((initialStoreSetup as any).gallery_image_urls) ? (initialStoreSetup as any).gallery_image_urls : prev.gallery_previews),
        store_hours: initialStoreSetup.store_hours && typeof initialStoreSetup.store_hours === 'object'
          ? { ...prev.store_hours, ...initialStoreSetup.store_hours } as StoreSetupData['store_hours']
          : prev.store_hours,
      }));
    }
  }, [initialStoreSetup]);

  const fileInputRefs = {
    pan: useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement | null>,
    aadharFront: useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement | null>,
    aadharBack: useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement | null>,
    fssai: useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement | null>,
    gst: useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement | null>,
    drugLicense: useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement | null>,
    pharmacistCert: useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement | null>,
    pharmacyCouncil: useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement | null>,
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

  const handleDocumentInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setDocuments(prev => {
      return name === 'pan_number'
        ? { ...prev, [name]: value.toUpperCase() }
        : { ...prev, [name]: value };
    });
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

  const validateDocumentSection = () => {
    if (activeSection === 'pan') {
      return !!(documents.pan_holder_name?.trim() && documents.pan_number && documents.pan_image);
    } else if (activeSection === 'aadhar') {
      return !!(documents.aadhar_holder_name?.trim() && documents.aadhar_number && documents.aadhar_front && documents.aadhar_back);
    } else if (activeSection === 'optional') {
      if (isPharmaBusiness()) {
        return !!(documents.drug_license_number && documents.drug_license_image && documents.drug_license_expiry_date) &&
               !!(documents.pharmacist_registration_number && documents.pharmacist_certificate && documents.pharmacy_council_registration && documents.pharmacist_expiry_date);
      }
      if (isFoodBusiness()) {
        return !!(documents.fssai_number && documents.fssai_image && documents.fssai_expiry_date);
      }
      // Other Document: always optional
      return true;
    } else if (activeSection === 'bank') {
      const bank = documents.bank || {};
      const method = bank.payout_method || 'bank';
      if (method === 'bank') {
        return !!(bank.account_holder_name && bank.account_number && bank.ifsc_code && bank.bank_name && bank.bank_proof_type && bank.bank_proof_file);
      }
      return !!(bank.upi_id && bank.upi_qr_file);
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
      setValidationMessage('Please complete payout details: for Bank upload passbook/cheque/statement and fill account details; for UPI enter UPI ID and upload QR screenshot.');
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

  const handleDocumentSaveAndContinue = () => {
    if (!validateDocumentSection()) {
      showDocumentValidationError(activeSection);
      return;
    }

    if (activeSection === 'pan') {
      setActiveSection('aadhar');
    } else if (activeSection === 'aadhar') {
      setActiveSection('optional');
    } else if (activeSection === 'optional') {
      setActiveSection('bank');
    } else if (activeSection === 'bank') {
      if (showOtherDocs) setActiveSection('other');
      else {
        if (onDocumentComplete) onDocumentComplete(documents);
      }
    } else if (activeSection === 'other') {
      let shouldProceed = true;
      if (isPharmaBusiness()) {
        if (!documents.drug_license_number || !documents.drug_license_image || !documents.drug_license_expiry_date ||
            !documents.pharmacist_registration_number || !documents.pharmacist_certificate || 
            !documents.pharmacy_council_registration || !documents.pharmacist_expiry_date) {
          setValidationMessage('All pharma documents are required. Please complete all fields.');
          setValidationType('error');
          setShowValidationModal(true);
          shouldProceed = false;
        }
      } else if (isFoodBusiness()) {
        if (!documents.fssai_number || !documents.fssai_image || !documents.fssai_expiry_date) {
          setValidationMessage('FSSAI certificate is required for food businesses. Please complete this section.');
          setValidationType('error');
          setShowValidationModal(true);
          shouldProceed = false;
        }
      }
      if (shouldProceed) {
        setShowValidationModal(false);
        if (onDocumentComplete) {
          onDocumentComplete(documents);
        }
      }
    }
  };

  const handleStoreSetupChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    const newForm = {
      ...storeSetup,
      [name]: type === "checkbox" ? checked : (type === "number" ? parseFloat(value) : value),
    };
    setStoreSetup(newForm);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'logo' | 'banner') => {
    const file = e.target.files?.[0] || null;
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const newForm = {
          ...storeSetup,
          [field]: file,
          [`${field}_preview`]: reader.result as string,
        };
        setStoreSetup(newForm);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGalleryImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    const previews: string[] = [];
    let loaded = 0;
    if (files.length === 0) {
      const newForm = { ...storeSetup, gallery_images: [], gallery_previews: [] };
      setStoreSetup(newForm);
      return;
    }
    files.forEach((file, idx) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        previews[idx] = reader.result as string;
        loaded++;
        if (loaded === files.length) {
          const newForm = { ...storeSetup, gallery_images: files, gallery_previews: previews };
          setStoreSetup(newForm);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleStoreHoursChange = (
    day: string,
    field: 'closed' | 'slot1_open' | 'slot1_close' | 'slot2_open' | 'slot2_close',
    value: string | boolean
  ) => {
    const newForm = {
      ...storeSetup,
      store_hours: {
        ...storeSetup.store_hours,
        [day]: {
          ...storeSetup.store_hours[day as keyof typeof storeSetup.store_hours],
          [field]: value
        }
      }
    };
    setStoreSetup(newForm);
  };

  const applyHoursPreset = (preset: 'same_as_monday' | 'lunch_dinner' | 'full_day' | 'weekday_weekend') => {
    const hours = { ...storeSetup.store_hours };
    if (preset === 'same_as_monday') {
      const monday = { ...hours.monday };
      const nextHours = Object.keys(hours).reduce((acc, day) => {
        acc[day as keyof typeof hours] = { ...monday };
        return acc;
      }, { ...hours });
      setStoreSetup((prev) => ({ ...prev, store_hours: nextHours }));
      return;
    }

    if (preset === 'lunch_dinner') {
      const nextHours = Object.keys(hours).reduce((acc, day) => {
        acc[day as keyof typeof hours] = {
          closed: false,
          slot1_open: '11:00',
          slot1_close: '15:00',
          slot2_open: '18:00',
          slot2_close: '23:00',
        };
        return acc;
      }, { ...hours });
      setStoreSetup((prev) => ({ ...prev, store_hours: nextHours }));
      return;
    }

    if (preset === 'full_day') {
      const nextHours = Object.keys(hours).reduce((acc, day) => {
        acc[day as keyof typeof hours] = {
          closed: false,
          slot1_open: '00:00',
          slot1_close: '23:59',
          slot2_open: '',
          slot2_close: '',
        };
        return acc;
      }, { ...hours });
      setStoreSetup((prev) => ({ ...prev, store_hours: nextHours }));
      return;
    }

    const nextHours = { ...hours };
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
    setStoreSetup((prev) => ({ ...prev, store_hours: nextHours }));
  };

  const timeToMinutes = (value: string) => {
    const [h, m] = (value || '').split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  };

  const validateStoreHours = (): string | null => {
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
        const res = await fetch('/data/cuisines.json');
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data)) {
          setAllCuisines(data.filter((item) => typeof item === 'string'));
        }
      } catch (err) {
        console.error('Failed to load cuisines:', err);
      }
    };
    loadCuisines();
  }, []);

  const filteredCuisines = useMemo(() => {
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
      return { ...prev, cuisine_types: [...prev.cuisine_types, cuisine] };
    });
  };

  const handleStoreSetupSaveAndContinue = () => {
    const hoursError = validateStoreHours();
    if (hoursError) {
      setValidationType('error');
      setValidationMessage(hoursError);
      setShowValidationModal(true);
      return;
    }
    if (onStoreSetupComplete) {
      onStoreSetupComplete(storeSetup);
    }
  };

  const triggerFileInput = (ref: React.RefObject<HTMLInputElement | null>) => {
    if (ref.current) {
      ref.current.click();
    }
  };

  const removeFile = (fieldName: keyof DocumentData) => {
    setDocuments(prev => ({ ...prev, [fieldName]: null }));
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

  const renderValidationModal = () => (
    showValidationModal && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-md w-full border border-slate-200">
          <div className={`flex items-center gap-3 mb-4 ${validationType === 'error' ? 'text-rose-600' : 'text-amber-600'}`}>
            {validationType === 'error' ? (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
            )}
            <h3 className="text-lg font-semibold text-slate-900">
              {validationType === 'error' ? 'Error' : 'Warning'}
            </h3>
          </div>
          <p className="text-slate-600 text-sm sm:text-base mb-6">{validationMessage}</p>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3">
            {validationType === 'warning' ? (
              <>
                <button
                  onClick={() => handleModalAction(false)}
                  className="px-4 py-2.5 text-sm font-medium rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleModalAction(true)}
                  className="px-4 py-2.5 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  Proceed Anyway
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setShowValidationModal(false)}
                  className="px-4 py-2.5 text-sm font-medium rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowValidationModal(false);
                    handleDocumentSaveAndContinue();
                  }}
                  className="px-4 py-2.5 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  Try Again
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  );

  const renderPanSection = () => (
    <div className="space-y-3">
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
            value={documents.pan_holder_name}
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
          <input
            type="text"
            name="pan_number"
            value={documents.pan_number}
            onChange={handleDocumentInputChange}
            placeholder="ABCDE1234F"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white font-medium tracking-wider uppercase"
            required
            maxLength={10}
            pattern="[A-Z]{5}[0-9]{4}[A-Z]{1}"
            title="Format: ABCDE1234F"
            style={{ textTransform: 'uppercase' }}
            autoComplete="off"
          />
          <p className="text-xs text-slate-500 mt-1.5">10 characters, auto uppercase</p>
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
          {!documents.pan_image ? (
            <button
              type="button"
              onClick={() => triggerFileInput(fileInputRefs.pan)}
              className="w-full rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/50 p-4 text-center hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
            >
              <svg className="w-10 h-10 text-slate-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm font-medium text-slate-600">Upload PAN Card Image</p>
              <p className="text-xs text-slate-500 mt-1">JPG, PNG or PDF · Max 5MB</p>
            </button>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{documents.pan_image?.name}</p>
                    <p className="text-xs text-slate-500">
                      {documents.pan_image ? ((documents.pan_image.size / 1024 / 1024).toFixed(2) + ' MB') : ''}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => triggerFileInput(fileInputRefs.pan)}
                    className="rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    onClick={() => removeFile('pan_image')}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                    title="Remove"
                  >
                    <span className="sr-only">Remove</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            </div>
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
            <p className="text-sm font-semibold text-amber-900">Important</p>
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
            <p className="text-sm font-semibold text-indigo-900">Aadhar Card (Mandatory)</p>
            <p className="text-xs text-indigo-700 mt-0.5">Identity verification. Both front and back required.</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Name as on Aadhaar <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            name="aadhar_holder_name"
            value={documents.aadhar_holder_name}
            onChange={handleDocumentInputChange}
            placeholder="Full name as on Aadhaar card"
            className="w-full px-4 py-3 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
            autoComplete="name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Aadhar Number <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            name="aadhar_number"
            value={documents.aadhar_number}
            onChange={handleDocumentInputChange}
            placeholder="1234 5678 9012"
            className="w-full px-4 py-3 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
            required
            maxLength={12}
            pattern="[0-9]{12}"
            title="12-digit Aadhar number"
          />
          <p className="text-xs text-slate-500 mt-1.5">12 digits, no spaces</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Front Side <span className="text-rose-500">*</span>
            </label>
            <input type="file" ref={fileInputRefs.aadharFront} onChange={(e) => handleFileChange(e, 'aadhar_front')} accept=".jpg,.jpeg,.png,.pdf" className="hidden" />
            {!documents.aadhar_front ? (
              <button type="button" onClick={() => triggerFileInput(fileInputRefs.aadharFront)} className="w-full rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-6 text-center hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
                <svg className="w-10 h-10 text-slate-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <p className="text-sm font-medium text-slate-600">Upload Front</p>
                <p className="text-xs text-slate-500 mt-0.5">Photo & details</p>
              </button>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{documents.aadhar_front?.name}</p>
                      <p className="text-xs text-slate-500">Front</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => triggerFileInput(fileInputRefs.aadharFront)} className="rounded-lg border border-indigo-200 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50">Change</button>
                    <button type="button" onClick={() => removeFile('aadhar_front')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700" title="Remove"><span className="sr-only">Remove</span><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Back Side <span className="text-rose-500">*</span>
            </label>
            <input type="file" ref={fileInputRefs.aadharBack} onChange={(e) => handleFileChange(e, 'aadhar_back')} accept=".jpg,.jpeg,.png,.pdf" className="hidden" />
            {!documents.aadhar_back ? (
              <button type="button" onClick={() => triggerFileInput(fileInputRefs.aadharBack)} className="w-full rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-6 text-center hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
                <svg className="w-10 h-10 text-slate-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <p className="text-sm font-medium text-slate-600">Upload Back</p>
                <p className="text-xs text-slate-500 mt-0.5">Address side</p>
              </button>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{documents.aadhar_back?.name}</p>
                      <p className="text-xs text-slate-500">Back</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => triggerFileInput(fileInputRefs.aadharBack)} className="rounded-lg border border-indigo-200 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50">Change</button>
                    <button type="button" onClick={() => removeFile('aadhar_back')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700" title="Remove"><span className="sr-only">Remove</span><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      <div className="rounded-xl bg-amber-50/80 border border-amber-100 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-900">Important</p>
            <p className="text-xs text-amber-800 mt-0.5">Both sides must be clear and readable.</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderOptionalSection = () => (
    <div className="space-y-3">
      <div className={`rounded-lg border p-3 ${
        isFoodBusiness() ? 'bg-rose-50/80 border-rose-100' :
        isPharmaBusiness() ? 'bg-violet-50/80 border-violet-100' :
        'bg-amber-50/80 border-amber-100'
      }`}>
        <div className="flex items-start gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            isFoodBusiness() ? 'bg-rose-100 text-rose-600' :
            isPharmaBusiness() ? 'bg-violet-100 text-violet-600' :
            'bg-amber-100 text-amber-600'
          }`}>
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className={`text-sm font-semibold ${
              isFoodBusiness() ? 'text-rose-900' : isPharmaBusiness() ? 'text-violet-900' : 'text-amber-900'
            }`}>
              {isFoodBusiness() ? 'FSSAI Certificate (Mandatory)' : isPharmaBusiness() ? 'Pharma Documents (Mandatory)' : 'Optional Documents'}
            </p>
            <p className={`text-xs mt-0.5 ${
              isFoodBusiness() ? 'text-rose-700' : isPharmaBusiness() ? 'text-violet-700' : 'text-amber-800'
            }`}>
              {isFoodBusiness()
                ? `FSSAI license is mandatory for ${businessType.toLowerCase()} as per food safety regulations.`
                : isPharmaBusiness()
                ? 'Drug License and Pharmacist details mandatory for pharmacy as per drug regulations.'
                : 'Optional but recommended for verification and service access.'}
            </p>
          </div>
        </div>
      </div>
      
      {/* Pharma-specific Documents */}
      {isPharmaBusiness() && (
        <>
          {/* Drug License */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700 mb-1">
              Drug License Number <span className="text-red-500">*</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <input
                  type="text"
                  name="drug_license_number"
                  value={documents.drug_license_number}
                  onChange={handleDocumentInputChange}
                  placeholder="Enter Drug License Number"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  required
                />
                <p className="text-xs text-gray-500 mt-2">
                  Retail (Form 20/21) or Wholesale (Form 20B/21B) License
                </p>
              </div>
              <div className="flex items-start gap-3">
                <input
                  type="file"
                  ref={fileInputRefs.drugLicense}
                  onChange={(e) => handleFileChange(e, 'drug_license_image')}
                  accept=".jpg,.jpeg,.png,.pdf"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => triggerFileInput(fileInputRefs.drugLicense)}
                  className="px-3 py-2 text-sm border-2 border-dashed rounded-xl border-violet-300 text-violet-600 hover:border-violet-500 hover:text-violet-700 hover:bg-violet-50"
                >
                  {documents.drug_license_image ? 'Change File' : 'Upload Drug License'}
                </button>
                {documents.drug_license_image && (
                  <div className="flex-1">
                    <div className="flex items-center justify-between px-2 py-1 rounded-xl border border-emerald-200 bg-emerald-50/80">
                      <span className="text-xs text-gray-600 truncate max-w-[120px]">
                        {documents.drug_license_image?.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile('drug_license_image')}
                        className="text-red-500 hover:text-red-700 text-xs"
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Drug License Expiry Date */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700 mb-1">
              Drug License Expiry Date <span className="text-red-500">*</span>
            </h4>
            <div className="w-full md:w-1/2">
              <input
                type="date"
                name="drug_license_expiry_date"
                value={documents.drug_license_expiry_date}
                onChange={handleDocumentInputChange}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Drug license expiry date
              </p>
            </div>
          </div>

          {/* Pharmacist Registration Number */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700 mb-1">
              Pharmacist Registration Number <span className="text-red-500">*</span>
            </h4>
            <div className="w-full md:w-1/2">
              <input
                type="text"
                name="pharmacist_registration_number"
                value={documents.pharmacist_registration_number}
                onChange={handleDocumentInputChange}
                placeholder="Enter Pharmacist Registration Number"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                required
              />
              <p className="text-xs text-gray-500 mt-2">
                State Pharmacy Council Registration Number
              </p>
            </div>
          </div>

          {/* Pharmacist Certificate */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700 mb-1">
              Pharmacist Certificate <span className="text-red-500">*</span>
            </h4>
            <div className="flex items-start gap-3">
              <input
                type="file"
                ref={fileInputRefs.pharmacistCert}
                onChange={(e) => handleFileChange(e, 'pharmacist_certificate')}
                accept=".jpg,.jpeg,.png,.pdf"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => triggerFileInput(fileInputRefs.pharmacistCert)}
                className="px-3 py-2 text-sm border-2 border-dashed rounded-xl border-violet-300 text-violet-600 hover:border-violet-500 hover:text-violet-700 hover:bg-violet-50"
              >
                {documents.pharmacist_certificate ? 'Change File' : 'Upload Pharmacist Certificate'}
              </button>
              {documents.pharmacist_certificate && (
                <div className="flex-1">
                  <div className="flex items-center justify-between px-2 py-1 rounded-xl border border-emerald-200 bg-emerald-50/80">
                    <span className="text-xs text-gray-600 truncate max-w-[120px]">
                      {documents.pharmacist_certificate?.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile('pharmacist_certificate')}
                      className="text-red-500 hover:text-red-700 text-xs"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Pharmacist Expiry Date */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700 mb-1">
              Pharmacist Certificate Expiry Date <span className="text-red-500">*</span>
            </h4>
            <div className="w-full md:w-1/2">
              <input
                type="date"
                name="pharmacist_expiry_date"
                value={documents.pharmacist_expiry_date}
                onChange={handleDocumentInputChange}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Pharmacist certificate expiry date
              </p>
            </div>
          </div>

          {/* Pharmacy Council Registration */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700 mb-1">
              State Pharmacy Council Registration <span className="text-red-500">*</span>
            </h4>
            <div className="flex items-start gap-3">
              <input
                type="file"
                ref={fileInputRefs.pharmacyCouncil}
                onChange={(e) => handleFileChange(e, 'pharmacy_council_registration')}
                accept=".jpg,.jpeg,.png,.pdf"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => triggerFileInput(fileInputRefs.pharmacyCouncil)}
                className="px-3 py-2 text-sm border-2 border-dashed rounded-xl border-violet-300 text-violet-600 hover:border-violet-500 hover:text-violet-700 hover:bg-violet-50"
              >
                {documents.pharmacy_council_registration ? 'Change File' : 'Upload Council Registration'}
              </button>
              {documents.pharmacy_council_registration && (
                <div className="flex-1">
                  <div className="flex items-center justify-between px-2 py-1 rounded-xl border border-emerald-200 bg-emerald-50/80">
                    <span className="text-xs text-gray-600 truncate max-w-[120px]">
                      {documents.pharmacy_council_registration?.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile('pharmacy_council_registration')}
                      className="text-red-500 hover:text-red-700 text-xs"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <input
                type="text"
                name="fssai_number"
                value={documents.fssai_number}
                onChange={handleDocumentInputChange}
                placeholder="FSSAI License Number"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                required
              />
              <p className="text-xs text-gray-500 mt-2">
                Required for food businesses as per FSSAI regulations
              </p>
            </div>
            <div className="flex items-start gap-3">
              <input
                type="file"
                ref={fileInputRefs.fssai}
                onChange={(e) => handleFileChange(e, 'fssai_image')}
                accept=".jpg,.jpeg,.png,.pdf"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => triggerFileInput(fileInputRefs.fssai)}
                className="px-3 py-2 text-sm border-2 border-dashed rounded-xl border-rose-300 text-rose-600 hover:border-rose-500 hover:text-rose-700 hover:bg-rose-50"
              >
                {documents.fssai_image ? 'Change File' : 'Upload Certificate'}
              </button>
              {documents.fssai_image && (
                <div className="flex-1">
                  <div className="flex items-center justify-between px-2 py-1 rounded-xl border border-emerald-200 bg-emerald-50/80">
                    <span className="text-xs text-gray-600 truncate max-w-[120px]">
                      {documents.fssai_image?.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile('fssai_image')}
                      className="text-red-500 hover:text-red-700 text-xs"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                </div>
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
                value={documents.fssai_expiry_date}
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

      {/* GST Certificate (Optional) */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-700 mb-1">GST Certificate (Optional)</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <input
              type="text"
              name="gst_number"
              value={documents.gst_number}
              onChange={handleDocumentInputChange}
              placeholder="GST Number"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
            />
            <p className="text-xs text-gray-500 mt-2">Optional for non-GST businesses</p>
          </div>
          <div className="flex items-start gap-3">
            <input
              type="file"
              ref={fileInputRefs.gst}
              onChange={(e) => handleFileChange(e, 'gst_image')}
              accept=".jpg,.jpeg,.png,.pdf"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => triggerFileInput(fileInputRefs.gst)}
              className="px-3 py-2 text-sm border-2 border-dashed rounded-xl border-slate-300 text-slate-600 hover:border-indigo-500 hover:text-indigo-600 hover:bg-indigo-50"
            >
              {documents.gst_image ? 'Change File' : 'Upload Certificate'}
            </button>
            {documents.gst_image && (
              <div className="flex-1">
                <div className="flex items-center justify-between px-2 py-1 rounded-xl border border-emerald-200 bg-emerald-50/80">
                  <span className="text-xs text-gray-600 truncate max-w-[120px]">
                    {documents.gst_image?.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile('gst_image')}
                    className="text-red-500 hover:text-red-700 text-xs"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="rounded-xl bg-indigo-50/80 border border-indigo-100 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-indigo-900">Important</p>
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
      setDocuments(prev => ({ ...prev, bank: { ...(prev.bank || bank), [field]: value } }));
    };
    const setBankFile = (field: 'bank_proof_file' | 'upi_qr_file', file: File | null) => {
      setDocuments(prev => ({ ...prev, bank: { ...(prev.bank || bank), [field]: file } }));
    };
    const isBank = (bank.payout_method || 'bank') === 'bank';
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
                <input type="text" value={bank.account_holder_name} onChange={e => setBank('account_holder_name', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" placeholder="As per bank record" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Account number <span className="text-rose-500">*</span></label>
                <input type="text" value={bank.account_number} onChange={e => setBank('account_number', e.target.value.replace(/\D/g, '').slice(0, 18))} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white font-mono" placeholder="e.g. 123456789012" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">IFSC code <span className="text-rose-500">*</span></label>
                <input type="text" value={bank.ifsc_code} onChange={e => setBank('ifsc_code', e.target.value.toUpperCase().slice(0, 11))} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white font-mono uppercase" placeholder="e.g. SBIN0001234" style={{ textTransform: 'uppercase' }} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Bank name <span className="text-rose-500">*</span></label>
                <input type="text" value={bank.bank_name} onChange={e => setBank('bank_name', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" placeholder="e.g. State Bank of India" />
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
              <div className="flex flex-wrap gap-2 mb-2">
                {(['passbook', 'cancelled_cheque', 'bank_statement'] as const).map((t) => (
                  <label key={t} className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="bank_proof_type" checked={(bank.bank_proof_type || '') === t} onChange={() => setBank('bank_proof_type', t)} className="rounded-full border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                    <span className="text-sm text-slate-700 capitalize">{t.replace('_', ' ')}</span>
                  </label>
                ))}
              </div>
              <input type="file" ref={fileInputRefs.bankProof} onChange={(e) => { const f = e.target.files?.[0]; if (f) setBankFile('bank_proof_file', f); }} accept=".jpg,.jpeg,.png,.pdf" className="hidden" />
              {!bank.bank_proof_file ? (
                <button type="button" onClick={() => fileInputRefs.bankProof.current?.click()} className="w-full rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/50 py-3 text-center text-sm text-slate-600 hover:border-indigo-400 hover:bg-indigo-50/50">Upload passbook / cancelled cheque / statement</button>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-2 flex items-center justify-between gap-2">
                  <span className="text-sm text-slate-800 truncate">{bank.bank_proof_file.name}</span>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => fileInputRefs.bankProof.current?.click()} className="text-xs text-indigo-600 hover:underline">Change</button>
                    <button type="button" onClick={() => setBankFile('bank_proof_file', null)} className="text-slate-500 hover:text-rose-600">Remove</button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">UPI ID <span className="text-rose-500">*</span></label>
              <input type="text" value={bank.upi_id || ''} onChange={e => setBank('upi_id', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" placeholder="e.g. merchant@upi" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">UPI QR screenshot <span className="text-rose-500">*</span></label>
              <p className="text-xs text-slate-500 mb-1.5">Upload screenshot where UPI ID is clearly visible on the QR</p>
              <input type="file" ref={fileInputRefs.upiQr} onChange={(e) => { const f = e.target.files?.[0]; if (f) setBankFile('upi_qr_file', f); }} accept=".jpg,.jpeg,.png,.pdf" className="hidden" />
              {!bank.upi_qr_file ? (
                <button type="button" onClick={() => fileInputRefs.upiQr.current?.click()} className="w-full rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/50 py-3 text-center text-sm text-slate-600 hover:border-indigo-400 hover:bg-indigo-50/50">Upload QR screenshot (UPI ID visible)</button>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-2 flex items-center justify-between gap-2">
                  <span className="text-sm text-slate-800 truncate">{bank.upi_qr_file.name}</span>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => fileInputRefs.upiQr.current?.click()} className="text-xs text-indigo-600 hover:underline">Change</button>
                    <button type="button" onClick={() => setBankFile('upi_qr_file', null)} className="text-slate-500 hover:text-rose-600">Remove</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderOtherDocumentsSection = () => (
    <div className="space-y-3">
      <div className="rounded-lg bg-indigo-50/80 border border-indigo-100 p-3">
        <div className="flex items-start gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-indigo-900">Other Documents (Optional)</p>
            <p className="text-xs text-indigo-700 mt-0.5">Additional documents for verification. All fields optional.</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Document Type</label>
          <input type="text" name="other_document_type" value={documents.other_document_type} onChange={handleDocumentInputChange} placeholder="e.g. Rent Agreement, NOC" className="w-full px-4 py-3 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" maxLength={50} autoComplete="off" />
          <p className="text-xs text-slate-500 mt-1.5">Type of document</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Document Number</label>
          <input type="text" name="other_document_number" value={documents.other_document_number} onChange={handleDocumentInputChange} placeholder="Document number" className="w-full px-4 py-3 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" maxLength={30} autoComplete="off" />
          <p className="text-xs text-slate-500 mt-1.5">Identification number</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Document Name</label>
          <input type="text" name="other_document_name" value={documents.other_document_name} onChange={handleDocumentInputChange} placeholder="Document name" className="w-full px-4 py-3 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" maxLength={50} autoComplete="off" />
          <p className="text-xs text-slate-500 mt-1.5">Name of the document</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Expiry Date (if applicable)</label>
          <input type="date" name="other_document_expiry_date" value={documents.other_document_expiry_date} onChange={handleDocumentInputChange} className="w-full px-4 py-3 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" />
          <p className="text-xs text-slate-500 mt-1.5">For documents with expiry</p>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Document File</label>
        <input type="file" ref={fileInputRefs.otherDoc} onChange={(e) => handleFileChange(e, 'other_document_file')} accept=".jpg,.jpeg,.png,.pdf" className="hidden" />
        {!documents.other_document_file ? (
          <button type="button" onClick={() => triggerFileInput(fileInputRefs.otherDoc)} className="w-full rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-6 text-center hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
            <svg className="w-10 h-10 text-slate-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
            <p className="text-sm font-medium text-slate-600">Upload Document File</p>
            <p className="text-xs text-slate-500 mt-0.5">JPG, PNG or PDF · Max 5MB (optional)</p>
          </button>
        ) : (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{documents.other_document_file?.name}</p>
                  <p className="text-xs text-slate-500">{documents.other_document_file ? ((documents.other_document_file.size / 1024 / 1024).toFixed(2) + ' MB') : ''}</p>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => triggerFileInput(fileInputRefs.otherDoc)} className="rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50">Change</button>
                <button type="button" onClick={() => removeFile('other_document_file')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700" title="Remove"><span className="sr-only">Remove</span><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="rounded-xl bg-amber-50/80 border border-amber-100 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-900">Note</p>
            <p className="text-xs text-amber-800 mt-0.5">All fields optional. You can skip this section.</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderDocumentStepContent = () => {
    if (activeSection === 'other' && !showOtherDocs) return renderBankSection();
    switch (activeSection) {
      case 'pan':
        return renderPanSection();
      case 'aadhar':
        return renderAadharSection();
      case 'optional':
        return renderOptionalSection();
      case 'bank':
        return renderBankSection();
      case 'other':
        return renderOtherDocumentsSection();
      default:
        return renderPanSection();
    }
  };

  const renderDocumentStep = () => (
    <>
      {renderValidationModal()}
      <div className="w-full min-h-full bg-slate-50/50">
        <div className="mx-auto flex w-full max-w-6xl flex-col lg:flex-row gap-4 p-4 sm:p-5">
          {/* Left: title + business type + tabs */}
          <aside className="w-full lg:w-56 xl:w-64 shrink-0 flex flex-col gap-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-800">Store Documents</h2>
              <p className="mt-1 text-xs text-slate-600">Upload required documents for verification.</p>
              <div className="mt-3 rounded-lg bg-indigo-50/80 border border-indigo-100 p-2.5">
                <p className="text-xs font-semibold text-indigo-900">{businessType.replace('_', ' ')}</p>
                <p className="mt-0.5 text-[11px] text-indigo-700">
                  {isFoodBusiness()
                    ? 'FSSAI mandatory for food.'
                    : isPharmaBusiness()
                    ? 'Drug License & Pharmacist mandatory.'
                    : 'Optional docs recommended.'}
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
              <p className="px-2 py-1 text-xs font-medium text-slate-500">Sections</p>
              {(showOtherDocs ? ['pan', 'aadhar', 'optional', 'bank', 'other'] : ['pan', 'aadhar', 'optional', 'bank']).map((section) => (
                <button
                  key={section}
                  type="button"
                  onClick={() => setActiveSection(section as 'pan' | 'aadhar' | 'optional' | 'bank' | 'other')}
                  className={`w-full rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-inset ${
                    activeSection === section ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {section === 'pan' ? 'PAN' : section === 'aadhar' ? 'Aadhar' : section === 'optional' ? 'Business Docs' : section === 'bank' ? 'Bank' : 'Other Docs'}
                </button>
              ))}
            </div>
          </aside>

          {/* Right: content + inline actions (no fixed footer) */}
          <main className="flex-1 min-w-0 flex flex-col">
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-[420px]">
              <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                {renderDocumentStepContent()}
              </div>
              <div className="shrink-0 border-t border-slate-200 bg-slate-50/80 px-4 py-3 flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={goToPrevSection}
                  disabled={actionLoading}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Previous
                </button>
                <button
                  type="button"
                  onClick={handleDocumentSaveAndContinue}
                  disabled={actionLoading}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  {actionLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                  {actionLoading ? 'Saving...' : (activeSection === 'other' || (activeSection === 'bank' && !showOtherDocs) ? 'Complete Documents' : 'Save & Continue')}
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );

  const renderStoreSetupStep = () => (
    <div className="w-full h-full">
      <div className="flex flex-col h-full w-full relative bg-[#f8fafc] max-w-[70%] mx-auto">
        <div className="flex-shrink-0 p-4">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Store Configuration</h2>
          <p className="text-gray-600 text-xs mb-2">Configure your store settings and preferences</p>
          <div className="mb-2 p-2 bg-green-50 rounded-lg border border-green-100">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-medium text-green-800">
                Documents uploaded successfully! Now configure your store.
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-32 px-4">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Store Logo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleImageChange(e, 'logo')}
                  className="mb-2 w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                />
                {storeSetup.logo_preview && (
                  <div className="mt-2">
                    <img src={storeSetup.logo_preview} alt="Logo Preview" className="h-20 w-auto rounded shadow border" />
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-2">Upload your store logo (JPG, PNG)</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Store Banner</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleImageChange(e, 'banner')}
                  className="mb-2 w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                />
                {storeSetup.banner_preview && (
                  <div className="mt-2">
                    <img src={storeSetup.banner_preview} alt="Banner Preview" className="h-20 w-full object-cover rounded shadow border" />
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-2">Upload your store banner (JPG, PNG)</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Gallery Images</label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleGalleryImagesChange}
                className="mb-2 w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {storeSetup.gallery_previews && storeSetup.gallery_previews.map((src, idx) => (
                  <img key={idx} src={src} alt={`Gallery ${idx + 1}`} className="h-16 w-16 object-cover rounded border" />
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">Upload multiple gallery images (JPG, PNG)</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-sm sm:text-base font-semibold text-slate-800">Cuisine Selection</h3>
                  <p className="text-xs text-slate-500">Pick cuisines your store serves. You can select multiple options.</p>
                </div>
                <div className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 w-fit">
                  Selected: {storeSetup.cuisine_types.length}
                </div>
              </div>
              <input
                type="text"
                value={cuisineSearch}
                onChange={(e) => setCuisineSearch(e.target.value)}
                placeholder="Search cuisines..."
                className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white mb-3"
              />
              {storeSetup.cuisine_types.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {storeSetup.cuisine_types.map((cuisine) => (
                    <button
                      key={`selected-${cuisine}`}
                      type="button"
                      onClick={() => toggleCuisine(cuisine)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                    >
                      {cuisine}
                      <span className="text-indigo-500">x</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 p-3 bg-slate-50/70">
                <div className="flex flex-wrap gap-2">
                  {filteredCuisines.map((cuisine) => {
                    const selected = storeSetup.cuisine_types.includes(cuisine);
                    return (
                      <button
                        key={cuisine}
                        type="button"
                        onClick={() => toggleCuisine(cuisine)}
                        className={`px-3 py-1.5 text-xs sm:text-sm rounded-full border transition ${
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
                  <p className="text-xs text-slate-500 py-2">No cuisine found for this search.</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Delivery Radius (km)
                </label>
                <input
                  name="delivery_radius_km"
                  type="number"
                  value={storeSetup.delivery_radius_km}
                  onChange={handleStoreSetupChange}
                  className="w-full px-4 py-3 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  min="1"
                  max="50"
                />
                <p className="text-xs text-gray-500 mt-2">Maximum delivery distance</p>
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <h3 className="text-sm font-semibold text-gray-800">Store Hours (Two Slots Per Day)</h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => applyHoursPreset('same_as_monday')}
                    className="px-3 py-1.5 text-xs rounded-full border border-slate-300 bg-white hover:border-indigo-500 hover:text-indigo-700"
                  >
                    Apply Monday to all
                  </button>
                  <button
                    type="button"
                    onClick={() => applyHoursPreset('weekday_weekend')}
                    className="px-3 py-1.5 text-xs rounded-full border border-slate-300 bg-white hover:border-indigo-500 hover:text-indigo-700"
                  >
                    Weekday + Weekend
                  </button>
                  <button
                    type="button"
                    onClick={() => applyHoursPreset('lunch_dinner')}
                    className="px-3 py-1.5 text-xs rounded-full border border-slate-300 bg-white hover:border-indigo-500 hover:text-indigo-700"
                  >
                    Lunch + Dinner
                  </button>
                  <button
                    type="button"
                    onClick={() => applyHoursPreset('full_day')}
                    className="px-3 py-1.5 text-xs rounded-full border border-slate-300 bg-white hover:border-indigo-500 hover:text-indigo-700"
                  >
                    24x7
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {Object.entries(storeSetup.store_hours).map(([day, hours]) => (
                  <div key={day} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-semibold text-gray-700 capitalize">{day}</label>
                      <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={!!hours.closed}
                          onChange={(e) => handleStoreHoursChange(day, 'closed', e.target.checked)}
                          className="w-4 h-4 rounded border-slate-300"
                        />
                        Closed
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2 text-xs font-medium text-slate-500">Slot 1</div>
                      <input
                        type="time"
                        value={hours.slot1_open}
                        disabled={!!hours.closed}
                        onChange={(e) => handleStoreHoursChange(day, 'slot1_open', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white disabled:bg-slate-100 disabled:text-slate-400"
                      />
                      <input
                        type="time"
                        value={hours.slot1_close}
                        disabled={!!hours.closed}
                        onChange={(e) => handleStoreHoursChange(day, 'slot1_close', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white disabled:bg-slate-100 disabled:text-slate-400"
                      />
                      <div className="col-span-2 mt-1 text-xs font-medium text-slate-500">Slot 2 (Optional)</div>
                      <input
                        type="time"
                        value={hours.slot2_open}
                        disabled={!!hours.closed}
                        onChange={(e) => handleStoreHoursChange(day, 'slot2_open', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white disabled:bg-slate-100 disabled:text-slate-400"
                      />
                      <input
                        type="time"
                        value={hours.slot2_close}
                        disabled={!!hours.closed}
                        onChange={(e) => handleStoreHoursChange(day, 'slot2_close', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white disabled:bg-slate-100 disabled:text-slate-400"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Store Features</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    name="is_pure_veg"
                    checked={storeSetup.is_pure_veg}
                    onChange={handleStoreSetupChange}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <div>
                    <div className="font-medium text-gray-700">Pure Vegetarian</div>
                    <div className="text-xs text-gray-500">Serves only vegetarian food</div>
                  </div>
                </label>
                
                <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    name="accepts_online_payment"
                    checked={storeSetup.accepts_online_payment}
                    onChange={handleStoreSetupChange}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <div>
                    <div className="font-medium text-gray-700">Online Payment</div>
                    <div className="text-xs text-gray-500">Accept digital payments</div>
                  </div>
                </label>
                
                <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    name="accepts_cash"
                    checked={storeSetup.accepts_cash}
                    onChange={handleStoreSetupChange}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <div>
                    <div className="font-medium text-gray-700">Cash on Delivery</div>
                    <div className="text-xs text-gray-500">Accept cash payments</div>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="fixed bottom-0 right-0 w-full md:w-auto md:right-8 md:bottom-8 z-50 flex justify-end pointer-events-none">
          <div className="flex justify-between items-center px-0 py-0 gap-2 pointer-events-auto max-w-full" style={{background: 'none', boxShadow: 'none', border: 'none'}}>
            <button
              type="button"
              onClick={goToPrevSection}
              disabled={actionLoading}
              className="px-4 py-2 text-sm text-slate-700 rounded-xl font-medium bg-white border border-slate-300 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-200 transition disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Previous
            </button>
            <button
              type="button"
              onClick={handleStoreSetupSaveAndContinue}
              disabled={actionLoading}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg font-medium border border-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200 flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
              {actionLoading ? 'Saving...' : 'Save & Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full h-full">
      {currentStep === 'documents' && renderDocumentStep()}
      {currentStep === 'store-setup' && renderStoreSetupStep()}
    </div>
  );
};

export default CombinedDocumentStoreSetup;