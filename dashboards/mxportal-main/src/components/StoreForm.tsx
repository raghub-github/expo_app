"use client";
import React from 'react';
import { useState, useRef, useCallback, useEffect } from 'react';

// Step 1 & 2: Basic Info & Location
interface StoreFormState {
  store_name: string;
  store_display_name: string;
  store_type: string;
  store_email: string;
  store_phones: string[];
  store_description: string;
  full_address: string;
  address_line1: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  landmark: string;
  parent_id: string;
  store_id: string;
}

const initialForm: StoreFormState = {
  store_name: '',
  store_display_name: '',
  store_type: 'RESTAURANT',
  store_email: '',
  store_phones: [''],
  store_description: '',
  full_address: '',
  address_line1: '',
  city: '',
  state: '',
  postal_code: '',
  country: 'IN',
  latitude: null,
  longitude: null,
  landmark: '',
  parent_id: '',
  store_id: '',
};

interface StoreHours {
  monday: { open: string; close: string };
  tuesday: { open: string; close: string };
  wednesday: { open: string; close: string };
  thursday: { open: string; close: string };
  friday: { open: string; close: string };
  saturday: { open: string; close: string };
  sunday: { open: string; close: string };
  [key: string]: { open: string; close: string };
}

interface StoreConfig {
  logo: File | null;
  logo_preview: string;
  banner: File | null;
  banner_preview: string;
  gallery_images: File[];
  gallery_previews: string[];
  cuisine_types: string[];
  food_categories: string[];
  avg_preparation_time_minutes: number;
  min_order_amount: number;
  delivery_radius_km: number;
  is_pure_veg: boolean;
  accepts_online_payment: boolean;
  accepts_cash: boolean;
  store_hours: StoreHours;
}

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
}

