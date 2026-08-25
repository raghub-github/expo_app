"use client";

import { useRef } from "react";
import { CloudUpload, Eye, X } from "lucide-react";
import type { StepRejectionFieldMeta } from "@/lib/merchants/step-rejection-fields";
import { useOnboardingStoreTypes } from "@/hooks/useOnboardingStoreTypes";

export type DynamicFieldValues = Record<string, string>;
export type DynamicDocState = {
  numbers: Record<string, string>;
  expiries: Record<string, string>;
  urls: Record<string, string | null>;
  files: Record<string, File | null>;
};

function formatPrevious(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") {
    const t = value.trim();
    if (t === "true") return "Yes";
    if (t === "false") return "No";
    return t || "—";
  }
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    if (value.every((x) => typeof x === "string" && (/^https?:|\//.test(x) || x.includes("proxy")))) {
      return value.length ? `${value.length} image(s)` : "—";
    }
    return value.map(String).join(", ") || "—";
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if ("latitude" in o || "longitude" in o) {
      const lat = o.latitude != null ? String(o.latitude) : "—";
      const lng = o.longitude != null ? String(o.longitude) : "—";
      return `Lat ${lat} · Lng ${lng}`;
    }
    if ("document_number" in o || "document_url" in o || "expiry_date" in o) {
      const parts: string[] = [];
      if (o.document_number) parts.push(`No. ${String(o.document_number)}`);
      if (o.expiry_date) parts.push(`Expiry ${String(o.expiry_date).slice(0, 10)}`);
      if (o.document_url) parts.push("File attached");
      return parts.join(" · ") || "—";
    }
    try {
      return JSON.stringify(value);
    } catch {
      return "—";
    }
  }
  return "—";
}

function previousUrl(value: unknown): string | null {
  if (typeof value === "string" && /^https?:|\//.test(value)) return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    for (const k of ["document_url", "banner_url", "proxy_url", "url"]) {
      if (typeof o[k] === "string" && String(o[k]).trim()) return String(o[k]).trim();
    }
  }
  return null;
}

function previousGalleryUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).map((s) => s.trim()).filter(Boolean);
}

function documentPreviousParts(value: unknown): {
  number: string | null;
  expiry: string | null;
  url: string | null;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { number: null, expiry: null, url: previousUrl(value) };
  }
  const o = value as Record<string, unknown>;
  const number =
    o.document_number != null && String(o.document_number).trim()
      ? String(o.document_number).trim()
      : null;
  const expiry =
    o.expiry_date != null && String(o.expiry_date).trim()
      ? String(o.expiry_date).trim().slice(0, 10)
      : null;
  return { number, expiry, url: previousUrl(value) };
}

function OldValueBox({
  label = "Old / current details",
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 min-h-[2.5rem] whitespace-pre-wrap">
        {children}
      </div>
    </div>
  );
}

function fileExtBadge(file: File | null | undefined, url: string | null | undefined): string {
  const name = (file?.name || url || "").toLowerCase();
  const type = (file?.type || "").toLowerCase();
  if (type === "application/pdf" || /\.pdf(\?|$)/i.test(name)) return "PDF";
  if (type.includes("csv") || /\.csv(\?|$)/i.test(name)) return "CSV";
  if (type.startsWith("image/") || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(name)) return "IMG";
  if (type.startsWith("text/") || /\.txt(\?|$)/i.test(name)) return "TXT";
  return "FILE";
}

function displayFileName(file: File | null | undefined, url: string | null | undefined): string {
  if (file?.name?.trim()) return file.name.trim();
  if (!url?.trim()) return "Selected file";
  try {
    const u = new URL(url, "http://local.invalid");
    const key = u.searchParams.get("key") || u.pathname;
    const base = decodeURIComponent(key.split("/").pop() || "");
    return base || "Selected file";
  } catch {
    return url.split("?")[0]?.split("/").pop() || "Selected file";
  }
}

