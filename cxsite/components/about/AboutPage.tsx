'use client'

import type { LucideIcon } from 'lucide-react'
import {
  Bike,
  Brain,
  Briefcase,
  Check,
  CircleDot,
  Gem,
  Handshake,
  MapPin,
  Package,
  Rocket,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  Ticket,
  Truck,
  Users,
  Zap,
} from 'lucide-react'

/** Shared with landing hero: soft grey panel + crisp borders */
const panel =
  'rounded-2xl border border-black/[0.06] bg-white/90 p-8 shadow-[0_12px_48px_rgba(0,0,0,0.07)] backdrop-blur-sm transition-shadow duration-300 hover:shadow-[0_16px_56px_rgba(16,157,76,0.08)]'

const iconLg = 'h-9 w-9 shrink-0 text-[#109D4C]'
const iconMd = 'h-7 w-7 shrink-0 text-[#109D4C]'
const stroke = 1.65

function BrandIcon({ Icon, className = iconLg }: { Icon: LucideIcon; className?: string }) {
  return <Icon className={className} strokeWidth={stroke} aria-hidden />
}

const sectionTitle = (text: string, subtitle?: string) => (
  <div className="mx-auto mb-12 max-w-3xl text-center">
    <h2 className="text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">{text}</h2>
    <div
      className="mx-auto mt-4 h-1 w-20 rounded-full bg-gradient-to-r from-[#109D4C] via-[#16c2a5] to-[#4b2ad4]"
      aria-hidden
    />
    {subtitle ? (
      <p className="mt-4 text-base font-normal leading-relaxed text-neutral-600 sm:text-[17px] sm:leading-[1.75]">
        {subtitle}
      </p>
    ) : null}
  </div>
)

