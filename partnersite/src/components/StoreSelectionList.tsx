"use client";
import React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FaSearch, FaStore, FaMapMarkerAlt, FaPhone, FaCheckCircle, FaTimesCircle, FaClock, FaAngleRight, FaTimes, FaEye } from 'react-icons/fa';

interface StoreSelectionListProps {
  stores: Array<{
    store_id: string;
    store_name: string;
    full_address?: string;
    store_phones?: string[];
    approval_status?: string | null;
    is_active?: boolean | null;
    parent_id?: number | null;
  }>;
  onSelect?: (storeId: string) => void;
}

const StoreSelectionList: React.FC<StoreSelectionListProps> = ({ stores, onSelect }) => {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const router = useRouter();

  const filteredStores = stores.filter(store =>
    store.store_name.toLowerCase().includes(search.toLowerCase()) ||
    (store.full_address || '').toLowerCase().includes(search.toLowerCase())
  );

  // merchant_store.approval_status: 'SUBMITTED', 'UNDER_VERIFICATION', 'APPROVED', 'REJECTED'
  const getStatusInfo = (status?: string | null) => {
    const statusNorm = (status || 'SUBMITTED').toUpperCase();
    switch (statusNorm) {
      case 'APPROVED':
        return {
          text: 'Approved',
          icon: <FaCheckCircle className="text-xs" />,
          bgColor: 'bg-green-50',
          textColor: 'text-green-700',
          borderColor: 'border-green-200',
          isApproved: true
        };
      case 'REJECTED':
        return {
          text: 'Rejected',
          icon: <FaTimesCircle className="text-xs" />,
          bgColor: 'bg-red-50',
          textColor: 'text-red-700',
          borderColor: 'border-red-200',
          isApproved: false
        };
      case 'UNDER_VERIFICATION':
        return {
          text: 'Pending',
          icon: <FaClock className="text-xs" />,
          bgColor: 'bg-yellow-50',
          textColor: 'text-yellow-700',
          borderColor: 'border-yellow-200',
          isApproved: false
        };
      case 'SUBMITTED':
      default:
        return {
          text: 'Submitted',
          icon: <FaClock className="text-xs" />,
          bgColor: 'bg-blue-50',
          textColor: 'text-blue-700',
          borderColor: 'border-blue-200',
          isApproved: false
        };
    }
  };

  const handleStoreSelect = (storeId: string, isApproved: boolean) => {
    // Only allow navigation if store is approved
    if (!isApproved) {
      return;
    }
    
    setSelected(storeId);
    if (onSelect) {
      onSelect(storeId);
    } else {
      // Default behavior if no onSelect prop provided
      localStorage.setItem('selectedStoreId', storeId);
      window.location.href = '/mx/dashboard';
    }
  };

  const handleViewStoreClick = (e: React.MouseEvent, storeId: string, isApproved: boolean) => {
    e.stopPropagation(); // Prevent triggering the row click
    if (isApproved) {
      handleStoreSelect(storeId, isApproved);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Main Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Select Store</h1>
          <p className="text-gray-600 mt-1">Choose a store to continue</p>
        </div>

        {/* Search and Stats Container */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Search Bar */}
            <div className="relative flex-1 max-w-lg">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FaSearch className="text-gray-400" />
              </div>
              <input
                type="text"
                className="w-full pl-10 pr-10 py-3 text-sm bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all duration-200"
                placeholder="Search stores..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center hover:bg-gray-100 rounded-r-lg p-2 transition-colors"
                >
                  <FaTimes className="text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>

            {/* Stats */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="text-sm bg-blue-50 text-blue-700 px-4 py-2 rounded-lg font-medium border border-blue-100">
                Total: {stores.length} store{stores.length !== 1 ? 's' : ''}
              </div>
              <div className="hidden lg:flex items-center gap-6 text-sm text-gray-600">
                <span className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  Approved
                </span>
                <span className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  Pending
                </span>
                <span className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  Rejected
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Store List Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* List Header */}
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <div className="grid grid-cols-12 gap-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
              <div className="col-span-4">Store Details</div>
              <div className="col-span-3">Address</div>
              <div className="col-span-2">Contact</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-1 text-center">Action</div>
            </div>
          </div>

          {/* Store List */}
          <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
            {filteredStores.length === 0 ? (
              <div className="text-center py-12 px-4">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FaStore className="text-gray-400 text-2xl" />
                </div>
                <h3 className="text-lg font-medium text-gray-600 mb-2">No stores found</h3>
                <p className="text-gray-500">Try a different search term</p>
              </div>
            ) : (
              filteredStores.map(store => {
                const statusInfo = getStatusInfo(store.approval_status);
                const isStoreApproved = statusInfo.isApproved;
                
                return (
                  <div
                    key={store.store_id}
                    onClick={() => handleStoreSelect(store.store_id, isStoreApproved)}
                    className={`
                      px-6 py-4 transition-all duration-150
                      ${isStoreApproved ? 'cursor-pointer hover:bg-gray-50' : 'cursor-not-allowed'}
                      ${selected === store.store_id && isStoreApproved 
                        ? 'bg-blue-50 border-l-4 border-l-blue-500' 
                        : 'border-l-4 border-l-transparent'
                      }
                      ${!isStoreApproved ? 'opacity-70' : ''}
                    `}
                  >
                    <div className="grid grid-cols-12 gap-4 items-center">
                      {/* Store Name and Icon */}
                      <div className="col-span-4">
                        <div className="flex items-center gap-3">
                          <div className={`
                            w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0
                            ${selected === store.store_id && isStoreApproved
                              ? 'bg-blue-100 text-blue-600' 
                              : 'bg-gray-100 text-gray-600'
                            }
                          `}>
                            <FaStore className="text-lg" />
                          </div>
                          <div>
                            <h3 className={`font-medium text-sm ${
                              isStoreApproved ? 'text-gray-900' : 'text-gray-500'
                            }`}>
                              {store.store_name}
                            </h3>
                            <p className="text-xs text-gray-500 mt-0.5">ID: {store.store_id}</p>
                          </div>
                        </div>
                      </div>

                      {/* Address */}
                      <div className="col-span-3">
                        {store.full_address ? (
                          <div className="flex items-start">
                            <FaMapMarkerAlt className={`text-xs mt-0.5 mr-2 flex-shrink-0 ${
                              isStoreApproved ? 'text-gray-400' : 'text-gray-300'
                            }`} />
                            <p className={`text-sm line-clamp-2 ${
                              isStoreApproved ? 'text-gray-600' : 'text-gray-400'
                            }`}>
                              {store.full_address}
                            </p>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">No address</span>
                        )}
                      </div>

                      {/* Phone Numbers */}
                      <div className="col-span-2">
                        {store.store_phones && store.store_phones.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {store.store_phones.slice(0, 2).map((phone, index) => (
                              <div key={index} className="flex items-center gap-2">
                                <FaPhone className={isStoreApproved ? 'text-gray-400' : 'text-gray-300'} />
                                <span className={`text-sm ${
                                  isStoreApproved ? 'text-gray-700' : 'text-gray-400'
                                }`}>
                                  {phone}
                                </span>
                              </div>
                            ))}
                            {store.store_phones.length > 2 && (
                              <span className="text-xs text-gray-500 mt-1">
                                +{store.store_phones.length - 2} more
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">No phone</span>
                        )}
                      </div>

                      {/* Status */}
                      <div className="col-span-2">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`
                              px-3 py-1 rounded-full text-xs font-medium border flex items-center gap-1.5
                              ${statusInfo.bgColor} ${statusInfo.textColor} ${statusInfo.borderColor}
                            `}>
                              {statusInfo.icon}
                              {statusInfo.text}
                            </span>
                            <span className={`
                              px-3 py-1 rounded-full text-xs font-medium border
                              ${store.is_active === true ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}
                            `}>
                              {store.is_active === true ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action Column - View Store Button */}
                      <div className="col-span-1">
                        <div className="flex justify-center">
                          <button
                            onClick={(e) => handleViewStoreClick(e, store.store_id, isStoreApproved)}
                            disabled={!isStoreApproved}
                            className={`
                              flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
                              transition-all duration-200 min-w-[100px]
                              ${isStoreApproved
                                ? 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 cursor-pointer'
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              }
                            `}
                          >
                            <FaEye className="text-xs" />
                            View Store
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-sm text-gray-600">
                Showing <span className="font-medium">{filteredStores.length}</span> of{' '}
                <span className="font-medium">{stores.length}</span> stores
              </div>
              <div className="flex items-center gap-6 text-sm text-gray-600 lg:hidden">
                <span className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  Approved
                </span>
                <span className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                  Pending
                </span>
                <span className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500"></div>
                  Rejected
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StoreSelectionList;