/** Empty: Upload button + format hints. Selected: file row with View + Clear. */
function ResubmitFileUploadBox({
  label,
  file,
  url,
  inputRef,
  accept,
  onPick,
  onClear,
  onPreview,
}: {
  label: string;
  file?: File | null;
  url?: string | null;
  inputRef?: (el: HTMLInputElement | null) => void;
  accept?: string;
  onPick?: (file: File | null) => void;
  onClear?: () => void;
  onPreview?: (source: File | string) => void;
}) {
  const hasFile = Boolean(file || (typeof url === "string" && url.trim()));
  const name = displayFileName(file, url);
  const badge = fileExtBadge(file, url);
  const inputElRef = useRef<HTMLInputElement | null>(null);

  const openPicker = () => {
    inputElRef.current?.click();
  };

  return (
    <div>
      <label className="block text-sm font-semibold text-slate-800 mb-1.5">{label}</label>
      <input
        ref={(el) => {
          inputElRef.current = el;
          inputRef?.(el);
        }}
        type="file"
        accept={
          accept || "image/png,image/jpeg,application/pdf,.png,.jpg,.jpeg,.pdf,.csv,text/csv,text/plain"
        }
        className="hidden"
        onChange={(e) => {
          onPick?.(e.target.files?.[0] || null);
          e.target.value = "";
        }}
      />
      {hasFile ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 min-h-[3.25rem]">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-white border border-slate-200">
            <span
              className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                badge === "PDF"
                  ? "bg-orange-500 text-white"
                  : badge === "IMG"
                    ? "bg-sky-500 text-white"
                    : badge === "CSV"
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-500 text-white"
              }`}
            >
              {badge}
            </span>
          </div>
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800" title={name}>
            {name}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            {onPreview ? (
              <button
                type="button"
                onClick={() => onPreview((file || url) as File | string)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <Eye className="h-3.5 w-3.5" />
                View
              </button>
            ) : null}
            {onClear ? (
              <button
                type="button"
                onClick={onClear}
                title="Clear file"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between min-h-[4.5rem]">
          <div className="flex flex-col items-start gap-1.5">
            <CloudUpload className="h-5 w-5 text-slate-400" />
            <button
              type="button"
              onClick={openPicker}
              className="inline-flex items-center justify-center rounded-md bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-violet-700"
            >
              Upload
            </button>
          </div>
          <ul className="text-xs text-slate-500 space-y-0.5 list-disc list-inside">
            <li>Max file size: 20 MB</li>
            <li>File format: .png, .jpeg, .pdf</li>
          </ul>
        </div>
      )}
    </div>
  );
}

type Props = {
  fields: StepRejectionFieldMeta[];
  values: DynamicFieldValues;
  onChange: (key: string, value: string) => void;
  docState?: DynamicDocState;
  onDocNumberChange?: (key: string, value: string) => void;
  onDocExpiryChange?: (key: string, value: string) => void;
  onDocFilePick?: (key: string, file: File | null) => void;
  onDocClear?: (key: string) => void;
  onPreviewUrl?: (source: File | string, title: string) => void;
  bannerFile?: File | null;
  bannerUrl?: string | null;
  onBannerPick?: (file: File | null) => void;
  fileInputRefs?: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  bannerInputRef?: React.RefObject<HTMLInputElement | null>;
};

/**
 * Renders ONLY rejected fields from backend metadata.
 * Never shows a reason-only empty card — always an editable control (fallback: text).
 */
export function DynamicRejectedFields({
  fields,
  values,
  onChange,
  docState,
  onDocNumberChange,
  onDocExpiryChange,
  onDocFilePick,
  onDocClear,
  onPreviewUrl,
  bannerFile,
  bannerUrl,
  onBannerPick,
  fileInputRefs,
  bannerInputRef,
}: Props) {
  const { options: liveStoreTypes } = useOnboardingStoreTypes("OTHERS");
  if (!fields.length) return null;

  return (
    <div className="space-y-4">
      {fields.map((field) => {
        const key = field.fieldKey;
        const reason = field.rejectionReason || "Please update this field.";
        const oldDisplay = formatPrevious(field.previousValue);
        const oldMedia = previousUrl(field.previousValue);
        const type = field.fieldType || "text";
        const options =
          key === "store_type"
            ? liveStoreTypes
            : field.selectOptions || (type === "select" ? liveStoreTypes : []);

        return (
          <div
            key={key}
            className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">{field.label}</p>
              {field.currentStatus === "pending_review" ? (
                <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-amber-100 text-amber-800">
                  Pending review
                </span>
              ) : (
                <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-rose-100 text-rose-700">
                  Rejected
                </span>
              )}
            </div>
            <p className="text-xs text-rose-700">
              <span className="font-semibold">Rejected reason:</span> {reason}
            </p>

            {type === "latlng" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <OldValueBox label="Old map location">{oldDisplay}</OldValueBox>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      New latitude
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={values.latitude || ""}
                      onChange={(e) => onChange("latitude", e.target.value)}
                      placeholder="e.g. 28.6139"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      New longitude
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={values.longitude || ""}
                      onChange={(e) => onChange("longitude", e.target.value)}
                      placeholder="e.g. 77.2090"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                </div>
              </div>
            ) : type === "image" || type === "gallery" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Old {type === "gallery" ? "gallery" : "image"}
                  </label>
                  {type === "gallery" && previousGalleryUrls(field.previousValue).length > 0 ? (
                    <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-2">
                      {previousGalleryUrls(field.previousValue).map((url, i) => (
                        <button
                          key={`${url}-${i}`}
                          type="button"
                          onClick={() => onPreviewUrl?.(url, `${field.label} ${i + 1}`)}
                          className="h-16 w-16 overflow-hidden rounded border border-slate-200"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  ) : oldMedia ? (
                    <div className="space-y-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={oldMedia}
                        alt={field.label}
                        className="h-28 w-full rounded-lg border border-slate-200 object-cover bg-white"
                      />
                      {onPreviewUrl ? (
                        <button
                          type="button"
                          onClick={() => onPreviewUrl(oldMedia, field.label)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700"
                        >
                          <Eye className="h-3.5 w-3.5" /> View
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-6 text-sm text-slate-400 text-center">
                      No previous {type === "gallery" ? "gallery images" : "image"}
                    </div>
                  )}
                </div>
                <div>
                  <ResubmitFileUploadBox
                    label={`Upload ${field.label}`}
                    file={bannerFile}
                    url={bannerUrl}
                    accept={field.uploadConfig?.accept || "image/png,image/jpeg,.png,.jpg,.jpeg"}
                    inputRef={(el) => {
                      if (bannerInputRef && "current" in bannerInputRef) {
                        (bannerInputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
                      }
                    }}
                    onPick={(f) => onBannerPick?.(f)}
                    onClear={
                      onBannerPick
                        ? () => {
                            onBannerPick(null);
                          }
                        : undefined
                    }
                    onPreview={
                      onPreviewUrl
                        ? (source) => onPreviewUrl(source, `New ${field.label}`)
                        : undefined
                    }
                  />
                </div>
              </div>
            ) : type === "document" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-slate-500">
                      Old / rejected details
                    </label>
                    {(() => {
                      const parts = documentPreviousParts(field.previousValue);
                      return (
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 space-y-1.5 text-sm text-slate-700">
                          <div className="flex justify-between gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              Number
                            </span>
                            <span className="font-mono text-right break-all">{parts.number || "—"}</span>
                          </div>
                          {field.uploadConfig?.expiryField || parts.expiry ? (
                            <div className="flex justify-between gap-2 border-t border-slate-100 pt-1.5">
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                Expiry
                              </span>
                              <span className="text-right">{parts.expiry || "—"}</span>
                            </div>
                          ) : null}
                          <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              File
                            </span>
                            {parts.url && onPreviewUrl ? (
                              <button
                                type="button"
                                onClick={() => onPreviewUrl(parts.url!, field.label)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700"
                              >
                                <Eye className="h-3.5 w-3.5" /> View file
                              </button>
                            ) : (
                              <span className="text-slate-400">{parts.url ? "File on record" : "—"}</span>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="space-y-2">
                    {field.uploadConfig?.numberField ? (
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          New {field.label} number
                        </label>
                        <input
                          type="text"
                          value={docState?.numbers[key] || ""}
                          onChange={(e) => onDocNumberChange?.(key, e.target.value)}
                          placeholder="Enter corrected number"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </div>
                    ) : null}
                    {field.uploadConfig?.expiryField ? (
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          New expiry date
                        </label>
                        <input
                          type="date"
                          value={docState?.expiries[key] || ""}
                          onChange={(e) => onDocExpiryChange?.(key, e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </div>
                    ) : null}
                    <ResubmitFileUploadBox
                      label={`Upload ${field.label}`}
                      file={docState?.files[key]}
                      url={docState?.urls[key]}
                      accept={
                        field.uploadConfig?.accept ||
                        "image/png,image/jpeg,application/pdf,.png,.jpg,.jpeg,.pdf,.csv,text/csv,text/plain"
                      }
                      inputRef={(el) => {
                        if (fileInputRefs) fileInputRefs.current[key] = el;
                      }}
                      onPick={(f) => onDocFilePick?.(key, f)}
                      onClear={onDocClear ? () => onDocClear(key) : undefined}
                      onPreview={
                        onPreviewUrl
                          ? (source) => onPreviewUrl(source, `New ${field.label}`)
                          : undefined
                      }
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <OldValueBox>{oldDisplay}</OldValueBox>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    New {field.label}
                  </label>
                  {type === "textarea" ? (
                    <textarea
                      value={values[key] || ""}
                      onChange={(e) => onChange(key, e.target.value)}
                      rows={3}
                      placeholder="Enter corrected value"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  ) : type === "select" || type === "boolean" ? (
                    <select
                      value={values[key] || ""}
                      onChange={(e) => onChange(key, e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                    >
                      <option value="" disabled>
                        Select…
                      </option>
                      {(options.length ? options : liveStoreTypes).map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={type === "number" || type === "date" ? type : "text"}
                      value={values[key] || ""}
                      onChange={(e) => onChange(key, e.target.value)}
                      placeholder="Enter corrected value"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  )}
                  {key === "store_type" && values.store_type === "OTHERS" ? (
                    <input
                      type="text"
                      value={values.custom_store_type || ""}
                      onChange={(e) => onChange("custom_store_type", e.target.value)}
                      placeholder="Custom store type"
                      className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  ) : null}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
