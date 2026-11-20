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
  Building2,
  Shield,
  Star,
  ChevronLeft,
  ChevronRight,
  Quote,
  X,
} from "lucide-react";
import { useAppSelector } from "@/lib/hooks";
import {
  BUSINESS_EMAIL,
  DPO_EMAIL,
  GRIEVANCE_EMAIL,
  SUPPORT_EMAIL,
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_PHONE_TEL,
} from "@/lib/contact";

type TabKey = "ticket" | "report" | "feedback" | "reach";
type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; ticketId?: string }
  | { kind: "error"; message: string };

type ReviewItem = {
  id: number;
  name: string | null;
  review: string | null;
  stars: number | null;
  status: string;
  response_message: string | null;
  created_at: string | null;
};

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

const TABS = [
  { k: "ticket" as const, label: "Submit a ticket" },
  { k: "report" as const, label: "Report an issue" },
  { k: "feedback" as const, label: "Feedback" },
  { k: "reach" as const, label: "Reach us" },
];

const inputCls =
  "w-full rounded-md border border-[#d8d8d4] bg-white px-3 py-2.5 text-sm text-[#1a1a1a] outline-none transition placeholder:text-[#999] focus:border-[#109D4C] focus:ring-1 focus:ring-[#109D4C]/25";

/** Fast format check (full MX check happens via /api/feedback?checkEmail=). */
function isValidEmail(s: string): boolean {
  const email = s.trim().toLowerCase();
  if (!email || email.length > 254 || email.includes("..")) return false;
  if (
    !/^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(
      email,
    )
  ) {
    return false;
  }
  const tld = email.split(".").pop() ?? "";
  return /^[a-z]{2,24}$/i.test(tld);
}

function formatPhoneDisplay(raw: string | undefined | null): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 13 && digits.startsWith("91")) return digits.slice(2);
  return String(raw ?? "").trim();
}

function formatReviewDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function StarsDisplay({ value, size = 14 }: { value: number; size?: number }) {
  const n = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${n} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          className={i <= n ? "fill-[#f5a524] text-[#f5a524]" : "text-[#ddd]"}
        />
      ))}
    </span>
  );
}

