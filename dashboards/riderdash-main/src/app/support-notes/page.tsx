"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function SupportNotesPage() {
  const [queries, setQueries] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [newQuery, setNewQuery] = useState("");

  useEffect(() => {
    async function fetchQueries() {
      setLoading(true);
      // Example query, adjust for filters
      let query = supabase.from("rider_queries").select("*");
      // Add filters here
      setLoading(false);
      // setQueries(data)
    }
    fetchQueries();
  }, [search, status, dateFrom, dateTo]);

  function handleSubmitQuery(e: React.FormEvent) {
    e.preventDefault();
    // Submit new query to DB
    setNewQuery("");
  }

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">Support Notes & Rider Queries</h2>
      <form onSubmit={handleSubmitQuery} className="mb-6 flex gap-2">
        <input
          type="text"
          placeholder="Enter rider query..."
          value={newQuery}
          onChange={e => setNewQuery(e.target.value)}
          className="rounded border border-[var(--border-color)] px-2 py-1 bg-[var(--card-bg)] w-full"
          required
        />
        <button type="submit" className="px-4 py-2 rounded bg-blue-600 text-white">Submit</button>
      </form>
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
          <option value="open">Open</option>
          <option value="closed">Closed</option>
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
        <div className="text-gray-400">Loading queries...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)]">
            <thead>
              <tr className="bg-[var(--background-alt)]">
                <th className="px-4 py-2 text-left">Query ID</th>
                <th className="px-4 py-2 text-left">Rider ID</th>
                <th className="px-4 py-2 text-left">Query Text</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Created At</th>
                <th className="px-4 py-2 text-left">Agent ID</th>
              </tr>
            </thead>
            <tbody>
              {/* Example row, replace with dynamic data */}
              <tr>
                <td className="px-4 py-2">9001</td>
                <td className="px-4 py-2">1</td>
                <td className="px-4 py-2">Wallet balance not updated</td>
                <td className="px-4 py-2">Open</td>
                <td className="px-4 py-2">2025-01-09</td>
                <td className="px-4 py-2">201</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
