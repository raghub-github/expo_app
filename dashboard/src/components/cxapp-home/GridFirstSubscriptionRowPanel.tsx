"use client";

import { useCallback, useEffect, useState } from "react";
import { Ribbon } from "lucide-react";

import {
  DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW_BG,
  DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW_TEXT,
  parseGridFirstSubscriptionRowBgColor,
} from "@/lib/cxapp-home/food-home-layout";
import { cn } from "@/lib/utils";

type Props = {
  stateId: string;
  enabled: boolean;
  initialEnabled: boolean;
  initialText: string;
  initialBackgroundColor: string;
  onSaved?: (config: { enabled: boolean; text: string; backgroundColor: string }) => void;
};

export function GridFirstSubscriptionRowPanel({
  stateId,
  enabled,
  initialEnabled,
  initialText,
  initialBackgroundColor,
  onSaved,
}: Props) {
  const [rowEnabled, setRowEnabled] = useState(initialEnabled);
  const [rowText, setRowText] = useState(initialText);
  const [rowBgColor, setRowBgColor] = useState(initialBackgroundColor);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setRowEnabled(initialEnabled);
    setRowText(initialText);
    setRowBgColor(initialBackgroundColor);
  }, [initialEnabled, initialText, initialBackgroundColor, stateId]);

  const dirty =
    rowEnabled !== initialEnabled ||
    rowText.trim() !== initialText.trim() ||
    parseGridFirstSubscriptionRowBgColor(rowBgColor) !==
      parseGridFirstSubscriptionRowBgColor(initialBackgroundColor);

  const onSave = useCallback(async () => {
    if (!stateId || saving) return;
    setSaving(true);
    setError(null);
    try {
      const text = rowText.trim() || DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW_TEXT;
      const backgroundColor = parseGridFirstSubscriptionRowBgColor(rowBgColor);
      const res = await fetch(`/api/super-admin/cxapp-home/food-layout/${stateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gridFirstSubscriptionRowEnabled: rowEnabled,
          gridFirstSubscriptionRowText: text,
          gridFirstSubscriptionRowBgColor: backgroundColor,
        }),
      });
      const json = (await res.json()) as {
        gridFirstSubscriptionRowEnabled?: boolean;
        gridFirstSubscriptionRowText?: string;
        gridFirstSubscriptionRowBgColor?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to save subscription row");
      const next = {
        enabled: json.gridFirstSubscriptionRowEnabled === true,
        text: json.gridFirstSubscriptionRowText ?? text,
        backgroundColor: parseGridFirstSubscriptionRowBgColor(json.gridFirstSubscriptionRowBgColor),
      };
      setRowEnabled(next.enabled);
      setRowText(next.text);
      setRowBgColor(next.backgroundColor);
      setSavedAt(Date.now());
      onSaved?.(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save subscription row");
    } finally {
      setSaving(false);
    }
  }, [onSaved, rowBgColor, rowEnabled, rowText, saving, stateId]);

  if (!enabled) return null;

  return (
    <div className="mt-5 rounded-xl border border-amber-200/80 bg-amber-50/40 p-4">
      <div className="flex items-start gap-2">
        <div className="rounded-lg bg-amber-100 p-2 text-amber-800">
          <Ribbon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900">Grid-first subscription row</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Controls the gold promo strip below the hero on the customer food home (grid-first layout only).
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-amber-200/60 bg-white px-3 py-2.5">
        <div>
          <p className="text-xs font-semibold text-slate-800">Show subscription row</p>
          <p className="text-[11px] text-slate-500">Off hides the strip for this state even when grid-first is active.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={rowEnabled}
          onClick={() => setRowEnabled((v) => !v)}
          className={cn(
            "relative h-7 w-12 shrink-0 rounded-full transition",
            rowEnabled ? "bg-cyan-600" : "bg-slate-300"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition",
              rowEnabled ? "left-[22px]" : "left-0.5"
            )}
          />
        </button>
      </div>

      <label className="mt-3 block">
        <span className="text-xs font-semibold text-slate-800">Strip message</span>
        <textarea
          value={rowText}
          onChange={(e) => setRowText(e.target.value)}
          rows={3}
          maxLength={280}
          placeholder={DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW_TEXT}
          className="mt-1.5 w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-cyan-500"
        />
        <span className="mt-1 block text-[10px] text-slate-400">{rowText.trim().length}/280</span>
      </label>

      <div className="mt-3">
        <span className="text-xs font-semibold text-slate-800">Row background color</span>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <input
            type="color"
            value={parseGridFirstSubscriptionRowBgColor(rowBgColor)}
            onChange={(e) => setRowBgColor(e.target.value)}
            className="h-10 w-14 cursor-pointer rounded-lg border border-gray-200 bg-white p-1"
            aria-label="Pick row background color"
          />
          <input
            type="text"
            value={rowBgColor}
            onChange={(e) => setRowBgColor(e.target.value)}
            placeholder={DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW_BG}
            className="h-10 min-w-[120px] flex-1 rounded-lg border border-gray-200 bg-white px-3 font-mono text-xs text-slate-800 outline-none focus:border-cyan-500"
            maxLength={7}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => void onSave()}
          className="inline-flex h-9 items-center rounded-lg bg-cyan-600 px-4 text-xs font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save subscription row"}
        </button>
        {savedAt ? (
          <span className="text-[11px] font-medium text-emerald-700">Saved</span>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-xs font-medium text-red-600">{error}</p> : null}

      {rowEnabled && rowText.trim() ? (
        <div
          className="mt-4 rounded-xl border border-amber-300/40 px-3 py-2.5"
          style={{ backgroundColor: parseGridFirstSubscriptionRowBgColor(rowBgColor) }}
        >
          <p className="text-[11px] font-medium leading-snug text-amber-950">
            {rowText.trim()}
            <span className="font-semibold text-amber-900"> Know more ›</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
