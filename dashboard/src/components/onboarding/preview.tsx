"use client";
// Extend Window interface for __PARENT_INFO__
declare global {
  interface Window {
    __PARENT_INFO__?: any;
  }
}
import React, { useMemo } from "react";
// No direct supabase import needed for client
import { ChevronLeft, CheckCircle, AlertCircle, Loader2, Mail, Phone, HelpCircle, ExternalLink } from "lucide-react";

/** Normalize attachment URL so "View attachment" links and img src always work. Handles full R2 signed URLs, proxy paths, data URLs, and raw R2 keys (which otherwise resolve as localhost/auth/merchants/... and fail). */
function normalizeAttachmentHref(url: string | null | undefined): string | null {
  if (url == null || typeof url !== "string") return null;
  const u = url.trim();
  if (!u) return null;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("data:")) return u;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  if (u.startsWith("/")) return origin ? `${origin}${u}` : u;
  return origin ? `${origin}/api/attachments/proxy?key=${encodeURIComponent(u)}` : `/api/attachments/proxy?key=${encodeURIComponent(u)}`;
}

/** Same as normalizeAttachmentHref; use for img src so logo/banner/gallery load when stored as R2 key or relative path. */
function normalizedImageSrc(url: string | null | undefined): string {
  const normalized = normalizeAttachmentHref(url);
  return normalized ?? (typeof url === "string" ? url : "");
}

interface PreviewPageProps {
  step1: any;
  step2: any;
  documents: any;
  storeSetup: any;
  menuData?: {
    menuUploadMode?: 'IMAGE' | 'CSV' | 'PDF';
    menuImageFiles?: File[];
    menuSpreadsheetFile?: File | null;
    menuImageUrls?: string[];
    menuSpreadsheetUrl?: string | null;
    menuPdfUrl?: string | null;
    menuPdfFileName?: string | null;
  };
  parentInfo: any;
  onBack: () => void;
  onContinueToPlans: () => void;
  actionLoading?: boolean;
  showFooter?: boolean;
}