export default function StoreForm({ parentId, onSuccess }: { parentId: number; onSuccess: (data: any) => void }) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<StoreFormState>({ ...initialForm });
  const [storeConfig, setStoreConfig] = useState<StoreConfig>({
    logo: null,
    logo_preview: '',
    banner: null,
    banner_preview: '',
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
      monday: { open: '09:00', close: '21:00' },
      tuesday: { open: '09:00', close: '21:00' },
      wednesday: { open: '09:00', close: '21:00' },
      thursday: { open: '09:00', close: '21:00' },
      friday: { open: '09:00', close: '21:00' },
      saturday: { open: '09:00', close: '21:00' },
      sunday: { open: '09:00', close: '21:00' },
    },
  });
  
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
  });

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const searchRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const panInputRef = useRef<HTMLInputElement>(null);
  const aadharFrontRef = useRef<HTMLInputElement>(null);
  const aadharBackRef = useRef<HTMLInputElement>(null);
  const fssaiRef = useRef<HTMLInputElement>(null);
  const gstRef = useRef<HTMLInputElement>(null);
  const drugLicenseRef = useRef<HTMLInputElement>(null);
  const pharmacistCertRef = useRef<HTMLInputElement>(null);
  const pharmacyCouncilRef = useRef<HTMLInputElement>(null);



  // Location search (mock implementation)
  const searchLocation = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      // Using Mapbox Geocoding API (you'll need to add your access token)
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?access_token=YOUR_MAPBOX_ACCESS_TOKEN&country=in&limit=5`
      );
      const data = await response.json();
      setSearchResults(data.features || []);
    } catch (error) {
      // Fallback to mock data if API fails
      setTimeout(() => {
        setSearchResults([
          { 
            place_name: `${searchQuery}, Mumbai, Maharashtra, 400001`,
            text: searchQuery,
            center: [72.8777, 19.0760],
            context: [
              { id: 'place.123', text: 'Mumbai' },
              { id: 'region.123', text: 'Maharashtra' },
              { id: 'postcode.123', text: '400001' }
            ]
          }
        ]);
      }, 500);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  const selectLocation = useCallback((result: any) => {
    const [longitude, latitude] = result.center;
    let city = '', state = '', postal_code = '';
    
    (result.context || []).forEach((item: any) => {
      if (item.id.includes('postcode')) postal_code = item.text;
      else if (item.id.includes('place')) city = item.text;
      else if (item.id.includes('region')) state = item.text;
    });
    
    const updatedForm = {
      ...formData,
      full_address: result.place_name,
      address_line1: result.text,
      city: city || formData.city,
      state: state || formData.state,
      postal_code: postal_code || formData.postal_code,
      country: 'IN',
      latitude,
      longitude,
    };
    
    setFormData(updatedForm);
    setSearchResults([]);
    setSearchQuery(result.place_name);
    
  }, [formData, storeConfig]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    let updatedValue: any = value;
    if (type === 'checkbox') {
      updatedValue = (e.target as HTMLInputElement).checked;
    } else if (name === 'store_phones') {
      updatedValue = value.split(',').map(phone => phone.trim()).filter(phone => phone);
    }
    
    const updatedForm = {
      ...formData,
      [name]: updatedValue
    };
    
    setFormData(updatedForm);
  };

  // Store config handlers
  const handleConfigInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    const updatedConfig = {
      ...storeConfig,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? parseFloat(value) : value),
    };
    setStoreConfig(updatedConfig);
  };

  const handleConfigArrayChange = (name: string, value: string) => {
    const updatedConfig = {
      ...storeConfig,
      [name]: value.split(',').map((v: string) => v.trim()).filter(Boolean),
    };
    setStoreConfig(updatedConfig);
  };

  const handleConfigImageChange = (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    
    const reader = new FileReader();
    reader.onloadend = () => {
      const updatedConfig = {
        ...storeConfig,
        [field]: file,
        [`${field}_preview`]: reader.result as string,
      };
      setStoreConfig(updatedConfig);
    };
    reader.readAsDataURL(file);
  };

  const handleGalleryImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    
    const previews: string[] = [];
    let loaded = 0;
    
    files.forEach((file, idx) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        previews[idx] = reader.result as string;
        loaded++;
        if (loaded === files.length) {
          const updatedConfig = {
            ...storeConfig,
            gallery_images: files,
            gallery_previews: previews,
          };
          setStoreConfig(updatedConfig);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleStoreHoursChange = (day: string, field: string, value: string) => {
    const updatedConfig = {
      ...storeConfig,
      store_hours: {
        ...storeConfig.store_hours,
        [day]: {
          ...storeConfig.store_hours[day],
          [field]: value,
        },
      },
    };
    setStoreConfig(updatedConfig);
  };

  // Document handlers
  const handleDocInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const updatedDocs = { ...documents, [name]: value };
    setDocuments(updatedDocs);
  };

  const handleDocFileChange = (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
    const file = e.target.files?.[0] || null;
    const updatedDocs = { ...documents, [field]: file };
    setDocuments(updatedDocs);
  };

  // Validation
  const validateStep = (stepNumber: number): boolean => {
    switch (stepNumber) {
      case 1:
        return !!(formData.store_name.trim() && formData.store_type && formData.store_email.trim());
      case 2:
        return !!(formData.full_address.trim() && formData.city.trim() && formData.state.trim() && 
                 formData.latitude && formData.longitude);
      case 3:
        return validateDocuments();
      case 4:
        return !!(storeConfig.logo && storeConfig.banner && storeConfig.cuisine_types.length > 0);
      default:
        return true;
    }
  };

  const validateDocuments = (): boolean => {
    // Basic validation for all stores
    if (!documents.pan_number.trim() || !documents.pan_image) return false;
    if (!documents.aadhar_number.trim() || !documents.aadhar_front || !documents.aadhar_back) return false;
    
    // Conditional validation based on store type
    if (["RESTAURANT", "CAFE", "BAKERY", "CLOUD_KITCHEN"].includes(formData.store_type.toUpperCase())) {
      if (!documents.fssai_number.trim() || !documents.fssai_image) return false;
    }
    
    if (formData.store_type.toUpperCase() === "PHARMA") {
      if (!documents.drug_license_number.trim() || !documents.drug_license_image) return false;
      if (!documents.pharmacist_registration_number.trim() || !documents.pharmacist_certificate) return false;
      if (!documents.pharmacy_council_registration) return false;
    }
    
    return true;
  };

  const nextStep = () => {
    if (validateStep(step)) {
      setError(null);
      setStep(prev => prev + 1);
    } else {
      setError('Please fill all required fields before proceeding.');
    }
  };

  const prevStep = () => {
    setStep(prev => prev - 1);
  };

  // Main submission function
  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      // Generate unique IDs if not provided
      const parent_id = formData.parent_id || `GMPP${Math.floor(Math.random() * 9000 + 1000)}`;
      const store_id = formData.store_id || `GMMC${Math.floor(Math.random() * 9000 + 1000)}`;

      // Prepare FormData for file uploads
      const formDataToSubmit = new FormData();
      
      // Add basic store data
      Object.entries(formData).forEach(([key, value]) => {
        if (key === 'parent_id') {
          formDataToSubmit.append(key, parent_id);
        } else if (key === 'store_id') {
          formDataToSubmit.append(key, store_id);
        } else if (Array.isArray(value)) {
          formDataToSubmit.append(key, JSON.stringify(value));
        } else if (value !== null && value !== undefined) {
          formDataToSubmit.append(key, String(value));
        }
      });

      // Add parentId from props
      formDataToSubmit.append('parentId', String(parentId));

      // Add store configuration
      formDataToSubmit.append('cuisine_types', JSON.stringify(storeConfig.cuisine_types));
      formDataToSubmit.append('food_categories', JSON.stringify(storeConfig.food_categories));
      formDataToSubmit.append('avg_preparation_time_minutes', String(storeConfig.avg_preparation_time_minutes));
      formDataToSubmit.append('min_order_amount', String(storeConfig.min_order_amount));
      formDataToSubmit.append('delivery_radius_km', String(storeConfig.delivery_radius_km));
      formDataToSubmit.append('is_pure_veg', String(storeConfig.is_pure_veg));
      formDataToSubmit.append('accepts_online_payment', String(storeConfig.accepts_online_payment));
      formDataToSubmit.append('accepts_cash', String(storeConfig.accepts_cash));
      formDataToSubmit.append('store_hours', JSON.stringify(storeConfig.store_hours));

      // Add files
      if (storeConfig.logo) formDataToSubmit.append('logo', storeConfig.logo);
      if (storeConfig.banner) formDataToSubmit.append('banner', storeConfig.banner);
      storeConfig.gallery_images.forEach((file, index) => {
        formDataToSubmit.append(`gallery_${index}`, file);
      });

      // Add document data
      formDataToSubmit.append('pan_number', documents.pan_number);
      formDataToSubmit.append('aadhar_number', documents.aadhar_number);
      formDataToSubmit.append('fssai_number', documents.fssai_number || '');
      formDataToSubmit.append('gst_number', documents.gst_number || '');
      formDataToSubmit.append('drug_license_number', documents.drug_license_number || '');
      formDataToSubmit.append('pharmacist_registration_number', documents.pharmacist_registration_number || '');

      // Add document files
      if (documents.pan_image) formDataToSubmit.append('pan_image', documents.pan_image);
      if (documents.aadhar_front) formDataToSubmit.append('aadhar_front', documents.aadhar_front);
      if (documents.aadhar_back) formDataToSubmit.append('aadhar_back', documents.aadhar_back);
      if (documents.fssai_image) formDataToSubmit.append('fssai_image', documents.fssai_image);
      if (documents.gst_image) formDataToSubmit.append('gst_image', documents.gst_image);
      if (documents.drug_license_image) formDataToSubmit.append('drug_license_image', documents.drug_license_image);
      if (documents.pharmacist_certificate) formDataToSubmit.append('pharmacist_certificate', documents.pharmacist_certificate);
      if (documents.pharmacy_council_registration) formDataToSubmit.append('pharmacy_council_registration', documents.pharmacy_council_registration);

      // Submit to both endpoints
      const [r2Response, supabaseResponse] = await Promise.all([
        fetch('/api/store-registration/submit', {
          method: 'POST',
          body: formDataToSubmit,
        }),
        fetch('/api/store-registration/submit-subabse', {
          method: 'POST',
          body: formDataToSubmit,
        })
      ]);

      if (!r2Response.ok || !supabaseResponse.ok) {
        throw new Error('Submission failed. Please try again.');
      }


      setSuccess(true);
      setLoading(false);
      
      // Call onSuccess callback if provided
      if (onSuccess) {
        onSuccess({
          store_id,
          parent_id,
          store_name: formData.store_name,
          status: 'SUBMITTED'
        });
      }

    } catch (error: any) {
      setError(error.message || 'Submission failed. Please try again.');
      setLoading(false);
    }
  };

  // Render steps
  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-xl shadow border mt-8">
      <div className="mb-6 flex items-center gap-2">
        <div className="p-2 bg-indigo-50 rounded-lg">
          <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h1 className="text-lg font-bold text-slate-800">Register New Store</h1>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3, 4, 5].map((stepNum) => (
          <div key={stepNum} className="flex items-center">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold
              ${stepNum === step ? 'bg-indigo-600 text-white ring-2 ring-indigo-300' :
                stepNum < step ? 'bg-emerald-500 text-white' : 'bg-slate-300 text-slate-500'}`}>
              {stepNum}
            </div>
            {stepNum < 5 && (
              <div className={`w-4 h-0.5 mx-1 ${stepNum < step ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            )}
          </div>
        ))}
        <div className="ml-2 text-xs font-medium text-slate-700">Step {step} of 5</div>
      </div>

      {/* Step 1: Basic Info */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Store Name *</label>
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
              <label className="block text-sm font-medium text-slate-700 mb-2">Display Name</label>
              <input 
                type="text" 
                name="store_display_name" 
                value={formData.store_display_name} 
                onChange={handleInputChange} 
                className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" 
                placeholder="Customer facing name" 
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Store Type *</label>
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
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Store Email *</label>
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
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Phone Numbers (comma separated)</label>
            <input 
              type="text" 
              name="store_phones" 
              value={formData.store_phones.join(', ')} 
              onChange={handleInputChange} 
              placeholder="+911234567890, +919876543210" 
              className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Store Description</label>
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
      )}

      {/* Step 2: Location */}
      {step === 2 && (
        <div className="space-y-4">
          <div ref={searchRef}>
            <label className="block text-sm font-medium text-slate-700 mb-1">Search Location *</label>
            <div className="relative">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={searchQuery} 
                  onChange={e => setSearchQuery(e.target.value)} 
                  placeholder="Enter address, postal code, city..." 
                  className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" 
                />
                <button 
                  type="button" 
                  onClick={searchLocation} 
                  disabled={isSearching} 
                  className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
                >
                  {isSearching ? 'Searching...' : 'Search'}
                </button>
              </div>
              {searchResults.length > 0 && (
                <div className="absolute z-50 mt-1 w-full border border-slate-200 rounded-lg bg-white shadow-lg max-h-40 overflow-y-auto">
                  {searchResults.map((result, idx) => (
                    <div 
                      key={idx} 
                      onClick={() => { selectLocation(result); setSearchResults([]); }} 
                      className="p-3 hover:bg-indigo-50 cursor-pointer border-b border-slate-100 last:border-b-0 text-sm"
                    >
                      <div className="font-medium text-slate-800">{result.text}</div>
                      <div className="text-xs text-slate-600 truncate mt-1">{result.place_name}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">Enter exact address, postal code, or location name</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Full Address *</label>
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
              <label className="block text-sm font-medium text-slate-700 mb-2">City *</label>
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
              <label className="block text-sm font-medium text-slate-700 mb-2">State *</label>
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
              <label className="block text-sm font-medium text-slate-700 mb-2">Postal Code *</label>
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
              <label className="block text-sm font-medium text-slate-700 mb-2">Landmark</label>
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
                <div className="font-mono text-sm bg-white p-3 rounded-lg border border-slate-300 text-slate-800">
                  {formData.latitude ? formData.latitude.toFixed(8) : '00.00000000'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-600 mb-2">Longitude</div>
                <div className="font-mono text-sm bg-white p-3 rounded-lg border border-slate-300 text-slate-800">
                  {formData.longitude ? formData.longitude.toFixed(8) : '00.00000000'}
                </div>
              </div>
            </div>
            {formData.latitude && formData.longitude && (
              <div className="mt-3 text-xs text-emerald-600 flex items-center gap-1">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Location captured with full accuracy
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Documents */}
      {step === 3 && (
        <div className="space-y-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Store Documents</h2>
          
          {/* PAN Section */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">PAN Number *</label>
            <input 
              type="text" 
              name="pan_number" 
              value={documents.pan_number} 
              onChange={handleDocInputChange} 
              className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg" 
              placeholder="Enter PAN number" 
            />
            <label className="block text-sm font-medium text-slate-700 mt-2 mb-1">PAN Image *</label>
            <input 
              type="file" 
              accept="image/*,.pdf" 
              ref={panInputRef} 
              onChange={e => handleDocFileChange(e, 'pan_image')} 
              className="block" 
            />
          </div>
          
          {/* Aadhar Section */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Aadhar Number *</label>
            <input 
              type="text" 
              name="aadhar_number" 
              value={documents.aadhar_number} 
              onChange={handleDocInputChange} 
              className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg" 
              placeholder="Enter Aadhar number" 
            />
            <label className="block text-sm font-medium text-slate-700 mt-2 mb-1">Aadhar Front Image *</label>
            <input 
              type="file" 
              accept="image/*,.pdf" 
              ref={aadharFrontRef} 
              onChange={e => handleDocFileChange(e, 'aadhar_front')} 
              className="block" 
            />
            <label className="block text-sm font-medium text-slate-700 mt-2 mb-1">Aadhar Back Image *</label>
            <input 
              type="file" 
              accept="image/*,.pdf" 
              ref={aadharBackRef} 
              onChange={e => handleDocFileChange(e, 'aadhar_back')} 
              className="block" 
            />
          </div>
          
          {/* FSSAI Section (conditional) */}
          {['RESTAURANT', 'CAFE', 'BAKERY', 'CLOUD_KITCHEN'].includes(formData.store_type.toUpperCase()) && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">FSSAI Number *</label>
              <input 
                type="text" 
                name="fssai_number" 
                value={documents.fssai_number} 
                onChange={handleDocInputChange} 
                className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg" 
                placeholder="Enter FSSAI number" 
              />
              <label className="block text-sm font-medium text-slate-700 mt-2 mb-1">FSSAI Image *</label>
              <input 
                type="file" 
                accept="image/*,.pdf" 
                ref={fssaiRef} 
                onChange={e => handleDocFileChange(e, 'fssai_image')} 
                className="block" 
              />
            </div>
          )}
          
          {/* Pharma Section (conditional) */}
          {formData.store_type.toUpperCase() === 'PHARMA' && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">Drug License Number *</label>
                <input 
                  type="text" 
                  name="drug_license_number" 
                  value={documents.drug_license_number} 
                  onChange={handleDocInputChange} 
                  className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg" 
                  placeholder="Enter Drug License number" 
                />
                <label className="block text-sm font-medium text-slate-700 mt-2 mb-1">Drug License Image *</label>
                <input 
                  type="file" 
                  accept="image/*,.pdf" 
                  ref={drugLicenseRef} 
                  onChange={e => handleDocFileChange(e, 'drug_license_image')} 
                  className="block" 
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">Pharmacist Registration Number *</label>
                <input 
                  type="text" 
                  name="pharmacist_registration_number" 
                  value={documents.pharmacist_registration_number} 
                  onChange={handleDocInputChange} 
                  className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg" 
                  placeholder="Enter Pharmacist Registration number" 
                />
                <label className="block text-sm font-medium text-slate-700 mt-2 mb-1">Pharmacist Certificate *</label>
                <input 
                  type="file" 
                  accept="image/*,.pdf" 
                  ref={pharmacistCertRef} 
                  onChange={e => handleDocFileChange(e, 'pharmacist_certificate')} 
                  className="block" 
                />
                <label className="block text-sm font-medium text-slate-700 mt-2 mb-1">Pharmacy Council Registration *</label>
                <input 
                  type="file" 
                  accept="image/*,.pdf" 
                  ref={pharmacyCouncilRef} 
                  onChange={e => handleDocFileChange(e, 'pharmacy_council_registration')} 
                  className="block" 
                />
              </div>
            </>
          )}
          
          {/* GST Section (optional) */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">GST Number</label>
            <input 
              type="text" 
              name="gst_number" 
              value={documents.gst_number} 
              onChange={handleDocInputChange} 
              className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg" 
              placeholder="Enter GST number (optional)" 
            />
            <label className="block text-sm font-medium text-slate-700 mt-2 mb-1">GST Image</label>
            <input 
              type="file" 
              accept="image/*,.pdf" 
              ref={gstRef} 
              onChange={e => handleDocFileChange(e, 'gst_image')} 
              className="block" 
            />
          </div>
        </div>
      )}

      {/* Step 4: Store Configuration */}
      {step === 4 && (
        <div className="space-y-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Store Configuration</h2>
          
          {/* Logo Upload */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Store Logo *</label>
            <input 
              type="file" 
              accept="image/*" 
              ref={logoRef} 
              onChange={e => handleConfigImageChange(e, 'logo')} 
              className="block" 
            />
            {storeConfig.logo_preview && (
              <img src={storeConfig.logo_preview} alt="Logo Preview" className="h-16 mt-2 rounded" />
            )}
          </div>
          
          {/* Banner Upload */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Store Banner *</label>
            <input 
              type="file" 
              accept="image/*" 
              ref={bannerRef} 
              onChange={e => handleConfigImageChange(e, 'banner')} 
              className="block" 
            />
            {storeConfig.banner_preview && (
              <img src={storeConfig.banner_preview} alt="Banner Preview" className="h-16 mt-2 rounded" />
            )}
          </div>
          
          {/* Gallery Images */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Gallery Images</label>
            <input 
              type="file" 
              accept="image/*" 
              multiple 
              ref={galleryRef} 
              onChange={handleGalleryImagesChange} 
              className="block" 
            />
            <div className="flex gap-2 mt-2">
              {storeConfig.gallery_previews.map((src, idx) => (
                <img key={idx} src={src} alt={`Gallery ${idx + 1}`} className="h-12 rounded" />
              ))}
            </div>
          </div>
          
          {/* Cuisine Types */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Cuisine Types *</label>
            <input 
              type="text" 
              value={storeConfig.cuisine_types.join(', ')} 
              onChange={e => handleConfigArrayChange('cuisine_types', e.target.value)} 
              className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg" 
              placeholder="e.g. Indian, Chinese, Italian" 
            />
          </div>
          
          {/* Food Categories */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Food Categories</label>
            <input 
              type="text" 
              value={storeConfig.food_categories.join(', ')} 
              onChange={e => handleConfigArrayChange('food_categories', e.target.value)} 
              className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg" 
              placeholder="e.g. Pizza, Burger, Salad" 
            />
          </div>
          
          {/* Preparation Time, Min Order, Delivery Radius */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Avg. Preparation Time (min)</label>
              <input 
                type="number" 
                name="avg_preparation_time_minutes" 
                value={storeConfig.avg_preparation_time_minutes} 
                onChange={handleConfigInputChange} 
                className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg" 
                min={1} 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Min Order Amount</label>
              <input 
                type="number" 
                name="min_order_amount" 
                value={Number.isFinite(storeConfig.min_order_amount) ? String(storeConfig.min_order_amount) : ''}
                onChange={handleConfigInputChange} 
                className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg" 
                min={0} 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Delivery Radius (km)</label>
              <input 
                type="number" 
                name="delivery_radius_km" 
                value={storeConfig.delivery_radius_km} 
                onChange={handleConfigInputChange} 
                className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg" 
                min={0} 
              />
            </div>
          </div>
          
          {/* Pure Veg, Payment Options */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                name="is_pure_veg" 
                checked={storeConfig.is_pure_veg} 
                onChange={handleConfigInputChange} 
              />
              <label className="text-sm font-medium text-slate-700">Pure Veg</label>
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                name="accepts_online_payment" 
                checked={storeConfig.accepts_online_payment} 
                onChange={handleConfigInputChange} 
              />
              <label className="text-sm font-medium text-slate-700">Accepts Online Payment</label>
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                name="accepts_cash" 
                checked={storeConfig.accepts_cash} 
                onChange={handleConfigInputChange} 
              />
              <label className="text-sm font-medium text-slate-700">Accepts Cash</label>
            </div>
          </div>
          
          {/* Store Hours */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Store Hours</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(storeConfig.store_hours).map(([day, val]) => (
                <div key={day} className="flex items-center gap-2">
                  <span className="w-20 capitalize">{day}</span>
                  <input 
                    type="time" 
                    value={val.open} 
                    onChange={e => handleStoreHoursChange(day, 'open', e.target.value)} 
                    className="border rounded px-2 py-1" 
                  />
                  <span>-</span>
                  <input 
                    type="time" 
                    value={val.close} 
                    onChange={e => handleStoreHoursChange(day, 'close', e.target.value)} 
                    className="border rounded px-2 py-1" 
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 5: Preview & Submit */}
      {step === 5 && (
        <div className="space-y-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Preview & Submit</h2>
          
          <div className="bg-slate-50 rounded-lg p-4 mb-4">
            <h3 className="font-semibold mb-2">Store Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div><b>Name:</b> {formData.store_name}</div>
              <div><b>Type:</b> {formData.store_type}</div>
              <div><b>Email:</b> {formData.store_email}</div>
              <div><b>Phones:</b> {formData.store_phones.join(', ')}</div>
              <div><b>Description:</b> {formData.store_description}</div>
            </div>
          </div>
          
          <div className="bg-slate-50 rounded-lg p-4 mb-4">
            <h3 className="font-semibold mb-2">Location</h3>
            <div className="grid grid-cols-2 gap-4">
              <div><b>Address:</b> {formData.full_address}</div>
              <div><b>City:</b> {formData.city}</div>
              <div><b>State:</b> {formData.state}</div>
              <div><b>Postal Code:</b> {formData.postal_code}</div>
              <div><b>Landmark:</b> {formData.landmark}</div>
              <div><b>Latitude:</b> {formData.latitude}</div>
              <div><b>Longitude:</b> {formData.longitude}</div>
            </div>
          </div>
          
          <div className="bg-slate-50 rounded-lg p-4 mb-4">
            <h3 className="font-semibold mb-2">Documents</h3>
            <div className="grid grid-cols-2 gap-4">
              <div><b>PAN:</b> {documents.pan_number}</div>
              <div><b>Aadhar:</b> {documents.aadhar_number}</div>
              {documents.fssai_number && <div><b>FSSAI:</b> {documents.fssai_number}</div>}
              {documents.gst_number && <div><b>GST:</b> {documents.gst_number}</div>}
              {documents.drug_license_number && <div><b>Drug License:</b> {documents.drug_license_number}</div>}
              {documents.pharmacist_registration_number && <div><b>Pharmacist Reg.:</b> {documents.pharmacist_registration_number}</div>}
            </div>
          </div>
          
          <div className="bg-slate-50 rounded-lg p-4 mb-4">
            <h3 className="font-semibold mb-2">Store Configuration</h3>
            <div className="grid grid-cols-2 gap-4">
              <div><b>Cuisine Types:</b> {storeConfig.cuisine_types.join(', ')}</div>
              <div><b>Food Categories:</b> {storeConfig.food_categories.join(', ')}</div>
              <div><b>Avg. Prep Time:</b> {storeConfig.avg_preparation_time_minutes} min</div>
              <div><b>Min Order:</b> {storeConfig.min_order_amount}</div>
              <div><b>Delivery Radius:</b> {storeConfig.delivery_radius_km} km</div>
              <div><b>Pure Veg:</b> {storeConfig.is_pure_veg ? 'Yes' : 'No'}</div>
              <div><b>Online Payment:</b> {storeConfig.accepts_online_payment ? 'Yes' : 'No'}</div>
              <div><b>Cash:</b> {storeConfig.accepts_cash ? 'Yes' : 'No'}</div>
            </div>
            <div className="mt-2">
              <b>Store Hours:</b>
              <ul className="ml-4 list-disc">
                {Object.entries(storeConfig.store_hours).map(([day, val]) => (
                  <li key={day}>{day}: {val.open} - {val.close}</li>
                ))}
              </ul>
            </div>
            <div className="mt-2 flex gap-4">
              {storeConfig.logo_preview && <img src={storeConfig.logo_preview} alt="Logo Preview" className="h-12 rounded" />}
              {storeConfig.banner_preview && <img src={storeConfig.banner_preview} alt="Banner Preview" className="h-12 rounded" />}
              {storeConfig.gallery_previews.map((src, idx) => (
                <img key={idx} src={src} alt={`Gallery ${idx + 1}`} className="h-10 rounded" />
              ))}
            </div>
          </div>
          
          <div className="flex items-center gap-3 mt-8">
            <button 
              type="button" 
              onClick={prevStep} 
              className="px-5 py-2.5 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium shadow-sm hover:shadow transition-all"
            >
              ← Previous
            </button>
            <button 
              type="button" 
              onClick={handleSubmit} 
              disabled={loading}
              className="px-8 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 font-semibold flex items-center gap-2 shadow-md hover:shadow-lg"
            >
              {loading ? 'Submitting...' : 'Submit Application'}
            </button>
            {error && (
              <div className="text-red-600 text-sm ml-4 flex items-center gap-2">
                {error}
                <button
                  type="button"
                  className="ml-4 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-semibold shadow"
                  onClick={handleSubmit}
                  disabled={loading}
                >
                  Try Again
                </button>
              </div>
            )}
            {success && (
              <div className="text-green-600 text-base font-semibold ml-4">
                Store registration submitted successfully!
              </div>
            )}
          </div>
        </div>
      )}

      {/* Navigation Buttons (for steps 1-4) */}
      {step < 5 && (
        <div className="flex items-center gap-3 mt-8">
          {step > 1 && (
            <button 
              type="button" 
              onClick={prevStep} 
              className="px-5 py-2.5 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium shadow-sm hover:shadow transition-all"
            >
              ← Previous
            </button>
          )}
          <button 
            type="button" 
            onClick={nextStep} 
            className="px-6 py-2.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            Continue
          </button>
          {error && <div className="text-red-600 text-sm ml-4">{error}</div>}
        </div>
      )}
    </div>
  );
}