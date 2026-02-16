"use client";
import React, { useState, useEffect } from 'react';
import AdminLayout from '../../../components/AdminLayout';
import { fetchAllStores, fetchFoodOrdersByRestaurant } from '@/lib/database';

export default function AnalyticsPage() {
  const [period, setPeriod] = useState('week');
  const [loading, setLoading] = useState(true);
  const [salesTrend, setSalesTrend] = useState<any[]>([]);
  const [storeSales, setStoreSales] = useState<any[]>([]);

  useEffect(() => {
    // Hide vertical scrollbar for the whole page
    document.body.style.overflowY = 'hidden';
    return () => {
      document.body.style.overflowY = '';
    };
  }, []);

  useEffect(() => {
    async function loadAnalytics() {
      setLoading(true);
      const stores = await fetchAllStores();
      let salesByDate: Record<string, { total: number; stores: Set<string> }> = {};
      let storeSalesArr: { store: string; sales: number }[] = [];
      for (const s of stores) {
        const orders = await fetchFoodOrdersByRestaurant(s.store_id);
        let totalSales = 0;
        for (const o of orders) {
          if (o.status === 'delivered') {
            const date = o.created_at.slice(0, 10);
            salesByDate[date] = salesByDate[date] || { total: 0, stores: new Set() };
            salesByDate[date].total += o.total_amount;
            salesByDate[date].stores.add(s.store_id);
            totalSales += o.total_amount;
          }
        }
        storeSalesArr.push({ store: s.store_name, sales: totalSales });
      }
      // Convert to array and sort by date
      const salesTrendArr = Object.entries(salesByDate)
        .map(([date, val]) => ({ date, total: val.total, stores: val.stores.size }))
        .sort((a, b) => a.date.localeCompare(b.date));
      setSalesTrend(salesTrendArr);
      setStoreSales(storeSalesArr);
      setLoading(false);
    }
    loadAnalytics();
  }, [period]);

  return (
    <AdminLayout>
      <div className="min-h-screen bg-white px-2 py-2">
        <h1 className="text-lg font-bold mb-2 text-gray-900">Sales & Analytics</h1>
        <div className="flex gap-2 mb-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-2 py-1 border rounded bg-white shadow-sm text-xs"
          >
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </div>
        {/* Sales Trend Chart (table for now) */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-2 text-gray-900">Sales Trend</h2>
          {loading ? (
            <div className="text-gray-400 py-8 text-center">Loading...</div>
          ) : salesTrend.length === 0 ? (
            <div className="text-gray-700 py-8 text-center">No sales data available.</div>
          ) : (
            <table className="min-w-full bg-white rounded-lg shadow border">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Total Sales</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Active Stores</th>
                </tr>
              </thead>
              <tbody>
                {salesTrend.map((row) => (
                  <tr key={row.date} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900 font-semibold">{row.date}</td>
                    <td className="px-4 py-3 text-purple-700 font-bold">₹{row.total.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-gray-700">{row.stores}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {/* Store-wise Sales Table */}
        <div>
          <h2 className="text-lg font-semibold mb-2 text-gray-900">Store-wise Sales</h2>
          {loading ? (
            <div className="text-gray-400 py-8 text-center">Loading...</div>
          ) : storeSales.length === 0 ? (
            <div className="text-gray-700 py-8 text-center">No store sales data available.</div>
          ) : (
            <table className="min-w-full bg-white rounded-lg shadow border">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Store</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Sales</th>
                </tr>
              </thead>
              <tbody>
                {storeSales.map((row) => (
                  <tr key={row.store} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900 font-semibold">{row.store}</td>
                    <td className="px-4 py-3 text-purple-700 font-bold">₹{row.sales.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminLayout>
  );
  return (
    <AdminLayout>
      <div className="min-h-screen bg-white px-8 py-8">
        <h1 className="text-2xl font-bold mb-6 text-gray-900">Sales & Analytics</h1>
        <div className="flex gap-4 mb-6">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-4 py-2 border rounded-lg bg-white shadow-sm"
          >
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </div>
        {/* Sales Trend Chart (table for now) */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-2 text-gray-900">Sales Trend</h2>
          {loading ? (
            <div className="text-gray-400 py-8 text-center">Loading...</div>
          ) : salesTrend.length === 0 ? (
            <div className="text-gray-700 py-8 text-center">No sales data available.</div>
          ) : (
            <table className="min-w-full bg-white rounded-lg shadow border">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Total Sales</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Active Stores</th>
                </tr>
              </thead>
              <tbody>
                {salesTrend.map((row) => (
                  <tr key={row.date} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900 font-semibold">{row.date}</td>
                    <td className="px-4 py-3 text-purple-700 font-bold">₹{row.total.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-gray-700">{row.stores}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {/* Store-wise Sales Table */}
        <div>
          <h2 className="text-lg font-semibold mb-2 text-gray-900">Store-wise Sales</h2>
          {loading ? (
            <div className="text-gray-400 py-8 text-center">Loading...</div>
          ) : storeSales.length === 0 ? (
            <div className="text-gray-700 py-8 text-center">No store sales data available.</div>
          ) : (
            <table className="min-w-full bg-white rounded-lg shadow border">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Store</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Sales</th>
                </tr>
              </thead>
              <tbody>
                {storeSales.map((row) => (
                  <tr key={row.store} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900 font-semibold">{row.store}</td>
                    <td className="px-4 py-3 text-purple-700 font-bold">₹{row.sales.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