export default function AboutPage() {
  const coreServices: { Icon: LucideIcon; title: string; description: string }[] = [
    {
      Icon: Truck,
      title: 'Hyperlocal delivery',
      description:
        'Food, groceries, and daily essentials from trusted merchants near you—fulfilled quickly and reliably.',
    },
    {
      Icon: Bike,
      title: 'Rides & mobility',
      description:
        'Short trips and local rides with a focus on safety, fair pricing, and on-time arrivals.',
    },
    {
      Icon: Package,
      title: 'Parcel & courier',
      description:
        'Send documents and packages across the city with clear tracking and careful handling.',
    },
    {
      Icon: Ticket,
      title: 'Deals & vouchers',
      description:
        'Curated offers and digital perks so you save more on the services you already use.',
    },
    {
      Icon: Briefcase,
      title: 'Partner tools',
      description:
        'Dashboards, insights, and workflows built for merchants, riders, and operators to grow together.',
    },
  ]

  const whyChoosePoints: { Icon: LucideIcon; text: string }[] = [
    { Icon: Zap, text: 'Fast, hyperlocal fulfillment' },
    { Icon: ShieldCheck, text: 'Secure, transparent transactions' },
    { Icon: MapPin, text: 'Live tracking and smarter routing' },
    { Icon: Handshake, text: 'A strong local partner network' },
    { Icon: Smartphone, text: 'Simple apps and clear dashboards' },
    { Icon: Brain, text: 'Decisions backed by data' },
  ]

  const trustPoints = [
    'Verified merchants and delivery partners',
    'Robust payments and payout infrastructure',
    'Privacy-aware design and responsible data use',
    'Straightforward pricing and order visibility',
    'Responsive support when you need help',
  ]

  const values: { Icon: LucideIcon; title: string; description: string }[] = [
    { Icon: Zap, title: 'Speed', description: 'Respect for people’s time' },
    { Icon: Gem, title: 'Integrity', description: 'Honesty in every interaction' },
    { Icon: Sparkles, title: 'Innovation', description: 'Always improving the experience' },
    { Icon: Users, title: 'Inclusion', description: 'Growth shared across the ecosystem' },
    { Icon: Shield, title: 'Reliability', description: 'Services you can plan around' },
  ]

  const roadmapItems = [
    'Deeper coverage across more cities and neighbourhoods',
    'Smarter routing and personalised recommendations',
    'More services in one seamless account',
    'Richer analytics for merchant partners',
    'Stronger ties with communities and local institutions',
  ]

  const body =
    'text-[15px] font-normal leading-[1.9] text-neutral-600 sm:text-base sm:leading-[2] text-pretty'

  return (
    <div
      className="landing-hero-ref min-h-screen antialiased"
      style={{
        background: 'linear-gradient(165deg, #f7f7f7 0%, #f2f2f2 42%, #fafafa 100%)',
      }}
    >
      {/* Hero — padding clears sticky header; tight to nav after header pb-0 */}
      <section className="px-4 pb-16 pt-20 md:px-8 md:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#109D4C]">
            Our story
          </p>
          <h1 className="mb-5 bg-gradient-to-r from-[#109D4C] via-[#16c2a5] to-[#4b2ad4] bg-clip-text text-4xl font-semibold tracking-tight text-transparent sm:text-5xl md:text-6xl">
            About GatiMitra
          </h1>
          <p className="mb-6 text-xl font-semibold text-neutral-900 sm:text-2xl">Moving India forward</p>
          <div
            className="mx-auto mb-10 h-1 w-24 rounded-full bg-gradient-to-r from-[#109D4C] to-[#4b2ad4]"
            aria-hidden
          />
          <p className={`${body} mx-auto max-w-2xl`}>
            GatiMitra is a next-generation hyperlocal platform built to simplify everyday life. We connect
            people, merchants, and delivery partners in one dependable ecosystem—so whether you are ordering
            food, booking a ride, or sending a parcel, the experience feels fast, clear, and trustworthy.
          </p>
          <p className={`${body} mx-auto mt-6 max-w-2xl`}>
            Our focus is simple: empower local businesses with better reach, create fair earning
            opportunities for partners, and give every customer transparency and care at every step.
          </p>
        </div>
      </section>

      {/* Vision & Mission */}
      <section className="px-4 py-14 md:px-8">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-2">
          <div className={panel}>
            <div className="mb-4 flex">
              <BrandIcon Icon={Target} />
            </div>
            <h2 className="mb-4 text-2xl font-semibold tracking-tight text-neutral-900">Our vision</h2>
            <p className={body}>
              To be India&apos;s most trusted hyperlocal network—moving people, goods, and opportunities
              with speed and dignity, while strengthening the neighbourhoods we serve.
            </p>
          </div>
          <div className={panel}>
            <div className="mb-4 flex">
              <BrandIcon Icon={Rocket} />
            </div>
            <h2 className="mb-4 text-2xl font-semibold tracking-tight text-neutral-900">Our mission</h2>
            <ul className="space-y-3.5">
              {[
                'Make local services fast, fair, and easy to access',
                'Help merchants grow with digital tools and visibility',
                'Support riders and partners with sustainable earnings',
                'Build secure, scalable technology you can rely on',
                'Deliver experiences that feel human, not transactional',
              ].map((line) => (
                <li key={line} className={`flex gap-3 ${body}`}>
                  <Check className="mt-1 h-5 w-5 shrink-0 text-[#109D4C]" strokeWidth={2.25} aria-hidden />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Core services */}
      <section className="px-4 py-14 md:px-8">
        <div className="mx-auto max-w-7xl">
          {sectionTitle(
            'What we offer',
            'One platform for the services you use most—each designed around clarity and everyday convenience.'
          )}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {coreServices.map(({ Icon, title, description }) => (
              <div key={title} className={`${panel} p-6 hover:-translate-y-1`}>
                <div className="mb-3 flex">
                  <BrandIcon Icon={Icon} />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-neutral-900">{title}</h3>
                <p className={`${body} text-[14px] sm:text-[15px]`}>{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why choose */}
      <section className="px-4 py-14 md:px-8">
        <div
          className="mx-auto max-w-6xl rounded-3xl border border-[#109D4C]/10 px-4 py-14 sm:px-8"
          style={{
            background:
              'linear-gradient(145deg, rgba(16,157,76,0.06) 0%, rgba(22,194,165,0.05) 40%, rgba(75,42,212,0.05) 100%)',
          }}
        >
          {sectionTitle('Why GatiMitra', 'Built for real neighbourhoods—where reliability matters as much as speed.')}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {whyChoosePoints.map(({ Icon, text }) => (
              <div
                key={text}
                className="flex items-start gap-3 rounded-xl border border-white/60 bg-white/80 p-4 shadow-sm backdrop-blur-sm"
              >
                <Icon className={iconMd} strokeWidth={stroke} aria-hidden />
                <span className={`${body} font-medium text-neutral-800`}>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Technology */}
      <section className="px-4 py-14 md:px-8">
        <div className="mx-auto max-w-4xl">
          {sectionTitle('Built on modern technology')}
          <div className={panel}>
            <p className={`${body} mb-8`}>
              We invest in infrastructure that stays fast under load—so orders, rides, and payouts keep
              moving even at peak times.
            </p>
            <div className="mb-8 grid gap-4 sm:grid-cols-2">
              {[
                'Cloud-native, scalable architecture',
                'Real-time location and order tracking',
                'Secure sign-in and role-based access',
                'Search and analytics that improve over time',
                'APIs ready for new products and partners',
              ].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#109D4C]/15">
                    <Check className="h-4 w-4 text-[#109D4C]" strokeWidth={2.5} aria-hidden />
                  </span>
                  <span className={`${body} text-neutral-800`}>{item}</span>
                </div>
              ))}
            </div>
            <p className={body}>
              Security and performance are not afterthoughts—they are part of how we ship every feature.
            </p>
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="px-4 py-14 md:px-8">
        <div className="mx-auto max-w-4xl">
          {sectionTitle(
            'Trust, safety & transparency',
            'Your confidence in every order and every ride is something we work to earn—every day.'
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {trustPoints.map((point) => (
              <div
                key={point}
                className="flex items-start gap-3 rounded-xl border border-black/[0.06] bg-white/90 p-4 shadow-sm"
              >
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-[#109D4C]" strokeWidth={2.5} aria-hidden />
                <span className={`${body} font-medium text-neutral-800`}>{point}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Communities */}
      <section className="px-4 py-14 md:px-8">
        <div className="mx-auto max-w-4xl">
          {sectionTitle('Empowering local communities')}
          <div className={`${panel} text-center`}>
            <p className={`${body} mx-auto max-w-2xl text-lg`}>
              GatiMitra is more than a delivery app—it is infrastructure for local growth. We help small
              businesses reach new customers, give partners flexible ways to earn, and make it easier for
              families to get what they need from people they can trust.
            </p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="px-4 py-14 md:px-8">
        <div className="mx-auto max-w-6xl">
          {sectionTitle('Our values')}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
            {values.map(({ Icon, title, description }) => (
              <div key={title} className={`${panel} p-6 text-center hover:-translate-y-1`}>
                <div className="mb-3 flex justify-center">
                  <BrandIcon Icon={Icon} className={`${iconLg} mx-auto`} />
                </div>
                <h3 className="mb-1 text-base font-semibold text-neutral-900">{title}</h3>
                <p className={`${body} text-sm`}>{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Roadmap */}
      <section className="px-4 pb-24 pt-14 md:px-8">
        <div className="mx-auto max-w-4xl">
          {sectionTitle('What’s next')}
          <div className={panel}>
            <ul className="space-y-5">
              {roadmapItems.map((item) => (
                <li key={item} className="flex gap-4">
                  <CircleDot
                    className="mt-1 h-5 w-5 shrink-0 text-[#109D4C]"
                    strokeWidth={2}
                    aria-hidden
                  />
                  <span className={`${body} text-lg text-neutral-800`}>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}
