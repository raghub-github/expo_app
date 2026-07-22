"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Trash2 } from "lucide-react";
import type { AccountDeletionRequestRow } from "@/lib/customers/account-deletion-request-types";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/context/ToastContext";

async function fetchDeletionRequests(): Promise<AccountDeletionRequestRow[]> {
  const res = await fetch("/api/customers/deletion-requests?status=pending_review");
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "Failed to load requests");
  return json.data ?? [];
}

export default function AccountDeletionRequestsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["customers", "deletion-requests", "pending_review"],
    queryFn: fetchDeletionRequests,
    staleTime: 30_000,
  });
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmRow, setConfirmRow] = useState<AccountDeletionRequestRow | null>(null);

  const runDeleteConfirmed = useCallback(async () => {
    if (!confirmRow) return;
    const row = confirmRow;
    setBusyId(row.id);
    setActionError(null);
    try {
      const res = await fetch("/api/customers/deletion-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: row.id }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Delete failed");
      setConfirmRow(null);
      toast(
        `${row.customerId} deleted — removed from database and signed out of the app.`,
        "success"
      );
      await refetch();
      void queryClient.invalidateQueries({ queryKey: ["customers", "stats"] });
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Delete failed";
      setActionError(msg);
      toast(msg, "error");
    } finally {
      setBusyId(null);
    }
  }, [confirmRow, queryClient, refetch, toast]);

  const rows = data ?? [];

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden px-2 sm:px-4 md:px-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/dashboard/customers"
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Customers
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">Account deletion requests</h1>
          <p className="text-sm text-gray-600 mt-1">
            Active requests from the customer app. Completing a request permanently deletes the
            customer record, removes it from this queue, and signs them out of the app.
          </p>
        </div>
      </div>

      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {actionError}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error instanceof Error ? error.message : "Failed to load"}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Mobile</th>
                <th className="px-4 py-3 font-semibold">Reason</th>
                <th className="px-4 py-3 font-semibold">Source</th>
                <th className="px-4 py-3 font-semibold">Requested</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                    Loading requests…
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                    <div className="inline-flex flex-col items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-gray-400" />
                      No active deletion requests
                    </div>
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50/80">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/customers/${row.customersPk ?? row.customerId}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {row.customerId}
                    </Link>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {row.customerName || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-800">
                    {row.customerMobile || "—"}
                  </td>
                  <td className="px-4 py-3 max-w-[240px]">
                    <div className="font-medium text-gray-900">{row.reasonCode}</div>
                    {row.reasonText ? (
                      <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{row.reasonText}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-700">{row.source}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                    {row.requestedAt ? new Date(row.requestedAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 border border-amber-100">
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => setConfirmRow(row)}
                      className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {busyId === row.id ? "Deleting…" : "Delete account"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        open={confirmRow != null}
        title="Permanently close this account?"
        description={
          confirmRow ? (
            <div className="space-y-2">
              <p>
                Close <strong>{confirmRow.customerId}</strong>
                {confirmRow.customerName ? (
                  <>
                    {" "}
                    (<strong>{confirmRow.customerName}</strong>)
                  </>
                ) : null}
                ?
              </p>
              <p className="text-gray-500">
                This permanently deletes the customer from the database and signs them out of the
                app. Order history is kept but no longer linked to this customer. This cannot be
                undone.
              </p>
            </div>
          ) : null
        }
        confirmLabel="Delete account"
        cancelLabel="Cancel"
        variant="danger"
        confirmBusy={busyId != null}
        onClose={() => {
          if (busyId == null) setConfirmRow(null);
        }}
        onConfirm={runDeleteConfirmed}
      />
    </div>
  );
}
