'use client';

import { useState } from 'react';
import { HelpCircle, ChevronDown } from 'lucide-react';

const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: 'How long does it take to go live?',
    answer:
      'Once all mandatory documents are submitted and onboarding is completed, we typically take 24–48 hours to verify documents and set up your catalog. If everything is correct, your store will start accepting orders in this timeframe.',
  },
  {
    question: 'Is there an onboarding fee?',
    answer:
      'Yes. GatiMitra charges a one-time onboarding fee covering document verification, catalog setup and digitization, platform configuration, quality checks, and partner onboarding support and training. The fee is collected once during the onboarding process.',
  },
  {
    question: 'How do I get help during onboarding?',
    answer:
      'Email us at support@gatimitra.com. Our support team responds within 2–3 hours and is ready to help with any step of the process.',
  },
  {
    question: 'What commission does GatiMitra charge?',
    answer:
      'GatiMitra charges a commission for order processing, platform hosting, marketing, logistics support, technology, and customer support. Rates may vary by city, location, and partner category. Your exact commission will be shared during onboarding.',
  },
  {
    question: 'When do I receive payouts?',
    answer:
      'Two payouts every week – Tuesday and Friday. Payments are transferred directly to your registered bank account.',
  },
];

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="space-y-6 sm:space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md">
          <HelpCircle className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 sm:text-2xl tracking-tight">
            Frequently asked questions
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Quick answers to common questions
          </p>
        </div>
      </div>
      <div className="space-y-4">
        {FAQ_ITEMS.map((item, index) => {
          const isOpen = openIndex === index;
          return (
            <div
              key={item.question}
              className={`overflow-hidden rounded-2xl border-2 bg-white shadow-sm transition-all duration-200 ${
                isOpen
                  ? 'border-slate-300 shadow-md'
                  : 'border-slate-200/90 hover:shadow-md hover:border-slate-200'
              }`}
            >
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors duration-200 focus:outline-none ${
                  isOpen ? 'bg-slate-50/70' : 'hover:bg-slate-50/50'
                }`}
                aria-expanded={isOpen}
                aria-controls={`faq-answer-${index}`}
                id={`faq-question-${index}`}
              >
                <span className="text-sm font-semibold text-slate-800">
                  {item.question}
                </span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              </button>
              <div
                id={`faq-answer-${index}`}
                role="region"
                aria-labelledby={`faq-question-${index}`}
                className="grid transition-[grid-template-rows] duration-200 ease-out"
                style={{
                  gridTemplateRows: isOpen ? '1fr' : '0fr',
                }}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="border-t border-slate-100 bg-slate-50/30 px-4 pb-4 pt-3">
                    <p className="text-sm leading-relaxed text-slate-600">
                      {item.answer}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
