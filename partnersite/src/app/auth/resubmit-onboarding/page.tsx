"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Check, CloudUpload, Eye, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  formatRejectionAlertMessage,
  rejectionDetailForDocType,
  type Step4RejectionDetail,
} from "@/lib/merchant-store-document-rejection";
import { storeVerificationStepLabel } from "@/lib/onboarding/verification-step-labels";
import {
  labelForRejectedField,
  parseStepRejectionDetail,
  type StepRejectionFieldMeta,
} from "@/lib/onboarding/step-rejection-fields";
import {
  getOnboardingDocumentsPath,
  getOnboardingBankPath,
  getOnboardingAssetsBannerPath,
} from "@/lib/r2-paths";
import { toStoredDocumentUrl } from "@/lib/r2";
import { useLiveRefreshPoll } from "@/hooks/useLiveRefreshPoll";
import { DynamicRejectedFields } from "@/components/onboarding/DynamicRejectedFields";

type RejectedDocKey = "pan" | "aadhaar" | "fssai" | "gst" | "bank_proof";

type OpenRejectionStep = {
  step_number: number;
  step_label: string;
  rejection_reason: string;
  step_rejection_detail: unknown;
  rejected_fields: string[];
  rejectedFieldsMeta: StepRejectionFieldMeta[];
};

type StagedItem = {
  verificationStep: number;
  fieldKey: string;
  payload: Record<string, unknown>;
  r2ObjectKey?: string | null;
  proxyUrl?: string | null;
};

type PendingResubmitRow = {
  verification_step?: number;
  field_key?: string;
  payload?: Record<string, unknown> | null;
  proxy_url?: string | null;
  r2_object_key?: string | null;
};

const DOC_RESUBMIT_KEYS = new Set([
  "pan",
  "aadhaar",
  "fssai",
  "gst",
  "bank_proof",
]);

function hydrateFromPending(pending: PendingResubmitRow[]) {
  const nextNumbers: Record<string, string> = {};
  const nextExpiries: Record<string, string> = {};
  const nextUrls: Record<string, string | null> = {};
  const nextFields: Record<string, string> = {};
  let nextBanner: string | null = null;
  const staged: Record<number, StagedItem[]> = {};
  const stepsWithPending = new Set<number>();
  const pendingFieldKeys = new Set<string>();

  for (const row of pending) {
    const step = Number(row.verification_step);
    const key = String(row.field_key || "").trim();
    const payload =
      row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
        ? row.payload
        : {};
    const proxy =
      (typeof row.proxy_url === "string" && row.proxy_url.trim()) ||
      (typeof payload.proxy_url === "string" && String(payload.proxy_url).trim()) ||
      (typeof payload.document_url === "string" && String(payload.document_url).trim()) ||
      (typeof payload.banner_url === "string" && String(payload.banner_url).trim()) ||
      null;
    if (!Number.isFinite(step) || !key) continue;
    stepsWithPending.add(step);
    pendingFieldKeys.add(key);

    const stagedItem: StagedItem = {
      verificationStep: step,
      fieldKey: key,
      payload,
      r2ObjectKey: typeof row.r2_object_key === "string" ? row.r2_object_key : null,
      proxyUrl: proxy,
    };
    staged[step] = [...(staged[step] || []), stagedItem];

    if (DOC_RESUBMIT_KEYS.has(key)) {
      if (proxy) nextUrls[key] = proxy;
      const num = String(
        payload.document_number ||
          payload.fssai_number ||
          payload.pan_number ||
          payload.gst_number ||
          payload.aadhar_number ||
          ""
      ).trim();
      if (num) nextNumbers[key] = num;
      const exp = String(payload.expiry_date || payload.fssai_expiry_date || "")
        .trim()
        .slice(0, 10);
      if (exp) nextExpiries[key] = exp;
    } else if (key === "banner_url") {
      if (proxy) nextBanner = proxy;
    } else if (key === "map_location") {
      const lat = String(payload.latitude ?? payload.lat ?? "").trim();
      const lng = String(payload.longitude ?? payload.lng ?? payload.lon ?? "").trim();
      if (lat) nextFields.latitude = lat;
      if (lng) nextFields.longitude = lng;
    } else {
      const val = String(payload[key] || payload.document_number || "").trim();
      if (val) nextFields[key] = val;
      if (payload.custom_store_type != null) {
        nextFields.custom_store_type = String(payload.custom_store_type || "");
      }
    }
  }

  return { nextNumbers, nextExpiries, nextUrls, nextFields, nextBanner, staged, stepsWithPending, pendingFieldKeys };
}

type RejectedDocItem = {
  key: RejectedDocKey;
  label: string;
  uploadLabel: string;
  reason: string;
  detail: Step4RejectionDetail | null;
  numberValue: string;
  expiryValue: string;
  fileUrl: string | null;
  numberField?: "fssai_number" | "pan_number" | "gst_number" | "aadhar_number";
  expiryField?: "fssai_expiry_date";
  fileField: string;
  urlField: string;
};

function proxyUrlForUploadResult(uploadResult: string): string {
  const s = String(uploadResult || "").trim();
  if (!s) return s;
  const toProxy = (key: string) =>
    `/api/attachments/proxy?key=${encodeURIComponent(key.replace(/^\/+/, ""))}`;
  if (s.includes("/api/attachments/proxy") || s.includes("/v1/attachments/proxy")) {
    try {
      const u = new URL(s.startsWith("http") ? s : `http://local.invalid${s.startsWith("/") ? "" : "/"}${s}`);
      const key = u.searchParams.get("key");
      if (key?.trim()) return toProxy(key.trim());
    } catch {
      /* fall through */
    }
    return s.startsWith("/api/attachments/proxy") ? s : toProxy(s);
  }
  if (!s.includes("://")) return toProxy(s);
  return toStoredDocumentUrl(s) ?? s;
}

function r2KeyFromProxyOrRaw(urlOrKey: string | null | undefined): string | null {
  if (!urlOrKey?.trim()) return null;
  const s = urlOrKey.trim();
  try {
    const u = new URL(s.startsWith("http") ? s : `http://local.invalid${s.startsWith("/") ? "" : "/"}${s}`);
    const key = u.searchParams.get("key");
    if (key?.trim()) return key.trim().replace(/^\/+/, "");
  } catch {
    /* ignore */
  }
  if (!s.includes("://") && !s.includes("?")) return s.replace(/^\/+/, "");
  return null;
}

function extensionFromFile(file: File): string {
  const n = file.name || "";
  const m = n.match(/(\.[a-zA-Z0-9]+)$/);
  if (m) return m[1]!.toLowerCase();
  if (file.type === "application/pdf") return ".pdf";
  if (file.type === "image/png") return ".png";
  if (file.type === "image/jpeg") return ".jpg";
  return "";
}

function fileNameFromUrl(url: string | null): string {
  if (!url) return "";
  try {
    const u = new URL(url, "http://local.invalid");
    const key = u.searchParams.get("key") || u.pathname;
    const base = key.split("/").pop() || "";
    return decodeURIComponent(base) || "document";
  } catch {
    return "document";
  }
}

function resolvePreviewHref(url: string): string {
  const u = url.trim();
  if (!u) return "";
  if (u.startsWith("blob:") || u.startsWith("data:")) return u;
  // Always normalize to same-origin attachments proxy when possible (stable View).
  const normalized = proxyUrlForUploadResult(u);
  if (normalized) return normalized;
  if (u.startsWith("http") || u.startsWith("/")) return u;
  return `/api/attachments/proxy?key=${encodeURIComponent(u)}`;
}

function isPdfSource(file: File | null | undefined, url: string | null | undefined): boolean {
  if (file) {
    return file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  }
  const s = String(url || "").toLowerCase();
  return s.includes(".pdf") || s.includes("application/pdf");
}

function isTextPreviewSource(file: File | null | undefined, url: string | null | undefined): boolean {
  if (file) {
    const t = (file.type || "").toLowerCase();
    const n = (file.name || "").toLowerCase();
    return (
      t.startsWith("text/") ||
      t.includes("csv") ||
      t.includes("json") ||
      /\.(csv|tsv|txt|json|xml|log)$/i.test(n)
    );
  }
  const s = String(url || "").toLowerCase();
  return /\.(csv|tsv|txt|json|xml|log)(\?|$)/i.test(s) || s.includes("text/csv") || s.includes("text/plain");
}

type FilePreviewState = {
  url: string;
  title: string;
  isPdf: boolean;
  isText?: boolean;
  textContent?: string | null;
  revokeOnClose: boolean;
  fallbackUrl?: string | null;
};

