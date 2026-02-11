"use client";

import { useEffect } from 'react';

interface StoreDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  details: string;
}

export default function StoreDetailsModal({ isOpen, onClose, details }: StoreDetailsModalProps) {
  // Close on Escape key press
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const parseDetails = (detailsString: string) => {
    if (!detailsString || typeof detailsString !== 'string') {
      return {
        'Order Id': 'GM1011',
        'Order Paid at': '22-10-25 09:17 PM',
        'MID': '2141591',
        'Store Internal Id': '',
        'Merchant Name': 'Om Sweets & Snacks',
        'Locality': 'Sector 50',
        'City': 'Gurgaon',
        'Address': '16-17, Ground Floor, Sector 50',
        'Lat/Lon': '28.42160771,77.05353063',
        'MerchantType': 'LOCAL',
        'AssignedUser': 'bhimpratap@gatimitra.in',
        'AssignedUserDepartment': 'BD Panipat Growth'
      };
    }

    const lines = detailsString.split('\n').filter(line => line.trim());
    const data: Record<string, string> = {};

    lines.forEach(line => {
      if (line.includes(':')) {
        const colonIndex = line.indexOf(':');
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        data[key] = value;
      }
    });

    return data;
  };

  const detailsData = parseDetails(details);

  const getSafeValue = (key: string, fallback: string = '') => {
    return detailsData[key] || fallback;
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-5"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.15)] border border-gray-200 min-w-[450px] max-w-[550px] w-full max-h-[90vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-green-600 text-white p-5">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                <i className="bi bi-shop text-xl"></i>
              </div>
              <div>
                <h2 className="text-xl font-bold">Merchant Details</h2>
                <p className="text-blue-100 text-sm opacity-90">Complete store information</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            >
              <i className="bi bi-x text-lg"></i>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          <div className="space-y-4">
            {[
              ['Order Id', '277202254'],
              ['Order Paid at', '22-10-25 09:17 PM'],
              ['MID', '2141591'],
              ['Store Internal Id', 'N/A'],
              ['Merchant Name', 'Om Sweets & Snacks'],
              ['Locality', 'Sector 50'],
              ['City', 'Gurgaon'],
              ['Address', '16-17, Ground Floor, Sector 50']
            ].map(([label, fallback]) => (
              <div key={label} className="flex">
                <div className="w-1/3 text-sm font-medium text-gray-600">{label}</div>
                <div className="w-2/3 text-sm font-semibold text-gray-800">
                  {getSafeValue(label, fallback)}
                </div>
              </div>
            ))}

{/* Lat/Lon with View on Map */}
<div className="flex items-center">
  <div className="w-1/3 text-sm font-medium text-gray-600">Lat/Lon</div>
  <div className="w-2/3 flex items-center gap-2">
    <span className="text-sm font-semibold text-gray-800">
      {getSafeValue('Lat/Lon', '28.42160771,77.05353063').split(' ')[0]}
    </span>

    <button
      onClick={() => {
        const latlon = getSafeValue(
          'Lat/Lon',
          '28.42160771,77.05353063'
        ).split(' ')[0];
        window.open(`https://www.google.com/maps?q=${latlon}`, '_blank');
      }}
      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium
                 bg-green-50 text-green-700 border border-green-200
                 rounded hover:bg-green-100 transition-colors"
    >
      <i className="bi bi-geo-alt"></i>
      View on Map
    </button>
  </div>
</div>


            {/* Merchant Type */}
            <div className="flex">
              <div className="w-1/3 text-sm font-medium text-gray-600">MerchantType</div>
              <div className="w-2/3">
                <span className="inline-block text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-1 rounded">
                  {getSafeValue('MerchantType', 'LOCAL')}
                </span>
              </div>
            </div>

            {/* Assigned User */}
            <div className="flex">
              <div className="w-1/3 text-sm font-medium text-gray-600">AssignedUser</div>
              <div className="w-2/3 text-sm font-semibold text-blue-700">
                {getSafeValue('AssignedUser', 'bhimpratap@gatimitra.in')}
              </div>
            </div>

            <div className="flex">
              <div className="w-1/3 text-sm font-medium text-gray-600">AssignedUserDepartment</div>
              <div className="w-2/3 text-sm font-semibold text-gray-800">
                {getSafeValue('AssignedUserDepartment', 'Mid Market AM')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
