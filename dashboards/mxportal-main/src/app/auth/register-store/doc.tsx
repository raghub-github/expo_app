"use client";

import { useState, useRef, useEffect } from 'react';

interface DocumentData {
  pan_number: string;
  pan_image: File | null;
  aadhar_number: string;
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
    monday: { open: string; close: string };
    tuesday: { open: string; close: string };
    wednesday: { open: string; close: string };
    thursday: { open: string; close: string };
    friday: { open: string; close: string };
    saturday: { open: string; close: string };
    sunday: { open: string; close: string };
  };
  [key: string]: any;
}

interface CombinedComponentProps {
  onDocumentComplete?: (documents: DocumentData) => void;
  onStoreSetupComplete?: (storeSetup: StoreSetupData) => void;
  onBack: () => void;
  businessType?: string;
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
    monday: { open: "09:00", close: "22:00" },
    tuesday: { open: "09:00", close: "22:00" },
    wednesday: { open: "09:00", close: "22:00" },
    thursday: { open: "09:00", close: "22:00" },
    friday: { open: "09:00", close: "22:00" },
    saturday: { open: "10:00", close: "23:00" },
    sunday: { open: "10:00", close: "22:00" },
  },
};

const CombinedDocumentStoreSetup: React.FC<CombinedComponentProps> = ({ 
  onDocumentComplete, 
  onStoreSetupComplete, 
  onBack, 
  businessType = 'RESTAURANT',
  initialStep = 'documents'
}) => {
  const [currentStep, setCurrentStep] = useState<'documents' | 'store-setup'>(
    typeof window !== 'undefined' && localStorage.getItem('registerStoreStep')
      ? (localStorage.getItem('registerStoreStep') as 'documents' | 'store-setup')
      : initialStep
  );
  const [activeSection, setActiveSection] = useState<'pan' | 'aadhar' | 'optional' | 'other'>(
    typeof window !== 'undefined' && localStorage.getItem('registerStoreSection')
      ? (localStorage.getItem('registerStoreSection') as 'pan' | 'aadhar' | 'optional' | 'other')
      : 'pan'
  );
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');
  const [validationType, setValidationType] = useState<'warning' | 'error' | 'info'>('warning');
  
  const [documents, setDocuments] = useState<DocumentData>({
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
    fssai_expiry_date: '',
    drug_license_expiry_date: '',
    pharmacist_expiry_date: '',
    other_document_type: '',
    other_document_number: '',
    other_document_name: '',
    other_document_file: null,
    other_document_expiry_date: ''
  });

  const [storeSetup, setStoreSetup] = useState<StoreSetupData>(defaultStoreSetupData);

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
      return !!(documents.pan_number && documents.pan_image);
    } else if (activeSection === 'aadhar') {
      return !!(documents.aadhar_number && documents.aadhar_front && documents.aadhar_back);
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
    } else if (activeSection === 'other') {
      // Other documents are all optional
      return true;
    }
    return true;
  };

  const showDocumentValidationError = (section: 'pan' | 'aadhar' | 'optional' | 'other') => {
    if (section === 'pan') {
      setValidationMessage('Please fill all required fields in the PAN section before proceeding.');
    } else if (section === 'aadhar') {
      setValidationMessage('Please fill all required fields in the Aadhar section before proceeding.');
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
      setActiveSection('other');
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

  const handleStoreSetupArrayChange = (name: string, value: string) => {
    const newForm = {
      ...storeSetup,
      [name]: value.split(",").map(item => item.trim()).filter(item => item),
    };
    setStoreSetup(newForm);
  };

  const handleStoreHoursChange = (day: string, field: 'open' | 'close', value: string) => {
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

  const handleStoreSetupSaveAndContinue = () => {
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
      const sectionOrder: Array<'pan' | 'aadhar' | 'optional' | 'other'> = ['pan', 'aadhar', 'optional', 'other'];
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
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-[90%] mx-4">
          <div className={`flex items-center gap-3 mb-4 ${validationType === 'error' ? 'text-red-600' : 'text-yellow-600'}`}>
            {validationType === 'error' ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            )}
            <h3 className="text-lg font-semibold">
              {validationType === 'error' ? 'Error' : 'Warning'}
            </h3>
          </div>
          <p className="text-gray-700 mb-6">{validationMessage}</p>
          <div className="flex justify-end gap-3">
            {validationType === 'warning' ? (
              <>
                <button
                  onClick={() => handleModalAction(false)}
                  className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleModalAction(true)}
                  className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Proceed Anyway
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setShowValidationModal(false)}
                  className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowValidationModal(false);
                    handleDocumentSaveAndContinue();
                  }}
                  className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
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
      <div className="bg-blue-50 p-2 rounded-lg border border-blue-100">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-sm text-blue-800 font-medium">PAN Card Information (Mandatory for all businesses)</p>
            <p className="text-xs text-blue-600 mt-1">Required for business verification. Format: ABCDE1234F</p>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            PAN Number <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="pan_number"
            value={documents.pan_number}
            onChange={handleDocumentInputChange}
            placeholder="ABCDE1234F"
            className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase font-medium"
            required
            maxLength={10}
            pattern="[A-Z]{5}[0-9]{4}[A-Z]{1}"
            title="Format: ABCDE1234F"
            style={{ textTransform: 'uppercase' }}
            autoComplete="off"
          />
          <p className="text-xs text-gray-500 mt-1">
            Enter 10-character PAN. It will automatically be converted to uppercase.
          </p>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            PAN Card Image <span className="text-red-500">*</span>
          </label>
          <div className="space-y-1">
            <input
              type="file"
              ref={fileInputRefs.pan}
              onChange={(e) => handleFileChange(e, 'pan_image')}
              accept=".jpg,.jpeg,.png,.pdf"
              className="hidden"
            />
            
            {!documents.pan_image ? (
              <div 
                onClick={() => triggerFileInput(fileInputRefs.pan)}
                className="border-2 border-dashed border-gray-300 rounded-lg p-3 text-center hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-colors"
              >
                <svg className="w-10 h-10 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-sm font-medium text-gray-600 mb-1">Upload PAN Card Image</p>
                <p className="text-xs text-gray-500">JPG, PNG or PDF • Max 5MB</p>
              </div>
            ) : (
              <div className="border border-green-200 bg-green-50 rounded-lg p-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800 truncate max-w-[200px]">
                        {documents.pan_image?.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {documents.pan_image ? ((documents.pan_image.size / 1024 / 1024).toFixed(2) + ' MB') : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => triggerFileInput(fileInputRefs.pan)}
                      className="px-3 py-1 text-xs border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50"
                    >
                      Change
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFile('pan_image')}
                      className="p-1 text-red-500 hover:text-red-700"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="bg-yellow-50 p-2 rounded-lg border border-yellow-100">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-sm text-yellow-800 font-medium">Important Note</p>
            <p className="text-xs text-yellow-600 mt-1">
              PAN card is mandatory for all business registrations in India. Make sure the PAN card is valid and belongs to the business owner/authorized signatory.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAadharSection = () => (
    <div className="space-y-3">
      <div className="bg-blue-50 p-2 rounded-lg border border-blue-100">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-sm text-blue-800 font-medium">Aadhar Card Information (Mandatory for all businesses)</p>
            <p className="text-xs text-blue-600 mt-1">Required for identity verification. Both front and back sides are required.</p>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Aadhar Number <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="aadhar_number"
            value={documents.aadhar_number}
            onChange={handleDocumentInputChange}
            placeholder="1234 5678 9012"
            className="w-full md:w-1/2 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
            required
            maxLength={12}
            pattern="[0-9]{12}"
            title="12-digit Aadhar number"
          />
          <p className="text-xs text-gray-500 mt-1">Enter 12-digit Aadhar number without spaces</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Front Side */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Front Side <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              ref={fileInputRefs.aadharFront}
              onChange={(e) => handleFileChange(e, 'aadhar_front')}
              accept=".jpg,.jpeg,.png,.pdf"
              className="hidden"
            />
            
            {!documents.aadhar_front ? (
              <div 
                onClick={() => triggerFileInput(fileInputRefs.aadharFront)}
                className="border-2 border-dashed border-gray-300 rounded-lg p-2 text-center hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-colors"
              >
                <svg className="w-10 h-10 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm font-medium text-gray-600 mb-1">Upload Front Side</p>
                <p className="text-xs text-gray-500">Front side with photo & details</p>
              </div>
            ) : (
              <div className="border border-green-200 bg-green-50 rounded-lg p-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800 truncate max-w-[150px]">
                        {documents.aadhar_front?.name}
                      </p>
                      <p className="text-xs text-gray-500">Front Side</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile('aadhar_front')}
                    className="p-1 text-red-500 hover:text-red-700"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>
          
          {/* Back Side */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Back Side <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              ref={fileInputRefs.aadharBack}
              onChange={(e) => handleFileChange(e, 'aadhar_back')}
              accept=".jpg,.jpeg,.png,.pdf"
              className="hidden"
            />
            
            {!documents.aadhar_back ? (
              <div 
                onClick={() => triggerFileInput(fileInputRefs.aadharBack)}
                className="border-2 border-dashed border-gray-300 rounded-lg p-2 text-center hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-colors"
              >
                <svg className="w-10 h-10 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm font-medium text-gray-600 mb-1">Upload Back Side</p>
                <p className="text-xs text-gray-500">Back side with address</p>
              </div>
            ) : (
              <div className="border border-green-200 bg-green-50 rounded-lg p-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800 truncate max-w-[150px]">
                        {documents.aadhar_back?.name}
                      </p>
                      <p className="text-xs text-gray-500">Back Side</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile('aadhar_back')}
                    className="p-1 text-red-500 hover:text-red-700"
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
      
      <div className="bg-yellow-50 p-2 rounded-lg border border-yellow-100">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-sm text-yellow-800 font-medium">Important Note</p>
            <p className="text-xs text-yellow-600 mt-1">
              Aadhar card is mandatory for identity verification of the business owner/authorized signatory. Both front and back sides must be clear and readable.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderOptionalSection = () => (
    <div className="space-y-3">
      <div className={`p-2 rounded-lg border ${
        isFoodBusiness() ? 'bg-red-50 border-red-100' : 
        isPharmaBusiness() ? 'bg-purple-50 border-purple-100' : 
        'bg-amber-50 border-amber-100'
      }`}>
        <div className="flex items-start gap-3">
          <svg className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
            isFoodBusiness() ? 'text-red-600' : 
            isPharmaBusiness() ? 'text-purple-600' : 
            'text-amber-600'
          }`} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div>
            <p className={`text-sm font-medium ${
              isFoodBusiness() ? 'text-red-800' : 
              isPharmaBusiness() ? 'text-purple-800' : 
              'text-amber-800'
            }`}>
              {isFoodBusiness() ? 'FSSAI Certificate (Mandatory for Food Businesses)' : 
               isPharmaBusiness() ? 'Pharma Documents (Mandatory for Pharmacy Businesses)' : 
               'Optional Documents'}
            </p>
            <p className={`text-xs mt-1 ${
              isFoodBusiness() ? 'text-red-600' : 
              isPharmaBusiness() ? 'text-purple-600' : 
              'text-amber-600'
            }`}>
              {isFoodBusiness() 
                ? `FSSAI license is mandatory for ${businessType.toLowerCase()} businesses as per Indian food safety regulations.`
                : isPharmaBusiness()
                ? 'Drug License and Pharmacist details are mandatory for pharmacy businesses as per Indian drug regulations.'
                : 'These documents are optional but recommended for better verification and service access.'}
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
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                  className="px-3 py-2 text-sm border-2 border-dashed rounded-lg border-purple-300 text-purple-600 hover:border-purple-500 hover:text-purple-700 hover:bg-purple-50"
                >
                  {documents.drug_license_image ? 'Change File' : 'Upload Drug License'}
                </button>
                {documents.drug_license_image && (
                  <div className="flex-1">
                    <div className="flex items-center justify-between px-2 py-1 border border-green-200 rounded-lg bg-green-50">
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
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                className="px-3 py-2 text-sm border-2 border-dashed rounded-lg border-purple-300 text-purple-600 hover:border-purple-500 hover:text-purple-700 hover:bg-purple-50"
              >
                {documents.pharmacist_certificate ? 'Change File' : 'Upload Pharmacist Certificate'}
              </button>
              {documents.pharmacist_certificate && (
                <div className="flex-1">
                  <div className="flex items-center justify-between px-2 py-1 border border-green-200 rounded-lg bg-green-50">
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
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                className="px-3 py-2 text-sm border-2 border-dashed rounded-lg border-purple-300 text-purple-600 hover:border-purple-500 hover:text-purple-700 hover:bg-purple-50"
              >
                {documents.pharmacy_council_registration ? 'Change File' : 'Upload Council Registration'}
              </button>
              {documents.pharmacy_council_registration && (
                <div className="flex-1">
                  <div className="flex items-center justify-between px-2 py-1 border border-green-200 rounded-lg bg-green-50">
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
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                className="px-3 py-2 text-sm border-2 border-dashed rounded-lg border-red-300 text-red-600 hover:border-red-500 hover:text-red-700 hover:bg-red-50"
              >
                {documents.fssai_image ? 'Change File' : 'Upload Certificate'}
              </button>
              {documents.fssai_image && (
                <div className="flex-1">
                  <div className="flex items-center justify-between px-2 py-1 border border-green-200 rounded-lg bg-green-50">
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
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              className="px-3 py-2 text-sm border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50"
            >
              {documents.gst_image ? 'Change File' : 'Upload Certificate'}
            </button>
            {documents.gst_image && (
              <div className="flex-1">
                <div className="flex items-center justify-between px-2 py-1 border border-green-200 rounded-lg bg-green-50">
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
      
      <div className="bg-blue-50 p-2 rounded-lg border border-blue-100">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-sm text-blue-800 font-medium">Important Information</p>
            <p className="text-xs text-blue-600 mt-1">
              {isPharmaBusiness() 
                ? 'All pharma-related documents are mandatory as per Indian drug regulations. Your store cannot operate without valid Drug License and Pharmacist details.'
                : isFoodBusiness()
                ? 'FSSAI certificate is mandatory for food businesses. GST may be required based on turnover.'
                : 'Optional documents help with faster verification and better service access.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderOtherDocumentsSection = () => (
    <div className="space-y-3">
      <div className="bg-blue-50 p-2 rounded-lg border border-blue-100">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-sm text-blue-800 font-medium">Other Documents (Optional)</p>
            <p className="text-xs text-blue-600 mt-1">Upload any additional documents for verification. None of these fields are mandatory.</p>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Document Type</label>
          <input
            type="text"
            name="other_document_type"
            value={documents.other_document_type}
            onChange={handleDocumentInputChange}
            placeholder="e.g. Rent Agreement, NOC"
            className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
            maxLength={50}
            autoComplete="off"
          />
          <p className="text-xs text-gray-500 mt-1">Type of additional document</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Document Number</label>
          <input
            type="text"
            name="other_document_number"
            value={documents.other_document_number}
            onChange={handleDocumentInputChange}
            placeholder="Enter document number"
            className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
            maxLength={30}
            autoComplete="off"
          />
          <p className="text-xs text-gray-500 mt-1">Document identification number</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Document Name</label>
          <input
            type="text"
            name="other_document_name"
            value={documents.other_document_name}
            onChange={handleDocumentInputChange}
            placeholder="Enter document name"
            className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
            maxLength={50}
            autoComplete="off"
          />
          <p className="text-xs text-gray-500 mt-1">Name of the document</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Expiry Date (if applicable)</label>
          <input
            type="date"
            name="other_document_expiry_date"
            value={documents.other_document_expiry_date}
            onChange={handleDocumentInputChange}
            className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
          />
          <p className="text-xs text-gray-500 mt-1">For documents with expiry date</p>
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Document File</label>
        <div className="flex items-start gap-3">
          <input
            type="file"
            ref={fileInputRefs.otherDoc}
            onChange={(e) => handleFileChange(e, 'other_document_file')}
            accept=".jpg,.jpeg,.png,.pdf"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => triggerFileInput(fileInputRefs.otherDoc)}
            className="px-4 py-3 text-sm border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            {documents.other_document_file ? 'Change File' : 'Upload Document File'}
          </button>
          {documents.other_document_file && (
            <div className="flex-1">
              <div className="flex items-center justify-between px-3 py-2 border border-green-200 rounded-lg bg-green-50">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-green-100 rounded">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800 truncate max-w-[180px]">
                      {documents.other_document_file?.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {documents.other_document_file ? ((documents.other_document_file.size / 1024 / 1024).toFixed(2) + ' MB') : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile('other_document_file')}
                  className="text-red-500 hover:text-red-700"
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-2">JPG, PNG or PDF • Max 5MB (Optional)</p>
      </div>
      
      <div className="bg-amber-50 p-2 rounded-lg border border-amber-100">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-sm text-amber-800 font-medium">Note</p>
            <p className="text-xs text-amber-600 mt-1">
              All fields in this section are optional. You can skip this section entirely if you don't have additional documents to upload.
            </p>
          </div>
        </div>
      </div>
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
      case 'other':
        return renderOtherDocumentsSection();
      default:
        return renderPanSection();
    }
  };

  const renderDocumentStep = () => (
    <>
      {renderValidationModal()}
      
      <div className="w-full h-full">
        <div className="flex flex-col h-full w-full relative bg-[#f8fafc] max-w-[70%] mx-auto">
          
          <div className="flex-shrink-0 p-4">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Store Documents</h2>
            <p className="text-gray-600 text-xs mb-2">Upload required documents for verification</p>
            <div className="mb-2 p-2 bg-blue-50 rounded-lg border border-blue-100">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-medium text-blue-800">
                  Business Type: <span className="font-bold">{businessType.replace('_', ' ')}</span>
                </span>
              </div>
              <p className="text-xs text-blue-600 mt-1">
                {isFoodBusiness() 
                  ? 'FSSAI certificate is mandatory for food businesses'
                  : isPharmaBusiness()
                  ? 'Drug License and Pharmacist details are mandatory for pharma businesses'
                  : 'Additional documents are optional but recommended'}
              </p>
            </div>
          </div>

          <div className="flex justify-center gap-1 mb-2 px-4">
            {['pan', 'aadhar', 'optional', 'other'].map((section) => (
              <button
                key={section}
                onClick={() => setActiveSection(section as 'pan' | 'aadhar' | 'optional' | 'other')}
                className={`px-3 py-1 rounded-lg text-sm font-medium border ${activeSection === section ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'} transition-all`}
              >
                {section === 'pan' ? 'PAN' : 
                 section === 'aadhar' ? 'Aadhar' : 
                 section === 'optional' ? 'Business Docs' : 
                 'Other Docs'}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto pb-32 px-4">
            {renderDocumentStepContent()}
          </div>

          <div className="fixed bottom-0 right-0 w-full md:w-auto md:right-8 md:bottom-8 z-50 flex justify-end pointer-events-none">
            <div className="flex justify-between items-center px-0 py-0 gap-2 pointer-events-auto max-w-full" style={{background: 'none', boxShadow: 'none', border: 'none'}}>
              <button
                type="button"
                onClick={goToPrevSection}
                className="px-4 py-2 text-sm text-gray-700 rounded-lg font-medium bg-white border border-gray-300 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 transition"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={handleDocumentSaveAndContinue}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg font-medium border border-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition"
              >
                {activeSection === 'other' ? 'Complete Documents' : 'Save & Continue'}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
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
                  className="mb-2 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
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
                  className="mb-2 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
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
                className="mb-2 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {storeSetup.gallery_previews && storeSetup.gallery_previews.map((src, idx) => (
                  <img key={idx} src={src} alt={`Gallery ${idx + 1}`} className="h-16 w-16 object-cover rounded border" />
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">Upload multiple gallery images (JPG, PNG)</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cuisine Types (comma separated)
                </label>
                <input
                  value={storeSetup.cuisine_types.join(", ")}
                  onChange={(e) => handleStoreSetupArrayChange("cuisine_types", e.target.value)}
                  className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  placeholder="Indian, Chinese, Italian, Continental"
                />
                <p className="text-xs text-gray-500 mt-2">e.g., Indian, Chinese, Italian</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Food Categories (comma separated)
                </label>
                <input
                  value={storeSetup.food_categories.join(", ")}
                  onChange={(e) => handleStoreSetupArrayChange("food_categories", e.target.value)}
                  className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  placeholder="Main Course, Appetizers, Desserts, Beverages"
                />
                <p className="text-xs text-gray-500 mt-2">e.g., Main Course, Desserts, Beverages</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Avg Preparation Time (minutes)
                </label>
                <input
                  name="avg_preparation_time_minutes"
                  type="number"
                  value={storeSetup.avg_preparation_time_minutes}
                  onChange={handleStoreSetupChange}
                  className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  min="5"
                  max="180"
                />
                <p className="text-xs text-gray-500 mt-2">Average time to prepare orders</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Min Order Amount (₹)
                </label>
                <input
                  name="min_order_amount"
                  type="number"
                  value={storeSetup.min_order_amount}
                  onChange={handleStoreSetupChange}
                  className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  min="0"
                />
                <p className="text-xs text-gray-500 mt-2">Minimum order value for delivery</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Delivery Radius (km)
                </label>
                <input
                  name="delivery_radius_km"
                  type="number"
                  value={storeSetup.delivery_radius_km}
                  onChange={handleStoreSetupChange}
                  className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  min="1"
                  max="50"
                />
                <p className="text-xs text-gray-500 mt-2">Maximum delivery distance</p>
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Store Hours</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {Object.entries(storeSetup.store_hours).map(([day, hours]) => (
                  <div key={day} className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 capitalize">
                      {day}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="time"
                        value={hours.open}
                        onChange={(e) => handleStoreHoursChange(day, 'open', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      />
                      <input
                        type="time"
                        value={hours.close}
                        onChange={(e) => handleStoreHoursChange(day, 'close', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
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
              className="px-4 py-2 text-sm text-gray-700 rounded-lg font-medium bg-white border border-gray-300 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 transition"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={handleStoreSetupSaveAndContinue}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg font-medium border border-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200 flex items-center gap-2 transition"
            >
              Save & Continue
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
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