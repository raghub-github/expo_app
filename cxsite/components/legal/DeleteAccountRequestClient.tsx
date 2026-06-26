"use client";

/**
 * Google Play-required account deletion request form.
 *
 * Two steps:
 *   1. Enter phone (E.164) → request OTP via /api/account-deletion/otp
 *   2. Enter OTP + confirmation → POST /api/account-deletion to perform soft-delete
 *
 * The form is reachable both as the Play-Console URL (we link from /account-deletion)
 * and from the footer.
 */
import React from "react";
import Link from "next/link";
import {
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Phone,
  ArrowLeft,
  ArrowRight,
  Lock,
  Trash2,
  Clock,
  ScrollText,
  Info,
} from "lucide-react";

type Step =
  | { kind: "phone" }
  | { kind: "otp"; requestId: string; phoneE164: string; resendCooldown: number }
  | { kind: "confirm"; phoneE164: string; sessionToken: string }
  | { kind: "done"; phoneTail: string };

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string };

function phoneTail(phone: string): string {
  return phone.replace(/\D/g, "").slice(-4);
}

export default function DeleteAccountRequestClient() {
  const [step, setStep] = React.useState<Step>({ kind: "phone" });
  const [status, setStatus] = React.useState<Status>({ kind: "idle" });

  const [phone, setPhone] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);
  const [reason, setReason] = React.useState("");

  // OTP resend countdown
  React.useEffect(() => {
    if (step.kind !== "otp" || step.resendCooldown <= 0) return;
    const t = setInterval(
      () =>
        setStep((s) =>
          s.kind === "otp" ? { ...s, resendCooldown: Math.max(0, s.resendCooldown - 1) } : s,
        ),
      1000,
    );
    return () => clearInterval(t);
  }, [step]);

  const requestOtp = async () => {
    setStatus({ kind: "submitting" });
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      setStatus({ kind: "error", message: "Enter a 10-digit Indian mobile number." });
      return;
    }
    const phoneE164 = `+91${digits.slice(-10)}`;
    try {
      const res = await fetch("/api/account-deletion/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneE164 }),
      });
      const data = (await res.json().catch(() => ({}))) as { requestId?: string; error?: string };
      if (!res.ok || !data.requestId) {
        setStatus({
          kind: "error",
          message:
            data?.error ||
            "We could not send the OTP right now. Please try again in a few seconds.",
        });
        return;
      }
      setStep({ kind: "otp", requestId: data.requestId, phoneE164, resendCooldown: 30 });
      setStatus({ kind: "idle" });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error.",
      });
    }
  };

  const verifyOtp = async () => {
    if (step.kind !== "otp") return;
    setStatus({ kind: "submitting" });
    if (otp.replace(/\D/g, "").length !== 6) {
      setStatus({ kind: "error", message: "Enter the 6-digit OTP we sent to your phone." });
      return;
    }
    try {
      const res = await fetch("/api/account-deletion/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: step.requestId,
          phoneE164: step.phoneE164,
          otp,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        sessionToken?: string;
        error?: string;
      };
      if (!res.ok || !data.sessionToken) {
        setStatus({ kind: "error", message: data?.error || "OTP did not match." });
        return;
      }
      setStep({ kind: "confirm", phoneE164: step.phoneE164, sessionToken: data.sessionToken });
      setStatus({ kind: "idle" });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error.",
      });
    }
  };

  const confirmDelete = async () => {
    if (step.kind !== "confirm") return;
    if (!confirmed) {
      setStatus({ kind: "error", message: "Please tick the confirmation checkbox." });
      return;
    }
    setStatus({ kind: "submitting" });
    try {
      const res = await fetch("/api/account-deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneE164: step.phoneE164,
          sessionToken: step.sessionToken,
          reason: reason.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setStatus({
          kind: "error",
          message:
            data?.error ||
            "We could not process the deletion. Please email grievance@gatimitra.com.",
        });
        return;
      }
      setStep({ kind: "done", phoneTail: phoneTail(step.phoneE164) });
      setStatus({ kind: "idle" });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error.",
      });
    }
  };

  return (
    <main className="min-h-screen bg-white">
      <header className="relative border-b border-slate-100 bg-gradient-to-br from-rose-50 via-white to-violet-50">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-400 via-violet-500 to-emerald-500" />
        <div className="mx-auto max-w-3xl px-4 md:px-8 pt-12 pb-10">
          <Link
            href="/account-deletion"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft size={14} /> What gets deleted
          </Link>
          <div className="mt-5 flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500 to-violet-600 text-white flex items-center justify-center shadow-md shadow-rose-200">
              <Trash2 size={24} />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
                Delete my GatiMitra account
              </h1>
              <p className="mt-2 text-slate-600">
                OTP-verified. Once confirmed, your account is permanently deactivated within 24
                hours and the personal data listed in our{" "}
                <Link href="/account-deletion" className="text-emerald-700 underline">
                  Account Deletion Policy
                </Link>{" "}
                is removed.
              </p>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 md:px-8 py-10">
        {/* Phone step */}
        {step.kind === "phone" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm">
            <Steps current={1} />

            <div className="mt-6">
              <label
                htmlFor="phone"
                className="block text-sm font-semibold text-slate-700 mb-2"
              >
                Mobile number registered with GatiMitra
              </label>
              <div className="flex gap-2">
                <div className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm font-semibold text-slate-700">
                  🇮🇳 +91
                </div>
                <input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="98765 43210"
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 tracking-wider focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
                />
              </div>
            </div>

            <ErrorBanner status={status} />

            <div className="mt-6 flex items-center justify-between gap-3">
              <Link
                href="/account-deletion"
                className="text-sm text-slate-600 hover:text-slate-900"
              >
                Change my mind
              </Link>
              <button
                type="button"
                disabled={status.kind === "submitting"}
                onClick={requestOtp}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                <Phone size={16} />
                {status.kind === "submitting" ? "Sending OTP…" : "Send OTP"}
                {status.kind !== "submitting" && <ArrowRight size={16} />}
              </button>
            </div>
          </div>
        )}

        {/* OTP step */}
        {step.kind === "otp" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm">
            <Steps current={2} />

            <p className="mt-6 text-slate-600">
              We&rsquo;ve sent a 6-digit OTP to{" "}
              <strong className="text-slate-900">+91 •••••{phoneTail(step.phoneE164)}</strong>.
              Enter it below to confirm it&rsquo;s really you.
            </p>

            <div className="mt-5">
              <label
                htmlFor="otp"
                className="block text-sm font-semibold text-slate-700 mb-2"
              >
                Enter OTP
              </label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="••••••"
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-2xl tracking-[0.5em] font-mono text-center text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
              />
            </div>

            <ErrorBanner status={status} />

            <div className="mt-4 flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => setStep({ kind: "phone" })}
                className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900"
              >
                <ArrowLeft size={14} /> Use a different number
              </button>
              <button
                type="button"
                disabled={step.resendCooldown > 0}
                onClick={requestOtp}
                className="text-emerald-700 font-semibold disabled:text-slate-400 disabled:cursor-not-allowed"
              >
                {step.resendCooldown > 0 ? `Resend in ${step.resendCooldown}s` : "Resend OTP"}
              </button>
            </div>

            <div className="mt-6 flex items-center justify-end">
              <button
                type="button"
                disabled={status.kind === "submitting"}
                onClick={verifyOtp}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                <Lock size={16} />
                {status.kind === "submitting" ? "Verifying…" : "Verify OTP"}
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Confirm step */}
        {step.kind === "confirm" && (
          <div className="rounded-2xl border-2 border-rose-200 bg-rose-50/30 p-6 md:p-8 shadow-sm">
            <Steps current={3} />

            <div className="mt-6 flex items-start gap-3 rounded-xl bg-white border border-rose-200 p-4">
              <ShieldAlert size={20} className="mt-0.5 text-rose-600 shrink-0" />
              <div>
                <h2 className="font-bold text-slate-900">This action cannot be undone.</h2>
                <p className="mt-1 text-sm text-slate-700">
                  Once you confirm, your account for{" "}
                  <strong>+91 •••••{phoneTail(step.phoneE164)}</strong> is deactivated within
                  24 hours and the personal data below is permanently removed.
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <Card title="What gets deleted" tone="rose">
                <ul className="space-y-1.5 list-disc ml-5">
                  <li>Profile (name, email, date of birth, profile photo)</li>
                  <li>Saved addresses and labels</li>
                  <li>Mobile number identifier (hashed thereafter)</li>
                  <li>Saved cards and UPI handles</li>
                  <li>Order history personal references</li>
                  <li>Device tokens, login sessions, push tokens</li>
                  <li>Mapbox route history, location samples</li>
                </ul>
              </Card>
              <Card title="What we are legally required to keep" tone="amber">
                <ul className="space-y-1.5 list-disc ml-5">
                  <li>Tax invoices and GST records (8 years — CGST Act)</li>
                  <li>Financial transactions (7 years — RBI / PMLA)</li>
                  <li>Aggregated, anonymised analytics</li>
                  <li>
                    Records subject to a lawful order, dispute or grievance proceeding
                  </li>
                </ul>
                <p className="mt-2 text-xs italic text-slate-600">
                  Full details in our{" "}
                  <Link href="/account-deletion" className="text-emerald-700 underline">
                    Account Deletion Policy
                  </Link>{" "}
                  and{" "}
                  <Link href="/data-retention-policy" className="text-emerald-700 underline">
                    Data Retention Policy
                  </Link>
                  .
                </p>
              </Card>
            </div>

            <div className="mt-6">
              <label
                htmlFor="reason"
                className="block text-sm font-semibold text-slate-700 mb-2"
              >
                Reason for leaving (optional)
              </label>
              <textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Help us improve — what made you decide to leave?"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 resize-y"
              />
            </div>

            <label className="mt-5 flex items-start gap-3 rounded-xl bg-white border border-rose-200 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 w-5 h-5 rounded border-slate-300 text-rose-600 focus:ring-rose-400"
              />
              <span className="text-sm text-slate-800">
                I understand this action is permanent and that GatiMitra will retain only the
                legally required records described above.
              </span>
            </label>

            <ErrorBanner status={status} />

            <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep({ kind: "phone" })}
                className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 self-start"
              >
                <ArrowLeft size={14} /> Cancel
              </button>
              <button
                type="button"
                disabled={!confirmed || status.kind === "submitting"}
                onClick={confirmDelete}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-3 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Trash2 size={16} />
                {status.kind === "submitting" ? "Deleting…" : "Permanently delete my account"}
              </button>
            </div>
          </div>
        )}

        {/* Done step */}
        {step.kind === "done" && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6 md:p-8 shadow-sm text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-emerald-600 text-white flex items-center justify-center mb-4">
              <CheckCircle2 size={28} />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Request received</h2>
            <p className="mt-2 text-slate-700">
              Your account for <strong>+91 •••••{step.phoneTail}</strong> has been queued for
              deletion. We&rsquo;ve emailed a confirmation. Personal data will be removed within
              24 hours per our policy.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              If you change your mind, simply log in again within 24 hours — the deletion will be
              cancelled.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700"
              >
                Back to gatimitra.com
              </Link>
              <Link
                href="/grievance-redressal"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white text-emerald-700 border border-emerald-200 px-5 py-3 text-sm font-semibold hover:bg-emerald-100"
              >
                File a grievance
              </Link>
            </div>
          </div>
        )}

        {/* Sidebar facts (always visible) */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Fact
            icon={<Clock size={18} />}
            title="Within 24 hours"
            text="Account is deactivated and personal data scheduled for purge."
          />
          <Fact
            icon={<Info size={18} />}
            title="No charge, no friction"
            text="Deletion is free, doesn't ask qualifying questions, and works from web or app."
          />
          <Fact
            icon={<ScrollText size={18} />}
            title="Audit-grade record"
            text="We keep a redacted compliance record of the deletion request as required by DPDPA 2023."
          />
        </div>
      </section>
    </main>
  );
}

