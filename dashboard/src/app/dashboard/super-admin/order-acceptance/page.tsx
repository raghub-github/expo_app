"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

type Row = {
  store_type: string;
  acceptance_window_minutes: number;
  alert_sound_enabled: boolean;
  alert_sound_url: string | null;
  alert_sound_repeat_count: number;
};

const DEFAULT_ROW: Omit<Row, "store_type"> = {
  acceptance_window_minutes: 5,
  alert_sound_enabled: true,
  alert_sound_url: null,
  alert_sound_repeat_count: 1,
};

export default function SuperAdminOrderAcceptancePage() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [newType, setNewType] = useState("");
  const [uploadingRow, setUploadingRow] = useState<string | null>(null);
  const [savingRow, setSavingRow] = useState<string | null>(null);
  const [originalByType, setOriginalByType] = useState<Record<string, Row>>({});

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
      const nextRows = Array.isArray(data.rows) ? data.rows : [];
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

  const addNew = useCallback(() => {
    const t = newType.trim().toUpperCase();
    if (!t) return;
    if (rows.some((r) => r.store_type === t)) {
      setMsg("Store type already exists");
      return;
    }
    setRows((prev) => [...prev, { store_type: t, ...DEFAULT_ROW }].sort((a, b) => a.store_type.localeCompare(b.store_type)));
    setNewType("");
  }, [newType, rows]);

  const canAdd = useMemo(() => newType.trim().length > 0, [newType]);

  const isDirty = useCallback(
    (r: Row) => {
      const o = originalByType[r.store_type];
      if (!o) return true;
      return (
        o.acceptance_window_minutes !== r.acceptance_window_minutes ||
        o.alert_sound_enabled !== r.alert_sound_enabled ||
        (o.alert_sound_url ?? null) !== (r.alert_sound_url ?? null) ||
        o.alert_sound_repeat_count !== r.alert_sound_repeat_count
      );
    },
    [originalByType]
  );

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Order acceptance settings (Food)</h1>
        <p className="mt-1 text-sm text-gray-600">
          One row per store type. Controls acceptance time + sound settings used by partnersite + merchant app.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-2 md:flex-row md:items-end">
            <div>
              <label className="text-sm font-medium text-gray-700">Add store type</label>
              <input
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="mt-1 w-72 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="e.g. ELECTRONICS_ECOMMERCE"
              />
            </div>
            <button
              disabled={!canAdd}
              onClick={addNew}
              className="h-10 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
            >
              Add
            </button>
          </div>
          <button
            disabled={loading}
            onClick={() => void load()}
            className="h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
        {msg ? <p className="mt-3 text-sm text-gray-700">{msg}</p> : null}
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="grid grid-cols-12 gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
          <div className="col-span-3">Store type</div>
          <div className="col-span-2">Acceptance (min)</div>
          <div className="col-span-2">Enabled</div>
          <div className="col-span-3">Sound</div>
          <div className="col-span-1">Repeat</div>
          <div className="col-span-1 text-right">Action</div>
        </div>

        <div className="divide-y divide-gray-100">
          {rows.map((r, idx) => (
            <div key={`${r.store_type}-${idx}`} className="grid grid-cols-12 items-center gap-2 px-4 py-3">
              <div className="col-span-3 text-sm font-semibold text-gray-900">{r.store_type}</div>
              <div className="col-span-2">
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
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="col-span-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={r.alert_sound_enabled}
                  onClick={() =>
                    setRows((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, alert_sound_enabled: !x.alert_sound_enabled } : x))
                    )
                  }
                  className={`relative inline-flex h-6 w-11 items-center rounded-full border transition ${
                    r.alert_sound_enabled
                      ? "border-emerald-600 bg-emerald-600"
                      : "border-gray-300 bg-gray-200"
                  }`}
                  title={r.alert_sound_enabled ? "Enabled" : "Disabled"}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                      r.alert_sound_enabled ? "translate-x-5" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
              <div className="col-span-3">
                <div className="flex flex-wrap items-center gap-2">
                  <label
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                      r.alert_sound_url
                        ? "border-gray-200 bg-gray-50 text-gray-500 opacity-70"
                        : "border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-700"
                    } ${uploadingRow === r.store_type ? "pointer-events-none opacity-70" : ""}`}
                  >
                    {uploadingRow === r.store_type ? "Uploading..." : "Upload"}
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      disabled={uploadingRow === r.store_type}
                      onChange={(e) => {
                        const inputEl = e.currentTarget;
                        const f = e.target.files?.[0];
                        if (!f) return;
                        void (async () => {
                          setUploadingRow(r.store_type);
                          try {
                            const url = await uploadSound(f);
                            setRows((prev) => prev.map((x, i) => (i === idx ? { ...x, alert_sound_url: url } : x)));
                            setMsg("Sound uploaded");
                          } catch (err) {
                            setMsg(err instanceof Error ? err.message : "Upload failed");
                          } finally {
                            // React event target may be null asynchronously; use captured element.
                            inputEl.value = "";
                            setUploadingRow(null);
                          }
                        })();
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setRows((prev) => prev.map((x, i) => (i === idx ? { ...x, alert_sound_url: null } : x)))
                    }
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium hover:bg-gray-50"
                  >
                    Remove
                  </button>
                  {r.alert_sound_url ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                      Uploaded
                    </span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">
                      Not uploaded
                    </span>
                  )}
                </div>
                <div className="mt-1 truncate text-xs text-gray-500">{r.alert_sound_url ? r.alert_sound_url : "Not set"}</div>
              </div>
              <div className="col-span-1">
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
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="col-span-1 flex justify-end">
                <button
                  type="button"
                  disabled={!isDirty(r) || savingRow === r.store_type}
                  onClick={() => void upsert(r)}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white transition ${
                    !isDirty(r) || savingRow === r.store_type
                      ? "bg-gray-300"
                      : "bg-gray-900 hover:bg-gray-800"
                  }`}
                >
                  {savingRow === r.store_type ? (
                    <>
                      <span
                        className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent"
                        aria-hidden
                      />
                      Saving
                    </>
                  ) : (
                    "Save"
                  )}
                </button>
              </div>
            </div>
          ))}
          {rows.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-600">No rows yet. Run the migration and refresh.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

