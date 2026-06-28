"use client";

import React from "react";
import Link from "next/link";
import {
  Mail,
  Phone,
  MapPin,
  Send,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Headphones,
  Building2,
} from "lucide-react";

type TabKey = "ticket" | "report" | "feedback" | "reach";
type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; ticketId: string }
  | { kind: "error"; message: string };

const TOPICS = [
  "Order — food",
  "Order — ride",
  "Order — parcel",
  "Wallet / GMitra Money",
  "GMitra Max membership",
  "Payment / refund",
  "Account / login",
  "Privacy / data",
  "Safety incident",
  "Bug / app crash",
  "Suggestion",
  "Other",
];

export default function SupportClient({ initialType }: { initialType?: string }) {
  const initialTab: TabKey =
    initialType === "report" ? "report" : initialType === "feedback" ? "feedback" : "ticket";

  const [tab, setTab] = React.useState<TabKey>(initialTab);
  const [status, setStatus] = React.useState<Status>({ kind: "idle" });
  const [form, setForm] = React.useState({
    name: "",
    email: "",
    phone: "",
    topic: TOPICS[0],
    message: "",
    orderId: "",
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ kind: "submitting" });
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: tab,
          ...form,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ticketId?: string; error?: string };
      if (!res.ok) {
        setStatus({ kind: "error", message: data?.error || "Could not submit. Try again." });
        return;
      }
      setStatus({ kind: "success", ticketId: data.ticketId ?? "TICKET" });
      setForm({ ...form, message: "" });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error.",
      });
    }
  };

  return (
    <main className="min-h-screen bg-white">
      {/* Hero */}
      <header className="relative border-b border-slate-100 bg-gradient-to-br from-emerald-50 via-white to-violet-50">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 via-violet-500 to-pink-500" />
        <div className="mx-auto max-w-5xl px-4 md:px-8 pt-12 pb-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-violet-600 text-white flex items-center justify-center shadow-md shadow-emerald-200">
              <Headphones size={24} />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
                Support
              </h1>
              <p className="mt-1 text-slate-600">
                Submit a ticket, report a problem, share feedback or reach our team directly.
              </p>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 md:px-8 py-10">
        {/* Tabs */}
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 mb-8 max-w-fit">
          {(
            [
              { k: "ticket", label: "Submit a ticket" },
              { k: "report", label: "Report an issue" },
              { k: "feedback", label: "Feedback" },
              { k: "reach", label: "Reach us" },
            ] as const
          ).map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => {
                setTab(t.k);
                setStatus({ kind: "idle" });
              }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === t.k
                  ? "bg-white text-emerald-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Reach Us tab */}
        {tab === "reach" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <ContactCard
              icon={<Mail size={20} />}
              title="Customer support"
              lines={["support@gatimitra.com"]}
              href="mailto:support@gatimitra.com"
            />
            <ContactCard
              icon={<Mail size={20} />}
              title="Business / partnerships"
              lines={["business@gatimitra.com"]}
              href="mailto:business@gatimitra.com"
            />
            <ContactCard
              icon={<Phone size={20} />}
              title="Phone (10:00 – 22:00 IST)"
              lines={["+91 80 1234 5678"]}
              href="tel:+918012345678"
            />
            <ContactCard
              icon={<Building2 size={20} />}
              title="Registered office"
              lines={[
                "GatiMitra On Demand Services Pvt. Ltd.",
                "Bengaluru, Karnataka, India",
              ]}
            />
            <ContactCard
              icon={<MapPin size={20} />}
              title="Grievance officer (IT Rules 2021)"
              lines={["grievance@gatimitra.com", "Replies within 24 hours"]}
              href="mailto:grievance@gatimitra.com"
            />
            <ContactCard
              icon={<MessageSquare size={20} />}
              title="Data Protection Officer (DPDPA)"
              lines={["dpo@gatimitra.com"]}
              href="mailto:dpo@gatimitra.com"
            />
          </div>
        )}

        {/* Ticket / Report / Feedback share the same form */}
        {tab !== "reach" && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
            <form
              onSubmit={onSubmit}
              className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm"
            >
              <h2 className="text-xl font-bold text-slate-900">
                {tab === "ticket" && "Open a support ticket"}
                {tab === "report" && "Report an issue"}
                {tab === "feedback" && "Share feedback"}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                We email you a ticket ID right away and the team replies via the email you provide.
                For order-specific issues, the in-app{" "}
                <em>Help → Raise a ticket</em> flow is faster.
              </p>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="Your name"
                  required
                  value={form.name}
                  onChange={(v) => setForm({ ...form, name: v })}
                  autoComplete="name"
                />
                <Field
                  label="Email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(v) => setForm({ ...form, email: v })}
                  autoComplete="email"
                />
                <Field
                  label="Phone (optional)"
                  type="tel"
                  value={form.phone}
                  onChange={(v) => setForm({ ...form, phone: v })}
                  autoComplete="tel"
                />
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Topic
                  </label>
                  <select
                    value={form.topic}
                    onChange={(e) => setForm({ ...form, topic: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
                  >
                    {TOPICS.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <Field
                  className="sm:col-span-2"
                  label="Order ID (if any)"
                  value={form.orderId}
                  onChange={(v) => setForm({ ...form, orderId: v })}
                  placeholder="e.g. ORD-2025-000123"
                />
              </div>

              <div className="mt-4">
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Tell us what happened
                </label>
                <textarea
                  required
                  minLength={20}
                  maxLength={4000}
                  rows={6}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="Include dates, amounts and what you expected — the more detail the faster we can resolve."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 resize-y"
                />
                <div className="mt-1 text-xs text-slate-500">
                  {form.message.length}/4000 characters
                </div>
              </div>

              {status.kind === "success" && (
                <div className="mt-5 flex items-start gap-3 rounded-lg bg-emerald-50 border border-emerald-200 p-3">
                  <CheckCircle2 size={20} className="mt-0.5 text-emerald-600 shrink-0" />
                  <div className="text-sm">
                    <div className="font-semibold text-emerald-900">Ticket created</div>
                    <div className="text-emerald-800">
                      Your ticket ID is{" "}
                      <code className="font-mono bg-white border border-emerald-200 rounded px-1.5 py-0.5">
                        {status.ticketId}
                      </code>
                      . We&rsquo;ve sent a confirmation to {form.email}.
                    </div>
                  </div>
                </div>
              )}

              {status.kind === "error" && (
                <div className="mt-5 flex items-start gap-3 rounded-lg bg-rose-50 border border-rose-200 p-3">
                  <AlertCircle size={20} className="mt-0.5 text-rose-600 shrink-0" />
                  <div className="text-sm text-rose-800">{status.message}</div>
                </div>
              )}

              <div className="mt-6 flex items-center justify-between gap-4 flex-wrap">
                <p className="text-xs text-slate-500 max-w-md">
                  By submitting, you agree to our{" "}
                  <Link className="text-emerald-700 underline" href="/privacy-policy">
                    Privacy Policy
                  </Link>{" "}
                  and{" "}
                  <Link className="text-emerald-700 underline" href="/terms-and-conditions">
                    Terms
                  </Link>
                  .
                </p>
                <button
                  type="submit"
                  disabled={status.kind === "submitting"}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Send size={16} />
                  {status.kind === "submitting" ? "Sending…" : "Send"}
                </button>
              </div>
            </form>

            {/* Sidebar */}
            <aside className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                <h3 className="font-bold text-slate-900 mb-2">Faster routes</h3>
                <ul className="space-y-2 text-sm">
                  <li>
                    <Link className="text-emerald-700 underline" href="/help-center">
                      Browse the Help Center
                    </Link>
                  </li>
                  <li>
                    <Link className="text-emerald-700 underline" href="/faq">
                      Read the FAQ
                    </Link>
                  </li>
                  <li>
                    <Link className="text-emerald-700 underline" href="/refund-policy">
                      Refund Policy
                    </Link>
                  </li>
                  <li>
                    <Link className="text-emerald-700 underline" href="/cancellation-policy">
                      Cancellation Policy
                    </Link>
                  </li>
                </ul>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="font-bold text-slate-900 mb-2">Reach us directly</h3>
                <div className="space-y-2 text-sm">
                  <a className="block text-emerald-700 hover:underline" href="mailto:support@gatimitra.com">
                    support@gatimitra.com
                  </a>
                  <a className="block text-emerald-700 hover:underline" href="tel:+918012345678">
                    +91 80 1234 5678
                  </a>
                </div>
              </div>
              <Link
                href="/grievance-redressal"
                className="block rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 hover:bg-emerald-50"
              >
                <div className="text-sm font-bold text-emerald-900">
                  File a formal grievance
                </div>
                <div className="text-xs text-emerald-800 mt-1">
                  IT Rules 2021 §3(2) — Grievance Officer responds within 24h.
                </div>
              </Link>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={props.className}>
      <label className="block text-sm font-semibold text-slate-700 mb-1.5">
        {props.label}
        {props.required && <span className="text-rose-500"> *</span>}
      </label>
      <input
        type={props.type ?? "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        required={props.required}
        autoComplete={props.autoComplete}
        placeholder={props.placeholder}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
      />
    </div>
  );
}

function ContactCard(props: {
  icon: React.ReactNode;
  title: string;
  lines: string[];
  href?: string;
}) {
  const content = (
    <div className="h-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-violet-600 text-white flex items-center justify-center mb-3 shadow-md shadow-emerald-100">
        {props.icon}
      </div>
      <h3 className="font-bold text-slate-900">{props.title}</h3>
      <div className="mt-1 text-sm text-slate-600 space-y-0.5">
        {props.lines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </div>
  );
  return props.href ? <a href={props.href}>{content}</a> : content;
}