function Steps({ current }: { current: 1 | 2 | 3 }) {
  const items = [
    { n: 1, label: "Verify number" },
    { n: 2, label: "Confirm OTP" },
    { n: 3, label: "Acknowledge & delete" },
  ];
  return (
    <ol className="flex items-center gap-2 text-xs">
      {items.map((it, i) => {
        const done = it.n < current;
        const active = it.n === current;
        return (
          <React.Fragment key={it.n}>
            <li
              className={`flex items-center gap-2 ${
                active
                  ? "text-emerald-700 font-semibold"
                  : done
                  ? "text-slate-700"
                  : "text-slate-400"
              }`}
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  active
                    ? "bg-emerald-600 text-white"
                    : done
                    ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                    : "bg-slate-100 text-slate-500 border border-slate-200"
                }`}
              >
                {done ? "✓" : it.n}
              </span>
              <span className="hidden sm:inline">{it.label}</span>
            </li>
            {i < items.length - 1 && (
              <span className="h-px w-6 sm:w-12 bg-slate-200" aria-hidden="true" />
            )}
          </React.Fragment>
        );
      })}
    </ol>
  );
}

function ErrorBanner({ status }: { status: Status }) {
  if (status.kind !== "error") return null;
  return (
    <div className="mt-4 flex items-start gap-3 rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm">
      <AlertCircle size={18} className="mt-0.5 text-rose-600 shrink-0" />
      <div className="text-rose-800">{status.message}</div>
    </div>
  );
}

function Card({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "rose" | "amber";
  children: React.ReactNode;
}) {
  const cls =
    tone === "rose"
      ? "border-rose-200 bg-white"
      : "border-amber-200 bg-amber-50/50";
  return (
    <div className={`rounded-xl border ${cls} p-4`}>
      <div
        className={`font-bold text-sm uppercase tracking-wider mb-2 ${
          tone === "rose" ? "text-rose-700" : "text-amber-700"
        }`}
      >
        {title}
      </div>
      <div className="text-slate-700">{children}</div>
    </div>
  );
}

function Fact({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-emerald-700">
        {icon}
        <span className="font-bold text-slate-900 text-sm">{title}</span>
      </div>
      <p className="mt-1.5 text-sm text-slate-600 leading-5">{text}</p>
    </div>
  );
}
