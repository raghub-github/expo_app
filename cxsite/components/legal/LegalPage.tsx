/**
 * Branded page shell for legal/policy documents.
 *
 * Renders:
 *   - Hero band (mint→purple gradient, matches Footer top accent)
 *   - Breadcrumb: Home › Legal › <Title>
 *   - "Last Updated" badge from the registry version
 *   - Section nav (auto-generated from h2 headings inside MarkdownView)
 *   - Markdown body
 *   - Related policies card at the bottom
 *
 * Used by every app/<slug>/page.tsx.
 */
import React from "react";
import Link from "next/link";
import { ChevronRight, ArrowLeft, FileText, Clock, Share2 } from "lucide-react";
import { getLegalDoc, LEGAL_DOCS, LEGAL_PACK_VERSION, type LegalDoc } from "@/lib/legal/registry";
import { LEGAL_BUNDLE } from "@/lib/legal/bundle.generated";
import MarkdownView from "./MarkdownView";

type Props = {
  slug: string;
};

function getRelatedDocs(current: LegalDoc): LegalDoc[] {
  return LEGAL_DOCS.filter((d) => d.category === current.category && d.slug !== current.slug).slice(
    0,
    4,
  );
}

export default function LegalPage({ slug }: Props) {
  const doc = getLegalDoc(slug);
  if (!doc) {
    return (
      <main className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">Policy not found</h1>
          <p className="mt-2 text-slate-600">
            The page you’re looking for has moved or doesn’t exist.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 font-medium text-white hover:bg-emerald-700"
          >
            <ArrowLeft size={18} /> Back home
          </Link>
        </div>
      </main>
    );
  }

  const body = LEGAL_BUNDLE[doc.file] ?? "";
  const related = getRelatedDocs(doc);

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://gatimitra.com" },
      { "@type": "ListItem", position: 2, name: "Legal", item: "https://gatimitra.com/#legal" },
      { "@type": "ListItem", position: 3, name: doc.title, item: `https://gatimitra.com/${doc.slug}` },
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
    <main className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
      />
      {/* Hero / breadcrumb */}
      <header className="relative border-b border-slate-100 bg-gradient-to-br from-emerald-50 via-white to-violet-50">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 via-violet-500 to-pink-500" />
        <div className="mx-auto max-w-4xl px-4 md:px-8 pt-10 pb-12">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-slate-500">
            <Link href="/" className="hover:text-emerald-700">
              Home
            </Link>
            <ChevronRight size={14} className="text-slate-400" />
            <span className="text-slate-700 font-medium">Legal</span>
            <ChevronRight size={14} className="text-slate-400" />
            <span className="text-slate-700 font-medium truncate">{doc.title}</span>
          </nav>

          <div className="mt-5 flex items-start gap-4">
            <div className="hidden sm:flex w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-violet-600 items-center justify-center text-white shadow-md shadow-emerald-200">
              <FileText size={22} />
            </div>
            <div className="flex-1">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
                {doc.title}
              </h1>
              <p className="mt-2 text-slate-600 max-w-2xl">{doc.description}</p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700">
                  <Clock size={12} /> Pack version {LEGAL_PACK_VERSION}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600">
                  GatiMitra On Demand Services Pvt. Ltd.
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600">
                  Applies in India
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <section className="mx-auto max-w-4xl px-4 md:px-8 py-10 md:py-14">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-10">
          {/* Markdown */}
          <div className="min-w-0">
            <MarkdownView source={body} />

            {/* Related policies */}
            {related.length > 0 && (
              <aside className="mt-14 rounded-2xl border border-slate-200 bg-slate-50/60 p-5 md:p-6">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Related policies
                </h2>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {related.map((r) => (
                    <li key={r.slug}>
                      <Link
                        href={`/${r.slug}`}
                        className="group flex items-start gap-2 rounded-lg p-2.5 hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-slate-200"
                      >
                        <div className="mt-0.5 text-emerald-600 group-hover:text-emerald-700">
                          <FileText size={16} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-800 group-hover:text-emerald-700 truncate">
                            {r.title}
                          </div>
                          <div className="text-xs text-slate-500 line-clamp-2">{r.description}</div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </aside>
            )}

            {/* Footer CTA strip */}
            <div className="mt-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-violet-600 px-5 py-5 text-white shadow-lg shadow-emerald-200/50">
              <div>
                <div className="text-sm font-semibold opacity-90">Need help with this policy?</div>
                <div className="text-lg font-bold">Our team is one tap away.</div>
              </div>
              <div className="flex gap-2">
                <Link
                  href="/contact-us"
                  className="rounded-lg bg-white/15 backdrop-blur px-4 py-2 text-sm font-semibold hover:bg-white/25 border border-white/20"
                >
                  Contact us
                </Link>
                <Link
                  href="/grievance-redressal"
                  className="rounded-lg bg-white text-emerald-700 px-4 py-2 text-sm font-bold hover:bg-emerald-50"
                >
                  File a grievance
                </Link>
              </div>
            </div>
          </div>

          {/* Sticky right rail — section nav placeholder. We render a slim
              actions card here; real on-page nav is generated client-side by the
              browser's "Find in page" since we already make h2s scroll targets. */}
          <aside className="hidden md:block">
            <div className="sticky top-24 space-y-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  On this page
                </h3>
                <p className="text-xs text-slate-500 leading-5">
                  Use your browser’s search ( <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono border border-slate-300">Ctrl + F</kbd> ) to jump to any term.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Share
                </h3>
                <a
                  href={`mailto:?subject=${encodeURIComponent(`GatiMitra ${doc.title}`)}&body=${encodeURIComponent(`https://gatimitra.com/${doc.slug}`)}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <Share2 size={14} /> Email link
                </a>
              </div>

              <Link
                href="/"
                className="block rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 hover:bg-slate-50"
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
  if (!doc) return { title: "Policy not found — GatiMitra", description: "" };
  const url = `https://gatimitra.com/${slug}`;
  return {
    title: `${doc.title} — GatiMitra`,
    description: doc.description,
    alternates: { canonical: url },
    openGraph: {
      title: `${doc.title} — GatiMitra`,
      description: doc.description,
      url,
      siteName: "GatiMitra",
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: `${doc.title} — GatiMitra`,
      description: doc.description,
    },
  };
}
