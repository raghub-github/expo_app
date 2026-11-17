"use client";

import React, { useState } from "react";
import {
  BadgeCheck,
  CheckCircle,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  IndianRupee,
  Receipt,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

export function hasCapturedOnboardingPayment(
  payments: Record<string, unknown>[] | null | undefined
): boolean {
  if (!Array.isArray(payments) || payments.length === 0) return false;
  return payments.some((p) => {
    const status = String(p.status ?? "").toLowerCase();
    const rz = String(p.razorpay_status ?? "").toLowerCase();
    return status === "captured" || rz === "captured";
  });
}

function paymentTone(status: string): "ok" | "bad" | "pending" {
  const s = (status || "").toLowerCase();
  if (s === "captured" || s === "authorized") return "ok";
  if (s === "failed" || s === "cancelled" || s === "refunded") return "bad";
  return "pending";
}

function PaymentStatusBadge({ status }: { status: string }) {
  const tone = paymentTone(status);
  const cls =
    tone === "ok"
      ? "bg-emerald-600 text-white"
      : tone === "bad"
        ? "bg-red-600 text-white"
        : "bg-amber-50 text-amber-900 ring-1 ring-amber-200/80";
  const Icon = tone === "ok" ? CheckCircle : tone === "bad" ? XCircle : Clock;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${cls}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {status || "—"}
    </span>
  );
}

function DetailTile({
  label,
  value,
  mono,
  span,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  span?: boolean;
}) {
  if (value == null || value === "") return null;
  return (
    <div
      className={`min-w-0 rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/80 px-3.5 py-3 ${
        span ? "sm:col-span-2" : ""
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <div
        className={`mt-1.5 break-all text-[13px] font-semibold leading-snug text-slate-900 ${
          mono ? "font-mono text-[12px] tracking-tight" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function formatMoney(amountPaise: number, currency: string) {
  return `₹${(amountPaise / 100).toFixed(2)} ${currency || "INR"}`;
}

function formatMaybeDate(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toLocaleString();
  return s;
}

function metadataEntries(metadata: unknown): Array<[string, string]> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  return Object.entries(metadata as Record<string, unknown>)
    .map(([k, v]) => {
      if (v == null) return null;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        return [k, String(v)] as [string, string];
      }
      try {
        return [k, JSON.stringify(v)] as [string, string];
      } catch {
        return null;
      }
    })
    .filter((x): x is [string, string] => !!x);
}

function CopyId({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success(`${label} copied`);
          window.setTimeout(() => setCopied(false), 1200);
        } catch {
          toast.error("Copy failed");
        }
      }}
      className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
    >
      <Copy className="h-3 w-3" aria-hidden />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function IdRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-slate-200/80 bg-white px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</p>
        <p className="mt-1 break-all font-mono text-[12px] font-semibold leading-snug text-slate-900">
          {value}
        </p>
      </div>
      <CopyId value={value} label={label} />
    </div>
  );
}

