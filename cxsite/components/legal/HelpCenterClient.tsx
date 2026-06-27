"use client";

/**
 * Help Center — searchable index of every help topic on GatiMitra.
 *
 * Pulls the actual FAQ content from apps/customer_app/legal/faq.md (via
 * LEGAL_BUNDLE) so updates to the FAQ flow through automatically.
 *
 * Categories map to the actual customer app surface area:
 *  Orders, Wallet, Ride, Food, Courier, Payments, Membership, Technical,
 *  Refund, Account, Privacy.
 */
import React from "react";
import Link from "next/link";
import {
  Search,
  ShoppingBag,
  Wallet,
  Car,
  UtensilsCrossed,
  Package,
  CreditCard,
  Crown,
  Cpu,
  RefreshCcw,
  UserCircle,
  ShieldCheck,
  ChevronRight,
  ArrowRight,
  MessageCircle,
  FileText,
} from "lucide-react";
import { LEGAL_BUNDLE } from "@/lib/legal/bundle.generated";

type Category = {
  key: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  /** keywords used to grab matching Q&A blocks from the FAQ markdown */
  keywords: string[];
  /** also link to these full policies */
  relatedSlugs: string[];
};

const CATEGORIES: Category[] = [
  {
    key: "orders",
    title: "Orders",
    description: "Tracking, history, status changes, order help and disputes.",
    icon: <ShoppingBag size={22} />,
    keywords: ["order", "tracking", "history", "status"],
    relatedSlugs: ["shipping-delivery-policy", "cancellation-policy"],
  },
  {
    key: "wallet",
    title: "Wallet",
    description: "GMitra Money — recharge, balance, transactions and refunds to wallet.",
    icon: <Wallet size={22} />,
    keywords: ["wallet", "gmitra money", "balance", "recharge", "credit"],
    relatedSlugs: ["refund-policy"],
  },
  {
    key: "ride",
    title: "Ride",
    description: "Booking cabs/autos/bikes, captain, fare estimates, SOS and lost items.",
    icon: <Car size={22} />,
    keywords: ["ride", "cab", "auto", "bike", "captain", "driver", "trip"],
    relatedSlugs: ["safety", "lost-and-found", "surge-pricing", "fair-pricing"],
  },
  {
    key: "food",
    title: "Food",
    description: "Restaurant orders, delivery time, missing items and quality complaints.",
    icon: <UtensilsCrossed size={22} />,
    keywords: ["food", "restaurant", "menu", "delivery time", "missing", "quality"],
    relatedSlugs: ["shipping-delivery-policy", "refund-policy"],
  },
  {
    key: "courier",
    title: "Courier / Parcel",
    description: "Sending packages — pickup, prohibited items, weight and tracking.",
    icon: <Package size={22} />,
    keywords: ["parcel", "courier", "package", "pickup", "prohibited"],
    relatedSlugs: ["shipping-delivery-policy", "lost-and-found"],
  },
  {
    key: "payments",
    title: "Payments",
    description: "UPI, cards, wallet, Razorpay flow and failed payment recovery.",
    icon: <CreditCard size={22} />,
    keywords: ["payment", "upi", "card", "razorpay", "failed", "transaction"],
    relatedSlugs: ["refund-policy"],
  },
  {
    key: "membership",
    title: "GMitra Max Membership",
    description: "Free deliveries, priority captains, member-only deals — full terms.",
    icon: <Crown size={22} />,
    keywords: ["membership", "gmitra max", "premium", "subscription", "renew"],
    relatedSlugs: ["gmitra-max-terms"],
  },
  {
    key: "technical",
    title: "Technical Issues",
    description: "App crashes, location not detected, notifications, login failures.",
    icon: <Cpu size={22} />,
    keywords: ["app", "crash", "freeze", "notification", "permission", "device"],
    relatedSlugs: ["acceptable-use-policy"],
  },
  {
    key: "refund",
    title: "Refunds",
    description: "When refunds are processed, how long they take and how to escalate.",
    icon: <RefreshCcw size={22} />,
    keywords: ["refund", "money back", "credit", "reverse"],
    relatedSlugs: ["refund-policy", "cancellation-policy"],
  },
  {
    key: "account",
    title: "Account",
    description: "Login, OTP, profile, addresses, deleting your account.",
    icon: <UserCircle size={22} />,
    keywords: ["login", "otp", "profile", "address", "phone", "email", "delete"],
    relatedSlugs: ["account-deletion", "terms-and-conditions"],
  },
  {
    key: "privacy",
    title: "Privacy",
    description: "What we collect, who sees it, how long we keep it, your DPDPA rights.",
    icon: <ShieldCheck size={22} />,
    keywords: ["privacy", "data", "tracking", "consent", "dpdpa", "personal information"],
    relatedSlugs: ["privacy-policy", "dpdpa-notice", "cookies", "data-retention-policy"],
  },
];

type FaqEntry = { question: string; answer: string };

