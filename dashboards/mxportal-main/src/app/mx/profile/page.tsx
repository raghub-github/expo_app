"use client";

import React, { useEffect, useState, useRef } from "react";
import { MXLayoutWhite } from "@/components/MXLayoutWhite";
import { fetchRestaurantById as fetchStoreById, updateStoreInfo } from "@/lib/database";
import { uploadImageToR2 } from "@/lib/uploadImageToR2";
import { MerchantStore } from "@/lib/merchantStore";
import { Toaster, toast } from "sonner";
import { 
  Building, 
  MapPin, 
  Clock, 
  Phone, 
  Mail, 
  User, 
  CheckCircle,
  Shield,
  Package,
  Star,
  FileText,
  Edit2,
  Upload,
  DollarSign,
  Hash,
  Tag,
  Calendar,
  Activity,
  Banknote,
  Map,
  Lock,
  Globe,
  Image as ImageIcon
} from "lucide-react";

export const dynamic = "force-dynamic";

class ProfileErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: any, info: any) {
    // Optionally log error
    // console.error(error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center', color: '#b91c1c', background: '#fff0f0' }}>
          <h2>Something went wrong.</h2>
          <p>Please refresh the page or contact support if this continues.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ================= OPERATING DAYS CARD COMPONENT =================
function OperatingDaysCard({ storeId }: { storeId: string | null }) {
  const [days, setDays] = useState<any[]>([]);
  const [totalMinutes, setTotalMinutes] = useState(0);
  
  useEffect(() => {
    if (!storeId) return;
    import("@/lib/database").then(mod => {
      mod.fetchStoreOperatingHours(storeId).then((result) => {
        setDays(result);
        setTotalMinutes(result.reduce((sum: number, d: any) => sum + (d.total_duration_minutes || 0), 0));
      });
    });
  }, [storeId]);

  function formatSlot(start: string, end: string) {
    if (!start || !end) return null;
    return `${start} - ${end}`;
  }

  function minutesToHours(minutes: number) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  }

