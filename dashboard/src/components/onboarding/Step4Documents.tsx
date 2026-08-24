"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  DigilockerConsentSheet,
  openDigilockerLoadingPopup,
} from "@/components/onboarding/DigilockerConsentSheet";
import {
  isMaskedAadhaar,
  maskAadhaarNumber,
  normalizeAadhaarVerifiedDetails,
} from "@/lib/mask-aadhaar";
import {
  pickBankFetchedInfo,
  pickGstFetchedBusinessInfo,
  pickPanFetchedInfo,
  flattenPanVerifiedData,
  pickUpiFetchedInfo,
} from "@/lib/merchant-doc-auto-verification";
import { useMerchantStoreDocumentRequirements } from "@/hooks/useMerchantStoreDocumentRequirements";
import {
  coerceToNavCode,
  formSectionOf,
  hasDoc,
  isDocMandatory,
  onboardingNavDocs,
  PHARMA_DOC_CODES,
  resolveMerchantDocs,
  shortDocNavLabel,
  showPharmaLicence,
  storeTypeDocsSidebarHint,
} from "@/lib/merchant-onboarding-docs";

/** Cashfree DigiLocker requires redirect_url to start with https://. */
function digilockerRedirectUrl(): string {
  if (typeof window === "undefined") {
    return "https://control.gatimitra.com/dashboard/digilocker-return";
  }
  try {
    const u = new URL("/dashboard/digilocker-return", window.location.origin);
    u.protocol = "https:";
    // Same-tab / mobile fallback: bounce back to this exact Step 4 page after consent.
    u.searchParams.set("return", window.location.href);
    return u.toString();
  } catch {
    return "https://control.gatimitra.com/dashboard/digilocker-return";
  }
}

export type Step4Patch = {
  pan_number?: string;
  pan_holder_name?: string;
  pan_is_verified?: boolean;
  pan_verified_at?: string | null;
  pan_verification_method?: string | null;
  pan_verified_details?: Record<string, unknown> | null;
  aadhar_number?: string;
  aadhar_holder_name?: string;
  aadhaar_is_verified?: boolean;
  aadhaar_verified_at?: string | null;
  aadhaar_verification_method?: string | null;
  aadhaar_verified_details?: Record<string, unknown> | null;
  gst_number?: string;
  gst_is_verified?: boolean;
  gst_verified_at?: string | null;
  gst_verification_method?: string | null;
  gst_verified_details?: Record<string, unknown> | null;
  gst_legal_business_name?: string;
  gst_principal_place_of_business?: string;
  gst_effective_registration_date?: string;
  fssai_number?: string;
  fssai_expiry_date?: string;
  drug_license_number?: string;
  drug_license_expiry_date?: string;
  pharmacist_registration_number?: string;
  pharmacist_certificate_expiry_date?: string;
  trade_license_number?: string;
  shop_establishment_number?: string;
  udyam_number?: string;
  trade_license_expiry_date?: string;
  shop_establishment_expiry_date?: string;
  pharmacist_certificate_number?: string;
  pharmacy_council_registration_number?: string;
  pharmacy_council_registration_type?: string;
  bank_proof_number?: string;
  other_document_number?: string;
  other_document_type?: string;
  other_expiry_date?: string;
  bank_account_holder_name?: string;
  bank_account_number?: string;
  bank_ifsc_code?: string;
  bank_name?: string;
  bank_branch_name?: string;
  bank_account_type?: string;
  bank_proof_type?: string;
  bank_is_verified?: boolean;
  bank_verified_at?: string | null;
  bank_verification_method?: string | null;
  bank_verified_details?: Record<string, unknown> | null;
  upi_id?: string;
  upi_verified?: boolean;
  upi_verified_details?: Record<string, unknown> | null;
  payout_method?: string;
  bank_proof_file_url?: string;
  upi_qr_screenshot_url?: string;
};

/** Catalog document code (PAN, FSSAI, TRADE_LICENSE, …) or a legacy form-section key. */
export type Step4SectionKey = string;

interface Step4DocumentsProps {
  onPatchChange?: (patch: Step4Patch) => void;
  storeType?: string | null;
  storeInternalId?: number | null;
  storePublicId?: string | null;
  /** When provided, section is controlled by parent (e.g. for Save & Continue → next section). */
  section?: Step4SectionKey;
  onSectionChange?: (section: Step4SectionKey) => void;
  /** Initial values loaded from progress/documents so reload + AM flow show same state. */
  initialForm?: Step4Patch | null;
  /** Initial document preview URLs keyed by local doc type (pan, aadhaar_front, gst, fssai, drug_license, bank_proof, other). */
  initialDocUrls?: Record<string, string> | null;
  /** Notify parent when current subsection requirements are valid (gates Save & Continue). */
  onRequiredValidChange?: (valid: boolean) => void;
  /** Notify parent when DigiLocker Aadhaar verify is in-flight (blocks Skip). */
  onDigilockerInFlightChange?: (inFlight: boolean) => void;
  /** Partnersite-style footer: Previous within docs subsections / back to step 3. */
  onPrevious?: () => void;
  /** Partnersite-style footer: Save & Continue for current subsection. */
  onContinue?: () => void;
  /** Visible Step 4 subsections for the selected store type (from Super Admin catalog). */
  onVisibleSectionsChange?: (sections: Step4SectionKey[]) => void;
  actionLoading?: boolean;
  continueDisabled?: boolean;
  continueLabel?: string;
}

