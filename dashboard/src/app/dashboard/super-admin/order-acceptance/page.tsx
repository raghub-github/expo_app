"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Play, Pause, Upload, Trash2, Loader2 } from "lucide-react";

type Row = {
  store_type: string;
  acceptance_window_minutes: number;
  alert_sound_enabled: boolean;
  alert_sound_url: string | null;
  alert_sound_url_2: string | null;
  alert_sound_url_3: string | null;
  alert_sound_repeat_count: number;
};

const DEFAULT_ROW: Omit<Row, "store_type"> = {
  acceptance_window_minutes: 15,
  alert_sound_enabled: true,
  alert_sound_url: null,
  alert_sound_url_2: null,
  alert_sound_url_3: null,
  alert_sound_repeat_count: 1,
};

type SoundSlot = 1 | 2 | 3;

function slotUrl(r: Row, slot: SoundSlot): string | null {
  if (slot === 1) return r.alert_sound_url ?? null;
  if (slot === 2) return r.alert_sound_url_2 ?? null;
  return r.alert_sound_url_3 ?? null;
}

function setSlotUrl(prev: Row, slot: SoundSlot, url: string | null): Row {
  if (slot === 1) return { ...prev, alert_sound_url: url };
  if (slot === 2) return { ...prev, alert_sound_url_2: url };
  return { ...prev, alert_sound_url_3: url };
}

/** Single preview player so only one clip plays at a time */
let previewAudioEl: HTMLAudioElement | null = null;

function stopSoundPreview() {
  if (!previewAudioEl) return;
  previewAudioEl.pause();
  previewAudioEl.currentTime = 0;
  try {
    previewAudioEl.removeAttribute("src");
  } catch {
    previewAudioEl.src = "";
  }
  previewAudioEl = null;
}

function playSoundPreview(url: string, onStop: () => void): void {
  stopSoundPreview();
  const a = new Audio(url);
  previewAudioEl = a;
  const done = () => {
    if (previewAudioEl === a) previewAudioEl = null;
    onStop();
  };
  a.addEventListener("ended", done, { once: true });
  a.addEventListener("error", done, { once: true });
  void a.play().catch(() => done());
}

