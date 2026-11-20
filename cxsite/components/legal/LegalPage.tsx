/**
 * Branded page shell for legal/policy documents.
 * Full-page width layout matching /support and /help-center.
 */
import React from "react";
import Link from "next/link";
import {
  ChevronRight,
  ArrowLeft,
  FileText,
  Clock,
  Share2,
  BookOpen,
  CalendarDays,
  Tag,
} from "lucide-react";
import {
  getLegalDoc,
  LEGAL_DOCS,
  LEGAL_PACK_VERSION,
  type LegalDoc,
} from "@/lib/legal/registry";
import { fullPageTitle, pageTitleSegment } from "@/lib/pageTitle";
import { LEGAL_BUNDLE } from "@/lib/legal/bundle.generated";
import MarkdownView from "./MarkdownView";
import { extractToc, extractMeta, estimateReadingMinutes } from "./legal-meta";
import PrintButton from "./PrintButton";

type Props = {
  slug: string;
};

const PAGE_PAD = "w-full px-4 sm:px-6 lg:px-8";

function getRelatedDocs(current: LegalDoc): LegalDoc[] {
  return LEGAL_DOCS.filter(
    (d) => d.category === current.category && d.slug !== current.slug,
  ).slice(0, 4);
}

export default function LegalPage({ slug }: Props) {
  const doc = getLegalDoc(slug);
  if (!doc) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center bg-[#f7f7f5] px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[#1a1a1a]">Policy not found</h1>
          <p className="mt-2 text-[#666]">
            The page you’re looking for has moved or doesn’t exist.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-[#109D4C] px-5 py-2.5 font-medium text-white hover:bg-[#0d7a3d]"
          >
            <ArrowLeft size={18} /> Back home
          </Link>
        </div>
      </main>
    );
  }

  const body = LEGAL_BUNDLE[doc.file] ?? "";
  const related = getRelatedDocs(doc);
  const toc = extractToc(body);
  const meta = extractMeta(body);
  const readingMin = estimateReadingMinutes(body);

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://gatimitra.com" },
      { "@type": "ListItem", position: 2, name: "Legal", item: "https://gatimitra.com/#legal" },
      {
        "@type": "ListItem",
        position: 3,
        name: doc.title,
        item: `https://gatimitra.com/${doc.slug}`,
      },
    ],
  };
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${doc.title} — GatiMitra`,
    description: doc.description,
    url: `https://gatimitra.com/${doc.slug}`,
    isPartOf: { "@id": "https://gatimitra.com/#site" },
    publisher: { "@id": "https://gatimitra.com/#org" },
    inLanguage: "en-IN",
  };

  return (
    <main className="min-h-screen w-full bg-[#f7f7f5] text-[#1a1a1a]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
      />

      <header className="w-full border-b border-black/[0.08] bg-white">
        <div className={`${PAGE_PAD} py-8 md:py-10`}>
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-1 text-sm text-[#777]"
          >
            <Link href="/" className="hover:text-[#109D4C]">
              Home
            </Link>
            <ChevronRight size={14} className="text-[#bbb]" />
            <span className="font-medium text-[#555]">Legal</span>
            <ChevronRight size={14} className="text-[#bbb]" />
            <span className="truncate font-medium text-[#333]">{doc.title}</span>
          </nav>

          <div className="mt-5 flex items-start gap-4">
            <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#109D4C] text-white shadow-sm sm:flex">
              <FileText size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-bold tracking-tight text-[#1a1a1a] md:text-4xl">
                {doc.title}
              </h1>
              <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[#666]">
                {doc.description}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {meta.lastUpdated && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#109D4C]/25 bg-[#109D4C]/[0.08] px-3 py-1 text-xs font-medium text-[#0d7a3d]">
                    <CalendarDays size={12} /> Last updated {meta.lastUpdated}
                  </span>
                )}
                {meta.effectiveDate && meta.effectiveDate !== meta.lastUpdated && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-medium text-[#555]">
                    <Clock size={12} /> Effective {meta.effectiveDate}
                  </span>
                )}
                {meta.version && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-medium text-[#555]">
                    <Tag size={12} /> v{meta.version}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-medium text-[#555]">
                  <BookOpen size={12} /> {readingMin} min read
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-medium text-[#555]">
                  Applies in India
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-medium text-[#777]">
                  Pack {LEGAL_PACK_VERSION}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="w-full bg-[#109D4C]">
        <p className={`${PAGE_PAD} py-2 text-[12px] font-medium text-white md:text-[13px]`}>
          Policies, FAQs, and support — one place. Agents track every thread and reply to your
          email.
        </p>
      </div>

      <section className={`${PAGE_PAD} py-8 md:py-10`}>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(240px,280px)] lg:gap-10">
          <div className="min-w-0 rounded-lg border border-black/10 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-7 md:p-8">
            <MarkdownView source={body} />

            {related.length > 0 && (
              <aside className="mt-12 rounded-lg border border-black/[0.08] bg-[#f7f7f5] p-5">
                <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#777]">
                  Related policies
                </h2>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {related.map((r) => (
                    <li key={r.slug}>
                      <Link
                        href={`/${r.slug}`}
                        className="group flex items-start gap-2 rounded-md border border-transparent p-2.5 transition-all hover:border-black/10 hover:bg-white"
                      >
                        <div className="mt-0.5 text-[#109D4C]">
                          <FileText size={16} />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-[#1a1a1a] group-hover:text-[#109D4C]">
                            {r.title}
                          </div>
                          <div className="line-clamp-2 text-xs text-[#777]">{r.description}</div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </aside>
            )}

            <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-lg bg-[#109D4C] px-5 py-5 text-white sm:flex-row sm:items-center">
              <div>
                <div className="text-sm font-semibold text-white/90">
                  Need help with this policy?
                </div>
                <div className="text-lg font-bold">Our team is one tap away.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/support"
                  className="rounded-md border border-white/25 bg-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/25"
                >
                  Contact support
                </Link>
                <Link
                  href="/grievance-redressal"
                  className="rounded-md bg-white px-4 py-2 text-sm font-bold text-[#0d7a3d] hover:bg-[#f3faf6]"
                >
                  File a grievance
                </Link>
              </div>
            </div>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-3">
              {toc.length > 0 && (
                <nav
                  aria-label="On this page"
                  className="max-h-[calc(100vh-8rem)] overflow-y-auto rounded-lg border border-black/10 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                >
                  <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#777]">
                    <BookOpen size={12} className="text-[#109D4C]" /> On this page
                  </h3>
                  <ol className="space-y-1.5 text-sm">
                    {toc.map((item) => (
                      <li key={item.id} className={item.level === 3 ? "pl-3" : ""}>
                        <a
                          href={`#${item.id}`}
                          className={
                            item.level === 2
                              ? "block leading-snug text-[#333] hover:text-[#109D4C] hover:underline underline-offset-2"
                              : "block text-xs leading-snug text-[#777] hover:text-[#109D4C] hover:underline underline-offset-2"
                          }
                        >
                          {item.text}
                        </a>
                      </li>
                    ))}
                  </ol>
                </nav>
              )}

              <div className="rounded-lg border border-black/10 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#777]">
                  Tools
                </h3>
                <div className="flex flex-col gap-2">
                  <a
                    href={`mailto:?subject=${encodeURIComponent(`GatiMitra ${doc.title}`)}&body=${encodeURIComponent(`https://gatimitra.com/${doc.slug}`)}`}
                    className="inline-flex items-center gap-2 rounded-md border border-black/10 px-3 py-2 text-sm text-[#333] transition-colors hover:border-[#109D4C]/40 hover:bg-[#109D4C]/[0.06]"
                  >
                    <Share2 size={14} className="text-[#109D4C]" /> Email link
                  </a>
                  <PrintButton />
                </div>
              </div>

              <div className="rounded-lg border border-black/10 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#777]">
                  Faster routes
                </h3>
                <ul className="space-y-1.5 text-sm">
                  <li>
                    <Link href="/help-center" className="text-[#109D4C] hover:underline">
                      Help Center
                    </Link>
                  </li>
                  <li>
                    <Link href="/faq" className="text-[#109D4C] hover:underline">
                      FAQ
                    </Link>
                  </li>
                  <li>
                    <Link href="/support" className="text-[#109D4C] hover:underline">
                      Support
                    </Link>
                  </li>
                </ul>
              </div>

              <Link
                href="/"
                className="block rounded-lg border border-dashed border-black/15 bg-white p-4 text-sm text-[#555] transition-colors hover:border-[#109D4C]/50 hover:bg-[#109D4C]/[0.04]"
              >
                <span className="inline-flex items-center gap-2">
                  <ArrowLeft size={14} /> Back to gatimitra.com
                </span>
              </Link>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

export function getLegalMetadata(slug: string) {
  const doc = getLegalDoc(slug);
  if (!doc) return { title: pageTitleSegment("Policy not found"), description: "" };
  const url = `https://gatimitra.com/${slug}`;
  const ogTitle = fullPageTitle(doc.title);
  return {
    title: pageTitleSegment(doc.title),
    description: doc.description,
    alternates: { canonical: url },
    openGraph: {
      title: ogTitle,
      description: doc.description,
      url,
      siteName: "GatiMitra",
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: doc.description,
    },
  };
}
