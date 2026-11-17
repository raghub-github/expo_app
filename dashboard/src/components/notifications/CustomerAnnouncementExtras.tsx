"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ImagePlus, Loader2, Plus, Replace, Trash2, Upload } from "lucide-react";
import type { AnnouncementTargetType } from "@/lib/notifications/customer-home-services";
import {
  buildAnnouncementDeepLink,
  isAllowedGatimitraDeepLink,
} from "@/lib/notifications/customer-home-services";
import { CustomerAnnouncementPreview } from "@/components/notifications/CustomerAnnouncementPreview";

type ServiceItem = {
  id: string;
  label: string;
  storeType: string | null;
  supportsCategory: boolean;
  supportsStore: boolean;
};

type CategoryItem = { id: number; name: string };
type StoreItem = { storeId: string; name: string; city: string | null };

export type AnnouncementLayoutStyle =
  | "default"
  | "banner_image"
  | "category_row"
  | "countdown";

export type AnnouncementCategoryChipValue = {
  categoryId: string;
  label: string;
  imageUrl: string;
  deepLink: string;
  serviceId: string;
};

export type AnnouncementExtrasValue = {
  targetType: AnnouncementTargetType;
  serviceId: string;
  categoryId: string;
  storeId: string;
  orderId: string;
  customDeepLink: string;
  imageUrl: string | null;
  ctaLabel: string;
  countdownEnabled: boolean;
  startsAt: string;
  endsAt: string;
  layoutStyle: AnnouncementLayoutStyle;
  categoryChips: AnnouncementCategoryChipValue[];
};

export const EMPTY_ANNOUNCEMENT_EXTRAS: AnnouncementExtrasValue = {
  targetType: "NONE",
  serviceId: "",
  categoryId: "",
  storeId: "",
  orderId: "",
  customDeepLink: "",
  imageUrl: null,
  ctaLabel: "",
  countdownEnabled: false,
  startsAt: "",
  endsAt: "",
  layoutStyle: "default",
  categoryChips: [],
};

type Props = {
  value: AnnouncementExtrasValue;
  onChange: (next: AnnouncementExtrasValue) => void;
  title?: string;
  body?: string;
  showPreview?: boolean;
};

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
        {required ? <span className="text-rose-600"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="block text-[11px] text-slate-500">{hint}</span> : null}
    </label>
  );
}

const TARGET_OPTIONS: Array<{ type: AnnouncementTargetType; label: string; sub: string }> = [
  { type: "NONE", label: "Default", sub: "Inbox / notifications" },
  { type: "HOME", label: "Home", sub: "Customer app home" },
  { type: "SERVICE", label: "Service", sub: "Food, Ride, Grocery…" },
  { type: "CATEGORY", label: "Category", sub: "Service + category" },
  { type: "STORE", label: "Store", sub: "Exact store detail" },
  { type: "OFFER", label: "Offers", sub: "Offers tab" },
  { type: "SUBSCRIPTION", label: "GMitra Plus", sub: "Subscription screen" },
  { type: "ORDER", label: "Order", sub: "Selected order" },
  { type: "CUSTOM_DEEP_LINK", label: "Custom", sub: "Approved GatiMitra route" },
];

const LAYOUT_OPTIONS: Array<{
  id: AnnouncementLayoutStyle;
  label: string;
  sub: string;
}> = [
  { id: "default", label: "Auto", sub: "Infer from image / countdown / chips" },
  { id: "banner_image", label: "Big picture", sub: "Full-bleed image + title overlay" },
  { id: "category_row", label: "Category covers", sub: "2–3 tappable category chips" },
  { id: "countdown", label: "Live countdown", sub: "Ticking chronometer in tray" },
];

