'use client';

import { Order } from '@/types';

interface MerchantDetailsProps {
  order: Order;
  onCopy: (text: string) => void;
  onShowContacts: () => void;
  onShowTimings: () => void;      // opens StoreTimingModal
  onShowStoreDetails: () => void; // opens StoreDetailsModal
}

export default function MerchantDetails({
  order,
  onCopy,
  onShowContacts,
  onShowTimings,
  onShowStoreDetails,
}: MerchantDetailsProps) {
  const handleViewOnMap = () => {
    if (order.merchantLatLon) {
      window.open(`https://www.google.com/maps?q=${order.merchantLatLon}`, '_blank', 'noopener');
    }
  };
  return (
    <div className="bg-white rounded-lg p-4 shadow-[0_2px_8px_rgba(0,0,0,0.12)] border border-[#d0d0d0] transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.15)] hover:border-emerald-400 hover:-translate-y-0.5">
      
      {/* Header */}
      <div className="flex justify-between items-start mb-3 pb-2.5 border-b-2 border-emerald-500">
        <div className="text-base font-bold text-gray-900 flex items-center gap-1.5">
          <i className="bi bi-shop-window text-emerald-600"></i>
          <span>Merchant details</span>
        </div>
      </div>

      {/* Details */}
      <div className="grid gap-1.5">

        {/* Parent Merchant Id */}
        <div className="grid grid-cols-[160px_1fr] items-center min-h-[26px]">
          <div className="text-[13px] text-gray-600 font-medium">Parent Merchant Id:</div>
          <div className="text-[13px] text-emerald-700 font-medium flex items-center gap-1.5 flex-wrap">
            {order.parentMerchantId}
            <i
              className="bi bi-clipboard text-[11px] text-emerald-600 cursor-pointer opacity-70 hover:opacity-100"
              onClick={() => onCopy(order.parentMerchantId || 'N/A')}
            />
          </div>
        </div>

        {/* Parent Name */}
        <div className="grid grid-cols-[160px_1fr] items-center min-h-[26px]">
          <div className="text-[13px] text-gray-600 font-medium">Parent Name:</div>
          <div className="text-[13px] text-emerald-700 font-medium">
            {order.parentMerchantName}
          </div>
        </div>

        {/* Merchant Id */}
        <div className="grid grid-cols-[160px_1fr] items-center min-h-[26px]">
          <div className="text-[13px] text-gray-600 font-medium">Merchant Id:</div>
          <div className="text-[13px] text-emerald-700 font-medium flex items-center gap-1.5 flex-wrap">
            {order.merchantId}
            <i
              className="bi bi-clipboard text-[11px] text-emerald-600 cursor-pointer opacity-70 hover:opacity-100"
              onClick={() => onCopy(order.merchantId)}
            />
          </div>
        </div>

        {/* Merchant UserId */}
        <div className="grid grid-cols-[160px_1fr] items-center min-h-[26px]">
          <div className="text-[13px] text-gray-600 font-medium">Merchant UserId:</div>
          <div className="text-[13px] text-emerald-700 font-medium flex items-center gap-1.5 flex-wrap">
            {order.merchantUserId}
            <i
              className="bi bi-clipboard text-[11px] text-emerald-600 cursor-pointer opacity-70 hover:opacity-100"
              onClick={() => onCopy(order.merchantUserId || 'N/A')}
            />
          </div>
        </div>

        {/* Name + Web link */}
        <div className="grid grid-cols-[160px_1fr] items-center min-h-[26px]">
          <div className="text-[13px] text-gray-600 font-medium">Name:</div>
          <div className="text-[13px] text-emerald-700 font-medium flex items-center gap-1.5 flex-wrap">
            {order.parentMerchantName}
            <a
              href="#"
              target="_blank"
              className="inline-flex items-center gap-0.5 text-emerald-600 text-xs px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-300 hover:bg-emerald-100"
            >
              <i className="bi bi-link-45deg"></i>
              Web link
            </a>
          </div>
        </div>

        {/* Mx Notifications */}
        <div className="grid grid-cols-[160px_1fr] items-center min-h-[26px]">
          <div className="text-[13px] text-gray-600 font-medium">Mx Notifications:</div>
          <div className="text-[13px] text-emerald-700 font-medium">
            <a
              href="#"
              target="_blank"
              className="inline-flex items-center gap-0.5 text-emerald-600 text-xs px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-300 hover:bg-emerald-100"
            >
              <i className="bi bi-link-45deg"></i>
              link
            </a>
          </div>
        </div>

        {/* Mobile */}
        <div className="grid grid-cols-[160px_1fr] items-center min-h-[26px]">
          <div className="text-[13px] text-gray-600 font-medium">Mobile:</div>
          <div className="text-[13px] text-emerald-700 font-medium">
            {order.merchantMobile} (Other contacts)
            <button
              onClick={onShowContacts}
              className="ml-1.5 inline-flex items-center gap-0.5 text-[11px] text-emerald-600 bg-emerald-50 border border-emerald-300 px-1.5 py-0.5 rounded hover:bg-emerald-100"
            >
              <i className="bi bi-three-dots"></i>
              More
            </button>
          </div>
        </div>

        {/* Locality */}
        <div className="grid grid-cols-[160px_1fr] items-center min-h-[26px]">
          <div className="text-[13px] text-gray-600 font-medium">Locality:</div>
          <div className="text-[13px] text-emerald-700 font-medium flex items-center gap-2 flex-wrap">
            {order.merchantLocality}
            {'merchantLatLon' in order && order.merchantLatLon && (
              <button
                type="button"
                onClick={handleViewOnMap}
                className="inline-flex items-center gap-0.5 text-emerald-600 text-xs px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-300 hover:bg-emerald-100"
              >
                <i className="bi bi-geo-alt"></i>
                View on Map
              </button>
            )}
          </div>
        </div>

        {/* Timings */}
        <div className="grid grid-cols-[160px_1fr] items-center min-h-[26px]">
          <div className="text-[13px] text-gray-600 font-medium">Timings:</div>
          <div className="text-[13px] text-emerald-700 font-medium">
            <button
              onClick={onShowTimings}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded font-medium inline-flex items-center gap-1.5 text-[12px] shadow-md"
            >
              <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
              Open - 08:00 To 23:00
              <i className="bi bi-chevron-right"></i>
            </button>
          </div>
        </div>

        {/* Lat/Lon */}
        {'merchantLatLon' in order && order.merchantLatLon && (
          <div className="grid grid-cols-[160px_1fr] items-center min-h-[26px]">
            <div></div>
            <div className="text-xs text-gray-500 font-medium">
              <b>Lat/Lon:</b> {order.merchantLatLon}
            </div>
          </div>
        )}
      </div>

      {/* More Details link (FINAL FIX) */}
      <div className="mt-4 pt-3 border-t border-gray-200 flex justify-end">
        <button
          onClick={onShowStoreDetails}
          className="text-[13px] font-semibold text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1"
        >
          More Details
          <i className="bi bi-chevron-right text-xs"></i>
        </button>
      </div>
    </div>
  );
}
