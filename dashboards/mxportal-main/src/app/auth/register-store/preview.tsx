"use client";
// Extend Window interface for __PARENT_INFO__
declare global {
  interface Window {
    __PARENT_INFO__?: any;
  }
}
import { useState } from "react";
// No direct supabase import needed for client
import { ChevronLeft, CheckCircle, AlertCircle, Upload } from "lucide-react";

interface PreviewPageProps {
  step1: any;
  step2: any;
  documents: any;
  storeSetup: any;
  parentInfo: any;
  onBack: () => void;
  onSuccess: (storeId: string) => void;
}

const PreviewPage = ({ step1, step2, documents, storeSetup, parentInfo, onBack, onSuccess }: PreviewPageProps) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      // 1. Get parent merchant code (e.g., GMCC) from step1 or context
      const parentMerchantId = step1.parent_merchant_id || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('parent_id') : null);
      if (!parentMerchantId) throw new Error('Parent merchant ID missing');

      // Upload files to R2 and collect URLs
      async function uploadToR2(file: File, parent: string, filename: string): Promise<string | null> {
        if (!file) return null;
        const form = new FormData();
        form.append('file', file);
        form.append('parent', parent || '');
        form.append('filename', filename || file.name);
        const res = await fetch('/api/upload/r2', { method: 'POST', body: form });
        const data = await res.json();
        if (!data.url) throw new Error('Image upload failed');
        return data.url;
      }

      // Use parentMerchantId for folder naming (already declared above)
      const storeFolder = parentMerchantId || 'store';
      const logoUrl = await uploadToR2(storeSetup.logo, storeFolder, 'logo');
      const bannerUrl = await uploadToR2(storeSetup.banner, storeFolder, 'banner');
      const galleryUrls = await Promise.all((storeSetup.gallery_images || []).map((file: File, idx: number) => uploadToR2(file, storeFolder, `gallery_${idx+1}`)));

      // Upload documents and collect URLs
      const documentUrls: { type: string, url: string, name: string }[] = [];
      for (const [key, value] of Object.entries(documents)) {
        if (value instanceof File) {
          const url = await uploadToR2(value, storeFolder, key);
          documentUrls.push({ type: key.toUpperCase(), url, name: value.name });
        }
      }

      // Call the API route to register the store
      // Get parentInfo from window if available (injected in page.tsx and passed as prop)
      const res = await fetch('/api/register-store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step1,
          step2,
          storeSetup,
          documents: undefined, // don't send files
          logoUrl,
          bannerUrl,
          galleryUrls,
          documentUrls,
          parentInfo
        })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Registration failed');
      onSuccess(result.storeId);
    } catch (e: unknown) {
      if (typeof e === 'object' && e && 'message' in e) {
        setError((e as any).message || 'Submission failed');
      } else {
        setError('Submission failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-red-50 to-white flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-red-100 max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-red-700 mb-2">Oops! Something went wrong</h2>
          <p className="text-red-600 mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-400 text-white rounded-lg hover:from-orange-600 hover:to-orange-500 transition-all duration-200 font-medium shadow-md hover:shadow-lg w-full"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!step1 || !step2 || !documents || !storeSetup) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Loading preview data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-gradient-to-br from-slate-50 to-white overflow-hidden">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Preview & Submit</h1>
                <p className="text-slate-500 text-sm">Review all details before final submission</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="px-5 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2 font-medium"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <button 
                onClick={handleSubmit} 
                disabled={submitting}
                className="px-8 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all duration-200 font-semibold flex items-center gap-2 shadow-md hover:shadow-lg"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Submitting...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Submit Application
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Scrollable Area */}
      <div className="h-[calc(100vh-5rem)] w-full overflow-y-auto scrollbar-hide">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Store Info */}
            <div className="lg:col-span-2 space-y-8">
              {/* Store Information Card */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-slate-200">
                  <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                    <div className="w-2 h-2 bg-indigo-600 rounded-full"></div>
                    Store Information
                  </h2>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Store Name</label>
                        <p className="text-slate-900 font-medium mt-1">{step1.store_name}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Store Type</label>
                        <p className="text-slate-900 font-medium mt-1">{step1.store_type}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Description</label>
                        <p className="text-slate-900 mt-1 text-sm">{step1.store_description}</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Display Name</label>
                        <p className="text-slate-900 font-medium mt-1">{step1.store_display_name}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Contact Email</label>
                        <p className="text-slate-900 font-medium mt-1">{step1.store_email}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Phone Numbers</label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {step1.store_phones?.map((phone: string, idx: number) => (
                            <span key={idx} className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm">
                              {phone}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Location Card */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-slate-200">
                  <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                    Location Details
                  </h2>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Full Address</label>
                        <p className="text-slate-900 font-medium mt-1">{step2.full_address}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">City</label>
                        <p className="text-slate-900 font-medium mt-1">{step2.city}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Postal Code</label>
                        <p className="text-slate-900 font-medium mt-1">{step2.postal_code}</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">State</label>
                        <p className="text-slate-900 font-medium mt-1">{step2.state}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Landmark</label>
                        <p className="text-slate-900 font-medium mt-1">{step2.landmark}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Coordinates</label>
                        <p className="text-slate-900 font-medium mt-1">{step2.latitude}, {step2.longitude}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Store Setup Card */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-slate-200">
                  <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-600 rounded-full"></div>
                    Store Configuration
                  </h2>
                </div>
                <div className="p-6">
                  <div className="space-y-6">
                    {/* Media Section */}
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700 mb-3">Media Assets</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-slate-500">Store Logo</label>
                          {storeSetup.logo_preview && (
                            <div className="w-24 h-24 rounded-xl border-2 border-slate-200 overflow-hidden bg-white p-2">
                              <img 
                                src={storeSetup.logo_preview} 
                                alt="Logo" 
                                className="w-full h-full object-contain"
                              />
                            </div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-slate-500">Store Banner</label>
                          {storeSetup.banner_preview && (
                            <div className="h-24 rounded-xl border-2 border-slate-200 overflow-hidden">
                              <img 
                                src={storeSetup.banner_preview} 
                                alt="Banner" 
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                      {storeSetup.gallery_previews && storeSetup.gallery_previews.length > 0 && (
                        <div className="mt-4">
                          <label className="text-xs font-medium text-slate-500">Gallery Images</label>
                          <div className="flex flex-wrap gap-3 mt-2">
                            {storeSetup.gallery_previews.map((src: string, idx: number) => (
                              <div key={idx} className="relative group">
                                <div className="w-20 h-20 rounded-lg border-2 border-slate-200 overflow-hidden">
                                  <img 
                                    src={src} 
                                    alt={`Gallery ${idx+1}`} 
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                                  <span className="text-white text-xs font-medium">Image {idx+1}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Store Details Grid */}
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700 mb-3">Store Details</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div className="bg-slate-50 rounded-lg p-3">
                          <label className="text-xs font-medium text-slate-500">Preparation Time</label>
                          <p className="text-slate-900 font-semibold mt-1">{storeSetup.avg_preparation_time_minutes} min</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3">
                          <label className="text-xs font-medium text-slate-500">Min Order</label>
                          <p className="text-slate-900 font-semibold mt-1">₹{storeSetup.min_order_amount}</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3">
                          <label className="text-xs font-medium text-slate-500">Delivery Radius</label>
                          <p className="text-slate-900 font-semibold mt-1">{storeSetup.delivery_radius_km} km</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3">
                          <label className="text-xs font-medium text-slate-500">Pure Veg</label>
                          <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${
                            storeSetup.is_pure_veg ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {storeSetup.is_pure_veg ? 'Yes' : 'No'}
                          </div>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3">
                          <label className="text-xs font-medium text-slate-500">Online Payment</label>
                          <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${
                            storeSetup.accepts_online_payment ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {storeSetup.accepts_online_payment ? 'Yes' : 'No'}
                          </div>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3">
                          <label className="text-xs font-medium text-slate-500">Cash Payment</label>
                          <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${
                            storeSetup.accepts_cash ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {storeSetup.accepts_cash ? 'Yes' : 'No'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Cuisines and Categories */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-700 mb-2">Cuisine Types</h3>
                        <div className="flex flex-wrap gap-2">
                          {storeSetup.cuisine_types?.map((cuisine: string, idx: number) => (
                            <span key={idx} className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded-full text-sm font-medium border border-purple-100">
                              {cuisine}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-slate-700 mb-2">Food Categories</h3>
                        <div className="flex flex-wrap gap-2">
                          {storeSetup.food_categories?.map((category: string, idx: number) => (
                            <span key={idx} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-sm font-medium border border-blue-100">
                              {category}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Store Hours */}
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700 mb-3">Store Hours</h3>
                      <div className="bg-slate-50 rounded-xl p-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                          {storeSetup.store_hours && Object.entries(storeSetup.store_hours).map(([day, hours]: any) => (
                            <div key={day} className="bg-white rounded-lg p-3 border border-slate-200">
                              <div className="text-xs font-semibold text-slate-900 mb-1">{day}</div>
                              <div className="text-sm text-slate-700">
                                {hours.open} - {hours.close}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Documents & Summary */}
            <div className="space-y-8">
              {/* Documents Card */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-slate-200">
                  <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                    <div className="w-2 h-2 bg-amber-600 rounded-full"></div>
                    Documents
                  </h2>
                </div>
                <div className="p-6">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                      <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <span className="text-indigo-600 font-semibold text-sm">PAN</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-500">PAN Number</p>
                        <p className="text-slate-900 font-mono text-sm truncate">{documents.pan_number}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <span className="text-blue-600 font-semibold text-sm">AAD</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-500">Aadhar Number</p>
                        <p className="text-slate-900 font-mono text-sm truncate">{documents.aadhar_number}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                      <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <span className="text-emerald-600 font-semibold text-sm">FSS</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-500">FSSAI Number</p>
                        <p className="text-slate-900 font-mono text-sm truncate">{documents.fssai_number}</p>
                      </div>
                    </div>
                    {documents.gst_number && (
                      <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                        <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="text-purple-600 font-semibold text-sm">GST</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-500">GST Number</p>
                          <p className="text-slate-900 font-mono text-sm truncate">{documents.gst_number}</p>
                        </div>
                      </div>
                    )}
                    {documents.drug_license_number && (
                      <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                        <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="text-red-600 font-semibold text-sm">DL</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-500">Drug License</p>
                          <p className="text-slate-900 font-mono text-sm truncate">{documents.drug_license_number}</p>
                        </div>
                      </div>
                    )}
                    {documents.pharmacist_registration_number && (
                      <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                        <div className="w-8 h-8 bg-cyan-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="text-cyan-600 font-semibold text-sm">PR</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-500">Pharmacist Registration</p>
                          <p className="text-slate-900 font-mono text-sm truncate">{documents.pharmacist_registration_number}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Summary Card */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl shadow-lg p-6 text-white">
                <h3 className="text-lg font-semibold mb-4">Application Summary</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Sections Completed</span>
                    <span className="font-semibold">4/4</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Documents Uploaded</span>
                    <span className="font-semibold">
                      {Object.keys(documents).filter(k => documents[k] !== null && documents[k] !== '').length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Store Status</span>
                    <span className="px-2 py-1 bg-yellow-500/20 text-yellow-300 rounded-full text-xs font-medium">
                      Pending Review
                    </span>
                  </div>
                  <div className="pt-4 mt-4 border-t border-slate-700">
                    <div className="text-sm text-slate-300 mb-2">
                      By submitting, you agree to our terms and conditions
                    </div>
                    <button 
                      onClick={handleSubmit} 
                      disabled={submitting}
                      className="w-full px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg hover:from-indigo-600 hover:to-purple-600 disabled:opacity-50 transition-all duration-200 font-semibold flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
                    >
                      {submitting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          Processing Submission...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          Submit Store Application
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Help Card */}
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl border border-blue-100 p-6">
                <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-blue-600" />
                  Need Help?
                </h3>
                <p className="text-sm text-slate-600 mb-3">
                  Contact our support team if you need to make changes or have questions.
                </p>
                <div className="space-y-2">
                  <a href="mailto:support@example.com" className="text-sm text-blue-600 hover:text-blue-700 font-medium block">
                    support@example.com
                  </a>
                  <a href="tel:+911234567890" className="text-sm text-blue-600 hover:text-blue-700 font-medium block">
                    +91 123 456 7890
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Global Styles for Scrollbar Hide */}
      <style jsx global>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default PreviewPage;