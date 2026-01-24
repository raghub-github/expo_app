"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/rider-dashboard/supabaseClient";

export default function SurgesOffersPage() {
  const [surges, setSurges] = useState([]);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSurges() {
      setLoading(true);
      // Example query, adjust for filters
      let query = supabase.from("surges").select("*");
      // Add filters here
      setLoading(false);
      // setSurges(data)
    }
    fetchSurges();
  }, [search, dateFrom, dateTo]);

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">Surges & Offers</h2>
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
        <div className="text-gray-400">Loading surges & offers...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)]">
            <thead>
              <tr className="bg-[var(--background-alt)]">
                <th className="px-4 py-2 text-left">Offer Name</th>
                <th className="px-4 py-2 text-left">Time Window</th>
                <th className="px-4 py-2 text-left">Extra Earnings</th>
                <th className="px-4 py-2 text-left">Eligibility</th>
              </tr>
            </thead>
            <tbody>
              {/* Example row, replace with dynamic data */}
              <tr>
                <td className="px-4 py-2">Morning Surge</td>
                <td className="px-4 py-2">7am - 10am</td>
                <td className="px-4 py-2">₹100</td>
                <td className="px-4 py-2">Yes</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
