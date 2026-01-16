"use client";
"use client";
import React, { useState, useEffect } from 'react';
import AdminLayout from '../../../components/AdminLayout';
import { fetchAllManagers, createManager, updateManager, deleteManager, AreaManager } from '@/lib/managers';
import { fetchStoresByManager, MerchantStore } from '@/lib/merchantStore';

const statusColors = {
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-gray-100 text-gray-700',
};

export default function ManagersPage() {
  useEffect(() => {
    // Hide vertical scrollbar for the whole page
    document.body.style.overflowY = 'hidden';
    return () => {
      document.body.style.overflowY = '';
    };
  }, []);
  const [managers, setManagers] = useState<AreaManager[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    id: '',
    name: '',
    email: '',
    mobile: '',
    alternate_mobile: '',
    region: '',
    cities: '',
    postal_codes: '',
    status: 'ACTIVE'
  });
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showStores, setShowStores] = useState<{ open: boolean; managerName?: string; managerPhone?: string }>({ open: false });
  const [managerStores, setManagerStores] = useState<MerchantStore[]>([]);
  const [search, setSearch] = useState('');
  const [filteredManagers, setFilteredManagers] = useState<AreaManager[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);

  useEffect(() => {
    loadManagers();
  }, []);

  const loadManagers = async () => {
    setLoading(true);
    try {
      const data = await fetchAllManagers();
      setManagers(data);
      setFilteredManagers(data);
    } catch (error) {
      console.error('Error loading managers:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!search) {
      setFilteredManagers(managers);
    } else {
      const s = search.toLowerCase();
      setFilteredManagers(
        managers.filter(
          (m) =>
            m.name.toLowerCase().includes(s) ||
            (m.email && m.email.toLowerCase().includes(s)) ||
            (m.phone && m.phone.toLowerCase().includes(s))
        )
      );
    }
  }, [search, managers]);

  const handleEdit = (id: string) => {
    const m = managers.find((m) => m.id === id);
    if (m) {
      setForm({ 
        id: m.id, 
        name: m.name, 
        region: m.region, 
        email: m.email || '', 
        phone: m.phone || '', 
        status: m.status 
      });
      setEditId(id);
      setShowForm(true);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this manager?')) return;
    
    setLoading(true);
    try {
      await deleteManager(id);
      await loadManagers();
    } catch (error) {
      console.error('Error deleting manager:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editId) {
        await updateManager(editId, { ...form, status: form.status as 'active' | 'inactive' });
      } else {
        await createManager({ ...form, status: form.status as 'active' | 'inactive' });
      }
      await loadManagers();
      setShowForm(false);
      setForm({ id: '', name: '', region: '', email: '', phone: '', status: 'active' });
      setEditId(null);
    } catch (error) {
      console.error('Error saving manager:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleManagerStatus = async (id: string, currentStatus: 'active' | 'inactive') => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const action = newStatus === 'active' ? 'activate' : 'deactivate';
    
    if (!confirm(`Are you sure you want to ${action} this manager?`)) return;
    
    setLoading(true);
    try {
      await updateManager(id, { status: newStatus });
      await loadManagers();
    } catch (error) {
      console.error(`Error ${action}ing manager:`, error);
    }
  };

  const handleViewStores = async (managerPhone: string, managerName: string) => {
    setStoresLoading(true);
    try {
      const stores = await fetchStoresByManager(managerPhone || '');
      setManagerStores(stores);
      setShowStores({ open: true, managerName, managerPhone });
    } catch (error) {
      console.error('Error loading stores:', error);
      setManagerStores([]);
      setShowStores({ open: true, managerName, managerPhone });
    } finally {
      setStoresLoading(false);
    }
  };

  return (
    <AdminLayout>
      <div className="min-h-screen bg-white px-2 py-2 overflow-hidden">
        <div className="mb-1">
          <h1 className="text-lg font-bold text-gray-900 mb-1">Area Manager Management</h1>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1">
            <button
              className="px-2 py-1 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 transition-colors text-xs"
              onClick={() => { 
                setShowForm(true); 
                setEditId(null); 
                setForm({
                  id: '',
                  name: '',
                  email: '',
                  mobile: '',
                  alternate_mobile: '',
                  region: '',
                  cities: '',
                  postal_codes: '',
                  status: 'ACTIVE'
                });
              }}
            >
              Add Manager
            </button>
            {/*
              NOTE: If you see hydration mismatch errors here, ensure no browser extensions (like temp mail, password managers, etc.) are injecting attributes into this input. 
              Do not add dynamic style or data-* attributes here. If you must, use useEffect to set them only on the client.
            */}
            <input
              type="text"
              placeholder="Search by name, email, or mobile..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-2 py-1 border rounded w-full md:w-60 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded border mb-4">
          <table className="min-w-full bg-white text-xs">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="px-2 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Manager ID</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Name</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Email</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Mobile</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Region/City</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Status</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Managed Stores</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-gray-400">
                    Loading...
                  </td>
                </tr>
              ) : filteredManagers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-gray-400">
                    No area managers found.
                  </td>
                </tr>
              ) : (
                filteredManagers.map((m) => (
                  <tr key={m.id} className="border-b hover:bg-gray-50">
                    <td className="px-2 py-2 font-mono text-xs text-blue-700 font-semibold whitespace-nowrap">
                      {m.manager_id || m.id}
                    </td>
                    <td className="px-2 py-2 font-semibold text-gray-900 whitespace-nowrap">
                      {m.name}
                    </td>
                    <td className="px-2 py-2 text-gray-900 whitespace-nowrap overflow-hidden text-ellipsis max-w-xs">
                      {m.email || '-'}
                    </td>
                    <td className="px-2 py-2 text-gray-900 whitespace-nowrap overflow-hidden text-ellipsis max-w-xs">
                      {m.mobile || '-'}
                    </td>
                    <td className="px-2 py-2 text-gray-700 whitespace-nowrap">
                      {m.region}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        m.status === 'active' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-gray-200 text-gray-700'
                      }`}>
                        {m.status.charAt(0).toUpperCase() + m.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-gray-700 whitespace-nowrap">
                      <button
                        className="px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs font-medium hover:bg-blue-200 transition-colors"
                        onClick={() => handleViewStores(m.mobile || '', m.name)}
                      >
                        View Stores
                      </button>
                    </td>
                    <td className="px-2 py-2 flex gap-1 whitespace-nowrap">
                      <button 
                        className="px-2 py-1 rounded bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200 transition-colors"
                        onClick={() => handleEdit(m.id)}
                      >
                        Edit
                      </button>
                      <button 
                        className="px-2 py-1 rounded bg-red-100 text-red-700 text-xs font-medium hover:bg-red-200 transition-colors"
                        onClick={() => handleDelete(m.id)}
                      >
                        Delete
                      </button>
                      <button 
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                          m.status === 'active'
                            ? 'bg-gray-400 text-white hover:bg-gray-500'
                            : 'bg-green-500 text-white hover:bg-green-600'
                        }`}
                        onClick={() => toggleManagerStatus(m.id, m.status as 'active' | 'inactive')}
                      >
                        {m.status === 'active' ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Manager Form Modal */}
        {showForm && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50 p-4">
            <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 border-2 border-blue-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                {editId ? 'Edit' : 'Add'} Area Manager
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Name <span className="text-red-500">*</span></label>
                  <input className="w-full border rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Email <span className="text-red-500">*</span></label>
                  <input className="w-full border rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Mobile <span className="text-red-500">*</span></label>
                  <input className="w-full border rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500" type="tel" value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Alternate Mobile</label>
                  <input className="w-full border rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500" type="tel" value={form.alternate_mobile} onChange={e => setForm({ ...form, alternate_mobile: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Region <span className="text-red-500">*</span></label>
                  <input className="w-full border rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.region} onChange={e => setForm({ ...form, region: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Cities (comma separated)</label>
                  <input className="w-full border rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.cities} onChange={e => setForm({ ...form, cities: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Postal Codes (comma separated)</label>
                  <input className="w-full border rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.postal_codes} onChange={e => setForm({ ...form, postal_codes: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
                  <select className="w-full border rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  type="button"
                  className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg text-gray-900 font-semibold hover:bg-gray-50 transition-colors"
                  onClick={() => { 
                    setShowForm(false); 
                    setEditId(null); 
                    setForm({ id: '', name: '', region: '', email: '', phone: '', status: 'active' });
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                  disabled={loading}
                >
                  {loading ? 'Saving...' : editId ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Managed Stores Modal - No Scroll, Compact Design */}
        {showStores.open && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full border-2 border-gray-300 overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-50 to-gray-50 px-6 py-4 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">
                      Stores Managed by {showStores.managerName}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Manager Phone: {showStores.managerPhone || 'N/A'}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-blue-700">{managerStores.length}</div>
                    <div className="text-xs text-gray-500">Total Stores</div>
                  </div>
                </div>
              </div>

              {/* Content - No Scroll */}
              <div className="p-0">
                {storesLoading ? (
                  <div className="py-16 text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mb-3"></div>
                    <p className="text-gray-500">Loading stores...</p>
                  </div>
                ) : managerStores.length === 0 ? (
                  <div className="py-12 text-center border-y border-gray-100">
                    <div className="text-gray-400 mb-2">
                      <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                    <p className="text-gray-500 font-medium">No stores found for this manager</p>
                  </div>
                ) : (
                  <div className="overflow-hidden">
                    <table className="w-full bg-white">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">Store Name</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">Address</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">Postal</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">Phone</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">Store ID</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {managerStores.map((store, index) => (
                          <tr key={store.store_id} className={`hover:bg-gray-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                              <div className="max-w-[180px] truncate" title={store.store_name}>
                                {store.store_name}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              <div className="max-w-[200px] truncate" title={store.full_address}>
                                {store.full_address}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                              {store.postal_code}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                              {Array.isArray(store.store_phones) ? store.store_phones.join(', ') : store.store_phones}
                            </td>
                            <td className="px-4 py-3 text-sm font-mono text-blue-700 font-medium whitespace-nowrap">
                              {store.store_id}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                store.approval_status === 'APPROVED' 
                                  ? 'bg-green-100 text-green-800' 
                                  : store.approval_status === 'REJECTED' 
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-yellow-100 text-yellow-800'
                              }`}>
                                {store.approval_status || 'PENDING'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500">
                    Showing <span className="font-semibold text-gray-700">{managerStores.length}</span> store{managerStores.length !== 1 ? 's' : ''}
                  </div>
                  <button
                    className="px-5 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    onClick={() => setShowStores({ open: false })}
                  >
                    Close
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