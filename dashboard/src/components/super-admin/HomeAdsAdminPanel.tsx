"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, Loader2, Plus, Trash2, RefreshCw, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveAttachmentProxyUrl } from "@/lib/attachments/resolve-attachment-proxy-url";
import {
  HOME_AD_AUDIENCE_LABEL,
  HOME_AD_AUDIENCES,
  HOME_AD_CTA_ACTION_LABEL,
  type HomeAdAudience,
  type HomeAdCtaAction,
  type HomeAdPlacement,
  type HomeAdRow,
} from "@/lib/home-ads/shared";

type FormState = {
  audience: HomeAdAudience;
  placement: HomeAdPlacement;
  title: string;
  body: string;
  cta_label: string;
  cta_url: string;
  cta_action: HomeAdCtaAction;
  sheet_title: string;
  sheet_body: string;
  sort_order: string;
  enabled: boolean;
  file: File | null;
  localPreview: string | null;
  existingPreview: string | null;
};

const emptyForm = (audience: HomeAdAudience = "merchant"): FormState => ({
  audience,
  placement: "both",
  title: "",
  body: "",
  cta_label: "",
  cta_url: "",
  cta_action: "share",
  sheet_title: "",
  sheet_body: "",
  sort_order: "0",
  enabled: true,
  file: null,
  localPreview: null,
  existingPreview: null,
});

function previewSrc(row: HomeAdRow): string | null {
  if (!row.image_proxy_url) return null;
  return resolveAttachmentProxyUrl(row.image_proxy_url) || row.image_proxy_url;
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-teal-600" : "bg-slate-300",
        disabled && "opacity-60"
      )}
    >
      <span
        className={cn(
          "absolute h-6 w-6 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-7" : "translate-x-1"
        )}
      />
    </button>
  );
}