export default function SuperAdminOrderAcceptancePage() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [newType, setNewType] = useState("");
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [savingRow, setSavingRow] = useState<string | null>(null);
  const [deletingRow, setDeletingRow] = useState<string | null>(null);
  const [applyingAll, setApplyingAll] = useState(false);
  const [originalByType, setOriginalByType] = useState<Record<string, Row>>({});
  const [playingPreviewKey, setPlayingPreviewKey] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      stopSoundPreview();
    };
  }, []);

  const togglePreview = useCallback((key: string, url: string | null) => {
    const src = (url || "").trim();
    if (!src) return;
    if (playingPreviewKey === key) {
      stopSoundPreview();
      setPlayingPreviewKey(null);
      return;
    }
    stopSoundPreview();
    setPlayingPreviewKey(key);
    playSoundPreview(src, () => {
      setPlayingPreviewKey((cur) => (cur === key ? null : cur));
    });
  }, [playingPreviewKey]);

  const load = useCallback(async () => {
    setMsg(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/super-admin/order-acceptance-settings`);
      const data = (await res.json().catch(() => ({}))) as { rows?: Row[]; error?: string };
      if (!res.ok) {
        setMsg(data.error || "Failed to load");
        return;
      }
      const raw = Array.isArray(data.rows) ? data.rows : [];
      const nextRows = raw.map((x) => ({
        ...DEFAULT_ROW,
        ...x,
        alert_sound_url: x.alert_sound_url ?? null,
        alert_sound_url_2: x.alert_sound_url_2 ?? null,
        alert_sound_url_3: x.alert_sound_url_3 ?? null,
      }));
      setRows(nextRows);
      const nextOriginal: Record<string, Row> = {};
      for (const r of nextRows) nextOriginal[r.store_type] = r;
      setOriginalByType(nextOriginal);
      setMsg(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upsert = useCallback(async (r: Row) => {
    setMsg(null);
    setSavingRow(r.store_type);
    try {
      const res = await fetch(`/api/super-admin/order-acceptance-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(r),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setMsg(data.error || "Save failed");
        return false;
      }
      setOriginalByType((prev) => ({ ...prev, [r.store_type]: r }));
      setMsg("Saved");
      return true;
    } finally {
      setSavingRow(null);
    }
  }, []);

  const uploadSound = useCallback(async (file: File) => {
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch(`/api/super-admin/order-acceptance-sound/upload`, { method: "POST", body: fd });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
    if (!res.ok || !data.ok || !data.url) {
      throw new Error(data.error || "Sound upload failed");
    }
    return data.url;
  }, []);

  const addNew = useCallback(async () => {
    const t = newType.trim().toUpperCase();
    if (!t) return;
    if (rows.some((r) => r.store_type === t)) {
      setMsg("Store type already exists");
      return;
    }
    const row: Row = { store_type: t, ...DEFAULT_ROW };
    const ok = await upsert(row);
    if (!ok) return;
    setRows((prev) => [...prev, row].sort((a, b) => a.store_type.localeCompare(b.store_type)));
    setNewType("");
  }, [newType, rows, upsert]);

  const removeType = useCallback(async (r: Row) => {
    const type = r.store_type;
    const ok = window.confirm(
      `Remove store type "${type}"?\n\nThis deletes the type from the database and removes its alert sounds from storage.`
    );
    if (!ok) return;

    if (playingPreviewKey?.startsWith(`${type}:`)) {
      stopSoundPreview();
      setPlayingPreviewKey(null);
    }

    setDeletingRow(type);
    setMsg(null);
    try {
      const res = await fetch(`/api/super-admin/order-acceptance-settings`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_type: type,
          alert_sound_url: r.alert_sound_url,
          alert_sound_url_2: r.alert_sound_url_2,
          alert_sound_url_3: r.alert_sound_url_3,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setMsg(data.error || "Remove failed");
        return;
      }
      setRows((prev) => prev.filter((x) => x.store_type !== type));
      setOriginalByType((prev) => {
        const next = { ...prev };
        delete next[type];
        return next;
      });
      setMsg(`Removed ${type}`);
    } finally {
      setDeletingRow(null);
    }
  }, [playingPreviewKey]);

  const applySourceToAll = useCallback(async () => {
    const source =
      rows.find((r) => r.store_type.toUpperCase() === "RESTAURANT" && (r.alert_sound_url || r.alert_sound_url_2 || r.alert_sound_url_3))
      ?? rows.find((r) => r.alert_sound_url || r.alert_sound_url_2 || r.alert_sound_url_3);
    if (!source) {
      setMsg("Upload a sound on one type first (e.g. RESTAURANT), then apply to all.");
      return;
    }
    const ok = window.confirm(
      `Copy ${source.store_type} sounds to every store type and set acceptance time to 15 minutes?\n\nEach type gets its own R2 copy. Changing one later will not break the others.`
    );
    if (!ok) return;
    setApplyingAll(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/super-admin/order-acceptance-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply_source_to_all",
          source_store_type: source.store_type,
          acceptance_window_minutes: 15,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        sourceType?: string;
        updated?: string[];
      };
      if (!res.ok || !data.ok) {
        setMsg(data.error || "Apply failed");
        return;
      }
      await load();
      setMsg(
        `Copied ${data.sourceType} sounds to ${(data.updated ?? []).length} types · 15 min window`
      );
    } finally {
      setApplyingAll(false);
    }
  }, [load, rows]);

  const canAdd = useMemo(() => newType.trim().length > 0, [newType]);

  const isDirty = useCallback(
    (r: Row) => {
      const o = originalByType[r.store_type];
      if (!o) return true;
      return (
        o.acceptance_window_minutes !== r.acceptance_window_minutes ||
        o.alert_sound_enabled !== r.alert_sound_enabled ||
        (o.alert_sound_url ?? null) !== (r.alert_sound_url ?? null) ||
        (o.alert_sound_url_2 ?? null) !== (r.alert_sound_url_2 ?? null) ||
        (o.alert_sound_url_3 ?? null) !== (r.alert_sound_url_3 ?? null) ||
        o.alert_sound_repeat_count !== r.alert_sound_repeat_count
      );
    },
    [originalByType]
  );

  /** Fixed columns: no wrap; horizontal scroll on narrow viewports */
  const rowGridClass =
    "grid gap-x-2 gap-y-1 px-3 py-2 items-center min-h-[52px] " +
    "grid-cols-[minmax(72px,100px)_42px_36px_minmax(200px,1fr)_38px_92px]";

  const headerGridClass =
    "grid gap-x-2 px-3 py-2 border-b border-gray-100 bg-gray-50 text-[10px] font-semibold uppercase tracking-wide text-gray-600 " +
    "grid-cols-[minmax(72px,100px)_42px_36px_minmax(200px,1fr)_38px_92px]";

  return (
    <div className="px-3 py-3 sm:px-4">
      <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0">
              <label className="text-xs font-medium text-gray-700">Add store type</label>
              <input
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="mt-0.5 w-full max-w-xs rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                placeholder="e.g. ELECTRONICS_ECOMMERCE"
              />
            </div>
            <button
              type="button"
              disabled={!canAdd || savingRow != null}
              onClick={() => void addNew()}
              className="h-9 shrink-0 cursor-pointer rounded-lg bg-gray-900 px-3 text-xs font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={applyingAll || loading || rows.length === 0}
              onClick={() => void applySourceToAll()}
              className="h-9 shrink-0 cursor-pointer rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {applyingAll ? "Applying…" : "Copy sounds + 15 min to all"}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void load()}
              className="h-9 shrink-0 cursor-pointer rounded-lg border border-gray-200 px-3 text-xs font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>
        {msg ? <p className="mt-2 text-xs text-gray-700">{msg}</p> : null}
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <div className="min-w-[640px]">
          <div className={headerGridClass}>
            <div className="truncate">Type</div>
            <div className="text-center">Min</div>
            <div className="text-center">On</div>
            <div>Sounds (3)</div>
            <div className="text-center">Rep</div>
            <div className="text-right">Actions</div>
          </div>

          <div className="divide-y divide-gray-100">
            {rows.map((r, idx) => (
              <div key={`${r.store_type}-${idx}`} className={rowGridClass}>
                <div className="min-w-0 truncate text-xs font-semibold text-gray-900" title={r.store_type}>
                  {r.store_type}
                </div>
                <div className="min-w-0">
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={r.acceptance_window_minutes}
                    onChange={(e) => {
                      const v = Number(e.target.value || 0);
                      setRows((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, acceptance_window_minutes: v } : x))
                      );
                    }}
                    className="w-full rounded border border-gray-200 px-1 py-1 text-center text-xs tabular-nums"
                  />
                </div>
                <div className="flex justify-center">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={r.alert_sound_enabled}
                    onClick={() =>
                      setRows((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, alert_sound_enabled: !x.alert_sound_enabled } : x))
                      )
                    }
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition ${
                      r.alert_sound_enabled
                        ? "border-emerald-600 bg-emerald-600"
                        : "border-gray-300 bg-gray-200"
                    }`}
                    title={r.alert_sound_enabled ? "Sound enabled" : "Sound disabled"}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                        r.alert_sound_enabled ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
                <div className="min-w-0">
                  <div className="flex max-w-full gap-1">
                    {([1, 2, 3] as const).map((slot) => {
                      const url = slotUrl(r, slot);
                      const busyKey = `${r.store_type}:${slot}`;
                      const isPlaying = playingPreviewKey === busyKey;
                      return (
                        <div
                          key={slot}
                          className="flex min-w-0 flex-1 items-center gap-0.5 rounded-md border border-gray-200 bg-gray-50 px-0.5 py-0.5"
                        >
                          <span className="shrink-0 pl-0.5 text-[9px] font-bold text-gray-400 w-2.5">{slot}</span>
                          <label
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded border transition ${
                              url
                                ? "cursor-pointer border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                                : "cursor-pointer border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-700"
                            } ${uploadingKey === busyKey ? "cursor-not-allowed pointer-events-none opacity-60" : ""}`}
                            title="Upload audio"
                          >
                            {uploadingKey === busyKey ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            ) : (
                              <Upload className="h-3.5 w-3.5" aria-hidden />
                            )}
                            <input
                              type="file"
                              accept="audio/*"
                              className="sr-only"
                              disabled={uploadingKey === busyKey}
                              onChange={(e) => {
                                const inputEl = e.currentTarget;
                                const f = e.target.files?.[0];
                                if (!f) return;
                                void (async () => {
                                  setUploadingKey(busyKey);
                                  try {
                                    const uploaded = await uploadSound(f);
                                    setRows((prev) =>
                                      prev.map((x, i) =>
                                        i === idx ? setSlotUrl(x, slot, uploaded) : x
                                      )
                                    );
                                    setMsg(`Sound ${slot} uploaded`);
                                  } catch (err) {
                                    setMsg(err instanceof Error ? err.message : "Upload failed");
                                  } finally {
                                    inputEl.value = "";
                                    setUploadingKey(null);
                                  }
                                })();
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            disabled={!url}
                            onClick={() => togglePreview(busyKey, url)}
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded border transition disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-30 ${
                              url
                                ? isPlaying
                                  ? "cursor-pointer border-orange-300 bg-orange-50 text-orange-700"
                                  : "cursor-pointer border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                                : "cursor-not-allowed border-transparent bg-transparent"
                            }`}
                            title={url ? (isPlaying ? "Pause preview" : "Play preview") : "No file"}
                            aria-label={url ? (isPlaying ? "Pause sound preview" : "Play sound preview") : undefined}
                          >
                            {isPlaying ? (
                              <Pause className="h-3.5 w-3.5" aria-hidden />
                            ) : (
                              <Play className="h-3.5 w-3.5 pl-0.5" aria-hidden />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (playingPreviewKey === busyKey) {
                                stopSoundPreview();
                                setPlayingPreviewKey(null);
                              }
                              setRows((prev) =>
                                prev.map((x, i) =>
                                  i === idx ? setSlotUrl(x, slot, null) : x
                                )
                              );
                            }}
                            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded border border-gray-200 bg-white text-gray-600 hover:bg-red-50 hover:border-red-200 hover:text-red-700"
                            title="Remove this sound"
                            aria-label={`Remove sound ${slot}`}
                          >
                            <Trash2 className="h-3 w-3" aria-hidden />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="min-w-0">
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={r.alert_sound_repeat_count}
                    onChange={(e) => {
                      const v = Number(e.target.value || 0);
                      setRows((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, alert_sound_repeat_count: v } : x))
                      );
                    }}
                    className="w-full rounded border border-gray-200 px-1 py-1 text-center text-xs tabular-nums"
                  />
                </div>
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    disabled={!isDirty(r) || savingRow === r.store_type || deletingRow === r.store_type}
                    onClick={() => void upsert(r)}
                    className={`inline-flex min-h-8 cursor-pointer items-center justify-center rounded-lg px-2.5 py-1 text-xs font-semibold text-white transition disabled:cursor-not-allowed ${
                      !isDirty(r) || savingRow === r.store_type || deletingRow === r.store_type
                        ? "bg-gray-300"
                        : "bg-gray-900 hover:bg-gray-800"
                    }`}
                  >
                    {savingRow === r.store_type ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      "Save"
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={deletingRow === r.store_type || savingRow === r.store_type}
                    onClick={() => void removeType(r)}
                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    title={`Remove ${r.store_type}`}
                    aria-label={`Remove store type ${r.store_type}`}
                  >
                    {deletingRow === r.store_type ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    )}
                  </button>
                </div>
              </div>
            ))}
            {rows.length === 0 ? (
              <div className="px-3 py-6 text-xs text-gray-600">No rows yet. Do a hard refresh and check your connection.</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
