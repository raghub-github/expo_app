"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from "react";
import { ImageIcon, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  LEARNING_CENTRE_AUDIENCES,
  type LearningCentreAudience,
  type LearningCentreVideoRow,
} from "@/lib/learning-centre/shared";
import { parseYoutubeVideoId, youtubeThumbnailUrl } from "@/lib/learning-centre/youtube";
import { resolveAttachmentProxyUrl } from "@/lib/attachments/resolve-attachment-proxy-url";
import { cn } from "@/lib/utils";

const AUDIENCE_LABEL: Record<LearningCentreAudience, string> = {
  customer: "Customer",
  rider: "Rider",
  merchant: "Merchant",
};

type FormState = {
  audience: LearningCentreAudience;
  section_title: string;
  section_number: string;
  video_title: string;
  youtube_url: string;
  duration_label: string;
  sort_order: string;
};

const EMPTY_FORM: FormState = {
  audience: "merchant",
  section_title: "",
  section_number: "1",
  video_title: "",
  youtube_url: "",
  duration_label: "",
  sort_order: "",
};

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function thumbSrc(row: LearningCentreVideoRow): string | null {
  if (row.thumbnail_proxy_url) {
    return resolveAttachmentProxyUrl(row.thumbnail_proxy_url) || row.thumbnail_proxy_url;
  }
  const id = parseYoutubeVideoId(row.youtube_url ?? "");
  return id ? youtubeThumbnailUrl(id) : null;
}

