'use client'

import Image from 'next/image'
import Link from 'next/link'
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
import { GATIMITRA_TEAM, GATIMITRA_STORY } from '@/lib/team'

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
    <div className="mx-auto mt-4 h-1 w-20 rounded-full bg-[#109D4C]" aria-hidden />
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
    <div className="min-h-screen w-full bg-[#f7f7f5] antialiased">
      <div className="w-full bg-[#109D4C]">
        <p className="w-full px-4 py-2 text-[12px] font-medium text-white sm:px-6 lg:px-8 md:text-[13px]">
          Our story, leadership, and mission — built for everyday India.
        </p>
      </div>

      {/* Hero — story + image */}
      <section className="w-full px-4 pb-12 pt-8 sm:px-6 lg:px-8 md:pb-16 md:pt-10">
        <div className="grid w-full items-center gap-10 lg:grid-cols-2 lg:gap-12">
          <div className="relative mx-auto aspect-[4/3] w-full overflow-hidden rounded-lg border border-black/10 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] lg:mx-0">
            <Image
              src={GATIMITRA_STORY.aboutImage}
              alt="About GatiMitra — our story"
              fill
              className="object-contain p-4"
              sizes="(max-width: 1024px) 100vw, 50vw"
              priority
            />
          </div>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#109D4C]">
              Our story
            </p>
            <h1 className="mb-4 bg-gradient-to-r from-[#109D4C] via-[#16c2a5] to-[#4b2ad4] bg-clip-text text-4xl font-semibold tracking-tight text-transparent sm:text-5xl">
              About GatiMitra
            </h1>
            <p className="mb-2 text-lg font-semibold text-neutral-900 sm:text-xl">
              {GATIMITRA_STORY.headline}
            </p>
            <div
              className="mb-6 h-1 w-24 rounded-full bg-gradient-to-r from-[#109D4C] to-[#4b2ad4]"
              aria-hidden
            />
            <p className={`${body} max-w-xl`}>{GATIMITRA_STORY.summary}</p>
            <p className={`${body} mt-4 max-w-xl`}>
              Founded in {GATIMITRA_STORY.foundedYear} from {GATIMITRA_STORY.foundedPlace}. Our focus
              is simple: empower local businesses with better reach, create fair earning opportunities
              for partners, and give every customer transparency and care at every step.
            </p>
          </div>
        </div>
      </section>

      {/* Leadership — SEO + photos for Google person search */}
      <section className="w-full px-4 py-12 sm:px-6 lg:px-8 md:py-14" id="team">
        <div className="w-full">
          {sectionTitle(
            'The faces behind our growth',
            'Founder & CEO, Co-Founder & MD, and Tech Lead — the leadership building GatiMitra.'
          )}
          <div className="grid gap-6 sm:grid-cols-3">
            {GATIMITRA_TEAM.map((member) => (
              <Link
                key={member.slug}
                href={`/team/${member.slug}`}
                className="group overflow-hidden rounded-2xl border border-black/[0.06] bg-white/90 shadow-[0_12px_40px_rgba(0,0,0,0.06)] transition hover:-translate-y-1 hover:shadow-[0_16px_48px_rgba(16,157,76,0.1)]"
              >
                <div className="relative mx-auto mt-6 h-36 w-36 overflow-hidden rounded-full ring-4 ring-[#109D4C]/25">
                  <Image
                    src={member.imagePath}
                    alt={`${member.name}, ${member.jobTitle} at GatiMitra`}
                    fill
                    className="object-cover object-top"
                    sizes="144px"
                  />
                </div>
                <div className="p-5 text-center">
                  <h2 className="text-lg font-semibold text-neutral-900">{member.name}</h2>
                  <p className="mt-1 text-sm font-semibold text-[#109D4C]">{member.jobTitle}</p>
                  <p className="mt-3 line-clamp-3 text-sm text-neutral-600">{member.bio}</p>
                  <span className="mt-3 inline-block text-sm font-semibold text-[#109D4C] group-hover:underline">
                    Full profile →
                  </span>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/team"
              className="inline-flex rounded-full bg-[#109D4C] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0d7a3c]"
            >
              View full team page
            </Link>
          </div>
        </div>
      </section>

      {/* Journey milestones */}
      <section className="w-full px-4 py-12 sm:px-6 lg:px-8 md:py-14">
        <div className="w-full max-w-3xl mx-auto">
          {sectionTitle('Our journey')}
          <div className="space-y-6">
            {GATIMITRA_STORY.milestones.map((m) => (
              <div key={m.year} className={`${panel} flex flex-col gap-2 sm:flex-row sm:gap-6`}>
                <div className="shrink-0 text-2xl font-bold text-[#109D4C]">{m.year}</div>
                <div>
                  <h3 className="text-lg font-semibold text-neutral-900">{m.event}</h3>
                  <p className={`${body} mt-1`}>{m.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Vision & Mission */}
      <section className="w-full px-4 py-12 sm:px-6 lg:px-8 md:py-14">
        <div className="grid w-full gap-8 md:grid-cols-2">
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
      <section className="w-full px-4 py-12 sm:px-6 lg:px-8 md:py-14">
        <div className="w-full">
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
      <section className="w-full px-4 py-12 sm:px-6 lg:px-8 md:py-14">
        <div
          className="w-full rounded-3xl border border-[#109D4C]/10 px-4 py-14 sm:px-8"
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
      <section className="w-full px-4 py-12 sm:px-6 lg:px-8 md:py-14">
        <div className="w-full">
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
      <section className="w-full px-4 py-12 sm:px-6 lg:px-8 md:py-14">
        <div className="w-full">
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
      <section className="w-full px-4 py-12 sm:px-6 lg:px-8 md:py-14">
        <div className="w-full">
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
      <section className="w-full px-4 py-12 sm:px-6 lg:px-8 md:py-14">
        <div className="w-full">
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
      <section className="w-full px-4 pb-16 pt-10 sm:px-6 lg:px-8 md:pb-20">
        <div className="w-full">
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
