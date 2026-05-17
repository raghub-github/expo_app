"use client";

import { ExternalLink } from "lucide-react";
import { resolveAttachmentProxyUrl } from "@/lib/attachments/resolve-attachment-proxy-url";

function formatDisplayDate(raw: string | null | undefined): string {
  if (!raw) return "—";
  try {
    return new Date(raw.includes("T") ? raw : `${raw}T12:00:00`).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(raw);
  }
}

export function ProfileLegalDocumentCard({
  label,
  documentNumber,
  holderName,
  expiryDate,
  documentUrl,
  isVerified,
  onVerify,
  canVerify,
}: {
  label: string;
  documentNumber: string;
  holderName?: string | null;
  expiryDate?: string | null;
  documentUrl?: string | null;
  isVerified?: boolean | null;
  onVerify?: () => void;
  canVerify?: boolean;
}) {
  const previewHref = documentUrl ? resolveAttachmentProxyUrl(documentUrl) : "";
  const badgeCls = isVerified
    ? "bg-green-100 text-green-700"
    : "bg-yellow-100 text-yellow-700";

  return (
    <div
      className={`bg-white rounded-lg p-2.5 border border-gray-200`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs font-semibold text-gray-900">{label}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${badgeCls}`}>
          {isVerified ? "Verified" : "Pending"}
        </span>
      </div>
      <div className="text-xs text-gray-600 space-y-0.5">
        <div className="break-all">Number: {documentNumber}</div>
        {holderName ? <div>Holder: {holderName}</div> : null}
        {expiryDate ? <div>Expiry: {formatDisplayDate(expiryDate)}</div> : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {previewHref ? (
          <a
            href={previewHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            View document
          </a>
        ) : null}
        {canVerify && !isVerified && onVerify ? (
          <button
            type="button"
            onClick={onVerify}
            className="inline-flex items-center rounded-md bg-indigo-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-indigo-700"
          >
            Verify
          </button>
        ) : null}
      </div>
    </div>
  );
}
