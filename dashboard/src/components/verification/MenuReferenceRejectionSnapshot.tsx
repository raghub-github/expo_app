"use client";

import React from "react";
import {
  parseMenuReferenceRejectionDetail,
  statusChipClass,
  statusLabel,
} from "@/lib/store-verification-menu-rejection-detail-shared";

/**
 * Read-only summary of menu files/images at step-3 rejection time (from DB snapshot).
 */
export function MenuReferenceRejectionSnapshot({ detail }: { detail: unknown }) {
  const parsed = parseMenuReferenceRejectionDetail(detail);
  if (!parsed?.files?.length) return null;

  return (
    <div className="mt-2 border-t border-red-200/60 pt-2">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-red-900/90">
        Menu items at rejection
      </p>
      <ul className="space-y-2">
        {parsed.files.map((f) => (
          <li
            key={f.media_file_id}
            className="rounded border border-red-100/80 bg-white/80 px-2 py-1.5 text-[10px] text-red-950"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-red-950">{f.label}</span>
              {f.reference_images && f.reference_images.length > 0 ? null : (
                <span
                  className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${statusChipClass(f.row_verification_status)}`}
                >
                  {statusLabel(f.row_verification_status)}
                </span>
              )}
            </div>
            {f.original_file_name && (!f.reference_images || f.reference_images.length <= 1) && (
              <p className="mt-0.5 truncate text-red-800/85" title={f.original_file_name}>
                {f.original_file_name}
              </p>
            )}
            {f.reference_images && f.reference_images.length > 0 && (
              <ul className="mt-1.5 space-y-1 border-t border-red-100/50 pt-1.5">
                {f.reference_images.map((img, idx) => (
                  <li key={img.entry_id} className="flex flex-wrap items-center justify-between gap-1">
                    <span className="min-w-0 truncate text-red-900/90" title={img.file_name || img.entry_id}>
                      Photo {idx + 1}
                      {img.file_name ? `: ${img.file_name}` : ""}
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold ${statusChipClass(img.verification_status)}`}
                    >
                      {statusLabel(img.verification_status)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[9px] text-red-800/70">
        Snapshot at {new Date(parsed.captured_at).toLocaleString()} — current live status may differ after partner updates.
      </p>
    </div>
  );
}
