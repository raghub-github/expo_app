"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, CheckCircle, ShieldCheck, X } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { RejectBankAccountReasonModal } from "./RejectBankAccountReasonModal";

type PayoutAccount = {
  id: number;
  accountHolderName: string;
  bankName: string | null;
  ifsc: string | null;
  branch: string | null;
  accountNumber: string | null;
  accountNumberMasked: string | null;
  verificationStatus: "pending" | "verified" | "rejected";
  verifiedAt: string | null;
  rejectionReason: string | null;
  pendingReason: string | null;
  crossCheckStatus: "ok" | "mismatch" | null;
  isActive: boolean;
  isPrimary: boolean;
  createdAt: string;
};

type RiderPayoutAccountsSideSheetProps = {
  riderId: number;
  riderName?: string | null;
  open: boolean;
  onClose: () => void;
};

function statusLabel(account: PayoutAccount): string {
  if (account.verificationStatus === "rejected") return "Rejected";
  if (account.verificationStatus === "pending") return "Pending";
  if (!account.isActive) return "Deactivated";
  if (account.isPrimary) return "Active · Primary";
  return "Active";
}

function statusClass(account: PayoutAccount): string {
  if (account.verificationStatus === "rejected") return "bg-red-100 text-red-800";
  if (account.verificationStatus === "pending") return "bg-amber-100 text-amber-800";
  if (!account.isActive) return "bg-gray-100 text-gray-700";
  if (account.isPrimary) return "bg-emerald-100 text-emerald-800";
  return "bg-sky-100 text-sky-800";
}

function cardClass(account: PayoutAccount): string {
  if (account.verificationStatus === "rejected") {
    return "border-red-200 bg-red-50/70";
  }
  if (account.verificationStatus === "pending") {
    return "border-amber-200 bg-amber-50/50";
  }
  if (!account.isActive) {
    return "border-gray-200 bg-gray-50";
  }
  return "border-gray-200 bg-white";
}

export function RiderPayoutAccountsSideSheet({
  riderId,
  riderName,
  open,
  onClose,
}: RiderPayoutAccountsSideSheetProps) {
  const [accounts, setAccounts] = useState<PayoutAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PayoutAccount | null>(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/riders/${riderId}/payment-methods/bank?list=all`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load payout accounts");
      }
      setAccounts((json.data?.accounts ?? []) as PayoutAccount[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [riderId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && actionLoadingId == null && !rejectTarget) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, actionLoadingId, rejectTarget]);

  useEffect(() => {
    if (!open || !riderId) return;
    void loadAccounts();
  }, [open, riderId, loadAccounts]);

  const runAction = useCallback(
    async (accountId: number, action: "verify" | "reject", reason?: string) => {
      setActionLoadingId(accountId);
      try {
        const res = await fetch(`/api/riders/${riderId}/payment-methods/bank/verify`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action,
            paymentMethodId: accountId,
            ...(action === "reject" ? { reason: reason?.trim() || undefined } : {}),
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Failed to update bank account");
        }
        setRejectTarget(null);
        await loadAccounts();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not update bank account");
      } finally {
        setActionLoadingId(null);
      }
    },
    [riderId, loadAccounts],
  );

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[80] flex justify-end">
        <button
          type="button"
          aria-label="Close"
          className="absolute inset-0 bg-black/40"
          onClick={() => {
            if (actionLoadingId == null && !rejectTarget) onClose();
          }}
        />
        <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
          <header className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-violet-600" />
                <h2 className="text-lg font-bold text-gray-900">Payout accounts</h2>
              </div>
              {riderName?.trim() ? (
                <p className="mt-1 truncate text-sm text-gray-500">{riderName.trim()}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={actionLoadingId != null}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {loading ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner size="sm" text="Loading accounts…" />
              </div>
            ) : error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : accounts.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">No payout accounts found.</p>
            ) : (
              <ul className="space-y-3">
                {accounts.map((account) => {
                  const busy = actionLoadingId === account.id;
                  return (
                    <li
                      key={account.id}
                      className={`rounded-xl border px-4 py-3 ${cardClass(account)}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {account.accountHolderName}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-gray-600">
                            {account.bankName || "Bank"} · {account.ifsc || "—"}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass(account)}`}
                        >
                          {statusLabel(account)}
                        </span>
                      </div>
                      <p className="mt-2 font-mono text-sm font-medium text-gray-800">
                        {account.accountNumber || account.accountNumberMasked || "••••"}
                      </p>
                      {account.branch ? (
                        <p className="mt-1 text-xs text-gray-500">{account.branch}</p>
                      ) : null}
                      {account.verificationStatus === "pending" && account.pendingReason ? (
                        <p className="mt-2 text-xs leading-relaxed text-amber-900">
                          {account.pendingReason}
                        </p>
                      ) : null}
                      {account.verificationStatus === "rejected" && account.rejectionReason ? (
                        <p className="mt-2 text-xs leading-relaxed text-red-800">
                          {account.rejectionReason}
                        </p>
                      ) : null}
                      <p className="mt-2 text-[11px] text-gray-400">
                        Submitted{" "}
                        {new Date(account.createdAt).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>

                      {account.verificationStatus === "pending" ? (
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            disabled={busy || actionLoadingId != null}
                            onClick={() => setRejectTarget(account)}
                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                          >
                            <X className="h-3.5 w-3.5" />
                            Reject
                          </button>
                          <button
                            type="button"
                            disabled={busy || actionLoadingId != null}
                            onClick={() => void runAction(account.id, "verify")}
                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                          >
                            {busy ? (
                              "Saving…"
                            ) : (
                              <>
                                <ShieldCheck className="h-3.5 w-3.5" />
                                Approve
                              </>
                            )}
                          </button>
                        </div>
                      ) : account.verificationStatus === "verified" ? (
                        <div className="mt-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-700">
                          <CheckCircle className="h-3.5 w-3.5" />
                          Approved
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {rejectTarget ? (
        <RejectBankAccountReasonModal
          riderLabel={riderName}
          saving={actionLoadingId === rejectTarget.id}
          onClose={() => {
            if (actionLoadingId == null) setRejectTarget(null);
          }}
          onConfirm={(reason) => void runAction(rejectTarget.id, "reject", reason)}
        />
      ) : null}
    </>,
    document.body,
  );
}
