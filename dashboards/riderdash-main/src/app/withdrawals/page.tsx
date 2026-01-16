"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function WithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState([]);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchWithdrawals() {
      setLoading(true);
      // Example query, adjust for filters
      let query = supabase.from("withdrawals").select("*");
      // Add filters here
      setLoading(false);
      // setWithdrawals(data)
    }
    fetchWithdrawals();
  }, [search, dateFrom, dateTo]);

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">Withdrawals</h2>
      <div className="flex flex-wrap gap-4 mb-6">
        <input
          type="text"
          placeholder="Search Rider ID / Phone"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="rounded border border-[var(--border-color)] px-2 py-1 bg-[var(--card-bg)]"
        />
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
        <div className="text-gray-400">Loading withdrawals...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)]">
            <thead>
              <tr className="bg-[var(--background-alt)]">
                <th className="px-4 py-2 text-left">Withdrawal ID</th>
                <th className="px-4 py-2 text-left">Rider ID</th>
                <th className="px-4 py-2 text-left">Amount</th>
                <th className="px-4 py-2 text-left">Request Date</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Transaction Reference</th>
              </tr>
            </thead>
            <tbody>
              {/* Example row, replace with dynamic data */}
              <tr>
                <td className="px-4 py-2">301</td>
                <td className="px-4 py-2">1</td>
                <td className="px-4 py-2">₹400</td>
                <td className="px-4 py-2">2025-01-05</td>
                <td className="px-4 py-2">Approved</td>
                <td className="px-4 py-2">TXN123456</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
