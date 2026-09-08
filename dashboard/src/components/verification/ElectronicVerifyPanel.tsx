"use client";

/**
 * ElectronicVerifyPanel — agent-triggered Cashfree verification, embeddable in
 * any doc-review surface (rider onboarding page, merchant store verification,
 * super-admin queues).
 *
 * Renders NOTHING when the document is already verified — the whole point is
 * to only offer the tool where the agent still has work to do. Collapsed by
 * default to a single accent button; expands to the per-document input form.
 *
 * Doc number is always required: verification never runs until a valid number
 * is entered (prefill only seeds the field; it does not auto-submit).
 *
 * On success the provider's fetched details are shown and `onVerified` fires
 * so the host page can run its own approve flow (e.g. mark the projection row
 * verified) without the agent re-typing anything.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { Zap, Loader2, ShieldCheck, XCircle, ChevronDown, Copy } from "lucide-react";

export type EvDocKind =
  | "pan"
  | "gstin"
  | "bank_account"
  | "driving_licence"
  | "vehicle_rc"
  | "ifsc"
  | "aadhaar";

export const EV_SUPPORTED_KINDS: ReadonlySet<string> = new Set([
  "pan", "gstin", "bank_account", "driving_licence", "vehicle_rc", "ifsc", "aadhaar",
]);

type EvOutcome =
  | { state: "verified"; data: Record<string, unknown> }
  | { state: "rejected"; reason: string }
  | { state: "error"; message: string }
  | { state: "digilocker"; url: string; verificationId?: string | null };

const FIELD_LABELS: Record<EvDocKind, { number: string; placeholder: string }> = {
  pan: { number: "PAN number", placeholder: "ABCDE1234F" },
  gstin: { number: "GSTIN", placeholder: "22AAAAA0000A1Z5" },
  bank_account: { number: "Account number", placeholder: "0000 1111 2222" },
  driving_licence: { number: "License Number", placeholder: "AS1820230007159" },
  vehicle_rc: { number: "Vehicle RC Number", placeholder: "Ex. PY01MW8769" },
  ifsc: { number: "IFSC", placeholder: "SBIN0001234" },
  aadhaar: { number: "Aadhaar number", placeholder: "1234 5678 9012" },
};

/** Friendly labels for provider payload keys worth showing to the agent. */
const DETAIL_LABELS: Record<string, string> = {
  registered_name: "Registered name",
  name_match_result: "Name match",
  name_match_score: "Match score",
  pan_status: "PAN status",
  category: "Category",
  legal_name_of_business: "Legal Name of Business",
  trade_name_of_business: "Trade name",
  principal_place_address: "Principal Place of Business",
  gst_in_status: "GSTIN status",
  date_of_registration: "Effective Date of Registration",
  name_at_bank: "Name at bank",
  bank_name: "Bank",
  account_status: "Account status",
  dob: "Date of birth",
  holder_name: "Holder name",
  masked_aadhaar: "Masked Aadhaar",
  aadhaar_number: "Aadhaar",
  uid: "UID",
  owner_name: "Owner name",
  vehicle_class: "Vehicle class",
  maker_model: "Maker / model",
  registration_date: "Registered",
  insurance_upto: "Insurance valid till",
  fitness_upto: "Fitness valid till",
  license_type: "Licence type",
  valid_till: "Valid till",
  state: "State",
};

function sanitizePrefillNumber(raw: string | null | undefined): string {
  const n = String(raw ?? "").trim();
  if (!n || n === "?" || n === "-" || n.toLowerCase() === "n/a") return "";
  return n;
}

function validateDocNumber(docKind: EvDocKind, raw: string): string | null {
  const n = raw.trim();
  if (!n) return "Document number is required.";
  switch (docKind) {
    case "pan":
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(n)) {
        return "Enter a valid PAN (e.g. ABCDE1234F).";
      }
      return null;
    case "gstin":
      if (n.length !== 15) return "Enter a valid 15-character GSTIN.";
      return null;
    case "bank_account":
      if (!/^\d{6,20}$/.test(n.replace(/\s+/g, ""))) {
        return "Enter a valid account number (6–20 digits).";
      }
      return null;
    case "driving_licence":
      if (n.replace(/\s+/g, "").length < 6) return "Enter a valid DL number.";
      return null;
    case "vehicle_rc":
      if (n.replace(/\s+/g, "").length < 4) return "Enter a valid vehicle number.";
      return null;
    case "ifsc":
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(n)) return "Enter a valid IFSC.";
      return null;
    case "aadhaar":
      if (!/^\d{12}$/.test(n.replace(/\s+/g, ""))) {
        return "Enter a valid 12-digit Aadhaar number.";
      }
      return null;
    default:
      return n.length >= 4 ? null : "Enter a valid document number.";
  }
}

