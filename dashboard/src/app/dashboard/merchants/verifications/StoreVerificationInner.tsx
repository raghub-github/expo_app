"use client";

import dynamic from "next/dynamic";
import React, { useEffect, useState, useRef } from "react";
import { flushSync } from "react-dom";
import { useAppSearchParams } from "@/hooks/useAppSearchParams";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ElectronicVerifyPanel } from "@/components/verification/ElectronicVerifyPanel";
import {
  Store,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Clock,
  Copy,
  ChevronDown,
  ChevronRight,
  Pencil,
  Save,
  FileText,
  ExternalLink,
  Eye,
  UserCircle,
  X,
  ImagePlus,
  AlertTriangle,
} from "lucide-react";
import {
  DOCUMENT_REJECTION_ISSUE_CODES,
  DOCUMENT_REJECTION_ISSUE_ACTIONS,
  DOCUMENT_REJECTION_ISSUE_LABELS,
  type DocumentRejectionIssueCode,
  rejectionDetailForDocType,
  rejectionRequiresNewFileUpload,
} from "@/lib/merchant-store-document-rejection";
import { dispatchMerchantResubmittedDocsRefresh } from "@/lib/merchants/merchant-resubmitted-docs-refresh";
import { VerificationPageSkeleton } from "./VerificationPageSkeleton";
import { Toaster, toast } from "sonner";
import { MenuReferenceReviewBlock } from "@/components/verification/MenuReferenceReviewBlock";
import { MenuReferenceRejectionSnapshot } from "@/components/verification/MenuReferenceRejectionSnapshot";
import type { MenuMediaFile } from "@/lib/merchant-menu-media";
import { R2Image } from "@/components/ui/R2Image";
import {
  coerceGalleryImageList as normalizeGalleryImages,
  profileMediaR2KeyFromUrl,
  maxGalleryImages,
} from "@/lib/merchant/store-profile-media";
import { resolveAttachmentProxyUrl } from "@/lib/attachments/resolve-attachment-proxy-url";
import { DocumentAttachmentThumb } from "@/components/verification/DocumentAttachmentThumb";

/** Console: filter `profile-media-gallery` (development-only). */
function galleryProfileMediaDebug(...args: unknown[]) {
  if (typeof window === "undefined" || process.env.NODE_ENV !== "development") return;
  console.info("[profile-media-gallery]", ...args);
}

function mergePortalIntoRelativeHref(href: string, portal: "admin" | "merchant" | null): string {
  if (!portal || !href.startsWith("/")) return href;
  try {
    const u = new URL(href, "http://localhost");
    if (!u.searchParams.has("portal")) u.searchParams.set("portal", portal);
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return href;
  }
}

const VerificationLocationMap = dynamic(
  () =>
    import("@/components/verification/VerificationLocationMap").then((m) => ({
      default: m.VerificationLocationMap,
    })),
  { ssr: false, loading: () => <div className="h-48 rounded bg-gray-100 animate-pulse" /> }
);

const ONBOARDING_STEP_LABELS: Record<number, string> = {
  1: "Restaurant information",
  2: "Location details",
  3: "Menu setup",
  4: "Restaurant documents",
  5: "Operational details",
  6: "Bank account",
  7: "Commission plan",
  8: "Sign & submit",
};

function formatBankAccountNumberFull(n: unknown): string {
  if (n == null || n === "") return "—";
  return String(n).trim() || "—";
}

function BankAccountsVerificationPanel({
  accounts,
  compact = false,
  storeId,
  locked = false,
}: {
  accounts: Record<string, unknown>[] | null | undefined;
  compact?: boolean;
  storeId?: number;
  locked?: boolean;
}) {
  const [remoteAccounts, setRemoteAccounts] = useState<Record<string, unknown>[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftById, setDraftById] = useState<Record<number, Record<string, string>>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const bankProofInputRef = useRef<HTMLInputElement | null>(null);
  const upiQrInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetRef = useRef<{ accountId: number; field: "bank_proof_file_url" | "upi_qr_screenshot_url" } | null>(null);

  const refreshAccounts = async () => {
    if (!storeId) return;
    setRemoteLoading(true);
    setRemoteError(null);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/bank-accounts`, { credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(typeof data?.error === "string" ? data.error : "Failed to load bank accounts");
      }
      setRemoteAccounts(Array.isArray(data.accounts) ? data.accounts : []);
    } catch (e) {
      setRemoteError(e instanceof Error ? e.message : "Failed to load bank accounts");
    } finally {
      setRemoteLoading(false);
    }
  };

  useEffect(() => {
    void refreshAccounts();
  }, [storeId]);

  const list =
    storeId != null
      ? remoteAccounts
      : Array.isArray(accounts) && accounts.length > 0
        ? accounts
        : [];
  if (list.length === 0) {
    return (
      <p className="text-xs text-gray-600">
        No payout bank / UPI account on file for this store yet. The merchant adds this during onboarding (store setup /
        bank details).
      </p>
    );
  }

  const isImageUrl = (u: string) => /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u);

  const startEdit = (acc: Record<string, unknown>) => {
    const id = Number(acc.id);
    if (!Number.isFinite(id)) return;
    setEditingId(id);
    setDraftById((prev) => ({
      ...prev,
      [id]: {
        account_holder_name: String(acc.account_holder_name ?? ""),
        beneficiary_name: String((acc as any).beneficiary_name ?? ""),
        account_number: String(acc.account_number ?? ""),
        ifsc_code: String(acc.ifsc_code ?? ""),
        bank_name: String(acc.bank_name ?? ""),
        branch_name: String(acc.branch_name ?? ""),
        account_type: String(acc.account_type ?? ""),
        upi_id: String(acc.upi_id ?? ""),
      },
    }));
  };

  const saveEdit = async (accountId: number) => {
    if (!storeId) return;
    const d = draftById[accountId];
    if (!d) return;
    setSavingId(accountId);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/bank-accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          update: {
            account_holder_name: d.account_holder_name,
            beneficiary_name: d.beneficiary_name,
            account_number: d.account_number,
            ifsc_code: d.ifsc_code,
            bank_name: d.bank_name,
            branch_name: d.branch_name,
            account_type: d.account_type,
            upi_id: d.upi_id,
          },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) throw new Error(typeof data?.error === "string" ? data.error : "Save failed");
      setEditingId(null);
      toast.success("Bank details saved");
      await refreshAccounts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingId(null);
    }
  };

  const onUploadInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    const target = uploadTargetRef.current;
    uploadTargetRef.current = null;
    if (!f || !target || !storeId) return;
    if (locked) return;
    setUploadingId(target.accountId);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const up = await fetch(`/api/merchant/stores/${storeId}/bank-accounts/upload`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const upData = (await up.json().catch(() => ({}))) as any;
      if (!up.ok || !upData?.success || typeof upData.url !== "string") {
        throw new Error(typeof upData?.error === "string" ? upData.error : "Upload failed");
      }
      const url = upData.url as string;
      const res = await fetch(`/api/merchant/stores/${storeId}/bank-accounts/${target.accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ update: { [target.field]: url } }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) throw new Error(typeof data?.error === "string" ? data.error : "Save failed");
      toast.success("Proof updated");
      await refreshAccounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingId(null);
    }
  };

  const markBankVerified = async (accountId: number, next: boolean) => {
    if (!storeId || locked) return;
    setSavingId(accountId);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/bank-accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          update: {
            is_verified: next,
            verification_status: next ? "verified" : "pending",
          },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) throw new Error(typeof data?.error === "string" ? data.error : "Update failed");
      toast.success(next ? "Bank marked verified" : "Bank marked pending");
      await refreshAccounts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSavingId(null);
    }
  };

  const markUpiVerified = async (accountId: number, next: boolean) => {
    if (!storeId || locked) return;
    setSavingId(accountId);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/bank-accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          update: {
            upi_verified: next,
          },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) throw new Error(typeof data?.error === "string" ? data.error : "Update failed");
      toast.success(next ? "UPI marked verified" : "UPI marked pending");
      await refreshAccounts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <input ref={bankProofInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onUploadInputChange} />
      <input ref={upiQrInputRef} type="file" accept="image/*" className="hidden" onChange={onUploadInputChange} />
      {list.map((acc) => {
        const id = acc.id as number;
        const primary = acc.is_primary === true;
        const payout = (acc.payout_method as string) || "—";
        const verified = acc.is_verified === true;
        const upi = typeof acc.upi_id === "string" && acc.upi_id.trim() ? acc.upi_id.trim() : null;
        const upiVerified = acc.upi_verified;
        const proofBank = (acc.bank_proof_file_url as string) || null;
        const proofQr = (acc.upi_qr_screenshot_url as string) || null;
        const vStatus = (acc.verification_status as string) || null;
        const beneficiary = ((acc as any).beneficiary_name as string) || "";
        const hasUpiDetails = !!upi || upiVerified === true || upiVerified === false || !!proofQr;
        const isEditing = editingId === Number(id);
        return (
          <div
            key={id}
            className={`rounded-lg border border-gray-200 bg-gray-50/50 text-gray-900 ${compact ? "p-2 text-[11px]" : "p-3 text-xs"}`}
          >
            <div className={`flex flex-wrap items-center justify-between ${compact ? "mb-1 gap-1" : "mb-2 gap-2"}`}>
              <span className="font-medium text-gray-800">
                Account #{id}
                {primary ? (
                  <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-800">
                    Primary
                  </span>
                ) : null}
              </span>
              {verified ? (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                  Marked verified
                </span>
              ) : (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                  Not verified
                </span>
              )}
              <div className="flex items-center gap-2">
                {locked && (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                    Verified
                  </span>
                )}
                {storeId != null && !locked && (
                  <>
                    <button
                      type="button"
                      disabled={savingId === Number(id) || isEditing}
                      onClick={() => void markBankVerified(Number(id), !verified)}
                      className="inline-flex items-center rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                      title="Mark bank account verified / pending"
                    >
                      {verified ? "Bank: Unverify" : "Bank: Verify"}
                    </button>
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          disabled={savingId === Number(id)}
                          onClick={() => void saveEdit(Number(id))}
                          className="inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          disabled={savingId === Number(id)}
                          onClick={() => setEditingId(null)}
                          className="inline-flex items-center rounded border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(acc)}
                        className="inline-flex items-center rounded border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Edit
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className={`grid gap-2 sm:grid-cols-2 ${compact ? "gap-y-1.5" : ""}`}>
              <div className={`grid gap-1 ${compact ? "" : ""}`}>
                <span className="text-[10px] font-medium uppercase text-gray-500">Holder</span>
                {isEditing ? (
                  <input
                    value={draftById[Number(id)]?.account_holder_name ?? ""}
                    onChange={(e) =>
                      setDraftById((prev) => ({
                        ...prev,
                        [Number(id)]: { ...(prev[Number(id)] ?? {}), account_holder_name: e.target.value },
                      }))
                    }
                    className="mt-0.5 w-full rounded border border-gray-200 bg-white px-2 py-1 text-[11px] outline-none focus:border-indigo-400"
                  />
                ) : (
                  <p className="break-words">{(acc.account_holder_name as string) || "—"}</p>
                )}
              </div>
              <div className={`grid gap-1`}>
                <span className="text-[10px] font-medium uppercase text-gray-500">Beneficiary</span>
                {isEditing ? (
                  <input
                    value={draftById[Number(id)]?.beneficiary_name ?? ""}
                    onChange={(e) =>
                      setDraftById((prev) => ({
                        ...prev,
                        [Number(id)]: { ...(prev[Number(id)] ?? {}), beneficiary_name: e.target.value },
                      }))
                    }
                    className="mt-0.5 w-full rounded border border-gray-200 bg-white px-2 py-1 text-[11px] outline-none focus:border-indigo-400"
                  />
                ) : (
                  <p className="break-words">{beneficiary || "—"}</p>
                )}
              </div>
              <div className="sm:col-span-1 sm:row-span-3 sm:col-start-1 sm:mt-0">
                <span className="text-[10px] font-medium uppercase text-gray-500">UPI</span>
                <div className={`rounded-md border border-indigo-100 bg-indigo-50/40 ${compact ? "p-2" : "p-2.5"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-900">
                      UPI details
                    </span>
                    {!locked && storeId != null && (
                      <button
                        type="button"
                        disabled={savingId === Number(id) || isEditing}
                        onClick={() => void markUpiVerified(Number(id), !(upiVerified === true))}
                        className="inline-flex items-center rounded border border-indigo-200 bg-white px-2 py-0.5 text-[10px] font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                        title="Mark UPI verified / pending"
                      >
                        {upiVerified === true ? "UPI: Unverify" : "UPI: Verify"}
                      </button>
                    )}
                  </div>
                  <div className={`mt-1 grid ${compact ? "gap-1" : "gap-2"}`}>
                    <div>
                      <span className="text-[10px] font-medium uppercase text-gray-500">UPI ID</span>
                      {isEditing ? (
                        <input
                          value={draftById[Number(id)]?.upi_id ?? ""}
                          onChange={(e) =>
                            setDraftById((prev) => ({
                              ...prev,
                              [Number(id)]: { ...(prev[Number(id)] ?? {}), upi_id: e.target.value },
                            }))
                          }
                          className="mt-0.5 w-full rounded border border-gray-200 bg-white px-2 py-1 text-[11px] outline-none focus:border-indigo-400"
                        />
                      ) : (
                        <p className="break-all">{upi ?? "—"}</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-medium uppercase text-gray-500">UPI verified</span>
                        <p>{upiVerified === true ? "Yes" : upiVerified === false ? "No" : "—"}</p>
                      </div>
                      {proofQr ? (
                        <a
                          href={proofQr}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="h-12 w-12 overflow-hidden rounded border border-gray-200 bg-white"
                          title="UPI QR screenshot"
                        >
                          <img src={proofQr} alt="UPI QR" className="h-full w-full object-cover" />
                        </a>
                      ) : (
                        <div className="h-12 w-12 rounded border border-dashed border-gray-200 bg-white" />
                      )}
                    </div>
                    {storeId != null && !locked && (
                      <button
                        type="button"
                        disabled={uploadingId === Number(id)}
                        onClick={() => {
                          uploadTargetRef.current = { accountId: Number(id), field: "upi_qr_screenshot_url" };
                          upiQrInputRef.current?.click();
                        }}
                        className="inline-flex w-fit items-center rounded border border-indigo-200 bg-white px-2 py-0.5 text-[10px] font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                      >
                        Upload QR
                      </button>
                    )}
                    {!hasUpiDetails && (
                      <p className="text-[10px] text-indigo-900/70">No UPI details provided.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="sm:col-span-1 sm:col-start-2">
                <span className="text-[10px] font-medium uppercase text-gray-500">Account no. (full)</span>
                {isEditing ? (
                  <input
                    value={draftById[Number(id)]?.account_number ?? ""}
                    onChange={(e) =>
                      setDraftById((prev) => ({
                        ...prev,
                        [Number(id)]: { ...(prev[Number(id)] ?? {}), account_number: e.target.value },
                      }))
                    }
                    className="mt-0.5 w-full rounded border border-gray-200 bg-white px-2 py-1 font-mono text-[11px] outline-none focus:border-indigo-400"
                  />
                ) : (
                  <p className={`break-all font-mono tracking-tight ${compact ? "text-[12px]" : "text-[13px]"}`}>
                    {formatBankAccountNumberFull(acc.account_number)}
                  </p>
                )}
              </div>
              <div className="sm:col-span-1 sm:col-start-2">
                <span className="text-[10px] font-medium uppercase text-gray-500">IFSC</span>
                {isEditing ? (
                  <input
                    value={draftById[Number(id)]?.ifsc_code ?? ""}
                    onChange={(e) =>
                      setDraftById((prev) => ({
                        ...prev,
                        [Number(id)]: { ...(prev[Number(id)] ?? {}), ifsc_code: e.target.value },
                      }))
                    }
                    className="mt-0.5 w-full rounded border border-gray-200 bg-white px-2 py-1 text-[11px] outline-none focus:border-indigo-400"
                  />
                ) : (
                  <p>{(acc.ifsc_code as string) || "—"}</p>
                )}
              </div>
              <div className="sm:col-span-1 sm:col-start-2">
                <span className="text-[10px] font-medium uppercase text-gray-500">Bank / branch</span>
                {isEditing ? (
                  <div className="mt-0.5 grid grid-cols-2 gap-1">
                    <input
                      value={draftById[Number(id)]?.bank_name ?? ""}
                      onChange={(e) =>
                        setDraftById((prev) => ({
                          ...prev,
                          [Number(id)]: { ...(prev[Number(id)] ?? {}), bank_name: e.target.value },
                        }))
                      }
                      placeholder="Bank"
                      className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-[11px] outline-none focus:border-indigo-400"
                    />
                    <input
                      value={draftById[Number(id)]?.branch_name ?? ""}
                      onChange={(e) =>
                        setDraftById((prev) => ({
                          ...prev,
                          [Number(id)]: { ...(prev[Number(id)] ?? {}), branch_name: e.target.value },
                        }))
                      }
                      placeholder="Branch"
                      className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-[11px] outline-none focus:border-indigo-400"
                    />
                  </div>
                ) : (
                  <p className="break-words">
                    {(acc.bank_name as string) || "—"}
                    {(acc.branch_name as string) ? ` · ${acc.branch_name as string}` : ""}
                  </p>
                )}
              </div>
              <div className="sm:col-span-1 sm:col-start-2">
                <span className="text-[10px] font-medium uppercase text-gray-500">Payout method</span>
                <p>{payout}</p>
              </div>
              {vStatus ? (
                <div className="sm:col-span-2">
                  <span className="text-[10px] font-medium uppercase text-gray-500">Verification status (record)</span>
                  <p>{vStatus}</p>
                </div>
              ) : null}
            </div>
            {proofBank ? (
              <div className={`flex flex-wrap gap-2 border-t border-gray-100 ${compact ? "mt-1 pt-1" : "mt-2 pt-2"}`}>
                <div className="flex items-center gap-2">
                  <a
                    href={proofBank}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-12 w-12 overflow-hidden rounded border border-gray-200 bg-white"
                    title="Bank proof"
                  >
                    {isImageUrl(proofBank) ? (
                      <img src={proofBank} alt="Bank proof" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] font-medium text-gray-600">
                        PDF
                      </div>
                    )}
                  </a>
                  {storeId != null && !locked && (
                    <button
                      type="button"
                      disabled={uploadingId === Number(id)}
                      onClick={() => {
                        uploadTargetRef.current = { accountId: Number(id), field: "bank_proof_file_url" };
                        bankProofInputRef.current?.click();
                      }}
                      className="inline-flex items-center rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                    >
                      Upload new
                    </button>
                  )}
                </div>
                <a
                  href={proofBank}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1 rounded border border-indigo-200 bg-white text-[11px] font-medium text-indigo-700 hover:bg-indigo-50 ${compact ? "px-2 py-0.5" : "px-2 py-1"}`}
                >
                  <ExternalLink className="h-3 w-3" />
                  Bank proof
                </a>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

interface StoreDetail {
  id: number;
  store_id: string;
  name: string;
  city: string | null;
  approval_status: string;
  store_name?: string;
  store_display_name?: string | null;
  full_address?: string | null;
  store_email?: string | null;
  created_at?: string | null;
  current_onboarding_step?: number | null;
  onboarding_completed?: boolean | null;
}

interface VerificationDataStore {
  store_name?: string | null;
  store_display_name?: string | null;
  store_description?: string | null;
  store_email?: string | null;
  store_phones?: string[] | null;
  full_address?: string | null;
  landmark?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  banner_url?: string | null;
  gallery_images?: string[] | null;
  cuisine_types?: string[] | null;
  food_categories?: string[] | null;
  avg_preparation_time_minutes?: number | null;
  min_order_amount?: number | null;
  delivery_radius_km?: number | null;
  is_pure_veg?: boolean | null;
  accepts_online_payment?: boolean | null;
  accepts_cash?: boolean | null;
  store_type?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
}

type StepVerification = {
  verified_at: string | null;
  verified_by: number | null;
  verified_by_name: string | null;
  notes: string | null;
  rejection?: {
    rejected_at: string;
    rejection_reason: string;
    step_label?: string | null;
    rejected_by?: number | null;
    rejected_by_name?: string | null;
    email_sent?: boolean;
    email_skip_reason?: string | null;
    merchant_resubmitted_at?: string | null;
    /** Step 3: snapshot of menu PDF/sheet/photo statuses at rejection. */
    rejection_detail?: unknown | null;
  } | null;
};

type StepEditRecord = {
  field_key: string;
  old_value: string | null;
  new_value: string | null;
  edited_by: number | null;
  edited_by_name: string | null;
  edited_at: string;
};

export type { MenuMediaFile };

/** Must match POST /api/merchant/stores/[id]/documents/verify docType values. */
const DOC_TYPES = [
  "pan",
  "gst",
  "aadhaar",
  "fssai",
  "drug_license",
  "trade_license",
  "shop_establishment",
  "udyam",
  "pharmacist_certificate",
  "pharmacy_council_registration",
  "bank_proof",
  "other",
] as const;

const DOC_TYPE_LABELS: Record<(typeof DOC_TYPES)[number], string> = {
  pan: "PAN",
  gst: "GST",
  aadhaar: "Aadhaar",
  fssai: "FSSAI",
  drug_license: "Drug license",
  trade_license: "Trade license",
  shop_establishment: "Shop establishment",
  udyam: "Udyam",
  pharmacist_certificate: "Pharmacist certificate",
  pharmacy_council_registration: "Pharmacy council registration",
  bank_proof: "Bank proof",
  other: "Other document",
};

/** Single source for step 4 list, verify gating, and PATCH /documents number fields. */
const STEP4_DOCUMENT_ROWS = [
  { docType: "pan", summary: "PAN", listLabel: "PAN number", numberKey: "pan_document_number", urlKey: "pan_document_url", verifiedKey: "pan_is_verified", rejectionKey: "pan_rejection_reason" },
  { docType: "gst", summary: "GST", listLabel: "GST number", numberKey: "gst_document_number", urlKey: "gst_document_url", verifiedKey: "gst_is_verified", rejectionKey: "gst_rejection_reason" },
  { docType: "aadhaar", summary: "Aadhaar", listLabel: "Aadhaar number", numberKey: "aadhaar_document_number", urlKey: "aadhaar_document_url", verifiedKey: "aadhaar_is_verified", rejectionKey: "aadhaar_rejection_reason" },
  { docType: "fssai", summary: "FSSAI", listLabel: "FSSAI number", numberKey: "fssai_document_number", urlKey: "fssai_document_url", verifiedKey: "fssai_is_verified", rejectionKey: "fssai_rejection_reason" },
  { docType: "drug_license", summary: "Drug license", listLabel: "Drug license", numberKey: "drug_license_document_number", urlKey: "drug_license_document_url", verifiedKey: "drug_license_is_verified", rejectionKey: "drug_license_rejection_reason" },
  { docType: "trade_license", summary: "Trade license", listLabel: "Trade license number", numberKey: "trade_license_document_number", urlKey: "trade_license_document_url", verifiedKey: "trade_license_is_verified", rejectionKey: "trade_license_rejection_reason" },
  { docType: "shop_establishment", summary: "Shop establishment", listLabel: "Shop establishment number", numberKey: "shop_establishment_document_number", urlKey: "shop_establishment_document_url", verifiedKey: "shop_establishment_is_verified", rejectionKey: "shop_establishment_rejection_reason" },
  { docType: "udyam", summary: "Udyam", listLabel: "Udyam number", numberKey: "udyam_document_number", urlKey: "udyam_document_url", verifiedKey: "udyam_is_verified", rejectionKey: "udyam_rejection_reason" },
  { docType: "other", summary: "Other", listLabel: "Other document number", numberKey: "other_document_number", urlKey: "other_document_url", verifiedKey: "other_is_verified", rejectionKey: "other_rejection_reason" },
  { docType: "bank_proof", summary: "Bank proof", listLabel: "Bank proof number", numberKey: "bank_proof_document_number", urlKey: "bank_proof_document_url", verifiedKey: "bank_proof_is_verified", rejectionKey: "bank_proof_rejection_reason" },
  { docType: "pharmacist_certificate", summary: "Pharmacist cert.", listLabel: "Pharmacist certificate number", numberKey: "pharmacist_certificate_document_number", urlKey: "pharmacist_certificate_document_url", verifiedKey: "pharmacist_certificate_is_verified", rejectionKey: "pharmacist_certificate_rejection_reason" },
  { docType: "pharmacy_council_registration", summary: "Pharmacy council", listLabel: "Pharmacy council registration number", numberKey: "pharmacy_council_registration_document_number", urlKey: "pharmacy_council_registration_document_url", verifiedKey: "pharmacy_council_registration_is_verified", rejectionKey: "pharmacy_council_registration_rejection_reason" },
] as const;

type Step4DocRow = (typeof STEP4_DOCUMENT_ROWS)[number];

type Step4DocPreviewPayload = {
  url: string;
  title: string;
  metaLines?: { label: string; value: string }[];
};

/** Aadhaar back image URL is stored in `aadhaar_document_metadata` (e.g. `back_url`). */
function getAadhaarBackUrl(doc: Record<string, unknown>): string {
  const raw = doc.aadhaar_document_metadata;
  if (raw == null) return "";
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return "";
    try {
      const o = JSON.parse(s) as Record<string, unknown>;
      const u = o.back_url;
      return typeof u === "string" ? u.trim() : "";
    } catch {
      return "";
    }
  }
  if (typeof raw === "object" && raw !== null) {
    const u = (raw as Record<string, unknown>).back_url;
    return typeof u === "string" ? u.trim() : "";
  }
  return "";
}

function formatDocMetaDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v);
  if (s.includes("T") && s.length > 10) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? s : d.toLocaleString();
  }
  if (s.length >= 10) {
    const d = new Date(s.slice(0, 10));
    return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString();
  }
  return s;
}

function buildStep4DocumentPreviewMeta(
  doc: Record<string, unknown>,
  row: Step4DocRow,
  opts?: { aadhaarSide?: "front" | "back" }
): { label: string; value: string }[] {
  const p = row.docType;
  const lines: { label: string; value: string }[] = [];

  const pushIf = (label: string, key: string) => {
    const v = doc[key];
    if (v == null || v === "") return;
    const str = typeof v === "string" ? v.trim() : String(v);
    if (!str) return;
    lines.push({ label, value: str });
  };

  if (p === "aadhaar") {
    const side = opts?.aadhaarSide ?? "front";
    lines.push({ label: "Side", value: side === "back" ? "Back of card" : "Front" });
  }

  pushIf("Document number", `${p}_document_number`);
  if (p === "pan") pushIf("Holder name", "pan_holder_name");
  if (p === "aadhaar") pushIf("Holder name", "aadhaar_holder_name");
  pushIf("File name", `${p}_document_name`);
  if (p === "drug_license") pushIf("License type", "drug_license_type");
  if (p === "pharmacy_council_registration") pushIf("Registration type", "pharmacy_council_registration_type");
  if (p === "other") pushIf("Other type", "other_document_type");
  pushIf("Issued date", `${p}_issued_date`);
  pushIf("Expiry date", `${p}_expiry_date`);

  const isExpired = doc[`${p}_is_expired`];
  if (isExpired === true) lines.push({ label: "Marked expired", value: "Yes" });
  else if (isExpired === false) lines.push({ label: "Marked expired", value: "No" });

  const ver = doc[`${p}_is_verified`];
  if (ver === true) lines.push({ label: "Verification", value: "Verified" });
  else if (ver === false) lines.push({ label: "Verification", value: "Not verified" });

  const vAt = formatDocMetaDate(doc[`${p}_verified_at`]);
  if (vAt) lines.push({ label: "Verified at", value: vAt });

  const rr = doc[`${p}_rejection_reason`];
  if (typeof rr === "string" && rr.trim()) {
    lines.push({ label: "Rejection reason", value: rr.trim() });
  }

  const dv = doc[`${p}_document_version`];
  if (dv != null && dv !== "") lines.push({ label: "Version", value: String(dv) });

  return lines;
}

function step4DocResubmitted(flags: unknown, docType: string): boolean {
  if (!flags || typeof flags !== "object" || flags === null) return false;
  const v = (flags as Record<string, unknown>)[docType];
  return v === true || v === "true";
}

/** True if any document row is still rejected but has a partner/dashboard re-upload pending review. */
function step4AnyResubmittedAfterReject(documents: unknown): boolean {
  if (!documents || typeof documents !== "object" || documents === null) return false;
  const doc = documents as Record<string, unknown>;
  const flags = doc.step4_resubmission_flags;
  for (const row of STEP4_DOCUMENT_ROWS) {
    const rr = doc[row.rejectionKey];
    if (typeof rr !== "string" || rr.trim() === "") continue;
    const det = rejectionDetailForDocType(doc.step4_rejection_details, row.docType);
    if (!rejectionRequiresNewFileUpload(det)) continue;
    if (step4DocResubmitted(flags, row.docType)) return true;
  }
  return false;
}

function Step4RejectionBreakdown({ detailsRoot, docType }: { detailsRoot: unknown; docType: string }) {
  const d = rejectionDetailForDocType(detailsRoot, docType);
  if (!d) return null;
  return (
    <ul className="mt-1 max-w-[min(100%,280px)] list-inside list-disc space-y-1.5 text-[10px] text-red-900">
      {d.issues.map((code) => (
        <li key={code} className="leading-snug">
          <span className="font-semibold">{DOCUMENT_REJECTION_ISSUE_LABELS[code]}</span>
          <span className="block pl-3.5 font-normal text-red-800/90">{DOCUMENT_REJECTION_ISSUE_ACTIONS[code]}</span>
        </li>
      ))}
      {d.note ? <li className="list-none pl-0 italic text-red-800/85">Note: {d.note}</li> : null}
    </ul>
  );
}

function DocVerifyButton({
  storeId,
  docType,
  isVerified,
  isRejected,
  hasResubmittedAfterReject,
  step4RejectionDetailsRoot,
  adminOverrideMode,
  canPerformVerify = true,
  onSuccess,
}: {
  storeId: number;
  docType: (typeof DOC_TYPES)[number];
  isVerified: boolean;
  isRejected: boolean;
  hasResubmittedAfterReject: boolean;
  step4RejectionDetailsRoot: unknown;
  adminOverrideMode: boolean;
  canPerformVerify?: boolean;
  onSuccess: (payload: { action: "verify"; docType: (typeof DOC_TYPES)[number] }) => void;
}) {
  const [loading, setLoading] = useState(false);
  const structured = rejectionDetailForDocType(step4RejectionDetailsRoot, docType);
  const needsFileReupload = rejectionRequiresNewFileUpload(structured);
  const canVerifyWhileRejected = adminOverrideMode || !needsFileReupload || hasResubmittedAfterReject;

  const handleVerify = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/documents/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType, action: "verify", override: adminOverrideMode }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        onSuccess({ action: "verify", docType });
        dispatchMerchantResubmittedDocsRefresh();
      }
    } finally {
      setLoading(false);
    }
  };

  if (isVerified) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
        <CheckCircle className="h-3 w-3" />
        Verified
      </span>
    );
  }
  if (!canPerformVerify) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
        Pending review
      </span>
    );
  }
  if (isRejected && canVerifyWhileRejected) {
    return (
      <div className="flex max-w-[260px] flex-col gap-1">
        {!needsFileReupload ? (
          <p className="text-[10px] leading-snug text-gray-600">
            Rejection did not require a new image. After the partner updates text/expiry/details (or you edit here), verify again.
          </p>
        ) : hasResubmittedAfterReject ? (
          <p className="text-[10px] leading-snug text-gray-600">New file uploaded — review and verify.</p>
        ) : adminOverrideMode ? (
          <p className="text-[10px] leading-snug text-gray-600">Admin override enabled — verify now.</p>
        ) : null}
        <button
          type="button"
          disabled={loading}
          onClick={handleVerify}
          className="inline-flex w-fit cursor-pointer items-center gap-1 rounded border border-amber-500 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
          {adminOverrideMode ? "Override & Verify" : "Verify again"}
        </button>
      </div>
    );
  }
  if (isRejected) {
    return (
      <div className="flex flex-col gap-1">
        <p className="max-w-[260px] text-[10px] leading-snug text-gray-500">
          The document image was rejected. The store must upload a new file on the partner portal before you can verify again.
        </p>
        <button
          type="button"
          disabled
          title="Available after a new document file is uploaded from the partner portal"
          className="inline-flex w-fit cursor-not-allowed items-center gap-1 rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold text-gray-400"
        >
          Verify again
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      disabled={loading}
      onClick={handleVerify}
      className="inline-flex cursor-pointer items-center gap-1 rounded border border-amber-500 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
      Verify
    </button>
  );
}

