"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { CheckCircle, Clock, X, XCircle, Loader2, ExternalLink } from "lucide-react";
import { MenuReferenceReviewBlock } from "@/components/verification/MenuReferenceReviewBlock";
import { summarizeMenuRejectionDetail } from "@/lib/store-verification-menu-rejection-detail-shared";
import type { MenuMediaFile } from "@/lib/merchant-menu-media";

export type StoreInfoCardData = {
  storeId: number;
  name: string;
  store_id: string;
  full_address?: string | null;
  approval_status?: string | null;
  /** Primary = [0], Alternate = [1]. Shown in Store Info card. */
  store_phones?: string[] | null;
  store_email?: string | null;
  created_at?: string | null;
};

const VERIFICATION_STEP_LABELS: Record<number, string> = {
  1: "Restaurant information",
  2: "Location details",
  3: "Menu setup",
  4: "Restaurant documents",
  5: "Operational details",
  6: "Commission plan",
  7: "Sign & submit",
};

type StepVerification = {
  verified_at: string | null;
  verified_by: number | null;
  verified_by_name: string | null;
  notes: string | null;
  rejection?: {
    rejected_at: string;
    rejection_reason: string;
    step_label?: string | null;
    rejected_by_name?: string | null;
    email_sent?: boolean;
    email_skip_reason?: string | null;
    merchant_resubmitted_at?: string | null;
    rejection_detail?: unknown | null;
  } | null;
};

interface StoreInfoCardProps {
  store: StoreInfoCardData;
  className?: string;
}

// ----- Step details modal: render verified content per step (from verification-data) -----
type VerificationData = {
  store: Record<string, unknown>;
  documents: Record<string, unknown> | null;
  operatingHours: Record<string, unknown> | null;
  onboardingPayments: Record<string, unknown>[];
  agreementAcceptance: Record<string, unknown> | null;
  menuMediaFiles: MenuMediaFile[];
};

function formatTime(v: unknown): string {
  if (v == null) return "—";
  const s = String(v);
  const part = s.split(":").slice(0, 2).join(":");
  return part || "—";
}