export function ElectronicVerifyPanel(props: {
  subjectType: "rider" | "merchant_store";
  subjectId: number;
  docKind: EvDocKind;
  /** Already verified? Panel renders nothing. */
  verified: boolean;
  /** Prefills: doc number, name, dob (YYYY-MM-DD), ifsc. */
  prefill?: { number?: string | null; name?: string | null; dob?: string | null; ifsc?: string | null };
  /** R2 object key when an Aadhaar photo is already on the document row. */
  imageKey?: string | null;
  /**
   * Pending provider result awaiting Approve/Discard — blocks a new Cashfree call
   * and reopens the review UI instead.
   */
  hasPendingReview?: boolean;
  onOpenPendingReview?: () => void;
  /** Called after the provider confirms the document (details only — no auto-approve). */
  onVerified?: (data: Record<string, unknown>, meta?: {
    numberUsed: string;
    ifscUsed?: string | null;
    verificationId?: string | null;
    providerReference?: string | null;
    confidence?: number | null;
  }) => void;
  className?: string;
}) {
  const {
    subjectType,
    subjectId,
    docKind,
    verified,
    prefill,
    onVerified,
    hasPendingReview,
    onOpenPendingReview,
    imageKey,
  } = props;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<EvOutcome | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({
    number: sanitizePrefillNumber(prefill?.number),
    name: prefill?.name?.trim() ?? "",
    dob: prefill?.dob?.trim() ?? "",
    ifsc: prefill?.ifsc?.trim() ?? "",
  });
  const numberInputRef = useRef<HTMLInputElement | null>(null);

  // Keep DOB / number in sync when rider profile loads after mount (Cashfree Try style).
  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      number: sanitizePrefillNumber(prefill?.number) || prev.number,
      dob: (prefill?.dob?.trim() || prev.dob).slice(0, 10),
      name: prefill?.name?.trim() || prev.name,
      ifsc: prefill?.ifsc?.trim() || prev.ifsc,
    }));
  }, [prefill?.number, prefill?.dob, prefill?.name, prefill?.ifsc]);

  /** Rider dashboard: number-only for most docs. DL/Aadhaar need DOB; bank needs IFSC. */
  const numberOnly =
    subjectType === "rider" &&
    docKind !== "driving_licence" &&
    docKind !== "bank_account" &&
    docKind !== "aadhaar";

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => numberInputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  if (verified || !EV_SUPPORTED_KINDS.has(docKind)) return null;

  const needsName = !numberOnly && docKind === "pan";
  const optionalName = docKind === "gstin" || docKind === "bank_account" || docKind === "aadhaar";
  const needsDob = docKind === "driving_licence" || docKind === "aadhaar";
  const needsIfsc = docKind === "bank_account";

  const numberError = validateDocNumber(docKind, form.number);
  const nameOk = !needsName || form.name.trim().length >= 2;
  const dobOk = !needsDob || /^\d{4}-\d{2}-\d{2}$/.test(form.dob.trim());
  const ifscOk = !needsIfsc || /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(form.ifsc.trim());
  const canRun = !busy && !numberError && nameOk && dobOk && ifscOk;

  async function run(): Promise<void> {
    const numErr = validateDocNumber(docKind, form.number);
    if (numErr) {
      setFormError(numErr);
      numberInputRef.current?.focus();
      return;
    }
    if (needsName && form.name.trim().length < 2) {
      setFormError("Name as on document is required.");
      return;
    }
    if (needsDob && !/^\d{4}-\d{2}-\d{2}$/.test(form.dob.trim())) {
      setFormError(
        docKind === "aadhaar"
          ? "Enter date of birth as YYYY-MM-DD (as on Aadhaar)."
          : "Enter date of birth as YYYY-MM-DD (same as Cashfree Try DL).",
      );
      return;
    }
    if (needsIfsc && !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(form.ifsc.trim())) {
      setFormError("Enter a valid IFSC.");
      return;
    }

    setFormError(null);
    setBusy(true);
    setOutcome(null);
    try {
      const n = form.number.trim();
      const body: Record<string, unknown> = { subjectType, subjectId, docKind };
      if (docKind === "pan") {
        body.pan = n.toUpperCase();
        if (!numberOnly && form.name.trim()) body.name = form.name.trim();
      } else if (docKind === "gstin") {
        body.gstin = n.toUpperCase();
        body.businessName = form.name.trim() || undefined;
      } else if (docKind === "bank_account") {
        body.bankAccount = n.replace(/\D/g, "");
        body.ifsc = form.ifsc.trim().toUpperCase();
        body.name = form.name.trim() || undefined;
      } else if (docKind === "driving_licence") {
        body.dlNumber = n.toUpperCase().replace(/\s+/g, "");
        body.dob = form.dob.trim();
      } else if (docKind === "vehicle_rc") {
        body.vehicleNumber = n.toUpperCase().replace(/\s+/g, "");
      } else if (docKind === "aadhaar") {
        body.aadhaarNumber = n.replace(/\D/g, "");
        body.dob = form.dob.trim() || undefined;
        body.name = form.name.trim() || undefined;
        if (imageKey?.trim()) body.imageKey = imageKey.trim();
      } else {
        body.ifsc = n.toUpperCase();
      }

      const res = await fetch("/api/super-admin/verification/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d?.success) {
        setOutcome({ state: "error", message: String(d?.error ?? `HTTP ${res.status}`) });
        return;
      }
      const o = (d.outcome ?? {}) as {
        kind?: string;
        status?: string;
        status_reason?: string;
        verified_data?: Record<string, unknown>;
        reason?: string;
        detail?: string | null;
        verification_id?: string;
        provider_reference?: string | null;
        confidence?: number | null;
      };
      if (o.kind === "auto" && o.status === "verified") {
        const data = o.verified_data ?? {};
        const numberUsed =
          docKind === "bank_account" || docKind === "aadhaar"
            ? n.replace(/\D/g, "")
            : n.toUpperCase();
        setOutcome({ state: "verified", data });
        onVerified?.(data, {
          numberUsed,
          ifscUsed:
            docKind === "bank_account" ? form.ifsc.trim().toUpperCase() : null,
          verificationId: o.verification_id ?? null,
          providerReference: o.provider_reference ?? null,
          confidence: typeof o.confidence === "number" ? o.confidence : null,
        });
        setOpen(false);
      } else if (o.kind === "auto" && o.status === "provider_processing") {
        const url = String((o.verified_data as { url?: string } | undefined)?.url ?? "").trim();
        if (url) {
          setOutcome({
            state: "digilocker",
            url,
            verificationId: o.verification_id ?? null,
          });
          return;
        }
        setOutcome({
          state: "error",
          message: o.status_reason || "DigiLocker link was not returned.",
        });
      } else if (o.kind === "auto") {
        setOutcome({ state: "rejected", reason: o.status_reason || o.status || "rejected" });
      } else {
        setOutcome({ state: "error", message: o.detail || o.reason || "Provider unavailable." });
      }
    } catch (e) {
      setOutcome({ state: "error", message: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setBusy(false);
    }
  }

  const detailRows = (data: Record<string, unknown>): Array<[string, string]> =>
    Object.entries(data)
      .filter(([k, v]) => v != null && typeof v !== "object" && DETAIL_LABELS[k])
      .map(([k, v]) => [DETAIL_LABELS[k], String(v)] as [string, string])
      .slice(0, 8);

  const input = (
    key: "number" | "name" | "dob" | "ifsc",
    label: string,
    placeholder: string,
    opts?: { required?: boolean; inputRef?: RefObject<HTMLInputElement | null> },
  ) => (
    <div className={key === "number" ? "sm:col-span-2" : undefined}>
      <label className="mb-0.5 block text-[11px] font-medium text-indigo-900/70">
        {label}
        {opts?.required ? <span className="text-rose-600"> *</span> : null}
      </label>
      <input
        ref={opts?.inputRef}
        type={key === "dob" ? "date" : "text"}
        value={form[key] ?? ""}
        onChange={(e) => {
          setFormError(null);
          setForm((p) => ({ ...p, [key]: e.target.value }));
        }}
        placeholder={placeholder}
        autoComplete="off"
        max={key === "dob" ? new Date().toISOString().slice(0, 10) : undefined}
        className="w-full rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 font-mono text-xs shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
      />
    </div>
  );

  return (
    <div className={props.className ?? "mt-3"}>
      {!open ? (
        <button
          type="button"
          onClick={() => {
            if (hasPendingReview) {
              onOpenPendingReview?.();
              return;
            }
            setOpen(true);
            setFormError(null);
            setOutcome(null);
          }}
          className="group inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:from-indigo-700 hover:to-violet-700 hover:shadow-md"
        >
          <Zap className="h-3.5 w-3.5 transition-transform group-hover:scale-110" />
          {hasPendingReview ? "Review fetched details" : "Verify electronically"}
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>
      ) : (
        <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50/60 p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
              <Zap className="h-3.5 w-3.5 text-indigo-600" /> Electronic verification
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-indigo-300 hover:text-indigo-500"
              aria-label="Close"
            >
              &times;
            </button>
          </div>

          {outcome?.state === "verified" ? (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                <ShieldCheck className="h-4 w-4" /> Details fetched — open review to Approve or Discard
              </div>
            </div>
          ) : outcome?.state === "digilocker" ? (
            <div className="rounded-lg border border-indigo-200 bg-white p-2.5">
              <p className="text-[11px] font-semibold text-indigo-900">
                No Aadhaar photo on file — Cashfree DigiLocker link (same as the rider app).
              </p>
              <p className="mt-1 text-[11px] text-indigo-800/80">
                Send this URL to the rider. After they finish consent, refresh this page.
              </p>
              <div className="mt-2 flex items-center gap-1.5">
                <input
                  readOnly
                  value={outcome.url}
                  className="min-w-0 flex-1 rounded-lg border border-indigo-200 bg-indigo-50/60 px-2 py-1.5 font-mono text-[10px] text-indigo-900"
                />
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(outcome.url)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-indigo-800 hover:bg-indigo-50"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </button>
              </div>
              <a
                href={outcome.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-[11px] font-semibold text-indigo-700 underline"
              >
                Open DigiLocker
              </a>
            </div>
          ) : (
            <>
              <p className="mb-2 text-[11px] text-indigo-800/80">
                {docKind === "driving_licence"
                  ? "Same as Cashfree Try Driving License: enter License Number + Date of Birth, then verify."
                  : docKind === "vehicle_rc"
                    ? "Same as Cashfree Try Vehicle RC: enter Vehicle RC Number, then verify."
                  : docKind === "aadhaar"
                    ? "Enter 12-digit Aadhaar + date of birth. If a card photo is uploaded, Cashfree reads it; otherwise a DigiLocker link is generated for the rider."
                  : numberOnly
                    ? "Enter the document number, then run verification."
                    : "Enter the document number first. Verification runs only after a valid number is provided."}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {input(
                  "number",
                  FIELD_LABELS[docKind].number,
                  FIELD_LABELS[docKind].placeholder,
                  { required: true, inputRef: numberInputRef },
                )}
                {needsName ? input("name", "Name as on PAN", "Full name", { required: true }) : null}
                {optionalName
                  ? input(
                      "name",
                      docKind === "gstin"
                        ? "Business name (optional)"
                        : docKind === "aadhaar"
                          ? "Name as on Aadhaar (optional)"
                          : "Holder name (optional)",
                      "",
                    )
                  : null}
                {needsDob ? input("dob", "Date of Birth", "2001-05-17", { required: true }) : null}
                {needsIfsc ? input("ifsc", "IFSC", "SBIN0001234", { required: true }) : null}
              </div>
              {formError || (form.number.trim() && numberError) ? (
                <p className="mt-1.5 text-[11px] font-medium text-rose-700">
                  {formError || numberError}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => void run()}
                disabled={!canRun}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                title={!form.number.trim() ? "Enter document number first" : undefined}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                {busy
                  ? "Verifying…"
                  : docKind === "driving_licence" || docKind === "vehicle_rc" || docKind === "aadhaar"
                    ? "Verify"
                    : "Run verification"}
              </button>
              {outcome?.state === "rejected" ? (
                <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-700">
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span><b>Provider rejected:</b> {outcome.reason}</span>
                </div>
              ) : null}
              {outcome?.state === "error" ? (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
                  <b>Could not verify:</b> {outcome.message}
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}
