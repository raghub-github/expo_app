"use client";

import { useState } from "react";
import { Wallet, ChevronDown, ChevronUp, Plus, Loader2, Clock, Trash2 } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { useMerchantDashboardAccess } from "@/hooks/useMerchantDashboardAccess";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { formatWalletOrderDisplayId } from "@/lib/merchants/format-wallet-order-id";
import {
  useGetWalletRequestsQuery,
  useCreateWalletRequestMutation,
  useDeleteWalletRequestMutation,
  type WalletRequestRow,
} from "@/store/api/merchantStoreApi";

export function WalletRequestsSection({
  storeId,
  summaryCounts,
  onRequestCreated,
}: {
  storeId: string;
  summaryCounts?: Record<string, number> | null;
  onRequestCreated?: () => void;
}) {
  const { toast } = useToast();
  const { canEditWallet, isViewOnly } = useMerchantDashboardAccess();
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formDirection, setFormDirection] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [formAmount, setFormAmount] = useState("");
  const [formReason, setFormReason] = useState("");
  const [formOrderId, setFormOrderId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<WalletRequestRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const canRequest = !isViewOnly && canEditWallet;

  const {
    data: listData,
    isLoading: listLoading,
    isFetching: listFetching,
  } = useGetWalletRequestsQuery(
    {
      storeId,
      limit: 20,
      offset: 0,
    },
    {
      skip: !expanded || !storeId,
    }
  );

  const pendingCountFromSummary = summaryCounts?.PENDING ?? 0;

  const [createRequest, { isLoading: createLoading }] = useCreateWalletRequestMutation();
  const [deleteRequest] = useDeleteWalletRequestMutation();

  const requests: WalletRequestRow[] = listData?.requests ?? [];
  const total = listData?.total ?? 0;
  const loading = listLoading || listFetching;

  const pendingCount =
    pendingCountFromSummary || requests.filter((r) => r.status === "PENDING").length;

  const formAmountNum = parseFloat(formAmount);
  const formCanSubmit =
    !createLoading &&
    Number.isFinite(formAmountNum) &&
    formAmountNum > 0 &&
    formReason.trim().length >= 5;

  const handleCreate = async () => {
    if (!formCanSubmit) return;
    const amount = formAmountNum;
    const reason = formReason.trim();
    const orderIdRaw = formOrderId.trim().replace(/^#/, "");
    const orderIdDigits = orderIdRaw.replace(/\D/g, "");
    const orderId =
      orderIdRaw && /^\d+$/.test(orderIdRaw)
        ? parseInt(orderIdRaw, 10)
        : orderIdDigits
          ? parseInt(orderIdDigits, 10)
          : null;
    try {
      const res = await createRequest({
        storeId,
        direction: formDirection,
        amount,
        reason,
        order_id: typeof orderId === "number" && Number.isFinite(orderId) ? orderId : undefined,
        order_label: orderIdRaw || undefined,
      }).unwrap();
      if (res.success) {
        toast("Request submitted");
        setFormAmount("");
        setFormReason("");
        setFormOrderId("");
        setShowForm(false);
        onRequestCreated?.();
      } else {
        toast(res.error || "Failed to create request");
      }
    } catch {
      toast("Failed to create request");
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      const res = await deleteRequest({
        storeId,
        requestId: deleteTarget.id,
      }).unwrap();
      if (res.success) {
        toast("Request deleted");
        setDeleteTarget(null);
        onRequestCreated?.();
      } else {
        toast(res.error || "Failed to delete request");
      }
    } catch {
      toast("Failed to delete request");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full px-4 py-2.5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2 text-left hover:bg-gray-50/80 transition-colors"
      >
        <div className="flex items-center gap-2 text-gray-700 font-medium text-sm">
          <Wallet size={16} />
          Wallet adjustment requests
        </div>
        <span className="text-xs text-gray-500">
          {expanded ? "Hide" : pendingCount > 0 ? `${pendingCount} pending` : "View requests"}
        </span>
        {expanded ? (
          <ChevronUp size={18} className="text-gray-500" />
        ) : (
          <ChevronDown size={18} className="text-gray-500" />
        )}
      </button>
      {expanded && (
        <div className="p-3">
          {canRequest && (
            <div className="mb-3">
              {!showForm ? (
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700"
                >
                  <Plus size={14} />
                  Add or deduct amount
                </button>
              ) : (
                <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 space-y-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFormDirection("CREDIT")}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                        formDirection === "CREDIT"
                          ? "bg-emerald-600 text-white"
                          : "bg-gray-200 text-gray-700"
                      }`}
                    >
                      Add (Credit)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormDirection("DEBIT")}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                        formDirection === "DEBIT"
                          ? "bg-red-600 text-white"
                          : "bg-gray-200 text-gray-700"
                      }`}
                    >
                      Deduct (Debit)
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-medium text-gray-600 mb-0.5">
                        Amount (₹)
                      </label>
                      <input
                        type="number"
                        value={formAmount}
                        onChange={(e) => setFormAmount(e.target.value)}
                        placeholder="0.00"
                        min={0}
                        step={0.01}
                        className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-gray-600 mb-0.5">
                        Order ID (optional)
                      </label>
                      <input
                        type="text"
                        value={formOrderId}
                        onChange={(e) => setFormOrderId(e.target.value)}
                        placeholder="e.g. GMF100041"
                        className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-gray-600 mb-0.5">
                      Reason *
                    </label>
                    <textarea
                      value={formReason}
                      onChange={(e) => setFormReason(e.target.value)}
                      placeholder="Describe why this adjustment is needed (min 5 chars)"
                      rows={2}
                      className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCreate}
                      disabled={!formCanSubmit}
                      className="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      {createLoading ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Plus size={14} />
                      )}
                      Submit request
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowForm(false);
                        setFormAmount("");
                        setFormReason("");
                        setFormOrderId("");
                      }}
                      className="px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 text-xs font-medium hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : requests.length === 0 ? (
            <p className="text-xs text-gray-500 py-3">No wallet adjustment requests yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full min-w-[640px] text-left">
                <thead className="bg-slate-50 border-b border-gray-100">
                  <tr className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    <th className="px-2.5 py-1.5">Amount</th>
                    <th className="px-2.5 py-1.5">Order</th>
                    <th className="px-2.5 py-1.5">Status</th>
                    <th className="px-2.5 py-1.5">Reason</th>
                    <th className="px-2.5 py-1.5">Requested</th>
                    <th className="px-2.5 py-1.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {requests.map((r) => {
                    const orderDisplay = formatWalletOrderDisplayId(
                      r.formatted_order_id,
                      r.order_id
                    );
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/70">
                        <td className="px-2.5 py-1.5 whitespace-nowrap">
                          <span
                            className={`text-xs font-semibold tabular-nums ${
                              r.direction === "CREDIT" ? "text-emerald-600" : "text-red-600"
                            }`}
                          >
                            {r.direction === "CREDIT" ? "+" : "−"}₹
                            {r.amount.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </td>
                        <td className="px-2.5 py-1.5 font-mono text-[11px] text-gray-700">
                          {orderDisplay || "—"}
                        </td>
                        <td className="px-2.5 py-1.5">
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              r.status === "PENDING"
                                ? "bg-amber-100 text-amber-800"
                                : r.status === "APPROVED"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-red-100 text-red-800"
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="px-2.5 py-1.5 max-w-[200px]">
                          <p className="text-[11px] text-gray-700 line-clamp-2">{r.reason}</p>
                        </td>
                        <td className="px-2.5 py-1.5 text-[10px] text-gray-500 whitespace-nowrap">
                          <div>{r.requested_by_name || r.requested_by_email || "—"}</div>
                          <div>{new Date(r.requested_at).toLocaleString("en-IN")}</div>
                          {(r.status === "APPROVED" || r.status === "REJECTED") &&
                            (r.reviewed_by_name || r.reviewed_by_email) && (
                              <div className="mt-0.5 text-gray-400">
                                {r.status === "APPROVED" ? "Approved" : "Rejected"} by{" "}
                                {r.reviewed_by_name || r.reviewed_by_email}
                              </div>
                            )}
                        </td>
                        <td className="px-2.5 py-1.5 text-right">
                          {r.status === "PENDING" && canRequest ? (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(r)}
                              className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-100"
                              title="Delete pending request"
                            >
                              <Trash2 size={12} />
                              Delete
                            </button>
                          ) : (
                            <span className="text-[10px] text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {total > requests.length && (
                <p className="text-[10px] text-gray-500 flex items-center gap-1 px-2.5 py-1.5 border-t border-gray-100">
                  <Clock size={11} /> Showing {requests.length} of {total} requests
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        open={deleteTarget != null}
        onClose={() => !deleteBusy && setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        confirmBusy={deleteBusy}
        variant="danger"
        title="Delete wallet request?"
        confirmLabel="Delete request"
        description={
          deleteTarget ? (
            <p>
              This will permanently remove the{" "}
              <span className="font-semibold">
                {deleteTarget.direction === "CREDIT" ? "credit" : "debit"} of ₹
                {deleteTarget.amount.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>{" "}
              request from the database. Wallet balance and ledger are not affected (request was
              never approved). Other requests stay unchanged.
            </p>
          ) : null
        }
        zIndexClass="z-[2500]"
      />
    </div>
  );
}
