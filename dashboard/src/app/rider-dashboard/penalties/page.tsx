"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/rider-dashboard/supabaseClient";

export default function PenaltiesPage() {
  const [penalties, setPenalties] = useState([]);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [revertModal, setRevertModal] = useState<{open: boolean, penaltyId?: number}>({open: false});
  const [revertReason, setRevertReason] = useState("");

  useEffect(() => {
    async function fetchPenalties() {
      setLoading(true);
      // Example query, adjust for filters
      let query = supabase.from("penalties").select("*");
      // Add filters here
      setLoading(false);
      // setPenalties(data)
    }
    fetchPenalties();
  }, [search, dateFrom, dateTo]);

  function openRevertModal(penaltyId: number) {
    setRevertModal({open: true, penaltyId});
  }

  function closeRevertModal() {
    setRevertModal({open: false});
    setRevertReason("");
  }

  function handleRevert() {
    // Submit revert reason to DB
    closeRevertModal();
  }

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">Penalties</h2>
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
        <div className="text-gray-400">Loading penalties...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)]">
            <thead>
              <tr className="bg-[var(--background-alt)]">
                <th className="px-4 py-2 text-left">Penalty ID</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-left">Amount</th>
                <th className="px-4 py-2 text-left">Applied Date</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* Example row, replace with dynamic data */}
              <tr>
                <td className="px-4 py-2">501</td>
                <td className="px-4 py-2">Late Delivery</td>
                <td className="px-4 py-2">₹100</td>
                <td className="px-4 py-2">2025-01-03</td>
                <td className="px-4 py-2">Active</td>
                <td className="px-4 py-2">
                  <button
                    className="px-3 py-1 rounded bg-red-100 text-red-700 border border-red-200"
                    onClick={() => openRevertModal(501)}
                  >
                    Revert Penalty
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {/* Revert Modal */}
      {revertModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-[var(--card-bg)] rounded-xl p-6 w-full max-w-md border border-[var(--border-color)] shadow-lg">
            <h3 className="text-lg font-bold mb-2">Revert Penalty</h3>
            <label className="block mb-2 text-sm">Reason for reverting <span className="text-red-500">*</span></label>
            <textarea
              className="w-full rounded border border-[var(--border-color)] p-2 mb-4 bg-[var(--background-alt)]"
              rows={4}
              value={revertReason}
              onChange={e => setRevertReason(e.target.value)}
              required
            />
            <div className="flex gap-2 justify-end">
              <button className="px-4 py-2 rounded bg-gray-200" onClick={closeRevertModal}>Cancel</button>
              <button
                className="px-4 py-2 rounded bg-green-600 text-white"
                onClick={handleRevert}
                disabled={!revertReason.trim()}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
