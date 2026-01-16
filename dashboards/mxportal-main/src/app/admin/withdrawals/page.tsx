"use client";
"use client";
import React, { useState, useEffect } from 'react';
import AdminLayout from '../../../components/AdminLayout';
import { fetchAllWithdrawals, updateWithdrawalStatus, Withdrawal } from '@/lib/withdrawals';

const statusColors = {
  pending: 'bg-orange-100 text-orange-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function WithdrawalsPage() {
    useEffect(() => {
      // Hide vertical scrollbar for the whole page
      document.body.style.overflowY = 'hidden';
      return () => {
        document.body.style.overflowY = '';
      };
    }, []);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectModal, setRejectModal] = useState<{ open: boolean; withdrawalId?: string }>({ open: false });
  const [rejectReason, setRejectReason] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const fetchWithdrawals = async (from?: string, to?: string) => {
    setLoading(true);
    const data = await fetchAllWithdrawals(from, to);
    setWithdrawals(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchWithdrawals();
  }, []);

  const filteredWithdrawals = withdrawals.filter((w) => {
    const matchesSearch =
      w.id.toLowerCase().includes(search.toLowerCase()) ||
      (w.store_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (w.parent_merchant || '').toLowerCase().includes(search.toLowerCase()) ||
      (w.transaction_id || '').toLowerCase().includes(search.toLowerCase()) ||
      (w.bank_details?.account_number || '').includes(search) ||
      (w.bank_details?.ifsc_code || '').toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || w.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleApprove = async (id: string) => {
    setLoading(true);
    await updateWithdrawalStatus(id, 'approved', 'TXN' + Math.floor(Math.random()*1000000));
    await fetchWithdrawals(fromDate, toDate);
    setLoading(false);
  };

  const handleReject = (id: string) => {
    setRejectModal({ open: true, withdrawalId: id });
    setRejectReason('');
  };

  const confirmReject = async () => {
    if (rejectModal.withdrawalId) {
      setLoading(true);
      await updateWithdrawalStatus(rejectModal.withdrawalId, 'rejected', undefined, rejectReason);
      await fetchWithdrawals(fromDate, toDate);
      setLoading(false);
    }
    setRejectModal({ open: false });
    setRejectReason('');
  };

  const toggleRowExpand = (id: string) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  return (
    <AdminLayout>
        <div className="min-h-screen bg-white px-2 py-2">
          <h1 className="text-lg font-bold mb-2 text-gray-900">Withdrawals</h1>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              placeholder="Search by store, merchant, txn, bank..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-2 py-1 border rounded bg-white shadow-sm text-xs"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2 py-1 border rounded bg-white shadow-sm text-xs"
            >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <label className="text-xs font-semibold text-gray-600 flex flex-col">
            From
            <input type="date" className="border rounded px-2 py-1 mt-1 text-xs" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-gray-600 flex flex-col">
            To
            <input type="date" className="border rounded px-2 py-1 mt-1 text-xs" value={toDate} onChange={e => setToDate(e.target.value)} />
          </label>
          <button
            className="ml-2 px-4 py-2 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700"
            onClick={() => fetchWithdrawals(fromDate, toDate)}
          >Apply</button>
        </div>
        <div className="overflow-x-auto rounded-lg shadow border">
          <table className="min-w-full bg-white">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Request ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Store ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Store Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Parent Merchant ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Request Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Transaction ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Actions</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Bank-Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="text-center py-8 text-gray-400">Loading...</td></tr>
              ) : filteredWithdrawals.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-gray-400">No withdrawal requests found.</td>
                </tr>
              ) : (
                filteredWithdrawals.map((w) => (
                  <React.Fragment key={w.id}>
                    <tr className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-sm text-blue-700 font-semibold">{w.id}</td>
                      <td className="px-4 py-3 font-mono text-sm text-gray-700">{w.store_id || '-'}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{w.store_name}</td>
                      <td className="px-4 py-3 font-mono text-sm text-gray-700">{w.parent_merchant_id || '-'}</td>
                      <td className="px-4 py-3 text-gray-900 font-bold">₹{w.amount.toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3 text-gray-600">{w.request_date?.slice(0,10) || w.date?.slice(0,10) || '-'}</td>
                      <td className="px-4 py-3 font-mono text-sm text-gray-700">
                        {w.transaction_id || w.transaction || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusColors[w.status as keyof typeof statusColors]}`}>
                          {w.status.charAt(0).toUpperCase() + w.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 flex gap-2">
                        {w.status === 'pending' && (
                          <>
                            <button
                              className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600"
                              onClick={() => handleApprove(w.id)}
                            >
                              Approve
                            </button>
                            <button
                              className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600"
                              onClick={() => handleReject(w.id)}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {w.status === 'approved' && (
                          <span className="px-3 py-1.5 text-xs text-emerald-600 font-medium">Completed</span>
                        )}
                        {w.status === 'rejected' && (
                          <span className="px-3 py-1.5 text-xs text-red-600 font-medium">Rejected</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleRowExpand(w.id)}
                          className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200"
                        >
                          {expandedRow === w.id ? 'Hide Bank' : 'Show Bank'}
                        </button>
                      </td>
                    </tr>
                    
                    {/* Expanded Bank Details Row */}
                    {expandedRow === w.id && w.bank_details && (
                      <tr className="border-b bg-blue-50">
                        <td colSpan={10} className="px-4 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="space-y-2">
                              <h4 className="text-sm font-semibold text-gray-700">Account Holder</h4>
                              <p className="text-gray-900 font-medium">{w.bank_details.account_holder || '-'}</p>
                            </div>
                            <div className="space-y-2">
                              <h4 className="text-sm font-semibold text-gray-700">Account Number</h4>
                              <p className="text-gray-900 font-mono">{w.bank_details.account_number || '-'}</p>
                            </div>
                            <div className="space-y-2">
                              <h4 className="text-sm font-semibold text-gray-700">Bank Name</h4>
                              <p className="text-gray-900">{w.bank_details.bank_name || '-'}</p>
                            </div>
                            <div className="space-y-2">
                              <h4 className="text-sm font-semibold text-gray-700">IFSC Code</h4>
                              <p className="text-gray-900 font-mono">{w.bank_details.ifsc_code || '-'}</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Reject Modal */}
        {rejectModal.open && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
            <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 border-2 border-red-200">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Reject Withdrawal</h3>
              <p className="text-sm text-gray-600 mb-4">Please provide a reason for rejection:</p>
              <textarea
                className="w-full border rounded-lg p-2 mb-4"
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter reason..."
              />
              <div className="flex gap-2">
                <button
                  className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg text-gray-900 font-semibold hover:bg-gray-50"
                  onClick={() => setRejectModal({ open: false })}
                >
                  Cancel
                </button>
                <button
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700"
                  onClick={confirmReject}
                  disabled={!rejectReason.trim()}
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}