export function CustomerAnnouncementExtras({
  value,
  onChange,
  title = "",
  body = "",
  showPreview = true,
}: Props) {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [chipCategories, setChipCategories] = useState<CategoryItem[]>([]);
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [storeQ, setStoreQ] = useState("");
  const [catsLoading, setCatsLoading] = useState(false);
  const [chipCatsLoading, setChipCatsLoading] = useState(false);
  const [storesLoading, setStoresLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [chipUploadingIdx, setChipUploadingIdx] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [chipDraftServiceId, setChipDraftServiceId] = useState("food");
  const [chipDraftCategoryId, setChipDraftCategoryId] = useState("");

  const selectedService = useMemo(
    () => services.find((s) => s.id === value.serviceId) ?? null,
    [services, value.serviceId],
  );

  const chipServices = useMemo(
    () => services.filter((s) => s.supportsCategory && Boolean(s.storeType)),
    [services],
  );

  const chipService = useMemo(
    () => chipServices.find((s) => s.id === chipDraftServiceId) ?? chipServices[0] ?? null,
    [chipServices, chipDraftServiceId],
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/super-admin/notifications/customer-home-services")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setServices(Array.isArray(j?.items) ? j.items : []);
      })
      .catch(() => {
        if (!cancelled) setServices([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (value.targetType !== "CATEGORY" || !selectedService?.storeType) {
      setCategories([]);
      return;
    }
    let cancelled = false;
    setCatsLoading(true);
    fetch(
      `/api/admin/user-app-categories?storeType=${encodeURIComponent(selectedService.storeType)}`,
    )
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const items = Array.isArray(j?.data) ? j.data : Array.isArray(j?.items) ? j.items : [];
        setCategories(
          items.map((c: { id: number; name: string }) => ({
            id: Number(c.id),
            name: String(c.name),
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      })
      .finally(() => {
        if (!cancelled) setCatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [value.targetType, selectedService?.storeType]);

  useEffect(() => {
    if (!chipService?.storeType) {
      setChipCategories([]);
      return;
    }
    let cancelled = false;
    setChipCatsLoading(true);
    fetch(`/api/admin/user-app-categories?storeType=${encodeURIComponent(chipService.storeType)}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const items = Array.isArray(j?.data) ? j.data : Array.isArray(j?.items) ? j.items : [];
        setChipCategories(
          items.map((c: { id: number; name: string }) => ({
            id: Number(c.id),
            name: String(c.name),
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setChipCategories([]);
      })
      .finally(() => {
        if (!cancelled) setChipCatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chipService?.storeType]);

  useEffect(() => {
    if (value.targetType !== "STORE" || !value.serviceId) {
      setStores([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      setStoresLoading(true);
      const qs = new URLSearchParams({ service: value.serviceId });
      if (storeQ.trim()) qs.set("q", storeQ.trim());
      fetch(`/api/super-admin/notifications/announcement-stores?${qs}`)
        .then((r) => r.json())
        .then((j) => {
          if (cancelled) return;
          setStores(Array.isArray(j?.items) ? j.items : []);
        })
        .catch(() => {
          if (!cancelled) setStores([]);
        })
        .finally(() => {
          if (!cancelled) setStoresLoading(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value.targetType, value.serviceId, storeQ]);

  const patch = useCallback(
    (partial: Partial<AnnouncementExtrasValue>) => {
      onChange({ ...value, ...partial });
    },
    [onChange, value],
  );

  const uploadImage = async (file: File | null, currentUrl?: string | null) => {
    if (!file) return null;
    const fd = new FormData();
    fd.set("file", file);
    if (currentUrl) fd.set("currentImageUrl", currentUrl);
    const res = await fetch("/api/super-admin/notifications/campaigns/upload-image", {
      method: "POST",
      body: fd,
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.success || !j.url) {
      throw new Error(j.error || "Upload failed");
    }
    return String(j.url);
  };

  const onUpload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadImage(file, value.imageUrl);
      if (url) patch({ imageUrl: url });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onChipCoverUpload = async (idx: number, file: File | null) => {
    if (!file) return;
    setChipUploadingIdx(idx);
    setUploadError(null);
    try {
      const url = await uploadImage(file, value.categoryChips[idx]?.imageUrl);
      if (!url) return;
      const next = value.categoryChips.map((c, i) =>
        i === idx ? { ...c, imageUrl: url } : c,
      );
      patch({ categoryChips: next, layoutStyle: "category_row" });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setChipUploadingIdx(null);
    }
  };

  const addCategoryChip = () => {
    if (value.categoryChips.length >= 3 || !chipService || !chipDraftCategoryId) return;
    const cat = chipCategories.find((c) => String(c.id) === chipDraftCategoryId);
    if (!cat) return;
    if (value.categoryChips.some((c) => c.categoryId === String(cat.id))) return;
    let deepLink = `/home/category/${encodeURIComponent(String(cat.id))}`;
    try {
      const resolved = buildAnnouncementDeepLink({
        targetType: "CATEGORY",
        serviceId: chipService.id,
        categoryId: String(cat.id),
      });
      deepLink = resolved.deepLink;
    } catch {
      /* keep fallback */
    }
    patch({
      layoutStyle: "category_row",
      categoryChips: [
        ...value.categoryChips,
        {
          categoryId: String(cat.id),
          label: cat.name.slice(0, 24),
          imageUrl: "",
          deepLink,
          serviceId: chipService.id,
        },
      ],
    });
    setChipDraftCategoryId("");
  };

  const removeChip = (idx: number) => {
    const next = value.categoryChips.filter((_, i) => i !== idx);
    patch({
      categoryChips: next,
      layoutStyle: next.length >= 2 ? "category_row" : value.layoutStyle,
    });
  };

  const needsService =
    value.targetType === "SERVICE" ||
    value.targetType === "CATEGORY" ||
    value.targetType === "STORE";

  const ctaTrimmed = value.ctaLabel.replace(/\s+/g, " ").trim();
  const customLinkOk =
    value.targetType !== "CUSTOM_DEEP_LINK" || isAllowedGatimitraDeepLink(value.customDeepLink);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold text-slate-900">Tap destination</div>
        <p className="mt-0.5 text-xs text-slate-500">
          Where the customer lands after tapping the notification or CTA. Category filters apply only
          for this entry — customers can clear them afterward.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {TARGET_OPTIONS.map((opt) => {
          const active = value.targetType === opt.type;
          return (
            <button
              key={opt.type}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                patch({
                  targetType: opt.type,
                  categoryId: "",
                  storeId: "",
                  orderId: "",
                  customDeepLink: "",
                  serviceId: needsServiceFor(opt.type) ? value.serviceId : "",
                })
              }
              className={
                "rounded-lg border px-3 py-2.5 text-left transition " +
                (active
                  ? "border-teal-600 bg-teal-50/60 ring-1 ring-teal-600"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50")
              }
            >
              <div className="text-xs font-semibold text-slate-900">{opt.label}</div>
              <div className="mt-0.5 text-[11px] text-slate-500">{opt.sub}</div>
            </button>
          );
        })}
      </div>

      {needsService ? (
        <Field label="Service" required>
          <select
            value={value.serviceId}
            onChange={(e) =>
              patch({ serviceId: e.target.value, categoryId: "", storeId: "" })
            }
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
          >
            <option value="">Select service…</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {value.targetType === "CATEGORY" ? (
        <Field label="Category" required>
          <select
            value={value.categoryId}
            onChange={(e) => patch({ categoryId: e.target.value })}
            disabled={!selectedService?.storeType || catsLoading}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 disabled:opacity-60"
          >
            <option value="">
              {catsLoading ? "Loading categories…" : "Select category…"}
            </option>
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {value.targetType === "STORE" ? (
        <div className="space-y-2">
          <Field label="Search store">
            <input
              value={storeQ}
              onChange={(e) => setStoreQ(e.target.value)}
              placeholder="GMMC id, name, or city…"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
            />
          </Field>
          <Field label="Store" required>
            <select
              value={value.storeId}
              onChange={(e) => patch({ storeId: e.target.value })}
              disabled={!value.serviceId || storesLoading}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 disabled:opacity-60"
            >
              <option value="">
                {storesLoading ? "Searching…" : "Select store…"}
              </option>
              {stores.map((s) => (
                <option key={s.storeId} value={s.storeId}>
                  {s.name} ({s.storeId})
                  {s.city ? ` · ${s.city}` : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>
      ) : null}

      {value.targetType === "ORDER" ? (
        <Field label="Order id" required hint="Public order id the authenticated customer can open.">
          <input
            value={value.orderId}
            onChange={(e) => patch({ orderId: e.target.value })}
            placeholder="e.g. GM10000042"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
          />
        </Field>
      ) : null}

      {value.targetType === "CUSTOM_DEEP_LINK" ? (
        <Field
          label="Deep link"
          required
          hint="Must be an approved GatiMitra app route starting with /home, /offers, /orders, /profile, …"
        >
          <input
            value={value.customDeepLink}
            onChange={(e) => patch({ customDeepLink: e.target.value })}
            placeholder="/home/crazy-deals"
            className={
              "w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 " +
              (customLinkOk
                ? "border-slate-200 focus:border-teal-600 focus:ring-teal-600"
                : "border-rose-300 focus:border-rose-500 focus:ring-rose-500")
            }
          />
        </Field>
      ) : null}

      <div className="border-t border-slate-100 pt-4">
        <div className="text-sm font-semibold text-slate-900">Android tray layout</div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {LAYOUT_OPTIONS.map((opt) => {
            const active = value.layoutStyle === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  patch({
                    layoutStyle: opt.id,
                    // Live countdown layout owns the toggle; leaving it turns countdown off.
                    countdownEnabled: opt.id === "countdown",
                    ...(opt.id === "countdown"
                      ? {}
                      : { startsAt: "", endsAt: "" }),
                  })
                }
                className={
                  "rounded-lg border px-3 py-2.5 text-left transition " +
                  (active
                    ? "border-teal-600 bg-teal-50/60 ring-1 ring-teal-600"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50")
                }
              >
                <div className="text-xs font-semibold text-slate-900">{opt.label}</div>
                <div className="mt-0.5 text-[11px] text-slate-500">{opt.sub}</div>
              </button>
            );
          })}
        </div>
      </div>

      {value.layoutStyle === "category_row" || value.categoryChips.length > 0 ? (
        <div className="border-t border-slate-100 pt-4 space-y-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Category cover chips</div>
            <p className="mt-0.5 text-xs text-slate-500">
              Add 2–3 Food/Grocery categories with a cover image each. Each chip opens that
              category.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Field label="Service">
              <select
                value={chipService?.id ?? ""}
                onChange={(e) => {
                  setChipDraftServiceId(e.target.value);
                  setChipDraftCategoryId("");
                }}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
              >
                {chipServices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Category">
              <select
                value={chipDraftCategoryId}
                onChange={(e) => setChipDraftCategoryId(e.target.value)}
                disabled={!chipService?.storeType || chipCatsLoading}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 disabled:opacity-60"
              >
                <option value="">
                  {chipCatsLoading ? "Loading…" : "Select category…"}
                </option>
                {chipCategories.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex items-end">
              <button
                type="button"
                disabled={
                  value.categoryChips.length >= 3 || !chipDraftCategoryId || !chipService
                }
                onClick={addCategoryChip}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-[#121212] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Add chip
              </button>
            </div>
          </div>
          {value.categoryChips.map((chip, idx) => (
            <div
              key={`${chip.categoryId}-${idx}`}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
            >
              {chip.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={chip.imageUrl}
                  alt=""
                  className="h-14 w-20 rounded-md object-cover"
                />
              ) : (
                <div className="flex h-14 w-20 items-center justify-center rounded-md border border-dashed border-slate-300 bg-white text-[10px] text-slate-400">
                  Cover
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900">{chip.label}</div>
                <div className="truncate text-[11px] text-slate-500">{chip.deepLink}</div>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                {chipUploadingIdx === idx ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                Cover
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => void onChipCoverUpload(idx, e.target.files?.[0] ?? null)}
                />
              </label>
              <button
                type="button"
                onClick={() => removeChip(idx)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="border-t border-slate-100 pt-4">
        <div className="text-sm font-semibold text-slate-900">CTA label (optional)</div>
        <p className="mt-0.5 text-xs text-slate-500">
          Shown exactly as entered. Leave blank for a plain notification with no button — the
          notification itself stays tappable.
        </p>
        <input
          value={value.ctaLabel}
          maxLength={32}
          onChange={(e) => patch({ ctaLabel: e.target.value })}
          placeholder="Order Now, Shop Now, Book Ride…"
          className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
        />
        <div className="mt-1 text-[11px] text-slate-500">{ctaTrimmed.length}/32</div>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Countdown</div>
            <p className="mt-0.5 text-xs text-slate-500">
              Remaining time from now until till. Times are in your local timezone (IST for India).
              Stored as UTC. Customer validity always uses server time.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              patch({
                countdownEnabled: !value.countdownEnabled,
                layoutStyle:
                  !value.countdownEnabled && value.layoutStyle === "default"
                    ? "countdown"
                    : value.layoutStyle,
              })
            }
            className={
              "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition " +
              (value.countdownEnabled ? "bg-teal-600" : "bg-slate-300")
            }
            aria-pressed={value.countdownEnabled}
          >
            <span
              className={
                "inline-block h-5 w-5 rounded-full bg-white transition " +
                (value.countdownEnabled ? "translate-x-6" : "translate-x-1")
              }
            />
          </button>
        </div>
        {value.countdownEnabled ? (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Valid from / start" required>
              <input
                type="datetime-local"
                value={value.startsAt}
                onChange={(e) => patch({ startsAt: e.target.value })}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
              />
            </Field>
            <Field label="Valid until / till" required>
              <input
                type="datetime-local"
                value={value.endsAt}
                onChange={(e) => patch({ endsAt: e.target.value })}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
              />
            </Field>
          </div>
        ) : null}
      </div>

      <div className="border-t border-slate-100 pt-4">
        <div className="text-sm font-semibold text-slate-900">Notification image (optional)</div>
        <p className="mt-0.5 text-xs text-slate-500">
          HTTPS/CDN image for Android rich push. JPEG, PNG, WebP or GIF · max 5 MB · prefer ~1200×600.
          Required for Big picture layout.
        </p>

        {value.imageUrl ? (
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value.imageUrl}
              alt="Notification preview"
              className="max-h-48 w-full object-cover"
            />
            <div className="flex items-center gap-2 border-t border-slate-200 bg-white px-3 py-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                <Replace className="h-3.5 w-3.5" />
                Replace
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
                />
              </label>
              <button
                type="button"
                onClick={() => patch({ imageUrl: null })}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </button>
            </div>
          </div>
        ) : (
          <label className="mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center hover:border-teal-500 hover:bg-teal-50/40">
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin text-teal-700" />
            ) : (
              <ImagePlus className="h-6 w-6 text-slate-400" />
            )}
            <span className="text-sm font-medium text-slate-700">
              {uploading ? "Uploading…" : "Upload image"}
            </span>
            <span className="text-[11px] text-slate-500">JPEG, PNG, WebP or GIF · max 5 MB</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              disabled={uploading}
              onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
            />
            <span className="inline-flex items-center gap-1 rounded-md bg-[#121212] px-3 py-1.5 text-xs font-semibold text-white">
              <Upload className="h-3.5 w-3.5" />
              Choose file
            </span>
          </label>
        )}
        {uploadError ? (
          <div className="mt-2 text-xs text-rose-700">{uploadError}</div>
        ) : null}
      </div>

      {showPreview ? (
        <div className="border-t border-slate-100 pt-4">
          <div className="text-sm font-semibold text-slate-900">Live customer preview</div>
          <p className="mt-0.5 mb-3 text-xs text-slate-500">
            Mirrors the Android collapsed / expanded tray for the selected layout.
          </p>
          <CustomerAnnouncementPreview
            title={title}
            body={body}
            imageUrl={value.imageUrl}
            ctaLabel={ctaTrimmed}
            countdownEnabled={value.countdownEnabled}
            endsAt={value.endsAt}
            layoutStyle={value.layoutStyle}
            categoryChips={value.categoryChips}
          />
        </div>
      ) : null}
    </div>
  );
}

function needsServiceFor(type: AnnouncementTargetType): boolean {
  return type === "SERVICE" || type === "CATEGORY" || type === "STORE";
}
