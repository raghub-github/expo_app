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
 * On success the provider's fetched details are shown and `onVerified` fires
 * so the host page can run its own approve flow (e.g. mark the projection row
 * verified) without the agent re-typing anything.
 */
import { useState } from "react";
import { Zap, Loader2, ShieldCheck, XCircle, ChevronDown } from "lucide-react";

export type EvDocKind =
  | "pan"
  | "gstin"
  | "bank_account"
  | "driving_licence"
  | "vehicle_rc"
  | "ifsc";

export const EV_SUPPORTED_KINDS: ReadonlySet<string> = new Set([
  "pan", "gstin", "bank_account", "driving_licence", "vehicle_rc", "ifsc",
]);

type EvOutcome =
  | { state: "verified"; data: Record<string, unknown> }
  | { state: "rejected"; reason: string }
  | { state: "error"; message: string };

const FIELD_LABELS: Record<EvDocKind, { number: string; placeholder: string }> = {
  pan: { number: "PAN number", placeholder: "ABCDE1234F" },
  gstin: { number: "GSTIN", placeholder: "22AAAAA0000A1Z5" },
  bank_account: { number: "Account number", placeholder: "0000 1111 2222" },
  driving_licence: { number: "DL number", placeholder: "MH03 20080022135" },
  vehicle_rc: { number: "Vehicle number", placeholder: "MH12DE1433" },
  ifsc: { number: "IFSC", placeholder: "SBIN0001234" },
};

/** Friendly labels for provider payload keys worth showing to the agent. */
const DETAIL_LABELS: Record<string, string> = {
  registered_name: "Registered name",
  name_match_result: "Name match",
  name_match_score: "Match score",
  pan_status: "PAN status",
  category: "Category",
  legal_name_of_business: "Legal business name",
  trade_name_of_business: "Trade name",
  gst_in_status: "GSTIN status",
  date_of_registration: "Registered on",
  name_at_bank: "Name at bank",
  bank_name: "Bank",
  account_status: "Account status",
  dob: "Date of birth",
  holder_name: "Holder name",
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

export function ElectronicVerifyPanel(props: {
  subjectType: "rider" | "merchant_store";
  subjectId: number;
  docKind: EvDocKind;
  /** Already verified? Panel renders nothing. */
  verified: boolean;
  /** Prefills: doc number, name, dob (YYYY-MM-DD), ifsc. */
  prefill?: { number?: string | null; name?: string | null; dob?: string | null; ifsc?: string | null };
  /** Called after the provider confirms the document. */
  onVerified?: (data: Record<string, unknown>) => void;
  className?: string;
}) {
  const { subjectType, subjectId, docKind, verified, prefill, onVerified } = props;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<EvOutcome | null>(null);
  const [form, setForm] = useState<Record<string, string>>({
    number: prefill?.number?.trim() ?? "",
    name: prefill?.name?.trim() ?? "",
    dob: prefill?.dob?.trim() ?? "",
    ifsc: prefill?.ifsc?.trim() ?? "",
  });

  if (verified || !EV_SUPPORTED_KINDS.has(docKind)) return null;

  const needsName = docKind === "pan";
  const optionalName = docKind === "gstin" || docKind === "bank_account";
  const needsDob = docKind === "driving_licence";
  const needsIfsc = docKind === "bank_account";
  const canRun =
    !busy &&
    form.number.trim().length >= 4 &&
    (!needsName || form.name.trim().length >= 2) &&
    (!needsDob || /^\d{4}-\d{2}-\d{2}$/.test(form.dob.trim())) &&
    (!needsIfsc || /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(form.ifsc.trim()));

  async function run(): Promise<void> {
    setBusy(true);
    setOutcome(null);
    try {
      const n = form.number.trim();
      const body: Record<string, unknown> = { subjectType, subjectId, docKind };
      if (docKind === "pan") { body.pan = n.toUpperCase(); body.name = form.name.trim(); }
      else if (docKind === "gstin") { body.gstin = n.toUpperCase(); body.businessName = form.name.trim() || undefined; }
      else if (docKind === "bank_account") { body.bankAccount = n.replace(/\D/g, ""); body.ifsc = form.ifsc.trim().toUpperCase(); body.name = form.name.trim() || undefined; }
      else if (docKind === "driving_licence") { body.dlNumber = n.toUpperCase(); body.dob = form.dob.trim(); }
      else if (docKind === "vehicle_rc") { body.vehicleNumber = n.toUpperCase(); }
      else { body.ifsc = n.toUpperCase(); }

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
        kind?: string; status?: string; status_reason?: string;
        verified_data?: Record<string, unknown>; reason?: string; detail?: string | null;
      };
      if (o.kind === "auto" && o.status === "verified") {
        const data = o.verified_data ?? {};
        setOutcome({ state: "verified", data });
        onVerified?.(data);
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

  const input = (key: "number" | "name" | "dob" | "ifsc", label: string, placeholder: string) => (
    <div>
      <label className="mb-0.5 block text-[11px] font-medium text-indigo-900/70">{label}</label>
      <input
        value={form[key] ?? ""}
        onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 font-mono text-xs shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
      />
    </div>
  );

  return (
    <div className={props.className ?? "mt-3"}>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:from-indigo-700 hover:to-violet-700 hover:shadow-md"
        >
          <Zap className="h-3.5 w-3.5 transition-transform group-hover:scale-110" />
          Verify electronically
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>
      ) : (
        <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50/60 p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
              <Zap className="h-3.5 w-3.5 text-indigo-600" /> Electronic verification
            </div>
            <button onClick={() => setOpen(false)} className="text-indigo-300 hover:text-indigo-500">&times;</button>
          </div>

          {outcome?.state === "verified" ? (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                <ShieldCheck className="h-4 w-4" /> Verified by provider
              </div>
              <dl className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
                {detailRows(outcome.data).map(([l, v]) => (
                  <div key={l} className="flex gap-1 text-[11px]">
                    <dt className="text-emerald-700">{l}:</dt>
                    <dd className="font-semibold text-emerald-900">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {input("number", FIELD_LABELS[docKind].number, FIELD_LABELS[docKind].placeholder)}
                {needsName ? input("name", "Name as on PAN", "Full name") : null}
                {optionalName ? input("name", docKind === "gstin" ? "Business name (optional)" : "Holder name (optional)", "") : null}
                {needsDob ? input("dob", "DOB (YYYY-MM-DD)", "1990-01-31") : null}
                {needsIfsc ? input("ifsc", "IFSC", "SBIN0001234") : null}
              </div>
              <button
                type="button"
                onClick={run}
                disabled={!canRun}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                {busy ? "Verifying…" : "Run verification"}
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
