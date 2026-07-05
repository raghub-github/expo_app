"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  FileText,
  Globe,
  Handshake,
  HelpCircle,
  Info,
  Lock,
  RefreshCw,
  Shield,
  ShieldCheck,
  Store,
  Tag,
} from "lucide-react";
import PartnerLegalHeroIllustration from "@/components/legal/PartnerLegalHeroIllustration";
import PartnerMarkdownView from "@/components/legal/PartnerMarkdownView";
import { PARTNER_LEGAL_NAV } from "@/lib/legal/partner-legal-nav";
import type { LegalMeta, TocItem } from "@/lib/legal/partner-legal-meta";
import type { PartnerLegalDoc, PartnerLegalSlug } from "@/lib/legal/registry";

type Props = {
  slug: PartnerLegalSlug;
  doc: PartnerLegalDoc;
  title: string;
  summary: string | null;
  meta: LegalMeta;
  agreementNotice: string | null;
  introMarkdown: string | null;
  disagreeLine: string | null;
  bodyMarkdown: string;
  toc: TocItem[];
};

function navIcon(id: string) {
  switch (id) {
    case "terms":
      return ShieldCheck;
    case "privacy-policy":
      return Lock;
    case "coc":
      return ClipboardList;
    case "partnership":
      return Handshake;
    case "service-policies":
      return FileText;
    case "help":
      return HelpCircle;
    default:
      return FileText;
  }
}

function formatTocLabel(text: string, index: number): string {
  const stripped = text.replace(/^\d+\.\s*/, "");
  return `${index + 1}. ${stripped}`;
}

