"use client";

import { useState } from "react";
import {
  Wallet,
  ChevronDown,
  ChevronUp,
  Plus,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
} from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { usePermission } from "@/hooks/usePermission";
import {
  useGetWalletRequestsQuery,
  useCreateWalletRequestMutation,
  useUpdateWalletRequestStatusMutation,
  type WalletRequestRow,
} from "@/store/api/merchantStoreApi";

function hasAdminRole(roles: unknown): boolean {
  if (!roles || !Array.isArray(roles)) return false;
  return roles.some((r) => {
    if (typeof r === "string") return r === "ADMIN";
    const o = r as { roleId?: string; roleType?: string };
    return o?.roleId === "ADMIN" || o?.roleType === "ADMIN";
  });
}

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
  const { isSuperAdmin, permissions } = usePermission();
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formDirection, setFormDirection] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [formAmount, setFormAmount] = useState("");
  const [formReason, setFormReason] = useState("");
  const [formOrderId, setFormOrderId] = useState("");
  const [actioningId, setActioningId] = useState<number | null>(null);

  const canApprove = isSuperAdmin || hasAdminRole(permissions?.roles);
  const canRequest = true;

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
  const [updateStatus] = useUpdateWalletRequestStatusMutation();

  const requests: WalletRequestRow[] = listData?.requests ?? [];
  const total = listData?.total ?? 0;
  const loading = listLoading || listFetching;

  const pendingCount =
    pendingCountFromSummary || requests.filter((r) => r.status === "PENDING").length;

  const handleCreate = async () => {
    const amount = parseFloat(formAmount);
    const reason = formReason.trim();
    const orderId = formOrderId.trim() ? parseInt(formOrderId, 10) : null;
    if (isNaN(amount) || amount <= 0) {
      toast("Enter a valid amount");
      return;
    }
    if (reason.length < 5) {
      toast("Reason must be at least 5 characters");
      return;
    }
    try {
      const res = await createRequest({
        storeId,
        direction: formDirection,
        amount,
        reason,
        order_id: typeof orderId === "number" && Number.isFinite(orderId) ? orderId : undefined,      }).unwrap();
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

  const handleApproveReject = async (requestId: number, action: "APPROVE" | "REJECT") => {
    setActioningId(requestId);
    try {
      const res = await updateStatus({
        storeId,
        requestId,
        action,
      }).unwrap();
      if (res.success) {
        toast(`Request ${action === "APPROVE" ? "approved" : "rejected"}`);
        if (action === "APPROVE") onRequestCreated?.();
      } else {
        toast(res.error || "Failed");
      }
    } catch {
      toast("Failed");
    } finally {
      setActioningId(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3 text-left hover:bg-gray-50/80 transition-colors"
      >
        <div className="flex items-center gap-2 text-gray-700 font-medium">
          <Wallet size={18} />
          Wallet adjustment requests
        </div>
        <span className="text-sm text-gray-500">
          {expanded ? "Hide" : pendingCount > 0 ? `${pendingCount} pending` : "View requests"}
        </span>
        {expanded ? (
          <ChevronUp size={20} className="text-gray-500" />
        ) : (
          <ChevronDown size={20} className="text-gray-500" />
        )}
      </button>
      {expanded && (
        <div className="p-4">
          {canRequest && (
            <div className="mb-4">
              {!showForm ? (
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                >
                  <Plus size={16} />
                  Add or deduct amount
                </button>
              ) : (
                <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFormDirection("CREDIT")}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
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
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                        formDirection === "DEBIT"
                          ? "bg-red-600 text-white"
                          : "bg-gray-200 text-gray-700"
                      }`}
                    >
                      Deduct (Debit)
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Amount (₹)</label>
                    <input
                      type="number"
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value)}
                      placeholder="0.00"
                      min={0}
                      step={0.01}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    {formAmount === "" && (
                      <p className="text-[10px] text-gray-500 mt-0.5">Enter amount (min ₹0.01)</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Order ID (optional)
                    </label>
                    <input
                      type="number"
                      value={formOrderId}
                      onChange={(e) => setFormOrderId(e.target.value)}
                      placeholder="Leave empty for manual adjustment"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Reason *</label>
                    <textarea
                      value={formReason}
                      onChange={(e) => setFormReason(e.target.value)}
                      placeholder="Describe why this adjustment is needed (min 5 chars)"
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCreate}
                      disabled={createLoading}
                      className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {createLoading ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Plus size={16} />
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
                      className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-gray-400" />
            </div>
          ) : requests.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No wallet adjustment requests yet.</p>
          ) : (
            <div className="space-y-2">
              {requests.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-gray-200 bg-white"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-semibold ${
                          r.direction === "CREDIT" ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {r.direction === "CREDIT" ? "+" : "−"}₹
                        {r.amount.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      {r.order_id && (
                        <span className="text-xs text-gray-500">Order #{r.order_id}</span>
                      )}
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          r.status === "PENDING"
                            ? "bg-amber-100 text-amber-800"
                            : r.status === "APPROVED"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-red-100 text-red-800"
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">{r.reason}</p>
                    <p className="text-[10px] text-gray-500 mt-1">
                      Requested by {r.requested_by_name || r.requested_by_email || "—"} ·{" "}
                      {new Date(r.requested_at).toLocaleString("en-IN")}
                    </p>
                    {(r.status === "APPROVED" || r.status === "REJECTED") &&
                      (r.reviewed_by_name || r.reviewed_by_email) && (
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          {r.status === "APPROVED" ? "Approved" : "Rejected"} by{" "}
                          {r.reviewed_by_name || r.reviewed_by_email} ·{" "}
                          {r.reviewed_at
                            ? new Date(r.reviewed_at).toLocaleString("en-IN")
                            : "—"}
                        </p>
                      )}
                  </div>
                  {r.status === "PENDING" && canApprove && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleApproveReject(r.id, "APPROVE")}
                        disabled={actioningId !== null}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-medium hover:bg-emerald-200 disabled:opacity-50"
                      >
                        {actioningId === r.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <CheckCircle size={12} />
                        )}
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApproveReject(r.id, "REJECT")}
                        disabled={actioningId !== null}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-100 text-red-700 text-xs font-medium hover:bg-red-200 disabled:opacity-50"
                      >
                        <XCircle size={12} />
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {total > requests.length && (
                <p className="text-[11px] text-gray-500 flex items-center gap-1 pt-1">
                  <Clock size={12} /> Showing {requests.length} of {total} requests
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
