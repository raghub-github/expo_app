"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type SettingRow = {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
};

function valueToEditor(v: unknown): string {
  if (typeof v === "string") return v;
  return JSON.stringify(v, null, 2);
}

function parseEditor(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export default function SettingsPage() {
  const { data, isLoading, mutate } = useSWR<{ items: SettingRow[] }>(
    "/api/super-admin/notifications/settings",
    fetcher,
  );
  const items = data?.items ?? [];
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of items) {
      map[row.key] = drafts[row.key] ?? valueToEditor(row.value);
    }
    return map;
  }, [items, drafts]);

  async function save(key: string) {
    setSaving(key);
    setError(null);
    try {
      const res = await fetch("/api/super-admin/notifications/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: parseEditor(editors[key] ?? "") }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? `save_failed_${res.status}`);
        return;
      }
      setDrafts((d) => {
        const next = { ...d };
        delete next[key];
        return next;
      });
      await mutate(body, { revalidate: false });
      await mutate();
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-slate-50 px-3 pb-3 pt-1 sm:px-5 sm:pt-2 xl:px-6">
      <div className="mx-auto flex h-full min-h-0 w-full min-w-0 max-w-7xl flex-col">
        <div className="shrink-0">
          <p className="max-w-2xl text-sm text-slate-500">
            Global controls that apply to every send (rate limits, quiet hours, retry delays, reminders).
          </p>
          {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-auto">
          {isLoading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Loading…</div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
              No settings found. Apply migration 0385 / 0517.
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((row) => (
                <section key={row.key} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-mono text-sm font-semibold text-slate-900">{row.key}</h2>
                      <p className="mt-1 text-xs text-slate-500">{row.description ?? "—"}</p>
                    </div>
                    <button
                      type="button"
                      disabled={saving === row.key}
                      onClick={() => void save(row.key)}
                      className="rounded-md bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50"
                    >
                      {saving === row.key ? "Saving…" : "Save"}
                    </button>
                  </div>
                  <textarea
                    className="mt-3 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800"
                    rows={4}
                    value={editors[row.key] ?? ""}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [row.key]: e.target.value }))
                    }
                  />
                  <p className="mt-1 text-[10px] text-slate-400">
                    Updated {row.updated_at ? new Date(row.updated_at).toLocaleString() : "—"}
                    {row.updated_by ? ` · ${row.updated_by}` : ""}
                  </p>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
