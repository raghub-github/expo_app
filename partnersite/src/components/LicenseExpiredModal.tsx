'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  ChevronRight,
  Eye,
  FileText,
  History,
  Loader2,
  ShieldAlert,
  Upload,
  X,
} from 'lucide-react';
import {
  formatHistoryVerificationLabel,
  type MerchantLicenceHistoryRow,
} from '@/lib/merchantLicenceHistory';
import { toast } from 'sonner';
import {
  DOCUMENT_FORMAL_NAMES,
  formatLicenseExpiryDisplay,
  LICENSE_ONLINE_BLOCKED_TOAST,
  LICENSE_RENEWAL_BLOCKED_MESSAGE,
  type LicenseDocumentActionItem,
  type MerchantDocumentPrefix,
} from '@/lib/merchantLicenseExpiry';
import {
  labelsFromPendingDocs,
  markLicenseVerifyMarquee,
  notifyLicenseReviewModalOpen,
} from '@/lib/licenseVerifyMarquee';
import { istTodayKey } from '@/lib/merchant-wallet-resolve';
import { DocumentUrlPreview } from '@/components/DocumentUrlPreview';

type UploadForm = {
  documentNumber: string;
  issueDate: string;
  expiryDate: string;
  fileFront: File | null;
  fileBack: File | null;
};

type SerializedHistoryRow = {
  id: number;
  licence_number: string | null;
  expires_at: string | null;
  uploaded_at: string;
  issued_at: string | null;
  verification_status: string;
  is_active: boolean;
  is_expired: boolean;
};

type Props = {
  storeId: string;
  open: boolean;
  expired?: { prefix: MerchantDocumentPrefix; label: string }[];
  pendingVerification?: { prefix: MerchantDocumentPrefix; label: string }[];
  initialStepPrefix?: MerchantDocumentPrefix | null;
  onClose: () => void;
  onUploaded: () => void | Promise<void>;
};