export default function SupportClient({ initialType }: { initialType?: string }) {
  const initialTab: TabKey =
    initialType === "report"
      ? "report"
      : initialType === "feedback"
        ? "feedback"
        : initialType === "reach"
          ? "reach"
          : "ticket";

  const { user, isAuthenticated } = useAppSelector((s) => s.auth);

  const [tab, setTab] = React.useState<TabKey>(initialTab);
  const [status, setStatus] = React.useState<Status>({ kind: "idle" });
  const [emailTouched, setEmailTouched] = React.useState(false);
  const [emailDuplicate, setEmailDuplicate] = React.useState(false);
  const [emailInvalidReason, setEmailInvalidReason] = React.useState<string | null>(
    null,
  );
  const [emailChecking, setEmailChecking] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    email: "",
    phone: "",
    topic: TOPICS[0],
    message: "",
    orderId: "",
    stars: 0,
  });

  const [reviews, setReviews] = React.useState<ReviewItem[]>([]);
  const [reviewsLoading, setReviewsLoading] = React.useState(false);

  React.useEffect(() => {
    if (!isAuthenticated || !user) return;
    setForm((prev) => ({
      ...prev,
      name: prev.name || (user.name ?? "").trim(),
      email: prev.email || (user.email ?? "").trim(),
      phone: prev.phone || formatPhoneDisplay(user.phone),
    }));
  }, [isAuthenticated, user]);

  const loadReviews = React.useCallback(async () => {
    setReviewsLoading(true);
    try {
      const res = await fetch("/api/feedback");
      const data = (await res.json().catch(() => ({}))) as {
        reviews?: ReviewItem[];
      };
      setReviews(Array.isArray(data.reviews) ? data.reviews : []);
    } catch {
      setReviews([]);
    } finally {
      setReviewsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (tab === "feedback") void loadReviews();
  }, [tab, loadReviews]);

  // Live real-email + duplicate check (feedback + ticket/report)
  React.useEffect(() => {
    if (tab === "reach") {
      setEmailDuplicate(false);
      setEmailInvalidReason(null);
      setEmailChecking(false);
      return;
    }
    const email = form.email.trim().toLowerCase();
    if (!email) {
      setEmailDuplicate(false);
      setEmailInvalidReason(null);
      setEmailChecking(false);
      return;
    }
    if (!isValidEmail(email)) {
      setEmailDuplicate(false);
      setEmailInvalidReason(
        emailTouched ? "Enter a valid email address (e.g. name@company.com)." : null,
      );
      setEmailChecking(false);
      return;
    }

    let cancelled = false;
    setEmailChecking(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/feedback?checkEmail=${encodeURIComponent(email)}`,
        );
        const data = (await res.json().catch(() => ({}))) as {
          valid?: boolean;
          exists?: boolean;
          reason?: string;
        };
        if (cancelled) return;
        if (data.valid === false) {
          setEmailInvalidReason(
            data.reason ||
              "This email address does not exist. Please check for typos.",
          );
          setEmailDuplicate(false);
        } else {
          setEmailInvalidReason(null);
          // Duplicate only blocks feedback form
          setEmailDuplicate(tab === "feedback" ? Boolean(data.exists) : false);
        }
      } catch {
        if (!cancelled) {
          setEmailInvalidReason(null);
          setEmailDuplicate(false);
        }
      } finally {
        if (!cancelled) setEmailChecking(false);
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tab, form.email, emailTouched]);

  // Auto-hide success / error banners after ~2.5s
  React.useEffect(() => {
    if (status.kind !== "success" && status.kind !== "error") return;
    const id = window.setTimeout(() => setStatus({ kind: "idle" }), 2500);
    return () => window.clearTimeout(id);
  }, [status]);

  const emailBroken =
    Boolean(emailInvalidReason) ||
    (emailTouched && (!form.email.trim() || !isValidEmail(form.email)));

  const canSubmitTicket =
    form.name.trim().length >= 2 &&
    isValidEmail(form.email) &&
    !emailInvalidReason &&
    !emailChecking &&
    form.message.trim().length >= 20 &&
    form.message.trim().length <= 4000 &&
    status.kind !== "submitting";

  const canSubmitFeedback =
    form.name.trim().length >= 2 &&
    isValidEmail(form.email) &&
    !emailInvalidReason &&
    !emailDuplicate &&
    !emailChecking &&
    form.stars >= 1 &&
    form.stars <= 5 &&
    form.message.trim().length >= 10 &&
    form.message.trim().length <= 2000 &&
    status.kind !== "submitting";

  const onSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailTouched(true);
    if (!canSubmitTicket) return;

    const name = form.name.trim();
    const email = form.email.trim();

    setStatus({ kind: "submitting" });
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: tab,
          name,
          email,
          phone: form.phone,
          topic: form.topic,
          message: form.message,
          orderId: form.orderId,
          _hp: "",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ticketId?: string;
        ticket_id?: string;
        error?: string;
      };
      if (!res.ok) {
        setStatus({ kind: "error", message: data?.error || "Could not submit." });
        return;
      }
      const ticketId = (data.ticketId || data.ticket_id || "").trim() || "TICKET";
      setStatus({ kind: "success", ticketId });
      setForm((prev) => ({
        ...prev,
        message: "",
        orderId: "",
      }));
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error.",
      });
    }
  };

  const onSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailTouched(true);
    if (!canSubmitFeedback) return;

    const name = form.name.trim();
    const email = form.email.trim();
    const review = form.message.trim();

    setStatus({ kind: "submitting" });
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          review,
          stars: form.stars,
          _hp: "",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        code?: string;
      };
      if (!res.ok || !data.ok) {
        if (res.status === 409 || data?.code === "DUPLICATE_EMAIL") {
          setEmailDuplicate(true);
          setEmailTouched(true);
        }
        if (data?.code === "INVALID_EMAIL" && data?.error) {
          setEmailInvalidReason(data.error);
          setEmailTouched(true);
        }
        setStatus({ kind: "error", message: data?.error || "Could not submit." });
        return;
      }
      setForm({
        name: isAuthenticated ? (user?.name ?? "").trim() : "",
        email: isAuthenticated ? (user?.email ?? "").trim() : "",
        phone: isAuthenticated ? formatPhoneDisplay(user?.phone) : "",
        topic: TOPICS[0],
        message: "",
        orderId: "",
        stars: 0,
      });
      setEmailTouched(false);
      setEmailDuplicate(false);
      setEmailInvalidReason(null);
      setStatus({ kind: "success" });
      void loadReviews();
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error.",
      });
    }
  };

  return (
    <main className="support-page min-h-screen w-full bg-[#f7f7f5] text-[#1a1a1a]">
      <header className="border-b border-black/[0.08] bg-white">
        <div className="flex w-full items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <h1 className="text-lg font-semibold tracking-tight md:text-xl">Support</h1>
          <div className="flex items-center gap-4 text-sm">
            <a
              href={`tel:${SUPPORT_PHONE_TEL}`}
              className="hidden items-center gap-1.5 sm:inline-flex hover:text-[#109D4C]"
            >
              <Phone size={14} className="text-[#109D4C]" />
              {SUPPORT_PHONE_DISPLAY}
            </a>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="inline-flex items-center gap-1.5 font-medium text-[#109D4C] hover:underline"
            >
              <Mail size={14} />
              {SUPPORT_EMAIL}
            </a>
          </div>
        </div>
      </header>

      <div className="bg-[#109D4C]">
        <p className="w-full px-4 py-2 text-[12px] font-medium text-white sm:px-6 lg:px-8 md:text-[13px]">
          Tickets, reports, feedback — one inbox. Agents track every thread and reply to your
          email.
        </p>
      </div>

      <div className="w-full px-4 py-5 sm:px-6 lg:px-8 md:py-6">
        <div className="mb-5 flex flex-wrap gap-x-1 border-b border-black/10">
          {TABS.map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => {
                setTab(t.k);
                setStatus({ kind: "idle" });
                setEmailTouched(false);
              }}
              className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                tab === t.k
                  ? "border-[#109D4C] text-[#109D4C]"
                  : "border-transparent text-[#555] hover:text-[#1a1a1a]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "reach" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ContactCard
              icon={<Mail size={16} />}
              title="Customer support"
              lines={[SUPPORT_EMAIL]}
              href={`mailto:${SUPPORT_EMAIL}`}
            />
            <ContactCard
              icon={<Mail size={16} />}
              title="Business / partnerships"
              lines={[BUSINESS_EMAIL]}
              href={`mailto:${BUSINESS_EMAIL}`}
            />
            <ContactCard
              icon={<Phone size={16} />}
              title="Phone (10:00 – 22:00 IST)"
              lines={[SUPPORT_PHONE_DISPLAY]}
              href={`tel:${SUPPORT_PHONE_TEL}`}
            />
            <ContactCard
              icon={<Building2 size={16} />}
              title="Registered office"
              lines={[
                "GatiMitra On Demand Services Pvt. Ltd.",
                "Panipat, Haryana, India",
              ]}
            />
            <ContactCard
              icon={<MapPin size={16} />}
              title="Grievance officer"
              lines={[GRIEVANCE_EMAIL, "Replies within 24 hours"]}
              href={`mailto:${GRIEVANCE_EMAIL}`}
            />
            <ContactCard
              icon={<MessageSquare size={16} />}
              title="Data Protection Officer"
              lines={[DPO_EMAIL]}
              href={`mailto:${DPO_EMAIL}`}
            />
          </div>
        ) : tab === "feedback" ? (
          <>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] lg:gap-6">
              <form
                    onSubmit={onSubmitFeedback}
                    className="rounded-lg border border-black/10 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-black/[0.06] px-5 py-3.5">
                      <h2 className="text-[15px] font-semibold">Share feedback</h2>
                      <span className="text-[11px] text-[#777]">
                        {isAuthenticated ? "Signed in" : "Name & email required"}
                      </span>
                    </div>

                    <div className="space-y-4 px-5 py-5">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field
                          label="Your name"
                          required
                          value={form.name}
                          onChange={(v) => setForm({ ...form, name: v })}
                          autoComplete="name"
                        />
                        <div>
                          <label className="mb-1.5 block text-[12px] font-medium text-[#333]">
                            Email <span className="text-red-600">*</span>
                          </label>
                          <input
                            type="email"
                            value={form.email}
                            onChange={(e) => {
                              setEmailDuplicate(false);
                              setEmailInvalidReason(null);
                              setForm({ ...form, email: e.target.value });
                            }}
                            onBlur={() => setEmailTouched(true)}
                            required
                            autoComplete="email"
                            aria-invalid={emailBroken || emailDuplicate}
                            className={`${inputCls} ${
                              emailBroken || emailDuplicate ? "border-red-400" : ""
                            }`}
                          />
                          {emailInvalidReason ? (
                            <p className="mt-1 text-[11px] text-red-600">
                              {emailInvalidReason}
                            </p>
                          ) : emailBroken ? (
                            <p className="mt-1 text-[11px] text-red-600">
                              Enter a valid email address (e.g. name@company.com).
                            </p>
                          ) : emailDuplicate ? (
                            <p className="mt-1 text-[11px] text-red-600">
                              This email already submitted feedback. Duplicate submissions
                              are not allowed.
                            </p>
                          ) : emailChecking && isValidEmail(form.email) ? (
                            <p className="mt-1 text-[11px] text-[#888]">
                              Verifying email domain…
                            </p>
                          ) : (
                            <p className="mt-1.5 text-[11px] leading-snug text-[#666]">
                              <span className="font-semibold text-[#109D4C]">
                                Double-check this inbox.
                              </span>{" "}
                              Every reply lands here — wrong email means radio silence.
                            </p>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-[12px] font-medium text-[#333]">
                          Rating <span className="text-red-600">*</span>
                        </label>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setForm({ ...form, stars: n })}
                              className="rounded p-1 transition hover:bg-[#109D4C]/8"
                              aria-label={`${n} stars`}
                            >
                              <Star
                                size={28}
                                className={
                                  n <= form.stars
                                    ? "fill-[#f5a524] text-[#f5a524]"
                                    : "text-[#cfcfcf]"
                                }
                              />
                            </button>
                          ))}
                          {form.stars > 0 && (
                            <span className="ml-2 text-sm text-[#666]">{form.stars}/5</span>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-[12px] font-medium text-[#333]">
                          Your feedback <span className="text-red-600">*</span>
                        </label>
                        <textarea
                          required
                          minLength={10}
                          maxLength={2000}
                          rows={5}
                          value={form.message}
                          onChange={(e) => setForm({ ...form, message: e.target.value })}
                          placeholder="What went well? What can we improve?"
                          className={`${inputCls} resize-y`}
                        />
                        <div className="mt-1 text-right text-[11px] text-[#999]">
                          {form.message.length}/2000
                        </div>
                      </div>

                      <StatusBanner status={status} email={form.email} feedback />

                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.06] pt-4">
                        <p className="text-[11px] text-[#777]">
                          By submitting you agree to our{" "}
                          <Link className="text-[#109D4C] underline" href="/privacy-policy">
                            Privacy Policy
                          </Link>
                          .
                        </p>
                        <button
                          type="submit"
                          disabled={!canSubmitFeedback}
                          title={
                            emailInvalidReason
                              ? emailInvalidReason
                              : emailDuplicate
                                ? "This email already submitted feedback"
                                : canSubmitFeedback
                                  ? undefined
                                  : "Fill name, email, rating, and feedback (10+ chars) to submit"
                          }
                          className="inline-flex items-center gap-2 rounded-md bg-[#109D4C] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0d7a3d] disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <Send size={14} />
                          {status.kind === "submitting" ? "Sending…" : "Submit feedback"}
                        </button>
                      </div>
                    </div>
                  </form>

              <aside className="space-y-3">
                <SupportSidebar />
              </aside>
            </div>

            <section className="feedback-stories mt-8">
              <div className="feedback-stories__header">
                <h3 className="feedback-stories__title">Customer success stories</h3>
                <p className="feedback-stories__sub">
                  Real experiences from people who use GatiMitra — delivery, support, and
                  everyday reliability.
                </p>
              </div>

              {reviews.length === 0 && !reviewsLoading ? (
                <div className="rounded-lg border border-dashed border-black/15 bg-white px-5 py-10 text-center text-sm text-[#777]">
                  No feedback yet — be the first to share.
                </div>
              ) : (
                <FeedbackStoriesCarousel
                  reviews={reviews}
                  loading={reviewsLoading}
                />
              )}
            </section>
          </>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] lg:gap-6">
            <form
                  onSubmit={onSubmitTicket}
                  className="rounded-lg border border-black/10 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-black/[0.06] px-5 py-3.5">
                    <h2 className="text-[15px] font-semibold">
                      {tab === "ticket" ? "Create a support ticket" : "Report an issue"}
                    </h2>
                    <span className="text-[11px] text-[#777]">
                      {isAuthenticated ? "Signed in" : "Name & email required"}
                    </span>
                  </div>

                  <div className="space-y-4 px-5 py-5">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field
                        label="Your name"
                        required
                        value={form.name}
                        onChange={(v) => setForm({ ...form, name: v })}
                        autoComplete="name"
                      />
                      <div>
                        <label className="mb-1.5 block text-[12px] font-medium text-[#333]">
                          Email <span className="text-red-600">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type="email"
                            value={form.email}
                            onChange={(e) => {
                              setEmailInvalidReason(null);
                              setForm({ ...form, email: e.target.value });
                            }}
                            onBlur={() => setEmailTouched(true)}
                            required
                            autoComplete="email"
                            aria-invalid={emailBroken}
                            className={`${inputCls} pr-9 ${emailBroken ? "border-red-400" : ""}`}
                          />
                          <Mail
                            size={15}
                            className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 ${
                              emailBroken ? "text-red-500" : "text-[#109D4C]"
                            }`}
                          />
                        </div>
                        {emailInvalidReason ? (
                          <p className="mt-1 text-[11px] text-red-600">
                            {emailInvalidReason}
                          </p>
                        ) : emailBroken ? (
                          <p className="mt-1 text-[11px] text-red-600">
                            Enter a valid email — we can’t reply without one.
                          </p>
                        ) : emailChecking && isValidEmail(form.email) ? (
                          <p className="mt-1 text-[11px] text-[#888]">
                            Verifying email domain…
                          </p>
                        ) : (
                          <p className="mt-1.5 text-[11px] leading-snug text-[#666]">
                            <span className="font-semibold text-[#109D4C]">
                              Double-check this inbox.
                            </span>{" "}
                            Every reply lands here — wrong email means radio silence.
                          </p>
                        )}
                      </div>
                      <Field
                        label="Phone (optional)"
                        type="tel"
                        value={form.phone}
                        onChange={(v) => setForm({ ...form, phone: v })}
                        autoComplete="tel"
                      />
                      <div>
                        <label className="mb-1.5 block text-[12px] font-medium text-[#333]">
                          Topic
                        </label>
                        <select
                          value={form.topic}
                          onChange={(e) => setForm({ ...form, topic: e.target.value })}
                          className={inputCls}
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

                    <div>
                      <label className="mb-1.5 block text-[12px] font-medium text-[#333]">
                        Tell us what happened <span className="text-red-600">*</span>
                      </label>
                      <textarea
                        required
                        minLength={20}
                        maxLength={4000}
                        rows={5}
                        value={form.message}
                        onChange={(e) => setForm({ ...form, message: e.target.value })}
                        placeholder="Dates, amounts, what you expected — more detail, faster resolve."
                        className={`${inputCls} resize-y`}
                      />
                      <div className="mt-1 text-right text-[11px] text-[#999]">
                        {form.message.length}/4000
                      </div>
                    </div>

                    <StatusBanner status={status} email={form.email} />

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.06] pt-4">
                      <p className="text-[11px] text-[#777]">
                        By submitting you agree to our{" "}
                        <Link className="text-[#109D4C] underline" href="/privacy-policy">
                          Privacy Policy
                        </Link>{" "}
                        and{" "}
                        <Link className="text-[#109D4C] underline" href="/terms-and-conditions">
                          Terms
                        </Link>
                        .
                      </p>
                      <button
                        type="submit"
                        disabled={!canSubmitTicket}
                        title={
                          emailInvalidReason
                            ? emailInvalidReason
                            : canSubmitTicket
                              ? undefined
                              : "Fill name, email, and message (20+ chars) to submit"
                        }
                        className="inline-flex items-center gap-2 rounded-md bg-[#109D4C] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0d7a3d] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Send size={14} />
                        {status.kind === "submitting" ? "Sending…" : "Send ticket"}
                      </button>
                    </div>
                  </div>
                </form>

            <aside className="space-y-3">
              <SupportSidebar />
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}

function SupportSidebar() {
  return (
    <>
      <div className="rounded-lg border border-black/10 bg-white p-4">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#666]">
          Faster routes
        </h3>
        <ul className="space-y-1.5 text-sm">
          {[
            { href: "/help-center", label: "Help Center" },
            { href: "/faq", label: "FAQ" },
            { href: "/refund-policy", label: "Refund Policy" },
            { href: "/cancellation-policy", label: "Cancellation Policy" },
          ].map((l) => (
            <li key={l.href}>
              <Link className="text-[#109D4C] hover:underline" href={l.href}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border border-black/10 bg-white p-4">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#666]">
          Reach us
        </h3>
        <div className="space-y-1.5 text-sm">
          <a
            className="block text-[#109D4C] hover:underline"
            href={`mailto:${SUPPORT_EMAIL}`}
          >
            {SUPPORT_EMAIL}
          </a>
          <a
            className="block text-[#109D4C] hover:underline"
            href={`tel:${SUPPORT_PHONE_TEL}`}
          >
            {SUPPORT_PHONE_DISPLAY}
          </a>
        </div>
      </div>

      <Link
        href="/grievance-redressal"
        className="flex items-start gap-2 rounded-lg border border-[#109D4C]/25 bg-[#109D4C]/[0.06] p-4 hover:bg-[#109D4C]/10"
      >
        <Shield size={16} className="mt-0.5 shrink-0 text-[#109D4C]" />
        <div>
          <div className="text-sm font-semibold text-[#0d7a3d]">Formal grievance</div>
          <div className="mt-0.5 text-[11px] text-[#444]">
            IT Rules 2021 — response within 24h
          </div>
        </div>
      </Link>
    </>
  );
}

function dedupeReviews(reviews: ReviewItem[]): ReviewItem[] {
  const seen = new Set<number>();
  const out: ReviewItem[] = [];
  for (const r of reviews) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

function storyHeadline(stars: number | null, review: string | null): string {
  const s = stars ?? 0;
  if (s >= 5) return "Loved the experience";
  if (s === 4) return "Great service";
  if (s === 3) return "Decent experience";
  if (s > 0) return "Room to improve";
  const first = (review ?? "").trim().split(/[.!?]/)[0]?.trim();
  if (first && first.length > 8 && first.length < 60) return first;
  return "Customer feedback";
}

function FeedbackStoriesCarousel({
  reviews,
  loading,
}: {
  reviews: ReviewItem[];
  loading?: boolean;
}) {
  const unique = React.useMemo(() => dedupeReviews(reviews), [reviews]);
  const [index, setIndex] = React.useState(0);
  const [modalReview, setModalReview] = React.useState<ReviewItem | null>(null);
  const n = unique.length;

  React.useEffect(() => {
    setIndex(0);
  }, [n]);

  React.useEffect(() => {
    if (n < 2 || modalReview) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % n);
    }, 6500);
    return () => window.clearInterval(id);
  }, [n, modalReview]);

  React.useEffect(() => {
    if (!modalReview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalReview(null);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [modalReview]);

  if (loading && n === 0) {
    return (
      <div className="feedback-stories__loading">Loading stories…</div>
    );
  }
  if (n === 0) return null;

  const prev = unique[(index - 1 + n) % n];
  const active = unique[index];
  const next = unique[(index + 1) % n];

  const go = (dir: -1 | 1) => {
    setIndex((i) => (i + dir + n) % n);
  };

  return (
    <div className="feedback-stories__carousel">
      <div className="feedback-stories__stage">
        {n > 1 ? (
          <button
            type="button"
            className="feedback-story feedback-story--side feedback-story--prev"
            onClick={() => setModalReview(prev)}
            aria-label={`Read full review from ${prev.name?.trim() || "customer"}`}
          >
            <StoryCardBody review={prev} />
          </button>
        ) : null}

        <button
          type="button"
          className="feedback-story feedback-story--active"
          key={active.id}
          onClick={() => setModalReview(active)}
          aria-label={`Read full review from ${active.name?.trim() || "customer"}`}
        >
          <StoryCardBody review={active} />
        </button>

        {n > 1 ? (
          <button
            type="button"
            className="feedback-story feedback-story--side feedback-story--next"
            onClick={() => setModalReview(next)}
            aria-label={`Read full review from ${next.name?.trim() || "customer"}`}
          >
            <StoryCardBody review={next} />
          </button>
        ) : null}
      </div>

      {n > 1 ? (
        <div className="feedback-stories__nav">
          <button
            type="button"
            className="feedback-stories__arrow"
            onClick={() => go(-1)}
            aria-label="Previous"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="feedback-stories__dots" role="tablist">
            {unique.map((r, i) => (
              <button
                key={r.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                className={`feedback-stories__dot${i === index ? " is-active" : ""}`}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
          <button
            type="button"
            className="feedback-stories__arrow"
            onClick={() => go(1)}
            aria-label="Next"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      ) : null}

      {modalReview ? (
        <StoryDetailModal
          review={modalReview}
          onClose={() => setModalReview(null)}
        />
      ) : null}
    </div>
  );
}

function StoryCardBody({ review: r }: { review: ReviewItem }) {
  const name = r.name?.trim() || "Customer";
  const initial = name.charAt(0).toUpperCase();
  const stars = r.stars ?? 0;
  const headline = storyHeadline(r.stars, r.review);
  const reply = r.response_message?.trim() || "";

  return (
    <div className="feedback-story__inner">
      <div className="feedback-story__top">
        <Quote size={18} className="feedback-story__quote" strokeWidth={1.5} />
        <div className="feedback-story__person">
          <div className="feedback-story__person-meta">
            <div className="feedback-story__person-name">{name}</div>
            <div className="feedback-story__person-role">
              {formatReviewDate(r.created_at) || "Customer"}
            </div>
          </div>
          <div className="feedback-story__photo" aria-hidden>
            {initial}
          </div>
        </div>
      </div>

      <h4 className="feedback-story__headline">{headline}</h4>
      <p className="feedback-story__text">{r.review || "—"}</p>

      {stars > 0 ? (
        <div className="feedback-story__stars">
          <StarsDisplay value={stars} size={11} />
          <span>{stars.toFixed(0)}.0</span>
        </div>
      ) : null}

      {reply ? (
        <div className="feedback-story__reply">
          <span>GatiMitra reply</span>
          <p>{reply}</p>
        </div>
      ) : null}

      <div className="feedback-story__brand" aria-label="GatiMitra">
        <div className="feedback-story__brand-mark" aria-hidden>
          G
        </div>
        <div className="feedback-story__brand-name">GatiMitra</div>
      </div>
    </div>
  );
}

function StoryDetailModal({
  review: r,
  onClose,
}: {
  review: ReviewItem;
  onClose: () => void;
}) {
  const name = r.name?.trim() || "Customer";
  const initial = name.charAt(0).toUpperCase();
  const stars = r.stars ?? 0;
  const headline = storyHeadline(r.stars, r.review);
  const reply = r.response_message?.trim() || "";

  return (
    <div
      className="feedback-story-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-story-modal-title"
      onClick={onClose}
    >
      <div
        className="feedback-story-modal__panel"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="feedback-story-modal__close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="feedback-story-modal__head">
          <div className="feedback-story-modal__person">
            <div className="feedback-story-modal__photo" aria-hidden>
              {initial}
            </div>
            <div>
              <div className="feedback-story-modal__name">{name}</div>
              <div className="feedback-story-modal__date">
                {formatReviewDate(r.created_at) || "Customer"}
              </div>
            </div>
          </div>
          {stars > 0 ? (
            <div className="feedback-story-modal__stars">
              <StarsDisplay value={stars} size={14} />
              <span>{stars.toFixed(0)}.0</span>
            </div>
          ) : null}
        </div>

        <h3 id="feedback-story-modal-title" className="feedback-story-modal__title">
          {headline}
        </h3>
        <p className="feedback-story-modal__text">{r.review || "—"}</p>

        {reply ? (
          <div className="feedback-story-modal__reply">
            <span>GatiMitra reply</span>
            <p>{reply}</p>
          </div>
        ) : null}

        <div className="feedback-story-modal__brand" aria-label="GatiMitra">
          <div className="feedback-story-modal__brand-mark" aria-hidden>
            G
          </div>
          <span>GatiMitra</span>
        </div>
      </div>
    </div>
  );
}

function StatusBanner({
  status,
  email,
  feedback,
}: {
  status: Status;
  email: string;
  feedback?: boolean;
}) {
  if (status.kind === "success") {
    return (
      <div className="flex items-start gap-2 rounded-md border border-[#109D4C]/30 bg-[#109D4C]/[0.08] px-3 py-2.5 text-sm">
        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#109D4C]" />
        <div>
          {feedback ? (
            <>Thanks — your feedback is saved. We’ll follow up at {email} if needed.</>
          ) : (
            <>
              Ticket created —{" "}
              <code className="font-mono text-[13px]">{status.ticketId}</code>. Reply to{" "}
              {email}.
            </>
          )}
        </div>
      </div>
    );
  }
  if (status.kind === "error") {
    return (
      <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        {status.message}
      </div>
    );
  }
  return null;
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
      <label className="mb-1.5 block text-[12px] font-medium text-[#333]">
        {props.label}
        {props.required && <span className="text-red-600"> *</span>}
      </label>
      <input
        type={props.type ?? "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        required={props.required}
        autoComplete={props.autoComplete}
        placeholder={props.placeholder}
        className={inputCls}
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
    <div className="h-full rounded-lg border border-black/10 bg-white p-4 transition hover:border-[#109D4C]/35">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded bg-[#109D4C] text-white">
        {props.icon}
      </div>
      <h3 className="text-sm font-semibold">{props.title}</h3>
      <div className="mt-1 space-y-0.5 text-sm text-[#555]">
        {props.lines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </div>
  );
  return props.href ? <a href={props.href}>{content}</a> : content;
}