const PreviewPage = ({ step1, step2, documents, storeSetup, menuData, parentInfo, onBack, onContinueToPlans, actionLoading = false, showFooter = true }: PreviewPageProps) => {

  // Calculate document count based on visible logical documents,
  // not every key in the documents object – this matches the cards
  // rendered in the "Documents" section + bank block.
  const documentCount = useMemo(() => {
    if (!documents) return 0;

    let count = 0;

    if (documents.pan_number) count += 1;
    if (documents.aadhar_number) count += 1;
    if (documents.fssai_number) count += 1;
    if (documents.gst_number) count += 1;
    if (documents.drug_license_number) count += 1;
    if (documents.pharmacist_registration_number) count += 1;

    // Additional licenses stored only in extended AM flow
    if (documents.trade_license_number) count += 1;
    if (documents.shop_establishment_number) count += 1;
    if (documents.udyam_number) count += 1;
    if (documents.other_document_number || documents.other_document_type) count += 1;

    // Bank / payout details – treat as one logical document if present
    if (documents.bank && Object.keys(documents.bank).length > 0) count += 1;

    return count;
  }, [documents]);

  // Format store hours dynamically
  const formattedStoreHours = useMemo(() => {
    if (!storeSetup?.store_hours) return [];
    return Object.entries(storeSetup.store_hours).map(([day, hours]: any) => {
      const dayName = day.charAt(0).toUpperCase() + day.slice(1);
      if (hours.closed) {
        return { day: dayName, status: 'closed' };
      }
      const slots = [];
      if (hours.slot1_open && hours.slot1_close) {
        slots.push(`${hours.slot1_open} - ${hours.slot1_close}`);
      }
      if (hours.slot2_open && hours.slot2_close) {
        slots.push(`${hours.slot2_open} - ${hours.slot2_close}`);
      }
      return { day: dayName, slots, status: 'open' };
    });
  }, [storeSetup?.store_hours]);

  if (!step1 || !step2 || !documents || !storeSetup) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 to-white flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-12 h-12 sm:w-16 sm:h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3 sm:mb-4"></div>
          <p className="text-slate-600 font-medium text-sm sm:text-base">Loading preview data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full max-w-full bg-gradient-to-br from-slate-50 to-white overflow-x-hidden flex flex-col">
      {/* Header - compact */}
      <div className="sticky top-0 z-10 flex-shrink-0 bg-white/95 backdrop-blur-sm border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-2 sm:py-2.5">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">Preview & Submit</h1>
              <p className="text-slate-500 text-[10px] sm:text-xs truncate">Review all details before final submission</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Scrollable */}
      <div className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden scrollbar-hide pb-20 sm:pb-24">
        <div className="max-w-7xl mx-auto px-2 sm:px-3 md:px-4 lg:px-6 py-3 sm:py-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5">
            {/* Left Column - Store Info */}
            <div className="lg:col-span-2 space-y-3 sm:space-y-4 min-w-0">
              {/* Store Information Card */}
              <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-3 sm:px-4 py-2 sm:py-2.5 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-slate-200">
                  <h2 className="text-sm sm:text-base font-semibold text-slate-900 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full flex-shrink-0"></div>
                    <span className="truncate">Store Information</span>
                  </h2>
                </div>
                <div className="p-3 sm:p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="space-y-2 sm:space-y-2.5 min-w-0">
                      <div className="min-w-0">
                        <label className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider">Store Name</label>
                        <p className="text-slate-900 font-medium mt-0.5 text-xs sm:text-sm break-words">{step1.store_name || '-'}</p>
                      </div>
                      <div className="min-w-0">
                        <label className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider">Store Type</label>
                        <p className="text-slate-900 font-medium mt-0.5 text-xs sm:text-sm">{step1.store_type || '-'}</p>
                      </div>
                      <div className="min-w-0">
                        <label className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider">Description</label>
                        <p className="text-slate-600 mt-0.5 text-xs sm:text-sm break-words line-clamp-2">{step1.store_description || '-'}</p>
                      </div>
                    </div>
                    <div className="space-y-2 sm:space-y-2.5 min-w-0">
                      <div>
                        <label className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider">Display Name</label>
                        <p className="text-slate-900 font-medium mt-0.5 text-xs sm:text-sm">{step1.store_display_name || '-'}</p>
                      </div>
                      <div>
                        <label className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider">Contact Email</label>
                        <p className="text-slate-900 font-medium mt-0.5 text-xs sm:text-sm break-all">{step1.store_email || '-'}</p>
                      </div>
                      <div>
                        <label className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider">Phone Numbers</label>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {step1.store_phones?.length > 0 ? step1.store_phones.map((phone: string, idx: number) => (
                            <span key={idx} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full text-[10px] sm:text-xs">
                              {phone}
                            </span>
                          )) : <span className="text-xs text-slate-400">-</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Location Card */}
              <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-3 sm:px-4 py-2 sm:py-2.5 bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-slate-200">
                  <h2 className="text-sm sm:text-base font-semibold text-slate-900 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-blue-600 rounded-full flex-shrink-0"></div>
                    <span className="truncate">Location Details</span>
                  </h2>
                </div>
                <div className="p-3 sm:p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="space-y-2 sm:space-y-2.5 min-w-0">
                      <div>
                        <label className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider">Full Address</label>
                        <p className="text-slate-900 font-medium mt-0.5 text-xs sm:text-sm break-words">{step2.full_address || '-'}</p>
                      </div>
                      <div>
                        <label className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider">City</label>
                        <p className="text-slate-900 font-medium mt-0.5 text-xs sm:text-sm">{step2.city || '-'}</p>
                      </div>
                      <div>
                        <label className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider">Postal Code</label>
                        <p className="text-slate-900 font-medium mt-0.5 text-xs sm:text-sm">{step2.postal_code || '-'}</p>
                      </div>
                    </div>
                    <div className="space-y-2 sm:space-y-2.5 min-w-0">
                      <div>
                        <label className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider">State</label>
                        <p className="text-slate-900 font-medium mt-0.5 text-xs sm:text-sm">{step2.state || '-'}</p>
                      </div>
                      <div>
                        <label className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider">Landmark</label>
                        <p className="text-slate-600 mt-0.5 text-xs sm:text-sm break-words">{step2.landmark || '-'}</p>
                      </div>
                      <div>
                        <label className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider">Coordinates</label>
                        <p className="text-slate-600 mt-0.5 text-xs sm:text-sm break-all font-mono">{step2.latitude && step2.longitude ? `${step2.latitude}, ${step2.longitude}` : '-'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Store Setup Card */}
              <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-3 sm:px-4 py-2 sm:py-2.5 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-slate-200">
                  <h2 className="text-sm sm:text-base font-semibold text-slate-900 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-emerald-600 rounded-full flex-shrink-0"></div>
                    <span className="truncate">Store Configuration</span>
                  </h2>
                </div>
                <div className="p-3 sm:p-4">
                  <div className="space-y-3 sm:space-y-4">
                    {/* Media Section - use _preview (data URLs) or _url (R2 URLs) as fallback */}
                    {(() => {
                      const logoSrc = storeSetup.logo_preview || storeSetup.logo_url;
                      const bannerSrc = storeSetup.banner_preview || storeSetup.banner_url;
                      const galleryUrls = Array.isArray(storeSetup.gallery_previews) && storeSetup.gallery_previews.length > 0
                        ? storeSetup.gallery_previews
                        : (Array.isArray(storeSetup.gallery_image_urls) ? storeSetup.gallery_image_urls : []);
                      const hasMedia = !!(logoSrc || bannerSrc || galleryUrls.length > 0);
                      if (!hasMedia) return null;
                      return (
                        <div className="min-w-0">
                          <h3 className="text-xs sm:text-sm font-semibold text-slate-700 mb-2">Media Assets</h3>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                            {logoSrc && (
                              <div className="space-y-1">
                                <label className="text-[10px] sm:text-xs font-medium text-slate-500">Logo</label>
                                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg border-2 border-slate-200 overflow-hidden bg-white p-1">
                                  <img
                                    src={normalizedImageSrc(logoSrc)}
                                    alt="Logo"
                                    className="w-full h-full object-contain"
                                    referrerPolicy="no-referrer"
                                  />
                                </div>
                              </div>
                            )}
                            {bannerSrc && (
                              <div className="space-y-1">
                                <label className="text-[10px] sm:text-xs font-medium text-slate-500">Banner</label>
                                <div className="h-16 sm:h-20 rounded-lg border-2 border-slate-200 overflow-hidden">
                                  <img
                                    src={normalizedImageSrc(bannerSrc)}
                                    alt="Banner"
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                </div>
                              </div>
                            )}
                            {galleryUrls.length > 0 && (
                              <div className="space-y-1">
                                <label className="text-[10px] sm:text-xs font-medium text-slate-500">
                                  Gallery ({Math.min(galleryUrls.length, 5)})
                                </label>
                                <div className="flex gap-1">
                                  {galleryUrls.slice(0, 5).map((src: string, idx: number) => (
                                    <div
                                      key={idx}
                                      className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg border-2 border-slate-200 overflow-hidden flex-shrink-0"
                                    >
                                      <img
                                        src={normalizedImageSrc(src)}
                                        alt={`Gallery ${idx + 1}`}
                                        className="w-full h-full object-cover"
                                        referrerPolicy="no-referrer"
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Store Details Grid */}
                    <div className="min-w-0">
                      <h3 className="text-xs sm:text-sm font-semibold text-slate-700 mb-2">Store Details</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
                        <div className="bg-slate-50 rounded-lg p-2 sm:p-2.5">
                          <label className="text-[10px] sm:text-xs font-medium text-slate-500">Delivery Radius</label>
                          <p className="text-slate-900 font-semibold mt-0.5 text-xs sm:text-sm">{storeSetup.delivery_radius_km || 0} km</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-2 sm:p-2.5">
                          <label className="text-[10px] sm:text-xs font-medium text-slate-500">Pure Veg</label>
                          <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium mt-0.5 ${
                            storeSetup.is_pure_veg ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {storeSetup.is_pure_veg ? 'Yes' : 'No'}
                          </div>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-2 sm:p-2.5">
                          <label className="text-[10px] sm:text-xs font-medium text-slate-500">Online Payment</label>
                          <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium mt-0.5 ${
                            storeSetup.accepts_online_payment ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {storeSetup.accepts_online_payment ? 'Yes' : 'No'}
                          </div>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-2 sm:p-2.5">
                          <label className="text-[10px] sm:text-xs font-medium text-slate-500">Cash Payment</label>
                          <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium mt-0.5 ${
                            storeSetup.accepts_cash ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {storeSetup.accepts_cash ? 'Yes' : 'No'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Cuisines */}
                    {storeSetup.cuisine_types && storeSetup.cuisine_types.length > 0 && (
                      <div className="grid grid-cols-1 gap-2 sm:gap-3 min-w-0">
                        <div>
                          <h3 className="text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">Cuisine Types</h3>
                          <div className="flex flex-wrap gap-1.5">
                            {storeSetup.cuisine_types.map((cuisine: string, idx: number) => (
                              <span key={idx} className="px-2 py-1 bg-purple-50 text-purple-700 rounded-full text-[10px] sm:text-xs font-medium border border-purple-100">
                                {cuisine}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Store Hours */}
                    {formattedStoreHours.length > 0 && (
                      <div className="min-w-0">
                        <h3 className="text-xs sm:text-sm font-semibold text-slate-700 mb-2">Store Hours</h3>
                        <div className="bg-slate-50 rounded-lg p-2 sm:p-3">
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-2.5">
                            {formattedStoreHours.map((item: any) => (
                              <div key={item.day} className="bg-white rounded-lg p-2 border border-slate-200">
                                <div className="text-[10px] sm:text-xs font-semibold text-slate-900 mb-1">{item.day}</div>
                                {item.status === 'closed' ? (
                                  <div className="text-[10px] sm:text-xs text-rose-600">Closed</div>
                                ) : (
                                  <div className="text-[10px] sm:text-xs text-slate-700 space-y-0.5">
                                    {item.slots.map((slot: string, idx: number) => (
                                      <div key={idx}>{slot}</div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Documents & Summary */}
            <div className="space-y-3 sm:space-y-4 min-w-0">
              {/* Documents Card */}
              <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-3 sm:px-4 py-2 sm:py-2.5 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-slate-200">
                  <h2 className="text-sm sm:text-base font-semibold text-slate-900 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-amber-600 rounded-full flex-shrink-0"></div>
                    <span className="truncate">Documents</span>
                  </h2>
                </div>
                <div className="p-3 sm:p-4">
                  <div className="space-y-2">
                    {documents.pan_number && (
                      <div className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg min-w-0">
                        <div className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="text-indigo-600 font-semibold text-[10px] sm:text-xs">PAN</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] sm:text-xs font-medium text-slate-500">PAN Number</p>
                          <p className="text-slate-900 font-mono text-xs sm:text-sm truncate">{documents.pan_number}</p>
                          {(documents.pan_holder_name || documents.pan_image_url) && (
                            <div className="flex items-center gap-2 mt-1">
                              {documents.pan_holder_name && <span className="text-[10px] sm:text-xs text-slate-600">{documents.pan_holder_name}</span>}
                              {documents.pan_image_url && (
                                <a href={normalizeAttachmentHref(documents.pan_image_url) ?? "#"} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[10px] sm:text-xs text-indigo-600 hover:underline">
                                  <ExternalLink className="w-3 h-3" /> View attachment
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {documents.aadhar_number && (
                      <div className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg min-w-0">
                        <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="text-blue-600 font-semibold text-[10px] sm:text-xs">AAD</span>
                        </div>
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <p className="text-[10px] sm:text-xs font-medium text-slate-500">Aadhar Number</p>
                          <p className="text-slate-900 font-mono text-xs sm:text-sm truncate">{documents.aadhar_number}</p>
                          {(documents.aadhar_holder_name || documents.aadhar_front_url || documents.aadhar_back_url) && (
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              {documents.aadhar_holder_name && <span className="text-[10px] sm:text-xs text-slate-600">{documents.aadhar_holder_name}</span>}
                              {documents.aadhar_front_url && (
                                <a href={normalizeAttachmentHref(documents.aadhar_front_url) ?? "#"} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[10px] sm:text-xs text-indigo-600 hover:underline">
                                  <ExternalLink className="w-3 h-3" /> View front
                                </a>
                              )}
                              {documents.aadhar_back_url && (
                                <a href={normalizeAttachmentHref(documents.aadhar_back_url) ?? "#"} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[10px] sm:text-xs text-indigo-600 hover:underline">
                                  <ExternalLink className="w-3 h-3" /> View back
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {documents.fssai_number && (
                      <div className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg min-w-0">
                        <div className="w-7 h-7 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="text-emerald-600 font-semibold text-[10px] sm:text-xs">FSS</span>
                        </div>
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <p className="text-[10px] sm:text-xs font-medium text-slate-500">FSSAI Number</p>
                          <p className="text-slate-900 font-mono text-xs sm:text-sm truncate">{documents.fssai_number}</p>
                          {documents.fssai_image_url && (
                            <a href={normalizeAttachmentHref(documents.fssai_image_url) ?? "#"} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[10px] sm:text-xs text-indigo-600 hover:underline mt-1">
                              <ExternalLink className="w-3 h-3" /> View attachment
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                    {documents.gst_number && (
                      <div className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg min-w-0">
                        <div className="w-7 h-7 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="text-purple-600 font-semibold text-[10px] sm:text-xs">GST</span>
                        </div>
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <p className="text-[10px] sm:text-xs font-medium text-slate-500">GST Number</p>
                          <p className="text-slate-900 font-mono text-xs sm:text-sm truncate">{documents.gst_number}</p>
                          {documents.gst_image_url && (
                            <a href={normalizeAttachmentHref(documents.gst_image_url) ?? "#"} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[10px] sm:text-xs text-indigo-600 hover:underline mt-1">
                              <ExternalLink className="w-3 h-3" /> View attachment
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                    {documents.drug_license_number && (
                      <div className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg min-w-0">
                        <div className="w-7 h-7 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="text-red-600 font-semibold text-[10px] sm:text-xs">DL</span>
                        </div>
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <p className="text-[10px] sm:text-xs font-medium text-slate-500">Drug License</p>
                          <p className="text-slate-900 font-mono text-xs sm:text-sm truncate">{documents.drug_license_number}</p>
                          {documents.drug_license_image_url && (
                            <a href={normalizeAttachmentHref(documents.drug_license_image_url) ?? "#"} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[10px] sm:text-xs text-indigo-600 hover:underline mt-1">
                              <ExternalLink className="w-3 h-3" /> View attachment
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                    {documents.pharmacist_registration_number && (
                      <div className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg min-w-0">
                        <div className="w-7 h-7 bg-cyan-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="text-cyan-600 font-semibold text-[10px] sm:text-xs">PR</span>
                        </div>
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <p className="text-[10px] sm:text-xs font-medium text-slate-500">Pharmacist Registration</p>
                          <p className="text-slate-900 font-mono text-xs sm:text-sm truncate">{documents.pharmacist_registration_number}</p>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {documents.pharmacist_certificate_url && (
                              <a href={normalizeAttachmentHref(documents.pharmacist_certificate_url) ?? "#"} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[10px] sm:text-xs text-indigo-600 hover:underline">
                                <ExternalLink className="w-3 h-3" /> View certificate
                              </a>
                            )}
                            {documents.pharmacy_council_registration_url && (
                              <a href={normalizeAttachmentHref(documents.pharmacy_council_registration_url) ?? "#"} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[10px] sm:text-xs text-indigo-600 hover:underline">
                                <ExternalLink className="w-3 h-3" /> View council reg
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Summary Card */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg sm:rounded-xl shadow-lg p-3 sm:p-4 text-white min-w-0">
                <h3 className="text-sm sm:text-base font-semibold mb-2 sm:mb-3">Application Summary</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300 text-xs sm:text-sm">Sections Completed</span>
                    <span className="font-semibold text-xs sm:text-sm">5/5</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300 text-xs sm:text-sm">Documents Uploaded</span>
                    <span className="font-semibold text-xs sm:text-sm">{documentCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300 text-xs sm:text-sm">Next</span>
                    <span className="text-slate-200 text-[10px] sm:text-xs">Plan → Contract → Sign</span>
                  </div>
                </div>
              </div>

              {/* Bank Details */}
              {documents?.bank && (
                <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-3 sm:px-4 py-2 sm:py-2.5 bg-gradient-to-r from-sky-50 to-indigo-50 border-b border-slate-200">
                    <h2 className="text-sm sm:text-base font-semibold text-slate-900 flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-sky-600 rounded-full flex-shrink-0"></div>
                      <span className="truncate">Bank & Payout</span>
                    </h2>
                  </div>
                  <div className="p-3 sm:p-4">
                    <div className="space-y-2 text-xs sm:text-sm min-w-0">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg bg-slate-50 p-2">
                          <p className="text-[10px] sm:text-xs text-slate-500">Payout Method</p>
                          <p className="font-medium text-slate-900 uppercase text-xs sm:text-sm">{documents.bank.payout_method || "bank"}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-2">
                          <p className="text-[10px] sm:text-xs text-slate-500">Account Holder</p>
                          <p className="font-medium text-slate-900 text-xs sm:text-sm truncate">{documents.bank.account_holder_name || "-"}</p>
                        </div>
                      </div>
                      {(documents.bank.payout_method || "bank") === "bank" ? (
                        <div className="grid grid-cols-1 gap-2">
                          <div className="rounded-lg bg-slate-50 p-2">
                            <p className="text-[10px] sm:text-xs text-slate-500">Account Number</p>
                            <p className="font-medium text-slate-900 text-xs sm:text-sm truncate">{documents.bank.account_number || "-"}</p>
                          </div>
                          <div className="rounded-lg bg-slate-50 p-2">
                            <p className="text-[10px] sm:text-xs text-slate-500">IFSC / Bank</p>
                            <p className="font-medium text-slate-900 text-xs sm:text-sm truncate">{documents.bank.ifsc_code || "-"} / {documents.bank.bank_name || "-"}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg bg-slate-50 p-2">
                          <p className="text-[10px] sm:text-xs text-slate-500">UPI ID</p>
                          <p className="font-medium text-slate-900 text-xs sm:text-sm truncate">{documents.bank.upi_id || "-"}</p>
                        </div>
                      )}
                      {/* Bank / UPI Attachments */}
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200 mt-2">
                        {(documents.bank as any)?.bank_proof_file_url && (
                          <a
                            href={normalizeAttachmentHref((documents.bank as any).bank_proof_file_url) ?? "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] sm:text-xs text-indigo-600 hover:underline font-medium"
                          >
                            <ExternalLink className="w-3 h-3" />
                            View bank proof
                          </a>
                        )}
                        {(documents.bank as any)?.upi_qr_screenshot_url && (
                          <a
                            href={normalizeAttachmentHref((documents.bank as any).upi_qr_screenshot_url) ?? "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] sm:text-xs text-indigo-600 hover:underline font-medium"
                          >
                            <ExternalLink className="w-3 h-3" />
                            View UPI QR
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Global Styles for Scrollbar Hide */}
      <style dangerouslySetInnerHTML={{ __html: `
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      ` }} />
    </div>
  );
};

export default PreviewPage;
