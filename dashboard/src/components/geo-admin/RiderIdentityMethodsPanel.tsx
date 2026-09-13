"use client";

/**
 * Geo-scoped Aadhaar / identity verification methods for rider onboarding.
 * Intersects with global Policy Center modes at runtime — this panel only
 * enables/disables DigiLocker, masking, and manual upload at a geo node.
 */

import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";

type GeoNodeLevel = "state" | "region" | "district" | "division" | "post_office" | "pincode";

type MethodsRow = {
  id: number;
  digilockerEnabled: boolean;
  aadhaarMaskingEnabled: boolean;
  manualUploadEnabled: boolean;
  priority: number;
  isActive: boolean;
  notes: string | null;
};

const btnPrimary =
  "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:border-indigo-300 disabled:opacity-50";
const btnDanger =
  "inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-50";

function ToggleRow(props: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-2 text-xs font-semibold text-slate-700">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span>
        {props.label}
        {props.hint ? <span className="mt-0.5 block font-normal text-slate-500">{props.hint}</span> : null}
      </span>
    </label>
  );
}

export function RiderIdentityMethodsPanel(props: {
  level: GeoNodeLevel;
  refId: string;
  name: string;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [row, setRow] = useState<MethodsRow | null>(null);
  const [digilockerEnabled, setDigilockerEnabled] = useState(true);
  const [aadhaarMaskingEnabled, setAadhaarMaskingEnabled] = useState(true);
  const [manualUploadEnabled, setManualUploadEnabled] = useState(true);
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ level: props.level, refId: props.refId });
      const res = await fetch(`/api/super-admin/geo/rider-identity-methods?${qs}`);
      const data = (await res.json()) as { rows?: MethodsRow[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to load");
      const first = data.rows?.[0] ?? null;
      setRow(first);
      setDigilockerEnabled(first?.digilockerEnabled ?? true);
      setAadhaarMaskingEnabled(first?.aadhaarMaskingEnabled ?? true);
      setManualUploadEnabled(first?.manualUploadEnabled ?? true);
      setNotes(first?.notes ?? "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load identity methods");
    } finally {
      setLoading(false);
    }
  }, [props.level, props.refId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/super-admin/geo/rider-identity-methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level: props.level,
          refId: props.refId,
          digilockerEnabled,
          aadhaarMaskingEnabled,
          manualUploadEnabled,
          notes: notes.trim() || null,
          isActive: true,
        }),
      });
      const data = (await res.json()) as { row?: MethodsRow; error?: string };
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success("Identity methods saved for this location");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const clearOverride = async () => {
    if (!row?.id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/super-admin/geo/rider-identity-methods/${row.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Delete failed");
      toast.success("Cleared — riders inherit global Policy Center / parent geo");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-emerald-600" />
        <h2 className="text-base font-semibold text-slate-900">
          Rider Aadhaar / identity methods
        </h2>
      </div>
      <p className="mb-4 text-sm text-slate-600">
        Configure which identity verification options riders see when onboarding at{" "}
        <span className="font-semibold text-slate-800">{props.name}</span> ({props.level}).
        Most-specific geo wins. Empty = inherit parent / global Policy Center only.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-3">
          {!row ? (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
              No override at this node — riders use global Policy Center modes (and any
              parent geo override).
            </p>
          ) : (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Override active (rule #{row.id}). Intersects with global DigiLocker policy mode.
            </p>
          )}

          <ToggleRow
            checked={digilockerEnabled}
            onChange={setDigilockerEnabled}
            label="DigiLocker / electronic Aadhaar"
            hint="Cashfree DigiLocker consent flow"
          />
          <ToggleRow
            checked={aadhaarMaskingEnabled}
            onChange={setAadhaarMaskingEnabled}
            label="Aadhaar masking verify"
            hint="Electronic masking path when available"
          />
          <ToggleRow
            checked={manualUploadEnabled}
            onChange={setManualUploadEnabled}
            label="Manual photo upload"
            hint="Front/back Aadhaar photos"
          />

          <label className="block text-xs font-semibold text-slate-700">
            Notes
            <textarea
              className="mt-1 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional admin note"
            />
          </label>

          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" className={btnPrimary} disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save methods
            </button>
            {row ? (
              <button
                type="button"
                className={btnDanger}
                disabled={saving}
                onClick={() => void clearOverride()}
              >
                Clear override
              </button>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