function pickNonEmpty(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

function effectiveRejectedFields(step: OpenRejectionStep): string[] {
  const fromMeta = (step.rejectedFieldsMeta || [])
    .filter((m) => (m.currentStatus || "rejected") === "rejected")
    .map((m) => m.fieldKey)
    .filter(Boolean);
  if (fromMeta.length > 0) return fromMeta;
  if (step.rejected_fields.length > 0) return step.rejected_fields;
  // Never expand to the full onboarding step catalog when admin only rejected some fields.
  return [];
}

function actionableRejectedFieldsMeta(step: OpenRejectionStep): StepRejectionFieldMeta[] {
  return (step.rejectedFieldsMeta || []).filter(
    (m) => (m.currentStatus || "rejected") === "rejected"
  );
}

function needsMapLocationFix(step: OpenRejectionStep): boolean {
  return effectiveRejectedFields(step).includes("map_location");
}

const STORE_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "RESTAURANT", label: "Restaurant" },
  { value: "CAFE", label: "Cafe" },
  { value: "BAKERY", label: "Bakery" },
  { value: "CLOUD_KITCHEN", label: "Cloud Kitchen" },
  { value: "GROCERY", label: "Grocery" },
  { value: "PHARMA", label: "Pharma" },
  { value: "STATIONERY", label: "Stationery" },
  { value: "ELECTRONICS_ECOMMERCE", label: "Electronics and E-commerce" },
  { value: "OTHERS", label: "Others" },
];

function storeTypeLabel(value: string): string {
  const v = String(value || "").trim();
  if (!v) return "—";
  const hit = STORE_TYPE_OPTIONS.find((o) => o.value === v);
  return hit?.label || v;
}

function mergeRejectionDetailRoots(...roots: unknown[]): Record<string, unknown> | null {
  const merged: Record<string, unknown> = {};
  for (const root of roots) {
    if (!root || typeof root !== "object" || root === null || Array.isArray(root)) continue;
    Object.assign(merged, root as Record<string, unknown>);
  }
  return Object.keys(merged).length > 0 ? merged : null;
}

/** True when value is a per-document rejection map (pan/fssai/...), not step_rejection_detail v1/v2. */
function isPerDocRejectionDetailsMap(root: unknown): root is Record<string, unknown> {
  if (!root || typeof root !== "object" || root === null || Array.isArray(root)) return false;
  const o = root as Record<string, unknown>;
  if (o.version === 2 || Array.isArray(o.fields)) return false;
  if (Array.isArray(o.rejected_fields)) return false;
  const docKeys = ["pan", "aadhaar", "fssai", "gst", "bank_proof"] as const;
  return docKeys.some((k) => k in o);
}

function inferDocKeysFromStepReason(reason: string): RejectedDocKey[] {
  const t = reason.toLowerCase();
  const keys: RejectedDocKey[] = [];
  if (/\bfssai\b/.test(t) || /\blicen[cs]e\b/.test(t)) keys.push("fssai");
  if (/\bpan\b/.test(t)) keys.push("pan");
  if (/\baadhaar\b|\baadhar\b/.test(t)) keys.push("aadhaar");
  if (/\bgst\b/.test(t)) keys.push("gst");
  if (/\bbank\b/.test(t)) keys.push("bank_proof");
  return keys;
}

function buildRejectedDocs(
  step4: Record<string, unknown>,
  allowKeys?: string[] | null
): RejectedDocItem[] {
  const detailRoot =
    (step4.step4_rejection_details && typeof step4.step4_rejection_details === "object"
      ? step4.step4_rejection_details
      : null) || null;
  const bank =
    step4.bank && typeof step4.bank === "object" ? (step4.bank as Record<string, unknown>) : {};
  const allow =
    allowKeys && allowKeys.length > 0
      ? new Set(allowKeys.map(String).map((k) => k.trim()).filter(Boolean))
      : null;

  const candidates: Array<{
    key: RejectedDocKey;
    label: string;
    uploadLabel: string;
    reasonKey: string;
    detailKey: string;
    numberField?: RejectedDocItem["numberField"];
    expiryField?: RejectedDocItem["expiryField"];
    fileField: string;
    urlField: string;
    numberValue: string;
    expiryValue: string;
    fileUrl: string | null;
  }> = [
    {
      key: "pan",
      label: "PAN",
      uploadLabel: "Upload PAN",
      reasonKey: "pan_rejection_reason",
      detailKey: "pan",
      numberField: "pan_number",
      fileField: "pan_image",
      urlField: "pan_image_url",
      numberValue: String(step4.pan_number || "").trim(),
      expiryValue: "",
      fileUrl:
        typeof step4.pan_image_url === "string" && step4.pan_image_url.trim()
          ? step4.pan_image_url.trim()
          : null,
    },
    {
      key: "aadhaar",
      label: "Aadhaar",
      uploadLabel: "Upload Aadhaar",
      reasonKey: "aadhaar_rejection_reason",
      detailKey: "aadhaar",
      numberField: "aadhar_number",
      fileField: "aadhar_front",
      urlField: "aadhar_front_url",
      numberValue: String(step4.aadhar_number || "").trim(),
      expiryValue: "",
      fileUrl:
        typeof step4.aadhar_front_url === "string" && step4.aadhar_front_url.trim()
          ? step4.aadhar_front_url.trim()
          : null,
    },
    {
      key: "fssai",
      label: "FSSAI",
      uploadLabel: "Upload FSSAI",
      reasonKey: "fssai_rejection_reason",
      detailKey: "fssai",
      numberField: "fssai_number",
      expiryField: "fssai_expiry_date",
      fileField: "fssai_image",
      urlField: "fssai_image_url",
      numberValue: String(step4.fssai_number || "").trim(),
      expiryValue: String(step4.fssai_expiry_date || "").trim().slice(0, 10),
      fileUrl:
        typeof step4.fssai_image_url === "string" && step4.fssai_image_url.trim()
          ? step4.fssai_image_url.trim()
          : null,
    },
    {
      key: "gst",
      label: "GST",
      uploadLabel: "Upload GST",
      reasonKey: "gst_rejection_reason",
      detailKey: "gst",
      numberField: "gst_number",
      fileField: "gst_image",
      urlField: "gst_image_url",
      numberValue: String(step4.gst_number || "").trim(),
      expiryValue: "",
      fileUrl:
        typeof step4.gst_image_url === "string" && step4.gst_image_url.trim()
          ? step4.gst_image_url.trim()
          : null,
    },
    {
      key: "bank_proof",
      label: "Bank proof",
      uploadLabel: "Upload bank proof",
      reasonKey: "bank_proof_rejection_reason",
      detailKey: "bank_proof",
      fileField: "bank_proof_file",
      urlField: "bank_proof_file_url",
      numberValue: "",
      expiryValue: "",
      fileUrl:
        typeof bank.bank_proof_file_url === "string" && String(bank.bank_proof_file_url).trim()
          ? String(bank.bank_proof_file_url).trim()
          : null,
    },
  ];

  const detailKeys =
    detailRoot && typeof detailRoot === "object" && detailRoot !== null
      ? new Set(Object.keys(detailRoot as Record<string, unknown>))
      : new Set<string>();

  const out: RejectedDocItem[] = [];
  for (const c of candidates) {
    if (allow && !allow.has(c.key)) continue;
    const reason =
      typeof step4[c.reasonKey] === "string" && String(step4[c.reasonKey]).trim()
        ? String(step4[c.reasonKey]).trim()
        : c.key === "bank_proof" && typeof bank.bank_proof_rejection_reason === "string"
          ? String(bank.bank_proof_rejection_reason).trim()
          : "";
    const detail = rejectionDetailForDocType(detailRoot, c.detailKey);
    const forcedByDetailKey = detailKeys.has(c.detailKey);
    const allowlisted = Boolean(allow && allow.has(c.key));
    // Only include when this specific document was rejected — never because the step was rejected.
    if (!reason && !detail && !forcedByDetailKey && !allowlisted) continue;
    out.push({
      key: c.key,
      label: c.label,
      uploadLabel: c.uploadLabel,
      reason: formatRejectionAlertMessage(
        c.label,
        reason ||
          (forcedByDetailKey || allowlisted ? `${c.label} was rejected.` : ""),
        detail
      ),
      detail,
      numberValue: c.numberValue,
      expiryValue: c.expiryValue,
      fileUrl: c.fileUrl,
      numberField: c.numberField,
      expiryField: c.expiryField,
      fileField: c.fileField,
      urlField: c.urlField,
    });
  }
  return out;
}

function needsBannerFix(reason: string, rejectedFields: string[]): boolean {
  if (rejectedFields.includes("banner_url")) return true;
  if (rejectedFields.length === 0 && /\bbanner\b|\blogo\b/i.test(reason)) return true;
  return false;
}

const PARTNER_RESUBMIT_EXIT_FALLBACK = "/partners/all-stores?picker=1";

