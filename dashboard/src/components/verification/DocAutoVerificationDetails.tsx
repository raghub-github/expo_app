"use client";

import { ShieldCheck } from "lucide-react";
import {
  getAdminDocAutoVerificationDisplay,
  type AdminDocAutoVerificationDisplay,
} from "@/lib/merchant-doc-auto-verification";

function formatVerifiedAt(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString();
}

function formatConfidence(n: number | null): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  if (n <= 1) return `${Math.round(n * 100)}%`;
  if (n <= 100) return `${Math.round(n)}%`;
  return String(n);
}

export function DocAutoVerificationDetails(props: {
  docType: string;
  documents: Record<string, unknown> | null | undefined;
  /** Hide duplicate Aadhaar details on the back-image card. */
  hidden?: boolean;
  className?: string;
}) {
  if (props.hidden) return null;
  const display = getAdminDocAutoVerificationDisplay(props.docType, props.documents);
  if (!display) return null;
  return <DocAutoVerificationDetailsView display={display} className={props.className} />;
}

export function DocAutoVerificationDetailsView(props: {
  display: AdminDocAutoVerificationDisplay;
  className?: string;
}) {
  const { display } = props;
  const verifiedAt = formatVerifiedAt(display.verifiedAt);
  const confidence = formatConfidence(display.confidence);
  const statusLabel =
    display.status === "verified"
      ? "Provider verified"
      : display.status === "manual_review"
        ? "Needs manual review"
        : null;

  return (
    <div
      className={
        props.className ??
        "rounded-lg border border-emerald-200/90 bg-emerald-50/70 px-2.5 py-2"
      }
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-900">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
          Auto-verification details
        </p>
        {statusLabel ? (
          <span
            className={
              display.status === "verified"
                ? "rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800"
                : "rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900"
            }
          >
            {statusLabel}
          </span>
        ) : null}
        {display.method ? (
          <span className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900 ring-1 ring-emerald-200/80">
            {display.method}
          </span>
        ) : null}
        {confidence ? (
          <span className="text-[10px] font-medium text-emerald-800">Confidence {confidence}</span>
        ) : null}
      </div>

      {display.rows.length > 0 ? (
        <dl className="mt-1.5 grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
          {display.rows.map(({ label, value }) => (
            <div key={label} className="min-w-0 text-left">
              <dt className="text-[10px] font-medium uppercase tracking-wide text-emerald-800/80">
                {label}
              </dt>
              <dd className="break-words text-xs font-semibold leading-snug text-emerald-950">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-1 text-[11px] text-emerald-800">
          Provider marked this document, but no structured fields were returned.
        </p>
      )}

      {(verifiedAt || display.verificationId || display.providerReference) && (
        <div className="mt-1.5 space-y-0.5 border-t border-emerald-200/70 pt-1.5 text-[10px] text-emerald-800/90">
          {verifiedAt ? <p>Verified at: {verifiedAt}</p> : null}
          {display.verificationId ? (
            <p className="break-all font-mono">Verification ID: {display.verificationId}</p>
          ) : null}
          {display.providerReference ? (
            <p className="break-all font-mono">Provider ref: {display.providerReference}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
