"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/rider-dashboard/supabaseClient";

export default function ActivityLogsPage() {
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      setLoading(true);
      // Example query, adjust for filters
      let query = supabase.from("agent_activity_logs").select("*");
      // Add filters here
      setLoading(false);
      // setLogs(data)
    }
    fetchLogs();
  }, [search, dateFrom, dateTo]);

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">Activity Logs</h2>
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
        <div className="text-gray-400">Loading logs...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)]">
            <thead>
              <tr className="bg-[var(--background-alt)]">
                <th className="px-4 py-2 text-left">Log ID</th>
                <th className="px-4 py-2 text-left">Agent ID</th>
                <th className="px-4 py-2 text-left">Action</th>
                <th className="px-4 py-2 text-left">Rider ID</th>
                <th className="px-4 py-2 text-left">Created At</th>
              </tr>
            </thead>
            <tbody>
              {/* Example row, replace with dynamic data */}
              <tr>
                <td className="px-4 py-2">1001</td>
                <td className="px-4 py-2">201</td>
                <td className="px-4 py-2">Penalty Reverted</td>
                <td className="px-4 py-2">1</td>
                <td className="px-4 py-2">2025-01-08</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
