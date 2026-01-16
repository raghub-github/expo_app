"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function RidersPage() {
  const [riders, setRiders] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRiders() {
      setLoading(true);
      // Example query, adjust for filters
      let query = supabase.from("riders").select("*");
      // Add filters here
      setLoading(false);
      // setRiders(data)
    }
    fetchRiders();
  }, [search, status, dateFrom, dateTo]);

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">Riders</h2>
      <div className="flex flex-wrap gap-4 mb-6">
        <input
          type="text"
          placeholder="Search Rider ID / Phone"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="rounded border border-[var(--border-color)] px-2 py-1 bg-[var(--card-bg)]"
        />
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="rounded border border-[var(--border-color)] px-2 py-1 bg-[var(--card-bg)]"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="blocked">Blocked</option>
          <option value="suspended">Suspended</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          className="rounded border border-[var(--border-color)] px-2 py-1 bg-[var(--card-bg)]"
        />
        <span className="mx-1 text-gray-500">to</span>
        <input
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          className="rounded border border-[var(--border-color)] px-2 py-1 bg-[var(--card-bg)]"
        />
      </div>
      {loading ? (
        <div className="text-gray-400">Loading riders...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)]">
            <thead>
              <tr className="bg-[var(--background-alt)]">
                <th className="px-4 py-2 text-left">Rider ID</th>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Phone</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Blocklisted</th>
                <th className="px-4 py-2 text-left">Whitelisted</th>
                <th className="px-4 py-2 text-left">Total Orders</th>
                <th className="px-4 py-2 text-left">Wallet Balance</th>
                <th className="px-4 py-2 text-left">Joined Date</th>
              </tr>
            </thead>
            <tbody>
              {/* Example row, replace with dynamic data */}
              <tr>
                <td className="px-4 py-2">1</td>
                <td className="px-4 py-2">John Doe</td>
                <td className="px-4 py-2">9876543210</td>
                <td className="px-4 py-2">Active</td>
                <td className="px-4 py-2">No</td>
                <td className="px-4 py-2">Yes</td>
                <td className="px-4 py-2">120</td>
                <td className="px-4 py-2">₹500</td>
                <td className="px-4 py-2">2025-01-01</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