/** Same-origin path only — blocks open redirects. */
function safeReturnPath(raw: string | null | undefined, fallback: string): string {
  const value = String(raw || "").trim();
  if (!value) return fallback;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const u = new URL(value, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    if (typeof window !== "undefined" && u.origin === window.location.origin) {
      return `${u.pathname}${u.search}${u.hash}`;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

function ResubmitOnboardingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const storeId = (searchParams?.get("store_id") || "").trim();
  const parentId = (searchParams?.get("parent_id") || "").trim();
  const verificationFixStep = Number(searchParams?.get("verification_fix_step") || "4") || 4;
  const exitHref = safeReturnPath(
    searchParams?.get("returnTo"),
    storeId
      ? `${PARTNER_RESUBMIT_EXIT_FALLBACK}&verification_updates_submitted=1&highlight_store=${encodeURIComponent(storeId)}`
      : PARTNER_RESUBMIT_EXIT_FALLBACK
  );

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [parentPk, setParentPk] = useState<number | null>(null);
  const [openSteps, setOpenSteps] = useState<OpenRejectionStep[]>([]);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [completedIndexes, setCompletedIndexes] = useState<Set<number>>(new Set());
  const [stagedByStep, setStagedByStep] = useState<Record<number, StagedItem[]>>({});
  const [rejected, setRejected] = useState<RejectedDocItem[]>([]);
  const [oldNumbers, setOldNumbers] = useState<Record<string, string>>({});
  const [numbers, setNumbers] = useState<Record<string, string>>({});
  const [oldExpiries, setOldExpiries] = useState<Record<string, string>>({});
  const [expiries, setExpiries] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [oldUrls, setOldUrls] = useState<Record<string, string | null>>({});
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const [oldBannerUrl, setOldBannerUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [oldFieldValues, setOldFieldValues] = useState<Record<string, string>>({});
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<FilePreviewState | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const rejectionFpRef = useRef("");
  const openStepsRef = useRef<OpenRejectionStep[]>([]);
  const activeStepIndexRef = useRef(0);
  const completedIndexesRef = useRef<Set<number>>(new Set());
  const lastPendingStepsRef = useRef<Set<number>>(new Set());
  const redirectedAfterCompleteRef = useRef(false);
  openStepsRef.current = openSteps;
  activeStepIndexRef.current = activeStepIndex;
  completedIndexesRef.current = completedIndexes;

  const closePreview = useCallback(() => {
    setPreview((prev) => {
      if (prev?.revokeOnClose && prev.url.startsWith("blob:")) {
        URL.revokeObjectURL(prev.url);
      }
      return null;
    });
  }, []);

  const openPreview = useCallback(
    async (source: File | string | null | undefined, title: string, fallback?: string | null) => {
      if (!source) {
        toast.error("No file to view");
        return;
      }
      closePreview();
      if (source instanceof File) {
        const url = URL.createObjectURL(source);
        const isText = isTextPreviewSource(source, null);
        let textContent: string | null = null;
        if (isText) {
          try {
            textContent = await source.text();
          } catch {
            textContent = null;
          }
        }
        setPreview({
          url,
          title,
          isPdf: isPdfSource(source, null),
          isText,
          textContent,
          revokeOnClose: true,
          fallbackUrl: null,
        });
        return;
      }
      const href = resolvePreviewHref(String(source));
      if (!href) {
        toast.error("No file to view");
        return;
      }
      const fallbackHref = fallback ? resolvePreviewHref(fallback) : null;

      // Proxy returns SVG "No image" with HTTP 200 when R2 key is missing — probe first.
      let finalUrl = href;
      if (!href.startsWith("blob:") && !href.startsWith("data:")) {
        try {
          const res = await fetch(href, { credentials: "include", cache: "no-store" });
          const ct = (res.headers.get("content-type") || "").toLowerCase();
          const looksMissing =
            !res.ok || ct.includes("svg") || ct.includes("application/json");
          if (looksMissing && fallbackHref && fallbackHref !== href) {
            finalUrl = fallbackHref;
          } else if (looksMissing) {
            toast.error("Could not load this image. It may have been removed from storage.");
            return;
          }
        } catch {
          if (fallbackHref && fallbackHref !== href) finalUrl = fallbackHref;
        }
      }

      let textContent: string | null = null;
      const isText = isTextPreviewSource(null, finalUrl);
      if (isText) {
        try {
          const textRes = await fetch(finalUrl, { credentials: "include", cache: "no-store" });
          if (textRes.ok) textContent = await textRes.text();
        } catch {
          textContent = null;
        }
      }

      setPreview({
        url: finalUrl,
        title,
        isPdf: isPdfSource(null, finalUrl),
        isText,
        textContent,
        revokeOnClose: false,
        fallbackUrl:
          finalUrl === href && fallbackHref && fallbackHref !== href ? fallbackHref : null,
      });
    },
    [closePreview]
  );

  useEffect(() => {
    return () => {
      if (preview?.revokeOnClose && preview.url.startsWith("blob:")) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [preview]);

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    const soft = opts?.soft === true;
    if (!storeId) {
      if (!soft) setLoading(false);
      return;
    }
    if (!soft) setLoading(true);
    try {
      const progressUrl = `/api/auth/register-store-progress?storePublicId=${encodeURIComponent(storeId)}`;
      const [progressRes, rejRes, pendingRes] = await Promise.all([
        fetch(progressUrl, { credentials: "include" }),
        fetch(
          `/api/auth/store-verification-rejections?store_public_id=${encodeURIComponent(storeId)}`,
          { credentials: "include" }
        ),
        fetch(
          `/api/auth/onboarding-resubmissions?store_public_id=${encodeURIComponent(storeId)}`,
          { credentials: "include" }
        ),
      ]);
      const progress = await progressRes.json().catch(() => ({}));
      const rejData = await rejRes.json().catch(() => ({}));
      const pendingData = await pendingRes.json().catch(() => ({}));

      if (!rejRes.ok || !rejData?.success) {
        if (!soft) toast.error(rejData?.error || "Could not load rejections");
        return;
      }
      // Progress may be null for completed+rejected stores — store snapshot still fills old values.
      if (!progressRes.ok || !progress?.success) {
        if (!rejData.store) {
          if (!soft) toast.error(progress?.error || "Could not load store documents");
          return;
        }
      }

      const storeSnap =
        rejData.store && typeof rejData.store === "object"
          ? (rejData.store as Record<string, unknown>)
          : {};
      const lastOld =
        rejData.lastOldValues && typeof rejData.lastOldValues === "object"
          ? (rejData.lastOldValues as Record<string, string>)
          : {};
      const docsSnap =
        storeSnap.documents && typeof storeSnap.documents === "object"
          ? (storeSnap.documents as Record<string, unknown>)
          : {};

      const form =
        progress.progress?.form_data && typeof progress.progress.form_data === "object"
          ? (progress.progress.form_data as Record<string, unknown>)
          : {};
      const s4 = {
        ...((form.step4 && typeof form.step4 === "object" ? form.step4 : {}) as Record<
          string,
          unknown
        >),
        pan_number: pickNonEmpty(
          lastOld.pan_number,
          (form.step4 as Record<string, unknown> | undefined)?.pan_number,
          docsSnap.pan_number
        ),
        pan_image_url: pickNonEmpty(
          lastOld.pan_image_url,
          (form.step4 as Record<string, unknown> | undefined)?.pan_image_url,
          docsSnap.pan_image_url
        ),
        aadhar_number: pickNonEmpty(
          lastOld.aadhar_number,
          (form.step4 as Record<string, unknown> | undefined)?.aadhar_number,
          docsSnap.aadhar_number
        ),
        aadhar_front_url: pickNonEmpty(
          lastOld.aadhar_front_url,
          (form.step4 as Record<string, unknown> | undefined)?.aadhar_front_url,
          docsSnap.aadhar_front_url
        ),
        fssai_number: pickNonEmpty(
          lastOld.fssai_number,
          (form.step4 as Record<string, unknown> | undefined)?.fssai_number,
          docsSnap.fssai_number
        ),
        fssai_expiry_date: pickNonEmpty(
          lastOld.fssai_expiry_date,
          (form.step4 as Record<string, unknown> | undefined)?.fssai_expiry_date,
          docsSnap.fssai_expiry_date
        ),
        fssai_image_url: pickNonEmpty(
          lastOld.fssai_image_url,
          (form.step4 as Record<string, unknown> | undefined)?.fssai_image_url,
          docsSnap.fssai_image_url
        ),
        gst_number: pickNonEmpty(
          lastOld.gst_number,
          (form.step4 as Record<string, unknown> | undefined)?.gst_number,
          docsSnap.gst_number
        ),
        gst_image_url: pickNonEmpty(
          lastOld.gst_image_url,
          (form.step4 as Record<string, unknown> | undefined)?.gst_image_url,
          docsSnap.gst_image_url
        ),
      } as Record<string, unknown>;
      const existingBank =
        s4.bank && typeof s4.bank === "object" ? (s4.bank as Record<string, unknown>) : {};
      if (
        !existingBank.bank_proof_file_url &&
        (lastOld.bank_proof_file_url || docsSnap.bank_proof_file_url)
      ) {
        s4.bank = {
          ...existingBank,
          bank_proof_file_url: pickNonEmpty(
            lastOld.bank_proof_file_url,
            docsSnap.bank_proof_file_url
          ),
        };
      }
      const s5 = (form.step5 && typeof form.step5 === "object" ? form.step5 : {}) as Record<
        string,
        unknown
      >;
      const step2 = (form.step2 && typeof form.step2 === "object" ? form.step2 : {}) as Record<
        string,
        unknown
      >;

      const openRejRaw = Array.isArray(rejData.rejections)
        ? // Any active rejection row is open until admin Verify again clears it.
          // merchant_resubmitted_at only unlocks admin "Verify again" — partner can re-resubmit.
          rejData.rejections
        : [];
      const steps: OpenRejectionStep[] = openRejRaw
        .map(
          (r: {
            step_number: number;
            step_label?: string | null;
            rejection_reason?: string;
            step_rejection_detail?: unknown;
            rejectedFieldsMeta?: StepRejectionFieldMeta[];
          }) => {
            const n = Number(r.step_number);
            const parsed = parseStepRejectionDetail(r.step_rejection_detail);
            const metaRaw = Array.isArray(r.rejectedFieldsMeta) ? r.rejectedFieldsMeta : [];
            const fromDetail = (parsed?.rejected_fields ?? [])
              .map(String)
              .map((k) => k.trim())
              .filter(Boolean);
            const meta =
              fromDetail.length > 0
                ? metaRaw.filter((m) => fromDetail.includes(m.fieldKey))
                : metaRaw.filter((m) => (m.currentStatus || "rejected") === "rejected");
            return {
              step_number: n,
              step_label: storeVerificationStepLabel(n, r.step_label),
              rejection_reason: String(r.rejection_reason || "").trim(),
              step_rejection_detail: r.step_rejection_detail ?? null,
              rejected_fields: fromDetail.length > 0 ? fromDetail : meta.map((m) => m.fieldKey),
              rejectedFieldsMeta: meta,
            };
          }
        )
        .sort((a: OpenRejectionStep, b: OpenRejectionStep) => a.step_number - b.step_number);

      const r4 = steps.find((r) => r.step_number === 4);
      const r6 = steps.find((r) => r.step_number === 6);
      const allowDocKeys = [
        ...(r4?.rejected_fields || []),
        ...(r6?.rejected_fields || []),
      ]
        .map(String)
        .map((k) => k.trim())
        .filter(Boolean);
      const mergedDetails = mergeRejectionDetailRoots(
        s4.step4_rejection_details,
        isPerDocRejectionDetailsMap(r4?.step_rejection_detail) ? r4.step_rejection_detail : null,
        isPerDocRejectionDetailsMap(r6?.step_rejection_detail) ? r6.step_rejection_detail : null
      );
      if (mergedDetails) s4.step4_rejection_details = mergedDetails;
      if (r6?.rejection_reason && allowDocKeys.includes("bank_proof")) {
        s4.bank_proof_rejection_reason = s4.bank_proof_rejection_reason || r6.rejection_reason;
      }
      if (r4) {
        let probe = buildRejectedDocs(s4, allowDocKeys.length ? allowDocKeys : null);
        if (probe.length === 0 && r4.rejection_reason) {
          const keys: RejectedDocKey[] =
            allowDocKeys.length > 0
              ? (allowDocKeys.filter((k) =>
                  ["pan", "aadhaar", "fssai", "gst", "bank_proof"].includes(k)
                ) as RejectedDocKey[])
              : inferDocKeysFromStepReason(r4.rejection_reason);
          for (const key of keys) {
            if (key === "pan") s4.pan_rejection_reason = s4.pan_rejection_reason || r4.rejection_reason;
            if (key === "aadhaar")
              s4.aadhaar_rejection_reason = s4.aadhaar_rejection_reason || r4.rejection_reason;
            if (key === "fssai")
              s4.fssai_rejection_reason = s4.fssai_rejection_reason || r4.rejection_reason;
            if (key === "gst") s4.gst_rejection_reason = s4.gst_rejection_reason || r4.rejection_reason;
            if (key === "bank_proof")
              s4.bank_proof_rejection_reason =
                s4.bank_proof_rejection_reason || r4.rejection_reason;
          }
        }
      }

      const items = buildRejectedDocs(s4, allowDocKeys.length ? allowDocKeys : null);
      const pendingRows = Array.isArray(pendingData?.items)
        ? (pendingData.items as PendingResubmitRow[])
        : [];
      const hydrated = hydrateFromPending(pendingRows);

      const rejectionFp = JSON.stringify(
        steps.map((s) => ({
          n: s.step_number,
          reason: s.rejection_reason,
          fields: s.rejected_fields,
          detail: s.step_rejection_detail,
          meta: (s.rejectedFieldsMeta || []).map((m) => ({
            k: m.fieldKey,
            r: m.rejectionReason,
            t: m.fieldType,
          })),
        }))
      );
      const pendingFp = JSON.stringify(
        pendingRows
          .map((r) => `${Number(r.verification_step)}:${String(r.field_key || "").trim()}`)
          .filter((x) => !x.endsWith(":"))
          .sort()
      );
      const syncFp = `${rejectionFp}||${pendingFp}`;

      if (soft) {
        if (syncFp === rejectionFpRef.current) return;
        const prevFp = rejectionFpRef.current;
        const prevSteps = openStepsRef.current;
        const prevStepNums = new Set(prevSteps.map((s) => s.step_number));
        const newlyRejected = steps.filter((s) => !prevStepNums.has(s.step_number));

        const prevCompletedNums = new Set(
          [...completedIndexesRef.current]
            .map((i) => prevSteps[i]?.step_number)
            .filter((n): n is number => typeof n === "number")
        );
        // If server dropped pending for a step (discard / re-reject), clear local completed.
        for (const stepNum of lastPendingStepsRef.current) {
          if (!hydrated.stepsWithPending.has(stepNum)) {
            prevCompletedNums.delete(stepNum);
          }
        }
        lastPendingStepsRef.current = new Set(hydrated.stepsWithPending);

        const completed = new Set<number>();
        steps.forEach((s, idx) => {
          if (hydrated.stepsWithPending.has(s.step_number) || prevCompletedNums.has(s.step_number)) {
            completed.add(idx);
          }
        });

        const stepsWithMeta = steps.map((s) => ({
          ...s,
          rejectedFieldsMeta: (s.rejectedFieldsMeta || []).map((f) => ({
            ...f,
            currentStatus: hydrated.pendingFieldKeys.has(f.fieldKey)
              ? ("pending_review" as const)
              : f.currentStatus === "pending_review"
                ? ("rejected" as const)
                : f.currentStatus || ("rejected" as const),
          })),
        }));

        const currentStepNum = prevSteps[activeStepIndexRef.current]?.step_number;
        let nextActiveIdx =
          currentStepNum != null
            ? stepsWithMeta.findIndex((s) => s.step_number === currentStepNum)
            : -1;
        // If this step was completed elsewhere (e.g. AM dashboard), move to next open step.
        if (nextActiveIdx >= 0 && completed.has(nextActiveIdx)) {
          const firstIncomplete = stepsWithMeta.findIndex((_, idx) => !completed.has(idx));
          if (firstIncomplete >= 0) nextActiveIdx = firstIncomplete;
        }
        if (nextActiveIdx < 0) {
          nextActiveIdx = stepsWithMeta.findIndex((_, idx) => !completed.has(idx));
          if (nextActiveIdx < 0) nextActiveIdx = 0;
        }

        rejectionFpRef.current = syncFp;
        setOpenSteps(stepsWithMeta);
        setCompletedIndexes(completed);
        setActiveStepIndex(stepsWithMeta.length ? nextActiveIdx : 0);
        setRejected(items);
        setStagedByStep((prev) => ({ ...prev, ...hydrated.staged }));

        const nextOldNumbers: Record<string, string> = {};
        const nextOldExpiries: Record<string, string> = {};
        const nextOldUrls: Record<string, string | null> = {};
        for (const item of items) {
          nextOldNumbers[item.key] = item.numberValue;
          nextOldExpiries[item.key] = item.expiryValue;
          nextOldUrls[item.key] = item.fileUrl;
        }
        setOldNumbers(nextOldNumbers);
        setOldExpiries(nextOldExpiries);
        setOldUrls(nextOldUrls);

        const s1 = (form.step1 && typeof form.step1 === "object" ? form.step1 : {}) as Record<
          string,
          unknown
        >;
        const phonesFromSnap = Array.isArray(storeSnap.store_phones)
          ? (storeSnap.store_phones as unknown[]).map(String).join(", ")
          : String(storeSnap.store_phones || "");
        const phonesFromS1 = Array.isArray(s1.store_phones)
          ? (s1.store_phones as unknown[]).map(String).join(", ")
          : String(s1.store_phones || "");
        const loadedFields = {
          store_name: pickNonEmpty(lastOld.store_name, s1.store_name, storeSnap.store_name),
          store_display_name: pickNonEmpty(
            lastOld.store_display_name,
            s1.store_display_name,
            storeSnap.store_display_name
          ),
          owner_full_name: pickNonEmpty(
            lastOld.owner_full_name,
            s1.owner_full_name,
            storeSnap.owner_full_name
          ),
          store_type: pickNonEmpty(lastOld.store_type, s1.store_type, storeSnap.store_type),
          custom_store_type: pickNonEmpty(
            lastOld.custom_store_type,
            s1.custom_store_type,
            storeSnap.custom_store_type
          ),
          store_email: pickNonEmpty(lastOld.store_email, s1.store_email, storeSnap.store_email),
          store_phones: pickNonEmpty(lastOld.store_phones, phonesFromS1, phonesFromSnap),
          store_description: pickNonEmpty(
            lastOld.store_description,
            s1.store_description,
            storeSnap.store_description
          ),
          full_address: pickNonEmpty(lastOld.full_address, step2.full_address, storeSnap.full_address),
          landmark: pickNonEmpty(lastOld.landmark, step2.landmark, storeSnap.landmark),
          city: pickNonEmpty(lastOld.city, step2.city, storeSnap.city),
          state: pickNonEmpty(lastOld.state, step2.state, storeSnap.state),
          postal_code: pickNonEmpty(lastOld.postal_code, step2.postal_code, storeSnap.postal_code),
          latitude: pickNonEmpty(lastOld.latitude, step2.latitude, storeSnap.latitude),
          longitude: pickNonEmpty(lastOld.longitude, step2.longitude, storeSnap.longitude),
        };
        setOldFieldValues(loadedFields);
        setFieldValues((prev) => {
          const next = { ...prev };
          for (const [k, v] of Object.entries(hydrated.nextFields)) {
            if (!String(next[k] ?? "").trim() && String(v ?? "").trim()) next[k] = v;
          }
          return next;
        });
        setNumbers((prev) => {
          const next = { ...prev };
          for (const [k, v] of Object.entries(hydrated.nextNumbers)) {
            if (!String(next[k] ?? "").trim() && String(v ?? "").trim()) next[k] = v;
          }
          return next;
        });
        setExpiries((prev) => {
          const next = { ...prev };
          for (const [k, v] of Object.entries(hydrated.nextExpiries)) {
            if (!String(next[k] ?? "").trim() && String(v ?? "").trim()) next[k] = v;
          }
          return next;
        });
        setUrls((prev) => {
          const next = { ...prev };
          for (const [k, v] of Object.entries(hydrated.nextUrls)) {
            if (!next[k] && v) next[k] = v;
          }
          return next;
        });

        if (prevFp && newlyRejected.length > 0) {
          toast.message(
            `Another step was rejected: ${newlyRejected.map((s) => s.step_label).join(", ")}`
          );
        }
        return;
      }

      const stepsWithMeta = steps.map((s) => ({
        ...s,
        rejectedFieldsMeta: (s.rejectedFieldsMeta || []).map((f) => ({
          ...f,
          currentStatus: hydrated.pendingFieldKeys.has(f.fieldKey)
            ? ("pending_review" as const)
            : f.currentStatus === "pending_review"
              ? ("rejected" as const)
              : f.currentStatus || ("rejected" as const),
        })),
      }));
      setOpenSteps(stepsWithMeta);
      setRejected(items);

      const preferredIdx = Math.max(
        0,
        stepsWithMeta.findIndex((s) => s.step_number === verificationFixStep)
      );
      const completed = new Set<number>();
      stepsWithMeta.forEach((s, idx) => {
        if (hydrated.stepsWithPending.has(s.step_number)) completed.add(idx);
      });
      setCompletedIndexes(completed);
      setStagedByStep(hydrated.staged);
      const firstIncomplete = stepsWithMeta.findIndex((_, idx) => !completed.has(idx));
      setActiveStepIndex(
        stepsWithMeta.length
          ? firstIncomplete >= 0
            ? firstIncomplete
            : preferredIdx >= 0
              ? preferredIdx
              : 0
          : 0
      );
      rejectionFpRef.current = `${rejectionFp}||${pendingFp}`;
      lastPendingStepsRef.current = new Set(hydrated.stepsWithPending);

      const s1 = (form.step1 && typeof form.step1 === "object" ? form.step1 : {}) as Record<
        string,
        unknown
      >;
      const stepStore =
        form.step_store && typeof form.step_store === "object"
          ? (form.step_store as Record<string, unknown>)
          : {};
      setStoreName(
        pickNonEmpty(
          lastOld.store_name,
          s1.store_name,
          storeSnap.store_name,
          stepStore.store_name,
          storeId
        ) || storeId
      );
      const phonesFromSnap = Array.isArray(storeSnap.store_phones)
        ? (storeSnap.store_phones as unknown[]).map(String).join(", ")
        : String(storeSnap.store_phones || "");
      const phonesFromS1 = Array.isArray(s1.store_phones)
        ? (s1.store_phones as unknown[]).map(String).join(", ")
        : String(s1.store_phones || "");
      const loadedFields = {
        store_name: pickNonEmpty(lastOld.store_name, s1.store_name, storeSnap.store_name),
        store_display_name: pickNonEmpty(
          lastOld.store_display_name,
          s1.store_display_name,
          storeSnap.store_display_name
        ),
        owner_full_name: pickNonEmpty(
          lastOld.owner_full_name,
          s1.owner_full_name,
          storeSnap.owner_full_name
        ),
        store_type: pickNonEmpty(lastOld.store_type, s1.store_type, storeSnap.store_type),
        custom_store_type: pickNonEmpty(
          lastOld.custom_store_type,
          s1.custom_store_type,
          storeSnap.custom_store_type
        ),
        store_email: pickNonEmpty(lastOld.store_email, s1.store_email, storeSnap.store_email),
        store_phones: pickNonEmpty(lastOld.store_phones, phonesFromS1, phonesFromSnap),
        store_description: pickNonEmpty(
          lastOld.store_description,
          s1.store_description,
          storeSnap.store_description
        ),
        full_address: pickNonEmpty(lastOld.full_address, step2.full_address, storeSnap.full_address),
        landmark: pickNonEmpty(lastOld.landmark, step2.landmark, storeSnap.landmark),
        city: pickNonEmpty(lastOld.city, step2.city, storeSnap.city),
        state: pickNonEmpty(lastOld.state, step2.state, storeSnap.state),
        postal_code: pickNonEmpty(lastOld.postal_code, step2.postal_code, storeSnap.postal_code),
        latitude: pickNonEmpty(lastOld.latitude, step2.latitude, storeSnap.latitude),
        longitude: pickNonEmpty(lastOld.longitude, step2.longitude, storeSnap.longitude),
      };
      setOldFieldValues(loadedFields);
      setFieldValues(hydrated.nextFields);
      const fromProgress =
        typeof progress.progress?.parent_id === "number"
          ? progress.progress.parent_id
          : typeof progress.parentId === "number"
            ? progress.parentId
            : null;
      const fromStore =
        storeSnap.parent_id != null && Number.isFinite(Number(storeSnap.parent_id))
          ? Number(storeSnap.parent_id)
          : null;
      const pk = fromProgress ?? fromStore ?? (parentId ? Number(parentId) : null);
      setParentPk(Number.isFinite(pk as number) ? (pk as number) : null);

      const nextOldNumbers: Record<string, string> = {};
      const nextOldExpiries: Record<string, string> = {};
      const nextOldUrls: Record<string, string | null> = {};
      for (const item of items) {
        nextOldNumbers[item.key] = item.numberValue;
        nextOldExpiries[item.key] = item.expiryValue;
        nextOldUrls[item.key] = item.fileUrl;
      }
      setOldNumbers(nextOldNumbers);
      setOldExpiries(nextOldExpiries);
      setOldUrls(nextOldUrls);
      setNumbers(hydrated.nextNumbers);
      setExpiries(hydrated.nextExpiries);
      setUrls(hydrated.nextUrls);
      setFiles({});
      const liveBanner =
        pickNonEmpty(
          typeof storeSnap.banner_url === "string" ? storeSnap.banner_url : "",
          typeof s5.banner_url === "string" ? s5.banner_url : "",
          typeof s5.banner_preview === "string" ? s5.banner_preview : ""
        ) || null;
      const rejectedBannerRaw = pickNonEmpty(
        lastOld.banner_r2_key,
        lastOld.banner_url
      );
      // After re-reject, Rejected column must show last resubmitted banner — never silently
      // swap to live store banner (that is the original approved image).
      if (rejectedBannerRaw) {
        const rejectedBanner =
          resolvePreviewHref(rejectedBannerRaw) || rejectedBannerRaw;
        setOldBannerUrl(rejectedBanner);
      } else {
        setOldBannerUrl(
          liveBanner ? resolvePreviewHref(liveBanner) || liveBanner : null
        );
      }
      setBannerUrl(hydrated.nextBanner);
      setBannerFile(null);
    } catch {
      if (!soft) toast.error("Failed to load resubmit details");
    } finally {
      if (!soft) setLoading(false);
    }
  }, [storeId, parentId, verificationFixStep]);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveRefreshPoll(Boolean(storeId) && !loading && !submitting, () => load({ soft: true }));

  const uploadToR2 = async (file: File, folder: string, filename: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("parent", folder);
    form.append("filename", filename || file.name);
    const res = await fetch("/api/upload/r2", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    const raw = String((data?.key || data?.path || data?.url || "") as string).trim();
    if (!res.ok || !raw) throw new Error(data?.error || "Upload failed");
    return proxyUrlForUploadResult(raw);
  };

  const onPickFile = (key: RejectedDocKey, file: File | null) => {
    if (!file) return;
    const okType =
      file.type.startsWith("image/") ||
      file.type === "application/pdf" ||
      file.type === "text/csv" ||
      file.type === "text/plain" ||
      file.type === "application/vnd.ms-excel" ||
      /\.(png|jpe?g|gif|webp|pdf|csv|txt)$/i.test(file.name);
    if (!okType) {
      toast.error("Only PNG, JPEG, PDF, CSV, or TXT allowed");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Max file size is 20 MB");
      return;
    }
    setFiles((prev) => ({ ...prev, [key]: file }));
  };

  const onClearFile = (key: RejectedDocKey) => {
    setFiles((prev) => ({ ...prev, [key]: null }));
    setUrls((prev) => ({ ...prev, [key]: null }));
  };

  const buildItemsForStep = async (step: OpenRejectionStep): Promise<StagedItem[] | null> => {
    const r2Parent = parentPk ?? (parentId ? Number(parentId) : null);
    if (!r2Parent || !Number.isFinite(r2Parent)) {
      toast.error("Parent account not found");
      return null;
    }
    const docsPath = getOnboardingDocumentsPath(r2Parent, storeId);
    const bankPath = getOnboardingBankPath(r2Parent, storeId);
    const bannerPath = getOnboardingAssetsBannerPath(r2Parent, storeId);
    const items: StagedItem[] = [];
    const fields = effectiveRejectedFields(step);

    if (step.step_number === 4 || step.step_number === 6) {
      const docKeys = fields.filter((k): k is RejectedDocKey =>
        k === "pan" || k === "aadhaar" || k === "fssai" || k === "gst" || k === "bank_proof"
      );
      const docsToSubmit: RejectedDocItem[] =
        docKeys.length > 0
          ? docKeys.map((key) => {
              const existing = rejected.find((r) => r.key === key);
              if (existing) return existing;
              const label =
                key === "pan"
                  ? "PAN"
                  : key === "aadhaar"
                    ? "Aadhaar"
                    : key === "fssai"
                      ? "FSSAI"
                      : key === "gst"
                        ? "GST"
                        : "Bank proof";
              return {
                key,
                label,
                uploadLabel: `Upload ${label}`,
                reason: `${label} was rejected.`,
                detail: null,
                numberValue: "",
                expiryValue: "",
                fileUrl: null,
                numberField:
                  key === "pan"
                    ? "pan_number"
                    : key === "aadhaar"
                      ? "aadhar_number"
                      : key === "fssai"
                        ? "fssai_number"
                        : key === "gst"
                          ? "gst_number"
                          : undefined,
                expiryField: key === "fssai" ? "fssai_expiry_date" : undefined,
                fileField:
                  key === "bank_proof"
                    ? "bank_proof_file"
                    : key === "aadhaar"
                      ? "aadhar_front"
                      : `${key}_image`,
                urlField:
                  key === "bank_proof"
                    ? "bank_proof_file_url"
                    : key === "aadhaar"
                      ? "aadhar_front_url"
                      : `${key}_image_url`,
              };
            })
          : rejected;

      for (const item of docsToSubmit) {
        const file = files[item.key];
        const url = urls[item.key];
        if (!file && !url) {
          toast.error(`Please upload a new ${item.label}`);
          return null;
        }
        if (item.numberField) {
          const numRaw = (numbers[item.key] || "").trim();
          if (!numRaw) {
            toast.error(`Please enter a new ${item.label} number`);
            return null;
          }
        }
        if (item.key === "fssai") {
          const num = (numbers[item.key] || "").replace(/\D/g, "");
          if (num.length !== 14) {
            toast.error("FSSAI number must be 14 digits");
            return null;
          }
          if (!(expiries[item.key] || "").trim()) {
            toast.error("FSSAI expiry date is required");
            return null;
          }
        }
        let proxy = url;
        if (file) {
          const folder = item.key === "bank_proof" ? bankPath : docsPath;
          const baseName =
            item.key === "bank_proof"
              ? `bank_proof_${Date.now()}${extensionFromFile(file)}`
              : `${item.fileField}_${Date.now()}${extensionFromFile(file)}`;
          proxy = await uploadToR2(file, folder, baseName);
        }
        const payload: Record<string, unknown> = { document_url: proxy, proxy_url: proxy };
        if (item.numberField) {
          payload.document_number = numbers[item.key] || "";
          payload[item.numberField] = numbers[item.key] || "";
          if (item.key === "fssai") payload.fssai_number = numbers[item.key] || "";
        }
        if (item.expiryField) {
          payload.expiry_date = expiries[item.key] || "";
          payload.fssai_expiry_date = expiries[item.key] || "";
        }
        items.push({
          verificationStep: item.key === "bank_proof" ? 6 : 4,
          fieldKey: item.key,
          payload,
          r2ObjectKey: r2KeyFromProxyOrRaw(proxy),
          proxyUrl: proxy,
        });
      }
      return items;
    }

    const textFields = fields.filter(
      (f) => f !== "banner_url" && f !== "gallery_images" && f !== "map_location"
    );
    for (const key of textFields) {
      const val = (fieldValues[key] || "").trim();
      if (!val) {
        toast.error(`Please enter a new ${labelForRejectedField(step.step_number, key)}`);
        return null;
      }
      if (key === "store_type" && val === "OTHERS") {
        const custom = (fieldValues.custom_store_type || "").trim();
        if (!custom) {
          toast.error("Please enter a custom store type");
          return null;
        }
        items.push({
          verificationStep: step.step_number,
          fieldKey: key,
          payload: {
            store_type: val,
            custom_store_type: custom,
            document_number: val,
          },
        });
        continue;
      }
      const payload: Record<string, unknown> = { [key]: val, document_number: val };
      if (key === "store_type") {
        payload.custom_store_type = null;
      }
      items.push({
        verificationStep: step.step_number,
        fieldKey: key,
        payload,
      });
    }

    if (fields.includes("map_location")) {
      const latRaw = (fieldValues.latitude || "").trim();
      const lngRaw = (fieldValues.longitude || "").trim();
      const lat = Number(latRaw);
      const lng = Number(lngRaw);
      if (!latRaw || !lngRaw || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        toast.error("Please enter valid latitude and longitude");
        return null;
      }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        toast.error("Latitude must be -90..90 and longitude -180..180");
        return null;
      }
      items.push({
        verificationStep: step.step_number,
        fieldKey: "map_location",
        payload: {
          map_location: `${lat},${lng}`,
          latitude: lat,
          longitude: lng,
          document_number: `${lat},${lng}`,
        },
      });
    }

    if (needsBannerFix(step.rejection_reason, fields)) {
      if (!bannerFile && !bannerUrl) {
        toast.error("Please upload a new banner image");
        return null;
      }
      let proxy = bannerUrl;
      if (bannerFile) {
        proxy = await uploadToR2(
          bannerFile,
          bannerPath,
          `banner_${Date.now()}${extensionFromFile(bannerFile)}`
        );
      }
      items.push({
        verificationStep: step.step_number,
        fieldKey: "banner_url",
        payload: { banner_url: proxy, proxy_url: proxy },
        r2ObjectKey: r2KeyFromProxyOrRaw(proxy),
        proxyUrl: proxy,
      });
    }

    if (fields.includes("gallery_images")) {
      items.push({
        verificationStep: step.step_number,
        fieldKey: "gallery_images",
        payload: {
          note: "Gallery update acknowledged — re-upload from store setup if needed",
        },
      });
    }

    if (items.length === 0) {
      items.push({
        verificationStep: step.step_number,
        fieldKey: `step_${step.step_number}_ack`,
        payload: {
          note: "Merchant fixed this step",
          rejection_reason: step.rejection_reason,
        },
      });
    }
    return items;
  };

  const postStaged = async (
    all: StagedItem[],
    opts: { finalize: boolean; finalizeSteps?: number[] }
  ) => {
    const res = await fetch("/api/auth/onboarding-resubmissions", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storePublicId: storeId,
        items: all,
        finalize: opts.finalize,
        finalizeSteps: opts.finalizeSteps,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      throw new Error(data?.error || "Failed to submit updates");
    }
  };

  const handleContinue = async () => {
    const step = openSteps[activeStepIndex];
    if (!step) return;
    setSubmitting(true);
    try {
      const built = await buildItemsForStep(step);
      if (!built) return;
      const nextStaged = { ...stagedByStep, [step.step_number]: built };
      setStagedByStep(nextStaged);
      const nextCompleted = new Set(completedIndexes);
      nextCompleted.add(activeStepIndex);
      setCompletedIndexes(nextCompleted);

      const isLast = activeStepIndex >= openSteps.length - 1;
      if (isLast) {
        redirectedAfterCompleteRef.current = true;
      }
      await postStaged(built, {
        finalize: isLast,
        finalizeSteps: isLast ? openSteps.map((s) => s.step_number) : undefined,
      });

      if (!isLast) {
        setActiveStepIndex((i) => i + 1);
        toast.success(`${step.step_label} saved — continue to next step`);
        return;
      }

      toast.success("All rejected details are submitted — closing resubmit page.");
      router.replace(exitHref);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  const allRejectedStepsSubmitted =
    openSteps.length > 0 && openSteps.every((_, idx) => completedIndexes.has(idx));

  // If Partner or AM finished every rejected step, toast + leave this page.
  useEffect(() => {
    if (loading || redirectedAfterCompleteRef.current) return;
    if (!allRejectedStepsSubmitted) return;
    redirectedAfterCompleteRef.current = true;
    toast.success("All rejected details are submitted — closing resubmit page.");
    const t = window.setTimeout(() => {
      router.replace(exitHref);
    }, 600);
    return () => window.clearTimeout(t);
  }, [loading, allRejectedStepsSubmitted, exitHref, router]);

  if (!storeId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-sm text-slate-600">Missing store id.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f5fb]">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  const activeStep = openSteps[activeStepIndex] || null;
  const isLastStep = activeStepIndex >= openSteps.length - 1;
  const activeStepAlreadySubmitted = Boolean(
    activeStep && completedIndexes.has(activeStepIndex)
  );
  const nextIncompleteStepIndex = openSteps.findIndex((_, idx) => !completedIndexes.has(idx));

  const renderDocFields = () =>
    rejected.length === 0 ? (
      <p className="text-sm text-slate-500">No open document rejections found.</p>
    ) : (
      rejected.map((item) => {
        const file = files[item.key];
        const newUrl = urls[item.key];
        const oldUrl = oldUrls[item.key];
        const newDisplay = file?.name || fileNameFromUrl(newUrl);
        const hasNewFile = Boolean(file || newUrl);
        const oldFileName = fileNameFromUrl(oldUrl) || "Previous file";
        return (
          <div key={item.key} className="space-y-3 border-t border-slate-100 pt-4 first:border-0 first:pt-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">{item.uploadLabel}</p>
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-rose-100 text-rose-700">
                Rejected
              </span>
            </div>
            {item.numberField ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Rejected {item.label} number
                  </label>
                  <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    {oldNumbers[item.key]?.trim() || "—"}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    New {item.label} number
                  </label>
                  <input
                    type="text"
                    value={numbers[item.key] || ""}
                    onChange={(e) => setNumbers((p) => ({ ...p, [item.key]: e.target.value }))}
                    placeholder="Enter corrected number"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              </div>
            ) : null}
            {item.expiryField ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Rejected expiry date</label>
                  <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    {oldExpiries[item.key]?.trim() || "—"}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">New expiry date</label>
                  <input
                    type="date"
                    value={expiries[item.key] || ""}
                    onChange={(e) => setExpiries((p) => ({ ...p, [item.key]: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              </div>
            ) : null}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Rejected file</label>
                <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 min-h-[4.5rem]">
                  <div className="h-9 w-9 shrink-0 rounded bg-rose-100 flex items-center justify-center text-[10px] font-bold text-rose-700">
                    PDF
                  </div>
                  <p className="min-w-0 flex-1 truncate text-sm text-slate-600">
                    {oldUrl ? oldFileName : "No previous file"}
                  </p>
                  {oldUrl ? (
                    <button
                      type="button"
                      onClick={() => openPreview(oldUrl, `Rejected ${item.label}`)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </button>
                  ) : null}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                  {item.uploadLabel || `Upload ${item.label}`}
                </label>
                {hasNewFile ? (
                  <div className="flex items-center gap-2.5 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 min-h-[3.25rem]">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-white border border-slate-200">
                      <span className="rounded bg-orange-500 px-1 py-0.5 text-[9px] font-bold uppercase text-white">
                        PDF
                      </span>
                    </div>
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{newDisplay}</p>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openPreview(file || newUrl, `New ${item.label}`)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => onClearFile(item.key)}
                        title="Clear file"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 min-h-[4.5rem]">
                    <div className="flex flex-col items-start gap-1.5">
                      <CloudUpload className="h-5 w-5 text-slate-400" />
                      <button
                        type="button"
                        onClick={() => fileInputRefs.current[item.key]?.click()}
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
            </div>
            <input
              ref={(el) => {
                fileInputRefs.current[item.key] = el;
              }}
              type="file"
              accept="image/png,image/jpeg,application/pdf,.png,.jpg,.jpeg,.pdf"
              className="hidden"
              onChange={(e) => {
                onPickFile(item.key, e.target.files?.[0] || null);
                e.target.value = "";
              }}
            />
          </div>
        );
      })
    );

  const renderBannerFields = (_reason?: string) => {
    const newDisplay = bannerFile?.name || fileNameFromUrl(bannerUrl) || "banner";
    const hasNew = Boolean(bannerFile || bannerUrl);
    const oldDisplay = fileNameFromUrl(oldBannerUrl) || "Previous banner";
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-slate-900">Store banner</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Rejected banner</label>
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 min-h-[4.5rem]">
              <div className="h-9 w-9 shrink-0 rounded bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                IMG
              </div>
              <p className="min-w-0 flex-1 truncate text-sm text-slate-600">
                {oldBannerUrl ? oldDisplay : "No previous banner"}
              </p>
              {oldBannerUrl ? (
                <button
                  type="button"
                  onClick={() => openPreview(oldBannerUrl, "Rejected banner")}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <Eye className="h-3.5 w-3.5" />
                  View
                </button>
              ) : null}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Upload new banner</label>
            {hasNew ? (
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-violet-300 bg-violet-50/50 px-3 py-3 min-h-[4.5rem]">
                <div className="h-9 w-9 shrink-0 rounded bg-violet-100 flex items-center justify-center text-[10px] font-bold text-violet-700">
                  NEW
                </div>
                <p className="min-w-0 flex-1 truncate text-sm text-slate-800">{newDisplay}</p>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openPreview(bannerFile || bannerUrl, "New banner")}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBannerFile(null);
                      setBannerUrl(null);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 min-h-[4.5rem]">
                <button
                  type="button"
                  onClick={() => bannerInputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
                >
                  <CloudUpload className="h-4 w-4" />
                  Upload new
                </button>
                <div className="text-xs text-slate-500">
                  <p>Max 20 MB · .png, .jpeg</p>
                </div>
              </div>
            )}
          </div>
        </div>
        <input
          ref={bannerInputRef}
          type="file"
          accept="image/png,image/jpeg,.png,.jpg,.jpeg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] || null;
            if (!f) return;
            if (!f.type.startsWith("image/")) {
              toast.error("Only image files allowed");
              return;
            }
            if (f.size > 20 * 1024 * 1024) {
              toast.error("Max file size is 20 MB");
              return;
            }
            setBannerFile(f);
            e.target.value = "";
          }}
        />
      </div>
    );
  };

  const renderMapLocationFields = () => {
    const oldLat = (oldFieldValues.latitude || "").trim();
    const oldLng = (oldFieldValues.longitude || "").trim();
    const oldDisplay =
      oldLat || oldLng ? `${oldLat || "—"}, ${oldLng || "—"}` : "—";
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Rejected map location (lat, lng)
            </label>
            <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 min-h-[2.5rem]">
              {oldDisplay}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">New latitude</label>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={fieldValues.latitude || ""}
                onChange={(e) => setFieldValues((p) => ({ ...p, latitude: e.target.value }))}
                placeholder="e.g. 28.6139"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">New longitude</label>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={fieldValues.longitude || ""}
                onChange={(e) => setFieldValues((p) => ({ ...p, longitude: e.target.value }))}
                placeholder="e.g. 77.2090"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Enter the correct pin coordinates for this store (latitude −90…90, longitude −180…180).
        </p>
      </div>
    );
  };

  const renderTextFields = (step: OpenRejectionStep) => {
    const keys = effectiveRejectedFields(step).filter(
      (k) => k !== "banner_url" && k !== "gallery_images" && k !== "map_location"
    );
    if (keys.length === 0) return null;
    return (
      <div className="space-y-3">
        {keys.map((key) => {
          const label = labelForRejectedField(step.step_number, key);
          const oldRaw = (oldFieldValues[key] || "").trim();
          const oldVal =
            key === "store_type"
              ? storeTypeLabel(oldRaw) +
                (oldRaw === "OTHERS" && oldFieldValues.custom_store_type
                  ? ` (${oldFieldValues.custom_store_type})`
                  : "")
              : oldRaw || "—";
          return (
            <div key={key} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Rejected {label}</label>
                  <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 min-h-[2.5rem] whitespace-pre-wrap">
                    {oldVal || "—"}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">New {label}</label>
                  {key === "store_description" ? (
                    <textarea
                      value={fieldValues[key] || ""}
                      onChange={(e) => setFieldValues((p) => ({ ...p, [key]: e.target.value }))}
                      rows={3}
                      placeholder="Enter corrected value"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  ) : key === "store_type" ? (
                    <select
                      value={fieldValues.store_type || ""}
                      onChange={(e) => {
                        const next = e.target.value;
                        setFieldValues((p) => ({
                          ...p,
                          store_type: next,
                          custom_store_type: next === "OTHERS" ? p.custom_store_type || "" : "",
                        }));
                      }}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                    >
                      <option value="" disabled>
                        Select store type
                      </option>
                      {STORE_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={fieldValues[key] || ""}
                      onChange={(e) => setFieldValues((p) => ({ ...p, [key]: e.target.value }))}
                      placeholder="Enter corrected value"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  )}
                </div>
              </div>
              {key === "store_type" && fieldValues.store_type === "OTHERS" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      Rejected custom store type
                    </label>
                    <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 min-h-[2.5rem]">
                      {(oldFieldValues.custom_store_type || "").trim() || "—"}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      New custom store type
                    </label>
                    <input
                      type="text"
                      value={fieldValues.custom_store_type || ""}
                      onChange={(e) =>
                        setFieldValues((p) => ({ ...p, custom_store_type: e.target.value }))
                      }
                      placeholder="Enter custom store type"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="h-dvh flex flex-col bg-[#f7f5fb] relative overflow-hidden">
      <div
        className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-violet-200/40"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-16 top-40 h-96 w-96 rounded-full bg-violet-100/50"
        aria-hidden
      />

      <header className="relative z-20 shrink-0 flex items-center justify-between px-4 sm:px-8 py-4 bg-[#f7f5fb]/95 backdrop-blur-sm border-b border-violet-100/60">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="GatiMitra" className="h-8 w-auto object-contain" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Partner
          </span>
        </div>
        <button
          type="button"
          onClick={() => router.push(exitHref)}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Back to stores
        </button>
      </header>

      <main className="relative z-10 flex-1 min-h-0 mx-auto flex w-full max-w-5xl gap-8 px-4 sm:px-8 pt-4">
        <aside className="hidden sm:flex w-52 shrink-0 flex-col gap-0 pt-2 self-start sticky top-0 max-h-full overflow-y-auto">
          {openSteps.map((step, idx, arr) => {
            const isActive = idx === activeStepIndex;
            const isDone = completedIndexes.has(idx);
            const isLast = idx === arr.length - 1;
            return (
              <button
                key={`${step.step_number}-${idx}`}
                type="button"
                onClick={() => setActiveStepIndex(idx)}
                className="flex gap-3 text-left cursor-pointer rounded-lg -ml-1 pl-1 pr-1 hover:bg-violet-50/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                aria-current={isActive ? "step" : undefined}
              >
                <div className="flex flex-col items-center">
                  {isDone ? (
                    <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500">
                      <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                    </span>
                  ) : (
                    <span
                      className={
                        isActive
                          ? "h-3.5 w-3.5 rounded-full bg-violet-600 ring-4 ring-violet-200"
                          : "h-3.5 w-3.5 rounded-full border-2 border-rose-400 bg-rose-50"
                      }
                    />
                  )}
                  {!isLast ? (
                    <span className="w-px flex-1 border-l border-dashed my-1 min-h-[48px] border-violet-300" />
                  ) : null}
                </div>
                <div className={isLast ? "pb-2" : "pb-6"}>
                  <p
                    className={`text-sm font-semibold ${
                      isActive ? "text-violet-800" : isDone ? "text-emerald-700" : "text-slate-700"
                    }`}
                  >
                    {step.step_label}
                  </p>
                  <p
                    className={`mt-0.5 text-[11px] font-medium ${
                      isDone ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {isDone ? "Completed" : "Rejected — fix required"}
                  </p>
                </div>
              </button>
            );
          })}
        </aside>

        <div className="min-w-0 flex-1 min-h-0 overflow-y-auto overscroll-contain pb-16 pr-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Resubmit onboarding details
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 max-w-xl">
            Help us verify {storeName || "your store"}. Complete one step at a time
            {openSteps.length > 1
              ? ` (${activeStepIndex + 1} of ${openSteps.length})`
              : ""}
            .
          </p>

          {!activeStep ? (
            <p className="mt-6 text-sm text-slate-500">No open rejections found.</p>
          ) : (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
                <p className="text-base font-semibold text-slate-900">{activeStep.step_label}</p>
                {activeStepAlreadySubmitted ? (
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700">
                    Submitted
                  </span>
                ) : (
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-rose-100 text-rose-700">
                    Rejected
                  </span>
                )}
              </div>
              <div className="px-5 py-5 space-y-4">
                <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-3">
                  <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
                  <p className="text-sm text-amber-950 leading-snug">
                    {actionableRejectedFieldsMeta(activeStep).length
                      ? actionableRejectedFieldsMeta(activeStep)
                          .map((m) => m.rejectionReason)
                          .filter(Boolean)
                          .filter((v, i, a) => a.indexOf(v) === i)
                          .join(" · ") ||
                        activeStep.rejection_reason ||
                        "Please update the rejected fields below."
                      : activeStep.step_number === 4 || activeStep.step_number === 6
                        ? [
                            ...new Set(
                              rejected.map((d) => d.reason.trim()).filter(Boolean)
                            ),
                          ].join(" · ") ||
                          activeStep.rejection_reason ||
                          "Please upload the correct documents so that we can verify and continue."
                        : activeStep.rejection_reason ||
                          "Please upload the correct details so that we can verify and continue for the further step."}
                  </p>
                </div>

                {activeStepAlreadySubmitted ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3.5 py-3 text-sm text-emerald-900">
                    Resubmitted details are saved and waiting for admin verification. You can switch
                    steps from the left sidebar.
                  </div>
                ) : actionableRejectedFieldsMeta(activeStep).length > 0 ? (
                  <DynamicRejectedFields
                    fields={actionableRejectedFieldsMeta(activeStep)}
                    values={fieldValues}
                    onChange={(k, v) => setFieldValues((p) => ({ ...p, [k]: v }))}
                    docState={{ numbers, expiries, urls, files }}
                    onDocNumberChange={(k, v) => setNumbers((p) => ({ ...p, [k]: v }))}
                    onDocExpiryChange={(k, v) => setExpiries((p) => ({ ...p, [k]: v }))}
                    onDocFilePick={(k, f) => onPickFile(k as RejectedDocKey, f)}
                    onDocClear={(k) => onClearFile(k as RejectedDocKey)}
                    onPreviewUrl={(url, title) => openPreview(url, title)}
                    bannerFile={bannerFile}
                    bannerUrl={bannerUrl}
                    onBannerPick={(f) => {
                      if (!f) return;
                      setBannerFile(f);
                    }}
                    fileInputRefs={fileInputRefs}
                    bannerInputRef={bannerInputRef}
                  />
                ) : (
                  <>
                    {effectiveRejectedFields(activeStep).length > 0 &&
                    activeStep.step_number !== 4 &&
                    activeStep.step_number !== 6 ? (
                      <p className="text-xs text-slate-500">
                        Fix only:{" "}
                        {effectiveRejectedFields(activeStep)
                          .map((k) => labelForRejectedField(activeStep.step_number, k))
                          .join(", ")}
                      </p>
                    ) : null}
                    {activeStep.step_number === 4 || activeStep.step_number === 6
                      ? renderDocFields()
                      : null}
                    {activeStep.step_number !== 4 && activeStep.step_number !== 6
                      ? renderTextFields(activeStep)
                      : null}
                    {activeStep.step_number !== 4 &&
                    activeStep.step_number !== 6 &&
                    needsMapLocationFix(activeStep)
                      ? renderMapLocationFields()
                      : null}
                    {needsBannerFix(
                      activeStep.rejection_reason,
                      effectiveRejectedFields(activeStep)
                    )
                      ? renderBannerFields(activeStep.rejection_reason)
                      : null}
                  </>
                )}
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3">
            {activeStepAlreadySubmitted ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                {allRejectedStepsSubmitted
                  ? "All rejected steps are already submitted — waiting for admin review."
                  : "This step is already submitted (synced from Partner / AM) — waiting for review."}
              </div>
            ) : null}
            <div className="flex gap-3">
              {activeStepIndex > 0 ? (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setActiveStepIndex((i) => Math.max(0, i - 1))}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Back
                </button>
              ) : null}
              {activeStepAlreadySubmitted ? (
                nextIncompleteStepIndex >= 0 ? (
                  <button
                    type="button"
                    onClick={() => setActiveStepIndex(nextIncompleteStepIndex)}
                    className="flex-1 rounded-xl bg-violet-600 py-3.5 text-sm font-bold text-white hover:bg-violet-700"
                  >
                    Go to next open step
                  </button>
                ) : null
              ) : (
                <button
                  type="button"
                  disabled={submitting || !activeStep}
                  onClick={() => void handleContinue()}
                  className="flex-1 rounded-xl bg-violet-600 py-3.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-60 inline-flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {isLastStep ? "Submit for review" : "Save & continue"}
                </button>
              )}
            </div>
          </div>
        </div>
      </main>

      {preview ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={preview.title}
          onClick={closePreview}
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="truncate text-sm font-semibold text-slate-900">{preview.title}</p>
              <button
                type="button"
                onClick={closePreview}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <X className="h-3.5 w-3.5" />
                Close
              </button>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-50 p-3">
              {preview.isPdf ? (
                <iframe title={preview.title} src={preview.url} className="h-[75vh] w-full rounded-lg bg-white" />
              ) : preview.isText ? (
                <div className="flex h-[75vh] w-full flex-col gap-2">
                  <pre className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white p-3 text-left text-xs text-slate-800 whitespace-pre-wrap">
                    {preview.textContent ?? "Loading text preview…"}
                  </pre>
                  <a
                    href={preview.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-center text-xs font-semibold text-violet-700 hover:underline"
                  >
                    Open in new tab
                  </a>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview.url}
                  alt={preview.title}
                  className="max-h-[75vh] max-w-full object-contain"
                  onError={() => {
                    const fb = preview.fallbackUrl;
                    if (fb && fb !== preview.url) {
                      setPreview((prev) =>
                        prev
                          ? {
                              ...prev,
                              url: fb,
                              fallbackUrl: null,
                              isPdf: isPdfSource(null, fb),
                              isText: isTextPreviewSource(null, fb),
                            }
                          : prev
                      );
                      return;
                    }
                    // Non-image file (e.g. unsupported) — offer open/download
                    window.open(preview.url, "_blank", "noopener,noreferrer");
                    toast.message("Opened file in a new tab");
                  }}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ResubmitOnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#f7f5fb]">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
        </div>
      }
    >
      <ResubmitOnboardingInner />
    </Suspense>
  );
}
