"use client";

/**
 * Review provider-fetched KYC details before agent Approve / Discard.
 * Backdrop click does NOT close — only the X button does (keeps pending result).
 *
 * DL layout mirrors Cashfree Secure ID "Try Driving License" success modal:
 * DL number, DOB, class of vehicle, date of issue, name, father name, addresses.
 */
import { useEffect } from "react";
import { ShieldCheck, X, CheckCircle, XCircle } from "lucide-react";

const DETAIL_LABELS: Record<string, string> = {
  pan: "PAN",
  registered_name: "Registered name",
  name_provided: "Name provided",
  father_name: "Father's name",
  pan_status: "PAN status",
  type: "Type",
  category: "Category",
  name_match_result: "Name match",
  name_match_score: "Name match score",
  name: "Full Name",
  holder_name: "Holder name",
  full_name: "Full Name",
  dob: "Date of Birth",
  date_of_birth: "Date of Birth",
  gender: "Gender",
  address: "Address",
  dl_number: "DL Number",
  father_or_husband_name: "Father's / Husband's Name",
  date_of_issue: "Date of Issue",
  class_of_vehicle: "Class of Vehicle",
  cov_details: "Class of Vehicle",
  dl_validity: "DL Validity",
  dl_validity_summary: "DL Validity",
  permanent_address: "Permanent Address",
  temporary_address: "Temporary Address",
  present_address: "Present Address",
  reg_no: "Registration number",
  owner: "Owner",
  owner_father_name: "Owner father name",
  rc_status: "RC status",
  vehicle_class: "Vehicle class",
  model: "Model",
  maker_model: "Maker / model",
  fuel_type: "Fuel type",
  vehicle_colour: "Colour",
  reg_date: "Registration date",
  rc_expiry_date: "RC expiry",
  vehicle_insurance_upto: "Insurance valid till",
  fitness_upto: "Fitness valid till",
  chassis_number: "Chassis",
  vehicle_chasi_number: "Chassis",
  vehicle_engine_number: "Engine",
  name_at_bank: "Name at bank",
  bank_name: "Bank name",
  branch_name: "Branch",
  account_status: "Account status",
  account_number_masked: "Account number",
  ifsc: "IFSC",
  utr: "UTR",
};

/** Preferred order for Cashfree Try DL success fields. */
const DL_FIELD_ORDER = [
  "dl_number",
  "dob",
  "date_of_birth",
  "class_of_vehicle",
  "cov_details",
  "date_of_issue",
  "dl_validity_summary",
  "dl_validity",
  "name",
  "full_name",
  "holder_name",
  "father_or_husband_name",
  "permanent_address",
  "temporary_address",
  "address",
];

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function formatCov(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (!Array.isArray(value)) return null;
  const parts = value
    .map((x) => {
      if (x == null) return "";
      if (typeof x === "string") return x.trim();
      const r = asRecord(x);
      return String(r.cov ?? r.class_of_vehicle ?? "").trim();
    })
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function formatDlValidity(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    if (t.startsWith("{")) {
      try {
        return formatDlValidity(JSON.parse(t));
      } catch {
        return t;
      }
    }
    return t;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  const lines: string[] = [];
  const rangeLabel = (label: string, block: unknown) => {
    if (!block || typeof block !== "object" || Array.isArray(block)) return;
    const b = block as Record<string, unknown>;
    const from = b.from != null ? String(b.from).trim() : "";
    const to = b.to != null ? String(b.to).trim() : "";
    if (!from && !to) return;
    if (from && to) lines.push(`${label}: ${from} → ${to}`);
    else if (to) lines.push(`${label}: valid till ${to}`);
    else lines.push(`${label}: from ${from}`);
  };
  rangeLabel("Non-transport", v.non_transport);
  rangeLabel("Transport", v.transport);
  if (v.hill_valid_till != null && String(v.hill_valid_till).trim()) {
    lines.push(`Hill: valid till ${String(v.hill_valid_till).trim()}`);
  }
  if (v.hazardous_valid_till != null && String(v.hazardous_valid_till).trim()) {
    lines.push(`Hazardous: valid till ${String(v.hazardous_valid_till).trim()}`);
  }
  return lines.length ? lines.join(" · ") : null;
}

function stringifyValue(key: string, value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (key === "dl_validity" || key === "dl_validity_summary") {
    return formatDlValidity(value);
  }
  if (typeof value === "string" || typeof value === "number") {
    const s = String(value).trim();
    return s || null;
  }
  if (key === "cov_details" || key === "class_of_vehicle") {
    return formatCov(value);
  }
  if (Array.isArray(value) && key.includes("address")) {
    const parts = value
      .map((x) => {
        const r = asRecord(x);
        return String(r.complete_address ?? r.address ?? "").trim();
      })
      .filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  }
  return null;
}

function rowsFromData(data: Record<string, unknown>): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  const seen = new Set<string>();

  const push = (key: string) => {
    const label = DETAIL_LABELS[key];
    if (!label || seen.has(label)) return;
    const s = stringifyValue(key, data[key]);
    if (!s) return;
    rows.push({ label, value: s });
    seen.add(label);
  };

  for (const key of DL_FIELD_ORDER) push(key);
  for (const key of Object.keys(DETAIL_LABELS)) {
    if (DL_FIELD_ORDER.includes(key)) continue;
    push(key);
  }
  return rows;
}