const Step4Documents: React.FC<Step4DocumentsProps> = ({
  onPatchChange,
  storeType,
  storeInternalId,
  storePublicId,
  section: sectionProp,
  onSectionChange,
  initialForm,
  initialDocUrls,
  onRequiredValidChange,
  onDigilockerInFlightChange,
  onPrevious,
  onContinue,
  onVisibleSectionsChange,
  actionLoading = false,
  continueDisabled = false,
  continueLabel = "Save & Continue",
}) => {
  const [sectionInternal, setSectionInternal] = useState<Step4SectionKey>("PAN");
  const sectionRaw = sectionProp ?? sectionInternal;
  const upperStoreType = (storeType || "").toUpperCase();
  const { docs: fetchedDocs, loaded: catalogLoaded, fetchFailed: catalogFetchFailed } =
    useMerchantStoreDocumentRequirements(storeType);
  const resolvedDocs = useMemo(
    () => resolveMerchantDocs(fetchedDocs, upperStoreType),
    [fetchedDocs, upperStoreType]
  );
  const navDocs = useMemo(() => onboardingNavDocs(resolvedDocs), [resolvedDocs]);
  const hasFssaiDoc = hasDoc(resolvedDocs, "FSSAI");
  const section = coerceToNavCode(sectionRaw, navDocs);
  const activeFormSection = formSectionOf(resolvedDocs, section);
  const isPharmaStoreType = showPharmaLicence(resolvedDocs);
  const panIsMandatory = isDocMandatory(resolvedDocs, "PAN");
  const aadhaarIsMandatory = isDocMandatory(resolvedDocs, "AADHAAR");
  const gstIsMandatory = isDocMandatory(resolvedDocs, "GST");
  const bankIsMandatory =
    isDocMandatory(resolvedDocs, "BANK_PROOF") || isDocMandatory(resolvedDocs, "BANK");
  const fssaiIsMandatory = isDocMandatory(resolvedDocs, "FSSAI");
  const tradeIsMandatory = isDocMandatory(resolvedDocs, "TRADE_LICENSE");
  const shopIsMandatory = isDocMandatory(resolvedDocs, "SHOP_ACT");
  const udyamIsMandatory = isDocMandatory(resolvedDocs, "UDYAM");
  const step4SectionOrder: Step4SectionKey[] = navDocs.map((d) => d.code);
  // Sidebar may only open sections already reached via Save & Continue (not skip ahead).
  const [maxReachedSectionIdx, setMaxReachedSectionIdx] = useState(0);
  useEffect(() => {
    const idx = step4SectionOrder.indexOf(section);
    if (idx >= 0) {
      setMaxReachedSectionIdx((prev) => Math.max(prev, idx));
    }
  }, [section]);
  const setSection = (s: Step4SectionKey) => {
    if (onSectionChange) onSectionChange(s);
    else setSectionInternal(s);
  };
  const goToSectionFromSidebar = (s: Step4SectionKey) => {
    const idx = step4SectionOrder.indexOf(s);
    if (idx > maxReachedSectionIdx) return;
    setSection(s);
  };

  useEffect(() => {
    onVisibleSectionsChange?.(step4SectionOrder);
  }, [onVisibleSectionsChange, step4SectionOrder.join("|")]);

  useEffect(() => {
    if (step4SectionOrder.length === 0) return;
    const coerced = coerceToNavCode(sectionRaw, navDocs);
    if (coerced !== sectionRaw) {
      setSection(coerced);
    }
  }, [sectionRaw, step4SectionOrder.join("|")]);

  const [form, setForm] = useState<Step4Patch>({
    pan_number: "",
    pan_holder_name: "",
    pan_is_verified: false,
    aadhar_number: "",
    aadhar_holder_name: "",
    gst_number: "",
    gst_is_verified: false,
    fssai_number: "",
  fssai_expiry_date: "",
    drug_license_number: "",
    drug_license_expiry_date: "",
    pharmacist_registration_number: "",
    pharmacist_certificate_expiry_date: "",
    trade_license_number: "",
    shop_establishment_number: "",
    udyam_number: "",
    trade_license_expiry_date: "",
    shop_establishment_expiry_date: "",
    pharmacist_certificate_number: "",
    pharmacy_council_registration_number: "",
    pharmacy_council_registration_type: "",
    bank_proof_number: "",
    other_document_number: "",
    other_document_type: "",
    other_expiry_date: "",
    bank_account_holder_name: "",
    bank_account_number: "",
    bank_ifsc_code: "",
    bank_name: "",
    bank_branch_name: "",
    bank_account_type: "",
    bank_proof_type: "",
    bank_is_verified: false,
    upi_id: "",
    upi_verified: false,
    upi_verified_details: null,
    payout_method: "bank",
    bank_proof_file_url: "",
    upi_qr_screenshot_url: "",
  });

  type DocVerifyState = {
    state: "idle" | "verifying" | "verified" | "failed" | "manual";
    details?: Record<string, unknown>;
    error?: string;
  };
  const [docModes, setDocModes] = useState<Record<string, string>>({});
  const [panVerify, setPanVerify] = useState<DocVerifyState>({ state: "idle" });
  const [gstVerify, setGstVerify] = useState<DocVerifyState>({ state: "idle" });
  const [bankVerify, setBankVerify] = useState<DocVerifyState>({ state: "idle" });
  const [upiVerify, setUpiVerify] = useState<DocVerifyState>({ state: "idle" });
  const [aadhaarVerify, setAadhaarVerify] = useState<
    DocVerifyState & { pending?: boolean; digilockerUrl?: string }
  >({
    state: "idle",
  });
  const panVerifiedNumberRef = useRef<string | null>(null);
  const panVerifiedDetailsRef = useRef<Record<string, unknown> | null>(null);
  const gstVerifiedNumberRef = useRef<string | null>(null);
  const gstVerifiedDetailsRef = useRef<Record<string, unknown> | null>(null);
  const bankVerifiedKeyRef = useRef<string | null>(null);
  const bankVerifiedDetailsRef = useRef<Record<string, unknown> | null>(null);
  const upiVerifiedKeyRef = useRef<string | null>(null);
  const upiVerifiedDetailsRef = useRef<Record<string, unknown> | null>(null);
  const aadhaarVerifiedNumberRef = useRef<string | null>(null);
  const aadhaarVerifiedDetailsRef = useRef<Record<string, unknown> | null>(null);
  const aadhaarPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const digilockerPopupRef = useRef<Window | null>(null);

  const panMode = (docModes.pan as "manual" | "auto" | "hybrid" | "disabled") || "manual";
  const gstMode = (docModes.gstin as "manual" | "auto" | "hybrid" | "disabled") || "manual";
  const aadhaarMode =
    (docModes.aadhaar_digilocker as "manual" | "auto" | "hybrid" | "disabled") ||
    (docModes.aadhaar as "manual" | "auto" | "hybrid" | "disabled") ||
    "manual";
  const bankMode =
    (docModes.bank_account as "manual" | "auto" | "hybrid" | "disabled") ||
    (docModes.bank as "manual" | "auto" | "hybrid" | "disabled") ||
    "manual";
  const upiMode =
    (docModes.upi_penny_drop as "manual" | "auto" | "hybrid" | "disabled") ||
    (docModes.upi as "manual" | "auto" | "hybrid" | "disabled") ||
    bankMode;
  const isElectronic = (m: string) => m === "auto" || m === "hybrid";
  const uploadAllowedFor = (mode: string, vs: DocVerifyState) => {
    if (!isElectronic(mode)) return true;
    if (vs.state === "manual" || vs.state === "failed") return true;
    return false;
  };

  useEffect(() => {
    fetch("/api/onboarding/verification-modes", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.modes) setDocModes(d.modes as Record<string, string>);
      })
      .catch(() => {});
  }, []);

  // Hydrate form once when initialForm is provided (e.g. from Partner Site or saved AM progress)
  useEffect(() => {
    if (initialForm) {
      setForm((prev) => {
        const merged = { ...prev, ...initialForm };
        if (initialForm.pan_is_verified && initialForm.pan_number) {
          const flattened = flattenPanVerifiedData(
            (initialForm.pan_verified_details as Record<string, unknown>) || {
              pan_status: "VALID",
            },
          );
          const registered = pickPanFetchedInfo(flattened).registered_name || "";
          merged.pan_verified_details = flattened;
          if (registered && !String(merged.pan_holder_name || "").trim()) {
            merged.pan_holder_name = registered;
          }
        }
        return merged;
      });
      if (initialForm.payout_method) {
        const method = initialForm.payout_method.toLowerCase();
        setPayoutMode(method === "upi" ? "UPI" : "BANK");
      }
      if (initialForm.pan_is_verified && initialForm.pan_number) {
        const panNum = initialForm.pan_number.trim().toUpperCase();
        panVerifiedNumberRef.current = panNum;
        const details = flattenPanVerifiedData(
          (initialForm.pan_verified_details as Record<string, unknown>) || {
            pan_status: "VALID",
          },
        );
        if (
          !String(details.registered_name ?? "").trim() &&
          String(initialForm.pan_holder_name ?? "").trim()
        ) {
          details.registered_name = String(initialForm.pan_holder_name).trim();
        }
        panVerifiedDetailsRef.current = details;
        setPanVerify({
          state: "verified",
          details,
        });
      }
      if (initialForm.gst_is_verified && initialForm.gst_number) {
        const gstNum = initialForm.gst_number.trim().toUpperCase();
        gstVerifiedNumberRef.current = gstNum;
        const details = {
          ...((initialForm.gst_verified_details as Record<string, unknown>) || {}),
        };
        const gstInfo = pickGstFetchedBusinessInfo({
          ...details,
          gst_legal_business_name: initialForm.gst_legal_business_name,
          gst_principal_place_of_business: initialForm.gst_principal_place_of_business,
          gst_effective_registration_date: initialForm.gst_effective_registration_date,
        });
        if (gstInfo.legal_business_name) details.legal_name_of_business = gstInfo.legal_business_name;
        if (gstInfo.principal_place_of_business) {
          details.principal_place_address = gstInfo.principal_place_of_business;
        }
        if (gstInfo.effective_registration_date) {
          details.date_of_registration = gstInfo.effective_registration_date;
        }
        gstVerifiedDetailsRef.current = details;
        setGstVerify({
          state: "verified",
          details,
        });
      }
      if (initialForm.bank_is_verified || initialForm.upi_verified) {
        if (initialForm.bank_is_verified) {
          const acc = String(initialForm.bank_account_number || "").replace(/\D/g, "");
          const ifsc = String(initialForm.bank_ifsc_code || "").trim().toUpperCase();
          bankVerifiedKeyRef.current = acc && ifsc ? `${acc}|${ifsc}` : null;
          const details = {
            ...((initialForm.bank_verified_details as Record<string, unknown>) || {}),
          };
          const bankInfo = pickBankFetchedInfo(details);
          if (bankInfo.name_at_bank) details.name_at_bank = bankInfo.name_at_bank;
          if (bankInfo.bank_name) details.bank_name = bankInfo.bank_name;
          if (bankInfo.branch_name) details.branch_name = bankInfo.branch_name;
          if (bankInfo.account_type) details.account_type = bankInfo.account_type;
          if (bankInfo.account_status) details.account_status = bankInfo.account_status;
          bankVerifiedDetailsRef.current = details;
          setBankVerify({
            state: "verified",
            details,
          });
        }
        if (initialForm.upi_verified) {
          const vpa = String(initialForm.upi_id || "").trim().toLowerCase();
          upiVerifiedKeyRef.current = vpa || null;
          const details = {
            ...((initialForm.upi_verified_details as Record<string, unknown>) ||
              (!(initialForm.bank_is_verified)
                ? ((initialForm.bank_verified_details as Record<string, unknown>) || {})
                : {})),
          };
          const upiInfo = pickUpiFetchedInfo(details);
          if (upiInfo.name_at_bank) details.name_at_bank = upiInfo.name_at_bank;
          if (upiInfo.account_status) details.account_status = upiInfo.account_status;
          upiVerifiedDetailsRef.current = details;
          setUpiVerify({ state: "verified", details });
        }
      }
      if (initialForm.aadhaar_is_verified) {
        const raw = String(initialForm.aadhar_number || "");
        const aNum = raw.replace(/\D/g, "");
        // Keep last-4 / masked ref so reload of XXXX-XXXX-8244 doesn't clear verified UI.
        aadhaarVerifiedNumberRef.current =
          aNum || maskAadhaarNumber(raw) || "verified";
        const details: Record<string, unknown> = {
          ...((initialForm.aadhaar_verified_details as Record<string, unknown> | null) ||
            {}),
        };
        if (
          !details.name &&
          !details.full_name &&
          !details.registered_name &&
          initialForm.aadhar_holder_name
        ) {
          details.name = String(initialForm.aadhar_holder_name);
        }
        if (
          !details.aadhaar_number &&
          !details.masked_aadhaar &&
          !details.uid &&
          raw
        ) {
          details.masked_aadhaar = maskAadhaarNumber(raw);
        }
        setAadhaarVerify({
          state: "verified",
          details,
        });
        aadhaarVerifiedDetailsRef.current = details;
      }
    }
  }, [initialForm]);
  const [err, setErr] = useState<string | null>(null);
  const [uploadingDocType, setUploadingDocType] = useState<
    | null
    | "pan"
    | "aadhaar_front"
    | "aadhaar_back"
    | "gst"
    | "fssai"
    | "drug_license"
    | "trade_license"
    | "shop_establishment"
    | "udyam"
    | "pharmacist_certificate"
    | "pharmacy_council_registration"
    | "bank_proof"
    | "other"
  >(null);

  const licenceDupReqRef = useRef(0);
  const [payoutMode, setPayoutMode] = useState<"BANK" | "UPI">("BANK");
  /** Instant DB uniqueness for FSSAI / Drug Licence. */
  const [licenceDup, setLicenceDup] = useState<{
    fssai: string;
    drug: string;
    checkingFssai: boolean;
    checkingDrug: boolean;
    fssaiOk: boolean;
    drugOk: boolean;
  }>({
    fssai: "",
    drug: "",
    checkingFssai: false,
    checkingDrug: false,
    fssaiOk: false,
    drugOk: false,
  });

  // Keep payout_method in sync with local payoutMode
  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      payout_method: payoutMode === "UPI" ? "upi" : "bank",
    }));
  }, [payoutMode]);

  // Local format validation for document numbers (PAN, Aadhaar, GST, FSSAI, Drug Licence, other licences)
  const documentFormatValidators = {
    pan: (v: string) =>
      /^[A-Z]{5}[0-9]{4}[A-Z]$/.test((v || "").replace(/\s/g, ""))
        ? ""
        : "Invalid PAN. Format: 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F)",
    aadhar: (v: string) => {
      const raw = (v || "").trim();
      if (isMaskedAadhaar(raw)) return "";
      return /^\d{12}$/.test(raw.replace(/\s/g, ""))
        ? ""
        : "Invalid Aadhaar. Must be exactly 12 digits";
    },
    fssai: (v: string) =>
      /^\d{14}$/.test((v || "").replace(/\s/g, ""))
        ? ""
        : "Invalid FSSAI. Must be 14 digits",
    gst: (v: string) => {
      const s = (v || "").replace(/\s/g, "").toUpperCase();
      if (!s) return "";
      return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(s)
        ? ""
        : "Invalid GSTIN. Format: 2 digit state + 10 char PAN + 2 digit entity + Z + 1 char (15 chars total)";
    },
    // Drug licence: different states have different formats – basic non-empty + min length check
    drug: (v: string) =>
      (v || "").trim().length >= 5 ? "" : "Invalid Drug Licence. Please check the number.",
    trade: (v: string) => {
      const s = (v || "").trim().toUpperCase();
      return /^(?=.*[A-Z])[A-Z0-9\/-]{8,20}$/.test(s)
        ? ""
        : "Invalid format. Please enter a valid document number.";
    },
    shop: (v: string) => {
      const s = (v || "").trim().toUpperCase();
      return /^(?=.*[A-Z])[A-Z0-9\/-]{8,20}$/.test(s)
        ? ""
        : "Invalid format. Please enter a valid document number.";
    },
    udyam: (v: string) => {
      const s = (v || "").trim().toUpperCase();
      return /^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/.test(s)
        ? ""
        : "Invalid format. Please enter a valid document number.";
    },
    otherDoc: (v: string) =>
      (v || "").trim().length >= 5
        ? ""
        : "Invalid document number. Minimum 5 characters.",
    ifsc: (v: string) =>
      /^[A-Z]{4}0[A-Z0-9]{6}$/.test((v || "").replace(/\s/g, "").toUpperCase())
        ? ""
        : "Invalid IFSC. Format: 4 letters, 0, 6 alphanumeric (e.g. SBIN0001234)",
    accountNumber: (v: string) =>
      /^\d{9,18}$/.test((v || "").replace(/\s/g, ""))
        ? ""
        : "Invalid account number. Must be 9–18 digits",
  };

  const [docFormatErrors, setDocFormatErrors] = useState<{
    pan_number?: string;
    aadhar_number?: string;
    gst_number?: string;
    fssai_number?: string;
    drug_license_number?: string;
    trade_license_number?: string;
    shop_establishment_number?: string;
    udyam_number?: string;
    other_document_number?: string;
    bank_account_number?: string;
    bank_ifsc_code?: string;
  }>({});

  // Instant FSSAI / Drug Licence duplicate check against DB
  useEffect(() => {
    const fssai = (form.fssai_number || "").replace(/\D/g, "");
    const drug = (form.drug_license_number || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
    const reqId = ++licenceDupReqRef.current;
    const timers: Array<ReturnType<typeof setTimeout>> = [];

    const applyResult = (kind: "fssai" | "drug", msg: string, checked: boolean) => {
      const ok = checked && !msg;
      setLicenceDup((prev) => {
        if (kind === "fssai") {
          if (prev.fssai === msg && prev.checkingFssai === false && prev.fssaiOk === ok) {
            return prev;
          }
          return { ...prev, fssai: msg, checkingFssai: false, fssaiOk: ok };
        }
        if (prev.drug === msg && prev.checkingDrug === false && prev.drugOk === ok) {
          return prev;
        }
        return { ...prev, drug: msg, checkingDrug: false, drugOk: ok };
      });
      setDocFormatErrors((prev) => {
        const key = kind === "fssai" ? "fssai_number" : "drug_license_number";
        const prevMsg = prev[key] || "";
        const wasDup =
          prevMsg.includes("already registered") ||
          prevMsg.includes("Duplicates are not allowed");
        if (msg) {
          if (prevMsg === msg) return prev;
          return { ...prev, [key]: msg };
        }
        if (wasDup) return { ...prev, [key]: "" };
        return prev;
      });
    };

    const runCheck = (kind: "fssai" | "drug", number: string, ready: boolean) => {
      if (!ready) {
        applyResult(kind, "", false);
        return;
      }
      setLicenceDup((prev) => {
        if (kind === "fssai") {
          if (prev.checkingFssai) return prev;
          return { ...prev, checkingFssai: true, fssaiOk: false };
        }
        if (prev.checkingDrug) return prev;
        return { ...prev, checkingDrug: true, drugOk: false };
      });
      timers.push(
        setTimeout(async () => {
          try {
            const params = new URLSearchParams({ kind, number });
            if (storeInternalId != null && Number.isFinite(storeInternalId)) {
              params.set("storeInternalId", String(storeInternalId));
            } else if ((storePublicId || "").trim()) {
              params.set("storePublicId", String(storePublicId).trim());
            }
            const res = await fetch(
              `/api/onboarding/check-licence-duplicate?${params.toString()}`,
              { credentials: "include" },
            );
            const data = await res.json().catch(() => ({}));
            if (licenceDupReqRef.current !== reqId) return;
            applyResult(
              kind,
              data?.duplicate === true
                ? String(
                    data.message ||
                      (kind === "fssai"
                        ? "This FSSAI number is already registered. Duplicates are not allowed."
                        : "This Drug Licence number is already registered. Duplicates are not allowed."),
                  )
                : "",
              data?.checked === true || data?.duplicate === false,
            );
          } catch {
            if (licenceDupReqRef.current !== reqId) return;
            setLicenceDup((prev) => ({
              ...prev,
              ...(kind === "fssai"
                ? { checkingFssai: false, fssaiOk: false }
                : { checkingDrug: false, drugOk: false }),
            }));
          }
        }, 450),
      );
    };

    runCheck(
      "fssai",
      fssai,
      fssai.length === 14 && hasFssaiDoc,
    );
    runCheck("drug", drug, drug.length >= 5 && isPharmaStoreType);

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [
    form.fssai_number,
    form.drug_license_number,
    storeInternalId,
    storePublicId,
    hasFssaiDoc,
    isPharmaStoreType,
  ]);

  // Local previews for uploaded files (object URLs or server URLs), keyed by doc type.
  const [docPreviews, setDocPreviews] = useState<Record<string, string>>(
    () => initialDocUrls ?? {} // hydrate from existing document URLs on first render
  );

  // If parent passes new initialDocUrls later (e.g. after async load), merge them in.
  useEffect(() => {
    if (!initialDocUrls || Object.keys(initialDocUrls).length === 0) return;
    setDocPreviews((prev) => ({ ...initialDocUrls, ...prev }));
  }, [initialDocUrls]);

  const getFileNameFromUrl = (url: string | undefined) => {
    if (!url) return "";
    try {
      const u = new URL(url, typeof window !== "undefined" ? window.location.origin : "https://example.com");
      const parts = u.pathname.split("/");
      return parts[parts.length - 1] || "";
    } catch {
      const parts = url.split("/");
      return parts[parts.length - 1] || "";
    }
  };

  const panInputRef = useRef<HTMLInputElement | null>(null);
  const aadhaarFrontInputRef = useRef<HTMLInputElement | null>(null);
  const aadhaarBackInputRef = useRef<HTMLInputElement | null>(null);
  type ReplaceTarget = null | "pan" | "aadhaar_front" | "aadhaar_back";
  const [replaceTarget, setReplaceTarget] = useState<ReplaceTarget>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name } = e.target;
    let { value } = e.target;

    // Normalise inputs: trim spaces, uppercase where applicable, restrict chars
    if (
      name === "trade_license_number" ||
      name === "shop_establishment_number" ||
      name === "other_document_number"
    ) {
      value = value.toUpperCase().replace(/[^A-Z0-9\/-]/g, "");
    } else if (name === "udyam_number") {
      // Auto-format UDYAM number as: UDYAM-XX-00-0000000 while user types
      const raw = value.toUpperCase();
      // Remove everything except letters and digits for processing
      let cleaned = raw.replace(/[^A-Z0-9]/g, "");

      if (!cleaned.startsWith("UDYAM")) {
        // Before "UDYAM" is fully typed, just keep it uppercased and basic cleaned
        value = raw.replace(/[^A-Z0-9-]/g, "");
      } else {
        // Strip prefix and rebuild with hyphens
        const prefix = "UDYAM";
        const rest = cleaned.slice(prefix.length); // remaining after UDYAM

        const partState = rest.slice(0, 2); // state code (letters)
        const partDistrict = rest.slice(2, 4); // 2 digits
        const partSequence = rest.slice(4, 11); // 7 digits

        let formatted = prefix;
        if (partState) {
          formatted += `-${partState}`;
        }
        if (partDistrict) {
          formatted += `-${partDistrict}`;
        }
        if (partSequence) {
          formatted += `-${partSequence}`;
        }

        value = formatted;
      }
    } else if (name === "gst_number" || name === "pan_number") {
      value = value.toUpperCase();
    } else if (name === "aadhar_number") {
      value = isMaskedAadhaar(value)
        ? value.trim().toUpperCase()
        : value.replace(/\D/g, "").slice(0, 12);
    } else if (name === "bank_ifsc_code") {
      value = value.toUpperCase().replace(/\s/g, "").slice(0, 11);
    } else if (name === "bank_account_number") {
      value = value.replace(/\D/g, "").slice(0, 18);
    }

    const trimmedValue = value.trim();

    // For "name" style free-text inputs, we must not aggressively `trim()` on every
    // keystroke, otherwise the spacebar insertion disappears (e.g. "First " -> "First").
    // Document-number fields can stay strict/trimmed.
    const shouldPreserveInnerSpaces =
      name === "bank_account_holder_name" ||
      name === "bank_name" ||
      name === "bank_branch_name" ||
      name === "pan_holder_name" ||
      name === "aadhar_holder_name";

    const valueToStore = shouldPreserveInnerSpaces
      ? value.replace(/\s+/g, " ").replace(/^\s+/, "")
      : trimmedValue;

    setForm((prev) => {
      return { ...prev, [name]: valueToStore };
    });

    // Per-field live format validation (only for document number fields)
    if (name === "pan_number") {
      setDocFormatErrors((prev) => ({
        ...prev,
        pan_number: trimmedValue
          ? documentFormatValidators.pan(trimmedValue.toUpperCase())
          : "",
      }));
    } else if (name === "aadhar_number") {
      setDocFormatErrors((prev) => ({
        ...prev,
        aadhar_number: valueToStore
          ? documentFormatValidators.aadhar(valueToStore)
          : "",
      }));
    } else if (name === "gst_number") {
      setDocFormatErrors((prev) => ({
        ...prev,
        gst_number: trimmedValue ? documentFormatValidators.gst(trimmedValue) : "",
      }));
    } else if (name === "fssai_number") {
      setDocFormatErrors((prev) => ({
        ...prev,
        fssai_number: trimmedValue ? documentFormatValidators.fssai(trimmedValue) : "",
      }));
    } else if (name === "drug_license_number") {
      setDocFormatErrors((prev) => ({
        ...prev,
        drug_license_number: trimmedValue
          ? documentFormatValidators.drug(trimmedValue)
          : "",
      }));
    } else if (name === "trade_license_number") {
      setDocFormatErrors((prev) => ({
        ...prev,
        trade_license_number: trimmedValue
          ? documentFormatValidators.trade(trimmedValue)
          : "",
      }));
    } else if (name === "shop_establishment_number") {
      setDocFormatErrors((prev) => ({
        ...prev,
        shop_establishment_number: trimmedValue
          ? documentFormatValidators.shop(value)
          : "",
      }));
    } else if (name === "udyam_number") {
      setDocFormatErrors((prev) => ({
        ...prev,
        udyam_number: trimmedValue
          ? documentFormatValidators.udyam(trimmedValue)
          : "",
      }));
    } else if (name === "other_document_number") {
      setDocFormatErrors((prev) => ({
        ...prev,
        other_document_number: trimmedValue
          ? documentFormatValidators.otherDoc(value)
          : "",
      }));
    } else if (name === "bank_account_number") {
      setDocFormatErrors((prev) => ({
        ...prev,
        bank_account_number: trimmedValue
          ? documentFormatValidators.accountNumber(trimmedValue)
          : "",
      }));
    } else if (name === "bank_ifsc_code") {
      setDocFormatErrors((prev) => ({
        ...prev,
        bank_ifsc_code: trimmedValue
          ? documentFormatValidators.ifsc(trimmedValue)
          : "",
      }));
    }
  };

  // Notify parent whenever the local Step 4 form snapshot changes.
  // Using an effect avoids calling parent setState during render of this component.
  useEffect(() => {
    onPatchChange?.(form);
  }, [form, onPatchChange]);

  useEffect(() => {
    onDigilockerInFlightChange?.(aadhaarVerify.state === "verifying");
  }, [aadhaarVerify.state, onDigilockerInFlightChange]);

  useEffect(() => {
    const num = (form.pan_number || "").trim().toUpperCase();
    if (panVerifiedNumberRef.current && panVerifiedNumberRef.current === num) {
      if (panVerify.state === "verified" && form.pan_is_verified) return;
      const details = panVerifiedDetailsRef.current || { pan_status: "VALID" };
      const flattened = flattenPanVerifiedData(details);
      const registered = pickPanFetchedInfo(flattened).registered_name || "";
      setPanVerify({ state: "verified", details: flattened });
      setForm((prev) => ({
        ...prev,
        ...(registered ? { pan_holder_name: registered } : {}),
        pan_is_verified: true,
        pan_verified_details: flattened,
        pan_verification_method: prev.pan_verification_method || "CASHFREE_AUTO",
        pan_verified_at: prev.pan_verified_at || new Date().toISOString(),
      }));
      return;
    }
    if (panVerify.state === "idle" && !form.pan_is_verified) return;
    setPanVerify({ state: "idle" });
    setForm((prev) => ({
      ...prev,
      pan_is_verified: false,
      pan_verified_details: null,
      pan_verification_method: null,
      pan_verified_at: null,
    }));
  }, [form.pan_number]);

  useEffect(() => {
    const num = (form.gst_number || "").trim().toUpperCase();
    if (gstVerifiedNumberRef.current && gstVerifiedNumberRef.current === num) {
      if (gstVerify.state === "verified" && form.gst_is_verified) return;
      const details = gstVerifiedDetailsRef.current || {};
      const gstInfo = pickGstFetchedBusinessInfo(details);
      setGstVerify({ state: "verified", details });
      setForm((prev) => ({
        ...prev,
        gst_is_verified: true,
        gst_verified_details: details,
        gst_verification_method: prev.gst_verification_method || "CASHFREE_AUTO",
        gst_verified_at: prev.gst_verified_at || new Date().toISOString(),
        ...(gstInfo.legal_business_name
          ? { gst_legal_business_name: gstInfo.legal_business_name }
          : {}),
        ...(gstInfo.principal_place_of_business
          ? { gst_principal_place_of_business: gstInfo.principal_place_of_business }
          : {}),
        ...(gstInfo.effective_registration_date
          ? { gst_effective_registration_date: gstInfo.effective_registration_date }
          : {}),
      }));
      return;
    }
    if (gstVerify.state === "idle" && !form.gst_is_verified) return;
    setGstVerify({ state: "idle" });
    setForm((prev) => ({
      ...prev,
      gst_is_verified: false,
      gst_verified_details: null,
      gst_verification_method: null,
      gst_verified_at: null,
      gst_legal_business_name: "",
      gst_principal_place_of_business: "",
      gst_effective_registration_date: "",
    }));
  }, [form.gst_number]);

  useEffect(() => {
    const acc = String(form.bank_account_number || "").replace(/\D/g, "");
    const ifsc = String(form.bank_ifsc_code || "").trim().toUpperCase();
    const key = acc && ifsc ? `${acc}|${ifsc}` : "";
    if (bankVerifiedKeyRef.current && bankVerifiedKeyRef.current === key) {
      if (bankVerify.state === "verified" && form.bank_is_verified) return;
      const details = bankVerifiedDetailsRef.current || {};
      const bankInfo = pickBankFetchedInfo(details);
      setBankVerify({ state: "verified", details });
      setForm((prev) => ({
        ...prev,
        bank_is_verified: true,
        bank_verified_details: details,
        bank_verification_method: prev.bank_verification_method || "CASHFREE_AUTO",
        bank_verified_at: prev.bank_verified_at || new Date().toISOString(),
        ...(bankInfo.name_at_bank ? { bank_account_holder_name: bankInfo.name_at_bank } : {}),
        ...(bankInfo.bank_name ? { bank_name: bankInfo.bank_name } : {}),
        ...(bankInfo.branch_name ? { bank_branch_name: bankInfo.branch_name } : {}),
        ...(bankInfo.account_type ? { bank_account_type: bankInfo.account_type } : {}),
      }));
      return;
    }
    if (bankVerify.state === "idle" && !form.bank_is_verified) return;
    setBankVerify({ state: "idle" });
    setForm((prev) => ({
      ...prev,
      bank_is_verified: false,
      bank_verified_details: null,
      bank_verification_method: null,
      bank_verified_at: null,
    }));
  }, [form.bank_account_number, form.bank_ifsc_code]);

  useEffect(() => {
    const vpa = String(form.upi_id || "").trim().toLowerCase();
    if (upiVerifiedKeyRef.current && upiVerifiedKeyRef.current === vpa) {
      if (upiVerify.state === "verified" && form.upi_verified) return;
      const details = upiVerifiedDetailsRef.current || {};
      setUpiVerify({ state: "verified", details });
      setForm((prev) => ({
        ...prev,
        upi_verified: true,
        upi_verified_details: details,
      }));
      return;
    }
    if (upiVerify.state === "idle" && !form.upi_verified) return;
    setUpiVerify({ state: "idle" });
    setForm((prev) => ({
      ...prev,
      upi_verified: false,
      upi_verified_details: null,
    }));
  }, [form.upi_id]);

  useEffect(() => {
    const num = (form.aadhar_number || "").replace(/\D/g, "");
    const currentMasked = maskAadhaarNumber(form.aadhar_number);
    const verifiedMasked = maskAadhaarNumber(aadhaarVerifiedNumberRef.current);
    const matchesSnap =
      !!aadhaarVerifiedNumberRef.current &&
      (aadhaarVerifiedNumberRef.current === num ||
        (!!currentMasked && !!verifiedMasked && currentMasked === verifiedMasked) ||
        aadhaarVerifiedNumberRef.current === currentMasked ||
        aadhaarVerifiedNumberRef.current === form.aadhar_number ||
        aadhaarVerifiedNumberRef.current === "verified");
    if (matchesSnap) {
      if (aadhaarVerify.state === "verified" && form.aadhaar_is_verified) return;
      if (!aadhaarVerifiedDetailsRef.current && !form.aadhaar_is_verified) return;
      const details = aadhaarVerifiedDetailsRef.current || {};
      setAadhaarVerify({ state: "verified", details });
      setForm((prev) => ({
        ...prev,
        aadhaar_is_verified: true,
        aadhaar_verified_details: details,
        aadhaar_verification_method: prev.aadhaar_verification_method || "CASHFREE_AUTO",
        aadhaar_verified_at: prev.aadhaar_verified_at || new Date().toISOString(),
      }));
      return;
    }
    if (aadhaarVerify.state === "idle" && !form.aadhaar_is_verified) return;
    if (aadhaarPollRef.current) {
      clearInterval(aadhaarPollRef.current);
      aadhaarPollRef.current = null;
    }
    setAadhaarVerify({ state: "idle" });
    setForm((prev) => ({
      ...prev,
      aadhaar_is_verified: false,
      aadhaar_verified_details: null,
      aadhaar_verification_method: null,
      aadhaar_verified_at: null,
    }));
  }, [form.aadhar_number]);

  const pollAadhaarStatusOnce = async () => {
    const publicId = (storePublicId || "").trim();
    if (!publicId) return;
    try {
      const res = await fetch(
        `/api/onboarding/verify-document/status?storeId=${encodeURIComponent(publicId)}&docKind=aadhaar`,
        { credentials: "include" },
      );
      const d = await res.json().catch(() => ({}));
      if (d?.verified) {
        if (aadhaarPollRef.current) {
          clearInterval(aadhaarPollRef.current);
          aadhaarPollRef.current = null;
        }
        if (digilockerPopupRef.current && !digilockerPopupRef.current.closed) {
          try {
            digilockerPopupRef.current.close();
          } catch {
            /* ignore */
          }
        }
        digilockerPopupRef.current = null;
        const details = (d.verifiedData as Record<string, unknown>) || {};
        const normalized = normalizeAadhaarVerifiedDetails(details);
        const entered = (form.aadhar_number || "").replace(/\D/g, "");
        const masked =
          normalized.maskedAadhaar ||
          maskAadhaarNumber(entered) ||
          maskAadhaarNumber(form.aadhar_number);
        aadhaarVerifiedNumberRef.current = masked || entered || null;
        aadhaarVerifiedDetailsRef.current = details;
        setAadhaarVerify({
          state: "verified",
          details,
        });
        setDocFormatErrors((prev) => ({ ...prev, aadhar_number: "" }));
        setForm((prev) => ({
          ...prev,
          aadhar_number: masked || prev.aadhar_number,
          ...(normalized.name ? { aadhar_holder_name: normalized.name } : {}),
          aadhaar_is_verified: true,
          aadhaar_verified_details: details,
          aadhaar_verification_method: "CASHFREE_DIGILOCKER",
          aadhaar_verified_at: new Date().toISOString(),
        }));
      } else if (
        d?.status === "rejected" ||
        d?.status === "failed" ||
        d?.status === "expired" ||
        d?.status === "consent_denied"
      ) {
        if (aadhaarPollRef.current) {
          clearInterval(aadhaarPollRef.current);
          aadhaarPollRef.current = null;
        }
        setAadhaarVerify({
          state: "failed",
          error: String(
            d?.statusReason ||
              (d?.status === "expired"
                ? "DigiLocker link expired. Please try again."
                : d?.status === "consent_denied"
                  ? "DigiLocker consent was denied. Please try again."
                  : "DigiLocker verification failed."),
          ),
        });
      }
    } catch {
      /* keep polling */
    }
  };

  const startAadhaarPolling = () => {
    if (aadhaarPollRef.current) clearInterval(aadhaarPollRef.current);
    const startedAt = Date.now();
    const publicId = (storePublicId || "").trim();
    if (!publicId) return;
    void pollAadhaarStatusOnce();
    aadhaarPollRef.current = setInterval(async () => {
      if (Date.now() - startedAt > 3 * 60_000) {
        if (aadhaarPollRef.current) clearInterval(aadhaarPollRef.current);
        setAadhaarVerify({
          state: "failed",
          error: "DigiLocker verification timed out. You can skip or upload images.",
        });
        return;
      }
      await pollAadhaarStatusOnce();
    }, 2_500);
  };

  useEffect(
    () => () => {
      if (aadhaarPollRef.current) clearInterval(aadhaarPollRef.current);
    },
    [],
  );

  const verifyDocNow = async (kind: "pan" | "gstin" | "aadhaar" | "bank" | "upi") => {
    if (!storeInternalId) {
      setErr("Save store details first so a store id exists.");
      return;
    }
    if (kind === "pan") {
      const pan = (form.pan_number || "").trim().toUpperCase();
      if (!pan || documentFormatValidators.pan(pan)) return;
    } else if (kind === "gstin") {
      const gstin = (form.gst_number || "").trim().toUpperCase();
      if (!gstin || documentFormatValidators.gst(gstin)) return;
    } else if (kind === "bank") {
      const acc = String(form.bank_account_number || "").replace(/\D/g, "");
      const ifsc = String(form.bank_ifsc_code || "").trim().toUpperCase();
      if (!acc || documentFormatValidators.accountNumber(acc)) return;
      if (!ifsc || documentFormatValidators.ifsc(ifsc)) return;
    } else if (kind === "upi") {
      const vpa = String(form.upi_id || "").trim().toLowerCase();
      if (!vpa || !/^[a-z0-9.\-_]{2,256}@[a-z0-9]{2,64}$/i.test(vpa)) return;
    } else {
      const aadhaar = (form.aadhar_number || "").replace(/\D/g, "");
      if (!aadhaar || documentFormatValidators.aadhar(aadhaar)) return;
    }
    if (kind === "aadhaar") {
      setAadhaarVerify({ state: "verifying" });
      setErr(null);
      digilockerPopupRef.current = openDigilockerLoadingPopup();
      try {
        const postVerify = () =>
          fetch("/api/onboarding/verify-document", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              storeInternalId,
              docKind: "aadhaar",
              redirectUrl: digilockerRedirectUrl(),
            }),
          });
        let res = await postVerify();
        if (res.status === 401 || res.status === 503) {
          await new Promise((r) => setTimeout(r, 400));
          res = await postVerify();
        }
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          if (digilockerPopupRef.current && !digilockerPopupRef.current.closed) {
            digilockerPopupRef.current.close();
            digilockerPopupRef.current = null;
          }
          const errMsg = "Couldn't verify right now. Wait a moment and try again.";
          setAadhaarVerify({ state: "failed", error: errMsg });
          setErr(errMsg);
          return;
        }
        if (data?.outcome === "digilocker" && data?.url) {
          const digilockerUrl = String(data.url);
          aadhaarVerifiedNumberRef.current =
            (form.aadhar_number || "").replace(/\D/g, "") || null;
          setAadhaarVerify({
            state: "verifying",
            pending: true,
            digilockerUrl,
          });
          startAadhaarPolling();
        } else if (data?.outcome === "verified") {
          if (digilockerPopupRef.current && !digilockerPopupRef.current.closed) {
            digilockerPopupRef.current.close();
            digilockerPopupRef.current = null;
          }
          const aNum = (form.aadhar_number || "").replace(/\D/g, "");
          aadhaarVerifiedNumberRef.current = aNum || null;
          setAadhaarVerify({
            state: "verified",
            details: (data.verifiedData as Record<string, unknown>) || {},
          });
          setForm((prev) => ({ ...prev, aadhaar_is_verified: true }));
        } else if (data?.outcome === "manual") {
          if (digilockerPopupRef.current && !digilockerPopupRef.current.closed) {
            digilockerPopupRef.current.close();
            digilockerPopupRef.current = null;
          }
          setAadhaarVerify({ state: "manual" });
        } else {
          if (digilockerPopupRef.current && !digilockerPopupRef.current.closed) {
            digilockerPopupRef.current.close();
            digilockerPopupRef.current = null;
          }
          const errMsg = String(data?.error || "DigiLocker verification failed.");
          setAadhaarVerify({ state: "failed", error: errMsg });
          setErr(errMsg);
        }
      } catch {
        if (digilockerPopupRef.current && !digilockerPopupRef.current.closed) {
          digilockerPopupRef.current.close();
          digilockerPopupRef.current = null;
        }
        const errMsg = "Could not reach the verification service.";
        setAadhaarVerify({ state: "failed", error: errMsg });
        setErr(errMsg);
      }
      return;
    }

    const setter =
      kind === "pan"
        ? setPanVerify
        : kind === "gstin"
          ? setGstVerify
          : kind === "bank"
            ? setBankVerify
            : setUpiVerify;
    setter({ state: "verifying" });
    setErr(null);
    try {
      const body =
        kind === "pan"
          ? {
              storeInternalId,
              docKind: "pan",
              pan: (form.pan_number || "").trim().toUpperCase(),
              name: (form.pan_holder_name || "").trim() || undefined,
            }
          : kind === "gstin"
            ? {
                storeInternalId,
                docKind: "gstin",
                gstin: (form.gst_number || "").trim().toUpperCase(),
              }
            : kind === "bank"
              ? {
                  storeInternalId,
                  docKind: "bank",
                  bankAccount: String(form.bank_account_number || "").replace(/\D/g, ""),
                  ifsc: String(form.bank_ifsc_code || "").trim().toUpperCase(),
                  name: String(form.bank_account_holder_name || "").trim() || undefined,
                }
              : {
                  storeInternalId,
                  docKind: "upi",
                  vpa: String(form.upi_id || "").trim().toLowerCase(),
                  name: String(form.bank_account_holder_name || "").trim() || undefined,
                };
      const postVerify = () =>
        fetch("/api/onboarding/verify-document", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
      let res = await postVerify();
      if (res.status === 401 || res.status === 503) {
        await new Promise((r) => setTimeout(r, 400));
        res = await postVerify();
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        const errMsg = "Couldn't verify right now. Wait a moment and try again.";
        setter({ state: "failed", error: errMsg });
        setErr(errMsg);
        return;
      }
      if (data?.outcome === "verified") {
        let details = (data.verifiedData as Record<string, unknown>) || {};
        if (kind === "pan") details = flattenPanVerifiedData(details);
        setter({ state: "verified", details });
        if (kind === "pan") {
          const registered = pickPanFetchedInfo(details).registered_name || "";
          const panNum = (form.pan_number || "").trim().toUpperCase();
          panVerifiedNumberRef.current = panNum || null;
          panVerifiedDetailsRef.current = details;
          setForm((prev) => ({
            ...prev,
            ...(registered ? { pan_holder_name: registered } : {}),
            pan_is_verified: true,
            pan_verified_at: new Date().toISOString(),
            pan_verification_method: "CASHFREE_AUTO",
            pan_verified_details: details,
          }));
        } else if (kind === "gstin") {
          const gstNum = (form.gst_number || "").trim().toUpperCase();
          gstVerifiedNumberRef.current = gstNum || null;
          gstVerifiedDetailsRef.current = details;
          const gstInfo = pickGstFetchedBusinessInfo(details);
          setForm((prev) => ({
            ...prev,
            gst_is_verified: true,
            gst_verified_at: new Date().toISOString(),
            gst_verification_method: "CASHFREE_AUTO",
            gst_verified_details: details,
            ...(gstInfo.legal_business_name
              ? { gst_legal_business_name: gstInfo.legal_business_name }
              : {}),
            ...(gstInfo.principal_place_of_business
              ? { gst_principal_place_of_business: gstInfo.principal_place_of_business }
              : {}),
            ...(gstInfo.effective_registration_date
              ? { gst_effective_registration_date: gstInfo.effective_registration_date }
              : {}),
          }));
        } else if (kind === "bank") {
          const acc = String(form.bank_account_number || "").replace(/\D/g, "");
          const ifsc = String(form.bank_ifsc_code || "").trim().toUpperCase();
          bankVerifiedKeyRef.current = acc && ifsc ? `${acc}|${ifsc}` : null;
          bankVerifiedDetailsRef.current = details;
          const bankInfo = pickBankFetchedInfo(details);
          setForm((prev) => ({
            ...prev,
            bank_is_verified: true,
            bank_verified_at: new Date().toISOString(),
            bank_verification_method: "CASHFREE_AUTO",
            bank_verified_details: details,
            ...(bankInfo.name_at_bank
              ? { bank_account_holder_name: bankInfo.name_at_bank }
              : {}),
            ...(bankInfo.bank_name ? { bank_name: bankInfo.bank_name } : {}),
            ...(bankInfo.branch_name ? { bank_branch_name: bankInfo.branch_name } : {}),
            ...(bankInfo.account_type ? { bank_account_type: bankInfo.account_type } : {}),
          }));
        } else if (kind === "upi") {
          const vpa = String(form.upi_id || "").trim().toLowerCase();
          upiVerifiedKeyRef.current = vpa || null;
          upiVerifiedDetailsRef.current = details;
          const upiInfo = pickUpiFetchedInfo(details);
          setForm((prev) => ({
            ...prev,
            upi_id: vpa,
            upi_verified: true,
            upi_verified_details: details,
            ...(upiInfo.name_at_bank && !prev.bank_account_holder_name
              ? { bank_account_holder_name: upiInfo.name_at_bank }
              : {}),
          }));
        }
      } else if (data?.outcome === "manual") {
        setter({ state: "manual" });
      } else {
        const errMsg = String(data?.error || "Verification failed.");
        setter({ state: "failed", error: errMsg });
        setErr(errMsg);
      }
    } catch {
      const errMsg = "Could not reach the verification service.";
      setter({ state: "failed", error: errMsg });
      setErr(errMsg);
    }
  };

  const verifiedDetailRows = (details?: Record<string, unknown>) => {
    if (!details) return [] as [string, string][];
    const flattened = flattenPanVerifiedData(details);
    // Prefer ITD registered name; fall back to saved pan_holder_name for display.
    if (
      !String(flattened.registered_name ?? "").trim() &&
      String(form.pan_holder_name ?? "").trim()
    ) {
      flattened.registered_name = String(form.pan_holder_name).trim();
    }
    const rows: [string, string][] = [];
    const label: Record<string, string> = {
      registered_name: "PAN holder name",
      father_name: "Father's name",
      legal_name_of_business: "Legal Name of Business",
      principal_place_address: "Principal Place of Business",
      date_of_registration: "Effective Date of Registration",
      gst_in_status: "Status",
      taxpayer_type: "Type",
      trade_name_of_business: "Trade Name",
      constitution_of_business: "Business Constitution",
      pan_status: "PAN status",
      name_at_bank: "Name at bank",
      bank_name: "Bank",
      branch_name: "Branch",
      account_type: "Account type",
      account_status: "Account status",
      vpa: "UPI ID",
      status: "Status",
      type: "Type",
    };
    const preferredOrder = [
      "registered_name",
      "father_name",
      "legal_name_of_business",
      "principal_place_address",
      "date_of_registration",
      "gst_in_status",
      "taxpayer_type",
      "trade_name_of_business",
      "constitution_of_business",
      "pan_status",
      "name_at_bank",
      "bank_name",
      "branch_name",
      "account_type",
      "account_status",
      "status",
      "type",
    ];
    const seen = new Set<string>();
    for (const k of preferredOrder) {
      const v = flattened[k];
      if (v == null || typeof v === "object") continue;
      const l = label[k];
      if (!l || seen.has(l)) continue;
      rows.push([l, String(v)]);
      seen.add(l);
    }
    // Fallback Status/Type if preferred keys missing
    if (!seen.has("Status") && !seen.has("PAN status")) {
      const status = flattened.pan_status ?? flattened.status ?? flattened.gst_in_status;
      if (status != null && String(status).trim()) rows.push(["PAN status", String(status)]);
    }
    if (!seen.has("Type")) {
      const type = flattened.type ?? flattened.taxpayer_type;
      if (type != null && String(type).trim()) rows.push(["Type", String(type)]);
    }
    return rows;
  };

  // Compute whether mandatory fields for the CURRENT section are satisfied
  useEffect(() => {
    if (!onRequiredValidChange) return;
    const hasPanNumber =
      !!form.pan_number &&
      form.pan_number.trim().length === 10 &&
      !docFormatErrors.pan_number;
    const hasPanHolder = !!form.pan_holder_name && form.pan_holder_name.trim().length > 0;
    const hasPanImage = !!docPreviews.pan;
    let valid = true;

    if (activeFormSection === "PAN") {
      const panBlank =
        !hasPanNumber && !hasPanHolder && !hasPanImage && !form.pan_is_verified;
      if (!panIsMandatory && panBlank) {
        valid = true;
      } else if (isElectronic(panMode)) {
        const verified = panVerify.state === "verified" || !!form.pan_is_verified;
        if (panMode === "auto") {
          valid = hasPanNumber && verified;
        } else {
          // hybrid: verified OR (failed/manual + image) OR existing image on file
          valid =
            hasPanNumber &&
            (verified ||
              ((panVerify.state === "failed" || panVerify.state === "manual") && hasPanImage) ||
              hasPanImage);
        }
      } else {
        valid = hasPanNumber && hasPanHolder && hasPanImage;
      }
    } else if (activeFormSection === "LICENCE") {
      // FSSAI / Drug Lic — unlock rest only after unique check passes
      if (licenceDup.fssai || licenceDup.drug || licenceDup.checkingFssai || licenceDup.checkingDrug) {
        valid = false;
      } else if (PHARMA_DOC_CODES.has(section)) {
        valid =
          !!form.drug_license_number &&
          form.drug_license_number.trim().length > 0 &&
          !docFormatErrors.drug_license_number &&
          licenceDup.drugOk;
      } else if (section === "FSSAI") {
        const fssaiOk =
          !!form.fssai_number &&
          form.fssai_number.trim().length > 0 &&
          !docFormatErrors.fssai_number &&
          licenceDup.fssaiOk;
        if (fssaiIsMandatory) {
          valid = fssaiOk;
        } else {
          const started = !!(form.fssai_number || "").trim() || !!docPreviews.fssai;
          valid = !started || fssaiOk;
        }
      } else if (section === "TRADE_LICENSE") {
        const started =
          !!(form.trade_license_number || "").trim() ||
          !!docPreviews.trade_license ||
          !!form.trade_license_expiry_date;
        const tradeOk =
          !!(form.trade_license_number || "").trim() &&
          !docFormatErrors.trade_license_number &&
          !!docPreviews.trade_license &&
          !!form.trade_license_expiry_date;
        valid = tradeIsMandatory ? tradeOk : !started || tradeOk;
      } else if (section === "SHOP_ACT") {
        const started =
          !!(form.shop_establishment_number || "").trim() ||
          !!docPreviews.shop_establishment;
        const shopOk =
          !!(form.shop_establishment_number || "").trim() &&
          !docFormatErrors.shop_establishment_number &&
          !!docPreviews.shop_establishment;
        valid = shopIsMandatory ? shopOk : !started || shopOk;
      } else if (section === "UDYAM") {
        const started = !!(form.udyam_number || "").trim() || !!docPreviews.udyam;
        const udyamOk =
          !!(form.udyam_number || "").trim() &&
          !docFormatErrors.udyam_number &&
          !!docPreviews.udyam;
        valid = udyamIsMandatory ? udyamOk : !started || udyamOk;
      } else {
        valid = true;
      }
    } else if (activeFormSection === "GST") {
      // GST is optional unless Super Admin marked it mandatory for this store type.
      valid = true;
      const gstEntered = !!(form.gst_number || "").trim();
      if (gstIsMandatory && !gstEntered) {
        valid = false;
      } else if (gstEntered && isElectronic(gstMode) && !docFormatErrors.gst_number) {
        const gstVerified = gstVerify.state === "verified" || !!form.gst_is_verified;
        const hasGstImage = !!docPreviews.gst;
        if (gstMode === "auto" && !gstVerified) {
          valid = false;
        } else if (gstMode === "hybrid" && !gstVerified && !hasGstImage) {
          valid = false;
        }
      } else if (gstEntered && !!docFormatErrors.gst_number) {
        valid = false;
      }
    } else if (activeFormSection === "BANK") {
      // Bank section: auto / hybrid / manual payout details
      const hasHolder =
        !!form.bank_account_holder_name &&
        form.bank_account_holder_name.trim().length > 0;
      const hasBankName = !!form.bank_name && form.bank_name.trim().length > 0;
      const hasAccountNumber =
        !!form.bank_account_number &&
        form.bank_account_number.trim().length > 0 &&
        !docFormatErrors.bank_account_number;
      const hasIfsc =
        !!form.bank_ifsc_code &&
        form.bank_ifsc_code.trim().length > 0 &&
        !docFormatErrors.bank_ifsc_code;

      const hasUpiId = !!form.upi_id && form.upi_id.trim().length > 0;
      const upiPattern = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9]{2,64}$/;
      const hasValidUpiId =
        hasUpiId && upiPattern.test(form.upi_id!.trim());
      const hasBankProof = !!docPreviews.bank_proof;
      const hasUpiQr = !!docPreviews.upi_qr;
      const bankVerified =
        bankVerify.state === "verified" || !!form.bank_is_verified;
      const upiVerified =
        upiVerify.state === "verified" || !!form.upi_verified;
      const bankBlank =
        !hasAccountNumber && !hasIfsc && !hasUpiId && !hasBankProof && !hasUpiQr && !bankVerified;

      if (!bankIsMandatory && bankBlank) {
        valid = true;
      } else if (payoutMode === "UPI") {
        if (!hasValidUpiId) {
          valid = false;
        } else if (isElectronic(upiMode)) {
          if (upiMode === "auto") {
            valid = upiVerified;
          } else if (upiVerified) {
            valid = true;
          } else {
            valid = hasUpiQr;
          }
        } else {
          valid = hasUpiQr;
        }
      } else if (isElectronic(bankMode)) {
        const hasAccountType = ["SAVINGS", "CURRENT"].includes(
          String(form.bank_account_type || "").trim().toUpperCase(),
        );
        if (!hasAccountNumber || !hasIfsc) {
          valid = false;
        } else if (bankMode === "auto") {
          valid = bankVerified && hasAccountType;
        } else if (bankVerified) {
          valid = hasAccountType;
        } else {
          // hybrid fallback: manual details + proof
          valid = hasHolder && hasBankName && hasBankProof;
        }
      } else {
        valid = hasHolder && hasBankName && hasAccountNumber && hasIfsc && hasBankProof;
      }
    } else {
      // Aadhaar: catalog optional → skip anytime. Mandatory → number required.
      // Hybrid/auto DigiLocker still never blocks Skip when the field is empty.
      const aadhaarNum = (form.aadhar_number || "").replace(/\s/g, "").trim();
      valid = true;
      if (aadhaarIsMandatory && !aadhaarNum && !form.aadhaar_is_verified) {
        valid = false;
      } else if (aadhaarNum && docFormatErrors.aadhar_number) {
        valid = false;
      }
    }

    // Global rule: if any document number field has a format error while value is present,
    // block progression even if that doc is "optional".
    const hasAnyFormatError =
      (!!form.trade_license_number && !!docFormatErrors.trade_license_number) ||
      (!!form.shop_establishment_number &&
        !!docFormatErrors.shop_establishment_number) ||
      (!!form.udyam_number && !!docFormatErrors.udyam_number) ||
      (!!form.other_document_number && !!docFormatErrors.other_document_number);

    onRequiredValidChange(valid && !hasAnyFormatError);
    // Note: docFormatErrors is intentionally not in the dependency array to keep
    // the deps length stable across hot reloads and avoid the Next.js warning.
  }, [
    form,
    docPreviews,
    upperStoreType,
    section,
    activeFormSection,
    panIsMandatory,
    aadhaarIsMandatory,
    gstIsMandatory,
    bankIsMandatory,
    fssaiIsMandatory,
    tradeIsMandatory,
    shopIsMandatory,
    udyamIsMandatory,
    onRequiredValidChange,
    panMode,
    panVerify.state,
    gstMode,
    gstVerify.state,
    bankMode,
    bankVerify.state,
    upiMode,
    upiVerify.state,
    payoutMode,
    licenceDup.fssai,
    licenceDup.drug,
    licenceDup.checkingFssai,
    licenceDup.checkingDrug,
    licenceDup.fssaiOk,
    licenceDup.drugOk,
    docFormatErrors.fssai_number,
    docFormatErrors.drug_license_number,
  ]);

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    docType:
      | "pan"
      | "aadhaar_front"
      | "aadhaar_back"
      | "gst"
      | "fssai"
      | "drug_license"
      | "trade_license"
      | "shop_establishment"
      | "udyam"
      | "pharmacist_certificate"
      | "pharmacy_council_registration"
      | "bank_proof"
      | "other"
  ) => {
    setErr(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!storeInternalId || !Number.isFinite(storeInternalId)) {
      setErr("Please complete Step 1 so the store is created before uploading documents.");
      return;
    }
    try {
      setUploadingDocType(docType);

        // Special-case: bank proof / UPI QR uploads go to AM bank-accounts upload API
      if (docType === "bank_proof") {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("kind", payoutMode === "UPI" ? "upi" : "bank");

        const res = await fetch(
          `/api/area-manager/store-bank-accounts/upload?storeInternalId=${storeInternalId}`,
          {
            method: "POST",
            body: fd,
            credentials: "include",
          }
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.success || !json?.url) {
          throw new Error(
            json?.error ||
              "Failed to upload bank proof / UPI QR. Please try again."
          );
        }

        const proxyUrl = json.url as string;

        // Update local preview with the proxy URL
        setDocPreviews((prev) => {
          const next = { ...prev };
          if (payoutMode === "UPI") {
            if (next.upi_qr) URL.revokeObjectURL(next.upi_qr);
            next.upi_qr = proxyUrl;
          } else {
            if (next.bank_proof) URL.revokeObjectURL(next.bank_proof);
            next.bank_proof = proxyUrl;
          }
          return next;
        });

        // Persist URL into form patch so parent can save into merchant_store_bank_accounts
        setForm((prev) => ({
          ...prev,
          bank_proof_file_url:
            payoutMode === "BANK"
              ? proxyUrl
              : prev.bank_proof_file_url ?? prev.bank_proof_file_url,
          upi_qr_screenshot_url:
            payoutMode === "UPI"
              ? proxyUrl
              : prev.upi_qr_screenshot_url ?? prev.upi_qr_screenshot_url,
        }));

        return;
      }

      const formData = new FormData();
      formData.append("file", file);
      // Backend understands specific docType values; map sub-types accordingly.
      let coreDocType:
        | "pan"
        | "gst"
        | "aadhaar"
        | "fssai"
        | "drug_license"
        | "trade_license"
        | "shop_establishment"
        | "udyam"
        | "other"
        | "pharmacist_certificate"
        | "pharmacy_council_registration" = "aadhaar";

      if (docType === "pan") coreDocType = "pan";
      else if (docType === "gst") coreDocType = "gst";
      else if (docType === "fssai") coreDocType = "fssai";
      else if (docType === "drug_license") coreDocType = "drug_license";
      else if (docType === "trade_license") coreDocType = "trade_license";
      else if (docType === "shop_establishment")
        coreDocType = "shop_establishment";
      else if (docType === "udyam") coreDocType = "udyam";
      else if (docType === "other") coreDocType = "other";
      else if (docType === "pharmacist_certificate")
        coreDocType = "pharmacist_certificate";
      else if (docType === "pharmacy_council_registration")
        coreDocType = "pharmacy_council_registration";
      else coreDocType = "aadhaar";
      formData.append("docType", coreDocType);
      if (coreDocType === "aadhaar") {
        formData.append("side", docType === "aadhaar_back" ? "back" : "front");
      }
      const res = await fetch(
        `/api/merchant/stores/${storeInternalId}/documents/upload`,
        {
          method: "POST",
          body: formData,
          credentials: "include",
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        throw new Error(
          json?.error ||
            "Failed to upload document. Please try again."
        );
      }
      // Update local preview so user can see what was uploaded
      const previewUrl =
        typeof json.url === "string" && json.url
          ? (json.url as string)
          : URL.createObjectURL(file);

      setDocPreviews((prev) => {
        const next = { ...prev };
        if (next[docType]?.startsWith("blob:")) {
          URL.revokeObjectURL(next[docType]);
        }
        next[docType] = previewUrl;
        return next;
      });
    } catch (e) {
      setErr(
        e instanceof Error
          ? e.message
          : "Failed to upload document. Please try again."
      );
    } finally {
      setUploadingDocType(null);
      e.target.value = "";
    }
  };

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(docPreviews).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [docPreviews]);

  const renderPanSection = () => (
    <div className="space-y-2">
      <div className="rounded-lg bg-indigo-50/80 border border-indigo-100 p-3">
        <div className="flex items-start gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-indigo-900">
              PAN Card {panIsMandatory ? "(Mandatory)" : <span className="text-slate-500 text-xs font-normal">(Optional)</span>}
            </p>
            <p className="text-xs text-indigo-700 mt-0.5">
              {isElectronic(panMode)
                ? "PAN number is verified automatically — no card image needed when it verifies. Format: ABCDE1234F"
                : "PAN is required for store verification. Format: ABCDE1234F."}
            </p>
          </div>
        </div>
      </div>
      <div className="rounded-xl bg-amber-50/80 border border-amber-100 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-900">Note</p>
            <p className="text-xs text-amber-800 mt-0.5">
              PAN must be valid and belong to the business owner or authorized signatory.
            </p>
          </div>
        </div>
      </div>
      <div className={`grid grid-cols-1 ${isElectronic(panMode) && !(panVerify.state === "failed" && /name/i.test(panVerify.error || "")) ? "" : "sm:grid-cols-2"} gap-3`}>
        {(!isElectronic(panMode) ||
          (panVerify.state === "failed" && /name/i.test(panVerify.error || ""))) && (
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Name as on PAN {isElectronic(panMode) ? "" : <span className="text-rose-500">*</span>}
            </label>
            <input
              type="text"
              name="pan_holder_name"
              value={form.pan_holder_name ?? ""}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Full name as on PAN card"
            />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            PAN Number <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              name="pan_number"
              value={form.pan_number ?? ""}
              onChange={handleChange}
              className={`w-full rounded-lg border px-3 pr-10 py-2 text-sm uppercase tracking-wider bg-white font-medium focus:outline-none focus:ring-2 ${
                form.pan_number
                  ? docFormatErrors.pan_number
                    ? "border-rose-400 focus:ring-rose-200"
                    : "border-emerald-500 focus:border-emerald-600 focus:ring-emerald-200"
                  : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
              }`}
              placeholder="ABCDE1234F"
              maxLength={10}
            />
            {form.pan_number && !docFormatErrors.pan_number && (
              <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[11px]">
                  ✓
                </span>
              </span>
            )}
          </div>
          {docFormatErrors.pan_number && (
            <p className="mt-1 text-xs text-rose-600">{docFormatErrors.pan_number}</p>
          )}
          <p className="mt-1.5 text-xs text-slate-500">
            10 characters, auto uppercase (e.g. ABCDE1234F)
          </p>
        </div>
      </div>

      {isElectronic(panMode) && (
        <div className="space-y-2">
          {panVerify.state === "verified" || form.pan_is_verified ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[11px]">
                  ✓
                </span>
                PAN verified automatically
              </p>
              {verifiedDetailRows(panVerify.details || form.pan_verified_details || undefined).length > 0 && (
                <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {verifiedDetailRows(panVerify.details || form.pan_verified_details || undefined).map(
                    ([label, value]) => (
                      <div key={label} className="flex gap-1.5">
                        <dt className="text-emerald-700">{label}:</dt>
                        <dd className="font-medium text-emerald-900">{value}</dd>
                      </div>
                    ),
                  )}
                </dl>
              )}
              <p className="mt-1.5 text-xs text-emerald-700">
                No card image needed. You can continue.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => verifyDocNow("pan")}
              disabled={
                panVerify.state === "verifying" ||
                !(form.pan_number || "").trim() ||
                !!documentFormatValidators.pan((form.pan_number || "").trim()) ||
                !storeInternalId
              }
              className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {panVerify.state === "verifying" ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Verifying…
                </>
              ) : (
                "Verify PAN"
              )}
            </button>
          )}
          {panVerify.state === "failed" && (
            <p className="text-[11px] text-rose-600">
              {panVerify.error || "Automatic verification failed."}
              {panMode === "hybrid" ? " Upload a PAN card image to continue." : ""}
            </p>
          )}
        </div>
      )}

      {/* Upload — always for manual; for auto/hybrid only after fail/manual */}
      {uploadAllowedFor(panMode, panVerify) && (
        <>
      {docPreviews.pan ? (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 relative">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white text-sm font-bold">
                ✓
              </div>
              <div>
                <p className="text-xs sm:text-sm font-semibold text-emerald-800">
                  Uploaded
                </p>
                <button
                  type="button"
                  className="mt-0.5 text-[11px] font-medium text-emerald-800 underline underline-offset-2"
                  onClick={() => {
                    if (docPreviews.pan) {
                      window.open(docPreviews.pan, "_blank", "noopener,noreferrer");
                    }
                  }}
                >
                  View file
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setReplaceTarget("pan")}
                className="rounded-lg border border-emerald-500 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
              >
                Change
              </button>
              <button
                type="button"
                onClick={() => {
                  setDocPreviews((prev) => {
                    const next = { ...prev };
                    if (next.pan) URL.revokeObjectURL(next.pan);
                    delete next.pan;
                    return next;
                  });
                }}
                className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                aria-label="Remove file"
              >
                ×
              </button>
            </div>
          </div>
          <div className="mt-3 flex justify-center">
            <img
              src={docPreviews.pan}
              alt="PAN preview"
              className="h-24 rounded-md border border-emerald-200 bg-white object-contain"
            />
          </div>
          {uploadingDocType === "pan" && (
            <div className="absolute inset-0 rounded-xl bg-white/70 flex items-center justify-center">
              <Loader2 className="h-6 w-6 text-emerald-700 animate-spin" />
            </div>
          )}
          {/* Hidden file input used when replacing an existing PAN document */}
          <input
            ref={panInputRef}
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            onChange={(e) => handleFileUpload(e, "pan")}
            disabled={uploadingDocType === "pan"}
          />
        </div>
      ) : (
        <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/80 px-4 py-6 text-center mt-3">
          <p className="text-xs sm:text-sm font-medium text-slate-700 mb-1">
            PAN Card Image {isElectronic(panMode) ? "(fallback)" : "*"}
          </p>
          <p className="text-[11px] text-slate-500">
            JPG, PNG or PDF · Max 5MB
          </p>
          <div className="mt-3 flex items-center justify-center">
            <label className="inline-flex items-center px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium cursor-pointer hover:bg-indigo-700">
              {uploadingDocType === "pan" && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              <span>
                {uploadingDocType === "pan" ? "Uploading..." : "Choose file"}
              </span>
              <input
                ref={panInputRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => handleFileUpload(e, "pan")}
                disabled={uploadingDocType === "pan"}
              />
            </label>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );

  const renderAadhaarSection = () => (
    <div className="space-y-3">
      <div className="rounded-lg bg-indigo-50/80 border border-indigo-100 p-3">
        <div className="flex items-start gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-indigo-900">
              Aadhaar Card{" "}
              <span className="text-slate-500 text-xs font-normal">
                {aadhaarIsMandatory ? "(Mandatory)" : "(Optional)"}
              </span>
            </p>
            <p className="text-xs text-indigo-700 mt-0.5">
              {isElectronic(aadhaarMode)
                ? aadhaarIsMandatory
                  ? "DigiLocker verify when available."
                  : "Optional — DigiLocker verify, or skip and continue anytime."
                : "Identity verification. Images are optional—number and name sufficient."}
            </p>
          </div>
        </div>
      </div>
      {!isElectronic(aadhaarMode) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] sm:text-xs text-amber-800">
          Both sides should be clear and readable.
        </div>
      )}
      <div
        className={`grid grid-cols-1 ${isElectronic(aadhaarMode) ? "" : "sm:grid-cols-2"} gap-3`}
      >
        {!isElectronic(aadhaarMode) && (
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Name as on Aadhaar{" "}
              <span className="font-normal text-slate-500">(if providing)</span>
            </label>
            <input
              type="text"
              name="aadhar_holder_name"
              value={form.aadhar_holder_name ?? ""}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-slate-50"
              placeholder="Bhim Pratap Singh"
            />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Aadhaar Number{" "}
            <span className="font-normal text-slate-500">(if providing)</span>
          </label>
          <div className="relative">
            <input
              type="text"
              name="aadhar_number"
              value={form.aadhar_number ?? ""}
              onChange={handleChange}
              readOnly={
                aadhaarVerify.state === "verified" || !!form.aadhaar_is_verified
              }
              className={`w-full rounded-lg border px-3 pr-8 py-2 text-sm bg-slate-50 ${
                form.aadhar_number
                  ? docFormatErrors.aadhar_number
                    ? "border-rose-400"
                    : "border-emerald-400"
                  : "border-slate-300"
              }`}
              placeholder="960334402444"
              maxLength={isMaskedAadhaar(form.aadhar_number) ? 14 : 12}
            />
            {form.aadhar_number && !docFormatErrors.aadhar_number && (
              <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-600 text-white text-[8px]">
                  ✓
                </span>
              </span>
            )}
          </div>
          {docFormatErrors.aadhar_number && (
            <p className="mt-0.5 text-[11px] text-rose-600">
              {docFormatErrors.aadhar_number}
            </p>
          )}
          {!form.aadhar_number && !docFormatErrors.aadhar_number && (
            <p className="mt-0.5 text-[11px] text-slate-500">12 digits, no spaces.</p>
          )}
        </div>
      </div>

      {isElectronic(aadhaarMode) && (
        <div className="space-y-2">
          {aadhaarVerify.state === "verified" || form.aadhaar_is_verified ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[11px]">
                  ✓
                </span>
                Aadhaar verified via DigiLocker
              </p>
              {(() => {
                const rows = normalizeAadhaarVerifiedDetails(
                  aadhaarVerify.details ||
                    (form.aadhaar_verified_details as Record<string, unknown> | null) ||
                    null,
                ).rows;
                if (!rows.length) {
                  return (
                    <p className="mt-1.5 text-xs text-emerald-700">
                      No card images needed. You can continue.
                    </p>
                  );
                }
                return (
                  <>
                    <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      {rows.map(([label, value]) => (
                        <div key={label} className="flex gap-1.5 text-left">
                          <dt className="text-emerald-700 shrink-0">{label}:</dt>
                          <dd className="font-medium text-emerald-900 break-words">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-1.5 text-xs text-emerald-700">
                      No card images needed. You can continue.
                    </p>
                  </>
                );
              })()}
            </div>
          ) : aadhaarVerify.state === "verifying" && aadhaarVerify.pending ? (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs text-indigo-800 space-y-2">
              <p className="font-semibold inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Waiting for DigiLocker…
              </p>
              <p className="mt-1">Complete OTP in the DigiLocker window — this panel updates when verified.</p>
              <button
                type="button"
                onClick={() => {
                  if (aadhaarPollRef.current) {
                    clearInterval(aadhaarPollRef.current);
                    aadhaarPollRef.current = null;
                  }
                  setAadhaarVerify({ state: "idle" });
                  setErr(null);
                }}
                className="inline-flex w-fit items-center rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-medium text-indigo-800 hover:bg-indigo-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => verifyDocNow("aadhaar")}
                disabled={
                  aadhaarVerify.state === "verifying" ||
                  !storeInternalId ||
                  !(form.aadhar_number || "").replace(/\D/g, "").trim() ||
                  !!documentFormatValidators.aadhar(
                    (form.aadhar_number || "").replace(/\D/g, ""),
                  )
                }
                className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {aadhaarVerify.state === "verifying" ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Starting DigiLocker…
                  </>
                ) : (
                  "Verify with DigiLocker"
                )}
              </button>
              <p className="text-[11px] text-slate-500">
                Enter a valid 12-digit Aadhaar number first, then verify — or skip this optional step.
              </p>
              {aadhaarVerify.state === "failed" && (
                <p className="text-[11px] text-rose-600">
                  {aadhaarVerify.error || "DigiLocker failed."}
                  {aadhaarMode === "hybrid"
                    ? " Upload card images below, or skip."
                    : " You can skip and continue."}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {(uploadAllowedFor(aadhaarMode, aadhaarVerify) ||
        !!docPreviews.aadhaar_front ||
        !!docPreviews.aadhaar_back) &&
        aadhaarVerify.state !== "verified" &&
        !form.aadhaar_is_verified && (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Front side card */}
        {docPreviews.aadhaar_front ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 flex flex-col gap-2 relative">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold">
                  ✓
                </div>
                <div>
                  <p className="text-xs font-semibold text-emerald-800">Front Side</p>
                  <button
                    type="button"
                    className="text-[11px] font-medium text-emerald-800 underline underline-offset-2"
                    onClick={() => window.open(docPreviews.aadhaar_front, "_blank", "noopener,noreferrer")}
                  >
                    View file
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReplaceTarget("aadhaar_front")}
                className="rounded-lg border border-emerald-500 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
              >
                Change
              </button>
            </div>
            <div className="h-28 rounded-lg overflow-hidden bg-white/30 border border-emerald-100 flex items-center justify-center">
              <img
                src={docPreviews.aadhaar_front}
                alt="Aadhaar front preview"
                className="h-full w-auto object-contain"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() =>
                  setDocPreviews((prev) => {
                    const next = { ...prev };
                    if (next.aadhaar_front) URL.revokeObjectURL(next.aadhaar_front);
                    delete next.aadhaar_front;
                    return next;
                  })
                }
                className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                aria-label="Remove front side"
              >
                ×
              </button>
            </div>
            {/* Hidden input for replacing existing Aadhaar front file */}
            <input
              ref={aadhaarFrontInputRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => handleFileUpload(e, "aadhaar_front")}
              disabled={uploadingDocType === "aadhaar_front"}
            />
            {uploadingDocType === "aadhaar_front" && (
              <div className="absolute inset-0 rounded-xl bg-white/70 flex items-center justify-center">
                <Loader2 className="h-6 w-6 text-emerald-700 animate-spin" />
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/80 px-4 py-6 text-center">
            <p className="text-xs sm:text-sm font-medium text-slate-700 mb-1">
              Front Side (optional)
            </p>
            <p className="text-[11px] text-slate-500">
              Photo &amp; details. Not mandatory for onboarding.
            </p>
            <div className="mt-3 flex items-center justify-center">
              <label className="inline-flex items-center px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium cursor-pointer hover:bg-indigo-700">
                {uploadingDocType === "aadhaar_front" && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                <span>
                  {uploadingDocType === "aadhaar_front"
                    ? "Uploading..."
                    : "Choose file"}
                </span>
                <input
                  ref={aadhaarFrontInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => handleFileUpload(e, "aadhaar_front")}
                  disabled={uploadingDocType === "aadhaar_front"}
                />
              </label>
            </div>
          </div>
        )}

        {/* Back side card */}
        {docPreviews.aadhaar_back ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 flex flex-col gap-2 relative">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold">
                  ✓
                </div>
                <div>
                  <p className="text-xs font-semibold text-emerald-800">Back Side</p>
                  <button
                    type="button"
                    className="text-[11px] font-medium text-emerald-800 underline underline-offset-2"
                    onClick={() => window.open(docPreviews.aadhaar_back, "_blank", "noopener,noreferrer")}
                  >
                    View file
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReplaceTarget("aadhaar_back")}
                className="rounded-lg border border-emerald-500 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
              >
                Change
              </button>
            </div>
            <div className="h-28 rounded-lg overflow-hidden bg-white/30 border border-emerald-100 flex items-center justify-center">
              <img
                src={docPreviews.aadhaar_back}
                alt="Aadhaar back preview"
                className="h-full w-auto object-contain"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() =>
                  setDocPreviews((prev) => {
                    const next = { ...prev };
                    if (next.aadhaar_back) URL.revokeObjectURL(next.aadhaar_back);
                    delete next.aadhaar_back;
                    return next;
                  })
                }
                className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                aria-label="Remove back side"
              >
                ×
              </button>
            </div>
            {/* Hidden input for replacing existing Aadhaar back file */}
            <input
              ref={aadhaarBackInputRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => handleFileUpload(e, "aadhaar_back")}
              disabled={uploadingDocType === "aadhaar_back"}
            />
            {uploadingDocType === "aadhaar_back" && (
              <div className="absolute inset-0 rounded-xl bg-white/70 flex items-center justify-center">
                <Loader2 className="h-6 w-6 text-emerald-700 animate-spin" />
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/80 px-4 py-6 text-center">
            <p className="text-xs sm:text-sm font-medium text-slate-700 mb-1">
              Back Side (optional)
            </p>
            <p className="text-[11px] text-slate-500">
              Address side. Helpful for full KYC but not mandatory.
            </p>
            <div className="mt-3 flex items-center justify-center">
              <label className="inline-flex items-center px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium cursor-pointer hover:bg-indigo-700">
                {uploadingDocType === "aadhaar_back" && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                <span>
                  {uploadingDocType === "aadhaar_back"
                    ? "Uploading..."
                    : "Choose file"}
                </span>
                <input
                  ref={aadhaarBackInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => handleFileUpload(e, "aadhaar_back")}
                  disabled={uploadingDocType === "aadhaar_back"}
                />
              </label>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );

  const renderGstSection = () => {
    const isGstValid =
      !!String(form.gst_number || "").trim() && !docFormatErrors.gst_number;
    const gstVerified =
      gstVerify.state === "verified" || Boolean(form.gst_is_verified);
    const gstDetails = gstVerify.details || form.gst_verified_details || undefined;

    return (
      <div className="space-y-3">
        <div className="rounded-xl bg-gradient-to-br from-purple-50 via-indigo-50 to-blue-50 border-2 border-purple-200/60 p-4 space-y-3 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-purple-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-purple-900">
                GST Certificate {gstIsMandatory ? "(Mandatory)" : "(Optional)"}
              </h4>
              <p className="text-xs text-purple-800 mt-0.5">
                {isElectronic(gstMode)
                  ? gstIsMandatory
                    ? "GSTIN is required for this store type."
                    : "Optional — Cashfree verify GSTIN, or skip and continue anytime."
                  : gstIsMandatory
                    ? "GSTIN is required for this store type."
                    : "Optional — enter GSTIN and upload certificate, or skip anytime."}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-indigo-50/80 border border-indigo-100 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-indigo-900">Note</p>
                <p className="text-xs text-indigo-700 mt-0.5">
                  {gstIsMandatory
                    ? "GST is mandatory for this store type. Enter a valid GSTIN to continue."
                    : "GST may be required based on turnover. You can skip this step if you do not have a GSTIN yet."}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-purple-200/50">
            <div className="md:col-span-2 space-y-2">
              <label className="block text-xs font-medium text-slate-700">
                GSTIN {isElectronic(gstMode) ? "(if providing)" : ""}
              </label>
              <div className="relative">
                <input
                  type="text"
                  name="gst_number"
                  value={form.gst_number ?? ""}
                  onChange={handleChange}
                  placeholder="15 CHARACTER GSTIN"
                  className={`w-full px-3 py-2 pr-10 text-sm border rounded-xl bg-white uppercase focus:outline-none focus:ring-2 ${
                    isGstValid
                      ? "border-emerald-500 focus:border-emerald-600 focus:ring-emerald-200"
                      : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
                  }`}
                />
                {isGstValid && (
                  <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[11px]">
                      ✓
                    </span>
                  </span>
                )}
              </div>
              {docFormatErrors.gst_number && (
                <p className="text-xs text-rose-600">{docFormatErrors.gst_number}</p>
              )}
              {!gstIsMandatory && (
                <p className="text-xs text-slate-500">
                  Leave blank and tap Skip to continue without GST
                </p>
              )}
            </div>

            {isElectronic(gstMode) && (
              <div className="md:col-span-2">
                {gstVerified ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[11px]">
                        ✓
                      </span>
                      GSTIN verified automatically
                    </p>
                    {verifiedDetailRows(gstDetails).length > 0 && (
                      <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                        {verifiedDetailRows(gstDetails).map(([label, value]) => (
                          <div key={label} className="flex gap-1.5 text-xs">
                            <dt className="text-emerald-700">{label}:</dt>
                            <dd className="font-medium text-emerald-900">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    <p className="mt-1.5 text-xs text-emerald-700">
                      No certificate upload needed. You can continue.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => verifyDocNow("gstin")}
                      disabled={
                        gstVerify.state === "verifying" ||
                        !(form.gst_number || "").trim() ||
                        !!documentFormatValidators.gst(
                          (form.gst_number || "").trim(),
                        ) ||
                        !storeInternalId
                      }
                      className="inline-flex w-fit items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {gstVerify.state === "verifying" ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Verifying…
                        </>
                      ) : (
                        "Verify GSTIN"
                      )}
                    </button>
                    {gstVerify.state === "failed" && gstMode === "auto" && (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                        <span className="font-semibold">GSTIN verification failed. </span>
                        {gstVerify.error || "The GSTIN could not be verified."} Re-check
                        the number or try again after some time — automatic verification is
                        required.
                      </div>
                    )}
                    {gstVerify.state === "failed" && gstMode === "hybrid" && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                        <span className="font-semibold">
                          Instant verification didn&apos;t succeed.{" "}
                        </span>
                        Upload your GST certificate below — our team will verify it
                        manually.
                      </div>
                    )}
                    {gstVerify.state === "manual" && (
                      <p className="text-xs text-slate-500">
                        GSTIN queued for manual verification. Upload the certificate to
                        speed it up.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {(form.gst_number || "").trim() &&
              !form.gst_is_verified &&
              gstVerify.state !== "verified" &&
              (!isElectronic(gstMode) ||
                gstVerify.state === "failed" ||
                gstVerify.state === "manual" ||
                uploadAllowedFor(gstMode, gstVerify)) && (
                <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {isElectronic(gstMode) &&
                    (gstVerify.state === "failed" || gstVerify.state === "manual") && (
                      <p className="sm:col-span-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        Auto verification didn&apos;t succeed — enter business details
                        manually (and upload certificate if needed).
                      </p>
                    )}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Legal Name of Business
                    </label>
                    <input
                      type="text"
                      name="gst_legal_business_name"
                      value={form.gst_legal_business_name ?? ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Enter legal name of business"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Principal Place of Business
                    </label>
                    <textarea
                      name="gst_principal_place_of_business"
                      value={form.gst_principal_place_of_business ?? ""}
                      onChange={handleChange}
                      rows={2}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Enter principal place of business"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Effective Date of Registration
                    </label>
                    <input
                      type="date"
                      name="gst_effective_registration_date"
                      value={(form.gst_effective_registration_date || "").slice(0, 10)}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              )}

            {(uploadAllowedFor(gstMode, gstVerify) || !!docPreviews.gst) &&
              gstVerify.state !== "verified" &&
              !form.gst_is_verified && (
                <div className="space-y-2 md:col-span-2">
                  {!docPreviews.gst ? (
                    <label className="flex w-full cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/60 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">
                      {uploadingDocType === "gst" ? (
                        <span className="inline-flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
                        </span>
                      ) : (
                        "Upload GST certificate"
                      )}
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, "gst")}
                        disabled={uploadingDocType === "gst"}
                      />
                    </label>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2 py-1 text-[11px] text-emerald-800 hover:bg-emerald-100"
                        onClick={() =>
                          window.open(docPreviews.gst, "_blank", "noopener,noreferrer")
                        }
                      >
                        View GST certificate
                      </button>
                      <div className="flex items-center gap-1 rounded-full bg-slate-50 border border-slate-200 px-2 py-1 text-[11px] text-slate-800">
                        <span className="truncate max-w-[110px]">
                          {getFileNameFromUrl(docPreviews.gst)}
                        </span>
                        <button
                          type="button"
                          className="ml-1 text-slate-500 hover:text-slate-800"
                          onClick={() =>
                            setDocPreviews((prev) => {
                              const next = { ...prev };
                              if (next.gst) URL.revokeObjectURL(next.gst);
                              delete next.gst;
                              return next;
                            })
                          }
                        >
                          ×
                        </button>
                      </div>
                      <label className="inline-flex items-center px-3 py-1.5 rounded-lg border border-dashed border-slate-300 text-[11px] font-medium text-slate-700 cursor-pointer hover:bg-slate-50">
                        Change file
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          className="hidden"
                          onChange={(e) => handleFileUpload(e, "gst")}
                          disabled={uploadingDocType === "gst"}
                        />
                      </label>
                      <img
                        src={docPreviews.gst}
                        alt="GST certificate preview"
                        className="h-20 rounded-md border border-slate-200 object-cover"
                      />
                    </div>
                  )}
                </div>
              )}
          </div>
        </div>
      </div>
    );
  };

  const renderLicenceSection = () => {
    const showPharmaBlock = PHARMA_DOC_CODES.has(section);
    const showFssaiBlock = section === "FSSAI";
    const showTradeBlock = section === "TRADE_LICENSE";
    const showShopBlock = section === "SHOP_ACT";
    const showUdyamBlock = section === "UDYAM";
    const showOtherBlock =
      section === "OTHER" ||
      section === "OTHERS" ||
      (activeFormSection === "LICENCE" &&
        !showPharmaBlock &&
        !showFssaiBlock &&
        !showTradeBlock &&
        !showShopBlock &&
        !showUdyamBlock);
    return (
    <div className="space-y-2">
      {/* Pharma specific layout (images 1 & 2) */}
      {showPharmaBlock ? (
        <>
          {/* Pharma documents header */}
          <div className="rounded-lg border border-violet-100 bg-violet-50/80 p-2.5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-violet-900">Pharma Documents (Mandatory)</p>
                <p className="text-xs text-violet-700 mt-0.5">
                  Drug License and Pharmacist details mandatory for pharmacy as per drug regulations.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-1 rounded-lg border border-indigo-100 bg-indigo-50 px-3.5 py-2 text-[11px] sm:text-xs text-indigo-800">
            <div className="flex items-start gap-2">
              <div className="mt-[2px] flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-white text-[10px]">
                i
              </div>
              <div>
                <p className="font-semibold mb-0.5">Note</p>
                <p>
                  Pharma documents are mandatory. Store cannot operate without valid
                  Drug Licence and Pharmacist details. GST is optional and can be added
                  separately in the GST section.
                </p>
              </div>
            </div>
          </div>

          {/* Drug licence number + upload */}
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.35fr)] gap-1.5">
            <div className="relative">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Drug Licence Number <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                name="drug_license_number"
                value={form.drug_license_number ?? ""}
                onChange={handleChange}
                className={`w-full rounded-lg border px-3 pr-9 py-2 text-sm ${
                  docFormatErrors.drug_license_number
                    ? "border-rose-400 focus:border-rose-500 focus:ring-rose-200"
                    : licenceDup.drugOk && !licenceDup.checkingDrug
                    ? "border-emerald-400 focus:border-indigo-500 focus:ring-indigo-200"
                    : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-200"
                }`}
                placeholder="Enter Drug Licence Number"
              />
              <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                {licenceDup.checkingDrug ? (
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                ) : form.drug_license_number &&
                  !docFormatErrors.drug_license_number &&
                  licenceDup.drugOk ? (
                  <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-600 text-white text-[8px]">
                    ✓
                  </span>
                ) : null}
              </span>
              {docFormatErrors.drug_license_number && (
                <p className="mt-0.5 text-[11px] text-rose-600">
                  {docFormatErrors.drug_license_number}
                </p>
              )}
              {licenceDup.checkingDrug && !docFormatErrors.drug_license_number && (
                <p className="mt-0.5 text-[11px] text-indigo-600">
                  Checking Drug Licence number…
                </p>
              )}
              <p className="mt-0.5 text-[11px] text-slate-500">
                Retail (Form 20/21) or Wholesale (Form 20B/21B) Licence
              </p>
            </div>
            <div className="flex items-end pt-3 sm:pt-0">
              <div className="w-full space-y-1">
                <span className="block text-xs font-medium text-slate-700">
                  Drug Licence Upload <span className="text-rose-600">*</span>
                </span>
                {docPreviews.drug_license ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold">
                        ✓
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-emerald-800">
                          File uploaded
                        </p>
                        <button
                          type="button"
                          className="text-[11px] font-medium text-emerald-800 underline underline-offset-2"
                          onClick={() =>
                            window.open(
                              docPreviews.drug_license,
                              "_blank",
                              "noopener,noreferrer"
                            )
                          }
                        >
                          View certificate
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const input = document.getElementById(
                            "drug-license-upload-input"
                          ) as HTMLInputElement | null;
                          input?.click();
                        }}
                        className="rounded-lg border border-emerald-500 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                      >
                        Change
                      </button>
                    </div>
                  </div>
                ) : null}
                <label className="flex h-[40px] items-center justify-center rounded-lg border-2 border-dashed border-indigo-300 bg-indigo-50/60 px-3 text-[11px] font-semibold text-indigo-700 cursor-pointer hover:bg-indigo-100">
                  {uploadingDocType === "drug_license" && (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
                  <span>
                    {uploadingDocType === "drug_license"
                      ? "Uploading Drug Licence..."
                      : docPreviews.drug_license
                      ? "Upload new file"
                      : "Upload Drug Licence"}
                  </span>
                  <input
                    id="drug-license-upload-input"
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, "drug_license")}
                    disabled={uploadingDocType === "drug_license"}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Drug licence expiry date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Drug Licence Expiry Date <span className="text-rose-600">*</span>
              </label>
              <input
                type="date"
                name="drug_license_expiry_date"
                value={form.drug_license_expiry_date ?? ""}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <p className="mt-0.5 text-[11px] text-slate-500">
                Drug licence expiry date
              </p>
            </div>
          </div>

          {/* Pharmacist details */}
          <div className="space-y-1.5">
            <div className="sm:col-span-2 relative">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Pharmacist Registration Number <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                name="pharmacist_registration_number"
                value={form.pharmacist_registration_number ?? ""}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Enter Pharmacist Registration Number"
              />
              {form.pharmacist_registration_number && (
                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                  <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-600 text-white text-[8px]">
                    ✓
                  </span>
                </span>
              )}
              <p className="mt-0.5 text-[11px] text-slate-500">
                State Pharmacy Council Registration Number
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              <div className="flex flex-col gap-1">
                <span className="block text-xs font-medium text-slate-700">
                  Pharmacist Certificate <span className="text-rose-600">*</span>
                </span>
                {docPreviews.pharmacist_certificate && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold">
                        ✓
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-emerald-800">
                          File uploaded
                        </p>
                        <button
                          type="button"
                          className="text-[11px] font-medium text-emerald-800 underline underline-offset-2"
                          onClick={() =>
                            window.open(
                              docPreviews.pharmacist_certificate,
                              "_blank",
                              "noopener,noreferrer"
                            )
                          }
                        >
                          View certificate
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="rounded-full p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-800 text-xs"
                      onClick={() =>
                        setDocPreviews((prev) => {
                          const next = { ...prev };
                          delete next.pharmacist_certificate;
                          return next;
                        })
                      }
                      aria-label="Remove pharmacist certificate"
                    >
                      ×
                    </button>
                  </div>
                )}
                <label className="mt-1 flex h-[40px] items-center justify-center rounded-lg border-2 border-dashed border-indigo-300 bg-indigo-50/60 px-3 text-[11px] font-semibold text-indigo-700 cursor-pointer hover:bg-indigo-100">
                  {uploadingDocType === "pharmacist_certificate" && (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
                  <span>
                    {uploadingDocType === "pharmacist_certificate"
                      ? "Uploading Pharmacist Certificate..."
                      : docPreviews.pharmacist_certificate
                      ? "Upload new file"
                      : "Upload Pharmacist Certificate"}
                  </span>
                  <input
                    id="pharmacist-certificate-upload-input"
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, "pharmacist_certificate")}
                    disabled={uploadingDocType === "pharmacist_certificate"}
                  />
                </label>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Pharmacist Certificate Expiry Date{" "}
                  <span className="text-rose-600">*</span>
                </label>
                <input
                  type="date"
                  name="pharmacist_certificate_expiry_date"
                  value={form.pharmacist_certificate_expiry_date ?? ""}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Pharmacist certificate expiry date
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              <div className="flex flex-col gap-1">
                <span className="block text-xs font-medium text-slate-700">
                  State Pharmacy Council Registration{" "}
                  <span className="text-rose-600">*</span>
                </span>
                {docPreviews.pharmacy_council_registration && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold">
                        ✓
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-emerald-800">
                          File uploaded
                        </p>
                        <button
                          type="button"
                          className="text-[11px] font-medium text-emerald-800 underline underline-offset-2"
                          onClick={() =>
                            window.open(
                              docPreviews.pharmacy_council_registration,
                              "_blank",
                              "noopener,noreferrer"
                            )
                          }
                        >
                          View certificate
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="rounded-lg border border-emerald-500 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                      onClick={() => {
                        const input = document.getElementById(
                          "pharmacy-council-registration-upload-input"
                        ) as HTMLInputElement | null;
                        input?.click();
                      }}
                    >
                      Change
                    </button>
                  </div>
                )}
                <label className="mt-1 flex h-[40px] items-center justify-center rounded-lg border-2 border-dashed border-indigo-300 bg-indigo-50/60 px-3 text-[11px] font-semibold text-indigo-700 cursor-pointer hover:bg-indigo-100">
                  {uploadingDocType === "pharmacy_council_registration" && (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
                  <span>
                    {uploadingDocType === "pharmacy_council_registration"
                      ? "Uploading Council Registration..."
                      : docPreviews.pharmacy_council_registration
                      ? "Upload new file"
                      : "Upload Council Registration"}
                  </span>
                  <input
                    id="pharmacy-council-registration-upload-input"
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) =>
                      handleFileUpload(e, "pharmacy_council_registration")
                    }
                    disabled={uploadingDocType === "pharmacy_council_registration"}
                  />
                </label>
              </div>
            </div>
          </div>
        </>
      ) : showFssaiBlock ? (
        <>
          {/* FSSAI documents header */}
          <div className="rounded-lg border border-amber-100 bg-amber-50/80 p-2.5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-900">
                  FSSAI Certificate {fssaiIsMandatory ? "(Mandatory)" : "(Optional)"}
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  {fssaiIsMandatory
                    ? "FSSAI is mandatory for this store type."
                    : "Add FSSAI if you have a licence, or skip this step."}
                </p>
              </div>
            </div>
          </div>
          <div className="mt-1 rounded-lg border border-indigo-100 bg-indigo-50 px-3.5 py-2 text-[11px] sm:text-xs text-indigo-800">
            <div className="flex items-start gap-2">
              <div className="mt-[2px] flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-white text-[10px]">
                i
              </div>
              <div>
                <p className="font-semibold mb-0.5">Note</p>
                <p>
                  {fssaiIsMandatory
                    ? "FSSAI is mandatory. GST can be added separately in the GST section."
                    : "FSSAI is optional for this store type. GST can be added separately in the GST section."}
                </p>
              </div>
            </div>
          </div>
          {(() => {
            const fssaiUnlocked =
              licenceDup.fssaiOk &&
              !licenceDup.checkingFssai &&
              !licenceDup.fssai &&
              !docFormatErrors.fssai_number &&
              (form.fssai_number || "").replace(/\D/g, "").length === 14;
            return (
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,2.1fr)_minmax(0,1.35fr)] gap-2">
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  FSSAI Certificate <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="fssai_number"
                    value={form.fssai_number ?? ""}
                    onChange={handleChange}
                    maxLength={14}
                    inputMode="numeric"
                    className={`w-full rounded-lg border px-3 pr-9 py-2 text-sm ${
                      form.fssai_number
                        ? docFormatErrors.fssai_number || licenceDup.fssai
                          ? "border-rose-400"
                          : licenceDup.fssaiOk
                            ? "border-emerald-400"
                            : "border-slate-300"
                        : "border-slate-300"
                    }`}
                    placeholder="FSSAI License Number"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                    {licenceDup.checkingFssai ? (
                      <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                    ) : licenceDup.fssaiOk &&
                      !docFormatErrors.fssai_number &&
                      !licenceDup.fssai ? (
                      <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-600 text-white text-[8px]">
                        ✓
                      </span>
                    ) : null}
                  </span>
                </div>
                {docFormatErrors.fssai_number && (
                  <p className="mt-0.5 text-[11px] text-rose-600">
                    {docFormatErrors.fssai_number}
                  </p>
                )}
                {!form.fssai_number &&
                  !docFormatErrors.fssai_number &&
                  !licenceDup.checkingFssai && (
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {fssaiIsMandatory ? "FSSAI number must be 14 digits." : "Optional. FSSAI number must be 14 digits."}
                  </p>
                )}
                {licenceDup.checkingFssai && (
                  <p className="mt-0.5 text-[11px] text-indigo-600">
                    Checking FSSAI number…
                  </p>
                )}
              </div>
              <div className={!fssaiUnlocked ? "opacity-50 pointer-events-none" : undefined}>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  FSSAI Expiry Date <span className="text-rose-600">*</span>
                </label>
                <input
                  type="date"
                  name="fssai_expiry_date"
                  value={form.fssai_expiry_date ?? ""}
                  onChange={handleChange}
                  disabled={!fssaiUnlocked}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 disabled:cursor-not-allowed"
                />
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {fssaiUnlocked
                    ? "FSSAI license expiry date (mandatory)"
                    : "Enter a unique 14-digit FSSAI number first"}
                </p>
              </div>
            </div>
            <div
              className={`flex items-end pt-2 sm:pt-0 ${
                !fssaiUnlocked ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              <div className="w-full space-y-1.5">
                <span className="block text-xs font-medium text-slate-700">
                  Upload Certificate <span className="text-rose-600">*</span>
                </span>
                {docPreviews.fssai ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold">
                        ✓
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-emerald-800">
                          File uploaded
                        </p>
                        <button
                          type="button"
                          disabled={!fssaiUnlocked}
                          className="text-[11px] font-medium text-emerald-800 underline underline-offset-2 disabled:cursor-not-allowed"
                          onClick={() =>
                            window.open(
                              docPreviews.fssai,
                              "_blank",
                              "noopener,noreferrer"
                            )
                          }
                        >
                          View certificate
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!fssaiUnlocked}
                        onClick={() => {
                          const input = document.getElementById(
                            "fssai-upload-input"
                          ) as HTMLInputElement | null;
                          input?.click();
                        }}
                        className="rounded-lg border border-emerald-500 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Change
                      </button>
                    </div>
                  </div>
                ) : null}
                <label
                  className={`flex h-[40px] items-center justify-center rounded-lg border-2 border-dashed border-rose-300 bg-rose-50/60 px-3 text-[11px] font-semibold text-rose-700 ${
                    fssaiUnlocked
                      ? "cursor-pointer hover:bg-rose-100"
                      : "cursor-not-allowed"
                  }`}
                >
                  {uploadingDocType === "fssai" && (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
                  <span>
                    {uploadingDocType === "fssai"
                      ? "Uploading Certificate..."
                      : docPreviews.fssai
                      ? "Upload new file"
                      : "Upload Certificate"}
                  </span>
                  <input
                    id="fssai-upload-input"
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, "fssai")}
                    disabled={!fssaiUnlocked || uploadingDocType === "fssai"}
                  />
                </label>
              </div>
            </div>
          </div>
            );
          })()}
        </>
      ) : null}

      {(showTradeBlock || showShopBlock || showUdyamBlock || showOtherBlock) && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 space-y-3">
          {showTradeBlock ? (
          <>
          <p className="text-xs sm:text-sm font-semibold text-slate-800">
            Trade Licence {tradeIsMandatory ? "(Mandatory)" : "(Optional)"}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Trade Licence Number
              </label>
              {form.trade_license_number && docFormatErrors.trade_license_number && (
                <div className="mb-1 flex items-center gap-1.5 text-[11px] text-rose-600">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">
                    ×
                  </span>
                  <span>{docFormatErrors.trade_license_number}</span>
                </div>
              )}
              <div className="relative">
                <input
                  type="text"
                  name="trade_license_number"
                  value={form.trade_license_number ?? ""}
                  onChange={handleChange}
                  className={`w-full rounded-lg border px-3 pr-8 py-2 text-sm ${
                    form.trade_license_number
                      ? docFormatErrors.trade_license_number
                        ? "border-rose-400"
                        : "border-emerald-400"
                      : "border-slate-300"
                  }`}
                  placeholder="Trade licence number"
                />
                {form.trade_license_number && !docFormatErrors.trade_license_number && (
                  <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                    <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-600 text-white text-[8px]">
                      ✓
                    </span>
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col">
              <span className="block text-xs font-medium text-slate-700 mb-1">
                Trade Licence Document
              </span>
              {docPreviews.trade_license ? (
                <div className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] text-emerald-800 hover:bg-emerald-100"
                    onClick={() =>
                      window.open(
                        docPreviews.trade_license,
                        "_blank",
                        "noopener,noreferrer"
                      )
                    }
                  >
                    View file
                  </button>
                  <div className="flex items-center gap-1 rounded-full bg-slate-50 border border-slate-200 px-2 py-1 text-[11px] text-slate-800">
                    <span className="truncate max-w-[120px]">
                      {getFileNameFromUrl(docPreviews.trade_license)}
                    </span>
                    <button
                      type="button"
                      className="ml-1 text-slate-500 hover:text-slate-800"
                      onClick={() =>
                        setDocPreviews((prev) => {
                          const next = { ...prev };
                          if (next.trade_license) URL.revokeObjectURL(next.trade_license);
                          delete next.trade_license;
                          return next;
                        })
                      }
                    >
                      ×
                    </button>
                  </div>
                </div>
              ) : (
                <label className="inline-flex items-center px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-[11px] font-medium text-slate-700 cursor-pointer hover:bg-slate-50 w-fit">
                  {uploadingDocType === "trade_license" && (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
                  <span>
                    {uploadingDocType === "trade_license"
                      ? "Uploading..."
                      : "Upload file"}
                  </span>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, "trade_license")}
                    disabled={uploadingDocType === "trade_license"}
                  />
                </label>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Trade Licence Expiry Date{" "}
                {(form.trade_license_number || docPreviews.trade_license) && (
                  <span className="text-rose-600">*</span>
                )}
              </label>
              <input
                type="date"
                name="trade_license_expiry_date"
                value={form.trade_license_expiry_date ?? ""}
                onChange={handleChange}
                className={`w-full rounded-lg border px-3 py-2 text-sm ${
                  (form.trade_license_number || docPreviews.trade_license) &&
                  !form.trade_license_expiry_date
                    ? "border-rose-400"
                    : "border-slate-300"
                }`}
              />
              {(form.trade_license_number || docPreviews.trade_license) &&
                !form.trade_license_expiry_date && (
                  <p className="mt-0.5 text-[11px] text-rose-600">
                    Expiry date is required when Trade Licence is provided.
                  </p>
                )}
            </div>
          </div>
          </>
          ) : null}
          {showShopBlock ? (
          <>
          <p className="text-xs sm:text-sm font-semibold text-slate-800">
            Shop &amp; Establishment {shopIsMandatory ? "(Mandatory)" : "(Optional)"}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Shop &amp; Establishment Number
              </label>
              {form.shop_establishment_number &&
                docFormatErrors.shop_establishment_number && (
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] text-rose-600">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">
                      ×
                    </span>
                    <span>{docFormatErrors.shop_establishment_number}</span>
                  </div>
                )}
              <div className="relative">
                <input
                  type="text"
                  name="shop_establishment_number"
                  value={form.shop_establishment_number ?? ""}
                  onChange={handleChange}
                  className={`w-full rounded-lg border px-3 pr-8 py-2 text-sm ${
                    form.shop_establishment_number
                      ? docFormatErrors.shop_establishment_number
                        ? "border-rose-400"
                        : "border-emerald-400"
                      : "border-slate-300"
                  }`}
                  placeholder="Registration number"
                />
                {form.shop_establishment_number &&
                  !docFormatErrors.shop_establishment_number && (
                    <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                      <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-600 text-white text-[8px]">
                        ✓
                      </span>
                    </span>
                  )}
              </div>
            </div>
            <div className="flex flex-col">
              <span className="block text-xs font-medium text-slate-700 mb-1">
                Shop &amp; Establishment Document
              </span>
              {docPreviews.shop_establishment ? (
                <div className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] text-emerald-800 hover:bg-emerald-100"
                    onClick={() =>
                      window.open(
                        docPreviews.shop_establishment,
                        "_blank",
                        "noopener,noreferrer"
                      )
                    }
                  >
                    View file
                  </button>
                  <div className="flex items-center gap-1 rounded-full bg-slate-50 border border-slate-200 px-2 py-1 text-[11px] text-slate-800">
                    <span className="truncate max-w-[120px]">
                      {getFileNameFromUrl(docPreviews.shop_establishment)}
                    </span>
                    <button
                      type="button"
                      className="ml-1 text-slate-500 hover:text-slate-800"
                      onClick={() =>
                        setDocPreviews((prev) => {
                          const next = { ...prev };
                          if (next.shop_establishment)
                            URL.revokeObjectURL(next.shop_establishment);
                          delete next.shop_establishment;
                          return next;
                        })
                      }
                    >
                      ×
                    </button>
                  </div>
                </div>
              ) : (
                <label className="inline-flex items-center px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-[11px] font-medium text-slate-700 cursor-pointer hover:bg-slate-50 w-fit">
                  {uploadingDocType === "shop_establishment" && (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
                  <span>
                    {uploadingDocType === "shop_establishment"
                      ? "Uploading..."
                      : "Upload file"}
                  </span>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, "shop_establishment")}
                    disabled={uploadingDocType === "shop_establishment"}
                  />
                </label>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Shop &amp; Establishment Expiry Date{" "}
                <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="date"
                name="shop_establishment_expiry_date"
                value={form.shop_establishment_expiry_date ?? ""}
                onChange={handleChange}
                className="w-full rounded-lg border px-3 py-2 text-sm border-slate-300"
              />
            </div>
          </div>
          </>
          ) : null}
          {showUdyamBlock ? (
          <>
          <p className="text-xs sm:text-sm font-semibold text-slate-800">
            Udyam {udyamIsMandatory ? "(Mandatory)" : "(Optional)"}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Udyam Registration Number
              </label>
              {form.udyam_number && docFormatErrors.udyam_number && (
                <div className="mb-1 flex items-center gap-1.5 text-[11px] text-rose-600">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">
                    ×
                  </span>
                  <span>{docFormatErrors.udyam_number}</span>
                </div>
              )}
              <div className="relative">
                <input
                  type="text"
                  name="udyam_number"
                  value={form.udyam_number ?? ""}
                  onChange={handleChange}
                  className={`w-full rounded-lg border px-3 pr-8 py-2 text-sm ${
                    form.udyam_number
                      ? docFormatErrors.udyam_number
                        ? "border-rose-400"
                        : "border-emerald-400"
                      : "border-slate-300"
                  }`}
                  placeholder="Udyam number"
                />
                {form.udyam_number && !docFormatErrors.udyam_number && (
                  <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                    <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-600 text-white text-[8px]">
                      ✓
                    </span>
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col">
              <span className="block text-xs font-medium text-slate-700 mb-1">
                Udyam Certificate
              </span>
              {docPreviews.udyam ? (
                <div className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] text-emerald-800 hover:bg-emerald-100"
                    onClick={() =>
                      window.open(docPreviews.udyam, "_blank", "noopener,noreferrer")
                    }
                  >
                    View file
                  </button>
                  <div className="flex items-center gap-1 rounded-full bg-slate-50 border border-slate-200 px-2 py-1 text-[11px] text-slate-800">
                    <span className="truncate max-w-[120px]">
                      {getFileNameFromUrl(docPreviews.udyam)}
                    </span>
                    <button
                      type="button"
                      className="ml-1 text-slate-500 hover:text-slate-800"
                      onClick={() =>
                        setDocPreviews((prev) => {
                          const next = { ...prev };
                          if (next.udyam) URL.revokeObjectURL(next.udyam);
                          delete next.udyam;
                          return next;
                        })
                      }
                    >
                      ×
                    </button>
                  </div>
                </div>
              ) : (
                <label className="inline-flex items-center px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-[11px] font-medium text-slate-700 cursor-pointer hover:bg-slate-50 w-fit">
                  {uploadingDocType === "udyam" && (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
                  <span>
                    {uploadingDocType === "udyam"
                      ? "Uploading..."
                      : "Upload file"}
                  </span>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, "udyam")}
                    disabled={uploadingDocType === "udyam"}
                  />
                </label>
              )}
            </div>
          </div>

          </>
          ) : null}
          {showOtherBlock ? (
          <>
          <p className="text-xs sm:text-sm font-semibold text-slate-800">Other document</p>
          {/* Udyam Registration is valid for lifetime – no expiry field */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Other Document Type
              </label>
              <input
                type="text"
                name="other_document_type"
                value={form.other_document_type ?? ""}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="e.g. Food licence, Municipality NOC"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Other Document Number
              </label>
              {form.other_document_number && docFormatErrors.other_document_number && (
                <div className="mb-1 flex items-center gap-1.5 text-[11px] text-rose-600">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">
                    ×
                  </span>
                  <span>{docFormatErrors.other_document_number}</span>
                </div>
              )}
              <div className="relative">
                <input
                  type="text"
                  name="other_document_number"
                  value={form.other_document_number ?? ""}
                  onChange={handleChange}
                  className={`w-full rounded-lg border px-3 pr-8 py-2 text-sm ${
                    form.other_document_number
                      ? docFormatErrors.other_document_number
                        ? "border-rose-400"
                        : "border-emerald-400"
                      : "border-slate-300"
                  }`}
                  placeholder="Reference / registration number"
                />
                {form.other_document_number &&
                  !docFormatErrors.other_document_number && (
                    <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                      <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-600 text-white text-[8px]">
                        ✓
                      </span>
                    </span>
                  )}
              </div>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="block text-xs font-medium text-slate-700 mb-1">
              Other Document File
            </span>
            {docPreviews.other ? (
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] text-emerald-800 hover:bg-emerald-100"
                  onClick={() =>
                    window.open(docPreviews.other, "_blank", "noopener,noreferrer")
                  }
                >
                  View file
                </button>
                <div className="flex items-center gap-1 rounded-full bg-slate-50 border border-slate-200 px-2 py-1 text-[11px] text-slate-800">
                  <span className="truncate max-w-[120px]">
                    {getFileNameFromUrl(docPreviews.other)}
                  </span>
                  <button
                    type="button"
                    className="ml-1 text-slate-500 hover:text-slate-800"
                    onClick={() =>
                      setDocPreviews((prev) => {
                        const next = { ...prev };
                        if (next.other) URL.revokeObjectURL(next.other);
                        delete next.other;
                        return next;
                      })
                    }
                  >
                    ×
                  </button>
                </div>
              </div>
            ) : (
              <label className="inline-flex items-center px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-[11px] font-medium text-slate-700 cursor-pointer hover:bg-slate-50 w-fit">
                {uploadingDocType === "other" && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                <span>
                  {uploadingDocType === "other" ? "Uploading..." : "Upload file"}
                </span>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => handleFileUpload(e, "other")}
                  disabled={uploadingDocType === "other"}
                />
              </label>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Other Document Expiry Date{" "}
                <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="date"
                name="other_expiry_date"
                value={form.other_expiry_date ?? ""}
                onChange={handleChange}
                className="w-full rounded-lg border px-3 py-2 text-sm border-slate-300"
              />
            </div>
          </div>
          </>
          ) : null}
        </div>
      )}
    </div>
    );
  };

  const renderBankSection = () => {
    const bankVerified =
      bankVerify.state === "verified" || !!form.bank_is_verified;
    const showManualBankFields =
      !bankVerified &&
      (!isElectronic(bankMode) || uploadAllowedFor(bankMode, bankVerify));

    return (
    <div className="space-y-3">
      <div className="rounded-lg bg-amber-50/80 border border-amber-100 p-3">
        <div className="flex items-start gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 text-sm font-bold">
            ₹
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-900">Payout details</p>
            <p className="text-xs text-amber-800 mt-0.5">
              Choose Bank Account or UPI for payouts. Switch the toggle to verify
              each separately.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-2">
        <p className="text-xs font-medium text-slate-700">
          Use for payout <span className="text-rose-600">*</span>
        </p>
        <div className="rounded-lg border border-slate-200 bg-white p-1 flex text-xs sm:text-sm font-medium text-slate-600">
          <button
            type="button"
            onClick={() => setPayoutMode("BANK")}
            className={`flex-1 rounded-md py-2 transition-colors ${
              payoutMode === "BANK"
                ? "bg-indigo-600 text-white shadow"
                : "text-slate-600 hover:text-slate-800"
            }`}
          >
            Bank Account
          </button>
          <button
            type="button"
            onClick={() => setPayoutMode("UPI")}
            className={`flex-1 rounded-md py-2 transition-colors ${
              payoutMode === "UPI"
                ? "bg-indigo-600 text-white shadow"
                : "text-slate-600 hover:text-slate-800"
            }`}
          >
            UPI
          </button>
        </div>
      </div>

      {payoutMode === "BANK" && (
      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-800">Bank account</p>
          {bankVerified && (
            <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
              Verified
            </span>
          )}
        </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Account number <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                name="bank_account_number"
                value={form.bank_account_number ?? ""}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                placeholder="e.g. 123456789012"
              />
              {docFormatErrors.bank_account_number && (
                <p className="text-xs text-rose-600 mt-1">
                  {docFormatErrors.bank_account_number}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                IFSC code <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                name="bank_ifsc_code"
                value={form.bank_ifsc_code ?? ""}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase"
                placeholder="E.g. SBIN0001234"
              />
              {docFormatErrors.bank_ifsc_code && (
                <p className="text-xs text-rose-600 mt-1">
                  {docFormatErrors.bank_ifsc_code}
                </p>
              )}
            </div>
          </div>

          {isElectronic(bankMode) &&
            !!String(form.bank_account_number || "").trim() &&
            !!String(form.bank_ifsc_code || "").trim() && (
              <div className="space-y-2">
                {bankVerified ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[11px]">
                        ✓
                      </span>
                      Bank account verified automatically
                    </p>
                    {verifiedDetailRows(
                      bankVerify.details ||
                        form.bank_verified_details ||
                        undefined,
                    ).map(([l, v]) => (
                      <p key={l} className="mt-1 text-xs text-emerald-800">
                        <span className="font-medium">{l}:</span> {v}
                      </p>
                    ))}
                    <div className="mt-2 max-w-xs">
                      <label className="block text-xs font-medium text-emerald-900 mb-1">
                        Account type <span className="text-rose-600">*</span>
                      </label>
                      <select
                        name="bank_account_type"
                        value={
                          ["SAVINGS", "CURRENT"].includes(
                            String(form.bank_account_type || "").toUpperCase(),
                          )
                            ? String(form.bank_account_type).toUpperCase()
                            : ""
                        }
                        onChange={handleChange}
                        className="w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm bg-white"
                      >
                        <option value="">Select</option>
                        <option value="SAVINGS">Savings</option>
                        <option value="CURRENT">Current</option>
                      </select>
                      <p className="mt-1 text-[11px] text-emerald-700">
                        Cashfree does not return account type — please confirm
                        Savings or Current.
                      </p>
                    </div>
                    <p className="mt-1.5 text-xs text-emerald-700">
                      No bank proof upload needed. You can continue.
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={
                      bankVerify.state === "verifying" ||
                      !!documentFormatValidators.accountNumber(
                        String(form.bank_account_number || ""),
                      ) ||
                      !!documentFormatValidators.ifsc(
                        String(form.bank_ifsc_code || ""),
                      )
                    }
                    onClick={() => verifyDocNow("bank")}
                    className="inline-flex w-fit items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {bankVerify.state === "verifying" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Verifying…
                      </>
                    ) : (
                      "Verify Bank Account"
                    )}
                  </button>
                )}
                {bankVerify.state === "failed" && (
                  <div
                    className={`rounded-lg border p-3 text-xs ${
                      bankMode === "auto"
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : "border-amber-200 bg-amber-50 text-amber-800"
                    }`}
                  >
                    <span className="font-semibold">
                      {bankMode === "auto"
                        ? "Bank verification failed. "
                        : "Instant verification didn't succeed. "}
                    </span>
                    {bankVerify.error || "Please check account number / IFSC."}
                    {bankMode === "hybrid"
                      ? " Enter details manually and upload bank proof."
                      : " Retry later — automatic verification is required."}
                  </div>
                )}
              </div>
            )}

          {showManualBankFields && (
            <>
              {isElectronic(bankMode) &&
                uploadAllowedFor(bankMode, bankVerify) && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Auto verification didn&apos;t succeed — enter bank details
                    manually and upload proof.
                  </p>
                )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Account holder name <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    name="bank_account_holder_name"
                    value={form.bank_account_holder_name ?? ""}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="As per bank record"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Bank name <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    name="bank_name"
                    value={form.bank_name ?? ""}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="e.g. State Bank of India"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Branch name
                  </label>
                  <input
                    type="text"
                    name="bank_branch_name"
                    value={form.bank_branch_name ?? ""}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Account type
                  </label>
                  <select
                    name="bank_account_type"
                    value={form.bank_account_type ?? ""}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    <option value="">Select</option>
                    <option value="SAVINGS">Savings</option>
                    <option value="CURRENT">Current</option>
                  </select>
                </div>
              </div>

              {/* Bank proof selection + upload */}
              <div className="space-y-2">
                <div>
                  <p className="text-xs font-medium text-slate-700">
                    Bank proof <span className="text-rose-600">*</span>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Upload one: Passbook, Cancelled cheque, or Bank statement
                  </p>
                </div>
                <div className="flex flex-wrap gap-4 text-[11px] text-slate-700">
                  {["PASSBOOK", "CHEQUE", "STATEMENT"].map((type) => (
                    <label
                      key={type}
                      className="inline-flex items-center gap-1 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="bank_proof_type"
                        className="h-3 w-3 text-indigo-600"
                        checked={form.bank_proof_type === type}
                        onChange={() =>
                          setForm((prev) => ({ ...prev, bank_proof_type: type }))
                        }
                      />
                      <span>
                        {type === "PASSBOOK"
                          ? "Passbook"
                          : type === "CHEQUE"
                            ? "Cancelled Cheque"
                            : "Bank Statement"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/80 px-4 py-4 text-center">
                <p className="text-xs sm:text-sm font-medium text-slate-700 mb-1">
                  Upload passbook / cancelled cheque / bank statement
                </p>
                <p className="text-[11px] text-slate-500">
                  File will be saved as bank proof and used for payout
                  verification.
                </p>
                <div className="mt-3 flex flex-col items-center gap-2">
                  <label className="inline-flex items-center px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium cursor-pointer hover:bg-indigo-700">
                    {uploadingDocType === "bank_proof" && (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    )}
                    <span>
                      {uploadingDocType === "bank_proof"
                        ? "Uploading..."
                        : docPreviews.bank_proof
                          ? "Upload new file"
                          : "Upload passbook / cheque / statement"}
                    </span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e, "bank_proof")}
                      disabled={uploadingDocType === "bank_proof"}
                    />
                  </label>
                  {docPreviews.bank_proof && (
                    <button
                      type="button"
                      className="text-[11px] text-emerald-800 underline underline-offset-2"
                      onClick={() =>
                        window.open(
                          docPreviews.bank_proof,
                          "_blank",
                          "noopener,noreferrer",
                        )
                      }
                    >
                      View uploaded proof
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {payoutMode === "UPI" && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800">UPI</p>
            {(upiVerify.state === "verified" || !!form.upi_verified) && (
              <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                Verified
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                UPI ID <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                name="upi_id"
                value={form.upi_id ?? ""}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="e.g. merchant@upi"
              />
            </div>
          </div>

          {isElectronic(upiMode) && !!String(form.upi_id || "").trim() && (
            <div className="space-y-2">
              {upiVerify.state === "verified" || form.upi_verified ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[11px]">
                      ✓
                    </span>
                    UPI ID verified automatically
                  </p>
                  {verifiedDetailRows(
                    upiVerify.details || form.upi_verified_details || undefined,
                  ).map(([l, v]) => (
                    <p key={l} className="mt-1 text-xs text-emerald-800">
                      <span className="font-medium">{l}:</span> {v}
                    </p>
                  ))}
                  <p className="mt-1.5 text-xs text-emerald-700">
                    No QR screenshot needed. You can continue.
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={
                    upiVerify.state === "verifying" ||
                    !/^[a-z0-9.\-_]{2,256}@[a-z0-9]{2,64}$/i.test(
                      String(form.upi_id || "").trim(),
                    )
                  }
                  onClick={() => verifyDocNow("upi")}
                  className="inline-flex w-fit items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {upiVerify.state === "verifying" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Verifying…
                    </>
                  ) : (
                    "Verify UPI ID"
                  )}
                </button>
              )}
              {upiVerify.state === "failed" && (
                <div
                  className={`rounded-lg border p-3 text-xs ${
                    upiMode === "auto"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-amber-200 bg-amber-50 text-amber-800"
                  }`}
                >
                  <span className="font-semibold">
                    {upiMode === "auto"
                      ? "UPI verification failed. "
                      : "Instant verification didn't succeed. "}
                  </span>
                  {upiVerify.error || "Please check the UPI ID."}
                  {upiMode === "hybrid"
                    ? " Upload a UPI QR screenshot where the UPI ID is clearly visible."
                    : " Retry later — automatic verification is required."}
                </div>
              )}
            </div>
          )}

          {!(
            upiVerify.state === "verified" || form.upi_verified
          ) &&
            (!isElectronic(upiMode) || uploadAllowedFor(upiMode, upiVerify)) && (
              <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/80 px-4 py-4 text-center">
                {isElectronic(upiMode) && uploadAllowedFor(upiMode, upiVerify) && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2 text-left">
                    Auto verification didn&apos;t succeed — upload a QR screenshot
                    with UPI ID visible.
                  </p>
                )}
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  UPI QR screenshot <span className="text-rose-600">*</span>
                </label>
                <p className="text-[11px] text-slate-500">
                  Upload screenshot where UPI ID is clearly visible on the QR.
                </p>
                <div className="mt-3 flex flex-col items-center gap-2">
                  <label className="inline-flex items-center px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium cursor-pointer hover:bg-indigo-700">
                    {uploadingDocType === "bank_proof" && (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    )}
                    <span>
                      {uploadingDocType === "bank_proof"
                        ? "Uploading..."
                        : docPreviews.upi_qr
                          ? "Upload new screenshot"
                          : "Upload QR screenshot (UPI ID visible)"}
                    </span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e, "bank_proof")}
                      disabled={uploadingDocType === "bank_proof"}
                    />
                  </label>
                  {docPreviews.upi_qr && (
                    <button
                      type="button"
                      className="text-[11px] text-emerald-800 underline underline-offset-2"
                      onClick={() =>
                        window.open(docPreviews.upi_qr, "_blank", "noopener,noreferrer")
                      }
                    >
                      View QR screenshot
                    </button>
                  )}
                </div>
              </div>
            )}
        </div>
      )}
    </div>
    );
  };

  let sectionContent: React.ReactNode = null;
  if (catalogLoaded && catalogFetchFailed) {
    sectionContent = (
      <p className="text-sm text-slate-600">
        Could not load documents for this store type. Refresh the page, or check that
        Super Admin has configured documents under RX / MX Documents type → Merchant.
      </p>
    );
  } else if (catalogLoaded && navDocs.length === 0) {
    sectionContent = (
      <p className="text-sm text-slate-600">
        No documents are configured for this store type. Ask Super Admin to add
        documents under RX / MX Documents type → Merchant.
      </p>
    );
  } else if (activeFormSection === "PAN") sectionContent = renderPanSection();
  else if (activeFormSection === "AADHAAR") sectionContent = renderAadhaarSection();
  else if (activeFormSection === "LICENCE") sectionContent = renderLicenceSection();
  else if (activeFormSection === "GST") sectionContent = renderGstSection();
  else sectionContent = renderBankSection();

  return (
    <>
      <DigilockerConsentSheet
        open={aadhaarVerify.state === "verifying"}
        url={aadhaarVerify.digilockerUrl || null}
        preparing={aadhaarVerify.state === "verifying" && !aadhaarVerify.digilockerUrl}
        popupRef={digilockerPopupRef}
        onClose={() => {
          if (aadhaarPollRef.current) {
            clearInterval(aadhaarPollRef.current);
            aadhaarPollRef.current = null;
          }
          if (digilockerPopupRef.current && !digilockerPopupRef.current.closed) {
            try {
              digilockerPopupRef.current.close();
            } catch {
              /* ignore */
            }
          }
          digilockerPopupRef.current = null;
          setAadhaarVerify({ state: "idle" });
          setErr(null);
        }}
        onConsentActivity={() => {
          void pollAadhaarStatusOnce();
        }}
      />
    <div className="w-full min-h-0 max-w-full bg-slate-50/50 overflow-x-hidden">
      <div className="mx-auto flex w-full max-w-6xl flex-col lg:flex-row gap-3 sm:gap-4 p-1 sm:p-2">
        {/* Left: title + business type + tabs (partnersite layout) */}
        <aside className="w-full lg:w-52 xl:w-60 shrink-0 flex flex-col gap-2 sm:gap-3 min-w-0 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
            <h2 className="text-base sm:text-lg font-semibold text-slate-800">Store Documents</h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Upload required documents for verification.
            </p>
            <div className="mt-3 rounded-lg bg-indigo-50/80 border border-indigo-100 p-2.5">
              <p className="text-xs font-semibold text-indigo-900">
                {upperStoreType.replace(/_/g, " ")}
              </p>
              {isPharmaStoreType ? (
                <p className="mt-0.5 text-[11px] text-indigo-700">
                  Drug License & Pharmacist mandatory.
                </p>
              ) : (
                <p className="mt-0.5 text-[11px] text-indigo-700">
                  {storeTypeDocsSidebarHint(resolvedDocs)}
                </p>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
            <p className="px-2 py-1 text-xs font-medium text-slate-500">Sections</p>
            {!catalogLoaded ? (
              <p className="px-3 py-2 text-xs text-slate-400">Loading documents…</p>
            ) : null}
            {step4SectionOrder.map((s) => {
                const nav = navDocs.find((d) => d.code === s);
                const isActive = section === s;
                const sIdx = step4SectionOrder.indexOf(s);
                const locked = sIdx > maxReachedSectionIdx;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      if (locked) return;
                      goToSectionFromSidebar(s);
                    }}
                    disabled={locked}
                    aria-disabled={locked}
                    title={
                      locked
                        ? "Use Save & Continue to open the next section"
                        : undefined
                    }
                    className={`w-full rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-inset ${
                      isActive
                        ? "bg-indigo-600 text-white"
                        : locked
                          ? "cursor-not-allowed text-slate-400"
                          : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {nav ? shortDocNavLabel(nav) : s}
                  </button>
                );
              })}
          </div>
        </aside>

        {/* Right: content + inline actions */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-[320px] sm:min-h-[380px]">
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4">
              {err && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {err}
                </div>
              )}
              {sectionContent}
            </div>
            <div className="shrink-0 border-t border-slate-200 bg-slate-50/80 px-3 sm:px-4 py-2 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => onPrevious?.()}
                disabled={actionLoading || !onPrevious}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              >
                {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Previous
              </button>
              <button
                type="button"
                onClick={() => onContinue?.()}
                disabled={actionLoading || continueDisabled || !onContinue}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              >
                {actionLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
                {actionLoading ? "Saving…" : continueLabel}
              </button>
            </div>
          </div>
        </main>
      </div>
      {replaceTarget && (
        <div className="fixed inset-0 z-[2400] flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white shadow-xl border border-amber-200">
            <div className="px-4 py-3 border-b border-amber-100 flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-lg">
                !
              </div>
              <h2 className="text-sm sm:text-base font-semibold text-slate-800">
                Replace document?
              </h2>
            </div>
            <div className="px-4 py-3 text-xs sm:text-sm text-slate-700">
              The existing file will be replaced. This action cannot be undone.
              Do you want to continue?
            </div>
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setReplaceTarget(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = replaceTarget;
                  setReplaceTarget(null);
                  if (target === "pan") {
                    panInputRef.current?.click();
                  } else if (target === "aadhaar_front") {
                    aadhaarFrontInputRef.current?.click();
                  } else if (target === "aadhaar_back") {
                    aadhaarBackInputRef.current?.click();
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs sm:text-sm font-medium hover:bg-amber-700"
              >
                Yes, replace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
};

export default Step4Documents;

