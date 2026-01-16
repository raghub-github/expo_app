"use client";
"use client";
import React, { useEffect, useState } from 'react';
import AdminLayout from '../../../components/AdminLayout';
import { fetchManagedStores, updateStoreInfo } from '@/lib/database';
import { supabase } from '@/lib/supabase';

const REASON_TYPES = [
  { value: 'RENOVATION', label: 'Renovation' },
  { value: 'PERMANENTLY_SHUT_DOWN', label: 'Permanently Shut Down' },
  { value: 'TEMPORARY_SHUTDOWN', label: 'Temporary Shutdown' },
  { value: 'COMMISSION_ISSUE', label: 'Commission Issue' },
  { value: 'OWNERSHIP_CHANGED', label: 'Ownership Changed' },
  { value: 'OTHERS', label: 'Others' }
];

// Create new merchant activity record - this allows multiple records per store
const createMerchantActivity = async (data: {
  store_id: string;
  store_name: string;
  delisted_reason: string;
  delisted_reason_type: string;
  delisted_reason_note: string;
  relist_on?: string;
  agent_email: string;
  created_at: string;
  updated_at: string;
}) => {
  const { data: result, error } = await supabase
    .from('merchant_activity')
    .insert([data])
    .select()
    .single();
  
  if (error) throw error;
  return result;
};

// Get the latest merchant activity for a store
const getLatestMerchantActivity = async (storeId: string) => {
  const { data, error } = await supabase
    .from('merchant_activity')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    throw error;
  }
  return data;
};

// Update specific merchant activity record by ID (not by store_id)
const updateMerchantActivityById = async (activityId: number, data: {
  relisted_by?: string;
  relisted_reason?: string;
  relisted_at?: string;
  updated_at: string;
}) => {
  const { data: result, error } = await supabase
    .from('merchant_activity')
    .update(data)
    .eq('id', activityId)
    .select()
    .single();
  
  if (error) throw error;
  return result;
};

// Add this function to update the latest activity record when relisting
const updateLatestMerchantActivity = async (storeId: string, data: {
  relisted_by?: string;
  relisted_reason?: string;
  relisted_at?: string;
  updated_at: string;
}) => {
  // First, get the latest activity record for this store
  const latestActivity = await getLatestMerchantActivity(storeId);
  
  if (!latestActivity) {
    throw new Error('No merchant activity found for this store');
  }
  
  // Update that specific record by ID
  return updateMerchantActivityById(latestActivity.id, data);
};