export type ElectronicVerifyPending = {
  docId: number;
  docType: string;
  docLabel: string;
  numberUsed: string;
  ifscUsed?: string | null;
  data: Record<string, unknown>;
  verificationId?: string | null;
  providerReference?: string | null;
  confidence?: number | null;
};

export function ElectronicVerifyReviewModal(props: {
  open: boolean;
  pending: ElectronicVerifyPending | null;
  busy?: boolean;
  onClose: () => void;
  onApprove: () => void | Promise<void>;
  /** Discard fetched details only — does NOT write a reject to the database. */
  onDiscard: () => void;
}) {
  const { open, pending, busy = false, onClose, onApprove, onDiscard } = props;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !pending) return null;

  const rows = rowsFromData(pending.data);
  const isDl =
    pending.docType === "dl" ||
    pending.docType === "dl_front" ||
    pending.docType === "dl_back" ||
    /driving|licence|license/i.test(pending.docLabel);
  const isRc =
    pending.docType === "rc" || /vehicle.?rc|registration/i.test(pending.docLabel);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6" role="presentation">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px]" aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ev-review-title"
        className="relative w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 sm:px-5">
          <div>
            <h2 id="ev-review-title" className="text-base font-semibold text-gray-900">
              {isDl
                ? "Driving License is Valid"
                : isRc
                  ? "Vehicle RC is Valid"
                  : `Provider details — ${pending.docLabel}`}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {isDl || isRc
                ? "Same fields as Cashfree Secure ID. Review, then Approve or Discard."
                : "Review before deciding. Closing with X keeps these details until Approve or Discard."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            disabled={busy}
            className="shrink-0 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-4 py-3 sm:px-5">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-3">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-900">
              <ShieldCheck className="h-3.5 w-3.5" />
              {isDl
                ? "Driving License is Valid"
                : isRc
                  ? "Vehicle RC is Valid"
                  : "Fetched record"}
            </p>
            {pending.numberUsed ? (
              <p className="mt-1 text-xs text-emerald-900">
                {isDl ? "DL Number" : isRc ? "Vehicle RC Number" : "Document number"}:{" "}
                <span className="font-mono font-semibold">{pending.numberUsed}</span>
              </p>
            ) : null}
            {rows.length > 0 ? (
              <dl className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1.5 sm:grid-cols-2">
                {rows.map(({ label, value }) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-[10px] font-medium uppercase tracking-wide text-emerald-800/80">
                      {label}
                    </dt>
                    <dd className="break-words text-xs font-semibold text-emerald-950">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-2 text-xs text-emerald-800">No structured fields returned.</p>
            )}
            {(pending.verificationId || pending.providerReference) && (
              <div className="mt-2 space-y-0.5 border-t border-emerald-200/70 pt-2 text-[10px] text-emerald-800/90">
                {pending.verificationId ? (
                  <p className="break-all font-mono">Verification ID: {pending.verificationId}</p>
                ) : null}
                {pending.providerReference ? (
                  <p className="break-all font-mono">Provider ref: {pending.providerReference}</p>
                ) : null}
              </div>
            )}
          </div>
          <p className="mt-3 text-[11px] text-gray-600">
            <b>Approve</b> saves this record and marks the document verified.{" "}
            <b>Discard</b> drops these fetched details only (does not reject the uploaded document in the database).
          </p>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50/80 px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
          <button
            type="button"
            disabled={busy}
            onClick={() => !busy && onDiscard()}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
          >
            <XCircle className="h-4 w-4" />
            Discard
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onApprove()}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            <CheckCircle className="h-4 w-4" />
            {busy ? "Saving…" : "Approve"}
          </button>
        </div>
      </div>
    </div>
  );
}
