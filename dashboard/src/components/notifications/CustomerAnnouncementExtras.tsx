"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ImagePlus, Loader2, Replace, Trash2, Upload } from "lucide-react";
import type { AnnouncementTargetType } from "@/lib/notifications/customer-home-services";
import { isAllowedGatimitraDeepLink } from "@/lib/notifications/customer-home-services";
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

export function CustomerAnnouncementExtras({
  value,
  onChange,
  title = "",
  body = "",
  showPreview = true,
}: Props) {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [storeQ, setStoreQ] = useState("");
  const [catsLoading, setCatsLoading] = useState(false);
  const [storesLoading, setStoresLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const selectedService = useMemo(
    () => services.find((s) => s.id === value.serviceId) ?? null,
    [services, value.serviceId],
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

  const onUpload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      if (value.imageUrl) fd.set("currentImageUrl", value.imageUrl);
      const res = await fetch("/api/super-admin/notifications/campaigns/upload-image", {
        method: "POST",
        body: fd,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success || !j.url) {
        throw new Error(j.error || "Upload failed");
      }
      patch({ imageUrl: String(j.url) });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
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
            onClick={() => patch({ countdownEnabled: !value.countdownEnabled })}
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
          Devices that cannot render rich image fall back to title + body.
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
            Renderer is automatic: blank CTA → plain; CTA and/or image → rich GatiMitra card.
          </p>
          <CustomerAnnouncementPreview
            title={title}
            body={body}
            imageUrl={value.imageUrl}
            ctaLabel={ctaTrimmed}
            countdownEnabled={value.countdownEnabled}
            endsAt={value.endsAt}
          />
        </div>
      ) : null}
    </div>
  );
}

function needsServiceFor(type: AnnouncementTargetType): boolean {
  return type === "SERVICE" || type === "CATEGORY" || type === "STORE";
}