export function LearningCentreAdminPanel() {
  const [items, setItems] = useState<LearningCentreVideoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<LearningCentreAudience | "all">("merchant");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editId, setEditId] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sectionMode, setSectionMode] = useState<"existing" | "new">("existing");
  const fileRef = useRef<HTMLInputElement>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/super-admin/learning-centre?audience=all", { cache: "no-store" });
      const json = (await res.json()) as { items?: LearningCentreVideoRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const visible = useMemo(
    () => (filter === "all" ? items : items.filter((row) => row.audience === filter)),
    [items, filter]
  );

  const groupedVisible = useMemo(() => {
    const groups: { title: string; section_number: number; videos: LearningCentreVideoRow[] }[] = [];
    const indexByKey = new Map<string, number>();
    for (const row of visible) {
      const title = str(row.section_title).trim() || "Untitled";
      const key = `${row.audience}:${title.toLowerCase()}`;
      let idx = indexByKey.get(key);
      if (idx == null) {
        idx = groups.length;
        indexByKey.set(key, idx);
        groups.push({
          title,
          section_number: Number(row.section_number ?? 1),
          videos: [],
        });
      } else {
        const g = groups[idx]!;
        const n = Number(row.section_number ?? 1);
        if (n < g.section_number) g.section_number = n;
      }
      groups[idx]!.videos.push(row);
    }
    groups.sort((a, b) => a.section_number - b.section_number || a.title.localeCompare(b.title));
    return groups;
  }, [visible]);

  const sectionHints = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of items) {
      if (row.audience !== form.audience) continue;
      const title = str(row.section_title).trim();
      if (!title) continue;
      const key = title.toLowerCase();
      const n = Number(row.section_number ?? 1);
      const prev = map.get(key);
      if (prev == null || n < prev) map.set(key, n);
    }
    return Array.from(map.entries())
      .map(([key, section_number]) => {
        const title =
          str(
            items.find(
              (row) =>
                row.audience === form.audience &&
                str(row.section_title).trim().toLowerCase() === key
            )?.section_title
          ).trim() || key;
        return { title, section_number };
      })
      .sort((a, b) => a.section_number - b.section_number || a.title.localeCompare(b.title));
  }, [items, form.audience]);

  const applyExistingSection = (title: string) => {
    const match = sectionHints.find(
      (s) => str(s.title).toLowerCase() === str(title).trim().toLowerCase()
    );
    if (!match) return;
    setForm((p) => ({
      ...p,
      section_title: match.title,
      section_number: String(match.section_number),
    }));
  };

  const nextNewSectionNumber = useMemo(() => {
    const max = sectionHints.reduce((n, s) => Math.max(n, s.section_number), 0);
    return String(max + 1);
  }, [sectionHints]);

  const usingExistingSection = sectionMode === "existing" && sectionHints.length > 0;

  useEffect(() => {
    if (editId != null) return;
    if (sectionHints.length === 0) {
      setSectionMode("new");
      return;
    }
    if (sectionMode !== "existing") return;
    const current = str(form.section_title).trim().toLowerCase();
    const match = sectionHints.find((s) => s.title.toLowerCase() === current);
    if (!match) applyExistingSection(sectionHints[0]!.title);
  }, [sectionHints, sectionMode, editId, form.section_title]);

  const resetForm = (opts?: { keepSection?: boolean }) => {
    const keep = opts?.keepSection === true;
    const audience = filter === "all" ? form.audience : filter;
    if (keep && str(form.section_title).trim()) {
      setSectionMode("existing");
      setForm({
        ...EMPTY_FORM,
        audience,
        section_title: str(form.section_title),
        section_number: str(form.section_number).trim() || "1",
      });
    } else {
      setSectionMode(sectionHints.length > 0 ? "existing" : "new");
      setForm({
        ...EMPTY_FORM,
        audience,
        section_number: nextNewSectionNumber,
      });
    }
    setEditId(null);
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const startEdit = (row: LearningCentreVideoRow) => {
    setEditId(row.id);
    setSectionMode("existing");
    setForm({
      audience: row.audience,
      section_title: str(row.section_title),
      section_number: String(row.section_number ?? 1),
      video_title: str(row.video_title),
      youtube_url: str(row.youtube_url),
      duration_label: str(row.duration_label),
      sort_order: row.sort_order != null ? String(row.sort_order) : "",
    });
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onSave = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("audience", form.audience);
      fd.set("section_title", str(form.section_title));
      fd.set("section_number", str(form.section_number).trim() || "1");
      fd.set("video_title", str(form.video_title));
      fd.set("youtube_url", str(form.youtube_url));
      fd.set("duration_label", str(form.duration_label));
      if (str(form.sort_order).trim()) fd.set("sort_order", str(form.sort_order).trim());
      if (file) fd.set("file", file);

      const url =
        editId != null
          ? `/api/super-admin/learning-centre/${editId}`
          : "/api/super-admin/learning-centre";
      const res = await fetch(url, { method: editId != null ? "PATCH" : "POST", body: fd });
      const json = (await res.json()) as { item?: LearningCentreVideoRow; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      if (editId != null) {
        resetForm({ keepSection: false });
      } else {
        resetForm({ keepSection: true });
      }
      await loadItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: number) => {
    if (busy) return;
    if (!window.confirm("Remove this video from Learning Centre?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/super-admin/learning-centre/${id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Remove failed");
      if (editId === id) resetForm({ keepSection: false });
      await loadItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Upload Learning Centre videos. Pick an existing section to add more videos to it, or
        create a new section. Same section can have many videos — they show as one row of cards
        in the app. Section number controls order (1 first, 2 second). Merchant app is connected
        now; tap a thumbnail in the app to open YouTube.
      </p>

      <div className="flex flex-wrap gap-2">
        {(["all", ...LEARNING_CENTRE_AUDIENCES] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => {
              setFilter(tab);
              if (editId == null) {
                setForm((prev) => ({
                  ...prev,
                  audience: tab === "all" ? prev.audience : tab,
                }));
              }
            }}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              filter === tab
                ? "bg-teal-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            )}
          >
            {tab === "all" ? "All apps" : AUDIENCE_LABEL[tab]}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          {editId != null ? (
            <Pencil className="h-4 w-4 text-teal-700" />
          ) : (
            <Plus className="h-4 w-4 text-teal-700" />
          )}
          <h2 className="text-sm font-semibold text-slate-800">
            {editId != null ? "Edit video" : "Add video"}
          </h2>
          {editId != null ? (
            <button
              type="button"
              onClick={() => resetForm({ keepSection: false })}
              className="ml-auto text-xs text-slate-500 hover:text-slate-800"
            >
              Cancel edit
            </button>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-slate-600">
            App
            <select
              value={form.audience}
              onChange={(e) =>
                setForm((p) => ({ ...p, audience: e.target.value as LearningCentreAudience }))
              }
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              {LEARNING_CENTRE_AUDIENCES.map((a) => (
                <option key={a} value={a}>
                  {AUDIENCE_LABEL[a]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
            Section
            <select
              value={
                usingExistingSection && str(form.section_title).trim()
                  ? str(form.section_title).trim()
                  : "__new__"
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__new__") {
                  setSectionMode("new");
                  setForm((p) => ({
                    ...p,
                    section_title: "",
                    section_number: nextNewSectionNumber,
                  }));
                  return;
                }
                setSectionMode("existing");
                applyExistingSection(v);
              }}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              {sectionHints.map((s) => (
                <option key={s.title} value={s.title}>
                  #{s.section_number} — {s.title}
                </option>
              ))}
              <option value="__new__">+ Create new section</option>
            </select>
            <span className="mt-1 block text-[11px] text-slate-400">
              {usingExistingSection
                ? "This video will be added to the selected section. You can add as many videos as you want."
                : "New section — give it a title and number, then add videos to it."}
            </span>
          </label>
          {!usingExistingSection ? (
            <>
              <label className="block text-xs font-medium text-slate-600">
                New section title
                <input
                  value={form.section_title}
                  onChange={(e) => setForm((p) => ({ ...p, section_title: e.target.value }))}
                  placeholder="Getting Started"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Section number
                <input
                  value={form.section_number}
                  onChange={(e) => setForm((p) => ({ ...p, section_number: e.target.value }))}
                  placeholder="1"
                  inputMode="numeric"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                />
                <span className="mt-1 block text-[11px] text-slate-400">
                  1 = first section in the app, 2 = second, and so on.
                </span>
              </label>
            </>
          ) : null}
          <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
            Video title
            <input
              value={form.video_title}
              onChange={(e) => setForm((p) => ({ ...p, video_title: e.target.value }))}
              placeholder="How to update FSSAI license"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
            YouTube link
            <input
              value={form.youtube_url}
              onChange={(e) => setForm((p) => ({ ...p, youtube_url: e.target.value }))}
              placeholder="https://www.youtube.com/watch?v=..."
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Duration (optional)
            <input
              value={form.duration_label}
              onChange={(e) => setForm((p) => ({ ...p, duration_label: e.target.value }))}
              placeholder="01:17"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Video order in section (optional)
            <input
              value={form.sort_order}
              onChange={(e) => setForm((p) => ({ ...p, sort_order: e.target.value }))}
              placeholder="Auto"
              inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
            Thumbnail
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-teal-800"
            />
            <span className="mt-1 block text-[11px] text-slate-400">
              {editId != null
                ? "Leave empty to keep the current thumbnail. If none is uploaded, YouTube’s thumbnail is used."
                : "Optional. If empty, YouTube’s thumbnail is used in the app."}
            </span>
          </label>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void onSave()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {editId != null
            ? "Save changes"
            : usingExistingSection
              ? "Add video to this section"
              : "Add video"}
        </button>
        {editId == null && usingExistingSection ? (
          <p className="mt-2 text-[11px] text-slate-500">
            After you add, this section stays selected — you can keep adding more videos to it.
          </p>
        ) : null}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          No Learning Centre videos yet for this filter.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Preview</th>
                <th className="px-4 py-3 font-medium">Video</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Section</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">#</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">App</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {groupedVisible.map((group) => (
                <Fragment key={`${group.title}:${group.section_number}`}>
                  <tr className="bg-slate-50">
                    <td colSpan={6} className="px-4 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex min-w-6 justify-center rounded bg-teal-100 px-1.5 py-0.5 text-[11px] font-semibold text-teal-800">
                          #{group.section_number}
                        </span>
                        <span className="text-sm font-semibold text-slate-800">{group.title}</span>
                        <span className="text-xs text-slate-500">
                          {group.videos.length} video{group.videos.length === 1 ? "" : "s"}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSectionMode("existing");
                            applyExistingSection(group.title);
                            setEditId(null);
                            setForm((p) => ({
                              ...EMPTY_FORM,
                              audience: p.audience,
                              section_title: group.title,
                              section_number: String(group.section_number),
                            }));
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className="ml-auto text-xs font-medium text-teal-700 hover:underline"
                        >
                          + Add video to this section
                        </button>
                      </div>
                    </td>
                  </tr>
                  {group.videos.map((row) => {
                    const src = thumbSrc(row);
                    return (
                      <tr key={row.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3">
                          <div className="flex h-14 w-20 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                            {src ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={src} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <ImageIcon className="h-5 w-5 text-slate-300" />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{row.video_title}</div>
                          <a
                            href={row.youtube_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-0.5 block truncate text-xs text-teal-700 hover:underline"
                          >
                            {row.youtube_url}
                          </a>
                          {row.duration_label ? (
                            <div className="mt-0.5 text-[11px] text-slate-400">{row.duration_label}</div>
                          ) : null}
                        </td>
                        <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">
                          {row.section_title}
                        </td>
                        <td className="hidden px-4 py-3 font-semibold text-slate-800 md:table-cell">
                          {row.section_number}
                        </td>
                        <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                          {AUDIENCE_LABEL[row.audience]}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => startEdit(row)}
                              className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void onDelete(row.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
