"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, Menu, X, Loader2 } from "lucide-react";
import Step3MenuUpload, { MenuUploadMode } from "@/components/onboarding/Step3MenuUpload";
import Step4Documents, { Step4Patch, Step4SectionKey } from "@/components/onboarding/Step4Documents";
import Step5StoreSetup, {
  StoreSetupData as Step5StoreSetupData,
} from "@/components/onboarding/Step5StoreSetup";
import PreviewPage from "@/components/onboarding/preview";

const StoreLocationMapboxGL = dynamic(() => import("@/components/StoreLocationMapboxGL"), { ssr: false });
const mapboxToken = typeof process !== "undefined" ? (process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "") : "";
const disableCurrentLocationButton = typeof process !== "undefined" && process.env.NEXT_PUBLIC_DISABLE_CURRENT_LOCATION === "true";

const STEP_LABELS = [
  "Store Informations",
  "Location details",
  "Menu setup",
  "Store documents",
  "Operational details",
  "Preview",
  "Commission plan",
  "Agree... Accepted & Signed",
  "Review & submit",
];

interface Step2FormData {
  full_address: string;
  address_line1: string;
  building_name: string;
  floor_number: string;
  unit_number: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  landmark: string;
}

const STEP2_DEFAULT: Step2FormData = {
  full_address: "",
  address_line1: "",
  building_name: "",
  floor_number: "",
  unit_number: "",
  city: "",
  state: "",
  postal_code: "",
  country: "IN",
  latitude: null,
  longitude: null,
  landmark: "",
};