// Pre-parse FAQ markdown into Q&A pairs (each "## Q: ..." block).
function parseFaqs(md: string): FaqEntry[] {
  const lines = md.split(/\r?\n/);
  const out: FaqEntry[] = [];
  let current: FaqEntry | null = null;
  for (const line of lines) {
    // Match either "### Q: ..." or "## ..."-style headings (we treat any h2/h3 starting with Q or ending in ? as a question)
    const h = line.match(/^#{2,4}\s+(.+)$/);
    if (h) {
      const txt = h[1].trim().replace(/^Q[:.]\s*/i, "");
      if (current) out.push(current);
      current = { question: txt, answer: "" };
      continue;
    }
    if (current) {
      if (line.trim()) current.answer += (current.answer ? " " : "") + line.trim();
    }
  }
  if (current) out.push(current);
  return out.filter((e) => e.question.length > 4 && /\?$/.test(e.question));
}

const FAQ_MARKDOWN = LEGAL_BUNDLE["faq.md"] ?? "";
const ALL_FAQS: FaqEntry[] = parseFaqs(FAQ_MARKDOWN);

function matchCategory(faq: FaqEntry, c: Category): boolean {
  const blob = (faq.question + " " + faq.answer).toLowerCase();
  return c.keywords.some((k) => blob.includes(k));
}

export default function HelpCenterClient() {
  const [query, setQuery] = React.useState("");
  const [openCategory, setOpenCategory] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    if (!query.trim()) return null;
    const q = query.toLowerCase().trim();
    return ALL_FAQS.filter(
      (f) => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q),
    ).slice(0, 30);
  }, [query]);

  return (
    <main className="min-h-screen bg-white">
      {/* Hero */}
      <header className="relative border-b border-slate-100 bg-gradient-to-br from-emerald-50 via-white to-violet-50">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 via-violet-500 to-pink-500" />
        <div className="mx-auto max-w-5xl px-4 md:px-8 pt-12 pb-14 text-center">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900">
            How can we help?
          </h1>
          <p className="mt-3 text-slate-600 max-w-2xl mx-auto">
            Browse by topic or search across hundreds of answers about your GatiMitra orders,
            wallet, rides, payments and account.
          </p>

          <div className="mt-7 mx-auto max-w-2xl">
            <div className="relative">
              <Search
                size={20}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="search"
                inputMode="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Try: refund, OTP, lost item, GMitra Max…"
                className="w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-4 py-4 text-base text-slate-900 shadow-sm shadow-slate-200/40 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Pulled directly from our FAQ — {ALL_FAQS.length} questions and growing.
            </p>
          </div>
        </div>
      </header>

      {/* Search results */}
      {filtered !== null && (
        <section className="mx-auto max-w-5xl px-4 md:px-8 py-10">
          <h2 className="text-xl font-bold text-slate-900 mb-4">
            {filtered.length} {filtered.length === 1 ? "result" : "results"} for &ldquo;{query}&rdquo;
          </h2>
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
              <p className="text-slate-600">
                No answers matched your search. Try a shorter term or{" "}
                <Link href="/support" className="text-emerald-700 underline font-medium">
                  contact our support team
                </Link>
                .
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {filtered.map((f, i) => (
                <li
                  key={i}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-emerald-300 transition-colors"
                >
                  <div className="font-semibold text-slate-900">{f.question}</div>
                  <div className="mt-1 text-sm text-slate-600 leading-6 line-clamp-3">
                    {f.answer}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Category grid (hidden when searching) */}
      {filtered === null && (
        <section className="mx-auto max-w-6xl px-4 md:px-8 py-12">
          <h2 className="text-xl font-bold text-slate-900 mb-1">Browse by topic</h2>
          <p className="text-sm text-slate-600 mb-6">
            Tap a category to see related answers and the full policy.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CATEGORIES.map((c) => {
              const matches = ALL_FAQS.filter((f) => matchCategory(f, c)).slice(0, 5);
              const isOpen = openCategory === c.key;
              return (
                <div
                  key={c.key}
                  className={`group rounded-2xl border bg-white shadow-sm transition-all ${isOpen ? "border-emerald-300 shadow-emerald-100" : "border-slate-200 hover:border-emerald-200 hover:shadow-md"}`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenCategory(isOpen ? null : c.key)}
                    className="w-full text-left p-5 flex items-start gap-3"
                  >
                    <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-emerald-500 to-violet-600 text-white flex items-center justify-center shadow-md shadow-emerald-100">
                      {c.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-bold text-slate-900">{c.title}</h3>
                        <ChevronRight
                          size={16}
                          className={`text-slate-400 transition-transform ${isOpen ? "rotate-90 text-emerald-600" : ""}`}
                        />
                      </div>
                      <p className="mt-1 text-sm text-slate-600 leading-5">{c.description}</p>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-100 px-5 pb-5 pt-3">
                      {matches.length > 0 ? (
                        <ul className="space-y-2">
                          {matches.map((f, i) => (
                            <li key={i} className="text-sm">
                              <details className="group/q">
                                <summary className="cursor-pointer text-slate-800 font-medium hover:text-emerald-700 marker:hidden list-none flex items-start gap-1.5">
                                  <span className="mt-1.5 inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                                  <span>{f.question}</span>
                                </summary>
                                <p className="ml-3 mt-1.5 text-slate-600 leading-6">{f.answer}</p>
                              </details>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-slate-500 italic">
                          No specific answers tagged yet — see the policies below.
                        </p>
                      )}

                      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                        {c.relatedSlugs.map((slug) => (
                          <Link
                            key={slug}
                            href={`/${slug}`}
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                          >
                            <FileText size={11} /> {slug.replace(/-/g, " ")}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Bottom CTA */}
      <section className="mx-auto max-w-5xl px-4 md:px-8 pb-16">
        <div className="rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-violet-700 p-8 md:p-10 text-white shadow-xl shadow-emerald-200/50">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <h3 className="text-2xl md:text-3xl font-bold">Still need a hand?</h3>
              <p className="mt-2 text-emerald-50 max-w-xl">
                Our support team reads every message. Median first-response time is under 4 hours.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <Link
                href="/support"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white text-emerald-700 px-5 py-3 font-bold hover:bg-emerald-50"
              >
                <MessageCircle size={18} /> Submit a ticket
              </Link>
              <Link
                href="/contact-us"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/15 backdrop-blur border border-white/30 px-5 py-3 font-semibold hover:bg-white/25"
              >
                Reach us <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
