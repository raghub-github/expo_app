export type OnboardingFaqItem = {
  question: string;
  answer: string;
};

export const ONBOARDING_FAQ_ITEMS: OnboardingFaqItem[] = [
  {
    question: "How long does it take to go live?",
    answer:
      "Once all mandatory documents are submitted and onboarding is completed, we typically take 24–48 hours to verify documents and set up your catalog. If everything is correct, your store will start accepting orders in this timeframe.",
  },
  {
    question: "Is there an onboarding fee?",
    answer:
      "Yes. GatiMitra charges a one-time onboarding fee covering document verification, catalog setup and digitization, platform configuration, quality checks, and partner onboarding support and training. The fee is collected once during the onboarding process.",
  },
  {
    question: "How do I get help during onboarding?",
    answer:
      "Email us at support@gatimitra.com. Our support team responds within 2–3 hours and is ready to help with any step of the process.",
  },
  {
    question: "What commission does GatiMitra charge?",
    answer:
      "GatiMitra charges a commission for order processing, platform hosting, marketing, logistics support, technology, and customer support. Rates may vary by city, location, and partner category. Your exact commission will be shared during onboarding.",
  },
  {
    question: "When do I receive payouts?",
    answer:
      "Two payouts every week – Tuesday and Friday. Payments are transferred directly to your registered bank account.",
  },
];