export function AddChildStoreClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const parentIdParam = searchParams.get("parentId") ?? searchParams.get("parentid");
  const parentId = parentIdParam ? parseInt(parentIdParam, 10) : null;
  const storeInternalIdParam = searchParams.get("storeInternalId");

  const [parentDisplayName, setParentDisplayName] = useState(() => searchParams.get("parentName") ?? "");
  const [parentDisplayPid, setParentDisplayPid] = useState(() => searchParams.get("parentLabel") ?? searchParams.get("parentPid") ?? "");
  const amPhoneFromUrl = searchParams.get("amPhone") ?? "";
  const amEmailFromUrl = searchParams.get("amEmail") ?? "";

  const [step, setStepState] = useState(1);
  const [storeInternalId, setStoreInternalId] = useState<number | null>(() => {
    const id = storeInternalIdParam ? parseInt(storeInternalIdParam, 10) : NaN;
    return Number.isFinite(id) ? id : null;
  });
  const setStep = useCallback((next: number | ((prev: number) => number)) => {
    setStepState((prev) => {
      const n = typeof next === "function" ? next(prev) : next;
      return Math.min(Math.max(n, 1), 10);
    });
  }, []);

  const [storeName, setStoreName] = useState("");
  const [ownerFullName, setOwnerFullName] = useState("");
  const [storeDisplayName, setStoreDisplayName] = useState("");
  const [storeType, setStoreType] = useState("RESTAURANT");
  const [customStoreType, setCustomStoreType] = useState("");
  const [storeEmail, setStoreEmail] = useState("");
  const [storePhonesInput, setStorePhonesInput] = useState("");
  const [storeDescription, setStoreDescription] = useState("");
  const [step2FormData, setStep2FormData] = useState<Step2FormData>(STEP2_DEFAULT);
  const [actionLoading, setActionLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [createdStoreId, setCreatedStoreId] = useState<string | null>(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const [progressLoadDone, setProgressLoadDone] = useState(() => !storeInternalIdParam || !parentIdParam);

  const [locationInputMode, setLocationInputMode] = useState<"gps" | "search">("gps");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ place_name: string; text: string; center: [number, number] }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [locationNotice, setLocationNotice] = useState("");
  const [isFetchingCurrentLocation, setIsFetchingCurrentLocation] = useState(false);
  const [locationAccuracyMeters, setLocationAccuracyMeters] = useState<number | null>(null);
  const mapRef = useRef<{ flyTo: (opts: { center: [number, number]; zoom: number; duration?: number }) => void } | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const geolocateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 3: Delivery menu upload (same UX as Partner Site)
  const [menuUploadMode, setMenuUploadMode] = useState<MenuUploadMode>("IMAGE");
  const [menuImageFiles, setMenuImageFiles] = useState<File[]>([]);
  const [menuSpreadsheetFile, setMenuSpreadsheetFile] = useState<File | null>(null);
  const [menuUploadedImageUrls, setMenuUploadedImageUrls] = useState<string[]>([]);
  const [menuUploadedSpreadsheetUrl, setMenuUploadedSpreadsheetUrl] = useState<string | null>(null);
  const [menuUploadedSpreadsheetFileName, setMenuUploadedSpreadsheetFileName] = useState<string | null>(null);
  const [menuUploadedImageNames, setMenuUploadedImageNames] = useState<string[]>([]);
  const [menuPdfFile, setMenuPdfFile] = useState<File | null>(null);
  const [menuUploadedPdfUrl, setMenuUploadedPdfUrl] = useState<string | null>(null);
  const [menuUploadedPdfFileName, setMenuUploadedPdfFileName] = useState<string | null>(null);
  const [menuUploadIds, setMenuUploadIds] = useState<number[]>([]);
  const [menuUploadError, setMenuUploadError] = useState("");
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    variant?: "warning" | "error" | "info";
    confirmLabel?: string;
    onConfirm: () => void | Promise<void>;
    onCancel?: () => void;
  } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [isImageDragActive, setIsImageDragActive] = useState(false);
  const [isCsvDragActive, setIsCsvDragActive] = useState(false);
  const [isPdfDragActive, setIsPdfDragActive] = useState(false);
  const imageUploadInputRef = useRef<HTMLInputElement | null>(null);
  const csvUploadInputRef = useRef<HTMLInputElement | null>(null);
  const pdfUploadInputRef = useRef<HTMLInputElement | null>(null);

  const [refreshingStepStatus, setRefreshingStepStatus] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [amContact, setAmContact] = useState<{ id?: string; name?: string; phone?: string; email?: string } | null>(null);
  const [paymentStepAutoAdvanced, setPaymentStepAutoAdvanced] = useState(false);
  const [showPaymentRefreshPrompt, setShowPaymentRefreshPrompt] = useState(false);
  const [agreementStepAutoAdvanced, setAgreementStepAutoAdvanced] = useState(false);
  const [showAgreementRefreshPrompt, setShowAgreementRefreshPrompt] = useState(false);
  const [signStepAutoAdvanced, setSignStepAutoAdvanced] = useState(false);
  const [showSignRefreshPrompt, setShowSignRefreshPrompt] = useState(false);
  const [onboardingSummary, setOnboardingSummary] = useState<{
    paymentSummary: {
      amount_paise: number;
      currency: string;
      status: string;
      captured_at: string | null;
      plan_id: string | null;
      plan_name: string | null;
      promo_label: string | null;
      payer_name: string | null;
    } | null;
    agreementSummary: {
      signer_name: string | null;
      signer_email: string | null;
      signer_phone: string | null;
      accepted_at: string | null;
      template_key: string | null;
      template_version: string | null;
      terms_accepted: boolean;
      contract_read_confirmed: boolean;
      contract_pdf_url: string | null;
      commission_first_month_pct: number | null;
      commission_from_second_month_pct: number | null;
      agreement_effective_from: string | null;
      agreement_effective_to: string | null;
    } | null;
  } | null>(null);

  // Step 4: documents/bank patch (kept in parent so global footer can save)
  const [step4Patch, setStep4Patch] = useState<Step4Patch | null>(null);
  const [step4Section, setStep4Section] = useState<Step4SectionKey>("PAN");
  const [step4InitialForm, setStep4InitialForm] = useState<Step4Patch | null>(null);
  const [step4InitialDocUrls, setStep4InitialDocUrls] = useState<Record<string, string>>({});
  const [step4RequiredValid, setStep4RequiredValid] = useState(false);

  // Step 5: Operational details (store configuration / hours / cuisines)
  const [step5StoreSetup, setStep5StoreSetup] = useState<Step5StoreSetupData | null>(null);
  const [mediaUploading, setMediaUploading] = useState(false);

  const legalBusinessName = storeDisplayName;
  const currentStoreId = createdStoreId;
  const parentName = parentDisplayName;
  const parentPid = parentDisplayPid;
  const paymentSummary = onboardingSummary?.paymentSummary ?? null;
  const agreementSummary = onboardingSummary?.agreementSummary ?? null;

  // When success screen is shown, prevent navigating back into the onboarding flow
  // via the browser Back button. If the user hits Back, send them to the Stores list instead.
  useEffect(() => {
    if (!success) return;
    const handlePopState = () => {
      router.push("/dashboard/area-managers/stores");
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [success, router]);

  const initialStoreIdFromUrl = useRef(storeInternalIdParam ?? null);
  useEffect(() => {
    const fromUrl = initialStoreIdFromUrl.current;
    const internalId = fromUrl ? parseInt(fromUrl, 10) : NaN;
    if (!Number.isFinite(internalId)) {
      setProgressLoadDone(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const query = new URLSearchParams({ storeInternalId: String(internalId) });
        if (parentId != null && Number.isFinite(parentId)) query.set("parentId", String(parentId));
        const res = await fetch(`/api/area-manager/child-store-progress?${query.toString()}`, { credentials: "include" });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setProgressLoadDone(true);
          return;
        }
        if (typeof json?.parent_name === "string" && json.parent_name) setParentDisplayName(json.parent_name);
        if (typeof json?.parent_merchant_id === "string" && json.parent_merchant_id) setParentDisplayPid(json.parent_merchant_id);
        const progress = json?.progress;
        if (progress && typeof progress.current_step === "number") {
          // For AM dashboard we treat current_step as the **active** step (not "last completed").
          // So if current_step = 3 and only steps 1 & 2 are done, we should land on step 3, not 4.
          const activeStep = Math.min(Math.max(progress.current_step, 1), 10);
          setStepState(activeStep);
        }
        if (progress?.form_data?.step_store?.storePublicId) {
          setCreatedStoreId(String(progress.form_data.step_store.storePublicId));
        }
        if (progress?.form_data?.step1 && typeof progress.form_data.step1 === "object") {
          const s1 = progress.form_data.step1 as Record<string, unknown>;
          if (typeof s1.store_name === "string") setStoreName(s1.store_name);
          if (typeof s1.owner_full_name === "string") setOwnerFullName(s1.owner_full_name);
          if (typeof s1.store_display_name === "string") setStoreDisplayName(s1.store_display_name);
          if (typeof s1.store_type === "string") setStoreType(s1.store_type);
          if (typeof s1.custom_store_type === "string") setCustomStoreType(s1.custom_store_type);
          if (typeof s1.store_email === "string") setStoreEmail(s1.store_email);
          if (Array.isArray(s1.store_phones)) setStorePhonesInput((s1.store_phones as string[]).join(", "));
          else if (typeof s1.store_phones === "string") setStorePhonesInput(s1.store_phones);
          if (typeof s1.store_description === "string") setStoreDescription(s1.store_description);
        }
        if (progress?.form_data?.step2 && typeof progress.form_data.step2 === "object") {
          const s2 = progress.form_data.step2 as Record<string, unknown>;
          setStep2FormData({
            full_address: typeof s2.full_address === "string" ? s2.full_address : "",
            address_line1: typeof s2.address_line1 === "string" ? s2.address_line1 : "",
            building_name: typeof s2.building_name === "string" ? s2.building_name : "",
            floor_number: typeof s2.floor_number === "string" ? s2.floor_number : "",
            unit_number: typeof s2.unit_number === "string" ? s2.unit_number : "",
            city: typeof s2.city === "string" ? s2.city : "",
            state: typeof s2.state === "string" ? s2.state : "",
            postal_code: typeof s2.postal_code === "string" ? s2.postal_code : "",
            country: typeof s2.country === "string" ? s2.country : "IN",
            latitude: typeof s2.latitude === "number" ? s2.latitude : s2.latitude != null ? Number(s2.latitude) : null,
            longitude: typeof s2.longitude === "number" ? s2.longitude : s2.longitude != null ? Number(s2.longitude) : null,
            landmark: typeof s2.landmark === "string" ? s2.landmark : "",
          });
        }
        if (progress?.form_data?.step3 && typeof progress.form_data.step3 === "object") {
          const s3 = progress.form_data.step3 as Record<string, unknown>;
          const modeRaw = typeof s3.menuUploadMode === "string" ? s3.menuUploadMode.toUpperCase() : "IMAGE";
          const mode: MenuUploadMode =
            modeRaw === "PDF" ? "PDF" : modeRaw === "CSV" ? "CSV" : "IMAGE";
          setMenuUploadMode(mode);
          setMenuUploadedImageUrls(
            Array.isArray(s3.menuImageUrls) ? (s3.menuImageUrls as string[]) : []
          );
          setMenuUploadedImageNames(
            Array.isArray(s3.menuImageNames) ? (s3.menuImageNames as string[]) : []
          );
          setMenuUploadedSpreadsheetUrl(
            typeof s3.menuSpreadsheetUrl === "string" ? s3.menuSpreadsheetUrl : null
          );
          setMenuUploadedSpreadsheetFileName(
            typeof s3.menuSpreadsheetName === "string" ? s3.menuSpreadsheetName : null
          );
          setMenuUploadedPdfUrl(
            typeof s3.menuPdfUrl === "string" ? s3.menuPdfUrl : null
          );
          setMenuUploadedPdfFileName(
            typeof s3.menuPdfFileName === "string" ? s3.menuPdfFileName : null
          );
          setMenuUploadIds(
            Array.isArray(s3.menuUploadIds)
              ? (s3.menuUploadIds as (number | string)[]).map((v) => Number(v)).filter(Number.isFinite)
              : []
          );
        }
        // Step 5: operational details (store config) – hydrate banner/cuisines/hours when present
        if (progress?.form_data?.step5 && typeof progress.form_data.step5 === "object") {
          const s5 = progress.form_data.step5 as Record<string, unknown>;
          setStep5StoreSetup((prev) => {
          const rawGallery = Array.isArray(s5.gallery_image_urls)
            ? (s5.gallery_image_urls as unknown[])
            : [];
          const gallery_previews = rawGallery
            .filter((u) => typeof u === "string" && u.trim())
            .slice(0, 5) as string[];
          return {
            banner_preview:
              typeof s5.banner_url === "string" && s5.banner_url.trim()
                ? (s5.banner_url as string)
                : prev?.banner_preview ?? "",
            gallery_previews: gallery_previews.length > 0 ? gallery_previews : prev?.gallery_previews ?? [],
              cuisine_types: Array.isArray(s5.cuisine_types)
                ? (s5.cuisine_types as string[])
                : prev?.cuisine_types ?? [],
              avg_preparation_time_minutes:
                typeof s5.avg_preparation_time_minutes === "number"
                  ? (s5.avg_preparation_time_minutes as number)
                  : prev?.avg_preparation_time_minutes ?? 30,
              min_order_amount:
                typeof s5.min_order_amount === "number"
                  ? (s5.min_order_amount as number)
                  : prev?.min_order_amount ?? 0,
              delivery_radius_km:
                typeof s5.delivery_radius_km === "number"
                  ? (s5.delivery_radius_km as number)
                  : prev?.delivery_radius_km ?? 5,
              is_pure_veg:
                typeof s5.is_pure_veg === "boolean" ? (s5.is_pure_veg as boolean) : prev?.is_pure_veg ?? false,
              accepts_online_payment:
                typeof s5.accepts_online_payment === "boolean"
                  ? (s5.accepts_online_payment as boolean)
                  : prev?.accepts_online_payment ?? true,
              accepts_cash:
                typeof s5.accepts_cash === "boolean" ? (s5.accepts_cash as boolean) : prev?.accepts_cash ?? false,
              store_hours:
                (s5.store_hours && typeof s5.store_hours === "object"
                  ? (s5.store_hours as Step5StoreSetupData["store_hours"])
                  : prev?.store_hours) ??
                {
                  monday: { closed: false, slot1_open: "09:00", slot1_close: "22:00", slot2_open: "", slot2_close: "" },
                  tuesday: { closed: false, slot1_open: "09:00", slot1_close: "22:00", slot2_open: "", slot2_close: "" },
                  wednesday: {
                    closed: false,
                    slot1_open: "09:00",
                    slot1_close: "22:00",
                    slot2_open: "",
                    slot2_close: "",
                  },
                  thursday: {
                    closed: false,
                    slot1_open: "09:00",
                    slot1_close: "22:00",
                    slot2_open: "",
                    slot2_close: "",
                  },
                  friday: { closed: false, slot1_open: "09:00", slot1_close: "22:00", slot2_open: "", slot2_close: "" },
                  saturday: {
                    closed: false,
                    slot1_open: "10:00",
                    slot1_close: "23:00",
                    slot2_open: "",
                    slot2_close: "",
                  },
                  sunday: {
                    closed: false,
                    slot1_open: "10:00",
                    slot1_close: "22:00",
                    slot2_open: "",
                    slot2_close: "",
                  },
                },
            };
          });
        }

        // Step 4 base values from registration_progress (numbers etc.)
        if (progress?.form_data?.step4 && typeof progress.form_data.step4 === "object") {
          const s4 = progress.form_data.step4 as Record<string, unknown>;
          setStep4InitialForm((prev) => ({
            ...(prev ?? {}),
            pan_number:
              typeof s4.pan_number === "string" ? (s4.pan_number as string) : prev?.pan_number,
            pan_holder_name:
              typeof s4.pan_holder_name === "string"
                ? (s4.pan_holder_name as string)
                : prev?.pan_holder_name,
            aadhar_number:
              typeof s4.aadhar_number === "string"
                ? (s4.aadhar_number as string)
                : prev?.aadhar_number,
            aadhar_holder_name:
              typeof s4.aadhar_holder_name === "string"
                ? (s4.aadhar_holder_name as string)
                : prev?.aadhar_holder_name,
            gst_number:
              typeof s4.gst_number === "string" ? (s4.gst_number as string) : prev?.gst_number,
            fssai_number:
              typeof s4.fssai_number === "string"
                ? (s4.fssai_number as string)
                : prev?.fssai_number,
            fssai_expiry_date:
              typeof s4.fssai_expiry_date === "string"
                ? (s4.fssai_expiry_date as string)
                : prev?.fssai_expiry_date,
            drug_license_number:
              typeof s4.drug_license_number === "string"
                ? (s4.drug_license_number as string)
                : prev?.drug_license_number,
            drug_license_expiry_date:
              typeof s4.drug_license_expiry_date === "string"
                ? (s4.drug_license_expiry_date as string)
                : prev?.drug_license_expiry_date,
            pharmacist_registration_number:
              typeof s4.pharmacist_registration_number === "string"
                ? (s4.pharmacist_registration_number as string)
                : prev?.pharmacist_registration_number,
            pharmacist_certificate_expiry_date:
              typeof s4.pharmacist_certificate_expiry_date === "string"
                ? (s4.pharmacist_certificate_expiry_date as string)
                : prev?.pharmacist_certificate_expiry_date,
            // Other licences persisted in registration_progress
            trade_license_number:
              typeof s4.trade_license_number === "string"
                ? (s4.trade_license_number as string)
                : prev?.trade_license_number,
            trade_license_expiry_date:
              typeof s4.trade_license_expiry_date === "string"
                ? (s4.trade_license_expiry_date as string)
                : prev?.trade_license_expiry_date,
            shop_establishment_number:
              typeof s4.shop_establishment_number === "string"
                ? (s4.shop_establishment_number as string)
                : prev?.shop_establishment_number,
            shop_establishment_expiry_date:
              typeof s4.shop_establishment_expiry_date === "string"
                ? (s4.shop_establishment_expiry_date as string)
                : prev?.shop_establishment_expiry_date,
            udyam_number:
              typeof s4.udyam_number === "string"
                ? (s4.udyam_number as string)
                : prev?.udyam_number,
            other_document_type:
              typeof s4.other_document_type === "string"
                ? (s4.other_document_type as string)
                : prev?.other_document_type,
            other_document_number:
              typeof s4.other_document_number === "string"
                ? (s4.other_document_number as string)
                : prev?.other_document_number,
            other_expiry_date:
              typeof s4.other_expiry_date === "string"
                ? (s4.other_expiry_date as string)
                : prev?.other_expiry_date,
          }));
        }

        // Step 4 documents + numbers from merchant_store_documents via verification-data
        if (internalId && Number.isFinite(internalId)) {
          try {
            const docsRes = await fetch(`/api/merchant/stores/${internalId}/verification-data`, {
              credentials: "include",
            });
            const docsJson = await docsRes.json().catch(() => ({}));
            if (docsRes.ok && docsJson?.store) {
              const s = docsJson.store as Record<string, unknown>;
              if (!createdStoreId && typeof s.store_id === "string" && s.store_id.trim()) {
                setCreatedStoreId(s.store_id.trim());
              }
            }
            if (docsRes.ok && docsJson?.documents) {
              const d = docsJson.documents as Record<string, unknown>;

              const toDateInput = (value: unknown): string | undefined => {
                if (!value) return undefined;
                if (value instanceof Date) return value.toISOString().slice(0, 10);
                const s = String(value);
                // Handle full ISO or plain YYYY-MM-DD
                if (s.length >= 10) return s.slice(0, 10);
                return undefined;
              };

              setStep4InitialForm((prev) => ({
                ...(prev ?? {}),
                pan_number:
                  typeof d.pan_document_number === "string"
                    ? (d.pan_document_number as string)
                    : prev?.pan_number,
                aadhar_number:
                  typeof d.aadhaar_document_number === "string"
                    ? (d.aadhaar_document_number as string)
                    : prev?.aadhar_number,
                gst_number:
                  typeof d.gst_document_number === "string"
                    ? (d.gst_document_number as string)
                    : prev?.gst_number,
                fssai_number:
                  typeof d.fssai_document_number === "string"
                    ? (d.fssai_document_number as string)
                    : prev?.fssai_number,
                fssai_expiry_date:
                  toDateInput(d.fssai_expiry_date) ?? prev?.fssai_expiry_date,
                drug_license_number:
                  typeof d.drug_license_document_number === "string"
                    ? (d.drug_license_document_number as string)
                    : prev?.drug_license_number,
                // Other licences pulled directly from merchant_store_documents
                trade_license_number:
                  typeof d.trade_license_document_number === "string"
                    ? (d.trade_license_document_number as string)
                    : prev?.trade_license_number,
                trade_license_expiry_date:
                  toDateInput(d.trade_license_expiry_date) ??
                  prev?.trade_license_expiry_date,
                shop_establishment_number:
                  typeof d.shop_establishment_document_number === "string"
                    ? (d.shop_establishment_document_number as string)
                    : prev?.shop_establishment_number,
                shop_establishment_expiry_date:
                  toDateInput(d.shop_establishment_expiry_date) ??
                  prev?.shop_establishment_expiry_date,
                udyam_number:
                  typeof d.udyam_document_number === "string"
                    ? (d.udyam_document_number as string)
                    : prev?.udyam_number,
                other_document_number:
                  typeof d.other_document_number === "string"
                    ? (d.other_document_number as string)
                    : prev?.other_document_number,
                other_document_type:
                  typeof d.other_document_type === "string"
                    ? (d.other_document_type as string)
                    : prev?.other_document_type,
                other_expiry_date:
                  toDateInput(d.other_expiry_date) ?? prev?.other_expiry_date,
              }));

              const urls: Record<string, string> = {};
              if (typeof d.pan_document_url === "string") {
                urls.pan = d.pan_document_url as string;
              }
              if (typeof d.aadhaar_document_url === "string") {
                urls.aadhaar_front = d.aadhaar_document_url as string;
              }
              const aadhaarMeta = d.aadhaar_document_metadata as
                | { back_url?: string | null }
                | null
                | undefined;
              if (aadhaarMeta && typeof aadhaarMeta.back_url === "string") {
                urls.aadhaar_back = aadhaarMeta.back_url;
              }
              if (typeof d.gst_document_url === "string") {
                urls.gst = d.gst_document_url as string;
              }
              if (typeof d.fssai_document_url === "string") {
                urls.fssai = d.fssai_document_url as string;
              }
              if (typeof d.drug_license_document_url === "string") {
                urls.drug_license = d.drug_license_document_url as string;
              }
              if (typeof d.pharmacist_certificate_document_url === "string") {
                urls.pharmacist_certificate =
                  d.pharmacist_certificate_document_url as string;
              }
              if (
                typeof d.pharmacy_council_registration_document_url === "string"
              ) {
                urls.pharmacy_council_registration =
                  d.pharmacy_council_registration_document_url as string;
              }
              // Other licences file previews
              if (typeof d.trade_license_document_url === "string") {
                urls.trade_license = d.trade_license_document_url as string;
              }
              if (typeof d.shop_establishment_document_url === "string") {
                urls.shop_establishment = d.shop_establishment_document_url as string;
              }
              if (typeof d.udyam_document_url === "string") {
                urls.udyam = d.udyam_document_url as string;
              }
              if (typeof d.other_document_url === "string") {
                urls.other = d.other_document_url as string;
              }
              if (Object.keys(urls).length > 0) {
                setStep4InitialDocUrls((prev) => ({ ...urls, ...prev }));
              }
            }

            // Also hydrate bank / UPI details from merchant_store_bank_accounts
            try {
              const bankRes = await fetch(
                `/api/area-manager/store-bank-accounts?storeInternalId=${internalId}`,
                { credentials: "include" }
              );
              const bankJson = await bankRes.json().catch(() => ({}));
              if (bankRes.ok && Array.isArray(bankJson.accounts) && bankJson.accounts.length > 0) {
                const b = bankJson.accounts[0] as Record<string, unknown>;
                setStep4InitialForm((prev) => ({
                  ...(prev ?? {}),
                  bank_account_holder_name:
                    typeof b.account_holder_name === "string"
                      ? (b.account_holder_name as string)
                      : prev?.bank_account_holder_name,
                  bank_account_number:
                    typeof b.account_number === "string"
                      ? (b.account_number as string)
                      : prev?.bank_account_number,
                  bank_ifsc_code:
                    typeof b.ifsc_code === "string" ? (b.ifsc_code as string) : prev?.bank_ifsc_code,
                  bank_name:
                    typeof b.bank_name === "string" ? (b.bank_name as string) : prev?.bank_name,
                  bank_branch_name:
                    typeof b.branch_name === "string"
                      ? (b.branch_name as string)
                      : prev?.bank_branch_name,
                  bank_account_type:
                    typeof b.account_type === "string"
                      ? (b.account_type as string)
                      : prev?.bank_account_type,
                  bank_proof_type:
                    typeof b.bank_proof_type === "string"
                      ? (b.bank_proof_type as string)
                      : prev?.bank_proof_type,
                  upi_id:
                    typeof b.upi_id === "string" ? (b.upi_id as string) : prev?.upi_id,
                  payout_method:
                    typeof b.payout_method === "string"
                      ? (b.payout_method as string)
                      : prev?.payout_method,
                }));

                // If we have a bank_proof_file_url, show it in docPreviews.bank_proof (Bank tab)
                if (typeof b.bank_proof_file_url === "string" && b.bank_proof_file_url) {
                  setStep4InitialDocUrls((prev) => ({
                    bank_proof: b.bank_proof_file_url as string,
                    ...prev,
                  }));
                }
                // If we have UPI QR screenshot, hydrate separate UPI preview
                if (
                  typeof b.upi_qr_screenshot_url === "string" &&
                  b.upi_qr_screenshot_url
                ) {
                  setStep4InitialDocUrls((prev) => ({
                    upi_qr: b.upi_qr_screenshot_url as string,
                    ...prev,
                  }));
                }
              }
            } catch {
              // ignore bank fetch errors for AM dashboard; user can still enter details
            }
          } catch {
            // ignore; user can still upload via AM dashboard
          }
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setProgressLoadDone(true);
      }
    })();
    return () => { cancelled = true; };
  }, [parentId]);

  // Load onboarding summary (payment + agreement) for Review & submit step
  useEffect(() => {
    if (!storeInternalId || !Number.isFinite(storeInternalId)) return;
    let cancelled = false;
    (async () => {
      try {
        const query = new URLSearchParams({ storeInternalId: String(storeInternalId) });
        const res = await fetch(`/api/area-manager/store-onboarding-summary?${query.toString()}`, {
          credentials: "include",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        if (json?.success) {
          setOnboardingSummary({
            paymentSummary: json.paymentSummary ?? null,
            agreementSummary: json.agreementSummary ?? null,
          });
        }
      } catch {
        // ignore; summary is optional
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeInternalId]);

  // Fetch current area manager contact details from backend so share/copy
  // messages always use the correct AM identity instead of parent merchant.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/area-manager/me", { credentials: "include" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.success || !json?.data || cancelled) return;
        const fromApi = json.data as {
          managerType?: string;
          areaManagerId?: number | null;
          areaManagerName?: string | null;
          areaManagerCode?: string | null;
          areaManagerPhone?: string | null;
          areaManagerEmail?: string | null;
        };
        setAmContact({
          id: fromApi.areaManagerCode ?? undefined,
          name: fromApi.areaManagerName ?? undefined,
          phone: fromApi.areaManagerPhone ?? undefined,
          email: fromApi.areaManagerEmail ?? undefined,
        });
      } catch {
        // ignore; fall back to URL hints if provided
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Lightweight refresh of current_step from AM backend so steps 7–9
  // reflect Partner Site progress without reloading the whole page.
  const refreshStepFromServer = useCallback(async () => {
    if (!storeInternalId || parentId == null || !Number.isFinite(storeInternalId)) return;
    setRefreshingStepStatus(true);
    try {
      const query = new URLSearchParams({ storeInternalId: String(storeInternalId) });
      query.set("parentId", String(parentId));
      const res = await fetch(`/api/area-manager/child-store-progress?${query.toString()}`, {
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const progress = json?.progress;
      if (progress && typeof progress.current_step === "number") {
        const activeStep = Math.min(Math.max(progress.current_step, 1), 10);
        if (step === 7 && activeStep > 7 && !paymentStepAutoAdvanced) {
          setPaymentStepAutoAdvanced(true);
          setShowPaymentRefreshPrompt(true);
        }
        if (step === 8 && activeStep > 8 && !agreementStepAutoAdvanced) {
          setAgreementStepAutoAdvanced(true);
          setShowAgreementRefreshPrompt(true);
        }
        if (step === 9 && activeStep > 9 && !signStepAutoAdvanced) {
          setSignStepAutoAdvanced(true);
          setShowSignRefreshPrompt(true);
        }
        setStepState(activeStep);
      }
    } finally {
      setRefreshingStepStatus(false);
    }
  }, [
    storeInternalId,
    parentId,
    step,
    paymentStepAutoAdvanced,
    agreementStepAutoAdvanced,
    signStepAutoAdvanced,
  ]);

  // When user is on Step 7/8/9, auto-poll backend for updated step so Partner Site
  // completion is reflected without manual refresh. When step advances, we show
  // a non-blocking prompt suggesting a page refresh.
  useEffect(() => {
    if (
      (step !== 7 && step !== 8 && step !== 9) ||
      !storeInternalId ||
      parentId == null ||
      !Number.isFinite(storeInternalId)
    ) {
      return;
    }
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    intervalId = setInterval(() => {
      if (cancelled) return;
      void refreshStepFromServer();
    }, 7000);
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [step, storeInternalId, parentId, refreshStepFromServer]);

  // Step 3 image previews
  useEffect(() => {
    if (menuImageFiles.length === 0) {
      setImagePreviewUrls([]);
      return;
    }
    const urls = menuImageFiles.map((f) => URL.createObjectURL(f));
    setImagePreviewUrls(urls);
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [menuImageFiles]);

  const setAddressFromCoords = useCallback((placeName: string, addressLine1: string, city: string, state: string, postalCode: string) => {
    setStep2FormData((prev) => ({
      ...prev,
      full_address: placeName || prev.full_address,
      address_line1: addressLine1 || prev.address_line1,
      city: city || prev.city,
      state: state || prev.state,
      postal_code: postalCode || prev.postal_code,
      country: "IN",
    }));
    setSearchQuery(placeName || "");
  }, []);

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    if (mapboxToken) {
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxToken}&country=IN&limit=1&language=en`;
        const res = await fetch(url);
        const data = await res.json();
        const best = data?.features?.[0];
        if (best) {
          const context = best.context || [];
          let city = "";
          let state = "";
          let postal_code = "";
          context.forEach((item: { id: string; text: string }) => {
            if (item.id.includes("postcode")) postal_code = item.text;
            else if (item.id.includes("place") || item.id.includes("locality") || item.id.includes("district")) city = item.text;
            else if (item.id.includes("region")) state = item.text;
          });
          setAddressFromCoords(best.place_name || "", best.text || "", city, state, postal_code);
          return;
        }
      } catch (err) {
        console.error("Mapbox reverse geocoding failed:", err);
      }
    }
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
        { headers: { Accept: "application/json", "User-Agent": "GatiMitra-Dashboard/1.0" } }
      );
      const data = await res.json();
      const a = data?.address || {};
      const placeName = data?.display_name || "";
      const city = a.city || a.town || a.village || a.county || a.state_district || "";
      const state = a.state || "";
      const postalCode = a.postcode || "";
      setAddressFromCoords(placeName, placeName.split(",")[0] || "", city, state, postalCode);
    } catch (err) {
      console.error("Nominatim reverse geocoding failed:", err);
    }
  }, [mapboxToken, setAddressFromCoords]);

  const handleMapClick = useCallback(async (event: { lngLat: { lat: number; lng: number } }) => {
    const { lat, lng } = event.lngLat;
    setStep2FormData((prev) => ({ ...prev, latitude: lat, longitude: lng }));
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 16, duration: 1.2 });
    reverseGeocode(lat, lng);
  }, [reverseGeocode]);

  const searchLocation = useCallback(async () => {
    if (!searchQuery.trim()) return;
    if (!mapboxToken) {
      setErr("Map search is not configured. Add NEXT_PUBLIC_MAPBOX_TOKEN to .env.local");
      return;
    }
    setIsSearching(true);
    try {
      const params = new URLSearchParams({
        access_token: mapboxToken,
        country: "IN",
        limit: "10",
        language: "en",
        types: "address,place,postcode,poi,neighborhood,locality",
        proximity: "77.1025,28.7041",
        autocomplete: "true",
      });
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?${params}`,
        { credentials: "omit" }
      );
      const data = await res.json();
      if (data.features?.length > 0) {
        const unique = data.features.filter(
          (r: { place_name: string }, i: number, self: { place_name: string }[]) =>
            self.findIndex((x) => x.place_name === r.place_name) === i
        );
        setSearchResults(unique);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.error("Error searching location:", error);
      setErr("Error searching location. Please try again.");
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length > 2) searchLocation();
      else setSearchResults([]);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, searchLocation]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchResults([]);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectLocation = useCallback((result: { place_name: string; text: string; center: [number, number] }) => {
    const [longitude, latitude] = result.center;
    const context = (result as { context?: Array<{ id: string; text: string }> }).context || [];
    let city = "";
    let state = "";
    let postal_code = "";
    context.forEach((item) => {
      if (item.id.includes("postcode")) postal_code = item.text;
      else if (item.id.includes("place") || item.id.includes("locality") || item.id.includes("district")) city = item.text;
      else if (item.id.includes("region")) state = item.text;
    });
    if (!postal_code) {
      const match = result.place_name.match(/\b\d{6}\b/);
      if (match) postal_code = match[0];
    }
    if (!city) city = result.text;
    setStep2FormData((prev) => ({
      ...prev,
      full_address: result.place_name,
      address_line1: result.text,
      city,
      state,
      postal_code,
      country: "IN",
      latitude,
      longitude,
    }));
    setSearchResults([]);
    setSearchQuery(result.place_name);
    mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 16, duration: 1.4 });
  }, []);

  const handleUseCurrentLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setErr("Geolocation is not supported. Use address search or enter address manually.");
      return;
    }
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setErr("Location works only on HTTPS or localhost. Use address search.");
      return;
    }
    if (!mapboxToken) {
      setErr("Add NEXT_PUBLIC_MAPBOX_TOKEN to .env.local for map.");
      return;
    }
    if (geolocateTimeoutRef.current) {
      clearTimeout(geolocateTimeoutRef.current);
      geolocateTimeoutRef.current = null;
    }
    setIsFetchingCurrentLocation(true);
    setLocationNotice("");
    setLocationAccuracyMeters(null);
    const clearLoading = () => {
      if (geolocateTimeoutRef.current) clearTimeout(geolocateTimeoutRef.current);
      geolocateTimeoutRef.current = null;
      setIsFetchingCurrentLocation(false);
    };
    geolocateTimeoutRef.current = setTimeout(() => {
      geolocateTimeoutRef.current = null;
      setIsFetchingCurrentLocation(false);
      setLocationNotice("Location request timed out. Use address search or enter manually.");
    }, 20000);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearLoading();
        const { latitude: lat, longitude: lng, accuracy } = position.coords;
        const acc = typeof accuracy === "number" && accuracy >= 0 ? accuracy : null;
        setStep2FormData((prev) => ({ ...prev, latitude: lat, longitude: lng }));
        if (acc != null) setLocationAccuracyMeters(acc);
        if (acc != null && acc <= 500) setLocationNotice("Location captured. Fine-tune by dragging the pin or searching.");
        else if (acc != null && acc <= 1500) setLocationNotice("Location set. Drag the pin or search if needed.");
        else setLocationNotice("Location set. Drag the pin or use address search for exact address.");
        reverseGeocode(lat, lng);
        const zoom = acc != null && acc < 10000 ? Math.max(14, 17 - Math.log2(acc / 50)) : 15;
        mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 1.2 });
      },
      () => {
        clearLoading();
        setLocationNotice("Could not get location. Use address search or enter manually.");
      },
      { enableHighAccuracy: true, timeout: 18000, maximumAge: 0 }
    );
  }, [reverseGeocode]);

  const applyManualCoordinates = useCallback(() => {
    const { latitude: lat, longitude: lng } = step2FormData;
    if (lat == null || lng == null) {
      setErr("Please enter both latitude and longitude.");
      return;
    }
    if (lat < -90 || lat > 90) {
      setErr("Latitude must be between -90 and 90.");
      return;
    }
    if (lng < -180 || lng > 180) {
      setErr("Longitude must be between -180 and 180.");
      return;
    }
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 16, duration: 1.4 });
    reverseGeocode(lat, lng);
  }, [step2FormData.latitude, step2FormData.longitude, reverseGeocode]);

  const handleGpsSearch = useCallback(async () => {
    const { latitude: lat, longitude: lng } = step2FormData;
    if (lat == null || lng == null) {
      setErr("Please enter both latitude and longitude.");
      return;
    }
    if (lat < -90 || lat > 90) {
      setErr("Latitude must be between -90 and 90.");
      return;
    }
    if (lng < -180 || lng > 180) {
      setErr("Longitude must be between -180 and 180.");
      return;
    }
    if (!mapboxToken) {
      setErr("Add NEXT_PUBLIC_MAPBOX_TOKEN to use GPS search.");
      return;
    }
    setErr(null);
    setIsSearching(true);
    try {
      await reverseGeocode(lat, lng);
      mapRef.current?.flyTo({ center: [lng, lat], zoom: 16, duration: 1.4 });
    } finally {
      setIsSearching(false);
    }
  }, [step2FormData.latitude, step2FormData.longitude, mapboxToken, reverseGeocode]);

  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!parentId || !Number.isFinite(parentId)) {
      setErr("Parent is required. Open this page from Stores via Add Child.");
      return;
    }
    if (!storeName.trim()) {
      setErr("Store name is required.");
      return;
    }
    if (storeType === "OTHERS" && !customStoreType.trim()) {
      setErr('Please specify "Custom Store Type" when Store Type is Others.');
      return;
    }
    setActionLoading(true);
    try {
      const storePhones = storePhonesInput.split(",").map((p) => p.trim()).filter(Boolean);
      const isUpdatingExisting = storeInternalId != null && Number.isFinite(storeInternalId);
      const body: Record<string, unknown> = {
        parentId,
        store_name: storeName.trim(),
        owner_full_name: ownerFullName.trim() || undefined,
        store_display_name: storeDisplayName.trim() || undefined,
        legal_business_name: legalBusinessName.trim() || undefined,
        store_type: storeType,
        custom_store_type: storeType === "OTHERS" ? customStoreType.trim() : undefined,
        store_email: storeEmail.trim() || undefined,
        store_phones: storePhones.length ? storePhones : undefined,
        store_description: storeDescription.trim() || undefined,
      };
      if (isUpdatingExisting) {
        body.storeInternalId = storeInternalId;
      }
      const res = await fetch("/api/area-manager/merchant-stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Failed to save store");
      const id = json?.data?.id;
      const storeIdStr = json?.data?.store_id ?? null;
      setCreatedStoreId(storeIdStr);
      if (id != null && Number.isFinite(Number(id))) setStoreInternalId(Number(id));
      if (!isUpdatingExisting && parentId != null && id != null) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("storeInternalId", String(id));
        router.replace(`/dashboard/area-managers/stores/add-child?${params.toString()}`, { scroll: false });
      }
      setStep(2);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save store");
    } finally {
      setActionLoading(false);
    }
  };

  const saveProgress = useCallback(
    async (currentStep: number, formDataPatch: Record<string, unknown>) => {
      if (!storeInternalId || !parentId || !Number.isFinite(storeInternalId)) return;
      const res = await fetch("/api/area-manager/child-store-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          storeInternalId,
          parentId,
          currentStep,
          formDataPatch,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({} as any));
        throw new Error(json?.error ?? "Failed to save progress");
      }
    },
    [storeInternalId, parentId]
  );

  const toProxyAttachmentUrl = useCallback((value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    // Never persist local preview URLs in DB.
    if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return null;

    if (trimmed.startsWith("/api/attachments/proxy")) return trimmed;
    if (trimmed.startsWith("/v1/attachments/proxy")) {
      return trimmed.replace("/v1/attachments/proxy", "/api/attachments/proxy");
    }

    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      try {
        const u = new URL(trimmed);
        if (u.pathname.startsWith("/api/attachments/proxy") || u.pathname.startsWith("/v1/attachments/proxy")) {
          const key = u.searchParams.get("key");
          if (key && key.trim()) {
            return `/api/attachments/proxy?key=${encodeURIComponent(key.trim())}`;
          }
        }
      } catch {
        return null;
      }
      return null;
    }

    // Treat as raw R2 key and normalize to proxy URL.
    return `/api/attachments/proxy?key=${encodeURIComponent(trimmed.replace(/^\/+/, ""))}`;
  }, []);

  const getStep2Patch = useCallback((): Record<string, unknown> => ({
    step2: {
      full_address: step2FormData.full_address,
      address_line1: step2FormData.address_line1,
      building_name: step2FormData.building_name,
      floor_number: step2FormData.floor_number,
      unit_number: step2FormData.unit_number,
      city: step2FormData.city,
      state: step2FormData.state,
      postal_code: step2FormData.postal_code,
      country: step2FormData.country,
      latitude: step2FormData.latitude,
      longitude: step2FormData.longitude,
      landmark: step2FormData.landmark,
    },
  }), [step2FormData]);

  const prevStep = async () => {
    if (step <= 1) return;
    if (storeInternalId != null && parentId != null && step >= 2) {
      setActionLoading(true);
      try {
        const patch = step === 2 ? getStep2Patch() : {};
        await saveProgress(step - 1, patch);
        setStep(step - 1);
      } finally {
        setActionLoading(false);
      }
    } else {
      setStep(step - 1);
    }
  };

  const nextStep = async () => {
    if (step === 1) {
      const form = document.querySelector("form");
      if (form) form.requestSubmit();
      return;
    }
    if (step === 2) {
      if (!step2FormData.full_address?.trim()) { setErr("Full address is required."); return; }
      if (!step2FormData.city?.trim()) { setErr("City is required."); return; }
      if (!step2FormData.state?.trim()) { setErr("State is required."); return; }
      if (!step2FormData.postal_code?.trim()) { setErr("Postal code is required."); return; }
    }
    if (step === 3) {
      if (!storeInternalId || !parentId || !Number.isFinite(storeInternalId)) {
        setStep(4);
        return;
      }
      if (
        menuUploadMode === "IMAGE" &&
        menuImageFiles.length === 0 &&
        menuUploadedImageUrls.length === 0
      ) {
        setErr("Please upload at least one menu image before continuing.");
        return;
      }
      if (
        menuUploadMode === "PDF" &&
        !menuPdfFile &&
        !menuUploadedPdfUrl
      ) {
        setErr("Please upload a PDF menu file before continuing.");
        return;
      }
      if (
        menuUploadMode === "CSV" &&
        !menuSpreadsheetFile &&
        !menuUploadedSpreadsheetUrl
      ) {
        setErr("Please upload a CSV/Excel menu file before continuing.");
        return;
      }

      setActionLoading(true);
      setErr(null);
      try {
        let step3Patch: Record<string, unknown> | undefined;
        const hasNewFiles =
          menuImageFiles.length > 0 ||
          menuSpreadsheetFile !== null ||
          menuPdfFile !== null;

        if (hasNewFiles) {
          const formData = new FormData();

          if (menuUploadMode === "IMAGE") {
            if (menuImageFiles.length === 0) {
              throw new Error("Please select at least one menu image.");
            }
            // Allow up to 5 images at once
            menuImageFiles.slice(0, 5).forEach((file) => {
              formData.append("files", file);
            });
          } else if (menuUploadMode === "CSV" && menuSpreadsheetFile) {
            formData.append("file", menuSpreadsheetFile);
          } else if (menuUploadMode === "PDF" && menuPdfFile) {
            formData.append("file", menuPdfFile);
          } else {
            throw new Error("No file selected for upload.");
          }

          formData.append(
            "source_entity",
            menuUploadMode === "IMAGE"
              ? "ONBOARDING_MENU_IMAGE"
              : menuUploadMode === "PDF"
              ? "ONBOARDING_MENU_PDF"
              : "ONBOARDING_MENU_SHEET"
          );
          const res = await fetch(
            `/api/merchant/stores/${storeInternalId}/media/upload`,
            {
              method: "POST",
              body: formData,
              credentials: "include",
            }
          );
          const data = await res.json().catch(() => ({}));
          const files = Array.isArray(data?.files) ? data.files : [];
          if (!res.ok || !data?.success || files.length === 0) {
            throw new Error(
              data?.error || "Menu upload failed. Please try again."
            );
          }

          if (menuUploadMode === "IMAGE") {
            const urls: string[] = [];
            const names: string[] = [];
            const ids: number[] = [];

            (files as { id?: number; public_url?: string; original_file_name?: string }[]).forEach(
              (file, index) => {
                const url =
                  typeof file.public_url === "string" ? file.public_url : "";
                const name =
                  typeof file.original_file_name === "string"
                    ? file.original_file_name
                    : menuImageFiles[index]?.name ?? "menu-image";
                const id =
                  file.id != null && Number.isFinite(Number(file.id))
                    ? Number(file.id)
                    : Date.now() + index;

                if (url) {
                  urls.push(url);
                  names.push(name);
                  ids.push(id);
                }
              }
            );

            setMenuUploadedImageUrls(urls);
            setMenuUploadedImageNames(names);
            setMenuUploadIds(ids);
            setMenuImageFiles([]);
            step3Patch = {
              step3: {
                menuUploadMode: "IMAGE",
                menuImageUrls: urls,
                menuImageNames: names,
                menuUploadIds: ids,
                menuSpreadsheetUrl: null,
                menuSpreadsheetName: null,
                menuPdfUrl: null,
                menuPdfFileName: null,
              },
            };
          } else if (menuUploadMode === "CSV") {
            const file = (files as {
              id?: number;
              public_url?: string;
              original_file_name?: string;
            }[])[0];
            const uploadedUrl =
              file && typeof file.public_url === "string" ? file.public_url : "";
            const uploadedName =
              file && typeof file.original_file_name === "string"
                ? file.original_file_name
                : menuSpreadsheetFile?.name ?? "menu-sheet";
            const uploadedId =
              file && file.id != null && Number.isFinite(Number(file.id))
                ? Number(file.id)
                : Date.now();

            const urls = [uploadedUrl];
            const names = [uploadedName];
            const ids = [uploadedId];
            setMenuUploadedSpreadsheetUrl(urls[0] ?? null);
            setMenuUploadedSpreadsheetFileName(names[0] ?? null);
            setMenuUploadIds(ids);
            setMenuSpreadsheetFile(null);
            step3Patch = {
              step3: {
                menuUploadMode: "CSV",
                menuSpreadsheetUrl: urls[0] ?? null,
                menuSpreadsheetName: names[0] ?? null,
                menuUploadIds: ids,
                menuImageUrls: [],
                menuImageNames: [],
                menuPdfUrl: null,
                menuPdfFileName: null,
              },
            };
          } else {
            const file = (files as {
              id?: number;
              public_url?: string;
              original_file_name?: string;
            }[])[0];
            const uploadedUrl =
              file && typeof file.public_url === "string" ? file.public_url : "";
            const uploadedName =
              file && typeof file.original_file_name === "string"
                ? file.original_file_name
                : menuPdfFile?.name ?? "menu-pdf";
            const uploadedId =
              file && file.id != null && Number.isFinite(Number(file.id))
                ? Number(file.id)
                : Date.now();

            const urls = [uploadedUrl];
            const names = [uploadedName];
            const ids = [uploadedId];
            setMenuUploadedPdfUrl(urls[0] ?? null);
            setMenuUploadedPdfFileName(names[0] ?? null);
            setMenuUploadIds(ids);
            setMenuPdfFile(null);
            step3Patch = {
              step3: {
                menuUploadMode: "PDF",
                menuPdfUrl: urls[0] ?? null,
                menuPdfFileName: names[0] ?? null,
                menuUploadIds: ids,
                menuImageUrls: [],
                menuImageNames: [],
                menuSpreadsheetUrl: null,
                menuSpreadsheetName: null,
              },
            };
          }
        } else {
          step3Patch = {
            step3: {
              menuUploadMode,
              menuImageUrls: menuUploadedImageUrls,
              menuImageNames: menuUploadedImageNames,
              menuSpreadsheetUrl: menuUploadedSpreadsheetUrl,
              menuSpreadsheetName: menuUploadedSpreadsheetFileName,
              menuPdfUrl: menuUploadedPdfUrl,
              menuPdfFileName: menuUploadedPdfFileName,
              menuUploadIds,
            },
          };
        }

        const next = 4;
        await saveProgress(next, step3Patch ?? {});
        setStep(next);
      } catch (e) {
        setErr(
          e instanceof Error
            ? e.message
            : "Failed to upload menu file. Please try again."
        );
      } finally {
        setActionLoading(false);
      }
      return;
    }

    // Step 5: Operational details (store configuration / cuisines / hours)
    if (step === 5) {
      if (!storeInternalId || !parentId || !Number.isFinite(storeInternalId)) {
        setStep(6);
        return;
      }
      if (!step5StoreSetup || !step5StoreSetup.cuisine_types || step5StoreSetup.cuisine_types.length === 0) {
        setErr("Please select at least one cuisine before continuing.");
        return;
      }
      const bannerValue = toProxyAttachmentUrl(step5StoreSetup.banner_preview);
      const galleryUrls = (step5StoreSetup.gallery_previews ?? [])
        .map((u) => toProxyAttachmentUrl(u))
        .filter((u): u is string => typeof u === "string" && u.length > 0)
        .slice(0, 5);

      const step5Patch: Record<string, unknown> = {
        step5: {
          cuisine_types: step5StoreSetup.cuisine_types,
          avg_preparation_time_minutes: step5StoreSetup.avg_preparation_time_minutes,
          min_order_amount: step5StoreSetup.min_order_amount,
          delivery_radius_km: step5StoreSetup.delivery_radius_km,
          is_pure_veg: step5StoreSetup.is_pure_veg,
          accepts_online_payment: step5StoreSetup.accepts_online_payment,
          accepts_cash: step5StoreSetup.accepts_cash,
          store_hours: step5StoreSetup.store_hours,
          ...(bannerValue ? { banner_url: bannerValue } : {}),
          ...(galleryUrls.length > 0 ? { gallery_image_urls: galleryUrls } : {}),
        },
      };
      setActionLoading(true);
      setErr(null);
      try {
        await saveProgress(5, step5Patch);
        setStep(6);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to save store configuration");
      } finally {
        setActionLoading(false);
      }
      return;
    }
    if (step === 4) {
      // Step 4: documents + bank details
      if (!storeInternalId || !parentId || !Number.isFinite(storeInternalId)) {
        // If somehow we reached here without a proper store, just move UI forward
        setStep(5);
        return;
      }
      setActionLoading(true);
      setErr(null);
      try {
        // Reuse same document format rules as partner site before saving/advancing
        const docFormatValidators = {
          pan: (v: string) =>
            /^[A-Z]{5}[0-9]{4}[A-Z]$/.test((v || "").replace(/\s/g, ""))
              ? ""
              : "Invalid PAN format.",
          aadhar: (v: string) =>
            /^\d{12}$/.test((v || "").replace(/\s/g, ""))
              ? ""
              : "Invalid Aadhaar format.",
          fssai: (v: string) =>
            /^\d{14}$/.test((v || "").replace(/\s/g, ""))
              ? ""
              : "Invalid FSSAI format.",
          gst: (v: string) => {
            const s = (v || "").replace(/\s/g, "").toUpperCase();
            if (!s) return "";
            return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(s)
              ? ""
              : "Invalid GSTIN format.";
          },
          drug: (v: string) =>
            (v || "").trim().length >= 5 ? "" : "Invalid Drug Licence format.",
        };

        // Only validate formats for the current Step 4 subsection,
        // so previous/other sections don't block Save & Continue.
        let fmtPan = "";
        let fmtAadhaar = "";
        let fmtGst = "";
        let fmtFssai = "";
        let fmtDrug = "";

        const upperStoreType = (storeType || "").toUpperCase();

        if (step4Section === "PAN") {
          if (step4Patch?.pan_number && step4Patch.pan_number.trim()) {
            fmtPan = docFormatValidators.pan(step4Patch.pan_number.toUpperCase());
          }
        } else if (step4Section === "AADHAAR") {
          if (step4Patch?.aadhar_number && step4Patch.aadhar_number.trim()) {
            fmtAadhaar = docFormatValidators.aadhar(step4Patch.aadhar_number);
          }
        } else if (step4Section === "GST") {
          if (step4Patch?.gst_number && step4Patch.gst_number.trim()) {
            fmtGst = docFormatValidators.gst(step4Patch.gst_number);
          }
          if (upperStoreType !== "PHARMA" &&
              step4Patch?.fssai_number &&
              step4Patch.fssai_number.trim()) {
            fmtFssai = docFormatValidators.fssai(step4Patch.fssai_number);
          }
          if (upperStoreType === "PHARMA" &&
              step4Patch?.drug_license_number &&
              step4Patch.drug_license_number.trim()) {
            fmtDrug = docFormatValidators.drug(step4Patch.drug_license_number);
          }
        }

        const firstFormatError =
          fmtPan || fmtAadhaar || fmtGst || fmtFssai || fmtDrug || "";
        if (firstFormatError) {
          setErr(
            "One or more document numbers have invalid format. Please fix the highlighted fields before continuing."
          );
          setActionLoading(false);
          return;
        }

        const docPayload: Record<string, unknown> = {};
        const normaliseDocNumber = (value: string | undefined | null) =>
          value && value.trim() ? value.trim().toUpperCase() : undefined;

        const hasBankDetails =
          !!step4Patch?.bank_account_holder_name?.trim() ||
          !!step4Patch?.bank_account_number?.trim() ||
          !!step4Patch?.bank_ifsc_code?.trim() ||
          !!step4Patch?.bank_name?.trim() ||
          !!step4Patch?.upi_id?.trim();

        const panNumber = normaliseDocNumber(step4Patch?.pan_number);
        if (panNumber) {
          docPayload.pan_document_number = panNumber;
        }
        if (step4Patch?.pan_holder_name) {
          docPayload.pan_holder_name = step4Patch.pan_holder_name.trim();
        }
        const aadhaarNumber = normaliseDocNumber(step4Patch?.aadhar_number);
        if (aadhaarNumber) {
          docPayload.aadhaar_document_number = aadhaarNumber;
        }
        if (step4Patch?.aadhar_holder_name) {
          docPayload.aadhaar_holder_name =
            step4Patch.aadhar_holder_name.trim();
        }
        const gstNumber = normaliseDocNumber(step4Patch?.gst_number);
        if (gstNumber) {
          docPayload.gst_document_number = gstNumber;
          if (legalBusinessName) {
            docPayload.gst_document_name = legalBusinessName;
          }
        }
        if (upperStoreType === "PHARMA") {
          const drugNumber = normaliseDocNumber(step4Patch?.drug_license_number);
          if (drugNumber) {
            docPayload.drug_license_document_number = drugNumber;
          }
          if (legalBusinessName) {
            docPayload.drug_license_document_name = legalBusinessName;
          }
        } else {
          const fssaiNumber = normaliseDocNumber(step4Patch?.fssai_number);
          if (fssaiNumber) {
            docPayload.fssai_document_number = fssaiNumber;
          }
          if (step4Patch?.fssai_expiry_date) {
            docPayload.fssai_expiry_date = step4Patch.fssai_expiry_date;
          }
          if (legalBusinessName) {
            docPayload.fssai_document_name = legalBusinessName;
          }
        }

        // Other licences: Trade, Shop & Establishment, Udyam, Other
        if (step4Patch?.trade_license_number) {
          docPayload.trade_license_document_number =
            step4Patch.trade_license_number.trim();
          if (step4Patch.trade_license_expiry_date) {
            docPayload.trade_license_expiry_date =
              step4Patch.trade_license_expiry_date;
          }
        }

        if (step4Patch?.shop_establishment_number) {
          docPayload.shop_establishment_document_number =
            step4Patch.shop_establishment_number.trim();
          if (step4Patch.shop_establishment_expiry_date) {
            docPayload.shop_establishment_expiry_date =
              step4Patch.shop_establishment_expiry_date;
          }
        }

        if (step4Patch?.udyam_number) {
          docPayload.udyam_document_number = step4Patch.udyam_number.trim();
        }

        if (step4Patch?.other_document_number || step4Patch?.other_document_type) {
          docPayload.other_document_number =
            step4Patch.other_document_number?.trim() || null;
          docPayload.other_document_type =
            step4Patch.other_document_type?.trim() || null;
          if (step4Patch.other_expiry_date) {
            docPayload.other_expiry_date = step4Patch.other_expiry_date;
          }
        }

        // Update merchant_store_documents numbers (uses same endpoint as partner site)
        if (Object.keys(docPayload).length > 0) {
          await fetch(`/api/merchant/stores/${storeInternalId}/documents`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(docPayload),
          });
        }

        // Create bank/UPI bank account row if payout details filled and we have public store id
        const payoutMethod =
          (step4Patch?.payout_method ?? "bank").toLowerCase() === "upi"
            ? "upi"
            : "bank";

        const hasBankCoreFields =
          !!step4Patch?.bank_account_holder_name?.trim() &&
          !!step4Patch?.bank_account_number?.trim() &&
          !!step4Patch?.bank_ifsc_code?.trim() &&
          !!step4Patch?.bank_name?.trim();

        // For UPI, only upi_id is strictly required (account_holder_name/number are optional)
        const hasUpiCoreFields = !!step4Patch?.upi_id?.trim();

        // For AM dashboard we write bank details directly via internal id helper API
        const bankStoreId =
          storeInternalId != null && Number.isFinite(storeInternalId)
            ? storeInternalId
            : null;

        if (
          bankStoreId != null &&
          step4Patch &&
          ((payoutMethod === "bank" && hasBankCoreFields) ||
            (payoutMethod === "upi" && hasUpiCoreFields))
        ) {
          await fetch("/api/area-manager/store-bank-accounts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              storeInternalId: bankStoreId,
              payout_method: payoutMethod,
              account_holder_name: step4Patch.bank_account_holder_name!.trim(),
              account_number:
                payoutMethod === "upi"
                  ? (step4Patch.bank_account_number?.trim() ||
                      step4Patch.upi_id?.trim() ||
                      "")
                  : step4Patch.bank_account_number?.trim() || "",
              ifsc_code:
                payoutMethod === "bank"
                  ? step4Patch.bank_ifsc_code?.trim() || ""
                  : undefined,
              bank_name:
                payoutMethod === "bank"
                  ? step4Patch.bank_name?.trim() || ""
                  : undefined,
              branch_name: step4Patch.bank_branch_name?.trim() || null,
              account_type:
                payoutMethod === "bank" && step4Patch.bank_account_type
                  ? step4Patch.bank_account_type
                  : undefined,
              upi_id:
                payoutMethod === "upi"
                  ? step4Patch.upi_id?.trim() || undefined
                  : undefined,
              bank_proof_type: step4Patch.bank_proof_type || undefined,
              bank_proof_file_url:
                payoutMethod === "bank"
                  ? step4Patch.bank_proof_file_url?.trim() || undefined
                  : undefined,
              upi_qr_screenshot_url:
                payoutMethod === "upi"
                  ? step4Patch.upi_qr_screenshot_url?.trim() || undefined
                  : undefined,
            }),
          });
        }

        // Also persist uppercased numbers into registration_progress.form_data.step4
        const step4ForProgress = {
          ...(step4Patch ?? {}),
          pan_number: panNumber ?? step4Patch?.pan_number,
          aadhar_number: aadhaarNumber ?? step4Patch?.aadhar_number,
          gst_number: gstNumber ?? step4Patch?.gst_number,
          drug_license_number:
            storeType.toUpperCase() === "PHARMA"
              ? normaliseDocNumber(step4Patch?.drug_license_number) ??
                step4Patch?.drug_license_number
              : step4Patch?.drug_license_number,
          drug_license_expiry_date: step4Patch?.drug_license_expiry_date ?? null,
          fssai_number:
            upperStoreType !== "PHARMA"
              ? normaliseDocNumber(step4Patch?.fssai_number) ??
                step4Patch?.fssai_number
              : step4Patch?.fssai_number,
          fssai_expiry_date: step4Patch?.fssai_expiry_date ?? null,
          pharmacist_registration_number:
            step4Patch?.pharmacist_registration_number ?? null,
          pharmacist_certificate_expiry_date:
            step4Patch?.pharmacist_certificate_expiry_date ?? null,
          // Persist other licences into registration_progress so they hydrate after reload
          trade_license_number: step4Patch?.trade_license_number ?? null,
          trade_license_expiry_date: step4Patch?.trade_license_expiry_date ?? null,
          shop_establishment_number: step4Patch?.shop_establishment_number ?? null,
          shop_establishment_expiry_date:
            step4Patch?.shop_establishment_expiry_date ?? null,
          udyam_number: step4Patch?.udyam_number ?? null,
          other_document_type: step4Patch?.other_document_type ?? null,
          other_document_number: step4Patch?.other_document_number ?? null,
          other_expiry_date: step4Patch?.other_expiry_date ?? null,
        };

        // Decide which step number to persist in child-store progress:
        // - While the user is still moving between Step 4 subsections (PAN → AADHAAR → GST → BANK),
        //   keep progress.current_step = 4.
        // - When the user has completed BANK and the UI moves to Step 5,
        //   persist current_step = 5 so the AM dashboard resumes at Operational details.
        const sectionOrder: Step4SectionKey[] = ["PAN", "AADHAAR", "GST", "BANK"];
        const idx = sectionOrder.indexOf(step4Section);
        const isLeavingBank = idx === sectionOrder.length - 1 || idx === -1;
        const progressStepNumber = isLeavingBank ? 5 : 4;

        await saveProgress(progressStepNumber, { step4: step4ForProgress });

        // Stay on Step 4 and move to next document section; only go to Step 5 when leaving Bank
        if (!isLeavingBank && idx >= 0 && idx < sectionOrder.length - 1) {
          setStep4Section(sectionOrder[idx + 1]);
        } else {
          setStep(5);
        }
      } catch (e) {
        setErr(
          e instanceof Error
            ? e.message
            : "Failed to save documents. Please try again."
        );
      } finally {
        setActionLoading(false);
      }
      return;
    }
    if (step >= 10) return;
    if (storeInternalId != null && parentId != null) {
      setActionLoading(true);
      setErr(null);
      try {
        const next = step + 1;
        const patch = step === 2 ? getStep2Patch() : {};
        await saveProgress(next, patch);
        setStep(next);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to save progress");
      } finally {
        setActionLoading(false);
      }
    } else {
      setStep(step + 1);
    }
  };

  // While existing child-store progress is loading, avoid rendering step 1 and then
  // jumping to the active step. This removes the flicker when user clicks
  // "Complete registration" from AM dashboard and is returning to an in-progress form.
  if (!progressLoadDone && storeInternalIdParam && parentIdParam) {
    return (
      <div className="h-screen max-h-screen w-full max-w-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 text-sm text-slate-700">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
          <p>Loading child store onboarding…</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="h-screen w-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center shadow-sm">
          <p className="text-lg font-semibold text-emerald-800">
            Child store registered successfully.
          </p>
          {createdStoreId && (
            <p className="mt-2 text-sm font-mono font-medium text-emerald-700">
              Store ID: {createdStoreId}
            </p>
          )}
          <p className="mt-1 text-sm text-emerald-700">
            You can close this tab or go back to Stores.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/dashboard/area-managers/stores"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Stores
            </Link>
            <button
              type="button"
              onClick={() => {
                setSuccess(false);
                setCreatedStoreId(null);
                setStoreInternalId(null);
                setStoreName("");
                setOwnerFullName("");
                setStoreDisplayName("");
                setStoreType("RESTAURANT");
                setCustomStoreType("");
                setStoreEmail("");
                setStorePhonesInput("");
                setStoreDescription("");
                setStep(1);
                const params = new URLSearchParams(searchParams.toString());
                params.delete("storeInternalId");
                router.replace(
                  `/dashboard/area-managers/stores/add-child?${params.toString()}`,
                  { scroll: false }
                );
              }}
              className="rounded-lg border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
            >
              Add another child
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-screen max-h-screen w-full max-w-full flex flex-col overflow-hidden overflow-x-hidden"
      style={{ background: "linear-gradient(180deg, #f6f8fb 0%, #eef2f7 100%)" }}
    >
      <header
        className="fixed top-0 left-0 right-0 z-30 flex-none border-b border-slate-200/80 py-1.5 sm:py-2"
        style={{ background: "linear-gradient(180deg, #f6f8fb 0%, #eef2f7 100%)" }}
      >
        <div className="flex items-center w-full min-w-0">
          <div className="w-14 lg:w-[220px] flex-shrink-0 flex items-center justify-center lg:justify-start pl-2 lg:pl-4 border-r border-slate-200/70 min-h-[2.5rem] sm:min-h-[2.75rem]">
            <img src="/logo.png" alt="GatiMitra" className="h-7 sm:h-8 w-auto object-contain" />
          </div>
          <div className="flex-1 flex items-center justify-end gap-3 min-w-0 px-3 sm:px-6">
            <div className="hidden sm:flex items-center gap-3 sm:gap-4 text-xs sm:text-sm text-slate-700 whitespace-nowrap shrink-0 ml-auto">
              <span className="font-medium">
                Parent:{" "}
                <strong className="text-indigo-700">{parentName || "—"}</strong>
              </span>
              <span className="font-medium">
                PID:{" "}
                <strong className="font-mono text-indigo-700">{parentPid || "—"}</strong>
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-[11px] font-medium text-indigo-800">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                <span>
                  AM:{" "}
                  <span className="font-semibold">
                    {amContact?.id
                      ? `${amContact.id}${amContact.name ? ` · ${amContact.name}` : ""}`
                      : amContact?.name || amContact?.email || "You"}
                  </span>
                </span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowMobileMenu(true)}
              className="md:hidden flex items-center justify-center min-w-[38px] min-h-[38px] rounded-xl border-2 border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shrink-0"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5 shrink-0" />
            </button>
          </div>
        </div>
      </header>

      {showMobileMenu && (
        <div className="fixed inset-0 z-[2100] md:hidden" aria-hidden="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowMobileMenu(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-72 max-w-[85vw] bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <span className="font-semibold text-slate-800">Menu</span>
              <button type="button" onClick={() => setShowMobileMenu(false)} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-6 h-6" /></button>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto">
              {currentStoreId && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Store ID</p>
                  <p className="text-sm font-mono font-semibold text-indigo-700 mt-0.5">{currentStoreId}</p>
                </div>
              )}
              <Link href="/dashboard/area-managers/stores" className="block rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">← All Stores</Link>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex min-h-0 min-w-0 w-full max-w-full overflow-hidden overflow-x-hidden pt-[4.25rem] sm:pt-16">
        {/* Small: narrow left strip (step circles) | main. Large: sidebar | main */}
        <div className="flex-1 grid grid-cols-[56px_1fr] lg:grid-cols-[220px_1fr] w-full min-w-0 max-w-full overflow-hidden">
          {/* Left: step strip (mobile) | compact sidebar 220px (desktop) */}
          <aside className="flex flex-col min-h-0 min-w-0 w-full max-w-full border-r border-slate-200 bg-white/95 shadow-[2px_0_12px_rgba(0,0,0,0.04)] overflow-hidden border-l-4 border-l-indigo-500">
            <div className="hidden sm:block flex-none py-3 pl-4 pr-2.5 border-b border-slate-200/80 min-w-0 bg-slate-50/50">
              <div className="flex items-baseline gap-2 whitespace-nowrap min-w-0">
                <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider shrink-0">New Store</h2>
                {currentStoreId && (
                  <span className="text-xs text-slate-500 font-mono font-semibold text-indigo-600 truncate">{currentStoreId}</span>
                )}
              </div>
            </div>
            <nav className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden space-y-2.5 sm:space-y-3 p-1.5 sm:p-3 hide-scrollbar flex flex-col items-center sm:items-stretch bg-white/80">
              {STEP_LABELS.map((label, i) => {
                const stepNum = i + 1;
                const isCurrent = stepNum === step;
                const isDone = stepNum < step;
                const isPaymentCompleted = step >= 8;
                const isAgreementAccepted = step >= 9;
                const showPaymentCompletedTag = stepNum === 7 && isPaymentCompleted;
                const showAgreementAcceptedTag = stepNum === 8 && isAgreementAccepted;
                const canGoTo = stepNum <= step;
                return (
                  <button
                    key={stepNum}
                    type="button"
                    disabled={!canGoTo}
                    onClick={() => canGoTo && stepNum !== step && setStep(stepNum)}
                    className={`w-9 h-9 sm:w-full min-w-0 flex items-center justify-center sm:justify-start gap-0 sm:gap-2 py-0 sm:py-2 px-0 sm:px-2.5 rounded-full sm:rounded-lg text-left transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 sm:flex-shrink ${isCurrent ? "bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-[0_4px_14px_rgba(99,102,241,0.4)]" : canGoTo ? "hover:bg-slate-200/80 sm:hover:bg-slate-200/60 text-slate-700" : "text-slate-400"}`}
                    aria-current={isCurrent ? "step" : undefined}
                    title={label}
                  >
                    <span className={`w-9 h-9 sm:w-7 sm:h-7 rounded-full sm:rounded-md flex items-center justify-center text-xs font-bold shrink-0 ${isCurrent ? "bg-white/25" : isDone ? "bg-emerald-500/20 text-emerald-700" : "bg-slate-200"}`}>
                      {stepNum}
                    </span>
                    <span className="hidden sm:flex flex-col text-xs font-medium min-w-0">
                      <span className="truncate">{label}</span>
                      {showPaymentCompletedTag && (
                        <span className="mt-0.5 inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                          Payment completed
                        </span>
                      )}
                      {showAgreementAcceptedTag && (
                        <span className="mt-0.5 inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                          Agreement accepted
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </nav>
            <div className="flex-none pt-2 pb-2 px-1.5 sm:pt-3 sm:pb-3 sm:px-2.5 border-t border-slate-200/80 flex flex-col items-center gap-1.5 sm:block sm:text-center bg-slate-50/50">
              <span className="hidden sm:inline text-xs font-bold text-slate-500">Step {step} of 10</span>
              <button type="button" className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-medium hover:bg-slate-300 sm:hidden" aria-label="Help">?</button>
            </div>
          </aside>

          {/* Right: main form content */}
          <main
            ref={mainScrollRef}
            className="min-w-0 w-full max-w-full flex flex-col min-h-0 overflow-hidden overflow-x-hidden bg-transparent"
          >
            <div
              className={`flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden ${
                step === 2 ? "px-0 pt-3" : "px-3 sm:px-4 md:px-6 pt-2 sm:pt-4 md:pt-5"
              }`}
            >
              {!parentId && (
                <div className="mb-4 sm:mb-6 rounded-lg border border-amber-300/80 bg-amber-50/90 px-3 py-3 sm:px-5 sm:py-4 text-xs sm:text-sm text-amber-800 font-medium">
                  No parent selected. Open this page from the Stores list via &quot;Add Child&quot; for a parent.
                </div>
              )}

              {step === 1 && (
                <div className="w-full max-w-full lg:max-w-[1100px] my-2 sm:my-3 md:my-4 min-w-0 mx-auto lg:mx-0">
                  <div className="w-full min-w-0 bg-white rounded-[14px] border border-slate-200/80 overflow-hidden" style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.06)" }}>
                    <div className="h-1 w-full bg-indigo-600" aria-hidden />
                    <form onSubmit={handleStep1Submit} className="p-3 sm:p-4 md:p-5">
                      <div className="flex items-center gap-2.5 sm:gap-3 mb-3 sm:mb-4 pb-3 border-b border-slate-200 min-w-0">
                        <div className="p-2 rounded-lg bg-indigo-100 shrink-0">
                          <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-lg font-bold text-slate-800">Basic Store Information</h2>
                          <p className="text-xs text-slate-500 mt-0.5">Enter primary store details</p>
                        </div>
                      </div>
                      {err && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                          <div>
                            <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-0.5">Store Name <span className="text-red-500">*</span></label>
                            <input type="text" value={storeName} onChange={(e) => setStoreName(e.target.value)} className="w-full min-w-0 px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" placeholder="Enter store name" required />
                          </div>
                          <div>
                            <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-0.5">Owner Full Name <span className="text-red-500">*</span></label>
                            <input type="text" value={ownerFullName} onChange={(e) => setOwnerFullName(e.target.value)} className="w-full min-w-0 px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" placeholder="Owner legal full name" required />
                          </div>
                          <div>
                            <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-0.5">Display Name</label>
                            <input type="text" value={storeDisplayName} onChange={(e) => setStoreDisplayName(e.target.value)} className="w-full min-w-0 px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" placeholder="Customer facing name" />
                          </div>
                          <div>
                            <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-0.5">Legal Business Name</label>
                            <input type="text" value={legalBusinessName} readOnly className="w-full min-w-0 px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg bg-slate-50 text-slate-700 cursor-not-allowed" placeholder="Same as Display Name (auto-filled)" />
                          </div>
                          <div>
                            <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-0.5">Store Type <span className="text-red-500">*</span></label>
                            <select value={storeType} onChange={(e) => { setStoreType(e.target.value); if (e.target.value !== "OTHERS") setCustomStoreType(""); }} className="w-full min-w-0 px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" required>
                              <option value="RESTAURANT">Restaurant</option><option value="CAFE">Cafe</option><option value="BAKERY">Bakery</option><option value="CLOUD_KITCHEN">Cloud Kitchen</option><option value="GROCERY">Grocery</option><option value="PHARMA">Pharma</option><option value="STATIONERY">Stationery</option><option value="ELECTRONICS_ECOMMERCE">Electronics and E-commerce</option><option value="OTHERS">Others</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-0.5">Store Email <span className="text-red-500">*</span></label>
                            <input type="email" value={storeEmail} onChange={(e) => setStoreEmail(e.target.value)} className="w-full min-w-0 px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" placeholder="store@example.com" required />
                          </div>
                        </div>
                        {storeType === "OTHERS" && (
                          <div>
                            <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-0.5">Custom Store Type <span className="text-red-500">*</span></label>
                            <input type="text" value={customStoreType} onChange={(e) => setCustomStoreType(e.target.value)} className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" placeholder="Specify type" />
                          </div>
                        )}
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-0.5">Phone Numbers (comma separated)</label>
                          <input type="text" value={storePhonesInput} onChange={(e) => setStorePhonesInput(e.target.value)} className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" placeholder="+911234567890, +919876543210" />
                          <p className="text-xs text-slate-500 mt-0.5">Include country code, e.g. +91 for India. Example: +911234567890, +919876543210</p>
                        </div>
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-0.5">Store Description</label>
                          <textarea value={storeDescription} onChange={(e) => setStoreDescription(e.target.value)} rows={2} className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white resize-y min-h-[2.75rem]" placeholder="Describe your store, specialties, etc." />
                        </div>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="h-full flex flex-col xl:flex-row gap-4 w-full min-w-0">
                  {/* Left - Form (partner: xl:w-2/5) */}
                  <div className="w-full xl:w-2/5 h-auto xl:h-full min-w-0">
                    <div className="bg-white/95 rounded-xl border border-slate-200/80 h-full overflow-hidden">
                      <div className="p-3 sm:p-5 h-full overflow-y-auto hide-scrollbar">
                        <div className="flex items-center gap-2 mb-4 sm:mb-5">
                          <div className="p-2 bg-indigo-50 rounded-lg">
                            <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          </div>
                          <h2 className="text-lg font-bold text-slate-800">Store Location</h2>
                        </div>

                        {/* Tabs: GPS Coordinates | Search Location */}
                        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 mb-4">
                          <button
                            type="button"
                            onClick={() => setLocationInputMode("gps")}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${locationInputMode === "gps" ? "bg-white text-indigo-700 shadow-sm border border-slate-200" : "text-slate-600 hover:text-slate-800"}`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                            GPS Coordinates
                          </button>
                          <button
                            type="button"
                            onClick={() => setLocationInputMode("search")}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${locationInputMode === "search" ? "bg-white text-indigo-700 shadow-sm border border-slate-200" : "text-slate-600 hover:text-slate-800"}`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            Search Location
                          </button>
                        </div>

                        <div className="space-y-2">
                          {locationInputMode === "gps" && (
                            <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50/80 to-white p-4">
                              <label className="block text-sm font-medium text-slate-700 mb-3">GPS Coordinates *</label>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <div className="text-xs text-slate-600 mb-1">Latitude</div>
                                  <input type="number" step="any" value={step2FormData.latitude ?? ""} onChange={(e) => setStep2FormData((p) => ({ ...p, latitude: e.target.value === "" ? null : Number(e.target.value) }))} className="font-mono w-full text-sm bg-white px-3 py-2 rounded-lg border border-slate-300 text-slate-800" placeholder="e.g. 22.5726459" />
                                </div>
                                <div>
                                  <div className="text-xs text-slate-600 mb-1">Longitude</div>
                                  <input type="number" step="any" value={step2FormData.longitude ?? ""} onChange={(e) => setStep2FormData((p) => ({ ...p, longitude: e.target.value === "" ? null : Number(e.target.value) }))} className="font-mono w-full text-sm bg-white px-3 py-2 rounded-lg border border-slate-300 text-slate-800" placeholder="e.g. 88.363895" />
                                </div>
                              </div>
                              <button type="button" onClick={() => handleGpsSearch()} disabled={isSearching} className="mt-3 px-4 py-2.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                                {isSearching ? "Searching..." : "Search"}
                              </button>
                              <p className="text-xs text-slate-500 mt-2">Enter latitude &amp; longitude, then click Search to auto-fill address, city, state and postal code.</p>
                            </div>
                          )}

                          {locationInputMode === "search" && (
                            <div ref={searchRef}>
                              <label className="block text-sm font-medium text-slate-700 mb-1">Search Location *</label>
                              <div className="relative">
                                <div className="flex flex-col sm:flex-row gap-2">
                                  <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Enter address, postal code, city..." className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white min-w-0" />
                                  <button type="button" onClick={() => searchLocation()} disabled={isSearching} className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium whitespace-nowrap"> {isSearching ? "Searching..." : "Search"} </button>
                                  {!disableCurrentLocationButton && (
                                    <button type="button" onClick={() => handleUseCurrentLocation()} disabled={isFetchingCurrentLocation} title="Use your device GPS" className="px-3 py-2 text-sm border border-indigo-300 text-indigo-700 rounded-lg bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 font-medium whitespace-nowrap">
                                      {isFetchingCurrentLocation ? "Getting location..." : "Use current location"}
                                    </button>
                                  )}
                                </div>
                                {locationNotice && <div className="mt-2 text-xs rounded-lg px-2.5 py-1.5 border border-amber-200 bg-amber-50 text-amber-700">{locationNotice}</div>}
                                {searchResults.length > 0 && (
                                  <div className="absolute z-50 mt-1 w-full border border-slate-200 rounded-lg bg-white shadow-lg max-h-40 overflow-y-auto hide-scrollbar">
                                    {searchResults.map((result: { place_name: string; text: string; center: [number, number]; context?: Array<{ id: string; text: string }> }, idx: number) => (
                                      <div key={idx} onClick={() => selectLocation(result)} className="p-3 hover:bg-indigo-50 cursor-pointer border-b border-slate-100 last:border-b-0 text-sm">
                                        <div className="font-medium text-slate-800">{result.text}</div>
                                        <div className="text-xs text-slate-600 truncate mt-1">{result.place_name}</div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 mt-1">Enter exact address, postal code, or location name</p>
                            </div>
                          )}

                          {err && <div className="rounded-lg bg-red-50 border border-red-200/80 px-3 py-2 text-sm text-red-700">{err}</div>}

                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Full Address *</label>
                            <textarea value={step2FormData.full_address} onChange={(e) => setStep2FormData((p) => ({ ...p, full_address: e.target.value }))} rows={2} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" placeholder="Complete address with landmarks" />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm font-medium text-slate-700 mb-2">Flat / Unit No.</label>
                              <input type="text" value={step2FormData.unit_number} onChange={(e) => setStep2FormData((p) => ({ ...p, unit_number: e.target.value }))} className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" placeholder="e.g. A-302" />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-slate-700 mb-2">Floor / Tower</label>
                              <input type="text" value={step2FormData.floor_number} onChange={(e) => setStep2FormData((p) => ({ ...p, floor_number: e.target.value }))} className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" placeholder="e.g. 3rd Floor" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Building / Complex Name</label>
                            <input type="text" value={step2FormData.building_name} onChange={(e) => setStep2FormData((p) => ({ ...p, building_name: e.target.value }))} className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" placeholder="Building, block, complex name" />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm font-medium text-slate-700 mb-2">City *</label>
                              <input type="text" value={step2FormData.city} onChange={(e) => setStep2FormData((p) => ({ ...p, city: e.target.value }))} className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-slate-700 mb-2">State *</label>
                              <input type="text" value={step2FormData.state} onChange={(e) => setStep2FormData((p) => ({ ...p, state: e.target.value }))} className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm font-medium text-slate-700 mb-2">Postal Code *</label>
                              <input type="text" value={step2FormData.postal_code} onChange={(e) => setStep2FormData((p) => ({ ...p, postal_code: e.target.value }))} className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" autoComplete="postal-code" />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-slate-700 mb-2">Landmark</label>
                              <input type="text" value={step2FormData.landmark} onChange={(e) => setStep2FormData((p) => ({ ...p, landmark: e.target.value }))} className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" placeholder="Nearby landmark" />
                            </div>
                          </div>

                          {locationInputMode === "search" ? (
                            <div className="border border-slate-200 rounded-xl p-4 bg-gradient-to-r from-indigo-50 to-white">
                              <div className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                                <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                                GPS Coordinates
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <div className="text-xs text-slate-600 mb-2">Latitude</div>
                                  <input type="number" step="any" value={step2FormData.latitude ?? ""} onChange={(e) => setStep2FormData((p) => ({ ...p, latitude: e.target.value === "" ? null : Number(e.target.value) }))} className="font-mono w-full text-sm bg-white p-3 rounded-lg border border-slate-300 text-slate-800" placeholder="e.g. 22.5726459" />
                                </div>
                                <div>
                                  <div className="text-xs text-slate-600 mb-2">Longitude</div>
                                  <input type="number" step="any" value={step2FormData.longitude ?? ""} onChange={(e) => setStep2FormData((p) => ({ ...p, longitude: e.target.value === "" ? null : Number(e.target.value) }))} className="font-mono w-full text-sm bg-white p-3 rounded-lg border border-slate-300 text-slate-800" placeholder="e.g. 88.363895" />
                                </div>
                              </div>
                              <button type="button" onClick={applyManualCoordinates} className="mt-3 px-4 py-2 text-xs font-medium rounded-lg border border-indigo-300 text-indigo-700 hover:bg-indigo-50">Set location from coordinates</button>
                              {step2FormData.latitude != null && step2FormData.longitude != null && (
                                <div className="mt-3 text-xs text-emerald-600 flex items-center gap-1">
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                                  Location set at coordinates
                                  {locationAccuracyMeters != null ? ` (~${locationAccuracyMeters}m accuracy)` : ""}
                                </div>
                              )}
                            </div>
                          ) : (
                            step2FormData.latitude != null && step2FormData.longitude != null && (
                              <div className="text-xs text-slate-500 flex items-center gap-2">
                                <span className="font-mono">Lat {step2FormData.latitude}, Long {step2FormData.longitude}</span>
                                {locationAccuracyMeters != null && <span className="text-emerald-600">~{locationAccuracyMeters}m accuracy</span>}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right - Map (partner: xl:w-3/5) */}
                  <div className="w-full xl:w-3/5 min-h-[280px] h-[280px] sm:h-[360px] xl:min-h-0 xl:h-full">
                    <div className="bg-white/95 rounded-xl border border-slate-200/80 h-full overflow-hidden">
                      <div className="p-3 sm:p-5 h-full flex flex-col">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3 sm:mb-4">
                          <div className="flex items-center gap-2">
                            <div className="p-2 bg-rose-50 rounded-lg shrink-0">
                              <svg className="w-5 h-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                            </div>
                            <h3 className="font-bold text-slate-800 text-sm sm:text-base">Location Map</h3>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className={`px-3 py-1 text-xs font-medium rounded-full ${step2FormData.latitude != null ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                              {step2FormData.latitude != null ? "📍 Location Set" : "📍 Search to set location"}
                            </div>
                          </div>
                        </div>
                        {!mapboxToken && (
                          <div className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            Mapbox token not found. Add <span className="font-mono">NEXT_PUBLIC_MAPBOX_TOKEN</span> in <span className="font-mono">.env.local</span> to use the map.
                          </div>
                        )}
                        <div className="flex-1 rounded-lg overflow-hidden border border-slate-300 min-h-[200px]">
                          {mapboxToken ? (
                            <StoreLocationMapboxGL
                              ref={mapRef}
                              latitude={step2FormData.latitude}
                              longitude={step2FormData.longitude}
                              mapboxToken={mapboxToken}
                              onLocationChange={(lat, lng) => setStep2FormData((p) => ({ ...p, latitude: lat, longitude: lng }))}
                              onMapClick={handleMapClick}
                            />
                          ) : (
                            <div className="h-full min-h-[300px] w-full flex items-center justify-center bg-slate-100 text-slate-500 text-sm rounded-lg">Add NEXT_PUBLIC_MAPBOX_TOKEN to load the map</div>
                          )}
                        </div>
                        <div className="mt-3 sm:mt-4 text-xs text-slate-600">
                          <div className="flex flex-col xs:flex-row flex-wrap gap-1 sm:gap-3">
                            <div className="flex items-center gap-1">
                              <div className="w-3 h-3 bg-rose-500 rounded-full shrink-0" />
                              <span>Drag marker or click on map to set location</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <svg className="w-3 h-3 text-indigo-500 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>
                              <span>Search for exact address</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Menu setup – full menu upload (shared with Partner Site flow) */}
              {step === 3 && (
                <div className="w-full h-full">
                  <Step3MenuUpload
                    menuUploadMode={menuUploadMode}
                      onModeClick={(mode) => {
                        if (mode === menuUploadMode) return;

                        // Only consider files for the CURRENT mode when deciding to show switch modal.
                        const hasExistingForCurrentMode =
                          (menuUploadMode === "IMAGE" &&
                            (menuImageFiles.length > 0 ||
                              menuUploadedImageUrls.length > 0)) ||
                          (menuUploadMode === "PDF" &&
                            (!!menuPdfFile || !!menuUploadedPdfUrl)) ||
                          (menuUploadMode === "CSV" &&
                            (!!menuSpreadsheetFile || !!menuUploadedSpreadsheetUrl));

                        if (!hasExistingForCurrentMode) {
                          setMenuUploadMode(mode);
                          setMenuUploadError("");
                          return;
                        }
                        setConfirmModal({
                          title: "Switch upload type?",
                          message:
                            "Switching upload type will delete all previous files from the server. Continue?",
                          variant: "warning",
                          confirmLabel: "Yes, switch",
                          onConfirm: async () => {
                            try {
                              if (storeInternalId && parentId && Number.isFinite(storeInternalId)) {
                                await fetch(
                                  `/api/merchant/stores/${storeInternalId}/media/delete-menu`,
                                  {
                                    method: "DELETE",
                                    headers: { "Content-Type": "application/json" },
                                    credentials: "include",
                                    body: JSON.stringify({}),
                                  }
                                );
                              }
                            } catch {
                              // ignore; local state will still be cleared
                            }
                            setMenuImageFiles([]);
                            setMenuUploadedImageUrls([]);
                            setMenuUploadedImageNames([]);
                            setMenuSpreadsheetFile(null);
                            setMenuUploadedSpreadsheetUrl(null);
                            setMenuUploadedSpreadsheetFileName(null);
                            setMenuPdfFile(null);
                            setMenuUploadedPdfUrl(null);
                            setMenuUploadedPdfFileName(null);
                          setMenuUploadIds([]);
                          setMenuUploadError("");
                          setMenuUploadMode(mode);
                          },
                          onCancel: () => setConfirmModal(null),
                        });
                      }}
                    menuImageFiles={menuImageFiles}
                    menuUploadedImageUrls={menuUploadedImageUrls}
                    menuUploadedImageNames={menuUploadedImageNames}
                    menuUploadIds={menuUploadIds}
                    menuSpreadsheetFile={menuSpreadsheetFile}
                    menuUploadedSpreadsheetUrl={menuUploadedSpreadsheetUrl}
                    menuUploadedSpreadsheetFileName={menuUploadedSpreadsheetFileName}
                    menuPdfFile={menuPdfFile}
                    menuUploadedPdfUrl={menuUploadedPdfUrl}
                    menuUploadedPdfFileName={menuUploadedPdfFileName}
                    setConfirmModal={setConfirmModal}
                    menuUploadError={menuUploadError || null}
                    isImageDragActive={isImageDragActive}
                    setIsImageDragActive={setIsImageDragActive}
                    isPdfDragActive={isPdfDragActive}
                    setIsPdfDragActive={setIsPdfDragActive}
                    isCsvDragActive={isCsvDragActive}
                    setIsCsvDragActive={setIsCsvDragActive}
                    onMenuImageUpload={(files) => {
                      if (!files?.length) return;
                      setMenuUploadError("");
                      setMenuImageFiles(files.slice(0, 5));
                    }}
                    onMenuPdfUpload={(file) => {
                      setMenuUploadError("");
                      setMenuPdfFile(file);
                    }}
                    onMenuSpreadsheetUpload={(file) => {
                      setMenuUploadError("");
                      setMenuSpreadsheetFile(file);
                    }}
                    imageUploadInputRef={imageUploadInputRef}
                    pdfUploadInputRef={pdfUploadInputRef}
                    csvUploadInputRef={csvUploadInputRef}
                    imagePreviewUrls={imagePreviewUrls}
                    onRemovePendingImage={(idx) => {
                      setMenuImageFiles((prev) => prev.filter((_, i) => i !== idx));
                    }}
                    onRemoveUploadedImage={(idx) => {
                      if (!storeInternalId || !parentId || !Number.isFinite(storeInternalId)) {
                        setMenuUploadedImageUrls((prev) =>
                          prev.filter((_, i) => i !== idx)
                        );
                        setMenuUploadedImageNames((prev) =>
                          prev.filter((_, i) => i !== idx)
                        );
                        setMenuUploadIds((prev) =>
                          prev.filter((_, i) => i !== idx)
                        );
                        return;
                      }
                      const fileId = menuUploadIds[idx];
                      setConfirmModal({
                        title: "Remove file?",
                        message: "This will be deleted from the server.",
                        variant: "warning",
                        confirmLabel: "Confirm",
                        onConfirm: async () => {
                          try {
                            await fetch(
                              `/api/merchant/stores/${storeInternalId}/media/delete-menu`,
                              {
                                method: "DELETE",
                                headers: { "Content-Type": "application/json" },
                                credentials: "include",
                                body: JSON.stringify(
                                  fileId != null
                                    ? { fileId }
                                    : { r2Key: null }
                                ),
                              }
                            );
                          } catch {
                            // ignore network errors; still clear local state
                          }
                          setMenuUploadedImageUrls((prev) =>
                            prev.filter((_, i) => i !== idx)
                          );
                          setMenuUploadedImageNames((prev) =>
                            prev.filter((_, i) => i !== idx)
                          );
                          setMenuUploadIds((prev) =>
                            prev.filter((_, i) => i !== idx)
                          );
                        },
                        onCancel: () => setConfirmModal(null),
                      });
                    }}
                    onRemoveCsvFile={() => {
                      if (!storeInternalId || !parentId || !Number.isFinite(storeInternalId)) {
                        setMenuUploadedSpreadsheetUrl(null);
                        setMenuUploadedSpreadsheetFileName(null);
                        setMenuSpreadsheetFile(null);
                        return;
                      }
                      setConfirmModal({
                        title: "Remove file?",
                        message: "This will be deleted from the server.",
                        variant: "warning",
                        confirmLabel: "Confirm",
                        onConfirm: async () => {
                          try {
                            await fetch(
                              `/api/merchant/stores/${storeInternalId}/media/delete-menu`,
                              {
                                method: "DELETE",
                                headers: { "Content-Type": "application/json" },
                                credentials: "include",
                                body: JSON.stringify({ fileId: menuUploadIds[0] ?? null }),
                              }
                            );
                          } catch {
                            // ignore; still clear local state
                          }
                          setMenuUploadedSpreadsheetUrl(null);
                          setMenuUploadedSpreadsheetFileName(null);
                          setMenuSpreadsheetFile(null);
                        },
                        onCancel: () => setConfirmModal(null),
                      });
                    }}
                    onRemovePdfFile={() => {
                      if (!storeInternalId || !parentId || !Number.isFinite(storeInternalId)) {
                        setMenuUploadedPdfUrl(null);
                        setMenuUploadedPdfFileName(null);
                        setMenuPdfFile(null);
                        return;
                      }
                      setConfirmModal({
                        title: "Remove file?",
                        message: "This will be deleted from the server.",
                        variant: "warning",
                        confirmLabel: "Confirm",
                        onConfirm: async () => {
                          try {
                            await fetch(
                              `/api/merchant/stores/${storeInternalId}/media/delete-menu`,
                              {
                                method: "DELETE",
                                headers: { "Content-Type": "application/json" },
                                credentials: "include",
                                body: JSON.stringify({ fileId: menuUploadIds[0] ?? null }),
                              }
                            );
                          } catch {
                            // ignore; still clear local state
                          }
                          setMenuUploadedPdfUrl(null);
                          setMenuUploadedPdfFileName(null);
                          setMenuPdfFile(null);
                        },
                        onCancel: () => setConfirmModal(null),
                      });
                    }}
                  />
                </div>
              )}

              {/* Step 4: Store documents (shared with partner-site logic) */}
              {step === 4 && (
                <Step4Documents
                  storeType={storeType}
                  storeInternalId={storeInternalId}
                  storePublicId={createdStoreId}
                  onPatchChange={(patch) => setStep4Patch(patch)}
                  section={step4Section}
                  onSectionChange={setStep4Section}
                  initialForm={step4InitialForm}
                  initialDocUrls={step4InitialDocUrls}
                  onRequiredValidChange={setStep4RequiredValid}
                />
              )}

              {/* Step 5: Operational details – store configuration */}
              {step === 5 && (
                <Step5StoreSetup
                  initialStoreSetup={step5StoreSetup ?? undefined}
                  storeInternalId={storeInternalId}
                  onMediaUploadingChange={setMediaUploading}
                  onChange={(next) => setStep5StoreSetup(next)}
                  onDeleteBanner={async (currentBannerUrl) => {
                    if (!storeInternalId || !parentId || !Number.isFinite(storeInternalId)) return;
                    // Clear banner_url in progress + merchant_stores
                    await saveProgress(5, {
                      step5: {
                        banner_url: "",
                      },
                    });
                  }}
                  onDeleteGalleryImage={async (_index, _url) => {
                    if (!storeInternalId || !parentId || !Number.isFinite(storeInternalId)) return;
                    const remaining =
                      step5StoreSetup?.gallery_previews
                        ?.map((u) => toProxyAttachmentUrl(u))
                        .filter((u): u is string => typeof u === "string" && u.length > 0)
                        .slice(0, 5) ?? [];
                    await saveProgress(5, {
                      step5: {
                        gallery_image_urls: remaining,
                      },
                    });
                  }}
                />
              )}

              {/* Step 6: Preview (AM child onboarding using shared PreviewPage) */}
              {step === 6 && (
                <div className="w-full h-full">
                  <PreviewPage
                    showFooter={false}
                    step1={{
                      store_name: storeName,
                      owner_full_name: ownerFullName,
                      store_display_name: storeDisplayName,
                      store_type: storeType,
                      custom_store_type: customStoreType,
                      store_email: storeEmail,
                      store_phones: storePhonesInput
                        .split(",")
                        .map((p) => p.trim())
                        .filter((p) => p.length > 0),
                      store_description: storeDescription,
                      __draftStoreDbId: storeInternalId,
                      __draftStorePublicId: createdStoreId,
                    }}
                    step2={step2FormData}
                    documents={{
                      // Core numbers / names (match partnersite DocumentData shape)
                      pan_number:
                        step4Patch?.pan_number ??
                        step4InitialForm?.pan_number ??
                        "",
                      pan_holder_name:
                        step4Patch?.pan_holder_name ??
                        step4InitialForm?.pan_holder_name ??
                        "",
                      aadhar_number:
                        step4Patch?.aadhar_number ??
                        step4InitialForm?.aadhar_number ??
                        "",
                      aadhar_holder_name:
                        step4Patch?.aadhar_holder_name ??
                        step4InitialForm?.aadhar_holder_name ??
                        "",
                      fssai_number:
                        step4Patch?.fssai_number ??
                        step4InitialForm?.fssai_number ??
                        "",
                      gst_number:
                        step4Patch?.gst_number ??
                        step4InitialForm?.gst_number ??
                        "",
                      drug_license_number:
                        step4Patch?.drug_license_number ??
                        step4InitialForm?.drug_license_number ??
                        "",
                      pharmacist_registration_number:
                        step4Patch?.pharmacist_registration_number ??
                        step4InitialForm?.pharmacist_registration_number ??
                        "",
                      // Image / file URLs from verification-data
                      pan_image_url: step4InitialDocUrls.pan,
                      aadhar_front_url: step4InitialDocUrls.aadhaar_front,
                      aadhar_back_url: step4InitialDocUrls.aadhaar_back,
                      fssai_image_url: step4InitialDocUrls.fssai,
                      gst_image_url: step4InitialDocUrls.gst,
                      drug_license_image_url: step4InitialDocUrls.drug_license,
                      pharmacist_certificate_url:
                        step4InitialDocUrls.pharmacist_certificate,
                      pharmacy_council_registration_url:
                        step4InitialDocUrls.pharmacy_council_registration,
                      // Bank block (shape expected by PreviewPage)
                      bank:
                        step4InitialForm &&
                        (step4InitialForm.bank_account_holder_name ||
                          step4InitialForm.bank_account_number ||
                          step4InitialForm.bank_ifsc_code ||
                          step4InitialForm.bank_name ||
                          step4InitialForm.upi_id)
                          ? {
                              payout_method:
                                (step4InitialForm.payout_method ||
                                  "bank") === "upi"
                                  ? "upi"
                                  : "bank",
                              account_holder_name:
                                step4InitialForm.bank_account_holder_name ||
                                "",
                              account_number:
                                step4InitialForm.bank_account_number || "",
                              ifsc_code:
                                step4InitialForm.bank_ifsc_code || "",
                              bank_name: step4InitialForm.bank_name || "",
                              branch_name:
                                step4InitialForm.bank_branch_name || "",
                              account_type:
                                (step4InitialForm.bank_account_type as
                                  | string
                                  | null) || "",
                              upi_id: step4InitialForm.upi_id || "",
                              bank_proof_type:
                                (step4InitialForm.bank_proof_type as
                                  | string
                                  | null) || undefined,
                              bank_proof_file_url:
                                step4InitialDocUrls.bank_proof,
                              upi_qr_screenshot_url:
                                step4InitialDocUrls.upi_qr,
                            }
                          : undefined,
                    }}
                    storeSetup={step5StoreSetup ?? {}}
                    menuData={{
                      menuUploadMode,
                      menuImageFiles: [],
                      menuSpreadsheetFile: null,
                      menuImageUrls: menuUploadedImageUrls,
                      menuSpreadsheetUrl: menuUploadedSpreadsheetUrl,
                      menuPdfUrl: menuUploadedPdfUrl,
                      menuPdfFileName: menuUploadedPdfFileName,
                    }}
                    parentInfo={{
                      parent_name: parentName,
                      parent_pid: parentPid,
                    }}
                    onBack={async () => {
                      setActionLoading(true);
                      try {
                        await saveProgress(5, {});
                        setStep(5);
                      } catch {
                        setStep(5);
                      } finally {
                        setActionLoading(false);
                      }
                    }}
                    onContinueToPlans={async () => {
                      setActionLoading(true);
                      try {
                        await saveProgress(7, {});
                        setStep(7);
                      } catch {
                        setStep(7);
                      } finally {
                        setActionLoading(false);
                      }
                    }}
                    actionLoading={actionLoading}
                  />
                </div>
              )}

              {/* Step 7: Commission plan & payment status (child store pays on Partner Site) */}
              {step === 7 && (
                <div className="w-full flex justify-center py-8 sm:py-12">
                  <div className="w-full max-w-3xl bg-white/95 rounded-2xl border border-slate-200/80 shadow-sm">
                    <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-base sm:text-lg font-semibold text-slate-900 flex items-center gap-2">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-medium">
                            7
                          </span>
                          Commission plan & payment
                        </h2>
                        <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                          The store owner must complete the onboarding payment on the Partner Site. Once the payment is successful, this step will be automatically marked as completed.
                        </p>
                      </div>
                    </div>
                    <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-4">
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
                        <p className="text-xs sm:text-sm text-slate-700">
                          Share the onboarding link with the store owner and ask them to complete the{" "}
                          <span className="font-semibold">payment step (Step 7 – Plans)</span> on the Partner Site. This will securely record the onboarding payment for this store.
                        </p>
                        {parentId != null && createdStoreId && (
                          <div className="mt-3 space-y-1.5">
                            <p className="text-[11px] sm:text-xs font-medium text-slate-600">
                              Partner Site link for this store
                            </p>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                              <code className="flex-1 block text-[11px] sm:text-xs text-slate-800 bg-white rounded-lg border border-slate-200 px-2 py-1 overflow-x-auto">
                                {`https://partner.gatimitra.com/auth/register-store?parent_id=${parentId}&store_id=${createdStoreId}`}
                              </code>
                              <button
                                type="button"
                                onClick={() => {
                                  const url = `https://partner.gatimitra.com/auth/register-store?parent_id=${parentId}&store_id=${createdStoreId}`;
                                  if (navigator.share) {
                                    const text = [
                                      "Hi 👋",
                                      "",
                                      "Welcome to GatiMitra!",
                                      "",
                                      "To complete your store onboarding, please finish the payment using the link below:",
                                      "",
                                      `🔗 ${url}`,
                                      "",
                                      "Once the payment is done, you can proceed with the remaining onboarding steps.",
                                      "",
                                      "If you need any help, feel free to contact your Area Manager.",
                                      "",
                                      "—",
                                      "GatiMitra On-Demand Services Private Limited",
                                      "India’s Leading Low-Cost Delivery Platform",
                                    ].join("\n");
                                    navigator
                                      .share({
                                        title: "GatiMitra store onboarding",
                                        text,
                                      })
                                      .catch(() => {});
                                  } else {
                                    const doCopy = async () => {
                                      try {
                                        if (navigator.clipboard?.writeText) {
                                          const text = [
                                            "Hi 👋",
                                            "",
                                            "Welcome to GatiMitra!",
                                            "",
                                            "To complete your store onboarding, please finish the payment using the link below:",
                                            "",
                                            `🔗 ${url}`,
                                            "",
                                            "Once the payment is done, you can proceed with the remaining onboarding steps.",
                                            "",
                                            "If you need any help, feel free to contact your Area Manager.",
                                            "",
                                            "—",
                                            "GatiMitra On-Demand Services Private Limited",
                                            "India’s Leading Low-Cost Delivery Platform",
                                          ].join("\n");
                                          await navigator.clipboard.writeText(text);
                                          setLinkCopied(true);
                                          setTimeout(() => setLinkCopied(false), 2000);
                                        }
                                      } catch {
                                        // ignore
                                      }
                                    };
                                    void doCopy();
                                  }
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-300 text-[11px] sm:text-xs text-slate-700 hover:bg-slate-50"
                              >
                                Share link
                              </button>
                            </div>
                            <p className="text-[11px] sm:text-xs text-slate-500 mt-1.5">
                              Copy and share this link with the store owner. After the payment is completed, return here and click{" "}
                              <span className="font-semibold">Save & Continue</span> to proceed.
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 sm:p-4 flex items-start gap-2">
                        <div className="mt-0.5">
                          <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div className="flex-1 text-xs sm:text-sm text-emerald-900 space-y-2">
                          <p>
                            Once the payment is completed on the Partner Site, the system will automatically update the status. Click{" "}
                            <span className="font-semibold">Refresh status</span> to check the latest payment update before continuing.
                          </p>
                          <button
                            type="button"
                            onClick={() => refreshStepFromServer()}
                            disabled={refreshingStepStatus}
                            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[11px] sm:text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {refreshingStepStatus ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                <span>Refreshing status…</span>
                              </>
                            ) : (
                              <>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v6h6M20 20v-6h-6M5 19a9 9 0 0114-7.5M19 5a9 9 0 01-14 7.5" />
                                </svg>
                                <span>Refresh step status</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 8: Agreement / Step 9: Review & submit with payment + agreement summary */}
              {step === 8 && (
                <div className="w-full flex justify-center py-8 sm:py-12">
                  <div className="w-full max-w-3xl bg-white/95 rounded-2xl border border-indigo-100 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
                    <div className="border-b border-indigo-50 bg-gradient-to-r from-indigo-50/80 via-slate-50 to-emerald-50/70 px-4 sm:px-5 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-sm font-semibold">
                          {step}
                        </div>
                        <div>
                          <h2 className="text-sm sm:text-base font-semibold text-slate-900">
                            {STEP_LABELS[step - 1]}
                          </h2>
                          <p className="text-[11px] sm:text-xs text-slate-600">
                            Agreement &amp; final signing are completed by the merchant on the Partner Site.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="px-4 sm:px-5 py-4 sm:py-5 space-y-4">
                      <p className="text-sm text-slate-700 leading-relaxed">
                        The merchant completes the <span className="font-semibold">Agreement</span> (Step 8) and{" "}
                        <span className="font-semibold">Sign &amp; Submit</span> (Step 9) on the Partner Site. Once the
                        agreement is accepted, this dashboard will automatically detect the change and move you to the
                        next step.
                      </p>

                      {parentId != null && createdStoreId && (
                        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 px-3 sm:px-4 py-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] sm:text-xs font-semibold text-slate-800">
                              Partner Site link for Agreement &amp; Signing
                            </p>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <code className="flex-1 block text-[11px] sm:text-xs text-slate-900 bg-white rounded-lg border border-indigo-200 px-2 py-1 overflow-x-auto">
                              {`https://partner.gatimitra.com/auth/register-store?parent_id=${parentId}&store_id=${createdStoreId}`}
                            </code>
                            <button
                              type="button"
                              onClick={() => {
                                const url = `https://partner.gatimitra.com/auth/register-store?parent_id=${parentId}&store_id=${createdStoreId}`;
                                const text = [
                                  "Hi 👋",
                                  "",
                                  "Welcome to GatiMitra!",
                                  "",
                                  "To review and accept your agreement, please open the link below:",
                                  "",
                                  `🔗 ${url}`,
                                  "",
                                  "—",
                                  "GatiMitra On-Demand Services Private Limited",
                                  "India’s Leading Low-Cost Delivery Platform",
                                ].join("\n");
                                if (navigator.share) {
                                  navigator
                                    .share({
                                      title: "GatiMitra agreement link",
                                      text,
                                    })
                                    .catch(() => {});
                                } else if (navigator.clipboard?.writeText) {
                                  navigator.clipboard.writeText(text).catch(() => {});
                                }
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-indigo-300 bg-white text-[11px] sm:text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                            >
                              Share link
                            </button>
                          </div>
                          <p className="text-[11px] sm:text-xs text-slate-700">
                            Use this link if the merchant needs to reopen the agreement or signing step.
                          </p>
                        </div>
                      )}

                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:p-3.5">
                        <p className="text-[11px] sm:text-xs text-slate-700">
                          If needed, you can manually refresh this child store&apos;s onboarding status from the AM backend.
                          In most cases this is not required, as the dashboard auto-detects agreement completion.
                        </p>
                        <button
                          type="button"
                          onClick={() => refreshStepFromServer()}
                          disabled={refreshingStepStatus}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] sm:text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {refreshingStepStatus ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                              <span>Refreshing status…</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v6h6M20 20v-6h-6M5 19a9 9 0 0114-7.5M19 5a9 9 0 01-14 7.5" />
                              </svg>
                              <span>Refresh status</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {step === 9 && (
                <div className="w-full flex justify-center py-8 sm:py-12">
                  <div className="w-full max-w-5xl bg-white/95 rounded-2xl border border-indigo-100 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
                    <div className="border-b border-indigo-50 bg-gradient-to-r from-indigo-50/80 via-slate-50 to-emerald-50/70 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-sm font-semibold">
                          9
                        </div>
                        <div>
                          <h2 className="text-sm sm:text-base font-semibold text-slate-900">
                            Review &amp; submit
                          </h2>
                          <p className="text-[11px] sm:text-xs text-slate-600">
                            Final check of onboarding payment and signed agreement for this child store.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                        {/* Payment summary card */}
                        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3 sm:p-4 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-sm font-semibold">
                                ₹
                              </div>
                              <div>
                                <h3 className="text-sm font-semibold text-slate-900">
                                  Onboarding payment
                                </h3>
                                <p className="text-[11px] sm:text-xs text-slate-600">
                                  Amount paid by the store to complete onboarding.
                                </p>
                              </div>
                            </div>
                            {paymentSummary ? (
                              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                                {paymentSummary.status === "captured" ? "Payment completed" : paymentSummary.status}
                              </span>
                            ) : null}
                          </div>

                          {paymentSummary ? (
                            <div className="space-y-2 text-[11px] sm:text-xs text-slate-700">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="text-slate-500">Total onboarding fee</span>
                                <span className="font-semibold text-slate-900">
                                  {`₹${(Number(paymentSummary.amount_paise ?? 0) / 100).toFixed(2)} ${paymentSummary.currency ?? "INR"}`}
                                </span>
                              </div>
                              {paymentSummary.payer_name && (
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="text-slate-500">Paid by</span>
                                  <span className="font-medium text-slate-900">
                                    {paymentSummary.payer_name}
                                  </span>
                                </div>
                              )}
                              {paymentSummary.captured_at && (
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="text-slate-500">Paid on</span>
                                  <span className="font-medium text-slate-900">
                                    {new Date(paymentSummary.captured_at).toLocaleString()}
                                  </span>
                                </div>
                              )}
                              {paymentSummary.plan_name && (
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="text-slate-500">Plan</span>
                                  <span className="font-medium text-slate-900">
                                    {paymentSummary.plan_name}
                                    {paymentSummary.promo_label ? ` (${paymentSummary.promo_label})` : ""}
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-[11px] sm:text-xs text-slate-600">
                              No onboarding payment record was found for this store. If the merchant has just completed
                              the payment, wait a few seconds and click <span className="font-semibold">Refresh status</span> below.
                            </p>
                          )}
                        </div>

                        {/* Agreement summary card */}
                        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-3 sm:p-4 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-sm font-semibold">
                                ✍️
                              </div>
                              <div>
                                <h3 className="text-sm font-semibold text-slate-900">
                                  Agreement &amp; signing
                                </h3>
                                <p className="text-[11px] sm:text-xs text-slate-600">
                                  Details of the agreement accepted by the merchant.
                                </p>
                              </div>
                            </div>
                            {agreementSummary ? (
                              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-800 whitespace-nowrap shadow-[0_0_0_1px_rgba(16,185,129,0.15)]">
                                Agreement accepted
                              </span>
                            ) : null}
                          </div>

                          {agreementSummary ? (
                            <div className="space-y-2 text-[11px] sm:text-xs text-slate-700">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="text-slate-500">Signed by</span>
                                <span className="font-medium text-slate-900">
                                  {agreementSummary.signer_name || "—"}
                                  {agreementSummary.signer_email
                                    ? ` · ${agreementSummary.signer_email}`
                                    : ""}
                                  {agreementSummary.signer_phone
                                    ? ` · ${agreementSummary.signer_phone}`
                                    : ""}
                                </span>
                              </div>
                              {agreementSummary.accepted_at && (
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="text-slate-500">Signed on</span>
                                  <span className="font-medium text-slate-900">
                                    {new Date(agreementSummary.accepted_at).toLocaleString()}
                                  </span>
                                </div>
                              )}
                              {(agreementSummary.template_key || agreementSummary.template_version) && (
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="text-slate-500">Agreement template</span>
                                  <span className="font-medium text-slate-900">
                                    {agreementSummary.template_key || "—"}
                                    {agreementSummary.template_version
                                      ? ` · v${agreementSummary.template_version}`
                                      : ""}
                                  </span>
                                </div>
                              )}
                              {(agreementSummary.commission_first_month_pct != null ||
                                agreementSummary.commission_from_second_month_pct != null) && (
                                <div className="flex flex-col gap-1">
                                  <span className="text-slate-500">Commission terms</span>
                                  <div className="flex flex-wrap gap-1.5">
                                    {agreementSummary.commission_first_month_pct != null && (
                                      <span className="inline-flex items-center rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-slate-800 border border-slate-200">
                                        1st month: {Number(agreementSummary.commission_first_month_pct).toFixed(2)}%
                                      </span>
                                    )}
                                    {agreementSummary.commission_from_second_month_pct != null && (
                                      <span className="inline-flex items-center rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-slate-800 border border-slate-200">
                                        From 2nd month:{" "}
                                        {Number(agreementSummary.commission_from_second_month_pct).toFixed(2)}%
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}
                              {(agreementSummary.agreement_effective_from ||
                                agreementSummary.agreement_effective_to) && (
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="text-slate-500">Agreement period</span>
                                  <span className="font-medium text-slate-900">
                                    {agreementSummary.agreement_effective_from
                                      ? new Date(agreementSummary.agreement_effective_from).toLocaleDateString()
                                      : "Start: —"}
                                    {" → "}
                                    {agreementSummary.agreement_effective_to
                                      ? new Date(agreementSummary.agreement_effective_to).toLocaleDateString()
                                      : "No end date"}
                                  </span>
                                </div>
                              )}
                              {agreementSummary.contract_pdf_url && (
                                <div className="flex items-center justify-between gap-2 pt-1">
                                  <span className="text-slate-500">Signed contract</span>
                                  <a
                                    href={agreementSummary.contract_pdf_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 rounded-md border border-indigo-300 bg-white px-2.5 py-1 text-[11px] sm:text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                                  >
                                    View signed PDF
                                  </a>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-[11px] sm:text-xs text-slate-600">
                              No agreement acceptance record was found for this store. Once the merchant signs on the
                              Partner Site, come back to this step and click <span className="font-semibold">Refresh status</span>.
                            </p>
                          )}
                        </div>
                      </div>

                    </div>
                  </div>
                </div>
              )}

              {step === 10 && (
                <div className="w-full flex justify-center py-8 sm:py-12">
                  <div className="w-full max-w-3xl bg-white/95 rounded-2xl border border-emerald-100 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
                    <div className="border-b border-emerald-50 bg-gradient-to-r from-emerald-50/80 via-slate-50 to-emerald-50/70 px-4 sm:px-5 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-sm font-semibold">
                          ✓
                        </div>
                        <div>
                          <h2 className="text-sm sm:text-base font-semibold text-slate-900 flex items-center gap-2">
                            Onboarding Completed <span aria-hidden="true">🎉</span>
                          </h2>
                          <p className="text-[11px] sm:text-xs text-slate-600">
                            This store has been successfully onboarded on GatiMitra.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="px-4 sm:px-5 py-4 sm:py-5 space-y-4 text-xs sm:text-sm text-slate-700">
                      <div className="rounded-2xl bg-emerald-50/80 border border-emerald-100 px-4 py-3 space-y-1.5">
                        <p className="text-xs sm:text-sm font-medium text-emerald-900">
                          All required steps, including payment and agreement, have been completed.
                        </p>
                        <p className="text-[11px] sm:text-xs text-emerald-800">
                          The store is now under final verification and will be activated within{" "}
                          <span className="font-semibold">24–48 hours</span>.
                        </p>
                        <p className="text-[11px] sm:text-xs text-emerald-800">
                          You can now safely proceed or return to the dashboard.
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Store
                          </p>
                          <p className="font-medium text-slate-900 break-words">
                            {storeDisplayName || storeName || "New child store"}
                          </p>
                          {currentStoreId && (
                            <p className="text-[11px] text-slate-500">
                              Store ID: <span className="font-mono text-slate-800">{currentStoreId}</span>
                            </p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Parent
                          </p>
                          <p className="font-medium text-slate-900 break-words">
                            {parentName || "—"}
                          </p>
                          {parentPid && (
                            <p className="text-[11px] text-slate-500">
                              PID: <span className="font-mono text-slate-800">{parentPid}</span>
                            </p>
                          )}
                        </div>
                      </div>
                      <p className="text-[11px] sm:text-xs text-slate-600">
                        Click <span className="font-semibold">Complete registration</span> below to finish and return to
                        the dashboard when you’re ready.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {!success && (
              <div className="flex-none border-t border-slate-200/80 min-w-0 overflow-x-hidden sticky bottom-0" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 10px)", background: "linear-gradient(180deg, #f6f8fb 0%, #eef2f7 100%)" }}>
                <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 sm:gap-3 px-3 sm:px-6 md:px-8 py-4 min-h-[56px] max-w-full min-w-0">
                  {step > 1 && (
                    <button type="button" onClick={() => prevStep()} disabled={actionLoading} className="px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-100 font-medium disabled:opacity-60 inline-flex items-center gap-1.5 sm:gap-2 shrink-0">
                      {actionLoading ? <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" /> : null} ← Previous
                    </button>
                  )}
                  {step === 10 ? (
                    <button
                      type="button"
                      onClick={() => setSuccess(true)}
                      className="px-4 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium inline-flex items-center gap-2 shrink-0"
                    >
                      Complete registration
                    </button>
                  ) : step !== 7 && step !== 8 ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (step === 9) {
                          setSuccess(true);
                        } else {
                          void nextStep();
                        }
                      }}
                      disabled={actionLoading || mediaUploading || (step === 4 && !step4RequiredValid)}
                      className="px-4 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50 inline-flex items-center gap-1.5 sm:gap-2 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {actionLoading ? (
                        <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                      ) : (
                        <svg
                          className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M14 5l7 7m0 0l-7 7m7-7H3"
                          />
                        </svg>
                      )}
                      {actionLoading
                        ? "Saving…"
                        : step === 6
                        ? "Continue to plans"
                        : step === 9
                        ? "Complete registration"
                        : step === 4 && step4Section === "AADHAAR"
                        ? "Skip / Save & Continue"
                        : "Save & Continue"}
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {confirmModal ? (
        <div className="fixed inset-0 z-[2300] flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white shadow-xl border border-amber-200">
            <div className="px-4 py-3 border-b border-amber-100 flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-lg">
                !
              </div>
              <h2 className="text-sm sm:text-base font-semibold text-slate-800">
                {confirmModal.title}
              </h2>
            </div>
            <div className="px-4 py-3 text-xs sm:text-sm text-slate-700">
              {confirmModal.message}
            </div>
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  confirmModal.onCancel?.();
                  setConfirmModal(null);
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-60"
                disabled={confirmLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!confirmModal || confirmLoading) return;
                  try {
                    setConfirmLoading(true);
                    await Promise.resolve(confirmModal.onConfirm());
                  } finally {
                    setConfirmLoading(false);
                    setConfirmModal(null);
                  }
                }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs sm:text-sm font-medium hover:bg-indigo-700 cursor-pointer disabled:opacity-70"
                disabled={confirmLoading}
              >
                {confirmLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{confirmModal.confirmLabel ?? "Confirm"}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {success && (
        <div className="fixed inset-0 z-[2600] flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-emerald-200/80">
            <div className="px-6 pt-6 pb-4 border-b border-emerald-100 flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500 text-white flex items-center justify-center text-2xl">
                ✓
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-semibold text-slate-900 flex items-center gap-2">
                  Onboarding Completed <span aria-hidden="true">🎉</span>
                </h2>
                <p className="text-xs sm:text-sm text-slate-600">
                  This store has been successfully onboarded on GatiMitra.
                </p>
              </div>
            </div>
            <div className="px-6 py-4 space-y-3 text-xs sm:text-sm text-slate-700">
              <div className="rounded-2xl bg-emerald-50/80 border border-emerald-100 px-4 py-3 space-y-1.5">
                <p className="text-xs sm:text-sm font-medium text-emerald-900">
                  All required steps, including payment and agreement, have been completed.
                </p>
                <p className="text-[11px] sm:text-xs text-emerald-800">
                  The store is now under final verification and will be activated within{" "}
                  <span className="font-semibold">24–48 hours</span>.
                </p>
                <p className="text-[11px] sm:text-xs text-emerald-800">
                  You can now safely proceed or return to the dashboard.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Store
                  </p>
                  <p className="font-medium text-slate-900 break-words">
                    {storeDisplayName || storeName || "New child store"}
                  </p>
                  {currentStoreId && (
                    <p className="text-[11px] text-slate-500">
                      Store ID: <span className="font-mono text-slate-800">{currentStoreId}</span>
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Parent
                  </p>
                  <p className="font-medium text-slate-900 break-words">
                    {parentName || "—"}
                  </p>
                  {parentPid && (
                    <p className="text-[11px] text-slate-500">
                      PID: <span className="font-mono text-slate-800">{parentPid}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="px-6 pb-5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  try {
                    window.close();
                    // Fallback: if tab cannot be closed programmatically, send user to dashboard.
                    setTimeout(() => {
                      router.push("/dashboard/area-managers/stores");
                    }, 300);
                  } catch {
                    router.push("/dashboard/area-managers/stores");
                  }
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
              >
                Close and go to dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {showPaymentRefreshPrompt && (
        <div className="fixed inset-0 z-[2400] flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white shadow-xl border border-emerald-200">
            <div className="px-4 py-3 border-b border-emerald-100 flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-lg">
                ✅
              </div>
              <h2 className="text-sm sm:text-base font-semibold text-slate-800">
                Payment Successful
              </h2>
            </div>
            <div className="px-4 py-3 text-xs sm:text-sm text-slate-700 space-y-2">
              <p>The onboarding payment has been completed.</p>
              <p>You can now move to the next step.</p>
            </div>
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPaymentRefreshPrompt(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPaymentRefreshPrompt(false);
                  // When payment is confirmed (step 7), always land on step 8
                  setStep(8);
                }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs sm:text-sm font-medium hover:bg-emerald-700 cursor-pointer"
              >
                Move to next step
              </button>
            </div>
          </div>
        </div>
      )}

      {showAgreementRefreshPrompt && (
        <div className="fixed inset-0 z-[2400] flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white shadow-xl border border-emerald-200">
            <div className="px-4 py-3 border-b border-emerald-100 flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-lg">
                ✅
              </div>
              <h2 className="text-sm sm:text-base font-semibold text-slate-800">
                Agreement Successful
              </h2>
            </div>
            <div className="px-4 py-3 text-xs sm:text-sm text-slate-700 space-y-2">
              <p>The agreement has been accepted and completed.</p>
              <p>You can now move to the next step.</p>
            </div>
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAgreementRefreshPrompt(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAgreementRefreshPrompt(false);
                  // When agreement is confirmed (step 8), always land on step 9
                  setStep(9);
                }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs sm:text-sm font-medium hover:bg-emerald-700 cursor-pointer"
              >
                Move to next step
              </button>
            </div>
          </div>
        </div>
      )}

      {showSignRefreshPrompt && (
        <div className="fixed inset-0 z-[2400] flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white shadow-xl border border-emerald-200">
            <div className="px-4 py-3 border-b border-emerald-100 flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-lg">
                ✅
              </div>
              <h2 className="text-sm sm:text-base font-semibold text-slate-800">
                Sign & Submit Successful
              </h2>
            </div>
            <div className="px-4 py-3 text-xs sm:text-sm text-slate-700 space-y-2">
              <p>The sign & submit step has been completed.</p>
              <p>Please refresh the page to continue to the next step.</p>
            </div>
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSignRefreshPrompt(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSignRefreshPrompt(false);
                  router.refresh();
                }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs sm:text-sm font-medium hover:bg-emerald-700 cursor-pointer"
              >
                Refresh page
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}