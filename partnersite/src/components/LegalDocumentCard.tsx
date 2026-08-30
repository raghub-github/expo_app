'use client';

import React, { useEffect, useState } from 'react';
import { Clock, History, Upload } from 'lucide-react';
import { DocumentUrlPreview } from '@/components/DocumentUrlPreview';
import { partnerDocumentPreviewHref } from '@/lib/partnerDocumentPreview';
import {
  DOCUMENT_FORMAL_NAMES,
  formatLicenseExpiryDisplay,
  getDocumentExpiryUiState,
  type MerchantDocumentPrefix,
} from '@/lib/merchantLicenseExpiry';
import { formatHistoryVerificationLabel } from '@/lib/merchantLicenceHistory';

const BADGE_CLASS: Record<string, string> = {
  verified: 'bg-green-100 text-green-700',
  expired: 'bg-red-100 text-red-700',
  pending: 'bg-yellow-100 text-yellow-700',
  pending_verification: 'bg-orange-100 text-orange-700',
  expiring_soon: 'bg-amber-100 text-amber-800',
  expires_today: 'bg-amber-100 text-amber-900',
};

type HistoryRow = {
  id: number;
  licence_number: string | null;
  file_url: string;
  back_file_url?: string | null;
  expires_at: string | null;
  uploaded_at: string;
  verification_status: string;
  is_active: boolean;
};

type Props = {
  storeId: string;
  label: string;
  prefix: MerchantDocumentPrefix;
  documentNumber: string;
  holderName?: string | null;
  expiryDate?: string | null;
  documentUrl?: string | null;
  isVerified?: boolean | null;
  isExpiredFlag?: boolean | null;
  renewalPending?: boolean | null;
  onRenew?: (prefix: MerchantDocumentPrefix) => void;
};

export function LegalDocumentCard({
  storeId,
  label,
  prefix,
  documentNumber,
  holderName,
  expiryDate,
  documentUrl,
  isVerified,
  isExpiredFlag,
  renewalPending,
  onRenew,
}: Props) {
  const [, setTick] = useState(0);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const ui = getDocumentExpiryUiState({
      expiryDate,
      isVerified,
      isExpiredFlag,
      renewalPending,
    });
    if (!ui.countdownLabel) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, [expiryDate, isVerified, isExpiredFlag, renewalPending]);

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/merchant/store-documents/history?storeId=${encodeURIComponent(storeId)}&licenceType=${encodeURIComponent(prefix)}`,
          { credentials: 'include' }
        );
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          setHistory((data.all as HistoryRow[]) ?? []);
        }
      } catch {
        if (!cancelled) setHistory([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, prefix]);

  const ui = getDocumentExpiryUiState({
    expiryDate,
    isVerified,
    isExpiredFlag,
    renewalPending,
  });

  const activeRow = history.find((h) => h.is_active);
  const pastRows = history.filter((h) => !h.is_active);
  const previewUrl = documentUrl ?? activeRow?.file_url ?? null;
  const previewBackUrl = activeRow?.back_file_url ?? null;
  const previewHref = partnerDocumentPreviewHref(previewUrl);

  const formatDisplayDate = (raw: string) => {
    try {
      return new Date(raw.includes('T') ? raw : `${raw}T12:00:00`).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return raw;
    }
  };

  return (
    <div
      className={`bg-white rounded-lg p-2.5 border ${
        ui.isExpired ? 'border-red-200 ring-1 ring-red-100' : ui.isExpiringSoon ? 'border-amber-200' : 'border-gray-200'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs font-semibold text-gray-900">{label}</span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${
            BADGE_CLASS[ui.badge] ?? BADGE_CLASS.pending
          }`}
        >
          {ui.badgeLabel}
        </span>
      </div>

      <div className="text-xs text-gray-600 space-y-0.5">
        <div>Number: {documentNumber}</div>
        {holderName ? <div>Holder: {holderName}</div> : null}
        {expiryDate ? <div>Expiry: {formatDisplayDate(expiryDate)}</div> : null}
        {activeRow ? (
          <p className="text-[10px] text-sky-800 font-medium pt-0.5">
            Active on file ·{' '}
            {formatHistoryVerificationLabel(
              isVerified === true
                ? 'verified'
                : (activeRow.verification_status as 'pending' | 'verified' | 'rejected' | 'expired')
            )}
          </p>
        ) : null}
      </div>

      {ui.countdownLabel ? (
        <div className="mt-2 flex items-center gap-1.5 rounded-md bg-amber-50 border border-amber-100 px-2 py-1.5 text-[11px] font-medium text-amber-900">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>
            {ui.expiresToday ? 'Expires today in ' : 'Expires in '}
            <span className="tabular-nums font-bold">{ui.countdownLabel}</span>
          </span>
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {previewHref ? (
          <>
            <a
              href={previewHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-medium text-blue-600 hover:underline"
            >
              View document
            </a>
            <DocumentUrlPreview
              url={previewUrl}
              backUrl={previewBackUrl}
              title={DOCUMENT_FORMAL_NAMES[prefix]}
            />
          </>
        ) : null}
        {ui.showRenewCta && onRenew ? (
          <button
            type="button"
            onClick={() => onRenew(prefix)}
            className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-sky-700"
          >
            <Upload className="h-3 w-3" />
            Upload new licence
          </button>
        ) : null}
        {pastRows.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-600 hover:text-gray-900"
          >
            <History className="h-3 w-3" />
            {showHistory ? 'Hide' : 'Show'} history ({pastRows.length})
          </button>
        ) : null}
      </div>

      {showHistory && pastRows.length > 0 ? (
        <ul className="mt-2 space-y-1.5 border-t border-gray-100 pt-2">
          {pastRows.map((h) => (
            <li key={h.id} className="rounded-md bg-gray-50 border border-gray-100 px-2 py-1.5 text-[10px] text-gray-600">
              <div className="flex justify-between gap-1 font-medium text-gray-800">
                <span>{h.licence_number || DOCUMENT_FORMAL_NAMES[prefix]}</span>
                <span>{formatHistoryVerificationLabel(h.verification_status as 'expired')}</span>
              </div>
              <p>
                Exp: {formatLicenseExpiryDisplay(h.expires_at)} · Uploaded:{' '}
                {formatLicenseExpiryDisplay(h.uploaded_at?.slice(0, 10) ?? null)}
              </p>
              {h.file_url ? (
                <div className="mt-1.5">
                  <DocumentUrlPreview
                    url={h.file_url}
                    backUrl={h.back_file_url}
                    title={`${DOCUMENT_FORMAL_NAMES[prefix]} (archived)`}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
