"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, CheckCircle, XCircle, Loader2, RefreshCw } from "lucide-react";
type ChangeRequestRow = {
  id: number;
  store_id: number;
  menu_item_id: number | null;
  request_type: string;
  status: string;
  requested_payload: Record<string, unknown>;
  current_snapshot: Record<string, unknown> | null;
  reason: string | null;
  created_by: string;
  created_by_role: string | null;
  reviewed_by: string | null;
  reviewed_reason: string | null;
  created_at: string;
  updated_at: string;
  item_name: string | null;
  menu_item_public_id: string | null;
};

export default function MenuRequestsPage() {
  const [requests, setRequests] = useState<ChangeRequestRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("PENDING");
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<number, string>>({});
  const [showRejectModal, setShowRejectModal] = useState<number | null>(null);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50", offset: "0" });
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/merchant-menu/change-requests?${params}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.change_requests)) {
        setRequests(data.change_requests);
        setTotal(data.total ?? data.change_requests.length);
      }
    } catch {
      setRequests([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [statusFilter]);

  const handleApprove = async (id: number) => {
    setActioningId(id);
    try {
      const res = await fetch(`/api/merchant-menu/change-requests/${id}/approve`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        await fetchRequests();
      } else {
        alert(data.error || "Approve failed");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setActioningId(null);
    }
  };

  const handleReject = async (id: number) => {
    const reason = rejectReason[id] ?? "";
    setActioningId(id);
    try {
      const res = await fetch(`/api/merchant-menu/change-requests/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewed_reason: reason || null }),
      });
      const data = await res.json();
      if (data.success) {
        setShowRejectModal(null);
        setRejectReason((prev) => ({ ...prev, [id]: "" }));
        await fetchRequests();
      } else {
        alert(data.error || "Reject failed");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setActioningId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/dashboard/merchants"
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Merchants
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Menu item change requests</h1>
        <p className="mt-1 text-sm text-gray-500">
          Review and approve or reject merchant update/delete requests for approved items.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => fetchRequests()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow">
          {loading && requests.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : requests.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">No change requests found.</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Item</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Requested by</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Created</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">{r.id}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">{r.request_type}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {r.item_name ?? `Item #${r.menu_item_id}`}
                      {r.menu_item_public_id && (
                        <span className="ml-1 text-gray-400">({r.menu_item_public_id})</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.status === "PENDING"
                            ? "bg-amber-100 text-amber-800"
                            : r.status === "APPROVED"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{r.created_by}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      {r.status === "PENDING" && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleApprove(r.id)}
                            disabled={actioningId !== null}
                            className="inline-flex items-center gap-1 rounded bg-green-600 px-2 py-1 text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            {actioningId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowRejectModal(r.id)}
                            disabled={actioningId !== null}
                            className="inline-flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            <XCircle className="h-3 w-3" />
                            Reject
                          </button>
                        </div>
                      )}
                      {showRejectModal === r.id && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow">
                            <h3 className="font-semibold text-gray-900">Reject request</h3>
                            <p className="mt-1 text-sm text-gray-500">Optional reason (shown to merchant):</p>
                            <textarea
                              value={rejectReason[r.id] ?? ""}
                              onChange={(e) => setRejectReason((prev) => ({ ...prev, [r.id]: e.target.value }))}
                              className="mt-2 w-full rounded border border-gray-300 p-2 text-sm"
                              rows={3}
                              placeholder="e.g. Price change not allowed"
                            />
                            <div className="mt-4 flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setShowRejectModal(null)}
                                className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReject(r.id)}
                                disabled={actioningId === r.id}
                                className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                              >
                                {actioningId === r.id ? "Rejecting…" : "Reject"}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {total > 0 && (
          <p className="mt-2 text-sm text-gray-500">
            Showing {requests.length} of {total} request(s).
          </p>
        )}
      </div>
    </div>
  );
}
