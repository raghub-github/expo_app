"use client";
import React, { useEffect, useState } from 'react';
import AdminLayout from '../../../components/AdminLayout';
import { fetchAllManagers } from '@/lib/managers';
import { fetchStoreCounts } from '@/lib/database';


interface Metrics {
  totalStores: number;
  pendingStores: number;
  verifiedStores: number;
  rejectedStores: number;
  totalSales: number;
  totalWithdrawals: number;
  pendingWithdrawals: number;
  approvedWithdrawals: number;
  suspendedStores: number;
  blockedStores: number;
}

interface AreaManager {
  id: string;
  name: string;
  phone?: string;
  region: string;
  status: 'active' | 'inactive';
  stores: string[];
  created_at?: string;
}

const metricCards = [
  { key: 'totalStores', label: 'Total Stores', color: 'blue' },
  { key: 'pendingStores', label: 'Pending Verifications', color: 'orange' },
  { key: 'verifiedStores', label: 'Verified Stores', color: 'emerald' },
  { key: 'rejectedStores', label: 'Rejected Stores', color: 'red' },
  { key: 'totalSales', label: 'Total Sales', color: 'purple', prefix: '₹' },
  { key: 'totalWithdrawals', label: 'Total Withdrawals', color: 'yellow', prefix: '₹' },
  { key: 'pendingWithdrawals', label: 'Pending Withdrawals', color: 'orange', prefix: '₹' },
  { key: 'approvedWithdrawals', label: 'Approved Withdrawals', color: 'emerald', prefix: '₹' },
  { key: 'suspendedStores', label: 'Suspended Stores', color: 'yellow' },
  { key: 'blockedStores', label: 'Blocked Stores', color: 'gray' },
];


export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [areaManagers, setAreaManagers] = useState<AreaManager[]>([]);
  const [search, setSearch] = useState('');
  const [filteredManagers, setFilteredManagers] = useState<AreaManager[]>([]);

  useEffect(() => {
    // Hide vertical scrollbar for the whole page
    document.body.style.overflowY = 'hidden';
    return () => {
      document.body.style.overflowY = '';
    };
  }, []);

  // Fetch store counts for dashboard metrics
  const fetchDashboardMetrics = async (from?: string, to?: string) => {
    setLoading(true);
    const counts = await fetchStoreCounts(from, to);
    console.log('Store counts:', counts); // Debug output
    setMetrics({
      totalStores: counts.total,
      pendingStores: counts.pending,
      verifiedStores: counts.verified,
      rejectedStores: counts.rejected,
        suspendedStores: counts.suspended,
        blockedStores: counts.blocked,
      totalSales: 1250000, // TODO: Replace with real sales
      totalWithdrawals: 800000, // TODO: Replace with real withdrawals
      pendingWithdrawals: 120000, // TODO: Replace with real pending withdrawals
      approvedWithdrawals: 680000, // TODO: Replace with real approved withdrawals
    });
    setLoading(false);
  };

  useEffect(() => {
    fetchDashboardMetrics();
    // Fetch area managers (can be removed if not needed)
    fetchAllManagers().then((data) => {
      setAreaManagers(data);
      setFilteredManagers(data);
    });
  }, []);

  useEffect(() => {
    if (!search) {
      setFilteredManagers(areaManagers);
    } else {
      const s = search.toLowerCase();
      setFilteredManagers(
        areaManagers.filter(
          (m) =>
            m.id.toLowerCase().includes(s) ||
            (m.phone && m.phone.toLowerCase().includes(s))
        )
      );
    }
  }, [search, areaManagers]);

  return (
    <AdminLayout>
      <div className="min-h-screen bg-white px-2 py-2">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-2">
          <h1 className="text-lg font-bold text-gray-900">Admin Dashboard</h1>
          <div className="flex gap-1 mt-2 md:mt-0">
            <label className="text-xs font-semibold text-gray-600 flex flex-col">
              From
              <input type="date" className="border rounded px-1 py-0.5 mt-1 text-xs" value={fromDate} onChange={e => setFromDate(e.target.value)} />
            </label>
            <label className="text-xs font-semibold text-gray-600 flex flex-col">
              To
              <input type="date" className="border rounded px-1 py-0.5 mt-1 text-xs" value={toDate} onChange={e => setToDate(e.target.value)} />
            </label>
            <button
              className="ml-1 px-2 py-1 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700"
              onClick={() => fetchDashboardMetrics(fromDate, toDate)}
            >Apply</button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-2">
          {/* Store status cards */}
          {["totalStores", "pendingStores", "verifiedStores", "rejectedStores", "suspendedStores", "blockedStores"].map((key) => {
            const card = metricCards.find(c => c.key === key);
            if (!card) return null;
            return (
              <button
                key={card.key}
                className={`rounded-xl shadow-md hover:shadow-lg transition-all p-6 bg-white border-2 border-${card.color}-100 flex flex-col items-start gap-2 focus:outline-none`}
              >
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{card.label}</span>
                <span className={`text-2xl font-bold text-${card.color}-700`}>
                  {loading || !metrics ? (
                    <span className="animate-pulse text-gray-300">...</span>
                  ) : (
                    <>
                      {card.prefix || ''}{metrics[card.key as keyof Metrics].toLocaleString('en-IN')}
                    </>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          {/* Amount cards */}
          {["totalSales", "totalWithdrawals", "pendingWithdrawals", "approvedWithdrawals"].map((key) => {
            const card = metricCards.find(c => c.key === key);
            if (!card) return null;
            return (
              <button
                key={card.key}
                className={`rounded-xl shadow-md hover:shadow-lg transition-all p-6 bg-white border-2 border-${card.color}-100 flex flex-col items-start gap-2 focus:outline-none`}
              >
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{card.label}</span>
                <span className={`text-2xl font-bold text-${card.color}-700`}>
                  {loading || !metrics ? (
                    <span className="animate-pulse text-gray-300">...</span>
                  ) : (
                    <>
                      {card.prefix || ''}{metrics[card.key as keyof Metrics].toLocaleString('en-IN')}
                    </>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        {/* Area Manager section removed as requested */}
      </div>
    </AdminLayout>
  );
}