  function abbreviateDayLabel(dayLabel: string): string {
    const abbreviations: Record<string, string> = {
      'Monday': 'Mon',
      'Tuesday': 'Tue',
      'Wednesday': 'Wed',
      'Thursday': 'Thu',
      'Friday': 'Fri',
      'Saturday': 'Sat',
      'Sunday': 'Sun'
    };
    return abbreviations[dayLabel] || dayLabel;
  }

  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Clock size={16} className="text-blue-600" />
          Operating Days
        </h3>
        <span className="text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-1 rounded">
          Total: {minutesToHours(totalMinutes)}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {days.map((day: any) => (
          <div key={day.day_label} className="flex items-center justify-between text-xs py-1 px-2 rounded border border-gray-100 bg-white">
            <span className="font-medium w-16 text-gray-900">{abbreviateDayLabel(day.day_label)}</span>
            {day.open ? (
              <span className="text-green-700 font-semibold">Open</span>
            ) : (
              <span className="text-red-500 font-semibold">Closed</span>
            )}
            <span className="text-gray-700 flex flex-col items-start min-w-[120px]">
              {day.open && (
                <>
                  {formatSlot(day.slot1_start, day.slot1_end) && (
                    <span className="text-xs leading-tight">{formatSlot(day.slot1_start, day.slot1_end)}</span>
                  )}
                  {formatSlot(day.slot2_start, day.slot2_end) && (
                    <span className="text-xs leading-tight mt-0.5">{formatSlot(day.slot2_start, day.slot2_end)}</span>
                  )}
                  <span className="text-xs text-gray-500 mt-0.5">({minutesToHours(day.total_duration_minutes)})</span>
                </>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const [store, setStore] = useState<MerchantStore | null>(null);
  const [editData, setEditData] = useState<MerchantStore | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmSave, setConfirmSave] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [showImageUploadModal, setShowImageUploadModal] = useState(false);
  const [uploadingImages, setUploadingImages] = useState<string[]>([]);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const adsInputRef = useRef<HTMLInputElement>(null);

  /* ===== GET STORE ID ===== */
  useEffect(() => {
    const id = localStorage.getItem("selectedStoreId") || localStorage.getItem("selectedRestaurantId");
    if (!id) {
      toast.error("Store ID not found");
      return;
    }
    setStoreId(id);
  }, []);

  /* ===== FETCH DATA ===== */
  useEffect(() => {
    if (!storeId) return;
    setLoading(true);
    fetchStoreById(storeId)
      .then((data) => {
        setStore(data);
        setEditData(data);
      })
      .catch(() => toast.error("Failed to load profile"))
      .finally(() => setLoading(false));
  }, [storeId]);

  /* ===== STORE NAME LOGIC ===== */
  const storeInitial = store?.store_name?.charAt(0).toUpperCase() || "R";
  const isVerified = store?.approval_status === 'APPROVED';

  /* ===== SAVE CHANGES ===== */
  const handleSave = async () => {
    if (!storeId || !editData) return;

    try {
      await updateStoreInfo(storeId, {
        store_name: editData.store_name,
        store_email: editData.store_email,
        store_phones: editData.store_phones,
        store_description: editData.store_description,
        cuisine_types: editData.cuisine_types,
        food_categories: editData.food_categories,
        full_address: editData.full_address,
        city: editData.city,
        state: editData.state,
        landmark: editData.landmark,
        postal_code: editData.postal_code,
        latitude: editData.latitude,
        longitude: editData.longitude,
        gst_number: editData.gst_number,
        pan_number: editData.pan_number,
        aadhar_number: editData.aadhar_number,
        fssai_number: editData.fssai_number,
        bank_account_holder: editData.bank_account_holder,
        bank_account_number: editData.bank_account_number,
        bank_ifsc: editData.bank_ifsc,
        bank_name: editData.bank_name,
        min_order_amount: editData.min_order_amount,
        am_name: editData.am_name,
        am_mobile: editData.am_mobile,
        am_email: editData.am_email,
      });
      setStore(editData);
      setEditingField(null);
      toast.success("Profile updated successfully");
    } catch (error) {
      toast.error("Failed to update profile");
    } finally {
      setConfirmSave(false);
    }
  };

  /* ===== IMAGE UPLOAD HANDLERS ===== */
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'banner' | 'ads' | 'logo' | 'gallery') => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !storeId) return;

    setUploadingImages(files.map(file => URL.createObjectURL(file)));

    try {
      if (type === 'banner') {
        // Only one banner image
        const file = files[0];
        const signedUrl = await uploadImageToR2(file, 'banners', storeId, 'merchant-assets');
        if (!signedUrl) throw new Error('Banner upload failed');
        await updateStoreInfo(storeId, { banner_url: signedUrl });
        setStore(r => r ? { ...r, banner_url: signedUrl } : r);
        setEditData(r => r ? { ...r, banner_url: signedUrl } : r);
        toast.success("Store banner updated!");
      } else if (type === 'logo') {
        // Only one logo image
        const file = files[0];
        const signedUrl = await uploadImageToR2(file, 'logos', storeId, 'merchant-assets');
        if (!signedUrl) throw new Error('Logo upload failed');
        await updateStoreInfo(storeId, { logo_url: signedUrl });
        setStore(r => r ? { ...r, logo_url: signedUrl } : r);
        setEditData(r => r ? { ...r, logo_url: signedUrl } : r);
        toast.success("Logo updated!");
      } else if (type === 'gallery') {
        // Multiple gallery images
        const uploadGallery = await Promise.all(files.map(file => uploadImageToR2(file, 'gallery', storeId, 'merchant-assets')));
        const validUrls = uploadGallery.filter(Boolean) as string[];
        const currentGallery = store?.gallery_images || [];
        const newGallery = [...currentGallery, ...validUrls].slice(0, 10); // Limit gallery size
        await updateStoreInfo(storeId, { gallery_images: newGallery });
        setStore(r => r ? { ...r, gallery_images: newGallery } : r);
        setEditData(r => r ? { ...r, gallery_images: newGallery } : r);
        toast.success("Gallery images updated!");
      } else if (type === 'ads') {
        // Multiple ads images
        const uploadAds = await Promise.all(files.map(file => uploadImageToR2(file, 'ads', storeId, 'merchant-assets')));
        const validUrls = uploadAds.filter(Boolean) as string[];
        const currentAds = store?.ads_images || [];
        const newAds = [...currentAds, ...validUrls].slice(0, 5); // Keep max 5 images
        await updateStoreInfo(storeId, { ads_images: newAds });
        setStore(r => r ? { ...r, ads_images: newAds } : r);
        setEditData(r => r ? { ...r, ads_images: newAds } : r);
        toast.success("Ads images updated!");
      }

      setUploadingImages([]);
      if (type === 'ads' || type === 'gallery') {
        setShowImageUploadModal(false);
      }
    } catch (error) {
      console.error("Image upload error:", error);
      toast.error("Image upload failed");
      setUploadingImages([]);
    }
  };

  /* ===== REMOVE AD IMAGE ===== */
  const handleRemoveAdImage = async (index: number) => {
    if (!storeId || !store?.ads_images) return;

    const newAds = [...store.ads_images];
    newAds.splice(index, 1);

    try {
      await updateStoreInfo(storeId, { ads_images: newAds });
      setStore(r => r ? { ...r, ads_images: newAds } : r);
      setEditData(r => r ? { ...r, ads_images: newAds } : r);
      toast.success("Image removed!");
    } catch (error) {
      toast.error("Failed to remove image");
    }
  };

  /* ===== FORMATTING FUNCTIONS ===== */
  const formatTime = (timeString?: string) => {
    if (!timeString) return "—";
    try {
      const [hours, minutes] = timeString.split(':');
      const date = new Date();
      date.setHours(parseInt(hours), parseInt(minutes));
      return date.toLocaleTimeString('en-IN', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      });
    } catch {
      return timeString;
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatArray = (arr?: string[]) => {
    if (!arr || arr.length === 0) return "—";
    return arr.join(', ');
  };

  const startEditing = (fieldName: string) => {
    setEditingField(fieldName);
  };

  const stopEditing = () => {
    setEditingField(null);
  };

  if (loading) {
    return (
      <MXLayoutWhite restaurantName={editData?.store_name || ''} restaurantId={storeId || ''}>
        <div className="min-h-screen bg-gray-50 hide-scrollbar">
          <div className="bg-white border-b border-gray-200 p-6">
            <div className="h-8 bg-gray-200 rounded w-1/4 animate-pulse"></div>
          </div>
          <div className="p-6">
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden max-w-3xl mx-auto">
              <div className="flex gap-6 p-6">
                <div className="w-20 h-20 bg-gray-200 rounded-lg animate-pulse"></div>
                <div className="flex-1 space-y-4">
                  <div className="h-6 bg-gray-200 rounded w-1/2 animate-pulse"></div>
                  <div className="h-4 bg-gray-100 rounded w-1/3 animate-pulse"></div>
                </div>
              </div>
              <div className="p-6 space-y-3">
                {[1,2,3,4,5,6].map(i => (
                  <div key={i} className="h-4 bg-gray-100 rounded animate-pulse w-full"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </MXLayoutWhite>
    );
  }

  if (!store || !editData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-500">Profile not found</div>
      </div>
    );
  }

  return (
    <ProfileErrorBoundary>
      <Toaster position="top-right" richColors />
      <MXLayoutWhite
        restaurantName={store.store_name}
        restaurantId={store.store_id}
      >
        <div className="bg-gray-50 hide-scrollbar overflow-y-auto" style={{ minHeight: 0, height: 'auto' }}>
          {/* MAIN CONTENT CONTAINER - Prevents extra scroll beyond content */}
          <div>
            <div className="p-4">
              <div className="max-w-7xl mx-auto">
                {/* HEADER */}
                <div className="mb-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h1 className="text-2xl font-bold text-gray-900">Merchant Profile</h1>
                      <p className="text-sm text-gray-600 mt-0.5">Manage your restaurant details</p>
                    </div>
                    <button
                      onClick={() => setConfirmSave(true)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>

                {/* MAIN CARD */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
                  {/* STORE HEADER */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-12 h-12 bg-blue-600 text-white rounded-lg flex items-center justify-center text-lg font-bold">
                            {storeInitial}
                          </div>
                          {isVerified && (
                            <div className="absolute -bottom-1 -right-1 bg-green-500 text-white p-1 rounded-full">
                              <CheckCircle size={12} />
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold text-gray-900">
                              {store.store_name}
                            </h2>
                            <span className="text-xs text-gray-600">
                              • {formatArray(store.cuisine_type)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-sm text-gray-600 mt-1">
                            <span className="flex items-center gap-1">
                              <MapPin size={12} />
                              {store.city}, {store.state}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock size={12} />
                              {formatTime(store.opening_time)} - {formatTime(store.closing_time)}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {/* QUICK STATS (with extra fields) */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="text-center px-3 py-1.5 bg-white rounded-lg border border-gray-200 min-w-[90px]">
                          <div className="text-sm font-bold text-gray-900">{store.min_order_amount || 0}</div>
                          <div className="text-xs text-gray-500">Min Order</div>
                        </div>
                        <div className="text-center px-3 py-1.5 bg-white rounded-lg border border-gray-200 min-w-[90px]">
                          <div className="text-sm font-bold text-gray-900">{(store.avg_preparation_time_minutes ?? store.avg_delivery_time_minutes) || 0}m</div>
                          <div className="text-xs text-gray-500">Prep Time</div>
                        </div>
                        <div className="text-center px-3 py-1.5 bg-white rounded-lg border border-gray-200 min-w-[90px]">
                          <div className="text-sm font-bold text-gray-900">{store.delivery_radius_km ?? '—'}</div>
                          <div className="text-xs text-gray-500">Delivery Radius</div>
                        </div>
                        <div className="text-center px-3 py-1.5 bg-white rounded-lg border border-gray-200 min-w-[120px]">
                          <div className="text-sm font-bold text-gray-900">{store.parent_merchant_id || '—'}</div>
                          <div className="text-xs text-gray-500">Parent Merchant ID</div>
                        </div>
                        <div className="text-center px-3 py-1.5 bg-white rounded-lg border border-gray-200 min-w-[90px]">
                          <div className="text-sm font-bold text-gray-900">
                            {store.approval_status === 'APPROVED' ? 'Verified' : 'Pending'}
                          </div>
                          <div className="text-xs text-gray-500">Status</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* CONTENT GRID */}
                  <div className="p-5">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                      
                      {/* COLUMN 1: STORE DETAILS */}
                      <div className="space-y-4">
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 m-0">
                              <Building size={16} className="text-blue-600" />
                              Store Details
                            </h3>
                            <label className="inline-flex items-center cursor-pointer ml-2">
                              <span className="text-xs font-medium text-gray-700 mr-2">Pure Veg</span>
                              <input
                                type="checkbox"
                                checked={!!editData.is_pure_veg}
                                onChange={async (e) => {
                                  const newValue = e.target.checked;
                                  setEditData({ ...editData, is_pure_veg: newValue });
                                  setStore({ ...store, is_pure_veg: newValue });
                                  try {
                                    await updateStoreInfo(storeId, { is_pure_veg: newValue });
                                    toast.success(`Store marked as ${newValue ? 'Pure Veg' : 'Not Pure Veg'}`);
                                  } catch (err) {
                                    toast.error('Failed to update Pure Veg status');
                                  }
                                }}
                                className="sr-only peer"
                              />
                              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:bg-green-500 transition-all relative">
                                <div className={`absolute left-1 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${editData.is_pure_veg ? 'translate-x-4' : ''}`}></div>
                              </div>
                            </label>
                          </div>
                          <div className="space-y-2 text-sm">
                            <CompactEditableRow
                              label="Store Name"
                              value={editData.store_name}
                              isEditing={editingField === 'store_name'}
                              onEdit={() => startEditing('store_name')}
                              onSave={stopEditing}
                              onChange={(v) => setEditData({ ...editData, store_name: v })}
                            />
                            <CompactLockedRow
                              label="Store Display Name"
                              value={store.store_display_name || '—'}
                            />
                            <CompactLockedRow
                              label="Cuisine Types"
                              value={Array.isArray(store.cuisine_types) ? store.cuisine_types.join(', ') : (store.cuisine_types || '—')}
                            />
                            <CompactLockedRow
                              label="Food Categories"
                              value={Array.isArray(store.food_categories) ? store.food_categories.join(', ') : (store.food_categories || '—')}
                            />
                            <CompactEditableRow
                              label="Store Email"
                              value={editData.store_email}
                              isEditing={editingField === 'store_email'}
                              onEdit={() => startEditing('store_email')}
                              onSave={stopEditing}
                              onChange={(v) => setEditData({ ...editData, store_email: v })}
                            />
                            <CompactEditableRow
                              label="Store Phones"
                              value={formatArray(editData.store_phones)}
                              isEditing={editingField === 'store_phones'}
                              onEdit={() => startEditing('store_phones')}
                              onSave={stopEditing}
                              onChange={(v) => setEditData({ ...editData, store_phones: v.split(',').map(s => s.trim()) })}
                            />
                            <CompactEditableRow
                              label="Description"
                              value={editData.store_description}
                              isEditing={editingField === 'store_description'}
                              onEdit={() => startEditing('store_description')}
                              onSave={stopEditing}
                              onChange={(v) => setEditData({ ...editData, store_description: v })}
                              multiline
                            />
                          </div>
                        </div>

                        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <MapPin size={16} className="text-blue-600" />
                            Location
                          </h3>
                          <div className="space-y-3">
                            <CompactEditableRow
                              label="Full Address"
                              value={editData.full_address}
                              isEditing={editingField === 'full_address'}
                              onEdit={() => startEditing('full_address')}
                              onSave={stopEditing}
                              onChange={(v) => setEditData({ ...editData, full_address: v })}
                              multiline
                            />
                            <CompactEditableRow
                              label="City"
                              value={editData.city}
                              isEditing={editingField === 'city'}
                              onEdit={() => startEditing('city')}
                              onSave={stopEditing}
                              onChange={(v) => setEditData({ ...editData, city: v })}
                            />
                            <CompactEditableRow
                              label="State"
                              value={editData.state}
                              isEditing={editingField === 'state'}
                              onEdit={() => startEditing('state')}
                              onSave={stopEditing}
                              onChange={(v) => setEditData({ ...editData, state: v })}
                            />
                            <CompactEditableRow
                              label="Landmark"
                              value={editData.landmark}
                              isEditing={editingField === 'landmark'}
                              onEdit={() => startEditing('landmark')}
                              onSave={stopEditing}
                              onChange={(v) => setEditData({ ...editData, landmark: v })}
                            />
                            <CompactEditableRow
                              label="Postal Code"
                              value={editData.postal_code}
                              isEditing={editingField === 'postal_code'}
                              onEdit={() => startEditing('postal_code')}
                              onSave={stopEditing}
                              onChange={(v) => setEditData({ ...editData, postal_code: v })}
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <CompactEditableRow
                                label="Latitude"
                                value={editData.latitude}
                                isEditing={editingField === 'latitude'}
                                onEdit={() => startEditing('latitude')}
                                onSave={stopEditing}
                                onChange={(v) => setEditData({ ...editData, latitude: parseFloat(v) })}
                              />
                              <CompactEditableRow
                                label="Longitude"
                                value={editData.longitude}
                                isEditing={editingField === 'longitude'}
                                onEdit={() => startEditing('longitude')}
                                onSave={stopEditing}
                                onChange={(v) => setEditData({ ...editData, longitude: parseFloat(v) })}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* COLUMN 2: TIMINGS & OPERATIONS */}
                      <div className="space-y-4">
                        <OperatingDaysCard storeId={storeId} />

                        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <User size={16} className="text-blue-600" />
                            Area Manager
                          </h3>
                          <div className="space-y-3">
                            <CompactEditableRow
                              label="AM Name"
                              value={editData.am_name}
                              isEditing={editingField === 'am_name'}
                              onEdit={() => startEditing('am_name')}
                              onSave={stopEditing}
                              onChange={(v) => setEditData({ ...editData, am_name: v })}
                            />
                            <CompactEditableRow
                              label="AM Mobile"
                              value={editData.am_mobile}
                              isEditing={editingField === 'am_mobile'}
                              onEdit={() => startEditing('am_mobile')}
                              onSave={stopEditing}
                              onChange={(v) => setEditData({ ...editData, am_mobile: v })}
                            />
                            <CompactEditableRow
                              label="AM Email"
                              value={editData.am_email}
                              isEditing={editingField === 'am_email'}
                              onEdit={() => startEditing('am_email')}
                              onSave={stopEditing}
                              onChange={(v) => setEditData({ ...editData, am_email: v })}
                            />
                          </div>
                        </div>

                        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <Activity size={16} className="text-blue-600" />
                            Store Info
                          </h3>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="flex items-center gap-2">
                              <Hash size={12} className="text-gray-500" />
                              <span className="text-gray-800">Store ID:</span>
                              <span className="font-semibold text-gray-900">{store.store_id}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar size={12} className="text-gray-500" />
                              <span className="text-gray-800">Created:</span>
                              <span className="font-semibold text-gray-900">{formatDate(store.created_at)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Activity size={12} className="text-gray-500" />
                              <span className="text-gray-800">Status:</span>
                              <span className={`font-semibold ${
                                store.approval_status === 'APPROVED' ? 'text-green-600' :
                                store.approval_status === 'REJECTED' ? 'text-red-600' :
                                'text-yellow-600'
                              }`}>
                                {store.approval_status || 'SUBMITTED'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Activity size={12} className="text-gray-500" />
                              <span className="text-gray-800">Active:</span>
                              <label className="inline-flex items-center cursor-pointer ml-2">
                                <input
                                  type="checkbox"
                                  checked={!!editData && editData.status === 'ACTIVE'}
                                  onChange={async (e) => {
                                    if (!editData || !store || !storeId) return;
                                    const prevStatus = editData.status;
                                    const prevOperational = editData.operational_status;
                                    // Use correct enum value for status and operational_status
                                    const newStatus = e.target.checked ? 'ACTIVE' : 'INACTIVE';
                                    const newOperational = e.target.checked ? 'OPEN' : 'CLOSED';
                                    // Optimistically update UI
                                    setEditData({ ...editData, status: newStatus, operational_status: newOperational });
                                    setStore({ ...store, status: newStatus, operational_status: newOperational });
                                    try {
                                      const ok = await updateStoreInfo(storeId, { status: newStatus, operational_status: newOperational });
                                      if (!ok) throw new Error('Update failed');
                                      toast.success(`Store is now ${newStatus} (${newOperational})`);
                                    } catch (err) {
                                      // Revert UI if update fails
                                      setEditData({ ...editData, status: prevStatus, operational_status: prevOperational });
                                      setStore({ ...store, status: prevStatus, operational_status: prevOperational });
                                      toast.error('Failed to update store status');
                                    }
                                  }}
                                  className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:bg-green-500 transition-all relative">
                                  <div className={`absolute left-1 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${editData.status === 'ACTIVE' ? 'translate-x-4' : ''}`}></div>
                                </div>
                              </label>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* COLUMN 3: DOCUMENTS & IMAGES */}
                      <div className="space-y-4">
                        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <Shield size={16} className="text-blue-600" />
                            Legal Documents
                          </h3>
                          <div className="space-y-3">
                            <CompactLockedRow
                              label="GST Number"
                              value={store.gst_number}
                            />
                            <CompactLockedRow
                              label="PAN Number"
                              value={store.pan_number}
                            />
                            <CompactLockedRow
                              label="Aadhar Number"
                              value={store.aadhar_number}
                            />
                            <CompactLockedRow
                              label="FSSAI Number"
                              value={store.fssai_number}
                            />
                            {store.gst_image_url && (
                              <div>
                                <div className="text-xs font-medium text-gray-600 mb-1">GST Image</div>
                                <img src={store.gst_image_url} alt="GST" className="h-20 rounded border" />
                              </div>
                            )}
                            {store.pan_image_url && (
                              <div>
                                <div className="text-xs font-medium text-gray-600 mb-1">PAN Image</div>
                                <img src={store.pan_image_url} alt="PAN" className="h-20 rounded border" />
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="bg-gray-50 rounded-lg p-2 border border-gray-200">
                          <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                            <Banknote size={16} className="text-blue-600" />
                            Bank Details
                          </h3>
                          <div className="space-y-1 text-sm">
                            <CompactLockedRow
                              label="Account Holder"
                              value={store.bank_account_holder}
                            />
                            <CompactLockedRow
                              label="Account Number"
                              value={store.bank_account_number}
                            />
                            <CompactLockedRow
                              label="IFSC Code"
                              value={store.bank_ifsc}
                            />
                            <CompactLockedRow
                              label="Bank Name"
                              value={store.bank_name}
                            />
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-gray-900">Accepts Online Payment</span>
                              <label className="inline-flex items-center cursor-pointer ml-2">
                                <input
                                  type="checkbox"
                                  checked={!!editData.accepts_online_payment}
                                  onChange={async (e) => {
                                    const newValue = e.target.checked;
                                    setEditData({ ...editData, accepts_online_payment: newValue });
                                    setStore({ ...store, accepts_online_payment: newValue });
                                    try {
                                      await updateStoreInfo(storeId, { accepts_online_payment: newValue });
                                      toast.success(`Accepts Online Payment: ${newValue ? 'Yes' : 'No'}`);
                                    } catch (err) {
                                      toast.error('Failed to update Online Payment status');
                                    }
                                  }}
                                  className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:bg-green-500 transition-all relative">
                                  <div className={`absolute left-1 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${editData.accepts_online_payment ? 'translate-x-4' : ''}`}></div>
                                </div>
                              </label>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-1">
                              <span className="font-medium text-gray-900">Accepts Cash</span>
                              <label className="inline-flex items-center cursor-pointer ml-2">
                                <input
                                  type="checkbox"
                                  checked={!!editData.accepts_cash}
                                  onChange={async (e) => {
                                    const newValue = e.target.checked;
                                    setEditData({ ...editData, accepts_cash: newValue });
                                    setStore({ ...store, accepts_cash: newValue });
                                    try {
                                      await updateStoreInfo(storeId, { accepts_cash: newValue });
                                      toast.success(`Accepts Cash: ${newValue ? 'Yes' : 'No'}`);
                                    } catch (err) {
                                      toast.error('Failed to update Cash status');
                                    }
                                  }}
                                  className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:bg-green-500 transition-all relative">
                                  <div className={`absolute left-1 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${editData.accepts_cash ? 'translate-x-4' : ''}`}></div>
                                </div>
                              </label>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* IMAGE CARDS - HORIZONTAL LAYOUT */}
                    <div
                      className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5"
                      style={{
                        maxHeight: 'calc(100vh - 15px - 120px)', // 120px is a safe header/spacing estimate
                        overflowY: 'auto',
                        paddingBottom: '15px',
                      }}
                    >
                      {/* STORE BANNER CARD */}
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-100">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h3 className="text-sm font-semibold text-gray-900 mb-1">
                              Store Banner
                            </h3>
                            <p className="text-xs text-gray-600">
                              Upload your store banner image
                            </p>
                          </div>
                          <button
                            type="button"
                            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium"
                            onClick={() => bannerInputRef.current?.click()}
                          >
                            <Upload size={12} />
                            Upload Banner
                          </button>
                          <input
                            type="file"
                            accept="image/*"
                            ref={bannerInputRef}
                            style={{ display: "none" }}
                            onChange={(e) => handleImageUpload(e, 'banner')}
                          />
                        </div>
                        {store.banner_url ? (
                          <img
                            src={store.banner_url}
                            alt="Store Banner"
                            className="mt-2 rounded-lg w-full h-48 object-cover"
                          />
                        ) : (
                          <div className="mt-2 h-48 bg-gray-100 rounded-lg flex items-center justify-center">
                            <div className="text-center">
                              <ImageIcon size={24} className="text-gray-400 mx-auto mb-2" />
                              <p className="text-xs text-gray-500">No banner uploaded</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* ADS IMAGES CARD */}
                      <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4 border border-green-100">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h3 className="text-sm font-semibold text-gray-900 mb-1">
                              Gallery Images ({store.ads_images?.length || 0}/5)
                            </h3>
                            <p className="text-xs text-gray-600">
                              Upload up to 5 promotional images
                            </p>
                          </div>
                          <button
                            type="button"
                            className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium"
                            onClick={() => setShowImageUploadModal(true)}
                            disabled={(store.ads_images?.length || 0) >= 5}
                          >
                            <Upload size={12} />
                            Upload Ads
                          </button>
                        </div>
                        
                        {/* ADS IMAGES GRID */}
                        <div className="grid grid-cols-2 gap-2 mt-3">
                          {store.ads_images?.map((img, index) => (
                            <div key={index} className="relative group">
                              <img
                                src={img}
                                alt={`Ad ${index + 1}`}
                                className="w-full h-24 object-cover rounded-lg"
                              />
                              <button
                                onClick={() => handleRemoveAdImage(index)}
                                className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                          {uploadingImages.map((img, index) => (
                            <div key={`uploading-${index}`} className="relative">
                              <img
                                src={img}
                                alt="Uploading..."
                                className="w-full h-24 object-cover rounded-lg opacity-50"
                              />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                              </div>
                            </div>
                          ))}
                          {(!store.ads_images || store.ads_images.length === 0) && uploadingImages.length === 0 && (
                            <div className="col-span-2 h-48 bg-gray-100 rounded-lg flex items-center justify-center">
                              <div className="text-center">
                                <ImageIcon size={24} className="text-gray-400 mx-auto mb-2" />
                                <p className="text-xs text-gray-500">No ads images</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* IMAGE UPLOAD MODAL */}
        {showImageUploadModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload Ads Images</h3>
              <p className="text-sm text-gray-600 mb-4">
                Upload promotional images (max 5 total). You can upload {5 - (store.ads_images?.length || 0)} more.
              </p>
              
              <div className="mb-6">
                <div className="flex items-center justify-center w-full">
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-8 h-8 mb-3 text-gray-400" />
                      <p className="mb-2 text-sm text-gray-500">
                        <span className="font-semibold">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      ref={adsInputRef}
                      onChange={(e) => handleImageUpload(e, 'ads')}
                    />
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button 
                  onClick={() => setShowImageUploadModal(false)}
                  className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button
                  onClick={() => adsInputRef.current?.click()}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium"
                >
                  Select Images
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SAVE CONFIRM MODAL */}
        {confirmSave && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-5 w-full max-w-sm mx-4">
              <h3 className="text-base font-semibold text-gray-900 mb-2">Save Changes?</h3>
              <p className="text-sm text-gray-600 mb-4">
                Confirm to update your profile information
              </p>
              <div className="flex justify-end gap-2">
                <button 
                  onClick={() => setConfirmSave(false)}
                  className="px-3 py-1.5 text-sm text-gray-700 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded text-sm font-medium"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </MXLayoutWhite>
    </ProfileErrorBoundary>
  );
}

/* ================= COMPACT COMPONENTS ================= */

function CompactEditableRow({
  label,
  value,
  isEditing,
  onEdit,
  onSave,
  onChange,
  multiline = false,
  prefix = "",
}: {
  label: string;
  value?: any;
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onChange: (value: string) => void;
  multiline?: boolean;
  prefix?: string;
}) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline) {
      onSave();
    }
    if (e.key === 'Escape') {
      onSave();
    }
  };

  return (
    <div className="group">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        {!isEditing ? (
          <button
            onClick={onEdit}
            className="text-blue-600 hover:text-blue-800 opacity-0 group-hover:opacity-100 transition-all"
          >
            <Edit2 size={12} />
          </button>
        ) : (
          <button
            onClick={onSave}
            className="text-green-600 hover:text-green-800 text-xs"
          >
            Save
          </button>
        )}
      </div>
      {isEditing ? (
        multiline ? (
          <textarea
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onSave}
            onKeyDown={handleKeyDown}
            className="w-full border border-blue-300 rounded px-2 py-1 text-sm text-gray-900 bg-white focus:ring-1 focus:ring-blue-500 focus:border-transparent"
            rows={2}
            autoFocus
          />
        ) : (
          <input
            type={label.toLowerCase().includes('time') ? 'time' : 'text'}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onSave}
            onKeyDown={handleKeyDown}
            className="w-full border border-blue-300 rounded px-2 py-1 text-sm text-gray-900 bg-white focus:ring-1 focus:ring-blue-500 focus:border-transparent"
            autoFocus
          />
        )
      ) : (
        <div className="text-sm text-gray-900 font-medium truncate">
          {prefix && <span className="text-gray-600">{prefix}</span>}
          {value || <span className="text-gray-400">Not set</span>}
        </div>
      )}
    </div>
  );
}

function CompactLockedRow({
  label,
  value,
}: {
  label: string;
  value?: any;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        <span className="text-xs text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
          Read Only
        </span>
      </div>
      <div className="text-sm text-gray-900 font-medium">
        {value || <span className="text-gray-400">—</span>}
      </div>
    </div>
  );
}