export function HomeAdsAdminPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<HomeAdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<HomeAdAudience | "all">("merchant");
  const [form, setForm] = useState<FormState>(emptyForm("merchant"));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/super-admin/home-ads?audience=all", { cache: "no-store" });
      const json = (await res.json()) as { items?: HomeAdRow[]; error?: string };
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
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (form.localPreview?.startsWith("blob:")) URL.revokeObjectURL(form.localPreview);
    };
  }, [form.localPreview]);

  const visible = useMemo(
    () => (filter === "all" ? items : items.filter((row) => row.audience === filter)),
    [items, filter]
  );

  const resetForm = () => {
    if (form.localPreview?.startsWith("blob:")) URL.revokeObjectURL(form.localPreview);
    setEditingId(null);
    setForm(emptyForm(filter === "all" ? "merchant" : filter));
    if (fileRef.current) fileRef.current.value = "";
  };

  const startEdit = (row: HomeAdRow) => {
    if (form.localPreview?.startsWith("blob:")) URL.revokeObjectURL(form.localPreview);
    setEditingId(row.id);
    setForm({
      audience: row.audience,
      placement: row.placement,
      title: row.title,
      body: row.body,
      cta_label: row.cta_label ?? "",
      cta_url: row.cta_url ?? "",
      cta_action: row.cta_action ?? "share",
      sheet_title: row.sheet_title ?? "",
      sheet_body: row.sheet_body ?? "",
      sort_order: String(row.sort_order ?? 0),
      enabled: row.enabled,
      file: null,
      localPreview: null,
      existingPreview: previewSrc(row),
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  const onPickImage = (file: File | null) => {
    if (form.localPreview?.startsWith("blob:")) URL.revokeObjectURL(form.localPreview);
    if (!file) {
      setForm((p) => ({ ...p, file: null, localPreview: null }));
      return;
    }
    const url = URL.createObjectURL(file);
    setForm((p) => ({ ...p, file, localPreview: url }));
  };

  const submit = async () => {
    if (!form.file && !form.existingPreview && editingId == null) {
      setError("Please choose an ad image (uploaded to R2).");
      return;
    }
    if (form.cta_action === "bottom_sheet" && !form.sheet_title.trim() && !form.sheet_body.trim()) {
      setError("Add bottom sheet title or body content.");
      return;
    }
    if (form.cta_action === "share" && !form.cta_url.trim()) {
      setError("Add a share link / URL for the share action.");
      return;
    }
    if (form.cta_action === "redirect" && !form.cta_url.trim()) {
      setError("Add a redirect URL or in-app path (e.g. /(tabs)/earnings or https://…).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("audience", form.audience);
      fd.set("placement", form.placement);
      fd.set("title", form.title);
      fd.set("body", form.body);
      fd.set("cta_label", form.cta_label);
      fd.set("cta_url", form.cta_url);
      fd.set("cta_action", form.cta_action);
      fd.set("sheet_title", form.sheet_title);
      fd.set("sheet_body", form.sheet_body);
      fd.set("sort_order", form.sort_order || "0");
      fd.set("enabled", form.enabled ? "true" : "false");
      if (form.file) fd.set("file", form.file);

      const url =
        editingId != null
          ? `/api/super-admin/home-ads/${editingId}`
          : "/api/super-admin/home-ads";
      const res = await fetch(url, {
        method: editingId != null ? "PATCH" : "POST",
        body: fd,
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      resetForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (row: HomeAdRow) => {
    setBusyId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/super-admin/home-ads/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !row.enabled }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Toggle failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Toggle failed");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (row: HomeAdRow) => {
    if (!confirm(`Delete ad “${row.title || row.id}”?`)) return;
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/super-admin/home-ads/${row.id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Delete failed");
      if (editingId === row.id) resetForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  const formPreview = form.localPreview || form.existingPreview;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Home Ads</h2>
            <p className="mt-1 max-w-3xl text-xs text-slate-500 sm:text-sm">
              Zomato-style promo cards for Customer, Rider, and Merchant. Image uploads go to R2;
              apps load the proxy URL. Toggle off = hidden in apps.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(["all", ...HOME_AD_AUDIENCES] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setFilter(tab);
                if (editingId == null) setForm(emptyForm(tab === "all" ? "merchant" : tab));
              }}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium",
                filter === tab
                  ? "bg-teal-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              )}
            >
              {tab === "all" ? "All apps" : HOME_AD_AUDIENCE_LABEL[tab]}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">
          {editingId != null ? `Edit ad #${editingId}` : "+ Add ad card"}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-slate-600">
            App
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={form.audience}
              onChange={(e) =>
                setForm((p) => ({ ...p, audience: e.target.value as HomeAdAudience }))
              }
            >
              {HOME_AD_AUDIENCES.map((a) => (
                <option key={a} value={a}>
                  {HOME_AD_AUDIENCE_LABEL[a]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Placement
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={form.placement}
              onChange={(e) =>
                setForm((p) => ({ ...p, placement: e.target.value as HomeAdPlacement }))
              }
            >
              <option value="both">Home + Orders</option>
              <option value="home">Home only</option>
              <option value="orders">Orders only</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600 sm:col-span-2">
            Title
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="It's mithai season!"
            />
          </label>
          <label className="text-xs font-medium text-slate-600 sm:col-span-2">
            Body
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              rows={2}
              value={form.body}
              onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
              placeholder="Short promo line shown on the card"
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            CTA label
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={form.cta_label}
              onChange={(e) => setForm((p) => ({ ...p, cta_label: e.target.value }))}
              placeholder="Invite & Earn"
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Sort order
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={form.sort_order}
              onChange={(e) => setForm((p) => ({ ...p, sort_order: e.target.value }))}
              inputMode="numeric"
            />
          </label>

          <div className="sm:col-span-2">
            <p className="text-xs font-medium text-slate-600">On CTA click</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, cta_action: "bottom_sheet" }))}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium",
                  form.cta_action === "bottom_sheet"
                    ? "bg-teal-600 text-white"
                    : "bg-slate-100 text-slate-700"
                )}
              >
                Show bottom sheet
              </button>
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, cta_action: "share" }))}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium",
                  form.cta_action === "share"
                    ? "bg-teal-600 text-white"
                    : "bg-slate-100 text-slate-700"
                )}
              >
                Open share sheet
              </button>
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, cta_action: "redirect" }))}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium",
                  form.cta_action === "redirect"
                    ? "bg-teal-600 text-white"
                    : "bg-slate-100 text-slate-700"
                )}
              >
                Redirect
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">
              Redirect opens the target inside the app (in-app path) or browser (https).
            </p>
          </div>

          {form.cta_action === "share" ? (
            <label className="text-xs font-medium text-slate-600 sm:col-span-2">
              Share link / URL
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={form.cta_url}
                onChange={(e) => setForm((p) => ({ ...p, cta_url: e.target.value }))}
                placeholder="https://play.google.com/store/apps/…"
              />
            </label>
          ) : form.cta_action === "redirect" ? (
            <label className="text-xs font-medium text-slate-600 sm:col-span-2">
              Redirect URL / in-app path
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={form.cta_url}
                onChange={(e) => setForm((p) => ({ ...p, cta_url: e.target.value }))}
                placeholder="/(tabs)/earnings  or  /profile/offers  or  https://…"
              />
              <span className="mt-1 block text-[11px] font-normal text-slate-400">
                Merchant examples: /(tabs)/orders · /(tabs)/menu · /(tabs)/earnings · /profile/offers ·
                /profile/learning · https://gatimitra.com
              </span>
            </label>
          ) : (
            <>
              <label className="text-xs font-medium text-slate-600 sm:col-span-2">
                Bottom sheet title
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.sheet_title}
                  onChange={(e) => setForm((p) => ({ ...p, sheet_title: e.target.value }))}
                  placeholder="Grow with GatiMitra"
                />
              </label>
              <label className="text-xs font-medium text-slate-600 sm:col-span-2">
                Bottom sheet content
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  rows={3}
                  value={form.sheet_body}
                  onChange={(e) => setForm((p) => ({ ...p, sheet_body: e.target.value }))}
                  placeholder="Explain the offer, steps, or message shown in the sheet…"
                />
              </label>
              <label className="text-xs font-medium text-slate-600 sm:col-span-2">
                Optional link inside sheet
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.cta_url}
                  onChange={(e) => setForm((p) => ({ ...p, cta_url: e.target.value }))}
                  placeholder="https://… (optional)"
                />
              </label>
            </>
          )}

          <div className="sm:col-span-2">
            <p className="mb-2 text-xs font-medium text-slate-600">Ad image (R2 → proxy URL)</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => onPickImage(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600 hover:border-teal-500 hover:bg-teal-50/40"
            >
              {formPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={formPreview}
                  alt="Ad preview"
                  className="h-36 w-full max-w-md rounded-lg object-cover shadow-sm"
                />
              ) : (
                <>
                  <Upload className="h-8 w-8 text-slate-400" />
                  <span className="font-medium">Choose image</span>
                  <span className="text-xs text-slate-400">JPG / PNG / WEBP · max 8 MB · uploaded to R2 on save</span>
                </>
              )}
              {formPreview ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-700">
                  <ImageIcon className="h-3.5 w-3.5" />
                  {form.file ? "New image selected — will upload to R2 on save" : "Current R2 image"}
                </span>
              ) : null}
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:col-span-2">
            <div>
              <p className="text-sm font-medium text-slate-800">Enabled (show in apps)</p>
              <p className="text-xs text-slate-500">Off = card hidden everywhere</p>
            </div>
            <Toggle
              checked={form.enabled}
              onChange={(enabled) => setForm((p) => ({ ...p, enabled }))}
              label="Enabled"
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {editingId != null ? "Update ad" : "Add ad"}
          </button>
          {editingId != null ? (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          No ads yet. Add a card with an image and turn the toggle on.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Preview</th>
                <th className="px-4 py-3 font-medium">Ad</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">CTA</th>
                <th className="px-4 py-3 font-medium">Enabled</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((row) => {
                const src = previewSrc(row);
                return (
                  <tr key={row.id}>
                    <td className="px-4 py-3">
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={src}
                          alt=""
                          className="h-16 w-28 rounded-lg object-cover bg-slate-100"
                        />
                      ) : (
                        <div className="flex h-16 w-28 items-center justify-center rounded-lg bg-slate-100 text-[10px] text-slate-400">
                          No image
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{row.title || "Untitled"}</div>
                      <div className="text-xs text-slate-500 line-clamp-2">{row.body}</div>
                      <div className="mt-1 text-[11px] text-slate-400">
                        {HOME_AD_AUDIENCE_LABEL[row.audience]} · {row.placement}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell text-slate-600">
                      {HOME_AD_CTA_ACTION_LABEL[row.cta_action] ?? row.cta_action}
                    </td>
                    <td className="px-4 py-3">
                      <Toggle
                        checked={row.enabled}
                        disabled={busyId === row.id}
                        onChange={() => void toggleEnabled(row)}
                        label={row.enabled ? "Disable ad" : "Enable ad"}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void remove(row)}
                          className="inline-flex items-center rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
