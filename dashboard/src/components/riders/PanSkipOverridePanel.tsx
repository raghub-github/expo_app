"use client";

import { useState } from "react";
import { ModalPortal } from "@/components/ui/ModalPortal";

type Props = {
  riderId: number;
  panSkipOverride: boolean;
  panSkipReason?: string | null;
  panSkipEnabledByName?: string | null;
  panSkipEnabledByEmail?: string | null;
  panSkipEnabledAt?: string | Date | null;
  panVerified?: boolean;
  canEdit: boolean;
  onUpdated: () => void;
  /** Compact control for the PAN summary card. */
  compact?: boolean;
};

export function PanSkipInlineControl({
  riderId,
  panSkipOverride,
  panSkipReason,
  panSkipEnabledByName,
  panSkipEnabledByEmail,
  panSkipEnabledAt,
  panVerified,
  canEdit,
  onUpdated,
  compact = true,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState("");

  const enabledAt =
    panSkipEnabledAt != null ? new Date(panSkipEnabledAt).toLocaleString() : null;

  const submit = async (enabled: boolean) => {
    if (enabled && reason.trim().length < 3) {
      setError("Reason is required to enable PAN skip.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/riders/${riderId}/pan-skip-override`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, reason: reason.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Failed to update PAN skip override");
      }
      setConfirmOpen(false);
      setReason("");
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update override");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        className={
          compact
            ? "rounded-lg border border-dashed border-amber-200 bg-amber-50/70 px-3 py-2"
            : "rounded-2xl border border-amber-200 bg-amber-50/60 p-4"
        }
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700/80">
              PAN skip
            </p>
            <p className="mt-0.5 text-xs font-semibold text-[#0A2342]">
              {panSkipOverride
                ? "Override ON"
                : panVerified
                  ? "Verified — skip not needed"
                  : "Required · admin skip available"}
            </p>
            {panSkipOverride ? (
              <p className="mt-1 line-clamp-2 text-[11px] text-gray-600">
                {panSkipReason || "Admin-approved exception"}
                {panSkipEnabledByName || panSkipEnabledByEmail
                  ? ` · ${panSkipEnabledByName || panSkipEnabledByEmail}`
                  : ""}
                {enabledAt ? ` · ${enabledAt}` : ""}
              </p>
            ) : null}
          </div>
          {canEdit && !panVerified ? (
            panSkipOverride ? (
              <button
                type="button"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  void submit(false);
                }}
                className="shrink-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
              >
                {busy ? "…" : "Disable"}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmOpen(true);
                  setError(null);
                }}
                className="shrink-0 rounded-lg bg-[#0A2342] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#0d2f57] disabled:opacity-60"
              >
                Enable skip
              </button>
            )
          ) : null}
        </div>
        {error ? <p className="mt-1.5 text-[11px] font-medium text-rose-600">{error}</p> : null}
      </div>

      {confirmOpen ? (
        <ModalPortal>
          <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0 bg-slate-900/35 backdrop-blur-md"
              aria-label="Cancel"
              onClick={() => !busy && setConfirmOpen(false)}
            />
            <div className="relative z-[161] w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
              <div className="border-b border-gray-100 bg-gradient-to-r from-amber-50 to-white px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700/80">
                  Admin exception
                </p>
                <h4 className="mt-1 text-lg font-semibold text-[#0A2342]">Enable PAN Skip?</h4>
              </div>
              <div className="p-5">
                <p className="text-sm text-gray-600">
                  This rider-only exception lets them continue onboarding without completing PAN
                  verification. It does not mark PAN as verified.
                </p>
                <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Reason for override
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-[#0A2342] focus:ring-2 focus:ring-[#0A2342]/10"
                  placeholder="Enter reason..."
                />
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmOpen(false)}
                    className="rounded-xl px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={busy || reason.trim().length < 3}
                    onClick={() => void submit(true)}
                    className="rounded-xl bg-[#0A2342] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {busy ? "Saving…" : "Enable PAN Skip"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </>
  );
}

/** @deprecated Use PanSkipInlineControl — kept as alias for existing imports. */
export const PanSkipOverridePanel = PanSkipInlineControl;
