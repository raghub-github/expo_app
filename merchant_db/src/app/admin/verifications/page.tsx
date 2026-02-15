"use client";
import './custom-scrollbar.css';
import React, { useState, useEffect, useRef } from 'react';
import AdminLayout from '../../../components/AdminLayout';
import { fetchAllStores } from '@/lib/database';
import { fetchStoreDocuments, fetchStoreOperatingHours, fetchStoreNumericIdByCode } from '@/lib/adminStore';
import Image from 'next/image';

const statusColors = {
  SUBMITTED: 'bg-orange-100 text-orange-700',
  UNDER_VERIFICATION: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
};

export default function VerificationsPage() {
    // Document status modal state
    const [docStatusModal, setDocStatusModal] = useState<{ open: boolean; docId?: number; idx?: number } | null>(null);
    const [pendingDocStatus, setPendingDocStatus] = useState<{ idx: number; value: string } | null>(null);
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectModal, setRejectModal] = useState<{ open: boolean; storeId?: string; store?: any }>({ open: false });
  const [rejectReason, setRejectReason] = useState('');
  const [viewModal, setViewModal] = useState<{ open: boolean; store?: any }>({ open: false });
  const [storeDocuments, setStoreDocuments] = useState<any[]>([]);
  const [operatingHours, setOperatingHours] = useState<any[]>([]);
  const [approveModal, setApproveModal] = useState<{ open: boolean; storeId?: string; store?: any }>({ open: false });
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const viewModalRef = useRef<HTMLDivElement>(null);
  const approveModalRef = useRef<HTMLDivElement>(null);
  const rejectModalRef = useRef<HTMLDivElement>(null);

  // Get current admin info (you might want to get this from your auth system)
  const currentAdmin = {
    name: 'Admin',
    email: 'admin@example.com'
  };

  useEffect(() => {
    // Hide vertical scrollbar for the whole page
    document.body.style.overflowY = 'hidden';
    return () => {
      document.body.style.overflowY = '';
    };
  }, []);
  useEffect(() => {
    loadStores();
  }, []);

  const loadStores = () => {
    setLoading(true);
    fetchAllStores().then((data) => {
      // Filter out APPROVED stores from verification list
      const pendingStores = data.filter(store => 
        store.approval_status !== 'APPROVED' && store.approval_status !== 'REJECTED'
      );
      setStores(pendingStores);
      setLoading(false);
    });
  };

  const filteredStores = stores.filter((store) => {
    // Search filter
    const matchesSearch = search === '' ||
      (store.store_id || '').toLowerCase().includes(search.toLowerCase()) ||
      (store.store_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (store.store_email || '').toLowerCase().includes(search.toLowerCase());
    
    // Date range filter
    let matchesDate = true;
    if (fromDate || toDate) {
      const storeDate = store.created_at ? new Date(store.created_at) : null;
      if (storeDate) {
        const from = fromDate ? new Date(fromDate) : null;
        const to = toDate ? new Date(toDate) : null;
        
        if (from && to) {
          matchesDate = storeDate >= from && storeDate <= to;
        } else if (from) {
          matchesDate = storeDate >= from;
        } else if (to) {
          matchesDate = storeDate <= to;
        }
      } else {
        matchesDate = false;
      }
    }
    
    return matchesSearch && matchesDate;
  });

  // Count pending verifications
  const pendingCount = stores.filter(store => 
    ['SUBMITTED', 'UNDER_VERIFICATION'].includes(store.approval_status)
  ).length;

  // Count under verification
  const underVerificationCount = stores.filter(store => 
    store.approval_status === 'UNDER_VERIFICATION'
  ).length;

  // Close modal when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (viewModalRef.current && !viewModalRef.current.contains(event.target as Node) && viewModal.open) {
        setViewModal({ open: false });
      }
      if (approveModalRef.current && !approveModalRef.current.contains(event.target as Node) && approveModal.open) {
        setApproveModal({ open: false });
      }
      if (rejectModalRef.current && !rejectModalRef.current.contains(event.target as Node) && rejectModal.open) {
        setRejectModal({ open: false });
        setRejectReason('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [viewModal.open, approveModal.open, rejectModal.open]);

  // Handle View Click - Change status to UNDER_VERIFICATION
  const handleViewClick = async (store: any) => {
    try {
      // Only update status if it's currently SUBMITTED
      if (store.approval_status === 'SUBMITTED') {
        setLoading(true);
        await fetch('/api/store/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId: store.store_id,
            updates: { approval_status: 'UNDER_VERIFICATION' }
          })
        });
        setStores(prevStores => 
          prevStores.map(s => 
            s.id === store.id 
              ? { ...s, approval_status: 'UNDER_VERIFICATION' } 
              : s
          )
        );
        setLoading(false);
      }
      // Fetch documents and operating hours
      setLoading(true);
      const docs = await fetchStoreDocuments(store.id);
      // Get numeric store id from code
      const numericId = await fetchStoreNumericIdByCode(store.store_id);
      let hours = [];
      if (numericId) {
        hours = await fetchStoreOperatingHours(numericId);
      }
      setStoreDocuments(docs);
      setOperatingHours(hours);
      setLoading(false);
      // Open view modal
      setViewModal({ open: true, store: {
        ...store,
        approval_status: store.approval_status === 'SUBMITTED' ? 'UNDER_VERIFICATION' : store.approval_status
      }});
    } catch (error) {
      console.error('Error updating status:', error);
      setLoading(false);
      // Still open modal even if update fails
      setViewModal({ open: true, store });
    }
  };

  const handleApproveClick = (store: any) => {
    setApproveModal({ open: true, storeId: store.store_id, store });
  };

  const confirmApprove = async () => {
    if (approveModal.storeId && approveModal.store) {
      setLoading(true);
      const approvalTime = new Date().toISOString();
      
      await fetch('/api/store/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: approveModal.storeId,
          updates: { approval_status: 'APPROVED' }
        })
      });
      
      loadStores(); // This will reload and filter out APPROVED stores
      setLoading(false);
    }
    setApproveModal({ open: false });
  };

  const handleReject = (store: any) => {
    setRejectModal({ open: true, storeId: store.store_id, store });
    setRejectReason('');
  };

  const confirmReject = async () => {
    if (rejectModal.storeId && rejectModal.store) {
      setLoading(true);
      const rejectionTime = new Date().toISOString();
      
      await fetch('/api/store/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: rejectModal.storeId,
          updates: { approval_status: 'REJECTED', approval_reason: rejectReason }
        })
      });
      
      loadStores(); // This will reload and filter out REJECTED stores
      setLoading(false);
    }
    setRejectModal({ open: false });
    setRejectReason('');
  };

  const formatTime = (time: string) => {
    if (!time) return '-';
    return time.slice(0, 5);
  };

  const applyDateFilter = () => {
    // Filtering is already handled in filteredStores calculation
  };

  const clearDateFilter = () => {
    setFromDate('');
    setToDate('');
  };

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-2">
          <div>
            <h1 className="text-base font-bold text-gray-900">Store Verification Management</h1>
            <p className="text-sm text-gray-600 mt-1">Review and manage store verification requests</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="px-2 py-1 bg-red-50 rounded border border-red-200 text-xs">
              <span className="text-sm font-medium text-red-700">Pending: {pendingCount}</span>
            </div>
            <div className="px-2 py-1 bg-blue-50 rounded border border-blue-200 text-xs">
              <span className="text-sm font-medium text-blue-700">Under Review: {underVerificationCount}</span>
            </div>
          </div>
        </div>
        
        {/* Filters Section */}
        <div className="bg-white rounded-lg border shadow-sm p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-1">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
              <input
                type="text"
                placeholder="Store name, ID, or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-2 py-1 border rounded bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-xs"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-2 py-1 border rounded bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-xs"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-2 py-1 border rounded bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-xs"
              />
            </div>
            
            <div className="flex items-end gap-2">
              <button
                onClick={applyDateFilter}
                className="flex-1 px-2 py-1 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 transition-colors text-xs"
              >
                Apply
              </button>
              {(fromDate || toDate) && (
                <button
                  onClick={clearDateFilter}
                  className="px-2 py-1 border border-gray-300 text-gray-700 rounded font-medium hover:bg-gray-50 transition-colors text-xs"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          
          {/* Stats Bar */}
          <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t">
            <div className="text-sm">
              <span className="text-gray-500">Showing: </span>
              <span className="font-medium text-gray-900">{filteredStores.length} stores</span>
            </div>
            {(fromDate || toDate) && (
              <div className="text-sm">
                <span className="text-gray-500">Date Range: </span>
                <span className="font-medium text-blue-600">
                  {fromDate || 'Start'} to {toDate || 'End'}
                </span>
              </div>
            )}
          </div>
        </div>
        
        {/* Stores Table */}
        <div className="overflow-x-auto rounded-lg shadow border bg-white">
          <table className="min-w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">Store ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">Store Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">City</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">Created At</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">Approval Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-400">
                    <div className="flex flex-col items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                      Loading stores...
                    </div>
                  </td>
                </tr>
              ) : filteredStores.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8">
                    <div className="flex flex-col items-center justify-center text-gray-400">
                      <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-lg font-medium">No stores found</p>
                      <p className="text-sm mt-1">Try adjusting your filters or search terms</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredStores.map((store) => (
                  <tr key={store.id} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-blue-700 font-medium bg-blue-50 px-2 py-1 rounded">
                        {store.store_id || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-900 font-medium">{store.store_name || '-'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-gray-700 truncate max-w-[150px]">{store.store_email || '-'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-gray-700">{store.city || '-'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-gray-600">
                        {store.created_at ? (
                          <>
                            <div>{store.created_at.slice(0, 10)}</div>
                            <div className="text-gray-400 text-[10px]">{store.created_at.slice(11, 16)}</div>
                          </>
                        ) : '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusColors[store.approval_status as keyof typeof statusColors] || 'bg-gray-100 text-gray-700'}`}>
                        {store.approval_status?.replace('_', ' ') || 'SUBMITTED'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button 
                          className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 transition-colors flex items-center gap-1"
                          onClick={() => handleViewClick(store)}
                          title="View store details (Status will change to Under Verification)"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          View
                        </button>
                        
                        {['SUBMITTED', 'UNDER_VERIFICATION'].includes(store.approval_status) && (
                          <>
                            <button
                              className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 transition-colors flex items-center gap-1"
                              onClick={() => handleApproveClick(store)}
                              disabled={store.approval_status === 'SUBMITTED'}
                              title={store.approval_status === 'SUBMITTED' ? "Please view details first" : "Approve this store"}
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Approve
                            </button>
                            <button
                              className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors flex items-center gap-1"
                              onClick={() => handleReject(store)}
                              disabled={store.approval_status === 'SUBMITTED'}
                              title={store.approval_status === 'SUBMITTED' ? "Please view details first" : "Reject this store"}
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* View Modal */}
        {viewModal.open && viewModal.store && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div 
              ref={viewModalRef}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              <div className="flex justify-between items-center p-6 border-b bg-gray-50">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{viewModal.store.store_name}</h2>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-sm text-gray-600">
                      Store ID: {viewModal.store.store_id}
                      {viewModal.store.parent_id && (
                        <span className="ml-4">Parent ID: {viewModal.store.parent_id}</span>
                      )}
                    </span>
                    {/* Approval status badge and under review indicator remain as is, but DRAFT label is removed */}
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColors[viewModal.store.approval_status as keyof typeof statusColors]}`}>
                      {viewModal.store.approval_status?.replace('_', ' ')}
                    </span>
                    {viewModal.store.approval_status === 'UNDER_VERIFICATION' && (
                      <span className="text-xs text-blue-600 font-medium flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Under Review
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setViewModal({ open: false })}
                  className="text-gray-400 hover:text-gray-600 text-2xl p-2"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-medium text-gray-500">Store Name</label>
                          <p className="mt-1 text-sm text-gray-900">{viewModal.store.store_name}</p>
                        </div>
                          <div>
                            <label className="text-xs font-medium text-gray-500">Store Display Name</label>
                            <p className="mt-1 text-sm text-gray-900">{viewModal.store.store_display_name || "-"}</p>
                          </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">Store Email</label>
                          <p className="mt-1 text-sm text-gray-900">{viewModal.store.store_email || '-'}</p>
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs font-medium text-gray-500">Cuisine Type</label>
                          <p className="mt-1 text-sm text-gray-900">
                            {Array.isArray(viewModal.store.cuisine_types) && viewModal.store.cuisine_types.length > 0
                              ? viewModal.store.cuisine_types.join(", ")
                              : "-"}
                          </p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">Longitude</label>
                          <p className="mt-1 text-sm text-gray-900">{viewModal.store.longitude ?? "-"}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">Latitude</label>
                          <p className="mt-1 text-sm text-gray-900">{viewModal.store.latitude ?? "-"}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">Avg. Preparation Time (min)</label>
                          <p className="mt-1 text-sm text-gray-900">{viewModal.store.avg_preparation_time_minutes ?? "-"}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">Min Order Amount</label>
                          <p className="mt-1 text-sm text-gray-900">{viewModal.store.min_order_amount ?? "-"}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">Delivery Radius (km)</label>
                          <p className="mt-1 text-sm text-gray-900">{viewModal.store.delivery_radius_km ?? "-"}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">Is Pure Veg</label>
                          <p className="mt-1 text-sm text-gray-900">{typeof viewModal.store.is_pure_veg === "boolean" ? (viewModal.store.is_pure_veg ? "Yes" : "No") : "-"}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">Accepts Online Payment</label>
                          <p className="mt-1 text-sm text-gray-900">{typeof viewModal.store.accepts_online_payment === "boolean" ? (viewModal.store.accepts_online_payment ? "Yes" : "No") : "-"}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">Accepts Cash</label>
                          <p className="mt-1 text-sm text-gray-900">{typeof viewModal.store.accepts_cash === "boolean" ? (viewModal.store.accepts_cash ? "Yes" : "No") : "-"}</p>
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs font-medium text-gray-500">Description</label>
                          <p className="mt-1 text-sm text-gray-900">{viewModal.store.store_description || '-'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-medium text-gray-500">Phone Numbers</label>
                          <div className="mt-1 space-y-1">
                            {Array.isArray(viewModal.store.store_phones) ? (
                              viewModal.store.store_phones.map((phone: string, index: number) => (
                                <p key={index} className="text-sm text-gray-900">{phone}</p>
                              ))
                            ) : (
                              <p className="text-sm text-gray-900">-</p>
                            )}
                          </div>
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs font-medium text-gray-500">Full Address</label>
                          <p className="mt-1 text-sm text-gray-900">{viewModal.store.full_address}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">City</label>
                          <p className="mt-1 text-sm text-gray-900">{viewModal.store.city}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">State</label>
                          <p className="mt-1 text-sm text-gray-900">{viewModal.store.state}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">Postal Code</label>
                          <p className="mt-1 text-sm text-gray-900">{viewModal.store.postal_code}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">Landmark</label>
                          <p className="mt-1 text-sm text-gray-900">{viewModal.store.landmark || '-'}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Legal Documents</h3>
                      <div className="grid grid-cols-2 gap-4">
                        {storeDocuments.length === 0 ? (
                          <div className="col-span-2 text-gray-500">No documents found.</div>
                        ) : (
                          storeDocuments.map((doc, idx) => (
                            <div key={`${doc.document_type}-${idx}`} className="col-span-2 border-b pb-2 mb-2">
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="font-medium text-gray-700">{doc.document_type}</span>
                                  {doc.document_number && (
                                    <span className="ml-2 text-xs text-gray-500">{doc.document_number}</span>
                                  )}
                                </div>
                                <select
                                  className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${doc.is_verified ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}
                                  value={doc.is_verified ? 'APPROVED' : 'PENDING'}
                                  onChange={e => {
                                    const newStatus = e.target.value;
                                    if (newStatus === 'APPROVED') {
                                      setDocStatusModal({ open: true, docId: doc.id, idx });
                                      setPendingDocStatus({ idx, value: 'APPROVED' });
                                    } else {
                                      // If set back to pending, just update UI (optional: update backend)
                                      setPendingDocStatus({ idx, value: 'PENDING' });
                                    }
                                  }}
                                >
                                  <option value="PENDING">Pending</option>
                                  <option value="APPROVED">Approved</option>
                                </select>
                                      {/* Document Status Confirmation Modal */}
                                      {docStatusModal?.open && (
                                        <div className="fixed inset-0 flex items-center justify-center z-[120] p-4" style={{ backdropFilter: 'blur(1px)', background: 'rgba(255,255,255,0.1)' }}>
                                          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
                                            <div className="text-center mb-6">
                                              <h3 className="text-lg font-bold text-gray-900 mb-2">Approve Document</h3>
                                              <p className="text-sm text-gray-600 mb-4">Are you sure you want to approve this document?</p>
                                            </div>
                                            <div className="flex gap-3 justify-center">
                                              <button
                                                className="flex-1 px-4 py-2.5 border-2 border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-50"
                                                onClick={() => {
                                                  // Cancel: revert dropdown to Pending
                                                  if (pendingDocStatus) {
                                                    setStoreDocuments(prev => prev.map((d, i) => i === pendingDocStatus.idx ? { ...d, is_verified: false } : d));
                                                  }
                                                  setDocStatusModal(null);
                                                  setPendingDocStatus(null);
                                                }}
                                              >
                                                Cancel
                                              </button>
                                              <button
                                                className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700"
                                                onClick={async () => {
                                                  // Approve: update backend and UI
                                                  if (docStatusModal?.docId !== undefined && pendingDocStatus) {
                                                    await fetch('/api/update-document-status', {
                                                      method: 'POST',
                                                      headers: { 'Content-Type': 'application/json' },
                                                      body: JSON.stringify({ id: docStatusModal.docId, is_verified: true })
                                                    });
                                                    setStoreDocuments(prev => prev.map((d, i) => i === pendingDocStatus.idx ? { ...d, is_verified: true } : d));
                                                  }
                                                  setDocStatusModal(null);
                                                  setPendingDocStatus(null);
                                                }}
                                              >
                                                Approve
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <img
                                  src={doc.document_url}
                                  alt={doc.document_type}
                                  className="h-16 w-auto rounded cursor-pointer border hover:opacity-90 transition-opacity"
                                  onClick={() => setZoomedImage(doc.document_url)}
                                />
                                <button
                                  onClick={() => setZoomedImage(doc.document_url)}
                                  className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                                >
                                  Zoom
                                </button>
                                {doc.rejection_reason && <span className="text-xs text-red-500 ml-2">Rejected: {doc.rejection_reason}</span>}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Operating Hours</h3>
                      <div className="grid grid-cols-2 gap-4">
                        {operatingHours.length === 0 ? (
                          <div className="col-span-2 text-gray-500">No operating hours found.</div>
                        ) : (
                          operatingHours.map((hour, idx) => (
                            <div key={hour.id || idx} className="col-span-2 border-b pb-2 mb-2">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-gray-700">{hour.day_label}</span>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${hour.open ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                  {hour.open ? 'Open' : 'Closed'}
                                </span>
                              </div>
                              <div className="text-xs text-gray-600 mt-1">
                                Slot 1: {hour.slot1_start || '-'} - {hour.slot1_end || '-'}
                                {hour.slot2_start && hour.slot2_end && (
                                  <>
                                    <br />Slot 2: {hour.slot2_start} - {hour.slot2_end}
                                  </>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Additional Info Section */}
                <div className="mt-8 pt-4 border-t">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-gray-500">Store Type</label>
                      <p className="mt-1 text-sm text-gray-900">{viewModal.store.store_type || '-'}</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500">Operational Status</label>
                      <p className="mt-1 text-sm text-gray-900">{viewModal.store.operational_status || '-'}</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500">Approval Status</label>
                      <p className="mt-1 text-sm text-gray-900">{viewModal.store.approval_status || '-'}</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500">Status</label>
                      <p className="mt-1 text-sm text-gray-900">{viewModal.store.status || '-'}</p>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-medium text-gray-500">Food Categories</label>
                      <p className="mt-1 text-sm text-gray-900">{Array.isArray(viewModal.store.food_categories) ? viewModal.store.food_categories.join(', ') : viewModal.store.food_categories || '-'}</p>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-medium text-gray-500">Gallery Images</label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {Array.isArray(viewModal.store.gallery_images) && viewModal.store.gallery_images.length > 0 ? (
                          viewModal.store.gallery_images.map((img: string, idx: number) => (
                            <div key={idx} className="relative group">
                              <img
                                src={img}
                                alt="Gallery"
                                className="h-16 w-16 object-cover rounded border cursor-pointer hover:opacity-90"
                                onClick={() => setZoomedImage(img)}
                              />
                              <button
                                onClick={() => setZoomedImage(img)}
                                className="absolute bottom-0 right-0 px-1 py-0.5 text-xs bg-blue-600 text-white rounded-tl opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                Zoom
                              </button>
                            </div>
                          ))
                        ) : (
                          <span className="text-gray-400">No images</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500">Logo</label>
                      <div className="mt-1">
                        {viewModal.store.logo_url ? (
                          <div className="relative inline-block group">
                            <img
                              src={viewModal.store.logo_url}
                              alt="Logo"
                              className="h-12 w-12 object-cover rounded border cursor-pointer hover:opacity-90"
                              onClick={() => setZoomedImage(viewModal.store.logo_url)}
                            />
                            <button
                              onClick={() => setZoomedImage(viewModal.store.logo_url)}
                              className="absolute bottom-0 right-0 px-1 py-0.5 text-xs bg-blue-600 text-white rounded-tl opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              Zoom
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-400">No logo</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500">Banner</label>
                      <div className="mt-1">
                        {viewModal.store.banner_url ? (
                          <div className="relative inline-block group">
                            <img
                              src={viewModal.store.banner_url}
                              alt="Banner"
                              className="h-12 w-24 object-cover rounded border cursor-pointer hover:opacity-90"
                              onClick={() => setZoomedImage(viewModal.store.banner_url)}
                            />
                            <button
                              onClick={() => setZoomedImage(viewModal.store.banner_url)}
                              className="absolute bottom-0 right-0 px-1 py-0.5 text-xs bg-blue-600 text-white rounded-tl opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              Zoom
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-400">No banner</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons in Modal */}
              <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
                <button
                  className="px-4 py-2.5 border-2 border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-50"
                  onClick={() => setViewModal({ open: false })}
                >
                  Close
                </button>
                <button
                  className="px-4 py-2.5 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700"
                  onClick={() => handleReject(viewModal.store)}
                  disabled={viewModal.store.approval_status === 'SUBMITTED'}
                >
                  Reject
                </button>
                <button
                  className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700"
                  onClick={() => handleApproveClick(viewModal.store)}
                  disabled={viewModal.store.approval_status === 'SUBMITTED'}
                >
                  Approve
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Zoomed Image Modal */}
        {zoomedImage && (
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-4" onClick={e => { e.stopPropagation(); setZoomedImage(null); }}>
            <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
              <img
                src={zoomedImage}
                alt="Zoomed Document"
                className="max-h-[80vh] max-w-[90vw] rounded-lg shadow-2xl"
              />
              <button
                onClick={e => { e.stopPropagation(); setZoomedImage(null); }}
                className="absolute -top-3 -right-3 bg-white rounded-full p-2 shadow-lg hover:bg-gray-100"
              >
                <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Approve Confirmation Modal */}
        {approveModal.open && approveModal.store && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div ref={approveModalRef} className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
              <div className="text-center mb-6">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-emerald-100 mb-4">
                  <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Approve Store</h3>
                <p className="text-sm text-gray-600">
                  Are you sure you want to approve <strong>{approveModal.store.store_name}</strong>?
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  Once approved, this store will be moved to store management and removed from verification list.
                </p>
              </div>
              
              <div className="flex gap-3">
                <button
                  className="flex-1 px-4 py-2.5 border-2 border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-50"
                  onClick={() => setApproveModal({ open: false })}
                >
                  Cancel
                </button>
                <button
                  className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700"
                  onClick={confirmApprove}
                >
                  Approve Store
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reject Modal */}
        {rejectModal.open && rejectModal.store && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div ref={rejectModalRef} className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border-2 border-red-200">
              <div className="text-center mb-6">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                  <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.998-.833-2.732 0L4.312 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Reject Store</h3>
                <p className="text-sm text-gray-600">
                  Please provide a reason for rejecting <strong>{rejectModal.store.store_name}</strong>:
                </p>
              </div>
              
              <textarea
                className="w-full border rounded-lg p-3 mb-6 text-sm focus:ring-2 focus:ring-red-500"
                rows={4}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter reason for rejection..."
              />
              
              <div className="flex gap-3">
                <button
                  className="flex-1 px-4 py-2.5 border-2 border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-50"
                  onClick={() => setRejectModal({ open: false })}
                >
                  Cancel
                </button>
                <button
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50"
                  onClick={confirmReject}
                  disabled={!rejectReason.trim()}
                >
                  Reject Store
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}