function OperatingHoursBlock({ oh }: { oh: Record<string, unknown> | null }) {
  if (!oh) return <p className="text-xs text-gray-500">No operating hours set.</p>;
  const is24 = !!oh.is_24_hours;
  const sameAll = !!oh.same_for_all_days;
  const closed = (oh.closed_days as string[] | null) ?? [];
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
  const dayLabels: Record<string, string> = { monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun" };
  if (is24) return <p className="text-xs text-gray-900">Open 24 hours</p>;
  const openDays = days.filter((d) => !closed.includes(d) && !!oh[`${d}_open`]);
  return (
    <div className="space-y-1 text-xs">
      {closed.length > 0 && <p className="text-gray-500">Closed: {closed.map((d) => dayLabels[d] ?? d).join(", ")}</p>}
      {openDays.length === 0 && closed.length === 0 && <p className="text-gray-500">No hours set</p>}
      {openDays.map((day) => {
        const s1Start = formatTime(oh[`${day}_slot1_start`]);
        const s1End = formatTime(oh[`${day}_slot1_end`]);
        const s2Start = formatTime(oh[`${day}_slot2_start`]);
        const s2End = formatTime(oh[`${day}_slot2_end`]);
        const slot1 = s1Start !== "—" && s1End !== "—" ? `${s1Start} – ${s1End}` : null;
        const slot2 = s2Start !== "—" && s2End !== "—" ? `${s2Start} – ${s2End}` : null;
        const text = [slot1, slot2].filter(Boolean).join(", ");
        return (
          <div key={day} className="flex gap-2">
            <span className="w-12 shrink-0 font-medium text-gray-500">{dayLabels[day]}</span>
            <span className="text-gray-900">{text || "—"}</span>
          </div>
        );
      })}
      {sameAll && <p className="text-[10px] text-gray-500">Same for all days</p>}
    </div>
  );
}

function StepDetailContent({ stepNum, data }: { stepNum: number; data: VerificationData }) {
  const { store, documents, operatingHours, onboardingPayments, agreementAcceptance, menuMediaFiles } = data;
  const row = (label: string, value: React.ReactNode) => (
    <div key={label} className="flex gap-2 py-0.5 text-xs">
      <span className="w-36 shrink-0 font-medium text-gray-500">{label}</span>
      <span className="text-gray-900">{value ?? "—"}</span>
    </div>
  );

  if (stepNum === 1) {
    const bannerUrl = store.banner_url as string | null | undefined;
    const gallery = (store.gallery_images as string[] | null | undefined) ?? [];
    return (
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase text-gray-500">Restaurant information</p>
        {row("Store name", store.store_name as string)}
        {row("Display name", store.store_display_name as string)}
        {row("Description", store.store_description as string)}
        {row("Store type", store.store_type as string)}
        {row("Email", store.store_email as string)}
        {row("Phones", Array.isArray(store.store_phones) ? (store.store_phones as string[]).join(", ") : null)}
        {(bannerUrl || gallery.length > 0) && (
          <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
            <p className="text-[10px] font-semibold uppercase text-gray-500">Banner & gallery</p>
            {bannerUrl && <div><p className="mb-0.5 text-[10px] font-medium text-gray-500">Banner</p><img src={bannerUrl} alt="Store banner" className="max-h-32 w-full max-w-sm rounded-lg border border-gray-200 object-cover" /></div>}
            {gallery.length > 0 && <div><p className="mb-0.5 text-[10px] font-medium text-gray-500">Gallery</p><div className="flex flex-wrap gap-2">{gallery.slice(0, 6).map((url, i) => <img key={i} src={url} alt="" className="h-16 w-16 rounded border border-gray-200 object-cover" />)}{gallery.length > 6 && <span className="text-[10px] text-gray-500">+{gallery.length - 6} more</span>}</div></div>}
          </div>
        )}
      </div>
    );
  }
  if (stepNum === 2) {
    return (
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase text-gray-500">Location details</p>
        {row("Full address", store.full_address as string)}
        {row("Landmark", store.landmark as string)}
        {row("City", store.city as string)}
        {row("State", store.state as string)}
        {row("Postal code", store.postal_code as string)}
        {row("Country", store.country as string)}
        {row("Latitude", store.latitude != null ? String(store.latitude) : null)}
        {row("Longitude", store.longitude != null ? String(store.longitude) : null)}
      </div>
    );
  }
  if (stepNum === 3) {
    const menuFiles = menuMediaFiles ?? [];
    return (
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase text-gray-500">Menu setup</p>
        {row("Cuisine types", Array.isArray(store.cuisine_types) ? (store.cuisine_types as string[]).join(", ") : null)}
        {menuFiles.length > 0 && menuFiles[0]?.store_id != null && (
          <MenuReferenceReviewBlock
            storeId={menuFiles[0].store_id}
            files={menuFiles}
            interactive={false}
          />
        )}
        <p className="mt-1 text-[10px] text-gray-500">Menu items are managed in the store dashboard.</p>
      </div>
    );
  }
  if (stepNum === 4) {
    const doc = documents ?? {};
    const entries: Array<{ label: string; numberKey: string; urlKey: string; verifiedKey: string }> = [
      { label: "PAN number", numberKey: "pan_document_number", urlKey: "pan_document_url", verifiedKey: "pan_is_verified" },
      { label: "GST number", numberKey: "gst_document_number", urlKey: "gst_document_url", verifiedKey: "gst_is_verified" },
      { label: "Aadhaar number", numberKey: "aadhaar_document_number", urlKey: "aadhaar_document_url", verifiedKey: "aadhaar_is_verified" },
      { label: "FSSAI number", numberKey: "fssai_document_number", urlKey: "fssai_document_url", verifiedKey: "fssai_is_verified" },
      { label: "Drug license", numberKey: "drug_license_document_number", urlKey: "drug_license_document_url", verifiedKey: "drug_license_is_verified" },
    ];
    const dynamicEntries = entries.filter(
      (e) =>
        (doc[e.numberKey] != null && String(doc[e.numberKey]).trim() !== "") || !!doc[e.urlKey]
    );
    return (
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase text-gray-500">Restaurant documents</p>
        {dynamicEntries.length === 0 ? <p className="text-xs text-gray-500">No document records.</p> : (
          <>
            {dynamicEntries.map((e) => (
              <div key={e.numberKey} className="flex flex-wrap items-center gap-2 py-0.5">
                <div className="flex gap-2 text-xs min-w-0 flex-1">
                  <span className="w-28 shrink-0 font-medium text-gray-500">{e.label}</span>
                  <span className="text-gray-900">{(doc[e.numberKey] as string) ?? "—"}</span>
                  {!!doc[e.verifiedKey] && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-medium text-emerald-800">
                      Verified
                    </span>
                  )}
                </div>
                {!!doc[e.urlKey] && (
                  <a
                    href={doc[e.urlKey] as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-0.5 rounded bg-indigo-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-indigo-700"
                  >
                    <ExternalLink className="h-2.5 w-2.5" /> Open
                  </a>
                )}
              </div>
            ))}
            {!!doc.fssai_expiry_date &&
              dynamicEntries.some((e) => e.numberKey === "fssai_document_number") &&
              row("FSSAI expiry", new Date(doc.fssai_expiry_date as string).toLocaleDateString())}
          </>
        )}
      </div>
    );
  }
  if (stepNum === 5) {
    return (
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase text-gray-500">Operational details</p>
        {row("Banner", store.banner_url ? "Uploaded" : null)}
        {row("Min order (₹)", store.min_order_amount != null ? String(store.min_order_amount) : null)}
        {row("Delivery radius (km)", store.delivery_radius_km != null ? String(store.delivery_radius_km) : null)}
        {row("Avg prep (min)", store.avg_preparation_time_minutes != null ? String(store.avg_preparation_time_minutes) : null)}
        {row("Pure veg", store.is_pure_veg != null ? (store.is_pure_veg ? "Yes" : "No") : null)}
        {row("Online payment", store.accepts_online_payment != null ? (store.accepts_online_payment ? "Yes" : "No") : null)}
        {row("Accepts cash", store.accepts_cash != null ? (store.accepts_cash ? "Yes" : "No") : null)}
        <div className="border-t border-gray-100 pt-2">
          <p className="mb-1 text-[10px] font-semibold uppercase text-gray-500">Store timings</p>
          <OperatingHoursBlock oh={operatingHours ?? null} />
        </div>
      </div>
    );
  }
  if (stepNum === 6) {
    const payments = onboardingPayments ?? [];
    const statusBadge = (status: string) => {
      const s = (status || "").toLowerCase();
      const green = s === "captured" || s === "authorized";
      const red = s === "failed" || s === "cancelled" || s === "refunded";
      const cls = green ? "bg-emerald-100 text-emerald-800" : red ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800";
      return <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{status}</span>;
    };
    return (
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase text-gray-500">Commission plan</p>
        {payments.length === 0 ? <p className="text-xs text-gray-600">No payment record.</p> : (
          <div className="space-y-3">
            {payments.map((p, i) => {
              const id = (p.id as number) ?? i;
              const amountPaise = (p.amount_paise as number) ?? 0;
              const planName = (p.plan_name as string) ?? "—";
              const status = (p.status as string) ?? "—";
              const createdAt = (p.created_at as string) ?? "—";
              return (
                <div key={id} className="rounded border border-gray-200 bg-gray-50/50 p-3 text-xs">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-700">Payment #{id}</span>
                    {statusBadge(status)}
                  </div>
                  {row("Plan", planName)}
                  {row("Amount", `${(amountPaise / 100).toFixed(2)} ${(p.currency as string) ?? "INR"}`)}
                  {row("Created", typeof createdAt === "string" ? createdAt : "—")}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
  if (stepNum === 7) {
    const agg = agreementAcceptance ?? null;
    return (
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase text-gray-500">Sign & submit</p>
        {!agg ? <p className="text-xs text-gray-600">No agreement record.</p> : (
          <div className="space-y-2 text-xs">
            {(agg.contract_pdf_url as string) && (
              <a href={agg.contract_pdf_url as string} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded border border-indigo-600 bg-indigo-50 px-2.5 py-1.5 font-medium text-indigo-700 hover:bg-indigo-100">
                <ExternalLink className="h-3.5 w-3.5" /> Open contract PDF
              </a>
            )}
            {row("Signer name", agg.signer_name as string)}
            {row("Signer email", agg.signer_email as string)}
            {row("Signer phone", agg.signer_phone as string)}
            {row("Accepted at", typeof agg.accepted_at === "string" ? agg.accepted_at : "—")}
            {row("Terms accepted", agg.terms_accepted === true ? "Yes" : "No")}
            {agg.commission_first_month_pct != null && row("Commission (1st month %)", String(agg.commission_first_month_pct))}
            {agg.commission_from_second_month_pct != null && row("Commission (2nd month %)", String(agg.commission_from_second_month_pct))}
          </div>
        )}
      </div>
    );
  }
  return <p className="text-xs text-gray-500">No details for this step.</p>;
}

/**
 * Skeleton for the right sidebar Store info card — matches StoreInfoCard layout
 * (title, name, address, code, phones, status badge placeholders).
 */
export function StoreInfoCardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-xl border-0 bg-white p-2.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] min-w-0 animate-pulse ${className}`}
      role="status"
      aria-label="Loading store information"
    >
      <div className="h-3 w-12 rounded bg-gray-200 mb-1.5" />
      <div className="space-y-1.5 min-w-0">
        <div className="h-3.5 w-24 rounded bg-gray-200" />
        <div className="h-3 w-full max-w-[90%] rounded bg-gray-100" />
        <div className="h-3 w-20 rounded bg-gray-100 pt-0.5" />
        <div className="space-y-0.5 pt-0.5">
          <div className="h-3 w-28 rounded bg-gray-100" />
          <div className="h-3 w-20 rounded bg-gray-100" />
        </div>
        <div className="h-6 w-16 rounded-lg bg-gray-200 pt-1.5" />
      </div>
    </div>
  );
}

/**
 * Card displayed in the right sidebar below Profile when a store is selected.
 * Shows store info plus Verified/Pending button; click opens modal with verification details.
 */
export function StoreInfoCard({ store, className = "" }: StoreInfoCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [steps, setSteps] = useState<Record<number, StepVerification> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewDetailsStep, setViewDetailsStep] = useState<number | null>(null);
  const [verificationData, setVerificationData] = useState<VerificationData | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const approval = (store.approval_status || "").toUpperCase();
  const isVerified = approval === "APPROVED";

  const openModal = useCallback(() => {
    setModalOpen(true);
    setSteps(null);
    setError(null);
    setViewDetailsStep(null);
    setVerificationData(null);
    setLoading(true);
    fetch(`/api/merchant/stores/${store.storeId}/verification-steps`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && data?.steps) setSteps(data.steps);
        else setError("Could not load verification details.");
      })
      .catch(() => setError("Failed to load verification details."))
      .finally(() => setLoading(false));
  }, [store.storeId]);

  const openStepDetails = useCallback((stepNum: number) => {
    setViewDetailsStep(stepNum);
    setDetailsError(null);
    if (verificationData) return;
    setDetailsLoading(true);
    fetch(`/api/merchant/stores/${store.storeId}/verification-data`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && data?.store) {
          setVerificationData({
            store: data.store,
            documents: data.documents ?? null,
            operatingHours: data.operatingHours ?? null,
            onboardingPayments: data.onboardingPayments ?? [],
            agreementAcceptance: data.agreementAcceptance ?? null,
            menuMediaFiles: data.menuMediaFiles ?? [],
          });
        } else setDetailsError("Could not load step details.");
      })
      .catch(() => setDetailsError("Failed to load step details."))
      .finally(() => setDetailsLoading(false));
  }, [store.storeId, verificationData]);

  const verifiedSteps = steps
    ? (Object.entries(steps) as [string, StepVerification][])
        .filter(([, s]) => s?.verified_at)
        .map(([stepNum, s]) => ({ stepNum: parseInt(stepNum, 10), ...s }))
        .sort((a, b) => a.stepNum - b.stepNum)
    : [];
  const pendingSteps = steps
    ? (Object.entries(steps) as [string, StepVerification][])
        .filter(([, s]) => !s?.verified_at)
        .map(([stepNum, s]) => ({
          stepNum: parseInt(stepNum, 10),
          rejection: s?.rejection ?? null,
        }))
        .sort((a, b) => a.stepNum - b.stepNum)
    : [];

  const anyModalOpen = modalOpen || viewDetailsStep != null;

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (anyModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [anyModalOpen]);

  const closeVerification = useCallback(() => {
    setModalOpen(false);
    setViewDetailsStep(null);
  }, []);

  return (
    <>
      <div
        className={`rounded-xl border border-gray-100 bg-white p-2.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] min-w-0 ${className}`}
        role="region"
        aria-label="Store information"
      >
        <span className="block text-[9px] font-medium uppercase tracking-widest text-gray-400 mb-1.5">Store</span>
        <div className="space-y-1.5 min-w-0">
          <p className="text-xs font-semibold text-gray-900 truncate leading-tight" title={store.name}>{store.name}</p>
          {store.full_address && (
            <p className="text-[10px] text-gray-600 break-words leading-snug line-clamp-2" title={store.full_address}>{store.full_address}</p>
          )}
          <p className="text-[10px] font-mono text-gray-500 truncate pt-0.5" title={store.store_id}>{store.store_id}</p>
          {store.store_email && (
            <p className="text-[10px] text-gray-600 truncate pt-0.5" title={store.store_email}>Email: {store.store_email}</p>
          )}
          {store.store_phones && store.store_phones.length > 0 && (
            <div className="space-y-0.5 pt-0.5 min-w-0">
              <div className="flex min-w-0 gap-1 text-[10px]">
                <span className="shrink-0 font-medium text-gray-500">Primary:</span>
                <span className="text-gray-900 truncate" title={store.store_phones[0]}>{store.store_phones[0]}</span>
              </div>
              {store.store_phones.length > 1 && store.store_phones[1] && (
                <div className="flex min-w-0 gap-1 text-[10px]">
                  <span className="shrink-0 font-medium text-gray-500">Alt:</span>
                  <span className="text-gray-900 truncate" title={store.store_phones[1]}>{store.store_phones[1]}</span>
                </div>
              )}
            </div>
          )}
          {store.created_at && (
            <p className="text-[10px] text-gray-500 pt-0.5">
              Created: {new Date(store.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5 pt-1.5">
            <button
              type="button"
              onClick={openModal}
              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                approval === "APPROVED"
                  ? "bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500"
                  : approval === "DELISTED" || approval === "REJECTED" || approval === "BLOCKED" || approval === "SUSPENDED"
                    ? "bg-red-600 hover:bg-red-700 focus:ring-red-500"
                    : "bg-amber-500 hover:bg-amber-600 focus:ring-amber-500"
              }`}
            >
              {approval === "APPROVED" && <CheckCircle className="h-3 w-3 shrink-0" />}
              {approval === "DELISTED" && <XCircle className="h-3 w-3 shrink-0" />}
              {approval !== "APPROVED" && approval !== "DELISTED" && <Clock className="h-3 w-3 shrink-0" />}
              <span>
                {approval === "APPROVED"
                  ? "Approved"
                  : approval === "DELISTED"
                    ? "Delisted"
                    : approval === "REJECTED"
                      ? "Rejected"
                      : approval === "BLOCKED"
                        ? "Blocked"
                        : approval === "SUSPENDED"
                          ? "Suspended"
                          : "Pending"}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Verification details modal — full-viewport overlay via portal, blur covers header + sidebars */}
      {modalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="flex items-center justify-center p-4"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100vw",
              height: "100vh",
              zIndex: 9998,
              backdropFilter: "blur(8px)",
              backgroundColor: "rgba(0, 0, 0, 0.25)",
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="verification-modal-title"
            onClick={closeVerification}
          >
            <div
              className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-xl"
              style={{ position: "relative", zIndex: 9999 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <h2 id="verification-modal-title" className="text-base font-semibold text-gray-900">Verification details</h2>
                <button type="button" onClick={closeVerification} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-400" aria-label="Close">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="max-h-[70vh] overflow-y-auto px-4 py-4 space-y-4">
                {loading && <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>}
                {error && <p className="text-sm text-red-600">{error}</p>}
                {!loading && !error && steps && (
                  <>
                    {verifiedSteps.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 flex items-center gap-1.5">
                          <CheckCircle className="h-4 w-4 text-emerald-600" /> Verified ({verifiedSteps.length})
                        </h3>
                        <ul className="space-y-2">
                          {verifiedSteps.map(({ stepNum, verified_at }) => (
                            <li key={stepNum} className="flex flex-wrap items-center gap-2 text-sm text-gray-800">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">{stepNum}</span>
                              <span>{VERIFICATION_STEP_LABELS[stepNum] ?? `Step ${stepNum}`}</span>
                              {verified_at && <span className="text-xs text-gray-500">{new Date(verified_at).toLocaleDateString()}</span>}
                              <button
                                type="button"
                                onClick={() => openStepDetails(stepNum)}
                                className="ml-auto rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400"
                              >
                                View details
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {pendingSteps.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 flex items-center gap-1.5">
                          <Clock className="h-4 w-4 text-amber-600" /> Pending ({pendingSteps.length})
                        </h3>
                        <ul className="space-y-1.5">
                          {pendingSteps.map(({ stepNum, rejection }) => {
                            const menuStepSummary =
                              stepNum === 3
                                ? summarizeMenuRejectionDetail(rejection?.rejection_detail ?? null)
                                : null;
                            return (
                            <li key={stepNum} className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xs font-medium">{stepNum}</span>
                              {VERIFICATION_STEP_LABELS[stepNum] ?? `Step ${stepNum}`}
                              {rejection && (
                                <span
                                  className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800"
                                  title={rejection.rejection_reason}
                                >
                                  Rejected
                                </span>
                              )}
                              {menuStepSummary ? (
                                <span className="w-full text-[10px] leading-tight text-red-800/90 sm:w-auto">
                                  {menuStepSummary}
                                </span>
                              ) : null}
                              {rejection?.merchant_resubmitted_at && (
                                <span
                                  className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-900"
                                  title={`Partner updated ${new Date(rejection.merchant_resubmitted_at).toLocaleString()}`}
                                >
                                  Resubmitted
                                </span>
                              )}
                            </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                    {verifiedSteps.length === 0 && pendingSteps.length === 0 && <p className="text-sm text-gray-500">No verification steps found.</p>}
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Step "View details" modal — same full-viewport overlay via portal */}
      {viewDetailsStep != null &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="flex items-center justify-center p-4"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100vw",
              height: "100vh",
              zIndex: 9998,
              backdropFilter: "blur(8px)",
              backgroundColor: "rgba(0, 0, 0, 0.25)",
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="step-details-modal-title"
            onClick={() => setViewDetailsStep(null)}
          >
            <div
              className="w-full max-w-lg max-h-[85vh] rounded-xl border border-gray-200 bg-white shadow-xl flex flex-col"
              style={{ position: "relative", zIndex: 9999 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 shrink-0">
                <h2 id="step-details-modal-title" className="text-base font-semibold text-gray-900">
                  {VERIFICATION_STEP_LABELS[viewDetailsStep] ?? `Step ${viewDetailsStep}`} — Verified details
                </h2>
                <button type="button" onClick={() => setViewDetailsStep(null)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-400" aria-label="Close">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="overflow-y-auto px-4 py-4 min-h-0">
                {detailsLoading && <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>}
                {detailsError && <p className="text-sm text-red-600">{detailsError}</p>}
                {!detailsLoading && !detailsError && verificationData && <StepDetailContent stepNum={viewDetailsStep} data={verificationData} />}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
