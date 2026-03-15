'use client';

import {
  FileCheck,
  CheckCircle2,
  CreditCard,
  Landmark,
  LayoutList,
  Image,
  type LucideIcon,
} from 'lucide-react';

const DOCUMENTS: { icon: LucideIcon; title: string; detail: string }[] = [
  {
    icon: CreditCard,
    title: 'PAN Card',
    detail: 'Only valid adult PAN cards are accepted.',
  },
  {
    icon: FileCheck,
    title: 'Business license',
    detail: 'As applicable: e.g. FSSAI for food, drug license for pharmacy, or other trade license.',
  },
  {
    icon: Landmark,
    title: 'Bank Details',
    detail: 'Copy of cancelled cheque or bank passbook.',
  },
  {
    icon: LayoutList,
    title: 'Product / Menu catalog',
    detail: 'Complete catalog or menu you want to list for online orders.',
  },
  {
    icon: Image,
    title: 'Store cover image',
    detail: "Used as your store's cover image on GatiMitra.",
  },
];

export function NeededDocumentsSection() {
  return (
    <section className="space-y-6 sm:space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md">
          <FileCheck className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 sm:text-2xl tracking-tight">
            Documents you need
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Keep these ready for a smooth onboarding
          </p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {DOCUMENTS.map(({ icon: Icon, title, detail }) => (
          <div
            key={title}
            className="group flex items-start gap-4 rounded-2xl border-2 border-slate-200/90 bg-white p-5 shadow-sm transition-all duration-300 hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-100/50 hover:ring-2 hover:ring-emerald-200/50"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 transition-colors">
              <Icon className="h-6 w-6" aria-hidden />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-start gap-3">
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500"
                  aria-hidden
                />
                <div>
                  <p className="text-base font-semibold text-slate-900">{title}</p>
                  <p className="mt-1 text-sm text-slate-600 leading-relaxed">{detail}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-amber-300/80 bg-gradient-to-r from-amber-50 to-yellow-50/80 px-5 py-4 shadow-sm">
        <p className="text-sm text-amber-900 leading-relaxed">
          <span className="font-semibold">Optional:</span> GST Certificate –
          Required only if applicable based on the provided PAN.
        </p>
      </div>
    </section>
  );
}
