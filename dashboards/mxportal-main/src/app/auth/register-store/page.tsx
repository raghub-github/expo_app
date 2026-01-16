"use client";
// Utility to safely display numeric values in input fields
const safeNumberInput = (val: number | null | undefined) => (typeof val === 'number' && !isNaN(val) ? val : '');

import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import Map, { Marker } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useSearchParams } from 'next/navigation';
import CombinedDocumentStoreSetup from './doc';
import PreviewPage from './preview';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZ2F0aW1pdHJhIiwiYSI6ImNtanI2dGRwbDBsczQzZHFzeWVwZ3lsMXMifQ.Eju9wHx6e_qu97AhS8TYGA';

interface ParentStore {
  id: number;
  name: string;
}

interface FormData {
  store_name: string;
  store_display_name: string;
  store_type: string;
  custom_store_type: string; // Added for OTHERS option
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const StoreRegistrationForm = () => {
  const [step, setStep] = useState(1);
  const [isClient, setIsClient] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [generatedStoreId, setGeneratedStoreId] = useState<string>('');
  const [parentInfo, setParentInfo] = useState<{ id: number | null; name: string | null; parent_merchant_id: string | null } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const mapRef = useRef<any>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  const [formData, setFormData] = useState<FormData>({
    store_name: '',
    store_display_name: '',
    store_type: 'RESTAURANT',
    custom_store_type: '', // Added for OTHERS option
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
      monday: { open: "09:00", close: "22:00" },
      tuesday: { open: "09:00", close: "22:00" },
      wednesday: { open: "09:00", close: "22:00" },
      thursday: { open: "09:00", close: "22:00" },
      friday: { open: "09:00", close: "22:00" },
      saturday: { open: "10:00", close: "23:00" },
      sunday: { open: "10:00", close: "22:00" },
    },
  });

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const fetchParentInfo = async () => {
      const parentId = searchParams.get('parent_id');
      if (parentId) {
        // Fetch from Supabase merchant_parents table
        const { data, error } = await supabase
          .from('merchant_parents')
          .select('id, parent_merchant_id, parent_name')
          .eq('parent_merchant_id', parentId)
          .single();
        if (data) {
          setParentInfo({
            id: data.id,
            name: data.parent_name,
            parent_merchant_id: data.parent_merchant_id
          });
        } else {
          setParentInfo({ id: null, name: null, parent_merchant_id: parentId });
        }
      }
    };
    fetchParentInfo();
  }, [searchParams]);

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
    setIsSearching(true);
    try {
      const response = await axios.get(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json`,
        {
          params: {
            access_token: MAPBOX_TOKEN,
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
        essential: true
      });
    }
  }, []);

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
      });
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else if (name === 'store_phones') {
      setFormData(prev => ({ ...prev, store_phones: value.split(',').map(phone => phone.trim()).filter(phone => phone) }));
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

  const validateStep = (stepNumber: number): boolean => {
    if (stepNumber === 1) {
      // Check if store_type is OTHERS and custom_store_type is provided
      if (formData.store_type === 'OTHERS' && !formData.custom_store_type.trim()) {
        return false;
      }
      return !!(formData.store_name && formData.store_type && formData.store_email);
    }
    if (stepNumber === 2) {
      return !!(formData.full_address && formData.city && formData.state && formData.latitude && formData.longitude);
    }
    return true;
  };

  const nextStep = async () => {
    if (validateStep(step)) {
      setStep(prev => prev + 1);
    } else {
      if (step === 1 && formData.store_type === 'OTHERS' && !formData.custom_store_type.trim()) {
        alert('Please specify your store type in the "Custom Store Type" field.');
      } else {
        alert('Please fill all required fields before proceeding.');
      }
    }
  };

  const prevStep = async () => {
    setStep(prev => prev - 1);
  };

  const handleDocumentUploadComplete = (docs: DocumentData) => {
    setDocuments(docs);
    setStep(4);
  };

  const handleStoreSetupComplete = (setup: StoreSetupData) => {
    setStoreSetup(setup);
    setStep(5);
  };

  const handleRegistrationSuccess = (storeId: string) => {
    setGeneratedStoreId(storeId);
    setShowSuccess(true);
  };

  const handleRegisterNewStore = () => {
    setFormData({
      store_name: '',
      store_display_name: '',
      store_type: 'RESTAURANT',
      custom_store_type: '',
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
        monday: { open: "09:00", close: "22:00" },
        tuesday: { open: "09:00", close: "22:00" },
        wednesday: { open: "09:00", close: "22:00" },
        thursday: { open: "09:00", close: "22:00" },
        friday: { open: "09:00", close: "22:00" },
        saturday: { open: "10:00", close: "23:00" },
        sunday: { open: "10:00", close: "22:00" },
      },
    });
    setShowSuccess(false);
    setStep(1);
  };

  const handleViewStore = () => {
    window.open(`/store/${generatedStoreId}`, '_blank');
  };

  if (!isClient) {
    return <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-white"><div>Loading...</div></div>;
  }

  if (showSuccess) {
    return (
      <div className="h-screen bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden">
        {/* Top Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
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
    <div className="h-screen bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden">
      {/* Top Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Register New Store</h1>
              {parentInfo && (
                <div className="text-xs text-slate-600">
                  Parent: <span className="font-semibold text-indigo-700">{parentInfo.name}</span>
                  <span className="text-slate-500 ml-1">(Merchant ID: {parentInfo.parent_merchant_id})</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1 rounded-lg">
            <div className="flex items-center">
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
            </div>
            <div className="ml-2 text-xs font-medium text-slate-700">
              Step {step} of 5
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="h-[calc(100vh-64px)] p-4 overflow-hidden">
        {/* Step 1: Basic Store Information */}
        {step === 1 && (
          <div className="h-full flex items-center justify-center">
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
                      value={formData.store_phones.join(', ')}
                      onChange={handleInputChange}
                      placeholder="+911234567890, +919876543210"
                      className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                    />
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
          <div className="h-full flex">
            {/* Left Side - Form */}
            <div className="w-2/5 h-full pr-3">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full overflow-hidden">
                <div className="p-5 h-full">
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
                          <div className="font-mono text-sm bg-white p-3 rounded-lg border border-slate-300 text-slate-800">
                            {formData.latitude?.toFixed(8) || '00.00000000'}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-600 mb-2">Longitude</div>
                          <div className="font-mono text-sm bg-white p-3 rounded-lg border border-slate-300 text-slate-800">
                            {formData.longitude?.toFixed(8) || '00.00000000'}
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
                </div>
              </div>
            </div>
            {/* Right Side - Map */}
            <div className="w-3/5 h-full pl-3">
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
                    <div className={`px-3 py-1 text-xs font-medium rounded-full ${formData.latitude ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {formData.latitude ? '📍 Location Set' : '📍 Search to set location'}
                    </div>
                  </div>
                  <div className="flex-1 rounded-lg overflow-hidden border border-slate-300">
                    <Map
                      ref={mapRef}
                      initialViewState={{
                        longitude: 78.9629,
                        latitude: 20.5937,
                        zoom: 4
                      }}
                      mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
                      mapboxAccessToken={MAPBOX_TOKEN}
                      style={{ width: '100%', height: '100%' }}
                      attributionControl={false}
                      onClick={handleMapClick}
                    >
                      {formData.latitude && formData.longitude && (
                        <Marker
                          longitude={formData.longitude}
                          latitude={formData.latitude}
                          color="#EF4444"
                          draggable={true}
                          onDragEnd={e => {
                            const newLng = e.lngLat.lng;
                            const newLat = e.lngLat.lat;
                            setFormData(prev => ({
                              ...prev,
                              longitude: newLng,
                              latitude: newLat
                            }));
                          }}
                        />
                      )}
                    </Map>
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

        {/* Step 3: Store Documents */}
        {step === 3 && (
          <div className="w-full h-full">
            <CombinedDocumentStoreSetup
              onDocumentComplete={handleDocumentUploadComplete}
              onBack={prevStep}
              businessType={formData.store_type === 'OTHERS' ? formData.custom_store_type : formData.store_type}
            />
          </div>
        )}

        {/* Step 4: Store Configuration */}
        {step === 4 && (
          <div className="w-full h-full">
            <CombinedDocumentStoreSetup
              onStoreSetupComplete={handleStoreSetupComplete}
              onBack={() => setStep(3)}
              businessType={formData.store_type === 'OTHERS' ? formData.custom_store_type : formData.store_type}
              initialStep="store-setup"
            />
          </div>
        )}

        {/* Step 5: Preview & Final Submit */}
        {step === 5 && (
          <div className="w-full h-full">
            <PreviewPage 
              step1={formData} 
              step2={formData} 
              documents={documents} 
              storeSetup={storeSetup}
              parentInfo={parentInfo}
              onBack={() => setStep(4)}
              onSuccess={handleRegistrationSuccess}
            />
          </div>
        )}
      </div>

      {/* Navigation Buttons - Bottom Right */}
      {!showSuccess && step < 3 && (
        <div className="fixed bottom-4 right-6 flex items-center gap-3">
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
            disabled={!validateStep(step)}
            className="px-6 py-2.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            {step === 2 ? 'Save & Continue' : 'Continue'}
            {step === 2 && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export default StoreRegistrationForm;