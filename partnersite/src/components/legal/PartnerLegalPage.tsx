import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PartnerLegalShell from "@/components/legal/PartnerLegalShell";
import { loadPartnerLegalMarkdown } from "@/lib/legal/load-legal";
import { splitPartnerLegalMarkdown } from "@/lib/legal/partner-legal-meta";
import { getPartnerLegalDoc, type PartnerLegalSlug } from "@/lib/legal/registry";

type Props = {
  slug: PartnerLegalSlug;
};

export default function PartnerLegalPage({ slug }: Props) {
  const doc = getPartnerLegalDoc(slug);
  if (!doc) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center bg-[#f4f6f8] px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">Policy not found</h1>
          <p className="mt-2 text-slate-600">This page may have moved or does not exist.</p>
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

  const raw = loadPartnerLegalMarkdown(doc.file);
  const parsed = splitPartnerLegalMarkdown(raw);

  return (
    <PartnerLegalShell
      slug={slug}
      doc={doc}
      title={parsed.title}
      summary={parsed.summary}
      meta={parsed.meta}
      agreementNotice={parsed.agreementNotice}
      introMarkdown={parsed.introHtml}
      disagreeLine={parsed.disagreeLine}
      bodyMarkdown={parsed.bodyMarkdown}
      toc={parsed.toc}
    />
  );
}