function DocRejectButton({
  storeId,
  docType,
  isRejected,
  rejectionReason,
  rejectionDetailsRoot,
  docLabel,
  onSuccess,
}: {
  storeId: number;
  docType: (typeof DOC_TYPES)[number];
  isRejected: boolean;
  rejectionReason: string | null;
  rejectionDetailsRoot: unknown;
  docLabel: string;
  onSuccess: (payload: {
    action: "reject";
    docType: (typeof DOC_TYPES)[number];
    rejectionIssues: DocumentRejectionIssueCode[];
    rejectionNote: string;
    rejectionReason: string;
  }) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedIssues, setSelectedIssues] = useState<DocumentRejectionIssueCode[]>([]);
  const [extraNote, setExtraNote] = useState("");

  const toggleIssue = (code: DocumentRejectionIssueCode) => {
    setSelectedIssues((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const handleRejectClick = () => {
    setSelectedIssues([]);
    setExtraNote("");
    setModalOpen(true);
  };

  const handleRejectSubmit = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/documents/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docType,
          action: "reject",
          rejection_issues: selectedIssues,
          rejection_note: extraNote.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setModalOpen(false);
        onSuccess({
          action: "reject",
          docType,
          rejectionIssues: selectedIssues,
          rejectionNote: extraNote.trim(),
          rejectionReason:
            typeof data?.rejection_reason === "string" && data.rejection_reason.trim()
              ? data.rejection_reason
              : "Rejected by verifier",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  if (isRejected) {
    return (
      <span className="inline-flex flex-col items-start gap-0.5">
        <span className="inline-flex items-center gap-0.5 rounded bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-800">
          <XCircle className="h-3 w-3" />
          Rejected
        </span>
        <Step4RejectionBreakdown detailsRoot={rejectionDetailsRoot} docType={docType} />
        {rejectionReason && (
          <span className="max-w-[min(100%,280px)] text-[10px] text-red-800/90" title={rejectionReason}>
            Summary: {rejectionReason}
          </span>
        )}
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        disabled={loading}
        onClick={handleRejectClick}
        className="inline-flex cursor-pointer items-center gap-1 rounded border border-red-400 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
        Reject
      </button>
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !loading && setModalOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <p className="mb-1 text-sm font-medium text-gray-900">Reject {docLabel}</p>
            <p className="mb-3 text-xs text-gray-500">
              Select everything that is wrong. The store will only be asked to fix what you select (e.g. number only vs new image).
            </p>
            <div className="mb-3 space-y-2">
              {DOCUMENT_REJECTION_ISSUE_CODES.map((code) => (
                <label key={code} className="flex cursor-pointer items-start gap-2 rounded border border-gray-100 bg-gray-50/80 px-2 py-1.5 text-xs hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selectedIssues.includes(code)}
                    onChange={() => toggleIssue(code)}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300"
                  />
                  <span>
                    <span className="font-medium text-gray-900">{DOCUMENT_REJECTION_ISSUE_LABELS[code]}</span>
                    <span className="mt-0.5 block text-[10px] leading-snug text-gray-500">{DOCUMENT_REJECTION_ISSUE_ACTIONS[code]}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-gray-500">Optional note</p>
            <textarea
              value={extraNote}
              onChange={(e) => setExtraNote(e.target.value)}
              placeholder="Extra context for the store (optional)…"
              className="mb-3 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              rows={2}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !loading && setModalOpen(false)}
                className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading || selectedIssues.length === 0}
                onClick={handleRejectSubmit}
                className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function docAttachmentLooksPdf(url: string): boolean {
  const u = url.split("?")[0]?.toLowerCase() ?? "";
  return u.endsWith(".pdf");
}

/** Step 4 document upload/replace.
 * Preview is handled by clicking the document thumbnail (full-screen modal).
 */
function DocFileUpload({
  storeId,
  docType,
  side,
  currentUrl,
  uploadedByFromData,
  onUploaded,
}: {
  storeId: number;
  docType: string;
  side?: "front" | "back";
  currentUrl: string | null | undefined;
  uploadedByFromData?: string | null;
  onUploaded?: (payload: unknown) => void | Promise<void>;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [uploadedByEmail, setUploadedByEmail] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const doUpload = async () => {
    if (!selectedFile || uploading) return;
    setShowReplaceConfirm(false);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      form.append("docType", docType);
      if (docType === "aadhaar") form.append("side", side === "back" ? "back" : "front");
      const res = await fetch(`/api/merchant/stores/${storeId}/documents/upload`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        toast.error(typeof data?.error === "string" ? data.error : "Document upload failed");
        return;
      }
      const byEmail =
        typeof data?.uploaded_by_email === "string"
          ? data.uploaded_by_email
          : typeof data?.uploaded_by === "string"
            ? data.uploaded_by
            : null;
      setUploadedByEmail(byEmail);
      toast.success("Document uploaded");
      setSelectedFile(null);
      if (inputRef.current) inputRef.current.value = "";
      onUploaded?.(data);
    } catch {
      toast.error("Document upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex w-full flex-col items-center gap-1 py-0.5">
      <input
        ref={inputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,.pdf,image/*,application/pdf"
        onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
        disabled={uploading}
        className="hidden"
      />
      <div className="flex w-full flex-wrap items-center justify-start gap-2">
        <button
          type="button"
          onClick={() => {
            if (selectedFile) {
              setShowReplaceConfirm(true);
              return;
            }
            inputRef.current?.click();
          }}
          disabled={uploading}
          className="inline-flex cursor-pointer items-center gap-1 rounded border border-indigo-600 bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          {selectedFile ? "Replace & Save" : "Choose File"}
        </button>
        {(uploadedByEmail ?? uploadedByFromData) ? (
          <span
            className="flex-none text-[10px] text-gray-500 break-all"
            title={uploadedByEmail ?? uploadedByFromData ?? undefined}
          >
            {uploadedByEmail ?? uploadedByFromData}
          </span>
        ) : null}
      </div>
      {selectedFile ? (
        <p className="max-w-[8rem] truncate text-[10px] text-gray-500" title={selectedFile.name}>
          {selectedFile.name}
        </p>
      ) : null}

      {showReplaceConfirm && (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-sm rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 className="text-base font-semibold text-gray-900">Replace document?</h2>
              <p className="mt-2 text-sm text-gray-600">
                Replacing will remove the old file and upload the new one for this document.
              </p>
              {selectedFile ? (
                <p className="mt-1 text-xs text-gray-500">
                  New file: <span className="font-medium text-gray-700">{selectedFile.name}</span>
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3">
              <button
                type="button"
                onClick={() => setShowReplaceConfirm(false)}
                disabled={uploading}
                className="cursor-pointer rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={uploading}
                onClick={() => void doUpload()}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Upload & replace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuFileUpload({
  storeId,
  existingFileCount,
  onSuccess,
}: {
  storeId: number;
  existingFileCount: number;
  onSuccess: () => void;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const doUpload = async (replace: boolean) => {
    if (!selectedFile) return;
    setUploadError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      if (replace) form.append("replace", "true");
      const res = await fetch(`/api/merchant/stores/${storeId}/media/upload`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setSelectedFile(null);
        setShowReplaceConfirm(false);
        if (inputRef.current) inputRef.current.value = "";
        onSuccess();
      } else {
        setUploadError(data?.error || "Upload failed");
      }
    } catch {
      setUploadError("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setSelectedFile(file || null);
    setUploadError(null);
  };

  const handleSaveClick = () => {
    if (!selectedFile) return;
    if (existingFileCount > 0) {
      setShowReplaceConfirm(true);
    } else {
      doUpload(false);
    }
  };

  const handleReplaceConfirm = () => {
    doUpload(true);
  };

  return (
    <div className="mt-3 border-t border-gray-100 pt-2">
      <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">Upload menu file</p>
      <p className="mb-1 text-[10px] text-gray-500">Images (PNG, JPG), CSV, or XLS — max 15 MB</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,image/*,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={handleFileChange}
          disabled={uploading}
          className="block w-full max-w-xs text-xs file:mr-2 file:rounded file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-indigo-700 file:text-xs"
        />
        {selectedFile && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="max-w-[180px] truncate text-xs text-gray-600" title={selectedFile.name}>
              {selectedFile.name}
            </span>
            <button
              type="button"
              disabled={uploading}
              onClick={handleSaveClick}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </button>
          </div>
        )}
        {uploading && !selectedFile && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
      </div>
      {uploadError && <p className="mt-1 text-xs text-red-600">{uploadError}</p>}

      {/* Replace confirmation modal */}
      {showReplaceConfirm && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="replace-menu-title"
        >
          <div className="relative w-full max-w-sm rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 id="replace-menu-title" className="text-base font-semibold text-gray-900">
                Replace menu file
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Existing menu file(s) will be removed and replaced by the new file. This cannot be undone.
              </p>
              {selectedFile && (
                <p className="mt-1 text-xs text-gray-500">
                  New file: <span className="font-medium text-gray-700">{selectedFile.name}</span>
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3">
              <button
                type="button"
                onClick={() => setShowReplaceConfirm(false)}
                disabled={uploading}
                className="cursor-pointer rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={uploading}
                onClick={handleReplaceConfirm}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Yes, save & replace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Format time string (HH:MM:SS or HH:MM) to HH:MM */
function formatTime(v: unknown): string {
  if (v == null) return "—";
  const s = String(v).trim();
  if (!s) return "—";
  const part = s.split(":").slice(0, 2).join(":");
  return part || "—";
}

function OperatingHoursBlock({ oh }: { oh: Record<string, unknown> | null }) {
  if (!oh) return <p className="text-xs text-gray-500">No operating hours set.</p>;
  const is24 = !!oh.is_24_hours;
  const sameAll = !!oh.same_for_all_days;
  const closed = (oh.closed_days as string[] | null) ?? [];
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
  const dayLabels: Record<string, string> = { monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun" };
  if (is24) return <p className="text-xs text-gray-900">Open 24 hours</p>;
  const openDays = days.filter((d) => !closed.includes(d) && !!oh[`${d}_open`]);
  return (
    <div className="space-y-1 text-xs">
      {closed.length > 0 && (
        <p className="text-gray-500">Closed: {closed.map((d) => dayLabels[d] ?? d).join(", ")}</p>
      )}
      {openDays.length === 0 && closed.length === 0 && <p className="text-gray-500">No hours set</p>}
      {openDays.map((day) => {
        const open = !!oh[`${day}_open`];
        if (!open) return null;
        const s1Start = formatTime(oh[`${day}_slot1_start`]);
        const s1End = formatTime(oh[`${day}_slot1_end`]);
        const s2Start = formatTime(oh[`${day}_slot2_start`]);
        const s2End = formatTime(oh[`${day}_slot2_end`]);
        const slot1 = s1Start !== "—" && s1End !== "—" ? `${s1Start} – ${s1End}` : null;
        const slot2 = s2Start !== "—" && s2End !== "—" ? `${s2Start} – ${s2End}` : null;
        const text = [slot1, slot2].filter(Boolean).join(", ");
        return (
          <div key={day} className="flex gap-2">
            <span className="w-12 shrink-0 font-medium text-gray-500">{dayLabels[day]}</span>
            <span className="text-gray-900">{text || "—"}</span>
          </div>
        );
      })}
      {sameAll && <p className="text-[10px] text-gray-500">Same for all days</p>}
    </div>
  );
}

function OperatingHoursEditor({
  storeId,
  oh,
  onSaved,
}: {
  storeId: number;
  oh: Record<string, unknown> | null;
  onSaved?: () => void;
}) {
  const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

  const base = oh ?? {};
  const initialEnableSlot2 = DAYS.some((d) => {
    const s = base[`${d}_slot2_start`];
    const e = base[`${d}_slot2_end`];
    return typeof s === "string" && s.trim() !== "" && typeof e === "string" && e.trim() !== "";
  });

  const [enableSlot2, setEnableSlot2] = useState<boolean>(initialEnableSlot2);
  const [form, setForm] = useState<Record<string, unknown>>(() => ({ ...base }));
  const [saving, setSaving] = useState(false);
  const initialRef = useRef<{ enableSlot2: boolean; snapshot: string } | null>(null);
  const lastSeedSnapshotRef = useRef<string>("");

  useEffect(() => {
    // Re-seed only when underlying values actually changed, and only if user is not mid-edit.
    const seed = { ...(oh ?? {}) };
    const snapObj: Record<string, unknown> = {
      same_for_all_days: !!seed.same_for_all_days,
      is_24_hours: !!seed.is_24_hours,
      closed_days: Array.isArray(seed.closed_days) ? seed.closed_days : [],
    };
    for (const d of DAYS) {
      snapObj[`${d}_open`] = !!seed[`${d}_open`];
      snapObj[`${d}_slot1_start`] = (seed[`${d}_slot1_start`] as string | null) ?? null;
      snapObj[`${d}_slot1_end`] = (seed[`${d}_slot1_end`] as string | null) ?? null;
      snapObj[`${d}_slot2_start`] = (seed[`${d}_slot2_start`] as string | null) ?? null;
      snapObj[`${d}_slot2_end`] = (seed[`${d}_slot2_end`] as string | null) ?? null;
    }
    const nextSeedSnapshot = JSON.stringify(snapObj);
    if (nextSeedSnapshot === lastSeedSnapshotRef.current && initialRef.current != null) return;
    lastSeedSnapshotRef.current = nextSeedSnapshot;

    const init = DAYS.some((d) => {
      const s = (oh ?? {})[`${d}_slot2_start`];
      const e = (oh ?? {})[`${d}_slot2_end`];
      return typeof s === "string" && s.trim() !== "" && typeof e === "string" && e.trim() !== "";
    });

    // If there are local edits (dirty) or we're saving, do not clobber the form.
    // The next successful save will refetch and re-seed when safe.
    const currentlyDirty =
      initialRef.current == null
        ? false
        : initialRef.current.enableSlot2 !== enableSlot2 ||
          initialRef.current.snapshot !== buildSnapshot(enableSlot2);
    if (saving || currentlyDirty) return;

    setForm({ ...(oh ?? {}) });
    setEnableSlot2(init);
    initialRef.current = { enableSlot2: init, snapshot: nextSeedSnapshot };
  }, [storeId, oh]); // eslint-disable-line react-hooks/exhaustive-deps

  const toTimeOrNull = (v: string): string | null => {
    const t = v.trim();
    return t ? t.slice(0, 5) : null;
  };

  const setDay = (day: (typeof DAYS)[number], key: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [`${day}_${key}`]: value }));
  };

  const closedDays = DAYS.filter((d) => !form[`${d}_open`]) as string[];

  const buildSnapshot = (nextEnableSlot2: boolean): string => {
    const snapObj: Record<string, unknown> = {
      same_for_all_days: !!form.same_for_all_days,
      is_24_hours: !!form.is_24_hours,
      closed_days: closedDays,
    };
    for (const d of DAYS) {
      const open = !!form[`${d}_open`];
      snapObj[`${d}_open`] = open;
      snapObj[`${d}_slot1_start`] = open ? ((form[`${d}_slot1_start`] as string | null) ?? null) : null;
      snapObj[`${d}_slot1_end`] = open ? ((form[`${d}_slot1_end`] as string | null) ?? null) : null;
      snapObj[`${d}_slot2_start`] =
        nextEnableSlot2 && open ? ((form[`${d}_slot2_start`] as string | null) ?? null) : null;
      snapObj[`${d}_slot2_end`] =
        nextEnableSlot2 && open ? ((form[`${d}_slot2_end`] as string | null) ?? null) : null;
    }
    return JSON.stringify(snapObj);
  };

  const dirty =
    initialRef.current == null
      ? false
      : initialRef.current.enableSlot2 !== enableSlot2 ||
        initialRef.current.snapshot !== buildSnapshot(enableSlot2);

  const save = async () => {
    if (!Number.isFinite(storeId)) return;
    if (!dirty) return;
    setSaving(true);
    const minSpinnerMs = 500;
    const startedAt = Date.now();
    try {
      const payload: Record<string, unknown> = {
        same_for_all_days: !!form.same_for_all_days,
        is_24_hours: !!form.is_24_hours,
        closed_days: closedDays,
      };

      for (const d of DAYS) {
        const open = !!form[`${d}_open`];
        const s1Start = open ? (form[`${d}_slot1_start`] as string | null) : null;
        const s1End = open ? (form[`${d}_slot1_end`] as string | null) : null;
        const s2Start =
          enableSlot2 && open ? ((form[`${d}_slot2_start`] as string | null) ?? null) : null;
        const s2End =
          enableSlot2 && open ? ((form[`${d}_slot2_end`] as string | null) ?? null) : null;

        payload[`${d}_open`] = open;
        payload[`${d}_slot1_start`] = s1Start ?? null;
        payload[`${d}_slot1_end`] = s1End ?? null;
        payload[`${d}_slot2_start`] = s2Start ?? null;
        payload[`${d}_slot2_end`] = s2End ?? null;
      }

      const res = await fetch(`/api/merchant/stores/${storeId}/operating-hours`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        toast.error(typeof data?.error === "string" ? data.error : "Failed to save timings");
        return;
      }
      toast.success("Timings saved");
      onSaved?.();
      initialRef.current = { enableSlot2, snapshot: buildSnapshot(enableSlot2) };
    } catch {
      toast.error("Failed to save timings");
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < minSpinnerMs) {
        await new Promise((r) => setTimeout(r, minSpinnerMs - elapsed));
      }
      setSaving(false);
    }
  };

  if (!oh) {
    return (
      <div className="rounded border border-gray-200 bg-white p-3">
        <p className="text-xs text-gray-500">No operating hours data.</p>
      </div>
    );
  }

  // If store is in 24h mode, keep UI minimal.
  if (form.is_24_hours) {
    return <OperatingHoursBlock oh={oh} />;
  }

  return (
    <div className="rounded border border-gray-200 bg-white p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase text-gray-500">Store timings editor</p>
        <label className="inline-flex cursor-pointer items-center gap-2 text-[10px] text-gray-700">
          <input
            type="checkbox"
            checked={enableSlot2}
            onChange={(e) => setEnableSlot2(e.target.checked)}
            className="sr-only"
          />
          <span
            className={`relative h-4 w-8 rounded-full transition-colors ${
              enableSlot2 ? "bg-indigo-600" : "bg-gray-200"
            }`}
          >
            <span
              className={`absolute left-0 top-0 h-3 w-3 rounded-full bg-white transition-transform ${
                enableSlot2 ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </span>
          Slot 2
        </label>
      </div>

      <div className="mt-2 space-y-1">
        {DAYS.map((d) => {
          const open = !!form[`${d}_open`];
          const s1Start = (form[`${d}_slot1_start`] as string | null) ?? "";
          const s1End = (form[`${d}_slot1_end`] as string | null) ?? "";
          const s2Start = (form[`${d}_slot2_start`] as string | null) ?? "";
          const s2End = (form[`${d}_slot2_end`] as string | null) ?? "";
          return (
            <div key={d} className="grid grid-cols-12 items-center gap-2 rounded border border-gray-100 px-2 py-1">
              <div className="col-span-2 text-[10px] font-medium text-gray-600">{d.slice(0, 3)}</div>
              <label className="col-span-2 inline-flex items-center gap-2 text-[10px] text-gray-700">
                <input
                  type="checkbox"
                  checked={open}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, [`${d}_open`]: e.target.checked }));
                  }}
                  className="sr-only"
                />
                <span
                  className={`relative h-4 w-8 rounded-full transition-colors ${
                    open ? "bg-indigo-600" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`absolute left-0 top-0 h-3 w-3 rounded-full bg-white transition-transform ${
                      open ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </span>
                {open ? "Open" : "Close"}
              </label>

              <div className="col-span-4 flex items-center gap-1">
                <input
                  type="time"
                  disabled={!open}
                  value={s1Start}
                  onChange={(e) => setDay(d, "slot1_start", toTimeOrNull(e.target.value))}
                  className="w-full rounded border border-gray-200 px-1 py-0.5 text-[10px] focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50"
                />
                <span className="text-[10px] text-gray-400">-</span>
                <input
                  type="time"
                  disabled={!open}
                  value={s1End}
                  onChange={(e) => setDay(d, "slot1_end", toTimeOrNull(e.target.value))}
                  className="w-full rounded border border-gray-200 px-1 py-0.5 text-[10px] focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50"
                />
              </div>

              {enableSlot2 ? (
                <div className="col-span-4 flex items-center gap-1">
                  <input
                    type="time"
                    disabled={!open}
                    value={s2Start}
                    onChange={(e) => setDay(d, "slot2_start", toTimeOrNull(e.target.value))}
                    className="w-full rounded border border-gray-200 px-1 py-0.5 text-[10px] focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50"
                  />
                  <span className="text-[10px] text-gray-400">-</span>
                  <input
                    type="time"
                    disabled={!open}
                    value={s2End}
                    onChange={(e) => setDay(d, "slot2_end", toTimeOrNull(e.target.value))}
                    className="w-full rounded border border-gray-200 px-1 py-0.5 text-[10px] focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50"
                  />
                </div>
              ) : (
                <div className="col-span-4 text-[10px] text-gray-400">Slot 2 off</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            setForm({ ...(oh ?? {}) });
            const init = DAYS.some((d) => {
              const s = (oh ?? {})[`${d}_slot2_start`];
              const e = (oh ?? {})[`${d}_slot2_end`];
              return typeof s === "string" && s.trim() !== "" && typeof e === "string" && e.trim() !== "";
            });
            setEnableSlot2(init);
          }}
          className="inline-flex cursor-pointer items-center rounded border border-gray-300 bg-white px-3 py-1 text-[10px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving || !dirty}
          onClick={() => void save()}
          className={`inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1 text-[10px] font-medium text-white hover:bg-indigo-700 disabled:opacity-100 disabled:cursor-not-allowed ${
            !dirty && !saving ? "opacity-50" : ""
          }`}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {saving ? "Saving..." : "Save timings"}
        </button>
      </div>
    </div>
  );
}

function StepDetailContent({
  stepNum,
  store,
  documents,
  menuFiles,
  menuReviewStoreId,
  menuReviewInteractive,
  onMenuMediaUpdated,
  operatingHours,
  onboardingPayments,
  agreementAcceptance,
  bankAccounts,
  bankAccountsStoreId,
}: {
  stepNum: number;
  store: VerificationDataStore;
  documents: Record<string, unknown> | null;
  menuFiles?: MenuMediaFile[];
  menuReviewStoreId?: number;
  menuReviewInteractive?: boolean;
  onMenuMediaUpdated?: () => void;
  operatingHours?: Record<string, unknown> | null;
  onboardingPayments?: Record<string, unknown>[];
  agreementAcceptance?: Record<string, unknown> | null;
  bankAccounts?: Record<string, unknown>[] | null;
  bankAccountsStoreId?: number;
}) {
  const row = (label: string, value: React.ReactNode) => (
    <div key={label} className="flex gap-2 py-0.5 text-xs">
      <span className="w-36 shrink-0 font-medium text-gray-500">{label}</span>
      <span className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-gray-900">{value ?? "—"}</span>
    </div>
  );

  if (stepNum === 1) {
    const bannerUrl = store.banner_url as string | null | undefined;
    const gallery = normalizeGalleryImages(store.gallery_images);
    return (
      <div className="mt-2 border-t border-gray-200 pt-2">
        <p className="mb-2 text-[10px] font-semibold uppercase text-gray-500">Restaurant information</p>
        <div className="grid grid-cols-1 gap-x-5 gap-y-0 sm:grid-cols-2">
          {row("Store name", store.store_name)}
          {row("Display name", store.store_display_name)}
          {row("Store type", store.store_type)}
          {row("Email", store.store_email)}
        </div>
        {row("Description", store.store_description)}
        {row("Phones", Array.isArray(store.store_phones) ? store.store_phones.join(", ") : null)}
        <div className="mt-3 border-t border-gray-100 pt-3">
          <p className="mb-2 text-[10px] font-semibold uppercase text-gray-500">Banner & gallery</p>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[10px] font-medium text-gray-500">Banner</p>
              {bannerUrl ? (
                <R2Image
                  src={bannerUrl}
                  alt="Store banner"
                  className="max-h-36 w-full max-w-md rounded-lg border border-gray-200 object-cover"
                />
              ) : (
                <p className="text-[11px] text-gray-400">No banner uploaded</p>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[10px] font-medium text-gray-500">Gallery</p>
              {gallery.length > 0 ? (
                <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto">
                  {gallery.map((url, i) => (
                    <R2Image
                      key={`${i}-${url.slice(0, 48)}`}
                      src={url}
                      alt={`Gallery ${i + 1}`}
                      className="h-16 w-16 shrink-0 rounded border border-gray-200 object-cover sm:h-20 sm:w-20"
                    />
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-gray-400">No gallery images</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (stepNum === 2) {
    return (
      <div className="mt-2 border-t border-gray-200 pt-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">Location details</p>
        <div className="grid grid-cols-1 gap-x-5 gap-y-0 sm:grid-cols-2">
          <div className="sm:col-span-2">{row("Full address", store.full_address)}</div>
          {row("Landmark", store.landmark)}
          {row("City", store.city)}
          {row("State", store.state)}
          {row("Postal code", store.postal_code)}
          {row("Country", store.country)}
          {row("Latitude", store.latitude != null ? String(store.latitude) : null)}
          {row("Longitude", store.longitude != null ? String(store.longitude) : null)}
        </div>
      </div>
    );
  }
  if (stepNum === 3) {
    return (
      <div className="mt-2 border-t border-gray-200 pt-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">Menu setup</p>
        {row("Cuisine types", Array.isArray(store.cuisine_types) ? store.cuisine_types.join(", ") : null)}
        {menuFiles && menuFiles.length > 0 && menuReviewStoreId != null && (
          <MenuReferenceReviewBlock
            storeId={menuReviewStoreId}
            files={menuFiles}
            onUpdated={onMenuMediaUpdated}
            interactive={!!menuReviewInteractive}
          />
        )}
        <p className="mt-1 text-[10px] text-gray-500">Menu items are managed in the store dashboard.</p>
      </div>
    );
  }
  if (stepNum === 4) {
    const doc = documents || {};
    const docRec = doc as Record<string, unknown>;
    type RoStep4Entry = { row: Step4DocRow; aadhaarSide?: "front" | "back" };
    const dynamicEntries: RoStep4Entry[] = [];
    for (const e of STEP4_DOCUMENT_ROWS) {
      const hasNumber = doc[e.numberKey] != null && String(doc[e.numberKey]).trim() !== "";
      const frontUrl = String(doc[e.urlKey] ?? "").trim();
      const hasFrontUrl = !!frontUrl;
      const hasBackUrl = e.docType === "aadhaar" ? !!getAadhaarBackUrl(docRec) : false;
      if (e.docType === "aadhaar") {
        if (hasNumber || hasFrontUrl) dynamicEntries.push({ row: e, aadhaarSide: "front" });
        if (hasBackUrl) dynamicEntries.push({ row: e, aadhaarSide: "back" });
        continue;
      }
      if (hasNumber || hasFrontUrl) dynamicEntries.push({ row: e });
    }
    return (
      <div className="mt-2 border-t border-gray-200 pt-2">
        <p className="mb-1 text-[10px] font-semibold uppercase text-gray-500">Restaurant documents</p>
        {dynamicEntries.length === 0 ? (
          <p className="py-1 text-xs text-gray-500">No document records for this store.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {dynamicEntries.map((item) => {
              const e = item.row;
              const isAadhaarBack = e.docType === "aadhaar" && item.aadhaarSide === "back";
              const key = `${e.numberKey}${item.aadhaarSide ? `-${item.aadhaarSide}` : ""}`;
              const listLabel = isAadhaarBack ? "Aadhaar (back)" : e.listLabel;
              const fileHref = isAadhaarBack ? getAadhaarBackUrl(docRec) : (doc[e.urlKey] as string) || "";
              return (
                <div key={key} className="flex flex-col gap-1 border-b border-gray-100 py-1 last:border-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex min-w-0 flex-1 gap-2 text-xs">
                      <span className="w-28 shrink-0 font-medium text-gray-500">{listLabel}</span>
                      <span className="text-gray-900">{(doc[e.numberKey] as string) ?? "—"}</span>
                      {!isAadhaarBack && !!doc[e.verifiedKey] && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-medium text-emerald-800">
                          Verified
                        </span>
                      )}
                      {!isAadhaarBack &&
                        !!doc[e.rejectionKey] &&
                        rejectionRequiresNewFileUpload(rejectionDetailForDocType(doc.step4_rejection_details, e.docType)) &&
                        step4DocResubmitted(doc.step4_resubmission_flags, e.docType) && (
                          <span className="inline-flex shrink-0 items-center rounded bg-sky-100 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-900">
                            Resubmitted
                          </span>
                        )}
                    </div>
                    {fileHref ? (
                      <a
                        href={fileHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-0.5 rounded bg-indigo-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-indigo-700"
                      >
                        <ExternalLink className="h-2.5 w-2.5" />
                        Open
                      </a>
                    ) : null}
                  </div>
                  {e.docType === "fssai" && !!doc.fssai_expiry_date && (
                    <div className="flex gap-2 py-0.5 text-xs">
                      <span className="w-28 shrink-0 font-medium text-gray-500">FSSAI expiry</span>
                      <span className="text-gray-900">
                        {new Date(doc.fssai_expiry_date as string).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {!isAadhaarBack && !!doc[e.rejectionKey] && (
                    <div className="ml-[7.5rem] min-w-0 rounded border border-red-100 bg-red-50/40 px-2 py-1.5">
                      <p className="text-[10px] font-semibold text-red-900">What was rejected</p>
                      <Step4RejectionBreakdown detailsRoot={doc.step4_rejection_details} docType={e.docType} />
                      <p className="mt-1 text-[10px] text-red-800/90">
                        {(doc[e.rejectionKey] as string) ?? ""}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
  if (stepNum === 5) {
    return (
      <div className="mt-2 border-t border-gray-200 pt-2 space-y-2">
        <p className="text-[10px] font-semibold uppercase text-gray-500">Operational details</p>

        {/* Compact grid (up to 3 items per row on large screens). */}
        <div className="grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
          <div>{row("Banner", store.banner_url ? "Uploaded" : null)}</div>
          <div>{row("Min order (₹)", store.min_order_amount != null ? String(store.min_order_amount) : null)}</div>
          <div>
            {row(
              "Delivery radius (km)",
              store.delivery_radius_km != null ? String(store.delivery_radius_km) : null
            )}
          </div>
          <div>{row("Avg prep (min)", store.avg_preparation_time_minutes != null ? String(store.avg_preparation_time_minutes) : null)}</div>
          <div>{row("Pure veg", store.is_pure_veg != null ? (store.is_pure_veg ? "Yes" : "No") : null)}</div>
          <div>{row("Online payment", store.accepts_online_payment != null ? (store.accepts_online_payment ? "Yes" : "No") : null)}</div>
          <div>{row("Accepts cash", store.accepts_cash != null ? (store.accepts_cash ? "Yes" : "No") : null)}</div>
        </div>

        <div className="border-t border-gray-100 pt-2">
          <p className="mb-1 text-[10px] font-semibold uppercase text-gray-500">Store timings</p>
          <OperatingHoursBlock oh={operatingHours ?? null} />
        </div>
      </div>
    );
  }
  if (stepNum === 6) {
    return (
      <div className="mt-2 border-t border-gray-200 pt-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">Bank account — payout details</p>
        <BankAccountsVerificationPanel accounts={bankAccounts} compact storeId={bankAccountsStoreId} />
      </div>
    );
  }
  if (stepNum === 7) {
    const payments = onboardingPayments ?? [];
    const statusBadge = (status: string) => {
      const s = (status || "").toLowerCase();
      const green = s === "captured" || s === "authorized";
      const red = s === "failed" || s === "cancelled" || s === "refunded";
      const cls = green ? "bg-emerald-100 text-emerald-800" : red ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800";
      return <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{status}</span>;
    };
    return (
      <div className="mt-2 border-t border-gray-200 pt-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">Commission plan — verify payment</p>
        {payments.length === 0 ? (
          <p className="text-xs text-gray-600">No payment record for this store.</p>
        ) : (
          <div className="space-y-3">
            {payments.map((p, i) => {
              const id = (p.id as number) ?? i;
              const amountPaise = (p.amount_paise as number) ?? 0;
              const planName = (p.plan_name as string) ?? "—";
              const status = (p.status as string) ?? "—";
              const createdAt = (p.created_at as string) ?? "—";
              const capturedAt = (p.captured_at as string) ?? null;
              const failedAt = (p.failed_at as string) ?? null;
              const failureReason = (p.failure_reason as string) ?? null;
              const razorpayOrderId = (p.razorpay_order_id as string) ?? null;
              const razorpayPaymentId = (p.razorpay_payment_id as string) ?? null;
              const payerName = (p.payer_name as string) ?? null;
              const payerEmail = (p.payer_email as string) ?? null;
              const payerPhone = (p.payer_phone as string) ?? null;
              const standardPaise = (p.standard_amount_paise as number) ?? null;
              const promoPaise = (p.promo_amount_paise as number) ?? null;
              const promoLabel = (p.promo_label as string) ?? null;
              const money = `${(amountPaise / 100).toFixed(2)} ${(p.currency as string) ?? "INR"}`;
              return (
                <div
                  key={id}
                  className="rounded-lg border border-gray-200 bg-white p-3 text-xs shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-[10rem]">
                      <div className="text-xs font-semibold text-gray-800">Payment #{id}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {statusBadge(status)}
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                          Created: {typeof createdAt === "string" ? createdAt : "—"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Keep at least 2 content boxes per row */}
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                      <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Plan</div>
                      <div className="mt-0.5 text-xs font-medium text-gray-900">{planName}</div>
                    </div>
                    <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                      <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Amount</div>
                      <div className="mt-0.5 text-xs font-medium text-gray-900">{money}</div>
                    </div>
                    {standardPaise != null && (
                      <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                          Standard (paise)
                        </div>
                        <div className="mt-0.5 text-xs font-medium text-gray-900">{String(standardPaise)}</div>
                      </div>
                    )}
                    {promoPaise != null && (
                      <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Promo (paise)</div>
                        <div className="mt-0.5 text-xs font-medium text-gray-900">
                          {promoLabel ? `${promoPaise} (${promoLabel})` : String(promoPaise)}
                        </div>
                      </div>
                    )}

                    {capturedAt && (
                      <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Captured</div>
                        <div className="mt-0.5 text-xs font-medium text-gray-900">{capturedAt}</div>
                      </div>
                    )}
                    {failedAt && (
                      <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Failed</div>
                        <div className="mt-0.5 text-xs font-medium text-gray-900">{failedAt}</div>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-2">
                    {razorpayOrderId && (
                      <div className="rounded border border-gray-100 bg-white px-2 py-1.5">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                          Razorpay order id
                        </div>
                        <div className="mt-0.5 break-all text-[11px] font-medium text-gray-900">{razorpayOrderId}</div>
                      </div>
                    )}
                    {razorpayPaymentId && (
                      <div className="rounded border border-gray-100 bg-white px-2 py-1.5">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                          Razorpay payment id
                        </div>
                        <div className="mt-0.5 break-all text-[11px] font-medium text-gray-900">{razorpayPaymentId}</div>
                      </div>
                    )}
                    {(payerName || payerEmail || payerPhone) && (
                      <div className="rounded border border-gray-100 bg-white px-2 py-1.5">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Payer</div>
                        <div className="mt-0.5 text-xs text-gray-900">
                          {[payerName, payerEmail, payerPhone].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    )}
                    {failureReason && (
                      <div className="rounded border border-red-100 bg-red-50 px-2 py-1.5">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-red-800">
                          Failure reason
                        </div>
                        <div className="mt-0.5 text-xs text-red-900">{failureReason}</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
  if (stepNum === 8) {
    const agg = agreementAcceptance ?? null;
    return (
      <div className="mt-2 border-t border-gray-200 pt-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">Sign & submit — verify agreement & signature</p>
        {!agg ? (
          <p className="text-xs text-gray-600">No agreement record for this store.</p>
        ) : (
          <div className="text-xs">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {(agg.contract_pdf_url as string) && (
                <a
                  href={agg.contract_pdf_url as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded border border-indigo-600 bg-indigo-50 px-2.5 py-1.5 font-medium text-indigo-700 hover:bg-indigo-100"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open contract PDF
                </a>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Signer name</div>
                <div className="mt-0.5 text-xs font-medium text-gray-900">{(agg.signer_name as string) || "—"}</div>
              </div>
              <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Signer phone</div>
                <div className="mt-0.5 text-xs font-medium text-gray-900">{(agg.signer_phone as string) || "—"}</div>
              </div>
              <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5 col-span-2">
                <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Signer email</div>
                <div className="mt-0.5 break-all text-xs font-medium text-gray-900">{(agg.signer_email as string) || "—"}</div>
              </div>

              <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Accepted at</div>
                <div className="mt-0.5 text-xs font-medium text-gray-900">
                  {typeof agg.accepted_at === "string" ? agg.accepted_at : "—"}
                </div>
              </div>
              <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Terms accepted</div>
                <div className="mt-0.5 text-xs font-medium text-gray-900">{agg.terms_accepted === true ? "Yes" : "No"}</div>
              </div>
              <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Contract read</div>
                <div className="mt-0.5 text-xs font-medium text-gray-900">
                  {agg.contract_read_confirmed === true ? "Yes" : "No"}
                </div>
              </div>
              <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Commission</div>
                <div className="mt-0.5 text-xs font-medium text-gray-900">
                  {(agg.commission_first_month_pct != null ? `${String(agg.commission_first_month_pct)}% (1st)` : "—")}
                  {agg.commission_from_second_month_pct != null ? ` · ${String(agg.commission_from_second_month_pct)}% (2nd+)` : ""}
                </div>
              </div>
              {agg.agreement_effective_from != null && (
                <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Effective from</div>
                  <div className="mt-0.5 text-xs font-medium text-gray-900">
                    {typeof agg.agreement_effective_from === "string" ? agg.agreement_effective_from : "—"}
                  </div>
                </div>
              )}
              {agg.agreement_effective_to != null && (
                <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Effective to</div>
                  <div className="mt-0.5 text-xs font-medium text-gray-900">
                    {typeof agg.agreement_effective_to === "string" ? agg.agreement_effective_to : "—"}
                  </div>
                </div>
              )}

              {(agg.signature_data_url as string) && (
                  <div className="col-span-2 mx-auto max-w-[280px] rounded border border-gray-100 bg-white px-2 py-1.5 overflow-hidden">
                    <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-gray-500">Signature</div>
                    <img
                      src={agg.signature_data_url as string}
                      alt="Signature"
                      className="mx-auto block h-16 w-auto max-w-[260px] rounded border border-gray-200 bg-white object-contain"
                    />
                  </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
  return null;
}

/** Single field row: read-only value + Edit button, or (when editing) input + Save button. */
function FieldWithEditSave({
  fieldKey,
  label,
  displayValue,
  isEditing,
  onStartEdit,
  onSave,
  saving,
  editNode,
  variant = "default",
}: {
  fieldKey: string;
  label: string;
  displayValue: React.ReactNode;
  isEditing: boolean;
  onStartEdit: () => void;
  onSave: () => void | Promise<void>;
  saving: boolean;
  editNode: React.ReactNode;
  /** `row`: label and value on one line (compact grids). `document`: full-width ID numbers (step 4). */
  variant?: "default" | "row" | "document";
}) {
  const displayStr =
    displayValue == null || displayValue === ""
      ? "—"
      : typeof displayValue === "string" || typeof displayValue === "number"
        ? String(displayValue)
        : null;
  const actions = isEditing ? (
    <>
      <div className="min-w-0 flex-1">{editNode}</div>
      <button
        type="button"
        onClick={() => void onSave()}
        disabled={saving}
        className="inline-flex cursor-pointer shrink-0 items-center gap-1 rounded border border-indigo-600 bg-indigo-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        Save
      </button>
    </>
  ) : (
    <>
      <span className="min-w-0 flex-1 break-all text-gray-900" title={displayStr ?? undefined}>
        {displayValue ?? "—"}
      </span>
      <button
        type="button"
        onClick={onStartEdit}
        className="inline-flex cursor-pointer shrink-0 items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </button>
    </>
  );

  if (variant === "document") {
    return (
      <div key={fieldKey} className="rounded-lg border border-gray-100 bg-white/90 px-2.5 py-2 text-xs">
        <div className="mb-1.5 flex items-start justify-between gap-2">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</label>
          {!isEditing ? (
            <button
              type="button"
              onClick={onStartEdit}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-[10px] font-medium text-gray-700 hover:bg-gray-50"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </button>
          ) : null}
        </div>
        {isEditing ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">{editNode}</div>
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={saving}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded border border-indigo-600 bg-indigo-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </button>
          </div>
        ) : (
          <p
            className="break-all font-mono text-sm font-medium leading-snug tracking-tight text-gray-900"
            title={displayStr ?? undefined}
          >
            {displayStr ?? displayValue ?? "—"}
          </p>
        )}
      </div>
    );
  }

  if (variant === "row") {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 py-1 text-xs">
        <span className="w-[6.75rem] shrink-0 font-medium text-gray-500">{label}</span>
        <div className="flex min-w-0 min-h-[1.75rem] flex-1 flex-wrap items-center gap-2">{actions}</div>
      </div>
    );
  }

  return (
    <div key={fieldKey} className="flex flex-col gap-1 py-1.5 text-xs">
      <label className="font-medium text-gray-500">{label}</label>
      <div className="flex flex-wrap items-start gap-2">{actions}</div>
    </div>
  );
}

function newLocalPreviewId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `pv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function profileMediaProxyFromResponse(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (typeof o.proxyUrl === "string" && o.proxyUrl.trim()) return o.proxyUrl.trim();
  if (typeof o.url === "string" && o.url.trim()) return o.url.trim();
  return null;
}

type GallerySlot =
  | { kind: "empty"; slotIndex: number }
  | { kind: "starting"; slotIndex: number }
  | { kind: "image"; slotIndex: number; url: string }
  | { kind: "pending"; slotIndex: number; id: string; blobUrl: string };

/** Fixed N slots: saved images first, then in-flight previews, then clean empties (optionally first empty shows spinner while upload kicks in). */
function buildGallerySlots(
  maxSlots: number,
  urls: string[],
  pending: { id: string; url: string; slotIndex: number }[],
  uploading: boolean
): GallerySlot[] {
  const out: GallerySlot[] = [];
  const pendingBySlot = new Map<number, { id: string; url: string }>();
  for (const p of pending) {
    if (typeof p?.slotIndex === "number" && p.slotIndex >= 0 && p.slotIndex < maxSlots) {
      pendingBySlot.set(p.slotIndex, { id: p.id, url: p.url });
    }
  }
  for (let i = 0; i < maxSlots; i++) {
    if (i < urls.length) {
      out.push({ kind: "image", slotIndex: i, url: urls[i] });
      continue;
    }
    const p = pendingBySlot.get(i);
    if (p) {
      out.push({ kind: "pending", slotIndex: i, id: p.id, blobUrl: p.url });
      continue;
    }
    if (uploading && i === urls.length && pending.length === 0) {
      out.push({ kind: "starting", slotIndex: i });
      continue;
    }
    out.push({ kind: "empty", slotIndex: i });
  }
  return out;
}

function Step1ProfileMediaSection({
  bannerUrl,
  galleryUrls,
  storeId,
  canEdit,
  onServerSynced,
  onProfileMediaSaved,
}: {
  bannerUrl: string | null | undefined;
  galleryUrls: string[];
  storeId: number;
  canEdit: boolean;
  onServerSynced: () => void;
  /** Merges proxy URL into step form immediately so the UI updates without waiting for refetch (no full page reload). */
  onProfileMediaSaved?: (payload: { kind: "banner"; proxyUrl: string } | { kind: "gallery"; proxyUrl: string }) => void;
}) {
  const [lightbox, setLightbox] = useState<{
    kind: "banner" | "gallery";
    url: string;
  } | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState<{
    kind: "banner" | "gallery";
    url: string;
  } | null>(null);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerLocalPreview, setBannerLocalPreview] = useState<string | null>(null);
  /** Single state so uploading + pending thumbs commit together under flushSync (gallery loader was missing otherwise). */
  const [galleryUploadUi, setGalleryUploadUi] = useState<{
    uploading: boolean;
    pending: { id: string; url: string; slotIndex: number }[];
  }>({ uploading: false, pending: [] });
  const [galleryStagedBySlot, setGalleryStagedBySlot] = useState<
    Record<number, { file: File; blobUrl: string }>
  >({});
  const [localGalleryUrls, setLocalGalleryUrls] = useState<string[]>(() =>
    Array.isArray(galleryUrls) ? [...galleryUrls] : []
  );
  const galleryPending = galleryUploadUi.pending;
  const galleryUploading = galleryUploadUi.uploading;
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const lightboxGalleryAddRef = useRef<HTMLInputElement>(null);
  const lightboxBannerReplaceRef = useRef<HTMLInputElement>(null);
  const galleryPickSlotRef = useRef<number | null>(null);
  const maxG = maxGalleryImages();

  useEffect(() => {
    // Keep local gallery in sync when store changes / refetch completes.
    setLocalGalleryUrls(Array.isArray(galleryUrls) ? [...galleryUrls] : []);
  }, [storeId, galleryUrls]);

  const effectiveGalleryUrls = localGalleryUrls;
  const gallerySlotsUsed = effectiveGalleryUrls.length + galleryPending.length;
  /** Show gallery add control when there is room; disable interactions while a batch is uploading. */
  const galleryAddEligible = canEdit && gallerySlotsUsed < maxG;
  const bannerInteractDisabled = !canEdit || bannerUploading || removeBusy;

  const open = (kind: "banner" | "gallery", url: string) => setLightbox({ kind, url });
  const close = () => setLightbox(null);

  const openRemoveConfirm = (kind: "banner" | "gallery", url: string) => {
    if (!canEdit) return;
    setRemoveConfirm({ kind, url });
  };

  const handleConfirmRemove = async () => {
    if (!removeConfirm) return;
    const url = removeConfirm.url;
    const k = profileMediaR2KeyFromUrl(url);
    if (!k) {
      toast.error("Cannot resolve storage key for this image.");
      setRemoveConfirm(null);
      return;
    }
    setRemoveBusy(true);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/profile-media/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ key: k }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        toast.error(typeof data.error === "string" ? data.error : "Remove failed");
        return;
      }
      toast.success("Removed from store and cloud storage");
      setLightbox((prev) => (prev?.url === url ? null : prev));
      setRemoveConfirm(null);
      setLocalGalleryUrls((prev) => prev.filter((x) => x !== url));
      onServerSynced();
    } finally {
      setRemoveBusy(false);
    }
  };

  const postProfileMedia = async (file: File, type: "banner" | "gallery", index: number) => {
    galleryProfileMediaDebug("postProfileMedia start", {
      storeId,
      type,
      index,
      name: file.name,
      size: file.size,
      mime: file.type,
    });
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", type);
    if (type === "gallery") formData.append("index", String(index));
    formData.append("apply_to_store", "true");
    const res = await fetch(`/api/merchant/stores/${storeId}/profile-media`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
      success?: boolean;
      error?: string;
      code?: string;
    };
    galleryProfileMediaDebug("postProfileMedia response", {
      status: res.status,
      ok: res.ok,
      success: data.success,
      error: data.error,
      code: data.code,
    });
    if (!res.ok || !data.success) {
      throw new Error(typeof data.error === "string" ? data.error : "Upload failed");
    }
    return data;
  };

  /** Schedule network work after paint so flushSync thumbnail/spinner commits before fetch. */
  const scheduleUploadWork = (fn: () => void) => {
    if (typeof window === "undefined") {
      fn();
      return;
    }
    window.setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(fn);
      });
    }, 0);
  };

  useEffect(() => {
    if (!removeConfirm) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && !removeBusy) setRemoveConfirm(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [removeConfirm, removeBusy]);

  useEffect(() => {
    galleryProfileMediaDebug("Step1ProfileMediaSection props", {
      storeId,
      canEdit,
      galleryUrlsLen: effectiveGalleryUrls.length,
      galleryPendingLen: galleryPending.length,
      galleryUploading,
      galleryAddEligible,
      maxG,
    });
  }, [storeId, canEdit, effectiveGalleryUrls.length, galleryPending.length, galleryUploading, galleryAddEligible, maxG]);

  const startBannerFileUpload = (file: File) => {
    if (!canEdit || bannerUploading) return;
    const localUrl = URL.createObjectURL(file);
    flushSync(() => {
      setBannerLocalPreview(localUrl);
      setBannerUploading(true);
    });
    scheduleUploadWork(() => {
      void (async () => {
        try {
          const data = await postProfileMedia(file, "banner", 0);
          const proxyUrl = profileMediaProxyFromResponse(data);
          if (proxyUrl) onProfileMediaSaved?.({ kind: "banner", proxyUrl });
          toast.success("Banner saved");
          close();
          onServerSynced();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Upload failed");
        } finally {
          URL.revokeObjectURL(localUrl);
          setBannerLocalPreview(null);
          setBannerUploading(false);
        }
      })();
    });
  };

  const computeAvailableGallerySlots = () => {
    const used = new Set<number>();
    for (let i = 0; i < effectiveGalleryUrls.length; i++) used.add(i);
    for (const p of galleryPending) used.add(p.slotIndex);
    const available: number[] = [];
    for (let i = 0; i < maxG; i++) if (!used.has(i)) available.push(i);
    return { used, available };
  };

  const uploadSelectedGalleryFiles = async (files: File[]) => {
    if (!files.length) return;
    const { available } = computeAvailableGallerySlots();
    const pendingSlots = available.length;
    if (files.length > pendingSlots) {
      toast.error(
        `Gallery allows at most ${maxG} images. You can add ${Math.max(0, pendingSlots)} more — you selected ${files.length}.`
      );
      return;
    }
    const slotAssignments = available.slice(0, files.length);
    const entries = files.map((file, i) => ({
      id: newLocalPreviewId(),
      file,
      url: URL.createObjectURL(file),
      slotIndex: slotAssignments[i]!,
    }));

    flushSync(() => {
      setGalleryUploadUi((prev) => ({
        uploading: true,
        pending: [...prev.pending, ...entries.map(({ id, url, slotIndex }) => ({ id, url, slotIndex }))],
      }));
    });

    scheduleUploadWork(() => {
      void (async () => {
        try {
          let added = 0;
          for (let i = 0; i < entries.length; i++) {
            const { id, file: f, url, slotIndex } = entries[i];
            try {
              const data = await postProfileMedia(f, "gallery", slotIndex);
              const proxyUrl = profileMediaProxyFromResponse(data);
              if (proxyUrl) {
                onProfileMediaSaved?.({ kind: "gallery", proxyUrl });
                // Optimistic UI update: show uploaded image immediately without page reload/refetch.
                setLocalGalleryUrls((prev) => [...prev, proxyUrl]);
              }
              added += 1;
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Upload failed");
            } finally {
              URL.revokeObjectURL(url);
              setGalleryUploadUi((prev) => ({
                ...prev,
                pending: prev.pending.filter((p) => p.id !== id),
              }));
            }
          }
          if (added === 1) toast.success("Gallery image added");
          else if (added > 1) toast.success(`${added} gallery images added`);
          close();
          if (added > 0) onServerSynced();
        } finally {
          setGalleryUploadUi((prev) => ({ ...prev, uploading: false }));
        }
      })();
    });
  };

  const onGalleryInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    const n = list?.length ?? 0;
    galleryProfileMediaDebug("onGalleryInputChange", {
      fileCount: n,
      galleryUploading,
      canEdit,
      galleryUrlsLen: galleryUrls.length,
      galleryPendingLen: galleryPending.length,
    });
    if (!list?.length) {
      galleryProfileMediaDebug("onGalleryInputChange bail: no files");
      return;
    }
    if (galleryUploading) {
      galleryProfileMediaDebug("onGalleryInputChange bail: galleryUploading");
      toast.error("Gallery upload already in progress. Please wait.");
      return;
    }
    if (!canEdit) {
      galleryProfileMediaDebug("onGalleryInputChange bail: !canEdit");
      toast.error("Gallery is read-only for this store status.");
      return;
    }
    const f = list?.[0];
    if (!f) return;
    const pickSlotRaw =
      galleryPickSlotRef.current ?? (e.target.dataset.pickSlot ? Number(e.target.dataset.pickSlot) : null);
    const pickSlot = typeof pickSlotRaw === "number" && Number.isFinite(pickSlotRaw) ? pickSlotRaw : null;
    galleryPickSlotRef.current = null;
    if (e.target.dataset.pickSlot) delete e.target.dataset.pickSlot;
    // Allow selecting the same file again next time.
    e.target.value = "";
    if (pickSlot == null || pickSlot < 0 || pickSlot >= maxG) {
      toast.error("Please choose a gallery slot first.");
      return;
    }
    const { available } = computeAvailableGallerySlots();
    const stagedExisting = galleryStagedBySlot[pickSlot];
    const canStageHere = available.includes(pickSlot) || stagedExisting != null;
    if (!canStageHere) {
      toast.error("This gallery slot is no longer available. Please choose another slot.");
      return;
    }
    const blobUrl = URL.createObjectURL(f);
    setGalleryStagedBySlot((prev) => {
      const existing = prev[pickSlot];
      if (existing?.blobUrl) URL.revokeObjectURL(existing.blobUrl);
      return { ...prev, [pickSlot]: { file: f, blobUrl } };
    });
  };

  const removableKey = lightbox ? profileMediaR2KeyFromUrl(lightbox.url) : null;
  const displayBannerSrc = bannerLocalPreview || bannerUrl || null;
  const gallerySlots = buildGallerySlots(maxG, effectiveGalleryUrls, galleryPending, galleryUploading);
  const thumbFrame =
    "flex h-16 w-16 shrink-0 items-center justify-center rounded-lg sm:h-20 sm:w-20";
  const canPickGalleryFiles = canEdit && galleryAddEligible && !galleryUploading;
  const galleryInlineInputId = `gm-profile-gallery-inline-${storeId}`;
  const lightboxGalleryInputId = `gm-profile-gallery-lightbox-${storeId}`;

  useEffect(() => {
    return () => {
      for (const k of Object.keys(galleryStagedBySlot)) {
        const idx = Number(k);
        const v = galleryStagedBySlot[idx];
        if (v?.blobUrl) URL.revokeObjectURL(v.blobUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="mt-3 border-t border-gray-100 pt-3">
        <p className="mb-2 text-[10px] font-semibold uppercase text-gray-500">Banner & gallery</p>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-medium text-gray-500">Banner</p>
              {canEdit && (
                <>
                  <input
                    ref={bannerInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) startBannerFileUpload(f);
                    }}
                  />
                  <button
                    type="button"
                    disabled={bannerInteractDisabled}
                    onClick={() => bannerInputRef.current?.click()}
                    className="inline-flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 hover:bg-indigo-100 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {bannerUploading ? (
                      <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
                    ) : (
                      <ImagePlus className="h-3 w-3 shrink-0" />
                    )}
                    {bannerUrl || bannerLocalPreview ? "Replace" : "Add"}
                  </button>
                </>
              )}
            </div>
            {displayBannerSrc ? (
              <div className="relative inline-block max-w-md">
                <button
                  type="button"
                  onClick={() => !bannerUploading && displayBannerSrc && open("banner", displayBannerSrc)}
                  disabled={bannerUploading}
                  className="block cursor-zoom-in rounded-lg border border-gray-200 text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-wait disabled:opacity-90"
                >
                  <R2Image
                    src={displayBannerSrc}
                    alt="Store banner"
                    className="max-h-36 w-full max-w-md rounded-lg object-cover"
                  />
                  {bannerUploading && (
                    <div
                      className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-lg bg-black/45 backdrop-blur-[1px]"
                      aria-live="polite"
                    >
                      <Loader2 className="h-7 w-7 animate-spin text-white" aria-hidden />
                      <span className="px-2 text-center text-[10px] font-medium text-white">Uploading…</span>
                    </div>
                  )}
                </button>
                {canEdit && bannerUrl && profileMediaR2KeyFromUrl(bannerUrl) && (
                  <button
                    type="button"
                    title="Remove banner"
                    disabled={removeBusy || bannerUploading}
                    onClick={(e) => {
                      e.stopPropagation();
                      openRemoveConfirm("banner", bannerUrl);
                    }}
                    className="absolute right-2 top-2 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-red-600 text-white shadow-md hover:bg-red-700 disabled:opacity-50"
                  >
                    <X className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                )}
              </div>
            ) : bannerUploading ? (
              <div className="flex h-28 max-w-md min-w-[11rem] items-center justify-center gap-2 rounded-lg border border-dashed border-indigo-200 bg-indigo-50/70 px-4">
                <Loader2 className="h-7 w-7 shrink-0 animate-spin text-indigo-600" aria-hidden />
                <span className="text-[11px] font-medium text-indigo-900">Uploading banner…</span>
              </div>
            ) : (
              <p className="text-[11px] text-gray-400">No banner uploaded</p>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-medium text-gray-500">Gallery</p>
              <p className="text-[10px] text-gray-400">
                Up to {maxG} images ({maxG - gallerySlotsUsed} left)
              </p>
              {canEdit && (
                <>
                  <input
                    id={galleryInlineInputId}
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    tabIndex={-1}
                    onChange={onGalleryInputChange}
                  />
                </>
              )}
            </div>
            <div
              className="flex max-h-60 flex-wrap items-start gap-2 overflow-y-auto sm:gap-3"
              aria-label="Gallery images, 5 slots"
            >
              {gallerySlots.map((slot) => {
                const staged = slot.kind === "empty" ? galleryStagedBySlot[slot.slotIndex] : undefined;
                if (slot.kind === "image") {
                  const url = slot.url;
                  return (
                    <div
                      key={`gallery-img-${slot.slotIndex}-${url.slice(0, 48)}`}
                      className={`relative ${thumbFrame} overflow-hidden border border-gray-200 bg-white shadow-sm`}
                    >
                      <button
                        type="button"
                        onClick={() => open("gallery", url)}
                        className="absolute inset-0 cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <R2Image src={url} alt={`Gallery ${slot.slotIndex + 1}`} className="h-full w-full object-cover" />
                      </button>
                      {canEdit && profileMediaR2KeyFromUrl(url) && (
                        <button
                          type="button"
                          title="Remove from gallery"
                          disabled={removeBusy || galleryUploading}
                          onClick={(e) => {
                            e.stopPropagation();
                            openRemoveConfirm("gallery", url);
                          }}
                          className="absolute -right-1 -top-1 z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-red-600 text-white shadow-md ring-2 ring-white hover:bg-red-700 disabled:opacity-50"
                        >
                          <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                        </button>
                      )}
                    </div>
                  );
                }
                if (slot.kind === "pending") {
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => open("gallery", slot.blobUrl)}
                      title="Preview uploading image"
                      className={`group relative ${thumbFrame} cursor-zoom-in overflow-hidden border-2 border-indigo-300 bg-gray-50 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                    >
                      <img src={slot.blobUrl} alt="" className="h-full w-full object-cover" />
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-black/50">
                        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-white sm:h-6 sm:w-6" aria-hidden />
                        <span className="text-[9px] font-medium text-white">Upload…</span>
                      </div>
                    </button>
                  );
                }
                if (slot.kind === "starting") {
                  return (
                    <div
                      key={`gallery-starting-${slot.slotIndex}`}
                      className={`${thumbFrame} cursor-wait border-2 border-dashed border-indigo-200 bg-indigo-50/80`}
                      aria-live="polite"
                      aria-busy="true"
                    >
                      <Loader2 className="h-6 w-6 shrink-0 animate-spin text-indigo-600" aria-hidden />
                    </div>
                  );
                }
                return (
                  <div key={`gallery-empty-${slot.slotIndex}`} className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      disabled={!canPickGalleryFiles}
                      onClick={() => {
                        if (!canPickGalleryFiles) return;
                        galleryPickSlotRef.current = slot.slotIndex;
                        if (galleryInputRef.current) {
                          galleryInputRef.current.dataset.pickSlot = String(slot.slotIndex);
                        }
                        galleryInputRef.current?.click();
                      }}
                      title={
                        canPickGalleryFiles
                          ? staged
                            ? "Change image — opens file picker"
                            : "Choose image — opens file picker"
                          : galleryUploading
                            ? "Upload in progress"
                            : "Gallery full or view only"
                      }
                      aria-label={`Choose gallery image, slot ${slot.slotIndex + 1}`}
                      className={`group ${thumbFrame} overflow-hidden border border-dashed border-gray-200 bg-gray-50/80 transition-colors hover:border-indigo-300 hover:bg-indigo-50/60 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-gray-200 disabled:hover:bg-gray-50/80 ${
                        canPickGalleryFiles ? "cursor-pointer" : ""
                      }`}
                    >
                      {staged ? (
                        <img src={staged.blobUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <>
                          <ImagePlus
                            className="h-5 w-5 text-gray-300 transition-opacity group-hover:text-indigo-400 group-hover:opacity-90 group-disabled:opacity-30 sm:h-6 sm:w-6"
                            aria-hidden
                          />
                          <span className="sr-only">Choose image</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={!canPickGalleryFiles || (staged == null && !canPickGalleryFiles)}
                      onClick={() => {
                        if (!canPickGalleryFiles) return;
                        const s = galleryStagedBySlot[slot.slotIndex];
                        if (!s) {
                          galleryPickSlotRef.current = slot.slotIndex;
                          if (galleryInputRef.current) {
                            galleryInputRef.current.dataset.pickSlot = String(slot.slotIndex);
                          }
                          galleryInputRef.current?.click();
                          return;
                        }
                        setGalleryStagedBySlot((prev) => {
                          const next = { ...prev };
                          delete next[slot.slotIndex];
                          return next;
                        });
                        void uploadSelectedGalleryFiles([s.file]);
                      }}
                      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-medium disabled:pointer-events-none disabled:opacity-50 ${
                        staged
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                      }`}
                    >
                      {galleryUploading ? (
                        <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
                      ) : staged ? (
                        <Save className="h-3 w-3 shrink-0" aria-hidden />
                      ) : (
                        <ImagePlus className="h-3 w-3 shrink-0" aria-hidden />
                      )}
                      {staged ? "Save" : "Choose file"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {lightbox != null && (
        <div
          className="fixed inset-0 z-[90] flex flex-col bg-black/95"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
        >
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
            <span className="text-xs font-medium text-white">
              {lightbox.kind === "banner" ? "Banner" : "Gallery"}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id={lightboxGalleryInputId}
                ref={lightboxGalleryAddRef}
                type="file"
                accept="image/*"
                className="hidden"
                tabIndex={-1}
                onChange={onGalleryInputChange}
              />
              <input
                ref={lightboxBannerReplaceRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) startBannerFileUpload(f);
                }}
              />
              {canEdit && lightbox.kind === "gallery" && galleryAddEligible && (
                <button
                  type="button"
                  disabled={galleryUploading}
                  onClick={() => lightboxGalleryAddRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 disabled:opacity-50"
                >
                  {galleryUploading ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                  ) : (
                    <ImagePlus className="h-3.5 w-3.5" />
                  )}
                  Add image
                </button>
              )}
              {canEdit && lightbox.kind === "banner" && (
                <button
                  type="button"
                  disabled={bannerInteractDisabled}
                  onClick={() => lightboxBannerReplaceRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 disabled:opacity-50"
                >
                  {bannerUploading ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                  ) : (
                    <ImagePlus className="h-3.5 w-3.5" />
                  )}
                  Replace banner
                </button>
              )}
              {canEdit && removableKey && (
                <button
                  type="button"
                  disabled={removeBusy}
                  onClick={() => openRemoveConfirm(lightbox.kind, lightbox.url)}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-400/80 bg-red-950/40 px-3 py-1.5 text-xs font-medium text-red-100 hover:bg-red-900/50 disabled:opacity-50"
                >
                  {removeBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                  Remove
                </button>
              )}
              <button
                type="button"
                onClick={close}
                className="inline-flex items-center gap-1 rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
              >
                <X className="h-4 w-4" />
                Close
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-4" onClick={close}>
            <div onClick={(e) => e.stopPropagation()} className="flex max-h-full max-w-full">
              <R2Image
                src={lightbox.url}
                alt=""
                className="max-h-[calc(100vh-5rem)] max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {removeConfirm != null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={() => {
            if (!removeBusy) setRemoveConfirm(null);
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="remove-media-title"
            className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <AlertTriangle className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <h3 id="remove-media-title" className="text-sm font-semibold text-gray-900">
                  Remove this {removeConfirm.kind === "banner" ? "banner" : "gallery"} image?
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-gray-600">
                  This action cannot be undone. The file will be removed from the store record and deleted from cloud
                  storage (R2).
                </p>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    disabled={removeBusy}
                    onClick={() => setRemoveConfirm(null)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={removeBusy}
                    onClick={() => void handleConfirmRemove()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-600 bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {removeBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                    Remove image
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StepDetailContentEditable({
  stepNum,
  form,
  onChange,
  editingField,
  onStartEdit,
  onSaveField,
  savingField,
  adminOverrideMode,
  menuFiles,
  storeIdForUpload,
  onMenuUploadComplete,
  menuReviewInteractive,
  onMenuMediaUpdated,
  storeIdForDocUpload,
  onDocumentsUpdated,
  onDocumentPreview,
  operatingHours,
  onboardingPayments,
  agreementAcceptance,
  bankAccounts,
  storeIdForProfileMedia,
  profileMediaInteractive,
  onProfileMediaUpdated,
  onProfileMediaSaved,
  onOperatingHoursUpdated,
  canPerformVerify = true,
  onStep4DocVerified,
}: {
  stepNum: number;
  form: VerificationDataStore & { documents?: Record<string, unknown> | null };
  onChange: (updates: Partial<VerificationDataStore>) => void;
  editingField: string | null;
  onStartEdit: (fieldKey: string) => void;
  onSaveField: (fieldKey: string) => void | Promise<void>;
  savingField: string | null;
  adminOverrideMode: boolean;
  menuFiles?: MenuMediaFile[];
  storeIdForUpload?: number;
  onMenuUploadComplete?: () => void;
  menuReviewInteractive?: boolean;
  onMenuMediaUpdated?: () => void;
  storeIdForDocUpload?: number;
  onDocumentsUpdated?: (payload?: unknown) => void;
  onDocumentPreview?: (payload: Step4DocPreviewPayload) => void;
  operatingHours?: Record<string, unknown> | null;
  onboardingPayments?: Record<string, unknown>[];
  agreementAcceptance?: Record<string, unknown> | null;
  bankAccounts?: Record<string, unknown>[] | null;
  storeIdForProfileMedia?: number;
  profileMediaInteractive?: boolean;
  onProfileMediaUpdated?: () => void;
  onProfileMediaSaved?: (
    payload: { kind: "banner"; proxyUrl: string } | { kind: "gallery"; proxyUrl: string }
  ) => void;
  onOperatingHoursUpdated?: () => void;
  canPerformVerify?: boolean;
  /** Approved store: per-document verify only (no step/final approval). */
  onStep4DocVerified?: (docType: string, documents: Record<string, unknown>) => void;
}) {
  const set = (key: keyof VerificationDataStore, value: unknown) => {
    onChange({ [key]: value });
  };
  const inputCls =
    "w-full rounded border border-gray-300 px-2 py-1.5 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

  if (stepNum === 1) {
    const fields: Array<{ key: string; label: string; display: React.ReactNode; editNode: React.ReactNode }> = [
      {
        key: "store_name",
        label: "Store name",
        display: form.store_name ?? "",
        editNode: (
          <input
            type="text"
            value={(form.store_name as string) ?? ""}
            onChange={(e) => set("store_name", e.target.value)}
            className={inputCls}
          />
        ),
      },
      {
        key: "store_display_name",
        label: "Display name",
        display: form.store_display_name ?? "",
        editNode: (
          <input
            type="text"
            value={(form.store_display_name as string) ?? ""}
            onChange={(e) => set("store_display_name", e.target.value)}
            className={inputCls}
          />
        ),
      },
      {
        key: "store_description",
        label: "Description",
        display: (form.store_description as string) ? String(form.store_description).slice(0, 80) + (String(form.store_description).length > 80 ? "…" : "") : "—",
        editNode: (
          <textarea
            rows={2}
            value={(form.store_description as string) ?? ""}
            onChange={(e) => set("store_description", e.target.value)}
            className={inputCls}
          />
        ),
      },
      {
        key: "store_type",
        label: "Store type",
        display: form.store_type ?? "",
        editNode: (
          <input
            type="text"
            value={(form.store_type as string) ?? ""}
            onChange={(e) => set("store_type", e.target.value)}
            placeholder="e.g. RESTAURANT"
            className={inputCls}
          />
        ),
      },
      {
        key: "store_email",
        label: "Email",
        display: form.store_email ?? "",
        editNode: (
          <input
            type="text"
            value={(form.store_email as string) ?? ""}
            onChange={(e) => set("store_email", e.target.value)}
            className={inputCls}
          />
        ),
      },
      {
        key: "store_phones",
        label: "Phones",
        display: Array.isArray(form.store_phones) ? form.store_phones.join(", ") : "—",
        editNode: (
          <input
            type="text"
            value={Array.isArray(form.store_phones) ? form.store_phones.join(", ") : ""}
            onChange={(e) => set("store_phones", e.target.value.split(/[\s,]+/).filter(Boolean))}
            className={inputCls}
          />
        ),
      },
    ];
    const bannerUrl = form.banner_url as string | null | undefined;
    const gallery = normalizeGalleryImages(form.gallery_images);
    const compactKeys = new Set(["store_name", "store_display_name", "store_type", "store_email"]);
    return (
      <div className="mt-2 border-t border-gray-200 pt-2">
        <p className="mb-2 text-[10px] font-semibold uppercase text-gray-500">Restaurant information</p>
        <div className="grid grid-cols-1 gap-x-5 gap-y-0 sm:grid-cols-2">
          {fields
            .filter((f) => compactKeys.has(f.key))
            .map((f) => (
              <div key={f.key} className="min-w-0">
                <FieldWithEditSave
                  fieldKey={f.key}
                  label={f.label}
                  displayValue={f.display}
                  isEditing={editingField === f.key}
                  onStartEdit={() => onStartEdit(f.key)}
                  onSave={() => onSaveField(f.key)}
                  saving={savingField === f.key}
                  editNode={f.editNode}
                  variant="row"
                />
              </div>
            ))}
        </div>
        {fields
          .filter((f) => !compactKeys.has(f.key))
          .map((f) => (
            <FieldWithEditSave
              key={f.key}
              fieldKey={f.key}
              label={f.label}
              displayValue={f.display}
              isEditing={editingField === f.key}
              onStartEdit={() => onStartEdit(f.key)}
              onSave={() => onSaveField(f.key)}
              saving={savingField === f.key}
              editNode={f.editNode}
            />
          ))}
        {storeIdForProfileMedia != null ? (
          <Step1ProfileMediaSection
            bannerUrl={bannerUrl}
            galleryUrls={gallery}
            storeId={storeIdForProfileMedia}
            canEdit={!!profileMediaInteractive}
            onServerSynced={onProfileMediaUpdated ?? (() => {})}
            onProfileMediaSaved={onProfileMediaSaved}
          />
        ) : (
          <div className="mt-3 border-t border-gray-100 pt-3">
            <p className="mb-2 text-[10px] font-semibold uppercase text-gray-500">Banner & gallery</p>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-[10px] font-medium text-gray-500">Banner</p>
                {bannerUrl ? (
                  <R2Image
                    src={bannerUrl}
                    alt="Store banner"
                    className="max-h-36 w-full max-w-md rounded-lg border border-gray-200 object-cover"
                  />
                ) : (
                  <p className="text-[11px] text-gray-400">No banner uploaded</p>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-[10px] font-medium text-gray-500">Gallery</p>
                {gallery.length > 0 ? (
                  <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto">
                    {gallery.map((url, i) => (
                      <R2Image
                        key={`${i}-${url.slice(0, 48)}`}
                        src={url}
                        alt={`Gallery ${i + 1}`}
                        className="h-16 w-16 shrink-0 rounded border border-gray-200 object-cover sm:h-20 sm:w-20"
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-400">No gallery images</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
  if (stepNum === 2) {
    const fields: Array<{ key: string; label: string; display: React.ReactNode; editNode: React.ReactNode }> = [
      { key: "full_address", label: "Full address", display: form.full_address ?? "—", editNode: <textarea rows={2} value={(form.full_address as string) ?? ""} onChange={(e) => set("full_address", e.target.value)} className={inputCls} /> },
      { key: "landmark", label: "Landmark", display: form.landmark ?? "—", editNode: <input type="text" value={(form.landmark as string) ?? ""} onChange={(e) => set("landmark", e.target.value)} className={inputCls} /> },
      { key: "city", label: "City", display: form.city ?? "—", editNode: <input type="text" value={(form.city as string) ?? ""} onChange={(e) => set("city", e.target.value)} className={inputCls} /> },
      { key: "state", label: "State", display: form.state ?? "—", editNode: <input type="text" value={(form.state as string) ?? ""} onChange={(e) => set("state", e.target.value)} className={inputCls} /> },
      { key: "postal_code", label: "Postal code", display: form.postal_code ?? "—", editNode: <input type="text" value={(form.postal_code as string) ?? ""} onChange={(e) => set("postal_code", e.target.value)} className={inputCls} /> },
      { key: "country", label: "Country", display: form.country ?? "—", editNode: <input type="text" value={(form.country as string) ?? ""} onChange={(e) => set("country", e.target.value)} className={inputCls} /> },
      { key: "latitude", label: "Latitude", display: form.latitude != null ? String(form.latitude) : "—", editNode: <input type="number" value={form.latitude ?? ""} onChange={(e) => set("latitude", e.target.value === "" ? null : Number(e.target.value))} className={inputCls} /> },
      { key: "longitude", label: "Longitude", display: form.longitude != null ? String(form.longitude) : "—", editNode: <input type="number" value={form.longitude ?? ""} onChange={(e) => set("longitude", e.target.value === "" ? null : Number(e.target.value))} className={inputCls} /> },
    ];
    return (
      <div className="mt-2 border-t border-gray-200 pt-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">Location details</p>
        <div className="grid grid-cols-1 gap-x-5 gap-y-0 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.key} className={f.key === "full_address" ? "sm:col-span-2" : undefined}>
              <FieldWithEditSave
                fieldKey={f.key}
                label={f.label}
                displayValue={f.display}
                isEditing={editingField === f.key}
                onStartEdit={() => onStartEdit(f.key)}
                onSave={() => onSaveField(f.key)}
                saving={savingField === f.key}
                editNode={f.editNode}
                variant="row"
              />
            </div>
          ))}
        </div>
        <div className="mt-3">
          <p className="mb-1 text-[10px] font-semibold uppercase text-gray-500">Set location on map (Mapbox)</p>
          <VerificationLocationMap
            latitude={form.latitude ?? null}
            longitude={form.longitude ?? null}
            onCoordinatesChange={(lat, lng) => {
              set("latitude", lat);
              set("longitude", lng);
            }}
            onReverseGeocode={(addr) => {
              if (addr.place_name != null) set("full_address", addr.place_name);
              if (addr.city != null) set("city", addr.city);
              if (addr.state != null) set("state", addr.state);
              if (addr.postal_code != null) set("postal_code", addr.postal_code);
              if (addr.country != null) set("country", addr.country);
            }}
            className="mt-1"
          />
        </div>
      </div>
    );
  }
  if (stepNum === 3) {
    const fields: Array<{ key: string; label: string; display: React.ReactNode; editNode: React.ReactNode }> = [
      { key: "cuisine_types", label: "Cuisine types (comma-separated)", display: Array.isArray(form.cuisine_types) ? form.cuisine_types.join(", ") : "—", editNode: <input type="text" value={Array.isArray(form.cuisine_types) ? form.cuisine_types.join(", ") : ""} onChange={(e) => set("cuisine_types", e.target.value.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean))} className={inputCls} /> },
    ];
    return (
      <div className="mt-2 border-t border-gray-200 pt-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">Menu setup</p>
        {fields.map((f) => (
          <FieldWithEditSave key={f.key} fieldKey={f.key} label={f.label} displayValue={f.display} isEditing={editingField === f.key} onStartEdit={() => onStartEdit(f.key)} onSave={() => onSaveField(f.key)} saving={savingField === f.key} editNode={f.editNode} />
        ))}
        {menuFiles && menuFiles.length > 0 && storeIdForUpload != null && (
          <MenuReferenceReviewBlock
            storeId={storeIdForUpload}
            files={menuFiles}
            onUpdated={onMenuMediaUpdated}
            interactive={!!menuReviewInteractive}
          />
        )}
        {stepNum === 3 && storeIdForUpload != null && onMenuUploadComplete && (
          <MenuFileUpload
            storeId={storeIdForUpload}
            existingFileCount={menuFiles?.length ?? 0}
            onSuccess={onMenuUploadComplete}
          />
        )}
        <p className="mt-1 text-[10px] text-gray-500">Menu items are managed in the store dashboard.</p>
      </div>
    );
  }
  if (stepNum === 4) {
    const doc = form.documents ?? {};
    const docRec = doc as Record<string, unknown>;
    const updateDoc = (key: string, value: string) => {
      onChange({ documents: { ...doc, [key]: value || null } } as Partial<VerificationDataStore>);
    };
    type Step4ExpandedEntry = { row: Step4DocRow; aadhaarSide?: "front" | "back" };
    const dynamicEntries: Step4ExpandedEntry[] = [];
    for (const row of STEP4_DOCUMENT_ROWS) {
      const hasNumber = doc[row.numberKey] != null && String(doc[row.numberKey]).trim() !== "";
      const frontUrl = String(doc[row.urlKey] ?? "").trim();
      const hasFrontUrl = !!frontUrl;
      const backUrl = row.docType === "aadhaar" ? getAadhaarBackUrl(docRec) : "";
      const hasBackUrl = !!backUrl;

      if (row.docType === "aadhaar") {
        if (hasNumber || hasFrontUrl) dynamicEntries.push({ row, aadhaarSide: "front" });
        if (hasBackUrl) dynamicEntries.push({ row, aadhaarSide: "back" });
        continue;
      }
      if (hasNumber || hasFrontUrl) dynamicEntries.push({ row });
    }
    return (
      <div className="mt-2 border-t border-gray-200 pt-2">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          Restaurant documents (only documents with data for this store)
        </p>
        {dynamicEntries.length === 0 ? (
          <p className="py-2 text-xs text-gray-500">No document records for this store yet. Add numbers or upload files to verify.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {dynamicEntries.map((entry) => {
              const { row, aadhaarSide } = entry;
              const isAadhaarBack = row.docType === "aadhaar" && aadhaarSide === "back";
              const key = `${row.numberKey}${aadhaarSide ? `-${aadhaarSide}` : ""}`;
              const isVerified = !!doc[row.verifiedKey];
              const isRejected = !!doc[row.rejectionKey];
              const rejectionStructured = rejectionDetailForDocType(doc.step4_rejection_details, row.docType);
              const needsImageResubmission = rejectionRequiresNewFileUpload(rejectionStructured);
              const hasResubmittedAfterReject =
                isRejected && step4DocResubmitted(doc.step4_resubmission_flags, row.docType);
              const fileUrlRaw = isAadhaarBack
                ? getAadhaarBackUrl(docRec)
                : (doc[row.urlKey] as string) || "";
              const fileUrl = resolveAttachmentProxyUrl(fileUrlRaw);
              const hasFile = !!String(fileUrl).trim();
              const docFileName = docRec[`${row.docType}_document_name`];
              const fileName =
                typeof docFileName === "string" && docFileName.trim() ? docFileName.trim() : null;
              const listLabel = isAadhaarBack ? "Aadhaar (back)" : row.listLabel;
              const openPreview = () =>
                onDocumentPreview?.({
                  url: fileUrl,
                  title: listLabel,
                  metaLines: buildStep4DocumentPreviewMeta(docRec, row, {
                    aadhaarSide: row.docType === "aadhaar" ? (isAadhaarBack ? "back" : "front") : undefined,
                  }),
                });
              return (
                <div
                  key={key}
                  className="overflow-hidden rounded-xl border border-gray-200/90 bg-gradient-to-b from-white to-slate-50/80 shadow-sm ring-1 ring-gray-100"
                >
                  <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start">
                    <div className="flex w-full flex-col items-center gap-2 sm:w-[8.5rem] sm:shrink-0">
                      <DocumentAttachmentThumb
                        url={fileUrlRaw}
                        fileName={fileName}
                        label={listLabel}
                        onImagePreview={hasFile ? openPreview : undefined}
                        className="mx-auto sm:mx-0"
                      />

                      {storeIdForDocUpload != null && (
                        <DocFileUpload
                          storeId={storeIdForDocUpload}
                          docType={row.docType}
                          side={row.docType === "aadhaar" ? (isAadhaarBack ? "back" : "front") : undefined}
                          currentUrl={hasFile ? fileUrl : null}
                          onUploaded={(payload) => {
                            const p = payload as { url?: unknown };
                            const newUrl = typeof p?.url === "string" ? p.url : null;
                            if (!newUrl) return;

                            const nextDocs: Record<string, unknown> = {
                              ...(form.documents ?? {}),
                            } as Record<string, unknown>;
                            const uploadedByMap =
                              nextDocs.step4_uploaded_by &&
                              typeof nextDocs.step4_uploaded_by === "object"
                                ? { ...(nextDocs.step4_uploaded_by as Record<string, unknown>) }
                                : {};
                            const uploadedByEmail =
                              typeof (payload as { uploaded_by_email?: unknown })?.uploaded_by_email === "string"
                                ? ((payload as { uploaded_by_email: string }).uploaded_by_email)
                                : typeof (payload as { uploaded_by?: unknown })?.uploaded_by === "string"
                                  ? ((payload as { uploaded_by: string }).uploaded_by)
                                  : null;

                            // Update URL + reset verified/rejection state for this document row.
                            if (row.docType === "aadhaar" && isAadhaarBack) {
                              const meta =
                                nextDocs.aadhaar_document_metadata &&
                                typeof nextDocs.aadhaar_document_metadata === "object"
                                  ? (nextDocs.aadhaar_document_metadata as Record<string, unknown>)
                                  : {};
                              nextDocs.aadhaar_document_metadata = { ...meta, back_url: newUrl };
                              if (uploadedByEmail) uploadedByMap.aadhaar_back = uploadedByEmail;
                            } else {
                              nextDocs[row.urlKey] = newUrl;
                              if (uploadedByEmail) uploadedByMap[row.docType] = uploadedByEmail;
                            }

                            nextDocs[row.verifiedKey] = false;
                            nextDocs[row.rejectionKey] = null;
                            nextDocs.step4_uploaded_by = uploadedByMap;

                            onChange({ documents: nextDocs } as Partial<VerificationDataStore>);
                          }}
                          uploadedByFromData={
                            (() => {
                              const m = doc.step4_uploaded_by;
                              if (!m || typeof m !== "object") return null;
                              const key = row.docType === "aadhaar" && isAadhaarBack ? "aadhaar_back" : row.docType;
                              const v = (m as Record<string, unknown>)[key];
                              return typeof v === "string" && v.trim() ? v : null;
                            })()
                          }
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      {isAadhaarBack ? (
                        <div className="flex flex-col gap-1 rounded border border-gray-100 bg-white/80 px-2 py-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                            {listLabel}
                          </span>
                          <p className="break-all font-mono text-sm font-medium leading-snug text-gray-900">
                            <span className="block text-[10px] font-sans font-medium uppercase tracking-wide text-gray-500">
                              Aadhaar number
                            </span>
                            {(doc[row.numberKey] as string) ?? "—"}
                          </p>
                          <p className="text-[10px] leading-snug text-gray-500">
                            Verification uses the same Aadhaar record as the front image. Use the front card for verify /
                            reject and edits.
                          </p>
                        </div>
                      ) : (
                        <FieldWithEditSave
                          fieldKey={row.numberKey}
                          label={row.listLabel}
                          displayValue={(doc[row.numberKey] as string) ?? "—"}
                          variant="document"
                          isEditing={editingField === row.numberKey}
                          onStartEdit={() => onStartEdit(row.numberKey)}
                          onSave={() => onSaveField(row.numberKey)}
                          saving={savingField === row.numberKey}
                          editNode={
                            <input
                              type="text"
                              value={(doc[row.numberKey] as string) ?? ""}
                              onChange={(e) => updateDoc(row.numberKey, e.target.value)}
                              className={inputCls}
                            />
                          }
                        />
                      )}
                      {row.docType === "fssai" && !!doc.fssai_expiry_date && (
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-t border-gray-100 pt-2 text-xs">
                          <span className="font-medium text-gray-500">FSSAI expiry</span>
                          <span className="text-gray-900">
                            {new Date(doc.fssai_expiry_date as string).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      {storeIdForDocUpload != null && onDocumentsUpdated && (
                        <div className="flex flex-col gap-2 border-t border-gray-100 pt-2">
                          {hasResubmittedAfterReject && needsImageResubmission && (
                            <span className="inline-flex w-fit items-center rounded bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-900">
                              Resubmitted
                            </span>
                          )}
                          {!isAadhaarBack && (
                            <div className="flex flex-wrap items-start gap-2">
                              <DocVerifyButton
                                storeId={storeIdForDocUpload}
                                docType={row.docType}
                                isVerified={isVerified}
                                isRejected={isRejected}
                                hasResubmittedAfterReject={hasResubmittedAfterReject}
                                step4RejectionDetailsRoot={doc.step4_rejection_details}
                                adminOverrideMode={adminOverrideMode}
                                canPerformVerify={canPerformVerify}
                                onSuccess={() => {
                                  const nextDocs: Record<string, unknown> = {
                                    ...(form.documents ?? {}),
                                  } as Record<string, unknown>;
                                  nextDocs[row.verifiedKey] = true;
                                  nextDocs[row.rejectionKey] = null;
                                  if (
                                    nextDocs.step4_rejection_details &&
                                    typeof nextDocs.step4_rejection_details === "object"
                                  ) {
                                    const detail = {
                                      ...(nextDocs.step4_rejection_details as Record<string, unknown>),
                                    };
                                    delete detail[row.docType];
                                    nextDocs.step4_rejection_details = detail;
                                  }
                                  if (
                                    nextDocs.step4_resubmission_flags &&
                                    typeof nextDocs.step4_resubmission_flags === "object"
                                  ) {
                                    const flags = {
                                      ...(nextDocs.step4_resubmission_flags as Record<string, unknown>),
                                    };
                                    flags[row.docType] = false;
                                    nextDocs.step4_resubmission_flags = flags;
                                  }
                                  onChange({ documents: nextDocs } as Partial<VerificationDataStore>);
                                  onStep4DocVerified?.(row.docType, nextDocs);
                                }}
                              />
                              {!isVerified && canPerformVerify && (
                                <DocRejectButton
                                  storeId={storeIdForDocUpload}
                                  docType={row.docType}
                                  isRejected={isRejected}
                                  rejectionReason={(doc[row.rejectionKey] as string) ?? null}
                                  rejectionDetailsRoot={doc.step4_rejection_details}
                                  docLabel={row.listLabel}
                                  onSuccess={(payload) => {
                                    const nextDocs: Record<string, unknown> = {
                                      ...(form.documents ?? {}),
                                    } as Record<string, unknown>;
                                    nextDocs[row.verifiedKey] = false;
                                    nextDocs[row.rejectionKey] = payload.rejectionReason || "Rejected by verifier";

                                    const currentDetails =
                                      nextDocs.step4_rejection_details &&
                                      typeof nextDocs.step4_rejection_details === "object"
                                        ? {
                                            ...(nextDocs.step4_rejection_details as Record<string, unknown>),
                                          }
                                        : {};
                                    currentDetails[row.docType] = {
                                      issues: payload.rejectionIssues,
                                      ...(payload.rejectionNote ? { note: payload.rejectionNote } : {}),
                                    };
                                    nextDocs.step4_rejection_details = currentDetails;

                                    const currentFlags =
                                      nextDocs.step4_resubmission_flags &&
                                      typeof nextDocs.step4_resubmission_flags === "object"
                                        ? {
                                            ...(nextDocs.step4_resubmission_flags as Record<string, unknown>),
                                          }
                                        : {};
                                    currentFlags[row.docType] = false;
                                    nextDocs.step4_resubmission_flags = currentFlags;

                                    onChange({ documents: nextDocs } as Partial<VerificationDataStore>);
                                  }}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Agent electronic verification — PAN / GST only, and
                          ONLY while the doc is still unverified. */}
                      {!isAadhaarBack &&
                        !isVerified &&
                        canPerformVerify &&
                        storeIdForDocUpload != null &&
                        (row.docType === "pan" || row.docType === "gst") ? (
                        <ElectronicVerifyPanel
                          subjectType="merchant_store"
                          subjectId={storeIdForDocUpload}
                          docKind={row.docType === "pan" ? "pan" : "gstin"}
                          verified={isVerified}
                          prefill={{
                            number: (doc[row.numberKey] as string) ?? null,
                            name:
                              row.docType === "pan"
                                ? ((docRec.pan_holder_name as string) ?? null)
                                : null,
                          }}
                          className="mt-2"
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}          </div>
        )}
      </div>
    );
  }
  if (stepNum === 5) {
    const fields: Array<{ key: string; label: string; display: React.ReactNode; editNode: React.ReactNode }> = [
      { key: "min_order_amount", label: "Min order amount (₹)", display: form.min_order_amount != null ? String(form.min_order_amount) : "—", editNode: <input type="number" value={form.min_order_amount ?? ""} onChange={(e) => set("min_order_amount", e.target.value === "" ? null : Number(e.target.value))} className={inputCls} /> },
      { key: "delivery_radius_km", label: "Delivery radius (km)", display: form.delivery_radius_km != null ? String(form.delivery_radius_km) : "—", editNode: <input type="number" value={form.delivery_radius_km ?? ""} onChange={(e) => set("delivery_radius_km", e.target.value === "" ? null : Number(e.target.value))} className={inputCls} /> },
      { key: "avg_preparation_time_minutes", label: "Avg prep (minutes)", display: form.avg_preparation_time_minutes != null ? String(form.avg_preparation_time_minutes) : "—", editNode: <input type="number" value={form.avg_preparation_time_minutes ?? ""} onChange={(e) => set("avg_preparation_time_minutes", e.target.value === "" ? null : Number(e.target.value))} className={inputCls} /> },
      { key: "is_pure_veg", label: "Pure veg", display: form.is_pure_veg != null ? (form.is_pure_veg ? "Yes" : "No") : "—", editNode: <input type="checkbox" checked={!!form.is_pure_veg} onChange={(e) => set("is_pure_veg", e.target.checked)} className="h-4 w-4 rounded border-gray-300" /> },
      { key: "accepts_online_payment", label: "Accepts online payment", display: form.accepts_online_payment != null ? (form.accepts_online_payment ? "Yes" : "No") : "—", editNode: <input type="checkbox" checked={!!form.accepts_online_payment} onChange={(e) => set("accepts_online_payment", e.target.checked)} className="h-4 w-4 rounded border-gray-300" /> },
      { key: "accepts_cash", label: "Accepts cash", display: form.accepts_cash != null ? (form.accepts_cash ? "Yes" : "No") : "—", editNode: <input type="checkbox" checked={!!form.accepts_cash} onChange={(e) => set("accepts_cash", e.target.checked)} className="h-4 w-4 rounded border-gray-300" /> },
    ];
    return (
      <div className="mt-2 space-y-3 border-t border-gray-200 pt-2">
        <section>
          <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">Order & payment</p>
          <div className="grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2 xl:grid-cols-3">
            {fields.map((f) => (
              <FieldWithEditSave
                key={f.key}
                fieldKey={f.key}
                label={f.label}
                displayValue={f.display}
                isEditing={editingField === f.key}
                onStartEdit={() => onStartEdit(f.key)}
                onSave={() => onSaveField(f.key)}
                saving={savingField === f.key}
                editNode={f.editNode}
                variant="row"
              />
            ))}
          </div>
        </section>
        <section className="border-t border-gray-100 pt-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">Store timings</p>
          {storeIdForUpload != null ? (
            <OperatingHoursEditor
              storeId={storeIdForUpload}
              oh={operatingHours ?? null}
              onSaved={() => onOperatingHoursUpdated?.()}
            />
          ) : (
            <OperatingHoursBlock oh={operatingHours ?? null} />
          )}
        </section>
      </div>
    );
  }
  if (stepNum === 6) {
    return (
      <div className="mt-2 border-t border-gray-200 pt-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">Bank account — payout details</p>
        <p className="mb-2 text-[11px] text-gray-600">
          Review IFSC, account holder, and proof / UPI. Marking this step verified also marks the primary payout account as
          verified for ops.
        </p>
        <BankAccountsVerificationPanel accounts={bankAccounts} compact />
      </div>
    );
  }
  if (stepNum === 7) {
    const payments = onboardingPayments ?? [];
    const statusBadge = (status: string) => {
      const s = (status || "").toLowerCase();
      const green = s === "captured" || s === "authorized";
      const red = s === "failed" || s === "cancelled" || s === "refunded";
      const cls = green ? "bg-emerald-100 text-emerald-800" : red ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800";
      return <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{status}</span>;
    };
    return (
      <div className="mt-2 border-t border-gray-200 pt-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">Commission plan — verify payment</p>
        {payments.length === 0 ? (
          <p className="text-xs text-gray-600">No payment record for this store.</p>
        ) : (
          <div className="space-y-3">
            {payments.map((p, i) => {
              const id = (p.id as number) ?? i;
              const amountPaise = (p.amount_paise as number) ?? 0;
              const planName = (p.plan_name as string) ?? "—";
              const status = (p.status as string) ?? "—";
              const createdAt = (p.created_at as string) ?? "—";
              const capturedAt = (p.captured_at as string) ?? null;
              const failedAt = (p.failed_at as string) ?? null;
              const failureReason = (p.failure_reason as string) ?? null;
              const razorpayOrderId = (p.razorpay_order_id as string) ?? null;
              const razorpayPaymentId = (p.razorpay_payment_id as string) ?? null;
              const payerName = (p.payer_name as string) ?? null;
              const payerEmail = (p.payer_email as string) ?? null;
              const payerPhone = (p.payer_phone as string) ?? null;
              const standardPaise = (p.standard_amount_paise as number) ?? null;
              const promoPaise = (p.promo_amount_paise as number) ?? null;
              const promoLabel = (p.promo_label as string) ?? null;
              const money = `${(amountPaise / 100).toFixed(2)} ${(p.currency as string) ?? "INR"}`;
              return (
                <div key={id} className="rounded-lg border border-gray-200 bg-white p-3 text-xs shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-[10rem]">
                      <div className="text-xs font-semibold text-gray-800">Payment #{id}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {statusBadge(status)}
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                          Created: {typeof createdAt === "string" ? createdAt : "—"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                      <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Plan</div>
                      <div className="mt-0.5 text-xs font-medium text-gray-900">{planName}</div>
                    </div>
                    <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                      <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Amount</div>
                      <div className="mt-0.5 text-xs font-medium text-gray-900">{money}</div>
                    </div>

                    {standardPaise != null && (
                      <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Standard (paise)</div>
                        <div className="mt-0.5 text-xs font-medium text-gray-900">{String(standardPaise)}</div>
                      </div>
                    )}

                    {promoPaise != null && (
                      <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Promo (paise)</div>
                        <div className="mt-0.5 text-xs font-medium text-gray-900">
                          {promoLabel ? `${promoPaise} (${promoLabel})` : String(promoPaise)}
                        </div>
                      </div>
                    )}

                    {capturedAt && (
                      <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Captured</div>
                        <div className="mt-0.5 text-xs font-medium text-gray-900">{capturedAt}</div>
                      </div>
                    )}

                    {failedAt && (
                      <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Failed</div>
                        <div className="mt-0.5 text-xs font-medium text-gray-900">{failedAt}</div>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-2">
                    {razorpayOrderId && (
                      <div className="rounded border border-gray-100 bg-white px-2 py-1.5">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Razorpay order id</div>
                        <div className="mt-0.5 break-all text-[11px] font-medium text-gray-900">{razorpayOrderId}</div>
                      </div>
                    )}
                    {razorpayPaymentId && (
                      <div className="rounded border border-gray-100 bg-white px-2 py-1.5">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Razorpay payment id</div>
                        <div className="mt-0.5 break-all text-[11px] font-medium text-gray-900">{razorpayPaymentId}</div>
                      </div>
                    )}
                    {(payerName || payerEmail || payerPhone) && (
                      <div className="rounded border border-gray-100 bg-white px-2 py-1.5 sm:col-span-2">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Payer</div>
                        <div className="mt-0.5 text-xs text-gray-900">
                          {[payerName, payerEmail, payerPhone].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    )}
                    {failureReason && (
                      <div className="rounded border border-red-100 bg-red-50 px-2 py-1.5 sm:col-span-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-red-800">Failure reason</div>
                        <div className="mt-0.5 text-xs text-red-900">{failureReason}</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
  if (stepNum === 8) {
    const agg = agreementAcceptance ?? null;
    return (
      <div className="mt-2 border-t border-gray-200 pt-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">Sign & submit — verify agreement & signature</p>
        {!agg ? (
          <p className="text-xs text-gray-600">No agreement record for this store.</p>
        ) : (
          <div className="text-xs">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {(agg.contract_pdf_url as string) && (
                <a
                  href={agg.contract_pdf_url as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded border border-indigo-600 bg-indigo-50 px-2.5 py-1.5 font-medium text-indigo-700 hover:bg-indigo-100"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open contract PDF
                </a>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Signer name</div>
                <div className="mt-0.5 text-xs font-medium text-gray-900">{(agg.signer_name as string) || "—"}</div>
              </div>
              <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Signer phone</div>
                <div className="mt-0.5 text-xs font-medium text-gray-900">{(agg.signer_phone as string) || "—"}</div>
              </div>
              <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5 col-span-2">
                <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Signer email</div>
                <div className="mt-0.5 break-all text-xs font-medium text-gray-900">{(agg.signer_email as string) || "—"}</div>
              </div>
              <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Accepted at</div>
                <div className="mt-0.5 text-xs font-medium text-gray-900">
                  {typeof agg.accepted_at === "string" ? agg.accepted_at : "—"}
                </div>
              </div>
              <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Terms accepted</div>
                <div className="mt-0.5 text-xs font-medium text-gray-900">{agg.terms_accepted === true ? "Yes" : "No"}</div>
              </div>
              <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Contract read</div>
                <div className="mt-0.5 text-xs font-medium text-gray-900">
                  {agg.contract_read_confirmed === true ? "Yes" : "No"}
                </div>
              </div>
              <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Commission</div>
                <div className="mt-0.5 text-xs font-medium text-gray-900">
                  {(agg.commission_first_month_pct != null ? `${String(agg.commission_first_month_pct)}% (1st)` : "—")}
                  {agg.commission_from_second_month_pct != null ? ` · ${String(agg.commission_from_second_month_pct)}% (2nd+)` : ""}
                </div>
              </div>
              {agg.agreement_effective_from != null && (
                <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Effective from</div>
                  <div className="mt-0.5 text-xs font-medium text-gray-900">
                    {typeof agg.agreement_effective_from === "string" ? agg.agreement_effective_from : "—"}
                  </div>
                </div>
              )}
              {agg.agreement_effective_to != null && (
                <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Effective to</div>
                  <div className="mt-0.5 text-xs font-medium text-gray-900">
                    {typeof agg.agreement_effective_to === "string" ? agg.agreement_effective_to : "—"}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
  return null;
}

export function StoreVerificationInner({
  storeId,
  returnTo,
  embedded = false,
  initialStep = null,
  onClose,
  canPerformVerify = true,
}: {
  storeId: string;
  returnTo: string | null;
  embedded?: boolean;
  initialStep?: number | null;
  onClose?: () => void;
  canPerformVerify?: boolean;
}) {
  const router = useRouter();
  const searchParams = useAppSearchParams();
  const reviewRejected = searchParams.get("reviewRejected") === "1";
  const portalParam = searchParams.get("portal");
  const portalForLinks =
    portalParam === "admin" || portalParam === "merchant" ? portalParam : null;
  const [store, setStore] = useState<StoreDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<"approve" | "reject" | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [stepVerifications, setStepVerifications] = useState<Record<number, StepVerification>>({});
  const [stepEdits, setStepEdits] = useState<Record<number, StepEditRecord[]>>({});
  const [verifyingStep, setVerifyingStep] = useState<number | null>(null);
  const [verificationData, setVerificationData] = useState<{
    store: VerificationDataStore;
    documents: Record<string, unknown> | null;
    operatingHours: Record<string, unknown> | null;
    onboardingPayments: Record<string, unknown>[];
    agreementAcceptance: Record<string, unknown> | null;
    bankAccounts: Record<string, unknown>[];
    assignedAreaManagers: {
      id: number;
      full_name: string | null;
      email: string | null;
      mobile: string | null;
    }[];
  } | null>(null);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [verifyModalStep, setVerifyModalStep] = useState<number | null>(initialStep ?? null);
  const [adminOverrideMode, setAdminOverrideMode] = useState(() => initialStep != null);
  const reverifyDeepLink = embedded && initialStep != null;
  const [stepEditForm, setStepEditForm] = useState<(VerificationDataStore & { documents?: Record<string, unknown> | null }) | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [editStartValues, setEditStartValues] = useState<Record<string, string>>({});
  const [historyModalStep, setHistoryModalStep] = useState<number | null>(null);
  const [showFinalDecisionModal, setShowFinalDecisionModal] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [copyPhoneSuccess, setCopyPhoneSuccess] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [actionConfirm, setActionConfirm] = useState<{
    stepNum: number;
    action: "verify" | "pending" | "reject";
  } | null>(null);
  const [unverifyingStep, setUnverifyingStep] = useState<number | null>(null);
  /** Required when rejecting a step — emailed to the store owner. */
  const [stepRejectReasonDraft, setStepRejectReasonDraft] = useState("");
  const [saveConfirm, setSaveConfirm] = useState<
    { type: "location" } | { type: "field"; fieldKey: string } | null
  >(null);
  const [editConfirmField, setEditConfirmField] = useState<string | null>(null);
  const [menuMediaFiles, setMenuMediaFiles] = useState<MenuMediaFile[]>([]);
  const [docPreview, setDocPreview] = useState<Step4DocPreviewPayload | null>(null);

  const queryClient = useQueryClient();
  const invalidateMerchantStoresStats = () => {
    void queryClient.invalidateQueries({ queryKey: ["merchant-stores", "stats"], exact: false });
    dispatchMerchantResubmittedDocsRefresh();
  };

  // Keep override for rejected-store review or deep-linked re-verify (e.g. pending doc on approved store).
  useEffect(() => {
    if (verifyModalStep == null && !reviewRejected && !reverifyDeepLink) {
      setAdminOverrideMode(false);
    }
  }, [verifyModalStep, reviewRejected, reverifyDeepLink]);

  const handleProfileMediaSaved = (
    payload: { kind: "banner"; proxyUrl: string } | { kind: "gallery"; proxyUrl: string }
  ) => {
    setStepEditForm((prev) => {
      if (!prev) return prev;
      if (payload.kind === "banner") {
        return { ...prev, banner_url: payload.proxyUrl };
      }
      const list = normalizeGalleryImages(prev.gallery_images);
      return { ...prev, gallery_images: [...list, payload.proxyUrl] };
    });
  };

  /**
   * Step modal form: full replace when switching steps; when staying on the same step, merge banner/gallery/documents
   * from refetches so uploads persist in the form without wiping in-progress text edits or resetting local upload UI.
   */
  const verifyModalStepForFormRef = useRef<number | null>(null);
  useEffect(() => {
    if (verifyModalStep == null) {
      verifyModalStepForFormRef.current = null;
      setStepEditForm(null);
      return;
    }
    if (!verificationData?.store) return;

    const stepChanged = verifyModalStepForFormRef.current !== verifyModalStep;
    verifyModalStepForFormRef.current = verifyModalStep;

    if (stepChanged) {
      setStepEditForm({
        ...verificationData.store,
        documents: verificationData.documents ?? null,
      });
      return;
    }

    setStepEditForm((prev) => {
      if (!prev) {
        return {
          ...verificationData.store,
          documents: verificationData.documents ?? null,
        };
      }
      const s = verificationData.store;
      return {
        ...prev,
        banner_url: s.banner_url ?? prev.banner_url,
        gallery_images:
          s.gallery_images !== undefined && s.gallery_images !== null
            ? s.gallery_images
            : prev.gallery_images,
        documents: verificationData.documents ?? prev.documents ?? null,
      };
    });
  }, [verifyModalStep, verificationData]);

  const prevVerifyStepForEditReset = useRef<number | null>(null);
  useEffect(() => {
    if (verifyModalStep == null) {
      prevVerifyStepForEditReset.current = null;
      setEditingField(null);
      setSavingField(null);
      setEditStartValues({});
      return;
    }
    const prev = prevVerifyStepForEditReset.current;
    prevVerifyStepForEditReset.current = verifyModalStep;
    if (prev !== verifyModalStep) {
      setEditingField(null);
      setSavingField(null);
      setEditStartValues({});
    }
  }, [verifyModalStep]);

  const refetchMenuMedia = () => {
    if (!store?.id) return;
    fetch(`/api/merchant/stores/${store.id}/media?scope=MENU_REFERENCE`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.success && Array.isArray(data.files)) setMenuMediaFiles(data.files);
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!store?.id) return;
    const step3Open = verifyModalStep === 3 || expandedStep === 3;
    if (!step3Open) return;
    fetch(`/api/merchant/stores/${store.id}/media?scope=MENU_REFERENCE`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.success && Array.isArray(data.files)) setMenuMediaFiles(data.files);
      })
      .catch(() => {});
  }, [store?.id, verifyModalStep, expandedStep]);

  const getDocSummaryForStore = (): string[] => {
    const doc = verificationData?.documents as Record<string, unknown> | undefined;
    if (!doc) return [];
    const out: string[] = [];
    for (const r of STEP4_DOCUMENT_ROWS) {
      if (doc[r.numberKey] || doc[r.urlKey]) {
        const rr = doc[r.rejectionKey];
        const rejected = typeof rr === "string" && rr.trim() !== "";
        const resub =
          rejected &&
          rejectionRequiresNewFileUpload(rejectionDetailForDocType(doc.step4_rejection_details, r.docType)) &&
          step4DocResubmitted(doc.step4_resubmission_flags, r.docType);
        out.push(resub ? `${r.summary} (Resubmitted)` : r.summary);
      }
    }
    return out;
  };

  const refetchOperatingHours = async () => {
    if (!store?.id) return;
    try {
      const res = await fetch(`/api/merchant/stores/${store.id}/operating-hours`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setVerificationData((prev) => (prev ? { ...prev, operatingHours: data } : prev));
      }
    } catch {
      // ignore
    }
  };

  /** For step 4: true only when every document that has data is individually verified. */
  const allStep4DocumentsVerified = (documents: Record<string, unknown> | null | undefined): boolean => {
    if (!documents) return false;
    const doc = documents as Record<string, unknown>;
    const withData = STEP4_DOCUMENT_ROWS.filter(
      (r) => !!(doc[r.numberKey] && String(doc[r.numberKey]).trim()) || !!doc[r.urlKey]
    );
    if (withData.length === 0) return true;
    return withData.every((r) => !!doc[r.verifiedKey]);
  };

  /** Step 3: every MENU_REFERENCE row and each image bundle entry is VERIFIED (no pending/rejected). */
  const menuStepAllItemsAccepted = (files: MenuMediaFile[]): boolean => {
    if (!files.length) return false;
    for (const f of files) {
      if (f.reference_images && f.reference_images.length > 0) {
        for (const e of f.reference_images) {
          const s = (e.verification_status || "PENDING").toUpperCase();
          if (s !== "VERIFIED") return false;
        }
      } else {
        const s = (f.verification_status || "PENDING").toUpperCase();
        if (s !== "VERIFIED") return false;
      }
    }
    return true;
  };

  const copyEmail = () => {
    const email = store?.store_email || verificationData?.store?.store_email;
    if (email && typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(email).then(
        () => {
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 1500);
        },
        () => {
          // ignore copy failure
        }
      );
    }
  };

  const copyPhone = () => {
    const phones = verificationData?.store?.store_phones;
    const text = Array.isArray(phones) && phones.length > 0 ? phones.join(", ") : null;
    if (text && typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        () => {
          setCopyPhoneSuccess(true);
          setTimeout(() => setCopyPhoneSuccess(false), 1500);
        },
        () => {
          // ignore copy failure
        }
      );
    }
  };

  const backHref = mergePortalIntoRelativeHref(
    returnTo || "/dashboard/merchants/verifications",
    portalForLinks
  );

  useEffect(() => {
    let cancelled = false;
    const id = parseInt(storeId, 10);
    if (!Number.isFinite(id)) {
      setError("Invalid store id");
      setLoading(false);
      return () => {};
    }
    fetch(`/api/merchant/stores/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.success && data.store) {
          setStore({
            id: data.store.id,
            store_id: data.store.store_id,
            name: data.store.name,
            city: data.store.city,
            approval_status: data.store.approval_status,
            store_email: data.store.store_email ?? null,
            full_address: data.store.full_address ?? null,
            created_at: data.store.created_at ?? null,
            current_onboarding_step: data.store.current_onboarding_step ?? null,
            onboarding_completed: data.store.onboarding_completed ?? false,
          });
        } else {
          setError("Store not found");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load store");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  // When user clicks "Verify" from the rejected-store list, we pass `reviewRejected=1`.
  // Auto-enable override so the rejected store steps render immediately (no extra intermediate screen).
  useEffect(() => {
    if (!reviewRejected) return;
    const s = (store?.approval_status || "").toUpperCase();
    const isRejectedLikeNow = s === "REJECTED" || s === "BLOCKED" || s === "SUSPENDED";
    if (isRejectedLikeNow) setAdminOverrideMode(true);
  }, [reviewRejected, store?.approval_status]);

  useEffect(() => {
    if (initialStep == null || !store?.id) return;
    setVerifyModalStep(initialStep);
    const s = (store.approval_status || "").toUpperCase();
    if (
      s === "REJECTED" ||
      s === "BLOCKED" ||
      s === "SUSPENDED" ||
      (s === "APPROVED" && canPerformVerify)
    ) {
      setAdminOverrideMode(true);
    }
  }, [initialStep, store?.id, store?.approval_status, canPerformVerify]);

  useEffect(() => {
    if (!store?.id) return;
    fetch(`/api/merchant/stores/${store.id}/verification-steps`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.success && data.steps) {
          setStepVerifications(data.steps);
          setStepEdits(data.edits ?? {});
        }
      })
      .catch(() => {});
  }, [store?.id]);

  useEffect(() => {
    if (!store?.id) return;
    let cancelled = false;
    fetch(`/api/merchant/stores/${store.id}/verification-data`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.success && data.store) {
          setVerificationData({
            store: data.store,
            documents: data.documents ?? null,
            operatingHours: data.operatingHours ?? null,
            onboardingPayments: Array.isArray(data.onboardingPayments) ? data.onboardingPayments : [],
            agreementAcceptance: data.agreementAcceptance ?? null,
            bankAccounts: Array.isArray(data.bankAccounts) ? data.bankAccounts : [],
            assignedAreaManagers: Array.isArray(data.assignedAreaManagers) ? data.assignedAreaManagers : [],
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [store?.id]);

  const handleVerifyStep = async (stepNumber: number, override = false): Promise<boolean> => {
    if (!store) return false;
    setVerifyingStep(stepNumber);
    try {
      const res = await fetch(`/api/merchant/stores/${store.id}/verification-steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: stepNumber, admin_override: override }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success && data.steps) {
        setStepVerifications(data.steps);
        if (data.edits) setStepEdits(data.edits);
        invalidateMerchantStoresStats();
        return true;
      }
      setError(data.error || "Failed to verify step");
      return false;
    } catch {
      setError("Failed to verify step");
      return false;
    } finally {
      setVerifyingStep(null);
    }
  };

  const handleSetStepPending = async (
    stepNumber: number,
    rejectionReason?: string
  ): Promise<void> => {
    if (!store) return;
    const trimmed = rejectionReason?.trim() ?? "";
    if (trimmed && trimmed.length < 3) {
      setError("Please enter a clearer rejection reason (at least a few characters).");
      return;
    }
    setUnverifyingStep(stepNumber);
    try {
      const res = await fetch(`/api/merchant/stores/${store.id}/verification-steps`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: stepNumber,
          ...(trimmed.length >= 3 ? { rejection_reason: trimmed } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success && data.steps) {
        setStepVerifications(data.steps);
        if (data.edits) setStepEdits(data.edits);
        invalidateMerchantStoresStats();
        setVerifyModalStep((prev) => (prev === stepNumber ? null : prev));
        setActionConfirm(null);
        setStepRejectReasonDraft("");
        const em = data.email as
          | { attempted?: boolean; sent?: boolean; skippedReason?: string }
          | undefined;
        if (em?.attempted && !em.sent) {
          if (em.skippedReason === "NOT_CONFIGURED") {
            toast.warning(
              "Step reset, but email was not sent. Configure EMAIL_ID + EMAIL_APP_PASSWORD in dashboard .env.local and restart dev."
            );
          } else if (em.skippedReason === "SMTP_AUTH_FAILED") {
            toast.warning("Step reset, but Zoho rejected SMTP login. Check app password in .env.local.");
          } else if (em.skippedReason === "NO_RECIPIENT") {
            toast.warning("Step reset, but no store email found to notify the merchant.");
          } else if (em.skippedReason === "SMTP_ERROR" || em.skippedReason === "RESEND_ERROR") {
            toast.warning("Step reset, but sending the email failed. Check server logs.");
          }
        } else if (em?.sent) {
          toast.success("Rejection reason emailed to the store contact.");
        }
      } else {
        setError(data.error || "Failed to set step to pending");
      }
    } catch {
      setError("Failed to set step to pending");
    } finally {
      setUnverifyingStep(null);
    }
  };

  const buildPatchPayloadForStep = (step: number): Record<string, unknown> | null => {
    if (!stepEditForm) return null;
    const f = stepEditForm;
    switch (step) {
      case 1:
        return {
          store_name: f.store_name ?? undefined,
          store_display_name: f.store_display_name ?? undefined,
          store_description: f.store_description ?? undefined,
          store_type: f.store_type ?? undefined,
          store_email: f.store_email ?? undefined,
          store_phones: Array.isArray(f.store_phones) ? f.store_phones : undefined,
        };
      case 2:
        return {
          full_address: f.full_address ?? undefined,
          landmark: f.landmark ?? undefined,
          city: f.city ?? undefined,
          state: f.state ?? undefined,
          postal_code: f.postal_code ?? undefined,
          country: f.country ?? undefined,
          latitude: f.latitude ?? undefined,
          longitude: f.longitude ?? undefined,
        };
      case 3:
        return {
          cuisine_types: Array.isArray(f.cuisine_types) ? f.cuisine_types : undefined,
        };
      case 4:
        return null; // step 4 uses documents PATCH
      case 5:
        return {
          min_order_amount: f.min_order_amount ?? undefined,
          delivery_radius_km: f.delivery_radius_km ?? undefined,
          avg_preparation_time_minutes: f.avg_preparation_time_minutes ?? undefined,
          is_pure_veg: f.is_pure_veg ?? undefined,
          accepts_online_payment: f.accepts_online_payment ?? undefined,
          accepts_cash: f.accepts_cash ?? undefined,
        };
      default:
        return {};
    }
  };

  /** Saves current step edits (store or documents) only. Returns true if save succeeded or nothing to save. */
  const saveStepEdits = async (step: number): Promise<boolean> => {
    if (!store || !stepEditForm) return false;
    if (step === 4 && stepEditForm.documents) {
      const docPayload: Record<string, string | null> = {};
      for (const r of STEP4_DOCUMENT_ROWS) {
        const v = stepEditForm.documents[r.numberKey];
        docPayload[r.numberKey] = v == null || v === "" ? null : String(v);
      }
      const docRes = await fetch(`/api/merchant/stores/${store.id}/documents`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(docPayload),
      });
      const docData = await docRes.json().catch(() => ({}));
      if (!docRes.ok || !docData?.success) {
        setError(docData?.error || "Failed to save document changes");
        return false;
      }
      return true;
    }
    const patchPayload = buildPatchPayloadForStep(step);
    if (patchPayload === null && step !== 4) return false;
    if (patchPayload != null && Object.keys(patchPayload).length > 0) {
      const patchRes = await fetch(`/api/merchant/stores/${store.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchPayload),
      });
      const patchData = await patchRes.json().catch(() => ({}));
      if (!patchRes.ok || !patchData?.success) {
        setError(patchData?.error || "Failed to save changes");
        return false;
      }
    }
    return true;
  };

  /** Build payload for a single field (for per-field save). */
  const getFieldValueForEdit = (fieldKey: string): string => {
    if (!stepEditForm) return "";
    if (verifyModalStep === 4) {
      const v = stepEditForm.documents?.[fieldKey];
      return v != null && v !== "" ? String(v) : "";
    }
    const f = stepEditForm as Record<string, unknown>;
    const v = f[fieldKey];
    if (Array.isArray(v)) return v.map((x) => String(x)).join(", ");
    if (v == null || v === "") return "";
    return String(v);
  };

  const buildPayloadForField = (step: number, fieldKey: string): Record<string, unknown> | null => {
    if (!stepEditForm) return null;
    const f = stepEditForm as Record<string, unknown>;
    if (step === 4) {
      const doc = (stepEditForm.documents ?? {}) as Record<string, unknown>;
      const v = doc[fieldKey];
      return { [fieldKey]: v == null || v === "" ? null : String(v) };
    }
    const one: Record<string, unknown> = {};
    if (fieldKey === "store_phones") one.store_phones = Array.isArray(stepEditForm.store_phones) ? stepEditForm.store_phones : undefined;
    else if (fieldKey === "cuisine_types") one.cuisine_types = Array.isArray(stepEditForm.cuisine_types) ? stepEditForm.cuisine_types : undefined;
    else if (f[fieldKey] !== undefined) one[fieldKey] = f[fieldKey];
    return Object.keys(one).length ? one : null;
  };

  const saveFieldEdits = async (fieldKey: string): Promise<boolean> => {
    if (!store || !stepEditForm || verifyModalStep == null) return false;
    const step = verifyModalStep;
    if (step === 4) {
      const payload = buildPayloadForField(step, fieldKey);
      if (!payload) return false;
      const res = await fetch(`/api/merchant/stores/${store.id}/documents`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setError(data?.error || "Failed to save");
        return false;
      }
      return true;
    }
    const payload = buildPayloadForField(step, fieldKey);
    if (!payload || Object.keys(payload).length === 0) return false;
    const res = await fetch(`/api/merchant/stores/${store.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      setError(data?.error || "Failed to save");
      return false;
    }
    return true;
  };

  const handleStartEditField = (fieldKey: string) => {
    setEditStartValues((prev) => ({ ...prev, [fieldKey]: getFieldValueForEdit(fieldKey) }));
    setEditingField(fieldKey);
  };
  const handleConfirmEditField = () => {
    if (editConfirmField) {
      setEditStartValues((prev) => ({ ...prev, [editConfirmField]: getFieldValueForEdit(editConfirmField) }));
      setEditingField(editConfirmField);
      setEditConfirmField(null);
    }
  };

  const handleSaveField = async (fieldKey: string) => {
    if (!store || verifyModalStep == null) return;
    setSavingField(fieldKey);
    setError("");
    const oldValue = editStartValues[fieldKey] ?? null;
    try {
      const ok = await saveFieldEdits(fieldKey);
      if (ok) {
        const newValue = getFieldValueForEdit(fieldKey);
        const editRes = await fetch(`/api/merchant/stores/${store.id}/verification-steps/edits`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            step: verifyModalStep,
            field_key: fieldKey,
            old_value: oldValue || null,
            new_value: newValue || null,
          }),
        });
        const editData = await editRes.json().catch(() => ({}));
        if (editData?.success && store?.id) {
          fetch(`/api/merchant/stores/${store.id}/verification-steps`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
              if (data?.success && data.edits) setStepEdits(data.edits);
            })
            .catch(() => {});
        }
        setEditStartValues((prev) => {
          const next = { ...prev };
          delete next[fieldKey];
          return next;
        });
        setEditingField(null);
      }
    } finally {
      setSavingField(null);
    }
  };

  const handleModalMarkVerified = async () => {
    if (verifyModalStep == null || !store) return;
    const step = verifyModalStep;
    setVerifyingStep(step);
    setError("");
    try {
      const saved = await saveStepEdits(step);
      if (!saved) {
        setVerifyingStep(null);
        return;
      }
      const success = await handleVerifyStep(step, adminOverrideMode);
      if (success) {
        // Locally bump store approval_status to UNDER_VERIFICATION after first verified step
        setStore((prev) => {
          if (!prev) return prev;
          const status = (prev.approval_status || "").toUpperCase();
          if (status === "UNDER_VERIFICATION" || status === "APPROVED" || status === "REJECTED") {
            return prev;
          }
          return { ...prev, approval_status: "UNDER_VERIFICATION" };
        });
        setVerifyModalStep(null);
        setAdminOverrideMode(false);
        // Do not auto-open next step; agent opens it manually when needed.
      }
    } finally {
      setVerifyingStep(null);
    }
  };

  const handleVerify = async (action: "approve" | "reject") => {
    if (!store) return;
    setActionLoading(action);
    try {
      const res = await fetch(`/api/merchant/stores/${store.id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason: action === "reject" ? rejectReason : undefined,
          message: rejectReason.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setStore((s) =>
          s ? { ...s, approval_status: action === "approve" ? "APPROVED" : "REJECTED" } : null
        );
        invalidateMerchantStoresStats();
        setShowFinalDecisionModal(false);
        const em = data.email as
          | { attempted?: boolean; sent?: boolean; skippedReason?: string }
          | undefined;
        if (em?.attempted && !em.sent) {
          if (em.skippedReason === "NOT_CONFIGURED") {
            toast.warning(
              "Saved, but no email was sent. Add EMAIL_ID + EMAIL_APP_PASSWORD (Zoho) or RESEND_API_KEY to dashboard .env.local — the partner site .env is separate — then restart npm run dev."
            );
          } else if (em.skippedReason === "SMTP_AUTH_FAILED") {
            toast.warning(
              "Zoho rejected login (535). Use the same App Password as partnersite: Zoho Mail → Security → App Password, update EMAIL_APP_PASSWORD in dashboard .env.local, restart dev. Default SMTP is smtp.zoho.in (same as partnersite)."
            );
          } else if (em.skippedReason === "SMTP_ERROR" || em.skippedReason === "RESEND_ERROR") {
            toast.warning(
              "Saved, but the email failed to send. Check the terminal for [email] errors and verify SMTP host/port/password or Resend API key."
            );
          }
        } else if (em && !em.attempted && em.skippedReason === "NO_RECIPIENT") {
          toast.warning(
            "Saved, but no email address found for this store. Add store email in merchant data or ensure the onboarding agreement has a signer email."
          );
        } else if (em?.sent) {
          toast.success("Notification email sent to the store contact.");
        }
        if (returnTo) {
          const dest = mergePortalIntoRelativeHref(returnTo, portalForLinks);
          const warnNav =
            em &&
            ((em.attempted && !em.sent) ||
              (!em.attempted && em.skippedReason === "NO_RECIPIENT"));
          if (warnNav) {
            setTimeout(() => router.push(dest), 2200);
          } else {
            router.push(dest);
          }
        }
      } else {
        setError(data.error || "Action failed");
      }
    } catch {
      setError("Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return <VerificationPageSkeleton />;
  }

  if (error && !store) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <p className="text-gray-500">{error}</p>
        <Link
          href={backHref}
          className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Verifications
        </Link>
      </div>
    );
  }

  if (!store) return null;

  const statusUpper = (store.approval_status || "").toUpperCase();
  const isApproved = statusUpper === "APPROVED";
  const isRejectedLike =
    statusUpper === "REJECTED" || statusUpper === "BLOCKED" || statusUpper === "SUSPENDED";
  const isDelisted = statusUpper === "DELISTED";
  // Onboarding verify, rejected-store override, or approved-store doc/step re-verify (admin deep link).
  const canVerify =
    !isDelisted &&
    ((!isApproved && (!isRejectedLike || adminOverrideMode)) ||
      (isApproved && adminOverrideMode && canPerformVerify));
  const canPerformVerifyActions = canVerify && canPerformVerify;
  const isApprovedDocReverify = isApproved && adminOverrideMode && verifyModalStep != null;
  const handleApprovedStoreStep4DocVerified = (
    docType: string,
    documents: Record<string, unknown>
  ) => {
    if (!isApproved) return;
    const label = DOC_TYPE_LABELS[docType as (typeof DOC_TYPES)[number]] ?? docType;
    toast.success(`${label} verified — store stays approved`);
    invalidateMerchantStoresStats();
    if (allStep4DocumentsVerified(documents) && reverifyDeepLink) {
      setTimeout(() => onClose?.(), 500);
    }
  };
  const onboardingStep = store.current_onboarding_step ?? 0;
  const step8Verified = !!(stepVerifications[8]?.verified_at);
  const canVerifyStep = (stepNum: number) =>
    stepNum === 1
      ? true
      : (() => {
          const prev = stepVerifications[stepNum - 1];
          // Allow progress if previous step is VERIFIED or REJECTED.
          // Only block when previous step is still pending (neither verified nor rejected).
          return !!(prev?.verified_at || prev?.rejection);
        })();

  const profileMediaStoreId =
    store.id ??
    (Number.isFinite(Number.parseInt(storeId, 10)) ? Number.parseInt(storeId, 10) : undefined);

  const storeEmail = store.store_email ?? verificationData?.store?.store_email ?? null;
  const createdAt = store.created_at ?? verificationData?.store?.created_at ?? null;
  const storePhones = (verificationData?.store?.store_phones && verificationData.store.store_phones.length > 0)
    ? verificationData.store.store_phones
    : [];
  const fullAddress =
    verificationData?.store?.full_address ||
    store.full_address ||
    null;

  const assignedAreaManagers = verificationData?.assignedAreaManagers ?? [];
  const step8SignatureUrl = (verificationData?.agreementAcceptance as { signature_data_url?: string } | null)?.signature_data_url ?? null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {verifyModalStep == null ? (
          embedded ? (
            <button
              type="button"
              onClick={() => onClose?.()}
              className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-3 w-3" />
              Close
            </button>
          ) : (
            <Link
              href={backHref}
              className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to Verifications
            </Link>
          )
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (reverifyDeepLink) {
                  onClose?.();
                  return;
                }
                setAdminOverrideMode(false);
                setVerifyModalStep(null);
              }}
              className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              <ArrowLeft className="h-3 w-3" />
              {reverifyDeepLink ? "Close" : "Back to all steps"}
            </button>
            <span className="truncate text-xs font-medium text-gray-700">
              Verify step {verifyModalStep}:{" "}
              {ONBOARDING_STEP_LABELS[verifyModalStep] ?? `Step ${verifyModalStep}`}
            </span>
          </div>
        )}
        {step8Verified && canPerformVerifyActions && !isApproved && (
          <button
            type="button"
            onClick={() => setShowFinalDecisionModal(true)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-indigo-600 bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            Final decision (Approve / Reject)
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gray-50/50 px-2.5 py-1.5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-100">
                <Store className="h-3 w-3 text-indigo-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-1.5">
                  <h1 className="text-[13px] font-semibold text-gray-900 line-clamp-2">{store.name}</h1>
                  {isApproved && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                      <CheckCircle className="h-2.5 w-2.5" />
                      Verified
                    </span>
                  )}
                  {isRejectedLike && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800">
                      <XCircle className="h-2.5 w-2.5" />
                      Rejected
                    </span>
                  )}
                  {isDelisted && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800">
                      <XCircle className="h-2.5 w-2.5" />
                      Delisted
                    </span>
                  )}
                  {canVerify && !isRejectedLike && !isApproved && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                      <FileText className="h-2.5 w-2.5" />
                      Pending
                    </span>
                  )}
                  {isApproved && isApprovedDocReverify && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-900">
                      <FileText className="h-2.5 w-2.5" />
                      Doc review
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-start gap-1 text-[10px] text-gray-600">
                  <UserCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" aria-hidden />
                  <div className="min-w-0">
                    <span className="font-medium text-gray-700">Area manager</span>
                    {assignedAreaManagers.length > 0 ? (
                      <ul className="mt-0.5 list-none space-y-0">
                        {assignedAreaManagers.map((am) => (
                          <li key={am.id} className="break-words">
                            <span className="font-medium text-gray-800">{am.full_name?.trim() || "—"}</span>
                            {am.email ? (
                              <span className="text-gray-600">
                                {" "}
                                · {am.email}
                              </span>
                            ) : null}
                            {am.mobile ? (
                              <span className="text-gray-600">
                                {" "}
                                · {String(am.mobile)}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-0.5 text-gray-500">None assigned</p>
                    )}
                  </div>
                </div>
                <p className="mt-0.5 overflow-x-auto whitespace-nowrap text-[10px] text-gray-500">
                  {store.store_id}
                </p>
              </div>
            </div>
            {(fullAddress != null || storePhones.length > 0 || (storeEmail != null && storeEmail !== "") || createdAt != null) && (
              <div className="flex shrink-0 flex-col items-end gap-y-0 text-[10px] text-gray-600 text-right">
                {createdAt != null && (
                  <span>
                    Created:{" "}
                    <span className="font-medium text-gray-700">
                      {new Date(createdAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </span>
                )}
                {fullAddress != null && fullAddress !== "" && (
                  <span className="block overflow-x-auto whitespace-nowrap">
                    Full address: <span className="font-medium text-gray-700">{fullAddress}</span>
                  </span>
                )}
                {storePhones.length > 0 && (
                  <span className="flex items-center justify-end gap-1 overflow-x-auto whitespace-nowrap">
                    {storePhones.length === 1 ? "Phone:" : "Phones:"}{" "}
                    <span className="font-medium text-gray-700">{storePhones.join(", ")}</span>
                    <button
                      type="button"
                      onClick={copyPhone}
                      className="inline-flex cursor-pointer items-center rounded p-0.5 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                      title="Copy phone(s)"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    {copyPhoneSuccess && (
                      <span className="text-[10px] font-medium text-emerald-600">Copied</span>
                    )}
                  </span>
                )}
                {storeEmail != null && storeEmail !== "" && (
                  <span className="flex items-center gap-1 overflow-x-auto whitespace-nowrap">
                    Email: <span className="font-medium text-gray-700">{storeEmail}</span>
                    <button
                      type="button"
                      onClick={copyEmail}
                      className="inline-flex cursor-pointer items-center rounded p-0.5 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                      title="Copy email"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    {copySuccess && (
                      <span className="text-[10px] font-medium text-emerald-600">Copied</span>
                    )}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-3">
          {canVerify && (
            <>
              {verifyModalStep == null ? (
              <>
              <p className="mb-1.5 text-[11px] text-gray-500">
                Verify steps in order; step 8 must be verified before you can approve or reject.
              </p>

              {/* Hybrid overview: horizontal quick-step strip + vertical detailed cards */}
              <div className="mb-2 overflow-x-auto pb-1">
                <div className="inline-flex min-w-full items-center gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((stepNum) => {
                    const label = ONBOARDING_STEP_LABELS[stepNum] ?? `Step ${stepNum}`;
                    const agentVerified = stepVerifications[stepNum]?.verified_at ? stepVerifications[stepNum] : null;
                    const merchantCompleted =
                      stepNum === 6
                        ? (verificationData?.bankAccounts?.length ?? 0) > 0 || onboardingStep >= 6
                        : onboardingStep >= stepNum;
                    const status =
                      agentVerified ? "verified"
                      : !merchantCompleted ? "pending_merchant"
                      : "pending_agent";
                    const canClickStep = canVerifyStep(stepNum);

                    return (
                      <button
                        key={`step-strip-${stepNum}`}
                        type="button"
                        onClick={() => setExpandedStep((prev) => (prev === stepNum ? null : stepNum))}
                        className={`inline-flex min-w-[120px] cursor-pointer items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition ${
                          expandedStep === stepNum
                            ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                            : "border-gray-200 bg-white text-gray-700 hover:border-indigo-300 hover:text-indigo-700"
                        }`}
                        title={label}
                      >
                        {agentVerified ? (
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                        ) : status === "pending_agent" ? (
                          <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                        ) : (
                          <Clock className="h-3.5 w-3.5 text-gray-400" />
                        )}
                        <span className="truncate">Step {stepNum}</span>
                        {!canClickStep && status === "pending_agent" && (
                          <span className="rounded bg-gray-100 px-1 py-0.5 text-[9px] text-gray-500">
                            Locked
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Vertical timeline: 8 steps (6=Bank, 7=Commission, 8=Sign & submit) */}
              <div className="relative space-y-0">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((stepNum) => {
                  const label = ONBOARDING_STEP_LABELS[stepNum] ?? `Step ${stepNum}`;
                  const agentVerified = stepVerifications[stepNum]?.verified_at ? stepVerifications[stepNum] : null;
                  const stepRejection = stepVerifications[stepNum]?.rejection ?? null;
                  const merchantCompleted =
                    stepNum === 6
                      ? (verificationData?.bankAccounts?.length ?? 0) > 0 || onboardingStep >= 6
                      : onboardingStep >= stepNum;
                  const isLast = stepNum === 8;
                  const status =
                    agentVerified ? "verified"
                    : !merchantCompleted ? "pending_merchant"
                    : "pending_agent";
                  const canClickStep = canVerifyStep(stepNum);
                  const showVerifyButton =
                    !agentVerified && status === "pending_agent" && canClickStep;

                  return (
                    <div
                      key={stepNum}
                      className="relative flex gap-2"
                      style={{ minHeight: "36px" }}
                    >
                      {/* Timeline line */}
                      {!isLast && (
                        <div
                          className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-gray-200"
                          aria-hidden
                        />
                      )}
                      {/* Step number circle */}
                      <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 bg-white text-xs font-semibold text-gray-700">
                        {agentVerified ? (
                          <CheckCircle className="h-4 w-4 text-emerald-600" />
                        ) : status === "pending_agent" ? (
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                        ) : (
                          <Clock className="h-3.5 w-3.5 text-gray-400" />
                        )}
                      </div>
                      {/* Content */}
                      <div className="min-w-0 flex-1 pb-1">
                        <div
                          className={`rounded-lg border p-1.5 ${
                            agentVerified?.notes === "ADMIN_OVERRIDE"
                              ? "border-emerald-200 bg-emerald-50/60"
                              : "border-gray-200 bg-gray-50/50"
                          }`}
                        >
                          {/* Row 1: Title + badges (left), Action buttons (right) */}
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <div className="flex flex-wrap items-center gap-1 min-w-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedStep((prev) => (prev === stepNum ? null : stepNum))
                                }
                                className="inline-flex cursor-pointer items-center gap-0.5 text-xs font-medium text-gray-900 hover:text-indigo-600"
                              >
                                {expandedStep === stepNum ? (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5" />
                                )}
                                Step {stepNum}: {label}
                              </button>
                              {merchantCompleted && (
                                <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-600">
                                  Filled by store
                                </span>
                              )}
                              {agentVerified && (
                                <span
                                  className={`rounded px-1 py-0.5 text-[10px] font-medium ${
                                    agentVerified.notes === "ADMIN_OVERRIDE"
                                      ? "bg-emerald-200 text-emerald-950"
                                      : "bg-emerald-100 text-emerald-800"
                                  }`}
                                >
                                  {agentVerified.notes === "ADMIN_OVERRIDE" ? "Verified by Admin" : "Verified"}
                                </span>
                              )}
                              {!agentVerified && merchantCompleted && (
                                <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800">
                                  Action required
                                </span>
                              )}
                              {!agentVerified && stepRejection && (
                                <span
                                  className="rounded bg-red-100 px-1 py-0.5 text-[10px] font-medium text-red-800"
                                  title={stepRejection.rejection_reason}
                                >
                                  Rejected
                                </span>
                              )}
                              {!agentVerified && stepRejection?.merchant_resubmitted_at && (
                                <span
                                  className="rounded bg-sky-100 px-1 py-0.5 text-[10px] font-medium text-sky-900"
                                  title={`Partner saved new data: ${new Date(stepRejection.merchant_resubmitted_at).toLocaleString()}`}
                                >
                                  Store resubmitted
                                </span>
                              )}
                              {!agentVerified &&
                                stepNum === 4 &&
                                step4AnyResubmittedAfterReject(verificationData?.documents) && (
                                  <span
                                    className="rounded bg-sky-100 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-900"
                                    title="At least one rejected document has a new file from the partner portal (or dashboard upload)."
                                  >
                                    Resubmitted
                                  </span>
                                )}
                              {status === "pending_merchant" && (
                                <span className="rounded bg-gray-100 px-1 py-0.5 text-[10px] text-gray-500">
                                  Not filled by store
                                </span>
                              )}
                              {status === "pending_agent" && !canClickStep && (
                                <span className="rounded bg-gray-100 px-1 py-0.5 text-[10px] text-gray-500">
                                  Verify previous step first
                                </span>
                              )}
                            </div>
                            {status !== "pending_merchant" && (
                              <div className="flex items-center shrink-0 ml-auto">
                                <button
                                  type="button"
                                  title={agentVerified ? "View" : "View & verify"}
                                  disabled={
                                    verifyingStep !== null ||
                                    unverifyingStep !== null ||
                                    (canPerformVerify && !agentVerified && !showVerifyButton)
                                  }
                                  onClick={() => {
                                    // For rejected stores (REJECTED/BLOCKED/SUSPENDED), keep override enabled
                                    // so the step panel doesn't unmount and "View" doesn't look like it redirects.
                                    setAdminOverrideMode((prev) => prev || isRejectedLike);
                                    setVerifyModalStep(stepNum);
                                  }}
                                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-indigo-600 bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <CheckCircle className="h-3.5 w-3.5" />
                                  {agentVerified
                                    ? "View"
                                    : !canPerformVerify
                                      ? "View"
                                      : stepRejection?.merchant_resubmitted_at ||
                                          (stepNum === 4 &&
                                            step4AnyResubmittedAfterReject(verificationData?.documents))
                                        ? "Verify again"
                                        : stepRejection
                                          ? "Edit & Approve"
                                          : "View & verify"}
                                </button>
                              </div>
                            )}
                          </div>
                          {/* Row 2: Verified by / contact message; for step 4 show doc summary for this store */}
                          <div className="mt-0.5 text-[11px] text-gray-500">
                            {agentVerified ? (
                              <span>
                                Verified by {agentVerified.verified_by_name ?? "—"} ·{" "}
                                {agentVerified.verified_at != null
                                  ? new Date(agentVerified.verified_at).toLocaleString()
                                  : "—"}
                                {agentVerified.notes === "ADMIN_OVERRIDE" ? (
                                  <span className="ml-2 inline-flex items-center rounded bg-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-950">
                                    Verified by Admin
                                  </span>
                                ) : null}
                              </span>
                            ) : status === "pending_merchant" ? (
                              <span>Contact merchant (call / email) to complete this step.</span>
                            ) : !canClickStep ? (
                              <span>Verify step {stepNum - 1} first</span>
                            ) : null}
                            {stepNum === 4 && (() => {
                              const docSummary = getDocSummaryForStore();
                              return docSummary.length > 0 ? (
                                <span className="block mt-0.5 text-[10px] text-gray-600">
                                  Docs: {docSummary.join(", ")}
                                </span>
                              ) : null;
                            })()}
                            {!agentVerified && stepRejection && (
                              <div className="mt-1.5 rounded border border-red-100 bg-red-50/60 px-2 py-1.5 text-[10px] leading-snug text-red-950">
                                <p className="font-semibold text-red-900">Rejection record</p>
                                <p>
                                  <span className="text-red-800/75">What:</span>{" "}
                                  {stepRejection.step_label ?? label}
                                </p>
                                <p>
                                  <span className="text-red-800/75">Why:</span>{" "}
                                  {stepRejection.rejection_reason}
                                </p>
                                <p>
                                  <span className="text-red-800/75">Who:</span>{" "}
                                  {stepRejection.rejected_by_name ?? "—"} ·{" "}
                                  {new Date(stepRejection.rejected_at).toLocaleString()}
                                </p>
                                <p>
                                  <span className="text-red-800/75">Email to partner:</span>{" "}
                                  {stepRejection.email_sent
                                    ? "Sent"
                                    : `Not sent${stepRejection.email_skip_reason ? ` (${stepRejection.email_skip_reason})` : ""}`}
                                </p>
                                {stepRejection.merchant_resubmitted_at ? (
                                  <p className="mt-0.5 text-sky-900">
                                    <span className="text-sky-800/80">Partner dashboard update:</span>{" "}
                                    {new Date(stepRejection.merchant_resubmitted_at).toLocaleString()}
                                  </p>
                                ) : (
                                  <p className="mt-0.5 text-amber-800/90">
                                    Waiting for partner to update this step on the partner portal.
                                  </p>
                                )}
                                {stepNum === 3 && stepRejection.rejection_detail != null && (
                                  <MenuReferenceRejectionSnapshot detail={stepRejection.rejection_detail} />
                                )}
                              </div>
                            )}
                          </div>
                          {/* Row 3: Edits — centered */}
                          {stepEdits[stepNum]?.length > 0 && (
                            <div className="mt-0.5 text-center text-[10px] text-gray-500">
                              Edits:{" "}
                              {stepEdits[stepNum].slice(0, 3).map((e) => (
                                <span key={`${e.field_key}-${e.edited_at}`} className="mr-2">
                                  {e.field_key} by {e.edited_by_name ?? "—"} ({new Date(e.edited_at).toLocaleString()})
                                </span>
                              ))}
                              {stepEdits[stepNum].length > 3 && (
                                <button
                                  type="button"
                                  onClick={() => setHistoryModalStep(stepNum)}
                                  className="ml-1 cursor-pointer text-[10px] font-medium text-indigo-600 underline-offset-2 hover:underline"
                                >
                                  View more ({stepEdits[stepNum].length - 3} more)
                                </button>
                              )}
                            </div>
                          )}
                          {expandedStep === stepNum && verificationData?.store && (
                            <StepDetailContent
                              stepNum={stepNum}
                              store={verificationData.store}
                              documents={verificationData.documents}
                              menuFiles={stepNum === 3 ? menuMediaFiles : undefined}
                              menuReviewStoreId={store?.id}
                              menuReviewInteractive={canPerformVerifyActions}
                              onMenuMediaUpdated={refetchMenuMedia}
                              operatingHours={verificationData.operatingHours ?? null}
                              onboardingPayments={verificationData.onboardingPayments}
                              agreementAcceptance={verificationData.agreementAcceptance ?? null}
                              bankAccounts={verificationData.bankAccounts}
                              bankAccountsStoreId={store?.id}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              </>
              ) : (
              <section
                className="rounded-lg border border-gray-200 bg-white"
                aria-labelledby="verify-step-panel-title"
              >
                {isApprovedDocReverify && (
                  <p className="mx-4 mt-3 text-[11px] leading-relaxed text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                    This store is already approved. Verify only the new or updated licence/document using each
                    card&apos;s <span className="font-semibold">Verify</span> button — no final store approval or
                    &quot;Mark step verified&quot; needed.
                  </p>
                )}
                <div className="px-4 py-3">
                  {stepEditForm ? (
                    <StepDetailContentEditable
                      stepNum={verifyModalStep}
                      form={stepEditForm}
                      onChange={(updates) =>
                        setStepEditForm((prev) => (prev ? { ...prev, ...updates } : null))
                      }
                      editingField={editingField}
                      onStartEdit={handleStartEditField}
                      onSaveField={(fieldKey) => setSaveConfirm({ type: "field", fieldKey })}
                      savingField={savingField}
                      adminOverrideMode={adminOverrideMode}
                      menuFiles={verifyModalStep === 3 ? menuMediaFiles : undefined}
                      storeIdForUpload={store?.id}
                      onMenuUploadComplete={refetchMenuMedia}
                      menuReviewInteractive={canPerformVerifyActions}
                      onMenuMediaUpdated={refetchMenuMedia}
                      storeIdForDocUpload={store?.id}
                      onDocumentsUpdated={() => {}}
                      onDocumentPreview={setDocPreview}
                      operatingHours={verificationData?.operatingHours ?? null}
                      onboardingPayments={verificationData?.onboardingPayments}
                      agreementAcceptance={verificationData?.agreementAcceptance ?? null}
                      bankAccounts={verificationData?.bankAccounts}
                      storeIdForProfileMedia={profileMediaStoreId}
                      profileMediaInteractive={canPerformVerifyActions}
                      canPerformVerify={canPerformVerify}
                      onStep4DocVerified={
                        isApproved ? handleApprovedStoreStep4DocVerified : undefined
                      }
                      onProfileMediaUpdated={() => {}}
                      onProfileMediaSaved={handleProfileMediaSaved}
                      onOperatingHoursUpdated={() => void refetchOperatingHours()}
                    />
                  ) : verificationData?.store ? (
                    <p className="text-sm text-gray-500">Loading step data...</p>
                  ) : (
                    <p className="text-sm text-gray-500">Loading step data...</p>
                  )}
                </div>
                {!isApprovedDocReverify && (
                <div className="flex flex-nowrap items-center justify-between gap-3 border-t border-gray-100 bg-gray-50/50 px-4 py-3">
                <div
                  className={
                    verifyModalStep === 8 ? "flex flex-[0_0_50%] min-w-0 items-center" : "flex items-center gap-2"
                  }
                >
                    {verifyModalStep === 8 && (
                      step8SignatureUrl ? (
                        <img
                          src={step8SignatureUrl}
                          alt="Signature"
                          className="mx-auto block h-12 w-full rounded border border-gray-200 bg-white object-contain"
                        />
                      ) : (
                        <span className="mx-auto block text-xs text-gray-400">No signature</span>
                      )
                    )}
                    {verifyModalStep === 2 && (() => {
                      const savedLat = verificationData?.store?.latitude ?? null;
                      const savedLng = verificationData?.store?.longitude ?? null;
                      const formLat = stepEditForm?.latitude ?? null;
                      const formLng = stepEditForm?.longitude ?? null;
                      const coordsEqual = (a: number | null, b: number | null) =>
                        a === b || (a != null && b != null && Math.abs(a - b) < 1e-9);
                      const locationDirty =
                        !coordsEqual(savedLat, formLat) || !coordsEqual(savedLng, formLng);
                      return locationDirty ? (
                        <button
                          type="button"
                          disabled={savingLocation || verifyingStep !== null}
                          onClick={() => setSaveConfirm({ type: "location" })}
                          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-indigo-600 bg-white px-3 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
                        >
                          {savingLocation ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          Save location
                        </button>
                      ) : null;
                    })()}
                    {canPerformVerifyActions &&
                      verifyModalStep !== 8 &&
                      (verifyModalStep !== 3 || !menuStepAllItemsAccepted(menuMediaFiles)) &&
                      (verifyModalStep !== 4 ||
                        !allStep4DocumentsVerified(stepEditForm?.documents ?? verificationData?.documents)) && (
                        <button
                          type="button"
                          title="Reject step — email reason to store"
                          disabled={verifyingStep !== null || unverifyingStep !== null}
                          onClick={() => {
                            setStepRejectReasonDraft("");
                            setActionConfirm({ stepNum: verifyModalStep, action: "reject" });
                          }}
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-red-600 bg-red-50 px-2.5 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                        >
                          <XCircle className="h-4 w-4" />
                          Reject
                        </button>
                      )}
                  </div>
                <div
                  className={
                    verifyModalStep === 8
                      ? "flex flex-[0_0_50%] min-w-0 items-center justify-end gap-2"
                      : "flex items-center justify-end gap-2"
                  }
                >
                    {canPerformVerifyActions && verifyModalStep === 8 && (
                        <button
                          type="button"
                          title="Reject step — email reason to store"
                          disabled={verifyingStep !== null || unverifyingStep !== null}
                          onClick={() => {
                            setStepRejectReasonDraft("");
                            setActionConfirm({ stepNum: verifyModalStep, action: "reject" });
                          }}
                          className="flex-1 inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-red-600 bg-red-50 px-2.5 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                        >
                          <XCircle className="h-4 w-4" />
                          Reject
                        </button>
                      )}
                    {canPerformVerifyActions &&
                    !isApprovedDocReverify &&
                    (verifyModalStep !== 3 || menuStepAllItemsAccepted(menuMediaFiles)) &&
                      (verifyModalStep !== 4 ||
                        allStep4DocumentsVerified(stepEditForm?.documents ?? verificationData?.documents)) &&
                      (verifyModalStep !== 6 || (verificationData?.bankAccounts?.length ?? 0) > 0) &&
                      (() => {
                        const stepNum = verifyModalStep;
                        const stepRow =
                          stepNum != null
                            ? stepVerifications[stepNum] ??
                              (stepVerifications as unknown as Record<string, StepVerification>)[
                                String(stepNum)
                              ]
                            : undefined;
                        const stepVerified = !!stepRow?.verified_at;
                        if (stepVerified) {
                          return (
                            <span
                              className={`inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 ${
                                verifyModalStep === 8 ? "flex-1 justify-center" : ""
                              }`}
                            >
                              <CheckCircle className="h-4 w-4 text-emerald-600" />
                              Verified
                            </span>
                          );
                        }
                        return (
                          <button
                            type="button"
                            disabled={
                              verifyingStep !== null ||
                              (verifyModalStep === 4 &&
                                !allStep4DocumentsVerified(
                                  stepEditForm?.documents ?? verificationData?.documents
                                ))
                            }
                            onClick={() => void handleModalMarkVerified()}
                            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 ${
                              verifyModalStep === 8 ? "flex-1 justify-center" : ""
                            }`}
                          >
                            {verifyingStep === verifyModalStep ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle className="h-4 w-4" />
                            )}
                            Mark as verified
                          </button>
                        );
                      })()}
                  </div>
                </div>
                )}
              </section>
              )}

              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            </>
          )}

      {!canVerify && verifyModalStep == null && (
        <p className="text-sm text-gray-500">
          {isDelisted
            ? "This store has been delisted and cannot be re-verified."
            : isApproved && canPerformVerify
              ? "This store is approved. Open a pending document or verification step to re-verify."
              : `This store has already been ${isApproved ? "approved" : "rejected"}.`}
        </p>
      )}
        </div>
      </div>

      {canPerformVerify && isRejectedLike && !adminOverrideMode && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => {
              setAdminOverrideMode(true);
              setVerifyModalStep(null);
              setExpandedStep(null);
              setError(null);
            }}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-amber-500 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100"
            title="Enable admin override review so steps can be re-verified and the store can be approved again."
          >
            <Pencil className="h-4 w-4" />
            Review rejected store
          </button>
        </div>
      )}

      {/* Final decision modal — Approve / Reject store */}
      {showFinalDecisionModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="final-decision-modal-title"
        >
          <div className="relative w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 id="final-decision-modal-title" className="text-base font-semibold text-gray-900">
                Final decision
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                Approve or reject this store after verifying all steps. Rejection requires a reason.
              </p>
            </div>
            <div className="px-4 py-3 space-y-3">
              <div>
                <label className="mb-0.5 block text-xs font-medium text-gray-500">
                  Message to store owner (sent via email on Approve / Reject). Required when rejecting.
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason for rejection or message for approval..."
                  rows={3}
                  wrap="off"
                  className="w-full resize-none overflow-x-auto rounded border border-gray-300 px-2.5 py-1.5 text-sm whitespace-nowrap focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 px-4 py-3">
              <button
                type="button"
                onClick={() => setShowFinalDecisionModal(false)}
                className="cursor-pointer rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => handleVerify("reject")}
                disabled={actionLoading !== null || !rejectReason.trim()}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading === "reject" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                Reject
              </button>
              <button
                type="button"
                onClick={() => handleVerify("approve")}
                disabled={actionLoading !== null}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {actionLoading === "approve" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Centralized action confirm modal — Verify / Pending / Reject */}
      {actionConfirm != null && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="action-confirm-title"
        >
          <div
            className={`relative w-full rounded-xl border border-gray-200 bg-white shadow-xl ${
              actionConfirm.action === "reject" ? "max-w-md" : "max-w-sm"
            }`}
          >
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 id="action-confirm-title" className="text-base font-semibold text-gray-900">
                {actionConfirm.action === "reject"
                  ? `Reject step ${actionConfirm.stepNum}: ${ONBOARDING_STEP_LABELS[actionConfirm.stepNum] ?? `Step ${actionConfirm.stepNum}`}`
                  : `Step ${actionConfirm.stepNum}: ${ONBOARDING_STEP_LABELS[actionConfirm.stepNum] ?? `Step ${actionConfirm.stepNum}`}`}
              </h2>
              {actionConfirm.action === "verify" && (
                <p className="mt-2 text-sm text-gray-600">
                  Open this step to review and mark as verified.
                </p>
              )}
              {actionConfirm.action === "reject" && (
                <p className="mt-2 text-sm text-gray-600">
                  Enter a <strong>reason for rejection</strong> below. The store owner receives this by email, and this step is marked not verified.
                </p>
              )}
            </div>
            {actionConfirm.action === "reject" && (
              <div className="px-4 py-3 border-b border-gray-100">
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  Reason for rejection (required) — sent to the store by email
                </label>
                <textarea
                  value={stepRejectReasonDraft}
                  onChange={(e) => setStepRejectReasonDraft(e.target.value)}
                  placeholder="Explain what the merchant must fix…"
                  rows={4}
                  className="w-full resize-y rounded border border-gray-300 px-2.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  setActionConfirm(null);
                  setStepRejectReasonDraft("");
                }}
                className="cursor-pointer rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              {actionConfirm.action === "verify" ? (
                <button
                  type="button"
                  onClick={() => {
                    setVerifyModalStep(actionConfirm!.stepNum);
                    setActionConfirm(null);
                  }}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  <CheckCircle className="h-4 w-4" />
                  Open & verify
                </button>
              ) : actionConfirm.action === "reject" ? (
                <button
                  type="button"
                  disabled={
                    unverifyingStep === actionConfirm.stepNum ||
                    (actionConfirm.action === "reject" &&
                      stepRejectReasonDraft.trim().length < 3)
                  }
                  onClick={() =>
                    actionConfirm.action === "reject"
                      ? handleSetStepPending(actionConfirm.stepNum, stepRejectReasonDraft)
                      : null
                  }
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {unverifyingStep === actionConfirm.stepNum ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  Send email & reset step
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Centralized save confirm modal — before any Save (location or field) */}
      {saveConfirm != null && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-confirm-title"
        >
          <div className="relative w-full max-w-sm rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 id="save-confirm-title" className="text-base font-semibold text-gray-900">
                Save changes
              </h2>
              <p className="mt-2 text-sm text-gray-600">Do you want to save these changes now?</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3">
              <button
                type="button"
                onClick={() => setSaveConfirm(null)}
                className="cursor-pointer rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingField !== null || savingLocation}
                onClick={async () => {
                  if (saveConfirm.type === "location" && store && stepEditForm && verifyModalStep === 2) {
                    setSavingLocation(true);
                    try {
                      const ok = await saveStepEdits(2);
                      if (ok && stepEditForm) {
                        setVerificationData((prev) =>
                          prev
                            ? {
                                ...prev,
                                store: {
                                  ...prev.store,
                                  latitude: stepEditForm.latitude ?? undefined,
                                  longitude: stepEditForm.longitude ?? undefined,
                                },
                              }
                            : null
                        );
                      }
                    } finally {
                      setSavingLocation(false);
                      setSaveConfirm(null);
                    }
                  } else if (saveConfirm.type === "field" && store && verifyModalStep != null) {
                    await handleSaveField(saveConfirm.fieldKey);
                    setSaveConfirm(null);
                  }
                }}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 4 — full-size document preview */}
      {docPreview != null && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="doc-preview-title"
          onClick={() => setDocPreview(null)}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 bg-slate-50 px-4 py-3">
              <h3 id="doc-preview-title" className="truncate text-sm font-semibold text-gray-900">
                {docPreview.title}
              </h3>
              <button
                type="button"
                onClick={() => setDocPreview(null)}
                className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto bg-gray-100 p-4 lg:flex-row lg:items-start">
              <div className="min-h-0 min-w-0 flex-1">
                {docAttachmentLooksPdf(docPreview.url) ? (
                  <iframe
                    src={resolveAttachmentProxyUrl(docPreview.url)}
                    className="h-[min(78vh,720px)] w-full rounded-lg border border-gray-200 bg-white"
                    title={docPreview.title}
                  />
                ) : (
                  <R2Image
                    src={docPreview.url}
                    alt={docPreview.title}
                    className="mx-auto max-h-[min(78vh,720px)] w-auto max-w-full rounded-lg border border-gray-200 bg-white object-contain shadow-sm"
                  />
                )}
              </div>
              {docPreview.metaLines != null && docPreview.metaLines.length > 0 && (
                <aside className="w-full shrink-0 overflow-auto rounded-lg border border-gray-200 bg-white p-3 shadow-sm lg:max-w-sm">
                  <p className="mb-2 text-xs font-semibold text-gray-800">Document details</p>
                  <dl className="space-y-2 text-xs">
                    {docPreview.metaLines.map((m, mi) => (
                      <div key={`${mi}-${m.label}`} className="border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-gray-500">{m.label}</dt>
                        <dd className="mt-0.5 break-words text-gray-900">{m.value}</dd>
                      </div>
                    ))}
                  </dl>
                </aside>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit history modal */}
      {historyModalStep != null && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-history-modal-title"
        >
          <div className="relative w-full max-w-2xl rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 id="edit-history-modal-title" className="text-base font-semibold text-gray-900">
                Edit history · Step {historyModalStep}: {ONBOARDING_STEP_LABELS[historyModalStep] ?? `Step ${historyModalStep}`}
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                This shows all field changes made during verification for this step.
              </p>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
              {stepEdits[historyModalStep]?.length ? (
                <table className="min-w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-[11px] text-gray-500">
                      <th className="px-2 py-1 text-left font-medium">Field</th>
                      <th className="px-2 py-1 text-left font-medium">Old value</th>
                      <th className="px-2 py-1 text-left font-medium">New value</th>
                      <th className="px-2 py-1 text-left font-medium">Edited by</th>
                      <th className="px-2 py-1 text-left font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stepEdits[historyModalStep].map((e) => (
                      <tr key={`${e.field_key}-${e.edited_at}`} className="border-b border-gray-100 align-top">
                        <td className="px-2 py-1 font-medium text-gray-700">{e.field_key}</td>
                        <td className="px-2 py-1 text-gray-500 max-w-xs break-words">{e.old_value ?? "—"}</td>
                        <td className="px-2 py-1 text-gray-800 max-w-xs break-words">{e.new_value ?? "—"}</td>
                        <td className="px-2 py-1 text-gray-500">{e.edited_by_name ?? "—"}</td>
                        <td className="px-2 py-1 text-gray-500 whitespace-nowrap">
                          {new Date(e.edited_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-gray-500">No edit history recorded for this step.</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-4 py-3">
              <button
                type="button"
                onClick={() => setHistoryModalStep(null)}
                className="cursor-pointer rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <Toaster position="top-right" richColors />
    </div>
  );
}

