"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, CheckCircle, ShieldCheck, X } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type BankAccountDetails = {
  id: number;
  accountHolderName: string;
  bankName: string | null;
  ifsc: string | null;
  branch: string | null;
  accountNumber: string | null;
  accountNumberMasked: string | null;
  verificationStatus: "pending" | "verified" | "rejected";
  verifiedAt: string | null;
  createdAt: string;
};

type RiderBankAccountVerifySideSheetProps = {
  riderId: number;
  riderName?: string | null;
  open: boolean;
  onClose: () => void;
  onAction: (action: "verify" | "reject") => Promise<void>;
  actionLoading?: boolean;
};

function statusLabel(status: BankAccountDetails["verificationStatus"]) {
  if (status === "verified") return "Verified";
  if (status === "rejected") return "Rejected";
  return "Pending verification";
}

function statusClass(status: BankAccountDetails["verificationStatus"]) {
  if (status === "verified") return "bg-emerald-100 text-emerald-800";
  if (status === "rejected") return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-800";
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-gray-100 py-3 last:border-b-0">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-gray-900 break-all">{value}</span>
    </div>
  );
}

export function RiderBankAccountVerifySideSheet({
  riderId,
  riderName,
  open,
  onClose,
  onAction,
  actionLoading = false,
}: RiderBankAccountVerifySideSheetProps) {
  const [account, setAccount] = useState<BankAccountDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !actionLoading) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, actionLoading]);

  useEffect(() => {
    if (!open || !riderId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/riders/${riderId}/payment-methods/bank`, { credentials: "include" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Failed to load bank account");
        }
        if (!cancelled) setAccount(json.data as BankAccountDetails);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
          setAccount(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, riderId]);

  useEffect(() => {
    if (!open) {
      setAccount(null);
      setError(null);
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const isPending = account?.verificationStatus === "pending";

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex justify-end bg-slate-900/50 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Verify bank account"
      onClick={() => {
        if (!actionLoading) onClose();
      }}
    >
      <div
        className="flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900">Verify bank account</h2>
              <p className="truncate text-sm text-gray-500">
                {riderName?.trim() || `Rider #${riderId}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={actionLoading}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-16">
              <LoadingSpinner text="Loading bank account..." />
            </div>
          ) : error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : account ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-gray-700">Verification status</span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(account.verificationStatus)}`}
                >
                  {statusLabel(account.verificationStatus)}
                </span>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-1">
                <DetailRow label="Account holder" value={account.accountHolderName} />
                <DetailRow label="Bank name" value={account.bankName || "—"} />
                <DetailRow label="IFSC code" value={account.ifsc || "—"} />
                <DetailRow label="Branch" value={account.branch || "—"} />
                <DetailRow
                  label="Account number"
                  value={account.accountNumber || account.accountNumberMasked || "—"}
                />
                <DetailRow
                  label="Submitted on"
                  value={new Date(account.createdAt).toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                />
                {account.verifiedAt ? (
                  <DetailRow
                    label="Verified on"
                    value={new Date(account.verifiedAt).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  />
                ) : null}
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-gray-500">No bank account found.</p>
          )}
        </div>

        {isPending ? (
          <footer className="border-t border-gray-200 px-5 py-4">
            <div className="flex gap-3">
              <button
                type="button"
                disabled={actionLoading || loading || !account}
                onClick={() => void onAction("reject")}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
              >
                <X className="h-4 w-4" />
                Reject
              </button>
              <button
                type="button"
                disabled={actionLoading || loading || !account}
                onClick={() => void onAction("verify")}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {actionLoading ? (
                  "Saving…"
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    Approve
                  </>
                )}
              </button>
            </div>
          </footer>
        ) : account?.verificationStatus === "verified" ? (
          <footer className="border-t border-gray-200 px-5 py-4">
            <div className="flex items-center justify-center gap-2 text-sm font-semibold text-emerald-700">
              <CheckCircle className="h-4 w-4" />
              Account approved
            </div>
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