export default function StoresPage() {
    useEffect(() => {
      // Hide vertical scrollbar for the whole page
      document.body.style.overflowY = 'hidden';
      return () => {
        document.body.style.overflowY = '';
      };
    }, []);
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [delistModal, setDelistModal] = useState<{ 
    open: boolean; 
    store?: any; 
    reasonType: string; 
    reasonNote: string;
    relistDate?: string;
  }>({ 
    open: false, 
    reasonType: 'RENOVATION', 
    reasonNote: '' 
  });
  const [relistModal, setRelistModal] = useState<{ 
    open: boolean; 
    store?: any; 
    relistReason: string;
  }>({ 
    open: false, 
    relistReason: '' 
  });
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    delisted: 0
  });
  const [currentAdmin] = useState({
    name: 'Admin',
    email: 'admin@example.com'
  });

  const fetchData = async (from?: string, to?: string) => {
    setLoading(true);
    try {
      const data = await fetchManagedStores(from, to);
      setStores(data);
      
      const total = data.length;
      const active = data.filter(store => store.is_active && store.approval_status === 'APPROVED').length;
      const delisted = data.filter(store => !store.is_active).length;
      
      setStats({ total, active, delisted });
    } catch (error) {
      console.error('Error fetching stores:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelist = (store: any) => {
    setDelistModal({ 
      open: true, 
      store, 
      reasonType: 'RENOVATION', 
      reasonNote: '',
      relistDate: ''
    });
  };

  const confirmDelist = async () => {
    if (!delistModal.store || !delistModal.reasonType.trim()) return;

    setLoading(true);
    try {
      const today = new Date().toISOString();
      const relistDate = (delistModal.reasonType === 'TEMPORARY_SHUTDOWN' || delistModal.reasonType === 'RENOVATION') && delistModal.relistDate 
        ? new Date(delistModal.relistDate).toISOString()
        : undefined;

      // Always create a new activity record for each delist
      await createMerchantActivity({
        store_id: delistModal.store.store_id,
        store_name: delistModal.store.store_name,
        delisted_reason: delistModal.reasonNote || `Delisted due to ${REASON_TYPES.find(r => r.value === delistModal.reasonType)?.label.toLowerCase()}`,
        delisted_reason_type: delistModal.reasonType,
        delisted_reason_note: delistModal.reasonNote,
        relist_on: relistDate,
        agent_email: currentAdmin.email,
        created_at: today,
        updated_at: today
      });

      await updateStoreInfo(delistModal.store.store_id, {
        is_active: false,
        updated_at: today
      });

      await fetchData(fromDate, toDate);
      setDelistModal({ open: false, reasonType: 'RENOVATION', reasonNote: '' });
    } catch (error) {
      console.error('Error delisting store:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRelist = async (store: any) => {
    try {
      setRelistModal({ open: true, store, relistReason: '' });
    } catch (error) {
      console.error('Error fetching activity:', error);
      setRelistModal({ open: true, store, relistReason: '' });
    }
  };

  const confirmRelist = async () => {
    if (!relistModal.store || !relistModal.relistReason.trim()) return;

    setLoading(true);
    try {
      const today = new Date().toISOString();

      await updateStoreInfo(relistModal.store.store_id, {
        is_active: true,
        updated_at: today
      });

      // Update the latest merchant activity with relist info
      try {
        await updateLatestMerchantActivity(relistModal.store.store_id, {
          relisted_by: currentAdmin.name,
          relisted_reason: relistModal.relistReason,
          relisted_at: today,
          updated_at: today
        });
      } catch (error) {
        console.warn('Could not update activity record:', error);
        // Even if update fails, continue with re-listing the store
      }

      await fetchData(fromDate, toDate);
      setRelistModal({ open: false, relistReason: '' });
    } catch (error) {
      console.error('Error relisting store:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (store: any) => {
    if (!store.is_active) {
      return <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 border border-red-200">Delisted</span>;
    }
    if (store.approval_status === 'APPROVED') {
      return <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">Active</span>;
    }
    if (store.approval_status === 'REJECTED') {
      return <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">Rejected</span>;
    }
    return null;
  };

  const getActionText = (store: any) => {
    return !store.is_active ? 'Re-list Store' : 'Delist Store';
  };

  const clearFilters = () => {
    setFromDate('');
    setToDate('');
    fetchData();
  };

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gray-50 p-4">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-base font-bold text-gray-900">Stores Management</h1>
          <p className="text-xs text-gray-600 mt-0.5">Manage all stores and their status</p>
        </div>

        {/* Combined Date Filters and Stats Cards Row */}
        <div className="bg-white rounded border shadow-sm p-4 mb-4">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-1">
            {/* Left side - Date Filters */}
            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-medium text-gray-700 whitespace-nowrap">From</span>
                    <input 
                      type="date" 
                      className="px-2 py-1 text-xs border border-gray-300 rounded bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      value={fromDate} 
                      onChange={e => setFromDate(e.target.value)} 
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-medium text-gray-700 whitespace-nowrap">To</span>
                    <input 
                      type="date" 
                      className="px-2 py-1 text-xs border border-gray-300 rounded bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      value={toDate} 
                      onChange={e => setToDate(e.target.value)} 
                    />
                  </div>
                  <button
                    className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
                    onClick={() => fetchData(fromDate, toDate)}
                  >
                    Apply
                  </button>
                  {(fromDate || toDate) && (
                    <button
                      className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded text-xs font-medium hover:bg-gray-50 transition-colors whitespace-nowrap"
                      onClick={clearFilters}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Right side - Stats Cards */}
            <div className="grid grid-cols-3 gap-2">
              <div className="border rounded p-1">
                <div className="text-xs font-medium text-gray-500">TOTAL STORES</div>
                <div className="text-base font-bold text-gray-900">{stats.total}</div>
              </div>
              <div className="border rounded p-2">
                <div className="text-xs font-medium text-gray-500">ACTIVE</div>
                <div className="text-base font-bold text-emerald-600">{stats.active}</div>
              </div>
              <div className="border rounded p-2">
                <div className="text-xs font-medium text-gray-500">DELISTED</div>
                <div className="text-base font-bold text-red-600">{stats.delisted}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Stores Table - Compact */}
        <div className="bg-white rounded border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-1 text-left text-xs font-semibold text-gray-600 uppercase">Store ID</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Store Name</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Parent ID</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Address</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Created At</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6">
                      <div className="flex flex-col items-center justify-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mb-1"></div>
                        <p className="text-xs text-gray-500">Loading...</p>
                      </div>
                    </td>
                  </tr>
                ) : stores.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6">
                      <div className="flex flex-col items-center justify-center text-gray-400">
                        <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        <p className="text-sm font-medium">No stores found</p>
                        <p className="text-xs mt-0.5">Adjust filters or check back later</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  stores.map((store) => (
                    <tr key={store.store_id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <div className="font-mono text-xs text-blue-600 font-medium bg-blue-50 px-1.5 py-0.5 rounded">
                          {store.store_id}
                        </div>
                      </td>
                      <td className="px-2 py-1">
                        <div className="text-xs font-medium text-gray-900 truncate max-w-[120px]">{store.store_name}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-xs text-gray-700">{store.parent_id || '-'}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-xs text-gray-700 truncate max-w-[150px]" title={store.full_address}>
                          {store.full_address || '-'}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-xs text-gray-700">
                          {store.created_at ? (
                            <>
                              <div>{new Date(store.created_at).toLocaleDateString()}</div>
                              <div className="text-[10px] text-gray-400">
                                {new Date(store.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </>
                          ) : '-'}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {getStatusBadge(store)}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                            !store.is_active 
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                              : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                          }`}
                          onClick={() => {
                            if (!store.is_active) {
                              handleRelist(store);
                            } else {
                              handleDelist(store);
                            }
                          }}
                        >
                          {getActionText(store)}
                          {!store.is_active ? (
                            <svg className="ml-1 w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          ) : (
                            <svg className="ml-1 w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Delist Modal - Compact */}
        {delistModal.open && delistModal.store && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-2">
            <div className="bg-white rounded-lg shadow-xl max-w-sm w-full overflow-hidden">
              <div className="bg-red-50 p-4 border-b border-red-200">
                <div className="flex items-center">
                  <svg className="h-5 w-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.998-.833-2.732 0L4.312 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <div className="ml-2">
                    <h3 className="text-sm font-bold text-gray-900">Delist Store</h3>
                    <p className="text-xs text-gray-600">{delistModal.store.store_name}</p>
                  </div>
                </div>
              </div>
              
              <div className="p-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Reason Type</label>
                    <select
                      className="w-full text-xs border rounded p-2 focus:ring-1 focus:ring-red-500 focus:border-red-500"
                      value={delistModal.reasonType}
                      onChange={(e) => setDelistModal(prev => ({ ...prev, reasonType: e.target.value }))}
                    >
                      {REASON_TYPES.map(reason => (
                        <option key={reason.value} value={reason.value}>
                          {reason.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Reason Details *
                    </label>
                    <textarea
                      className="w-full text-xs border rounded p-2 focus:ring-1 focus:ring-red-500 focus:border-red-500"
                      rows={2}
                      value={delistModal.reasonNote}
                      onChange={(e) => setDelistModal(prev => ({ ...prev, reasonNote: e.target.value }))}
                      placeholder="Reason for delisting..."
                      required
                    />
                  </div>

                  {(delistModal.reasonType === 'TEMPORARY_SHUTDOWN' || delistModal.reasonType === 'RENOVATION') && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {delistModal.reasonType === 'TEMPORARY_SHUTDOWN' ? 'Re-list Date *' : 'Re-list Date'}
                      </label>
                      <input
                        type="date"
                        className="w-full text-xs border rounded p-2 focus:ring-1 focus:ring-red-500 focus:border-red-500"
                        value={delistModal.relistDate || ''}
                        onChange={(e) => setDelistModal(prev => ({ ...prev, relistDate: e.target.value }))}
                        min={new Date().toISOString().split('T')[0]}
                        required={delistModal.reasonType === 'TEMPORARY_SHUTDOWN'}
                      />
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        {delistModal.reasonType === 'TEMPORARY_SHUTDOWN' 
                          ? 'When to re-list?'
                          : 'Expected completion date'}
                      </p>
                    </div>
                  )}
                </div>
                
                <div className="flex gap-2 mt-4">
                  <button
                    className="flex-1 px-3 py-2 border border-gray-300 rounded text-xs font-medium text-gray-700 hover:bg-gray-50"
                    onClick={() => setDelistModal({ open: false, reasonType: 'RENOVATION', reasonNote: '' })}
                  >
                    Cancel
                  </button>
                  <button
                    className="flex-1 px-3 py-2 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                    onClick={confirmDelist}
                    disabled={!delistModal.reasonNote.trim() || (delistModal.reasonType === 'TEMPORARY_SHUTDOWN' && !delistModal.relistDate)}
                  >
                    Delist
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Re-list Modal - Compact */}
        {relistModal.open && relistModal.store && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-2">
            <div className="bg-white rounded-lg shadow-xl max-w-sm w-full overflow-hidden">
              <div className="bg-emerald-50 p-4 border-b border-emerald-200">
                <div className="flex items-center">
                  <svg className="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div className="ml-2">
                    <h3 className="text-sm font-bold text-gray-900">Re-list Store</h3>
                    <p className="text-xs text-gray-600">{relistModal.store.store_name}</p>
                  </div>
                </div>
              </div>
              
              <div className="p-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Reason *
                  </label>
                  <textarea
                    className="w-full text-xs border rounded p-2 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                    rows={2}
                    value={relistModal.relistReason}
                    onChange={(e) => setRelistModal(prev => ({ ...prev, relistReason: e.target.value }))}
                    placeholder="Reason for re-listing..."
                    required
                  />
                </div>
                
                <div className="flex gap-2 mt-4">
                  <button
                    className="flex-1 px-3 py-2 border border-gray-300 rounded text-xs font-medium text-gray-700 hover:bg-gray-50"
                    onClick={() => setRelistModal({ open: false, relistReason: '' })}
                  >
                    Cancel
                  </button>
                  <button
                    className="flex-1 px-3 py-2 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
                    onClick={confirmRelist}
                    disabled={!relistModal.relistReason.trim()}
                  >
                    Re-list
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}