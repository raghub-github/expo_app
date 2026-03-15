'use client';

import {
  Zap,
  Shield,
  TrendingUp,
  HeadphonesIcon,
  type LucideIcon,
} from 'lucide-react';

const BENEFITS: {
  icon: LucideIcon;
  heading: string;
  description: string;
  gradient: string;
}[] = [
  {
    icon: Zap,
    heading: 'Quick onboarding',
    description: 'Get verified and go live in 24–48 hours with our streamlined process.',
    gradient: 'from-amber-400 via-orange-500 to-orange-600',
  },
  {
    icon: Shield,
    heading: 'Secure & reliable',
    description: 'Your data and payouts are protected with industry-standard security.',
    gradient: 'from-emerald-400 via-teal-500 to-teal-600',
  },
  {
    icon: TrendingUp,
    heading: 'Grow your business',
    description: 'Reach more customers and increase orders with our delivery network.',
    gradient: 'from-blue-400 via-indigo-500 to-indigo-600',
  },
  {
    icon: HeadphonesIcon,
    heading: 'Dedicated support',
    description: 'Our team is here to help you succeed with fast, friendly support.',
    gradient: 'from-violet-400 via-purple-500 to-purple-600',
  },
];

export function WhyChooseUsSection() {
  return (
    <section className="space-y-8 sm:space-y-10">
      <div className="flex items-center gap-3">
        <div className="h-10 w-1 rounded-full bg-gradient-to-b from-blue-500 to-indigo-600 shadow-sm" />
        <h2 className="text-xl font-bold text-slate-900 sm:text-2xl tracking-tight">
          Why choose GatiMitra
        </h2>
      </div>
      <div className="grid gap-5 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {BENEFITS.map(({ icon: Icon, heading, description, gradient }) => (
          <article
            key={heading}
            className="group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-7 shadow-md shadow-slate-200/50 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:shadow-slate-300/60 hover:border-slate-300/80"
          >
            <div
              className={`mb-5 inline-flex rounded-2xl bg-gradient-to-br ${gradient} p-4 text-white shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:shadow-xl`}
            >
              <Icon className="h-8 w-8 sm:h-9 sm:w-9" aria-hidden />
            </div>
            <h3 className="mb-2 text-base font-bold text-slate-900 sm:text-lg">
              {heading}
            </h3>
            <p className="text-sm leading-relaxed text-slate-600">
              {description}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