/** Full onboarding payment capture details for Commission plan (step 7). */
export function OnboardingPaymentDetailsList({
  payments,
}: {
  payments: Record<string, unknown>[];
}) {
  if (!payments.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
        <CreditCard className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
        <p className="mt-2 text-sm font-semibold text-slate-800">No payment record</p>
        <p className="mt-1 text-[12px] text-slate-500">
          Onboarding commission payment has not been recorded for this store yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {payments.map((p, i) => {
        const id = (p.id as number) ?? i;
        const amountPaise =
          typeof p.amount_paise === "number" ? p.amount_paise : Number(p.amount_paise ?? 0) || 0;
        const currency = (p.currency as string) ?? "INR";
        const planName = (p.plan_name as string) ?? "—";
        const planId = p.plan_id != null ? String(p.plan_id) : null;
        const status = (p.status as string) ?? "—";
        const razorpayStatus = (p.razorpay_status as string) ?? null;
        const createdAt = formatMaybeDate(p.created_at) ?? "—";
        const capturedAt = formatMaybeDate(p.captured_at);
        const failedAt = formatMaybeDate(p.failed_at);
        const failureReason = (p.failure_reason as string) ?? null;
        const razorpayOrderId = (p.razorpay_order_id as string) ?? null;
        const razorpayPaymentId = (p.razorpay_payment_id as string) ?? null;
        const razorpaySignature = (p.razorpay_signature as string) ?? null;
        const payerName = (p.payer_name as string) ?? null;
        const payerEmail = (p.payer_email as string) ?? null;
        const payerPhone = (p.payer_phone as string) ?? null;
        const standardPaise =
          typeof p.standard_amount_paise === "number"
            ? p.standard_amount_paise
            : p.standard_amount_paise != null
              ? Number(p.standard_amount_paise)
              : null;
        const promoPaise =
          typeof p.promo_amount_paise === "number"
            ? p.promo_amount_paise
            : p.promo_amount_paise != null
              ? Number(p.promo_amount_paise)
              : null;
        const promoLabel = (p.promo_label as string) ?? null;
        const ipAddress = (p.ip_address as string) ?? null;
        const userAgent = (p.user_agent as string) ?? null;
        const meta = metadataEntries(p.metadata);
        const isCaptured =
          String(status).toLowerCase() === "captured" ||
          String(razorpayStatus || "").toLowerCase() === "captured";
        const discountPaise =
          standardPaise != null && Number.isFinite(standardPaise) && standardPaise > amountPaise
            ? standardPaise - amountPaise
            : null;

        return (
          <article
            key={id}
            className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]"
          >
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50/90 to-white px-4 py-3.5 sm:px-5">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    isCaptured
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                      : "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100"
                  }`}
                >
                  {isCaptured ? (
                    <BadgeCheck className="h-5 w-5" aria-hidden />
                  ) : (
                    <Receipt className="h-5 w-5" aria-hidden />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">Payment #{id}</h3>
                    <PaymentStatusBadge status={status} />
                    {isCaptured ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-800 ring-1 ring-emerald-200/80">
                        <ShieldCheck className="h-3 w-3" aria-hidden />
                        Auto-verified
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[12px] text-slate-500">Created {createdAt}</p>
                </div>
              </div>
              <div className="rounded-2xl bg-slate-900 px-4 py-2.5 text-right text-white shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/60">
                  Amount paid
                </p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight">
                  {formatMoney(amountPaise, currency)}
                </p>
              </div>
            </header>

            <div className="space-y-4 p-4 sm:p-5">
              <section>
                <div className="mb-2.5 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                    <IndianRupee className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">Plan & pricing</h4>
                    <p className="text-[11px] text-slate-500">Commission plan charged at onboarding</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  <DetailTile label="Plan" value={planName} />
                  {planId ? <DetailTile label="Plan ID" value={planId} mono /> : null}
                  <DetailTile label="Currency" value={currency} />
                  <DetailTile label="Amount" value={formatMoney(amountPaise, currency)} />
                  <DetailTile label="Amount (paise)" value={String(amountPaise)} mono />
                  {standardPaise != null && Number.isFinite(standardPaise) ? (
                    <DetailTile
                      label="Standard price"
                      value={formatMoney(standardPaise, currency)}
                    />
                  ) : null}
                  {promoPaise != null && Number.isFinite(promoPaise) ? (
                    <DetailTile
                      label="Promo price"
                      value={
                        promoLabel
                          ? `${formatMoney(promoPaise, currency)} · ${promoLabel}`
                          : formatMoney(promoPaise, currency)
                      }
                      span
                    />
                  ) : null}
                  {discountPaise != null && discountPaise > 0 ? (
                    <DetailTile
                      label="Savings"
                      value={formatMoney(discountPaise, currency)}
                    />
                  ) : null}
                </div>
              </section>

              <section>
                <div className="mb-2.5 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <CreditCard className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">Razorpay</h4>
                    <p className="text-[11px] text-slate-500">Gateway status and transaction IDs</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {razorpayStatus ? (
                    <DetailTile label="Razorpay status" value={razorpayStatus} />
                  ) : null}
                  {capturedAt ? <DetailTile label="Captured at" value={capturedAt} /> : null}
                  {failedAt ? <DetailTile label="Failed at" value={failedAt} /> : null}
                </div>
                <div className="mt-2.5 space-y-2">
                  {razorpayOrderId ? (
                    <IdRow label="Razorpay order ID" value={razorpayOrderId} />
                  ) : null}
                  {razorpayPaymentId ? (
                    <IdRow label="Razorpay payment ID" value={razorpayPaymentId} />
                  ) : null}
                  {razorpaySignature ? (
                    <IdRow label="Razorpay signature" value={razorpaySignature} />
                  ) : null}
                </div>
              </section>

              {(payerName || payerEmail || payerPhone || ipAddress || userAgent) && (
                <section>
                  <div className="mb-2.5 flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">Payer & session</h4>
                      <p className="text-[11px] text-slate-500">Who paid and from where</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {payerName ? <DetailTile label="Payer name" value={payerName} /> : null}
                    {payerEmail ? <DetailTile label="Payer email" value={payerEmail} /> : null}
                    {payerPhone ? <DetailTile label="Payer phone" value={payerPhone} /> : null}
                    {ipAddress ? <DetailTile label="IP address" value={ipAddress} mono /> : null}
                    {userAgent ? (
                      <DetailTile label="User agent" value={userAgent} span />
                    ) : null}
                  </div>
                </section>
              )}

              {failureReason ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-3.5 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-red-800">
                    Failure reason
                  </p>
                  <p className="mt-1 text-[13px] font-medium text-red-950">{failureReason}</p>
                </div>
              ) : null}

              {meta.length > 0 ? (
                <section className="rounded-2xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                    Metadata
                  </p>
                  <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                    {meta.map(([k, v]) => (
                      <div key={k} className="min-w-0 rounded-xl border border-white bg-white px-3 py-2">
                        <dt className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                          {k}
                        </dt>
                        <dd className="mt-0.5 break-all font-mono text-[11px] text-slate-800">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ) : null}
            </div>

            {isCaptured ? (
              <footer className="border-t border-emerald-100 bg-emerald-50/70 px-4 py-3 sm:px-5">
                <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-900">
                  <ShieldCheck className="h-4 w-4" aria-hidden />
                  Auto-verified because payment was captured
                </p>
              </footer>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
