"use client";

import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

export type Step4Patch = {
  pan_number?: string;
  pan_holder_name?: string;
  aadhar_number?: string;
  aadhar_holder_name?: string;
  gst_number?: string;
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
  upi_id?: string;
  payout_method?: string;
  bank_proof_file_url?: string;
  upi_qr_screenshot_url?: string;
};

export type Step4SectionKey = "PAN" | "AADHAAR" | "GST" | "BANK";

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
  /** Notify parent when all mandatory Step 4 fields (current store type) are valid. */
  onRequiredValidChange?: (valid: boolean) => void;
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
}) => {
  const [sectionInternal, setSectionInternal] = useState<Step4SectionKey>("PAN");
  const section = sectionProp ?? sectionInternal;
  const setSection = (s: Step4SectionKey) => {
    if (onSectionChange) onSectionChange(s);
    else setSectionInternal(s);
  };

  const [form, setForm] = useState<Step4Patch>({
    pan_number: "",
    pan_holder_name: "",
    aadhar_number: "",
    aadhar_holder_name: "",
    gst_number: "",
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
    upi_id: "",
    payout_method: "bank",
    bank_proof_file_url: "",
    upi_qr_screenshot_url: "",
  });

  // Hydrate form once when initialForm is provided (e.g. from Partner Site or saved AM progress)
  useEffect(() => {
    if (initialForm) {
      setForm((prev) => ({ ...prev, ...initialForm }));
      if (initialForm.payout_method) {
        const method = initialForm.payout_method.toLowerCase();
        setPayoutMode(method === "upi" ? "UPI" : "BANK");
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

  const [gstCertificateToggle, setGstCertificateToggle] = useState<"NO" | "YES">(
    "NO"
  );

  const [showOtherLicences, setShowOtherLicences] = useState(false);
  const [payoutMode, setPayoutMode] = useState<"BANK" | "UPI">("BANK");

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
    aadhar: (v: string) =>
      /^\d{12}$/.test((v || "").replace(/\s/g, ""))
        ? ""
        : "Invalid Aadhaar. Must be exactly 12 digits",
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
  }>({});

  const upperStoreType = (storeType || "RESTAURANT").toUpperCase();
  const isFoodRelatedStoreType =
    upperStoreType === "RESTAURANT" ||
    upperStoreType === "CAFE" ||
    upperStoreType === "BAKERY" ||
    upperStoreType === "CLOUD_KITCHEN" ||
    upperStoreType === "GROCERY";

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

  // If GST certificate already exists (from DB or upload), keep GST toggle on "YES"
  useEffect(() => {
    if (docPreviews.gst) {
      setGstCertificateToggle("YES");
    }
  }, [docPreviews.gst]);

  const panInputRef = useRef<HTMLInputElement | null>(null);
  const aadhaarFrontInputRef = useRef<HTMLInputElement | null>(null);
  const aadhaarBackInputRef = useRef<HTMLInputElement | null>(null);
  type ReplaceTarget = null | "pan" | "aadhaar_front" | "aadhaar_back";
  const [replaceTarget, setReplaceTarget] = useState<ReplaceTarget>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
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
    } else if (name === "bank_ifsc_code") {
      value = value.toUpperCase();
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
        aadhar_number: trimmedValue
          ? documentFormatValidators.aadhar(value.replace(/\s/g, ""))
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
    }
  };

  // Notify parent whenever the local Step 4 form snapshot changes.
  // Using an effect avoids calling parent setState during render of this component.
  useEffect(() => {
    onPatchChange?.(form);
  }, [form, onPatchChange]);

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

    if (section === "PAN") {
      // Only PAN related things required on PAN section
      valid = hasPanNumber && hasPanHolder && hasPanImage;
    } else if (section === "GST") {
      // Regulator document required on GST/Drug Lic section
      let hasRegulatorDoc: boolean;
      if (upperStoreType === "PHARMA") {
        hasRegulatorDoc =
          !!form.drug_license_number &&
          form.drug_license_number.trim().length > 0 &&
          !docFormatErrors.drug_license_number;
      } else if (isFoodRelatedStoreType) {
        hasRegulatorDoc =
          !!form.fssai_number &&
          form.fssai_number.trim().length > 0 &&
          !docFormatErrors.fssai_number;
      } else {
        // Non-food store types don't require FSSAI in onboarding.
        hasRegulatorDoc = true;
      }
      valid = hasRegulatorDoc;
    } else if (section === "BANK") {
      // Bank section: basic payout details
      const hasBankName = !!form.bank_name && form.bank_name.trim().length > 0;
      const hasAccountNumber =
        !!form.bank_account_number &&
        form.bank_account_number.trim().length > 0;
      const hasIfsc =
        !!form.bank_ifsc_code && form.bank_ifsc_code.trim().length > 0;

      const hasUpiId = !!form.upi_id && form.upi_id.trim().length > 0;
      const upiPattern = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9]{2,64}$/;
      const hasValidUpiId =
        hasUpiId && upiPattern.test(form.upi_id!.trim());
      const hasBankProof = !!docPreviews.bank_proof;
      const hasUpiQr = !!docPreviews.upi_qr;

      // User can proceed with EITHER:
      // - full bank details + bank proof, OR
      // - UPI ID (valid format) + QR screenshot (for UPI mode)
      if (payoutMode === "UPI") {
        valid = hasValidUpiId && hasUpiQr;
      } else {
        valid = hasBankName && hasAccountNumber && hasIfsc && hasBankProof;
      }
    } else {
      // Aadhaar section is fully optional
      valid = true;
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
  }, [form, docPreviews, upperStoreType, section, onRequiredValidChange]);

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
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3">
        <p className="text-xs sm:text-sm font-medium text-indigo-800">
          PAN Card (Mandatory)
        </p>
        <p className="mt-1 text-[11px] sm:text-xs text-indigo-700">
          PAN is required for store verification. Format: ABCDE1234F.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Name as on PAN *
          </label>
          <input
            type="text"
            name="pan_holder_name"
            value={form.pan_holder_name ?? ""}
            onChange={handleChange}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Full name as on PAN card"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            PAN Number *
          </label>
          <div className="relative">
            <input
              type="text"
              name="pan_number"
              value={form.pan_number ?? ""}
              onChange={handleChange}
              className={`w-full rounded-lg border px-3 pr-8 py-2 text-sm uppercase tracking-[0.06em] ${
                form.pan_number
                  ? docFormatErrors.pan_number
                    ? "border-rose-400"
                    : "border-emerald-400"
                  : "border-slate-300"
              }`}
              placeholder="ABCDE1234F"
              maxLength={10}
            />
            {form.pan_number && !docFormatErrors.pan_number && (
              <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-600 text-white text-[8px]">
                  ✓
                </span>
              </span>
            )}
          </div>
          {docFormatErrors.pan_number && (
            <p className="mt-0.5 text-[11px] text-rose-600">{docFormatErrors.pan_number}</p>
          )}
          {!form.pan_number && !docFormatErrors.pan_number && (
            <p className="mt-0.5 text-[11px] text-slate-500">
              10 characters, auto uppercase (e.g. ABCDE1234F)
            </p>
          )}
        </div>
      </div>
      {/* Upload state box */}
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
            PAN Card Image *
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
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] sm:text-xs text-amber-800">
        PAN must be valid and belong to the business owner or authorised
        signatory.
      </div>
    </div>
  );

  const renderAadhaarSection = () => (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3">
        <p className="text-xs sm:text-sm font-medium text-indigo-800 flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            Aadhaar Card
          </span>
          <span className="text-[11px] sm:text-xs font-normal text-indigo-800">
            Optional
          </span>
        </p>
        <p className="mt-1 text-[11px] sm:text-xs text-indigo-700">
          Identity verification. Images are optional—number and name are sufficient.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              className={`w-full rounded-lg border px-3 pr-8 py-2 text-sm bg-slate-50 ${
                form.aadhar_number
                  ? docFormatErrors.aadhar_number
                    ? "border-rose-400"
                    : "border-emerald-400"
                  : "border-slate-300"
              }`}
              placeholder="960334402444"
              maxLength={12}
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
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] sm:text-xs text-amber-800">
        Both sides should be clear and readable.
      </div>
    </div>
  );

  const renderGstOptionalBlock = () => (
    <>
      {gstCertificateToggle === "YES" && (
        <div className="mt-1 space-y-2">
          <label className="block text-xs font-medium text-slate-700 mb-1">
            GSTIN
          </label>
          <div className="flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
              <div className="relative flex-1 min-w-0">
                <input
                  type="text"
                  name="gst_number"
                  value={form.gst_number ?? ""}
                  onChange={handleChange}
                  className={`w-full rounded-lg border px-3 pr-8 py-2 text-sm uppercase ${
                    form.gst_number
                      ? docFormatErrors.gst_number
                        ? "border-rose-400"
                        : "border-emerald-400"
                      : "border-slate-300"
                  }`}
                  placeholder="15 CHARACTER GSTIN"
                />
                {form.gst_number && !docFormatErrors.gst_number && (
                  <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                    <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-600 text-white text-[8px]">
                      ✓
                    </span>
                  </span>
                )}
              </div>
              <div className="mt-2 sm:mt-0 flex items-center gap-2">
                <label className="inline-flex items-center px-3 py-1.5 rounded-lg border border-dashed border-slate-300 text-[11px] font-medium text-slate-700 cursor-pointer hover:bg-slate-50">
                  {uploadingDocType === "gst" && (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
                  <span>{docPreviews.gst ? "Change file" : "Upload Certificate"}</span>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, "gst")}
                    disabled={uploadingDocType === "gst"}
                  />
                </label>
                {docPreviews.gst && (
                  <>
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
                  </>
                )}
              </div>
            </div>
            {docPreviews.gst && (
              <div className="flex justify-start">
                <img
                  src={docPreviews.gst}
                  alt="GST certificate preview"
                  className="h-20 rounded-md border border-slate-200 object-cover"
                />
              </div>
            )}
            <p className="text-[11px] text-slate-500">
              Optional for non-GST businesses.
            </p>
            {docFormatErrors.gst_number && (
              <p className="mt-0.5 text-[11px] text-rose-600">
                {docFormatErrors.gst_number}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );

  const renderGstSection = () => (
    <div className="space-y-2">
      {/* Pharma specific layout (images 1 & 2) */}
      {upperStoreType === "PHARMA" ? (
        <>
          {/* Pharma documents header */}
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/70 px-3 py-1.5">
            <p className="text-[11px] sm:text-xs font-semibold text-indigo-900">
              Pharma Documents (Mandatory)
            </p>
            <p className="mt-0.5 text-[10px] sm:text-[11px] text-indigo-700">
              Drug License and Pharmacist details mandatory for pharmacy as per drug
              regulations.
            </p>
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
                className={`w-full rounded-lg border px-3 py-2 text-sm ${
                  docFormatErrors.drug_license_number
                    ? "border-rose-400 focus:border-rose-500 focus:ring-rose-200"
                    : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-200"
                }`}
                placeholder="Enter Drug Licence Number"
              />
              {form.drug_license_number &&
                !docFormatErrors.drug_license_number && (
                  <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                    <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-600 text-white text-[8px]">
                      ✓
                    </span>
                  </span>
                )}
              {docFormatErrors.drug_license_number && (
                <p className="mt-0.5 text-[11px] text-rose-600">
                  {docFormatErrors.drug_license_number}
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
                          // allow replacing via same input
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

          {/* GST Certificate optional toggle card */}
          <div className="mt-1 rounded-lg border border-purple-200 bg-purple-50/80 px-3.5 py-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs sm:text-sm font-semibold text-purple-800">
                GST Certificate (Optional)
              </p>
            </div>
            <div className="inline-flex items-center rounded-full bg-white px-0.5 py-[2px] text-[11px] font-medium">
              <button
                type="button"
                onClick={() => setGstCertificateToggle("NO")}
                className={`px-3 py-1 rounded-full ${
                  gstCertificateToggle === "NO"
                    ? "bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-sm"
                    : "text-slate-600"
                }`}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => setGstCertificateToggle("YES")}
                className={`px-3 py-1 rounded-full ${
                  gstCertificateToggle === "YES"
                    ? "bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-sm"
                    : "text-slate-600"
                }`}
              >
                Yes
              </button>
            </div>
          </div>

          {/* When GST is Yes, show GSTIN + upload row (shared layout) */}
          {renderGstOptionalBlock()}

          {/* Note card as per design */}
          <div className="mt-1 rounded-lg border border-indigo-100 bg-indigo-50 px-3.5 py-2 text-[11px] sm:text-xs text-indigo-800">
            <div className="flex items-start gap-2">
              <div className="mt-[2px] flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-white text-[10px]">
                i
              </div>
              <div>
                <p className="font-semibold mb-0.5">Note</p>
                <p>
                  Pharma documents are mandatory. Store cannot operate without valid
                  Drug Licence and Pharmacist details.
                </p>
              </div>
            </div>
          </div>
        </>
      ) : isFoodRelatedStoreType ? (
        <>
          {/* FSSAI layout for food (matches provided design) */}
          <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3.5 py-2">
            <p className="text-[11px] sm:text-xs font-semibold text-amber-800">
              FSSAI Certificate (Mandatory) – FSSAI license is mandatory for restaurant as per food safety regulations.
            </p>
          </div>
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
                    className={`w-full rounded-lg border px-3 pr-8 py-2 text-sm ${
                      form.fssai_number
                        ? docFormatErrors.fssai_number
                          ? "border-rose-400"
                          : "border-emerald-400"
                        : "border-slate-300"
                    }`}
                    placeholder="FSSAI License Number"
                  />
                  {form.fssai_number && !docFormatErrors.fssai_number && (
                    <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                      <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-600 text-white text-[8px]">
                        ✓
                      </span>
                    </span>
                  )}
                </div>
                {docFormatErrors.fssai_number && (
                  <p className="mt-0.5 text-[11px] text-rose-600">
                    {docFormatErrors.fssai_number}
                  </p>
                )}
                {!form.fssai_number && !docFormatErrors.fssai_number && (
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Required for food businesses as per FSSAI regulations (14 digits)
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  FSSAI Expiry Date <span className="text-rose-600">*</span>
                </label>
                <input
                  type="date"
                  name="fssai_expiry_date"
                  value={form.fssai_expiry_date ?? ""}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <p className="mt-0.5 text-[11px] text-slate-500">
                  FSSAI license expiry date (mandatory)
                </p>
              </div>
            </div>
            <div className="flex items-end pt-2 sm:pt-0">
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
                          className="text-[11px] font-medium text-emerald-800 underline underline-offset-2"
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
                        onClick={() => {
                          const input = document.getElementById(
                            "fssai-upload-input"
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
                <label className="flex h-[40px] items-center justify-center rounded-lg border-2 border-dashed border-rose-300 bg-rose-50/60 px-3 text-[11px] font-semibold text-rose-700 cursor-pointer hover:bg-rose-100">
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
                    disabled={uploadingDocType === "fssai"}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* GST optional toggle similar to pharma design */}
          <div className="mt-1 rounded-lg border border-purple-200 bg-purple-50/80 px-3.5 py-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs sm:text-sm font-semibold text-purple-800">
                GST Certificate (Optional)
              </p>
            </div>
            <div className="inline-flex items-center rounded-full bg-white px-0.5 py-[2px] text-[11px] font-medium">
              <button
                type="button"
                onClick={() => setGstCertificateToggle("NO")}
                className={`px-3 py-1 rounded-full ${
                  gstCertificateToggle === "NO"
                    ? "bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-sm"
                    : "text-slate-600"
                }`}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => setGstCertificateToggle("YES")}
                className={`px-3 py-1 rounded-full ${
                  gstCertificateToggle === "YES"
                    ? "bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-sm"
                    : "text-slate-600"
                }`}
              >
                Yes
              </button>
            </div>
          </div>

          {/* Shared GST optional UI (matches GST design) */}
          {renderGstOptionalBlock()}

          <div className="mt-1 rounded-lg border border-indigo-100 bg-indigo-50 px-3.5 py-2 text-[11px] sm:text-xs text-indigo-800">
            <div className="flex items-start gap-2">
              <div className="mt-[2px] flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-white text-[10px]">
                i
              </div>
              <div>
                <p className="font-semibold mb-0.5">Note</p>
                <p>
                  FSSAI is mandatory for food businesses. GST may be required based on
                  turnover.
                </p>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3.5 py-2">
            <p className="text-[11px] sm:text-xs font-semibold text-slate-700">
              FSSAI is not required for this store type. You can upload GST details if applicable.
            </p>
          </div>

          {/* GST optional toggle */}
          <div className="mt-1 rounded-lg border border-purple-200 bg-purple-50/80 px-3.5 py-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs sm:text-sm font-semibold text-purple-800">
                GST Certificate (Optional)
              </p>
            </div>
            <div className="inline-flex items-center rounded-full bg-white px-0.5 py-[2px] text-[11px] font-medium">
              <button
                type="button"
                onClick={() => setGstCertificateToggle("NO")}
                className={`px-3 py-1 rounded-full ${
                  gstCertificateToggle === "NO"
                    ? "bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-sm"
                    : "text-slate-600"
                }`}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => setGstCertificateToggle("YES")}
                className={`px-3 py-1 rounded-full ${
                  gstCertificateToggle === "YES"
                    ? "bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-sm"
                    : "text-slate-600"
                }`}
              >
                Yes
              </button>
            </div>
          </div>

          {renderGstOptionalBlock()}

          <div className="mt-1 rounded-lg border border-indigo-100 bg-indigo-50 px-3.5 py-2 text-[11px] sm:text-xs text-indigo-800">
            <div className="flex items-start gap-2">
              <div className="mt-[2px] flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-white text-[10px]">
                i
              </div>
              <div>
                <p className="font-semibold mb-0.5">Note</p>
                <p>
                  For non-food businesses, GST is optional in onboarding and can be added if available.
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Additional licences shared across store types – shown as a next (skippable) step */}
      {!showOtherLicences &&
      !form.trade_license_number &&
      !form.trade_license_expiry_date &&
      !form.shop_establishment_number &&
      !form.shop_establishment_expiry_date &&
      !form.udyam_number &&
      !form.other_document_type &&
      !form.other_document_number &&
      !form.other_expiry_date ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs sm:text-sm font-semibold text-slate-800">
              Other licences (optional but recommended)
            </p>
            <p className="mt-0.5 text-[11px] text-slate-600">
              You can add Trade Licence, Shop &amp; Establishment, Udyam and other documents in the next step. This step is completely skippable.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowOtherLicences(true)}
            className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          >
            Add other licences
          </button>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs sm:text-sm font-semibold text-slate-800">
              Other licences (optional but recommended)
            </p>
            <button
              type="button"
              onClick={() => setShowOtherLicences(false)}
              className="text-[11px] font-medium text-slate-600 hover:text-slate-900"
            >
              Hide this step
            </button>
          </div>
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
        </div>
      )}
    </div>
  );

  const renderBankSection = () => (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2">
        <p className="text-[11px] sm:text-xs font-medium text-amber-900 flex items-center gap-1.5">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-white text-xs">
            ₹
          </span>
          Payout details
        </p>
        <p className="mt-0.5 text-[10px] sm:text-[11px] text-amber-800">
          Choose bank account or UPI. Upload proof as required.
        </p>
      </div>

      {/* Tab switcher */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-2 py-1 flex text-xs sm:text-sm font-medium text-slate-600">
        <button
          type="button"
          onClick={() => setPayoutMode("BANK")}
          className={`flex-1 rounded-lg py-2 ${
            payoutMode === "BANK"
              ? "bg-white text-indigo-700 shadow-sm border border-indigo-200"
              : "text-slate-500"
          }`}
        >
          Bank Account
        </button>
        <button
          type="button"
          onClick={() => setPayoutMode("UPI")}
          className={`flex-1 rounded-lg py-2 ${
            payoutMode === "UPI"
              ? "bg-white text-indigo-700 shadow-sm border border-indigo-200"
              : "text-slate-500"
          }`}
        >
          UPI
        </button>
      </div>

      {payoutMode === "BANK" ? (
        <>
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
                Account number <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                name="bank_account_number"
                value={form.bank_account_number ?? ""}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="e.g. 123456789012"
              />
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
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase"
                placeholder="E.g. SBIN0001234"
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
                <label key={type} className="inline-flex items-center gap-1 cursor-pointer">
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
              File will be saved as bank proof and used for payout verification.
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
                    window.open(docPreviews.bank_proof, "_blank", "noopener,noreferrer")
                  }
                >
                  View uploaded proof
                </button>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
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
          <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/80 px-4 py-4 text-center">
            <p className="text-xs sm:text-sm font-medium text-slate-700 mb-1">
              UPI QR screenshot <span className="text-rose-600">*</span>
            </p>
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
        </>
      )}
    </div>
  );

  let sectionContent: React.ReactNode = null;
  if (section === "PAN") sectionContent = renderPanSection();
  else if (section === "AADHAAR") sectionContent = renderAadhaarSection();
  else if (section === "GST") sectionContent = renderGstSection();
  else sectionContent = renderBankSection();

  return (
    <div className="w-full pt-1.5 pb-3 sm:pt-2 sm:pb-4">
      <div className="grid grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)] gap-3 sm:gap-4 items-start">
        {/* Left sidebar (Store Documents + section list) */}
        <aside className="rounded-xl border border-slate-200 bg-white/95 shadow-sm sticky top-0 self-start">
          <div className="border-b border-slate-200 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-slate-900">
              Store Documents
            </h2>
            <p className="mt-1 text-[11px] text-slate-500">
              Upload required documents for verification.
            </p>
            <div className="mt-2 rounded-lg bg-indigo-50 px-3 py-2 text-[11px] text-indigo-800 font-medium">
              {upperStoreType}
              <span className="block text-[10px] text-indigo-700 font-normal">
                {upperStoreType === "PHARMA"
                  ? "Pharma documents mandatory as per regulations."
                  : isFoodRelatedStoreType
                  ? "FSSAI mandatory for food."
                  : "GST optional for non-food stores."}
              </span>
            </div>
          </div>
          <div className="px-3 py-2.5 space-y-1.5">
            {(["PAN", "AADHAAR", "GST", "BANK"] as Step4SectionKey[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSection(s)}
                className={`w-full rounded-lg px-3 py-2 text-left text-xs font-medium cursor-pointer transition-colors ${
                  section === s
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {s === "PAN"
                  ? "PAN"
                  : s === "AADHAAR"
                  ? "Aadhaar"
                  : s === "GST"
                  ? upperStoreType === "PHARMA"
                    ? "Drug Lic. / GST"
                    : isFoodRelatedStoreType
                    ? "GST / FSSAI"
                    : "GST"
                  : "Bank"}
              </button>
            ))}
          </div>
        </aside>

        {/* Right: active section content */}
        <section className="rounded-xl border border-slate-200 bg-white/95 shadow-sm flex flex-col">
          <div className="px-4 sm:px-6 py-1.5 border-b border-slate-200 flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
                {section === "PAN"
                  ? "PAN Card"
                  : section === "AADHAAR"
                  ? "Aadhaar Card"
                  : section === "GST"
                  ? upperStoreType === "PHARMA"
                    ? "Drug Licence / GST"
                    : "FSSAI / GST"
                  : "Payout details"}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                {section === "PAN"
                  ? "Required for verification"
                  : section === "AADHAAR"
                  ? "Optional identity verification"
                  : section === "GST"
                  ? upperStoreType === "PHARMA"
                    ? "Drug licence mandatory for pharma businesses"
                    : isFoodRelatedStoreType
                    ? "FSSAI mandatory for food businesses"
                    : "GST optional for non-food businesses"
                  : "Bank account details for payouts"}
              </p>
            </div>
          </div>

          <div className="px-4 sm:px-6 py-4 flex-1 overflow-y-auto">
            {err && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {err}
              </div>
            )}
            {sectionContent}
          </div>

          {/* Footer actions are handled by the main flow's global Save & Continue button */}
          <div className="px-4 sm:px-6 py-3 border-t border-slate-200 flex justify-end text-[11px] text-slate-500">
            Changes will be saved when you click <strong className="ml-1">Save &amp; Continue</strong> below.
          </div>
        </section>
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
  );
};

export default Step4Documents;