export default function PartnerLegalShell({
  slug,
  doc,
  title,
  summary,
  meta,
  agreementNotice,
  introMarkdown,
  disagreeLine,
  bodyMarkdown,
  toc,
}: Props) {
  const [activeSection, setActiveSection] = useState(toc[0]?.id ?? "");
  const h2Toc = useMemo(() => toc.filter((t) => t.level === 2), [toc]);

  useEffect(() => {
    if (!h2Toc.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) {
          setActiveSection(visible[0].target.id);
        }
      },
      { rootMargin: "-120px 0px -55% 0px", threshold: 0.1 },
    );

    for (const item of h2Toc) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [h2Toc]);

  return (
    <div className="min-h-screen bg-[#f4f6f8] text-slate-900 print:bg-white">
      <header className="sticky top-0 z-50 border-b border-slate-200/90 bg-white/95 backdrop-blur-sm print:hidden">
        <div className="mx-auto flex h-[60px] max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-emerald-700"
          >
            <ArrowLeft size={18} />
            Back
          </button>

          <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2.5">
            <img src="/logo.png" alt="GatiMitra" className="h-8 w-auto object-contain" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Partner Legal
            </span>
          </div>

          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600">
            <Globe size={15} className="text-slate-400" />
            <span>English</span>
            <ChevronDown size={14} className="text-slate-400" />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[272px_minmax(0,1fr)_210px] lg:gap-8 lg:px-8 lg:py-8">
        {/* Left sidebar */}
        <aside className="order-2 space-y-4 lg:order-none lg:sticky lg:top-[84px] lg:self-start print:hidden">
          <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#0f766e] via-[#15803d] to-[#166534] p-5 text-white shadow-lg shadow-emerald-900/10">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">
              <Store size={22} />
            </div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-100/90">
              GatiMitra Partner
            </p>
            <p className="mt-1 text-lg font-semibold">Legal Documents</p>
          </div>

          <nav className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <ul className="divide-y divide-slate-100">
              {PARTNER_LEGAL_NAV.map((item) => {
                const Icon = navIcon(item.id);
                const active = item.slug === slug;
                const className = active
                  ? "flex items-start gap-3 border-l-[3px] border-emerald-600 bg-emerald-50/80 px-4 py-3.5"
                  : "flex items-start gap-3 border-l-[3px] border-transparent px-4 py-3.5 transition-colors hover:bg-slate-50";

                const inner = (
                  <>
                    <span
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        active ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      <Icon size={18} />
                    </span>
                    <span>
                      <span
                        className={`block text-sm font-semibold ${
                          active ? "text-emerald-800" : "text-slate-800"
                        }`}
                      >
                        {item.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">{item.subtitle}</span>
                    </span>
                  </>
                );

                return (
                  <li key={item.id}>
                    <Link href={item.href} className={className}>
                      {inner}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        {/* Main content */}
        <main className="order-1 min-w-0 lg:order-none">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {/* Hero */}
            <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-[#f3fbf6] to-white px-5 py-6 sm:px-8 sm:py-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-200">
                    <FileText size={28} />
                  </span>
                  <div className="min-w-0">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.75rem]">
                      {title}
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-[15px]">
                      {summary ?? doc.description}
                    </p>
                  </div>
                </div>
                <div className="hidden shrink-0 lg:block">
                  <PartnerLegalHeroIllustration />
                </div>
              </div>
            </div>

            {/* Metadata row */}
            <div className="border-b border-slate-100 px-5 py-4 sm:px-8 print:hidden">
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 sm:gap-6 sm:text-sm">
                {meta.effectiveDate ? (
                  <span className="inline-flex items-center gap-2">
                    <CalendarDays size={15} className="text-emerald-600" />
                    <span>
                      <span className="text-slate-400">Effective Date:</span>{" "}
                      <span className="font-medium text-slate-700">{meta.effectiveDate}</span>
                    </span>
                  </span>
                ) : null}
                {meta.lastUpdated ? (
                  <span className="inline-flex items-center gap-2">
                    <RefreshCw size={15} className="text-emerald-600" />
                    <span>
                      <span className="text-slate-400">Last Updated:</span>{" "}
                      <span className="font-medium text-slate-700">{meta.lastUpdated}</span>
                    </span>
                  </span>
                ) : null}
                {meta.version ? (
                  <span className="inline-flex items-center gap-2">
                    <Tag size={15} className="text-emerald-600" />
                    <span>
                      <span className="text-slate-400">Version:</span>{" "}
                      <span className="font-medium text-slate-700">{meta.version}</span>
                    </span>
                  </span>
                ) : null}
              </div>
            </div>

            <div className="px-5 py-6 sm:px-8 sm:py-8">
              {agreementNotice ? (
                <div className="mb-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-4 sm:px-5">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                    <Shield size={18} />
                  </span>
                  <div className="min-w-0 text-sm leading-relaxed text-emerald-950">
                    <p className="font-semibold text-emerald-900">Important Agreement</p>
                    <div className="mt-1 [&_a]:font-semibold [&_a]:text-emerald-700 [&_a]:underline [&_a]:decoration-emerald-300 [&_a]:underline-offset-2">
                      <PartnerMarkdownView source={agreementNotice} variant="inline" />
                    </div>
                  </div>
                </div>
              ) : null}

              {(introMarkdown ?? agreementNotice) ? (
                <div className="mb-6 text-sm leading-7 text-slate-700 sm:text-[15px] [&_a]:font-semibold [&_a]:text-emerald-700 [&_a]:underline [&_a]:decoration-emerald-300 [&_a]:underline-offset-2">
                  <PartnerMarkdownView source={introMarkdown ?? agreementNotice!} variant="inline" />
                </div>
              ) : null}

              {disagreeLine ? (
                <div className="mb-8 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5">
                  <Info size={18} className="mt-0.5 shrink-0 text-slate-400" />
                  <p className="text-sm text-slate-600">{disagreeLine.replace(/^>\s?/, "")}</p>
                </div>
              ) : null}

              <PartnerMarkdownView source={bodyMarkdown} variant="document" />
            </div>
          </div>
        </main>

        {/* Right sidebar — compact TOC */}
        <aside className="order-3 lg:order-none lg:sticky lg:top-[84px] lg:self-start print:hidden">
          <div className="flex min-h-[calc(100vh-6rem)] flex-col gap-3">
            <div className="min-h-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-3.5 shadow-sm">
              <h2 className="text-xs font-bold text-slate-900">On This Page</h2>
              <ol className="mt-2 space-y-0.5">
                {h2Toc.map((item, index) => {
                  const active = activeSection === item.id;
                  const label = formatTocLabel(item.text, index);
                  return (
                    <li key={item.id}>
                      <a
                        href={`#${item.id}`}
                        title={label}
                        onClick={() => setActiveSection(item.id)}
                        className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs leading-tight transition-colors ${
                          active
                            ? "bg-emerald-50 font-semibold text-emerald-700"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            active ? "bg-emerald-600" : "bg-transparent"
                          }`}
                        />
                        <span className="line-clamp-1">{label}</span>
                      </a>
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
              <p className="text-xs font-semibold leading-tight text-slate-900">Your data is protected</p>
              <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
                Read our{" "}
                <Link href="/privacy-policy" className="font-medium text-emerald-700 hover:underline">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
