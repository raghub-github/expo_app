"use client";

import React from "react";

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

function paymentStatusBadge(status: string) {
  const s = (status || "").toLowerCase();
  const green = s === "captured" || s === "authorized";
  const red = s === "failed" || s === "cancelled" || s === "refunded";
  const cls = green
    ? "bg-emerald-100 text-emerald-800"
    : red
      ? "bg-red-100 text-red-800"
      : "bg-amber-100 text-amber-800";
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{status || "—"}</span>
  );
}

function DetailCell({
  label,
  value,
  mono,
  wide,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  wide?: boolean;
}) {
  if (value == null || value === "") return null;
  return (
    <div
      className={`rounded border border-gray-100 bg-gray-50 px-2 py-1.5 ${wide ? "sm:col-span-2 lg:col-span-3" : ""}`}
    >
      <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div
        className={`mt-0.5 break-all text-xs font-medium text-gray-900 ${mono ? "font-mono text-[11px]" : ""}`}
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
  if (!Number.isNaN(d.getTime())) {
    return `${d.toLocaleString()} (${s})`;
  }
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

/** Full onboarding payment capture details for Commission plan (step 7). */
export function OnboardingPaymentDetailsList({
  payments,
}: {
  payments: Record<string, unknown>[];
}) {
  if (!payments.length) {
    return <p className="text-xs text-gray-600">No payment record for this store.</p>;
  }

  return (
    <div className="space-y-3">
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

        return (
          <div key={id} className="rounded-lg border border-gray-200 bg-white p-3 text-xs shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-[10rem]">
                <div className="text-xs font-semibold text-gray-800">Payment #{id}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {paymentStatusBadge(status)}
                  {isCaptured ? (
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                      Auto-verified — payment captured
                    </span>
                  ) : null}
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                    Created: {createdAt}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-3">
              <DetailCell label="Plan" value={planName} />
              {planId ? <DetailCell label="Plan ID" value={planId} mono /> : null}
              <DetailCell label="Amount" value={formatMoney(amountPaise, currency)} />
              <DetailCell label="Amount (paise)" value={String(amountPaise)} mono />
              <DetailCell label="Currency" value={currency} />
              {standardPaise != null && Number.isFinite(standardPaise) ? (
                <DetailCell
                  label="Standard"
                  value={`${standardPaise} paise (${formatMoney(standardPaise, currency)})`}
                />
              ) : null}
              {promoPaise != null && Number.isFinite(promoPaise) ? (
                <DetailCell
                  label="Promo"
                  value={
                    promoLabel
                      ? `${promoPaise} paise (${promoLabel})`
                      : `${promoPaise} paise (${formatMoney(promoPaise, currency)})`
                  }
                />
              ) : null}
              {razorpayStatus ? <DetailCell label="Razorpay status" value={razorpayStatus} /> : null}
              {capturedAt ? <DetailCell label="Captured at" value={capturedAt} /> : null}
              {failedAt ? <DetailCell label="Failed at" value={failedAt} /> : null}
              {razorpayOrderId ? (
                <DetailCell label="Razorpay order ID" value={razorpayOrderId} mono />
              ) : null}
              {razorpayPaymentId ? (
                <DetailCell label="Razorpay payment ID" value={razorpayPaymentId} mono />
              ) : null}
              {razorpaySignature ? (
                <DetailCell label="Razorpay signature" value={razorpaySignature} mono wide />
              ) : null}
              {(payerName || payerEmail || payerPhone) && (
                <DetailCell
                  label="Payer"
                  value={[payerName, payerEmail, payerPhone].filter(Boolean).join(" · ")}
                  wide
                />
              )}
              {ipAddress ? <DetailCell label="IP address" value={ipAddress} mono /> : null}
              {userAgent ? <DetailCell label="User agent" value={userAgent} wide /> : null}
              {failureReason ? (
                <div className="rounded border border-red-100 bg-red-50 px-2 py-1.5 sm:col-span-2 lg:col-span-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-red-800">
                    Failure reason
                  </div>
                  <div className="mt-0.5 text-xs text-red-900">{failureReason}</div>
                </div>
              ) : null}
              {meta.length > 0 ? (
                <div className="rounded border border-gray-100 bg-white px-2 py-1.5 sm:col-span-2 lg:col-span-3">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                    Metadata
                  </div>
                  <dl className="mt-1 grid gap-1 sm:grid-cols-2">
                    {meta.map(([k, v]) => (
                      <div key={k} className="min-w-0">
                        <dt className="text-[9px] font-semibold uppercase text-gray-500">{k}</dt>
                        <dd className="break-all font-mono text-[10px] text-gray-800">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