function statusBadgeClass(doc: LicenseDocumentActionItem): string {
  if (doc.status === 'expired') return 'bg-red-100 text-red-800 border-red-200';
  if (doc.status === 'pending_verification') return 'bg-orange-100 text-orange-800 border-orange-200';
  if (doc.status === 'expiring_soon' && doc.expiry_date === istTodayKey()) {
    return 'bg-amber-100 text-amber-900 border-amber-300';
  }
  if (doc.status === 'expiring_soon') return 'bg-amber-50 text-amber-800 border-amber-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

function fileKind(file: File): 'image' | 'pdf' | 'other' {
  const mime = (file.type || '').toLowerCase();
  const name = file.name.toLowerCase();
  if (mime.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(name)) return 'image';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  return 'other';
}

function FilePicker({
  label,
  hint,
  file,
  disabled,
  onPick,
}: {
  label: string;
  hint?: string;
  file: File | null;
  disabled?: boolean;
  onPick: (f: File | null) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(true);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      setPreviewOpen(true);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setPreviewOpen(true);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const kind = file ? fileKind(file) : null;

  return (
    <div>
      <p className="block text-xs font-semibold text-gray-800 mb-1">{label}</p>
      {hint ? <p className="text-[11px] text-gray-500 mb-2">{hint}</p> : null}
      <label
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-4 text-sm transition-colors ${
          disabled
            ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
            : 'border-gray-300 text-gray-600 hover:border-sky-400 hover:bg-sky-50/50'
        }`}
      >
        <Upload size={18} className={disabled ? 'text-gray-400' : 'text-sky-600'} />
        <span className="font-medium truncate max-w-[min(280px,100%)]">
          {file ? file.name : 'Choose file (PDF or image)'}
        </span>
        <input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          className="sr-only"
          disabled={disabled}
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
      </label>

      {file && previewUrl ? (
        <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/40 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-sky-100 bg-white/80">
            <span className="text-[11px] font-semibold text-gray-700">Preview before upload</span>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-100"
                onClick={() => setPreviewOpen((v) => !v)}
              >
                <Eye className="h-3.5 w-3.5" />
                {previewOpen ? 'Hide' : 'Show'}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-100"
                onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}
              >
                Open full
              </button>
              {!disabled ? (
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50"
                  onClick={() => onPick(null)}
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>

          {previewOpen ? (
            <div className="p-3 bg-white">
              {kind === 'image' ? (
                <img
                  src={previewUrl}
                  alt={`Preview of ${file.name}`}
                  className="mx-auto max-h-[min(280px,40vh)] w-auto max-w-full rounded-lg border border-gray-200 object-contain"
                />
              ) : kind === 'pdf' ? (
                <iframe
                  src={previewUrl}
                  title={`Preview of ${file.name}`}
                  className="h-[min(280px,40vh)] w-full rounded-lg border border-gray-200 bg-gray-50"
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-sm text-gray-500">
                  <FileText className="h-10 w-10 text-gray-400" />
                  <p>Preview not available for this file type.</p>
                  <button
                    type="button"
                    className="text-sky-600 font-semibold text-xs hover:underline"
                    onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}
                  >
                    Open file to review
                  </button>
                </div>
              )}
              <p className="mt-2 text-center text-[10px] text-gray-500 truncate" title={file.name}>
                {file.name} · {(file.size / 1024).toFixed(0)} KB
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function LicenseExpiredModal({
  storeId,
  open,
  expired,
  pendingVerification,
  initialStepPrefix,
  onClose,
  onUploaded,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [actionItems, setActionItems] = useState<LicenseDocumentActionItem[]>([]);
  const [licenseBlocked, setLicenseBlocked] = useState(false);
  const [mode, setMode] = useState<'list' | 'upload'>('list');
  const [selected, setSelected] = useState<LicenseDocumentActionItem | null>(null);
  const [form, setForm] = useState<UploadForm>({
    documentNumber: '',
    issueDate: '',
    expiryDate: '',
    fileFront: null,
    fileBack: null,
  });
  const [uploading, setUploading] = useState(false);
  const [historyForSelected, setHistoryForSelected] = useState<SerializedHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const requestClose = useCallback(() => {
    if (uploading) return;
    const fetchedPending = actionItems.filter((d) => d.status === 'pending_verification');
    const fetchedExpired = actionItems.filter((d) => d.status === 'expired');
    const pending = actionItems.length > 0 ? fetchedPending : pendingVerification ?? [];
    const expiredNow = actionItems.length > 0 ? fetchedExpired : expired ?? [];
    if (storeId && pending.length > 0 && expiredNow.length === 0) {
      markLicenseVerifyMarquee(storeId, labelsFromPendingDocs(pending));
    }
    onClose();
  }, [uploading, onClose, actionItems, pendingVerification, expired, storeId]);

  const fetchStatus = useCallback(async (): Promise<{
    action_items: LicenseDocumentActionItem[];
    license_blocked: boolean;
  } | null> => {
    if (!storeId) return null;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/merchant/store-documents/status?storeId=${encodeURIComponent(storeId)}`,
        { credentials: 'include' }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const items = (data.action_items as LicenseDocumentActionItem[]) ?? [];
        const blocked = data.license_blocked === true;
        setActionItems(items);
        setLicenseBlocked(blocked);
        return { action_items: items, license_blocked: blocked };
      }
    } catch {
      /* keep empty */
    } finally {
      setLoading(false);
    }
    return null;
  }, [storeId]);

  const fetchHistoryForPrefix = useCallback(
    async (prefix: MerchantDocumentPrefix) => {
      if (!storeId) return;
      setHistoryLoading(true);
      try {
        const res = await fetch(
          `/api/merchant/store-documents/history?storeId=${encodeURIComponent(storeId)}&licenceType=${encodeURIComponent(prefix)}`,
          { credentials: 'include' }
        );
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setHistoryForSelected((data.all as SerializedHistoryRow[]) ?? []);
        } else {
          setHistoryForSelected([]);
        }
      } catch {
        setHistoryForSelected([]);
      } finally {
        setHistoryLoading(false);
      }
    },
    [storeId]
  );

  const openUploadFor = useCallback(
    (item: LicenseDocumentActionItem) => {
      setSelected(item);
      setForm({
        documentNumber: item.document_number ?? '',
        issueDate: '',
        expiryDate: '',
        fileFront: null,
        fileBack: null,
      });
      setMode('upload');
      void fetchHistoryForPrefix(item.prefix);
    },
    [fetchHistoryForPrefix]
  );

  useEffect(() => {
    notifyLicenseReviewModalOpen(open);
    return () => notifyLicenseReviewModalOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setMode('list');
      setSelected(null);
      return;
    }
    void fetchStatus();
  }, [open, fetchStatus]);

  useEffect(() => {
    if (!open || loading || !initialStepPrefix || actionItems.length === 0) return;
    const item = actionItems.find((d) => d.prefix === initialStepPrefix);
    if (item && item.status !== 'pending_verification') {
      openUploadFor(item);
    }
  }, [open, loading, initialStepPrefix, actionItems, openUploadFor]);

  const uploadFile = async (
    prefix: MerchantDocumentPrefix,
    file: File,
    side: 'front' | 'back',
    extras: { documentNumber: string; issueDate: string; expiryDate: string }
  ): Promise<boolean> => {
    const fd = new FormData();
    fd.append('storeId', storeId);
    fd.append('docType', prefix);
    fd.append('file', file);
    fd.append('side', side);
    if (prefix !== 'fssai' && extras.issueDate) fd.append('issue_date', extras.issueDate);
    if (extras.expiryDate) fd.append('expiry_date', extras.expiryDate);
    if (extras.documentNumber.trim()) fd.append('document_number', extras.documentNumber.trim());

    const res = await fetch('/api/merchant/store-documents/upload', {
      method: 'POST',
      body: fd,
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error((data as { error?: string }).error || 'Upload failed');
      return false;
    }
    return true;
  };

  const handleSubmitUpload = async () => {
    if (!selected) return;
    const spec = selected.upload_spec;
    const extras = {
      documentNumber: form.documentNumber,
      issueDate: selected.prefix === 'fssai' ? '' : form.issueDate,
      expiryDate: form.expiryDate,
    };

    if (!form.expiryDate) {
      toast.error('Enter the new expiry date');
      return;
    }
    if (spec.requires_front && !form.fileFront) {
      toast.error(
        selected.prefix === 'aadhaar' ? 'Upload Aadhaar front side' : 'Select a document file to upload'
      );
      return;
    }
    if (spec.requires_back && !form.fileBack) {
      toast.error('Upload Aadhaar back side');
      return;
    }

    setUploading(true);
    try {
      if (form.fileFront) {
        const ok = await uploadFile(selected.prefix, form.fileFront, 'front', extras);
        if (!ok) return;
      } else if (!spec.requires_back) {
        toast.error('Select a document file to upload');
        return;
      }

      if (spec.requires_back && form.fileBack) {
        const okBack = await uploadFile(selected.prefix, form.fileBack, 'back', extras);
        if (!okBack) return;
      }

      toast.success(
        `${DOCUMENT_FORMAL_NAMES[selected.prefix]} uploaded. Gatimitra will verify it before you can go online.`
      );
      const fresh = await fetchStatus();
      setMode('list');
      setSelected(null);
      await onUploaded();

      const stillExpired =
        fresh?.action_items.some((d) => d.status === 'expired') ?? false;
      if (!stillExpired && !fresh?.license_blocked) {
        onClose();
      }
    } catch {
      toast.error('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  const expiredItems = actionItems.filter((d) => d.status === 'expired');
  const pendingItems = actionItems.filter((d) => d.status === 'pending_verification');
  const expiringItems = actionItems.filter((d) => d.status === 'expiring_soon');
  const pendingOnly = expiredItems.length === 0 && pendingItems.length > 0 && expiringItems.length === 0;

  const listTitle = pendingOnly
    ? 'Licence under review'
    : licenseBlocked
      ? 'Licence expired'
      : 'Renew licences';

  const listMessage = pendingOnly
    ? LICENSE_ONLINE_BLOCKED_TOAST
    : licenseBlocked
      ? LICENSE_RENEWAL_BLOCKED_MESSAGE
      : 'Upload updated licences before they expire to avoid missing orders.';

  const pastHistoryRows = historyForSelected.filter((h) => !h.is_active);

  return createPortal(
    <div className="relative z-[1100]" role="dialog" aria-modal="true">
      <div
        className="fixed inset-y-0 right-0 left-0 md:left-[var(--mx-partner-sidebar-w,14rem)] bg-black/55 backdrop-blur-[1px] pointer-events-none"
        aria-hidden="true"
      />
      <div className="fixed inset-y-0 right-0 left-0 md:left-[var(--mx-partner-sidebar-w,14rem)] flex items-center justify-center p-4 sm:p-6 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-3xl max-h-[min(92vh,800px)] flex flex-col rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-red-50 border-b border-amber-100 px-6 py-5 flex gap-4 shrink-0">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle className="h-6 w-6 text-amber-700" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold text-gray-900">
                {mode === 'upload' && selected
                  ? `Upload — ${DOCUMENT_FORMAL_NAMES[selected.prefix]}`
                  : listTitle}
              </h2>
              <p className="text-sm text-amber-950/85 mt-1.5 leading-relaxed">
                {mode === 'upload'
                  ? 'Enter licence details and upload clear photos or PDFs. Previous versions are kept in history.'
                  : listMessage}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-white/80 hover:text-gray-800 disabled:opacity-40"
              aria-label="Close"
              disabled={uploading}
              onClick={requestClose}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
                <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
                <p className="text-sm">Loading document status…</p>
              </div>
            ) : mode === 'list' ? (
              <div className="space-y-5">
                {expiredItems.length > 0 ? (
                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-red-700 mb-2 flex items-center gap-1.5">
                      <ShieldAlert className="h-4 w-4" />
                      Expired — upload required ({expiredItems.length})
                    </h3>
                    <ul className="space-y-3">
                      {expiredItems.map((doc) => (
                        <DocumentListCard
                          key={doc.prefix}
                          doc={doc}
                          onUpload={() => openUploadFor(doc)}
                        />
                      ))}
                    </ul>
                  </section>
                ) : null}

                {expiringItems.length > 0 ? (
                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-amber-800 mb-2">
                      Expiring soon — renew early ({expiringItems.length})
                    </h3>
                    <ul className="space-y-3">
                      {expiringItems.map((doc) => (
                        <DocumentListCard
                          key={doc.prefix}
                          doc={doc}
                          onUpload={() => openUploadFor(doc)}
                        />
                      ))}
                    </ul>
                  </section>
                ) : null}

                {pendingItems.length > 0 ? (
                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-orange-800 mb-2">
                      Awaiting Gatimitra verification ({pendingItems.length})
                    </h3>
                    <ul className="space-y-3">
                      {pendingItems.map((doc) => (
                        <DocumentListCard key={doc.prefix} doc={doc} />
                      ))}
                    </ul>
                  </section>
                ) : null}

                {actionItems.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">No licence issues found.</p>
                ) : null}
              </div>
            ) : selected ? (
              <div className="space-y-5 max-w-2xl">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-sm font-medium text-sky-700 hover:text-sky-900"
                  onClick={() => {
                    setMode('list');
                    setSelected(null);
                  }}
                  disabled={uploading}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to all documents
                </button>

                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
                  <p className="font-semibold text-gray-900">{selected.display_title}</p>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600">
                    <span>
                      Current expiry:{' '}
                      <strong className="text-gray-900">
                        {formatLicenseExpiryDisplay(selected.expiry_date)}
                      </strong>
                    </span>
                    <span>
                      Verification:{' '}
                      <strong className="text-gray-900">{selected.status_label}</strong>
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className={selected.prefix === 'fssai' ? 'sm:col-span-2' : undefined}>
                      <label className="block text-xs font-semibold text-gray-800 mb-1.5">
                        {DOCUMENT_FORMAL_NAMES[selected.prefix]} number
                      </label>
                      <input
                        type="text"
                        className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
                        value={form.documentNumber}
                        onChange={(e) => setForm((f) => ({ ...f, documentNumber: e.target.value }))}
                        disabled={uploading}
                      />
                    </div>
                    {selected.prefix !== 'fssai' ? (
                      <div>
                        <label className="block text-xs font-semibold text-gray-800 mb-1.5">Issue date</label>
                        <input
                          type="date"
                          className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
                          value={form.issueDate}
                          onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))}
                          disabled={uploading}
                        />
                      </div>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-800 mb-1.5">
                        Current expiry
                      </label>
                      <input
                        type="text"
                        readOnly
                        tabIndex={-1}
                        className="w-full rounded-xl border border-gray-200 bg-gray-100 px-3 py-2.5 text-sm text-gray-700 cursor-not-allowed"
                        value={formatLicenseExpiryDisplay(selected.expiry_date)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-800 mb-1.5 flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        New expiry date
                      </label>
                      <input
                        type="date"
                        className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
                        value={form.expiryDate}
                        onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
                        disabled={uploading}
                      />
                    </div>
                  </div>
                </div>

                {historyLoading ? (
                  <p className="text-xs text-gray-500 flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading licence history…
                  </p>
                ) : pastHistoryRows.length > 0 ? (
                  <section className="rounded-xl border border-gray-200 bg-slate-50/80 p-3">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-gray-600 flex items-center gap-1.5 mb-2">
                      <History className="h-3.5 w-3.5" />
                      Previous versions ({pastHistoryRows.length})
                    </h4>
                    <ul className="space-y-2 max-h-40 overflow-y-auto">
                      {pastHistoryRows.map((h) => (
                        <li
                          key={h.id}
                          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-600"
                        >
                          <div className="flex flex-wrap justify-between gap-1">
                            <span className="font-semibold text-gray-800">
                              {h.licence_number || '—'}
                            </span>
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700">
                              {formatHistoryVerificationLabel(
                                h.verification_status as MerchantLicenceHistoryRow['verification_status']
                              )}
                            </span>
                          </div>
                          <p className="mt-1">
                            Expiry: {formatLicenseExpiryDisplay(h.expires_at)} · Uploaded:{' '}
                            {formatLicenseExpiryDisplay(h.uploaded_at?.slice(0, 10) ?? null)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {selected.prefix === 'aadhaar' ? (
                  <div className="space-y-4">
                    <FilePicker
                      label="Aadhaar — front side"
                      hint="Required. Upload a clear photo or PDF of the front of your Aadhaar."
                      file={form.fileFront}
                      disabled={uploading}
                      onPick={(f) => setForm((prev) => ({ ...prev, fileFront: f }))}
                    />
                    {selected.upload_spec.requires_back ? (
                      <FilePicker
                        label="Aadhaar — back side"
                        hint="Required. Your profile already has a back-side Aadhaar on file — upload the new back side too."
                        file={form.fileBack}
                        disabled={uploading}
                        onPick={(f) => setForm((prev) => ({ ...prev, fileBack: f }))}
                      />
                    ) : (
                      <p className="text-xs text-gray-500 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                        Only the front side is required for your store.
                      </p>
                    )}
                  </div>
                ) : (
                  <FilePicker
                    label={`${DOCUMENT_FORMAL_NAMES[selected.prefix]} document`}
                    hint="Upload a clear PDF or image of the full licence."
                    file={form.fileFront}
                    disabled={uploading}
                    onPick={(f) => setForm((prev) => ({ ...prev, fileFront: f }))}
                  />
                )}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-gray-100 px-6 py-4 bg-gray-50 shrink-0">
            <button
              type="button"
              className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-white"
              onClick={requestClose}
              disabled={uploading}
            >
              {pendingOnly ? 'Close' : 'Later'}
            </button>
            {mode === 'upload' && selected ? (
              <button
                type="button"
                className="ml-auto inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60 min-w-[160px]"
                onClick={() => void handleSubmitUpload()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Submit upload
                  </>
                )}
              </button>
            ) : licenseBlocked && expiredItems.length > 0 ? (
              <button
                type="button"
                className="ml-auto inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
                onClick={() => openUploadFor(expiredItems[0])}
              >
                Upload first expired licence
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function DocumentListCard({
  doc,
  onUpload,
}: {
  doc: LicenseDocumentActionItem;
  onUpload?: () => void;
}) {
  const canUpload = doc.status === 'expired' || doc.status === 'expiring_soon';

  return (
    <li className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-gray-300 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 leading-snug">{doc.display_title}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
              <span>
                Expiry date:{' '}
                <span className="font-semibold text-gray-900">
                  {formatLicenseExpiryDisplay(doc.expiry_date)}
                </span>
              </span>
              {doc.document_number ? (
                <span>
                  Number: <span className="font-mono text-gray-800">{doc.document_number}</span>
                </span>
              ) : null}
            </div>
            <span
              className={`inline-flex mt-2 items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(doc)}`}
            >
              {doc.status_label}
            </span>
            {doc.upload_spec.requires_back ? (
              <p className="text-[11px] text-amber-800 mt-2">Front + back upload required</p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col sm:items-end gap-2 shrink-0">
          {(doc.document_url || doc.back_document_url) ? (
            <DocumentUrlPreview
              url={doc.document_url}
              backUrl={doc.back_document_url}
              title={DOCUMENT_FORMAL_NAMES[doc.prefix]}
              buttonClassName="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 shadow-sm w-full sm:w-auto"
            />
          ) : null}
          {canUpload && onUpload ? (
            <button
              type="button"
              onClick={onUpload}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 shadow-sm w-full sm:w-auto"
            >
              <Upload className="h-4 w-4" />
              Upload / Update
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
