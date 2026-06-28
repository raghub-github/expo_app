'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  Building2,
  Check,
  ClipboardList,
  Crown,
  Headphones,
  Receipt,
  ShieldCheck,
  Sparkles,
  UtensilsCrossed,
  Users,
} from 'lucide-react'

const panel =
  'rounded-2xl border border-black/[0.06] bg-white/90 p-8 shadow-[0_12px_48px_rgba(0,0,0,0.07)] backdrop-blur-sm transition-shadow duration-300 hover:shadow-[0_16px_56px_rgba(16,157,76,0.08)]'

const iconLg = 'h-9 w-9 shrink-0 text-[#109D4C]'
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

const CORPORATE_EMAIL = 'contact@gatimitra.com'

const teamSizeOptions = [
  { value: '', label: 'Select team size' },
  { value: '1-50', label: '1 – 50' },
  { value: '51-200', label: '51 – 200' },
  { value: '201-1000', label: '201 – 1,000' },
  { value: '1000+', label: '1,000+' },
]

const programmeOptions = [
  { value: '', label: 'What are you interested in?' },
  { value: 'meals', label: 'Employee meals / cafeteria' },
  { value: 'events', label: 'Events & bulk orders' },
  { value: 'billing', label: 'Central billing & GST' },
  { value: 'multi-city', label: 'Multi-city / pilot' },
  { value: 'other', label: 'Other / not sure yet' },
]

export default function CorporatesPage() {
  const offerings: { Icon: LucideIcon; title: string; description: string }[] = [
    {
      Icon: UtensilsCrossed,
      title: 'Employee meals & cafeterias',
      description:
        'Recurring lunch programmes, team dinners, and pantry supplies from verified local restaurants and merchants—scheduled the way your workforce actually works.',
    },
    {
      Icon: Users,
      title: 'Events & bulk orders',
      description:
        'All-hands, client visits, and offsites with predictable portions, dietary preferences captured upfront, and single coordination instead of endless email threads.',
    },
    {
      Icon: Receipt,
      title: 'Central billing & GST-ready flows',
      description:
        'Consolidated invoicing, clear line items, and documentation your finance team can reconcile without chasing receipts across departments.',
    },
    {
      Icon: BarChart3,
      title: 'Visibility & controls',
      description:
        'Spend caps, approval-friendly ordering patterns, and reporting that helps HR and admin teams stay aligned without micromanaging every order.',
    },
    {
      Icon: Headphones,
      title: 'Dedicated support',
      description:
        'A single point of contact for escalations, menu changes, and last-minute updates—so your ops team is not juggling five different vendors.',
    },
    {
      Icon: ShieldCheck,
      title: 'Trust by design',
      description:
        'The same GatiMitra standards your people already know: verified partners, transparent tracking, and support when something needs a human fix.',
    },
  ]

  const whyPartner: string[] = [
    'Hyperlocal speed with national-grade reliability',
    'One relationship across food, parcels, and more as we grow together',
    'Flexible programmes—from pilot teams to full campuses',
    'Built for India’s compliance and invoicing realities',
  ]

  const body =
    'text-[15px] font-normal leading-[1.9] text-neutral-600 sm:text-base sm:leading-[2] text-pretty'

  const [enquiry, setEnquiry] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    city: '',
    teamSize: '',
    programme: '',
    message: '',
  })
  const [enquiryStatus, setEnquiryStatus] = useState<'idle' | 'submitting' | 'sent' | 'error'>('idle')
  const [enquiryErrorDetail, setEnquiryErrorDetail] = useState<string | null>(null)
  const [enquiryToast, setEnquiryToast] = useState<string | null>(null)

  useEffect(() => {
    if (!enquiryToast) return
    const t = window.setTimeout(() => setEnquiryToast(null), 6500)
    return () => window.clearTimeout(t)
  }, [enquiryToast])

  useEffect(() => {
    if (enquiryStatus !== 'sent') return
    const t = window.setTimeout(() => setEnquiryStatus('idle'), 4200)
    return () => window.clearTimeout(t)
  }, [enquiryStatus])

  const setEnquiryField = useCallback((key: keyof typeof enquiry, value: string) => {
    setEnquiry((f) => ({ ...f, [key]: value }))
    setEnquiryStatus('idle')
    setEnquiryErrorDetail(null)
  }, [])

  const submitEnquiry = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      const { name, email, company, phone, city, teamSize, programme, message } = enquiry
      if (!name.trim() || !email.trim() || !company.trim()) {
        setEnquiryStatus('error')
        setEnquiryErrorDetail('Please add your name, work email, and company.')
        return
      }
      if (!message.trim()) {
        setEnquiryStatus('error')
        setEnquiryErrorDetail('Please fill in “How can we help?” — it is required.')
        return
      }
      setEnquiryStatus('submitting')
      setEnquiryErrorDetail(null)
      try {
        // Same-origin relative URL — avoids NEXT_PUBLIC_API_ORIGIN cross-origin failures (no CORS on /api).
        const res = await fetch('/api/corporates/enquiry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            company: company.trim(),
            phone: phone.trim(),
            city: city.trim(),
            teamSize: teamSize.trim(),
            programme: programme.trim(),
            message: message.trim(),
          }),
        })
        const raw = await res.text()
        let data: { ok?: boolean; error?: string; ticket_id?: string } = {}
        if (raw) {
          try {
            data = JSON.parse(raw) as typeof data
          } catch {
            setEnquiryStatus('error')
            setEnquiryErrorDetail(
              res.ok
                ? 'Unexpected response from server. Please try again or email ' + CORPORATE_EMAIL + '.'
                : (raw.replace(/<[^>]+>/g, ' ').slice(0, 280).trim() || `Request failed (${res.status})`)
            )
            return
          }
        }
        if (!res.ok || !data.ok) {
          setEnquiryStatus('error')
          setEnquiryErrorDetail(data.error ?? `Request failed (${res.status})`)
          return
        }
        setEnquiryStatus('sent')
        setEnquiryToast(
          'You will receive an update on your email within the shortest possible time. Our team may also reach out directly.'
        )
        setEnquiry({
          name: '',
          email: '',
          company: '',
          phone: '',
          city: '',
          teamSize: '',
          programme: '',
          message: '',
        })
      } catch (err) {
        setEnquiryStatus('error')
        const msg = err instanceof Error && err.message ? err.message : ''
        setEnquiryErrorDetail(
          msg && !msg.includes('Failed to fetch')
            ? msg
            : 'Could not reach the server. If you are on Wi‑Fi, open this site using the same address as on your computer (e.g. the LAN IP), or email ' +
              CORPORATE_EMAIL +
              '.'
        )
      }
    },
    [enquiry]
  )

  const enquiryInputClass =
    'mt-1 w-full rounded-lg border border-neutral-300/90 bg-white px-3 py-2 text-sm text-neutral-900 shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-all placeholder:text-neutral-400 focus:border-[#109D4C] focus:ring-1 focus:ring-[#109D4C]/30'
  const enquiryLabelClass = 'block text-xs font-semibold text-neutral-700'

  return (
    <div
      className="landing-hero-ref min-h-screen antialiased"
      style={{
        background: 'linear-gradient(180deg, #faf9f7 0%, #f5f4f2 38%, #f2f2f2 100%)',
      }}
    >
      {/* Hero — split layout; curves sit inside section (no clipping) */}
      <section className="relative overflow-x-clip px-4 pb-14 pt-2 md:px-8 md:pb-16 md:pt-3">
        <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
          {/* Pink / brand curves — light strokes so they stay decorative */}
          <svg
            className="absolute left-0 top-0 h-[min(55vh,420px)] w-[min(110vw,780px)] max-w-none -translate-x-[8%] sm:h-[min(50vh,480px)] sm:w-[820px] sm:-translate-x-[5%]"
            viewBox="0 0 800 500"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="xMinYMin slice"
          >
            <path
              d="M0 380 Q 180 120 420 280 T 820 200"
              stroke="#ff4d8d"
              strokeOpacity={0.2}
              strokeWidth={1.35}
              strokeLinecap="round"
            />
            <path
              d="M40 460 Q 220 260 460 360 T 780 280"
              stroke="#16c2a5"
              strokeOpacity={0.14}
              strokeWidth={1.15}
              strokeLinecap="round"
            />
            <path
              d="M-20 300 Q 140 200 320 320 T 640 240"
              stroke="#ff4d8d"
              strokeOpacity={0.11}
              strokeWidth={1}
              strokeLinecap="round"
            />
          </svg>
          <svg
            className="absolute bottom-0 right-0 h-[min(45vh,380px)] w-[min(100vw,720px)] max-w-none translate-x-[10%] translate-y-[8%] sm:translate-x-[6%]"
            viewBox="0 0 700 450"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="xMaxYMax slice"
          >
            <path
              d="M720 40 Q 520 180 360 120 T 80 280"
              stroke="#4b2ad4"
              strokeOpacity={0.17}
              strokeWidth={1.25}
              strokeLinecap="round"
            />
            <path
              d="M760 200 Q 560 320 400 280 T 120 380"
              stroke="#4b2ad4"
              strokeOpacity={0.1}
              strokeWidth={1}
              strokeLinecap="round"
            />
          </svg>
        </div>

        <div className="relative z-[1] mx-auto grid max-w-6xl items-start gap-8 lg:grid-cols-[1fr_minmax(300px,520px)] lg:items-center lg:gap-10 xl:gap-12">
          <div className="max-w-xl lg:pr-2">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#109D4C]">
              GatiMitra for corporates
            </p>
            <h1 className="max-w-xl text-[1.85rem] font-bold leading-[1.18] tracking-tight text-neutral-800 sm:text-4xl md:text-5xl md:leading-[1.12]">
              Managing{' '}
              <span className="relative inline-block">
                <Crown
                  className="pointer-events-none absolute -top-7 left-1/2 h-5 w-5 -translate-x-1/2 text-[#ff4d8d] sm:-top-8 sm:h-6 sm:w-6"
                  strokeWidth={2}
                  aria-hidden
                />
                <span className="text-neutral-900">food</span>
              </span>{' '}
              at work is{' '}
              <span className="font-serif italic font-semibold text-[#ff4d8d]">simpler</span> than ever
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-neutral-600 sm:text-xl">
              …and you still get hyperlocal speed, GST-ready billing, and one partner for employee meals,
              events, and bulk orders—so HR and finance stay in sync.{' '}
              <span role="img" aria-label="smile">
                😊
              </span>
            </p>
            <p className={`${body} mt-4 max-w-lg text-[15px]`}>
              Same trusted GatiMitra network your people already use—structured for policies, approvals, and
              multi-city rollouts.
            </p>
          </div>

          <div
            id="corporate-enquiry"
            className="mx-auto w-full max-w-[520px] scroll-mt-24 rounded-xl border-[0.5px] border-neutral-400/22 p-4 sm:p-5 lg:mx-0 lg:max-w-none"
          >
            <h2 className="text-lg font-bold tracking-tight text-neutral-900 sm:text-xl">
              Corporate enquiry
            </h2>
            <p className="mt-1 text-xs text-neutral-500">
              <span className="text-[#109D4C]">*</span> Name, work email, company and &quot;How can we
              help?&quot; are required.
            </p>
            <form className="mt-4 space-y-3" onSubmit={submitEnquiry} noValidate>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="corp-name" className={enquiryLabelClass}>
                      Full name <span className="text-[#109D4C]">*</span>
                    </label>
                    <input
                      id="corp-name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      required
                      value={enquiry.name}
                      onChange={(e) => setEnquiryField('name', e.target.value)}
                      className={enquiryInputClass}
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <label htmlFor="corp-email" className={enquiryLabelClass}>
                      Work email <span className="text-[#109D4C]">*</span>
                    </label>
                    <input
                      id="corp-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={enquiry.email}
                      onChange={(e) => setEnquiryField('email', e.target.value)}
                      className={enquiryInputClass}
                      placeholder="you@company.com"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="corp-company" className={enquiryLabelClass}>
                      Company <span className="text-[#109D4C]">*</span>
                    </label>
                    <input
                      id="corp-company"
                      name="company"
                      type="text"
                      autoComplete="organization"
                      required
                      value={enquiry.company}
                      onChange={(e) => setEnquiryField('company', e.target.value)}
                      className={enquiryInputClass}
                      placeholder="Company name"
                    />
                  </div>
                  <div>
                    <label htmlFor="corp-phone" className={enquiryLabelClass}>
                      Phone
                    </label>
                    <input
                      id="corp-phone"
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      value={enquiry.phone}
                      onChange={(e) => setEnquiryField('phone', e.target.value)}
                      className={enquiryInputClass}
                      placeholder="+91 …"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="corp-city" className={enquiryLabelClass}>
                      City / offices
                    </label>
                    <input
                      id="corp-city"
                      name="city"
                      type="text"
                      value={enquiry.city}
                      onChange={(e) => setEnquiryField('city', e.target.value)}
                      className={enquiryInputClass}
                      placeholder="e.g. Bengaluru, Mumbai"
                    />
                  </div>
                  <div>
                    <label htmlFor="corp-team" className={enquiryLabelClass}>
                      Team size
                    </label>
                    <select
                      id="corp-team"
                      name="teamSize"
                      value={enquiry.teamSize}
                      onChange={(e) => setEnquiryField('teamSize', e.target.value)}
                      className={`${enquiryInputClass} cursor-pointer appearance-none bg-[length:0.875rem] bg-[right_0.6rem_center] bg-no-repeat pr-9`}
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%235a5a7a'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                      }}
                    >
                      {teamSizeOptions.map((o) => (
                        <option key={o.value || 'empty'} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="corp-programme" className={enquiryLabelClass}>
                    Programme
                  </label>
                  <select
                    id="corp-programme"
                    name="programme"
                    value={enquiry.programme}
                    onChange={(e) => setEnquiryField('programme', e.target.value)}
                    className={`${enquiryInputClass} cursor-pointer appearance-none bg-[length:0.875rem] bg-[right_0.6rem_center] bg-no-repeat pr-9`}
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%235a5a7a'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                    }}
                  >
                    {programmeOptions.map((o) => (
                      <option key={o.value || 'empty'} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="corp-message" className={enquiryLabelClass}>
                    How can we help? <span className="text-[#109D4C]">*</span>
                  </label>
                  <textarea
                    id="corp-message"
                    name="message"
                    rows={3}
                    required
                    value={enquiry.message}
                    onChange={(e) => setEnquiryField('message', e.target.value)}
                    className={`${enquiryInputClass} min-h-[80px] resize-y`}
                    placeholder="Timelines, dietary needs, locations…"
                  />
                </div>

                {enquiryStatus === 'error' && enquiryErrorDetail ? (
                  <p className="text-xs font-medium text-red-600" role="alert">
                    {enquiryErrorDetail}
                  </p>
                ) : null}
                {enquiryStatus === 'sent' ? (
                  <p className="text-xs font-medium text-[#109D4C]" role="status">
                    Thank you — we received your enquiry.
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={enquiryStatus === 'submitting'}
                  className="w-full rounded-xl bg-gradient-to-br from-[#109D4C] to-[#16c2a5] py-3 text-sm font-bold text-white shadow-[0_10px_28px_rgba(16,157,76,0.32)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_34px_rgba(16,157,76,0.38)] active:translate-y-0 enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto sm:min-w-[180px]"
                >
                  {enquiryStatus === 'submitting' ? 'Sending…' : 'Send enquiry'}
                </button>
            </form>
          </div>
        </div>
      </section>

      <section className="px-4 py-14 md:px-8">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-2">
          <div className={panel}>
            <div className="mb-4 flex">
              <BrandIcon Icon={Building2} />
            </div>
            <h2 className="mb-4 text-2xl font-semibold tracking-tight text-neutral-900">Built for scale</h2>
            <p className={body}>
              From a single office to distributed hubs, we design programmes around your headcount,
              locations, and policies—without losing the speed and choice that make GatiMitra work for
              everyday orders.
            </p>
          </div>
          <div className={panel}>
            <div className="mb-4 flex">
              <BrandIcon Icon={Sparkles} />
            </div>
            <h2 className="mb-4 text-2xl font-semibold tracking-tight text-neutral-900">People-first</h2>
            <p className={body}>
              Your teams get familiar brands and local favourites; leadership gets predictability,
              accountability, and a partner that treats every delivery as part of your employer brand.
            </p>
          </div>
        </div>
      </section>

      <section className="px-4 py-14 md:px-8">
        <div className="mx-auto max-w-7xl">
          {sectionTitle(
            'What we can run with you',
            'Corporate programmes tailored to how your organisation orders, approves, and pays.'
          )}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {offerings.map(({ Icon, title, description }) => (
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

      <section className="px-4 py-14 md:px-8">
        <div
          className="mx-auto max-w-6xl rounded-3xl border border-[#109D4C]/10 px-4 py-14 sm:px-8"
          style={{
            background:
              'linear-gradient(145deg, rgba(16,157,76,0.06) 0%, rgba(22,194,165,0.05) 40%, rgba(75,42,212,0.05) 100%)',
          }}
        >
          {sectionTitle(
            'Why teams choose GatiMitra',
            'A single hyperlocal platform with the rigour corporate programmes deserve.'
          )}
          <div className="mx-auto grid max-w-3xl gap-4">
            {whyPartner.map((line) => (
              <div
                key={line}
                className="flex items-start gap-3 rounded-xl border border-white/60 bg-white/80 p-4 shadow-sm backdrop-blur-sm"
              >
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-[#109D4C]" strokeWidth={2.25} aria-hidden />
                <span className={`${body} font-medium text-neutral-800`}>{line}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-24 pt-14 md:px-8">
        <div className="mx-auto max-w-4xl">
          {sectionTitle('Next steps')}
          <div className={`${panel} text-center`}>
            <div className="mb-6 flex justify-center">
              <BrandIcon Icon={ClipboardList} className={`${iconLg} mx-auto`} />
            </div>
            <p className={`${body} mx-auto mb-8 max-w-2xl`}>
              Share your city footprint, approximate team size, and the kind of programme you have in mind.
              We will follow up with a tailored overview and pilot options.
            </p>
            <a
              href="#corporate-enquiry"
              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-[#4b2ad4] to-[#6a3aff] px-8 py-3.5 text-[15px] font-semibold text-white shadow-[0_8px_28px_rgba(75,42,212,0.3)] no-underline transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_36px_rgba(75,42,212,0.38)]"
            >
              Complete enquiry
            </a>
          </div>
        </div>
      </section>

      {enquiryToast ? (
        <div
          className="pointer-events-none fixed right-3 z-[225] sm:right-5"
          style={{
            top: 'max(7.25rem, calc(env(safe-area-inset-top, 0px) + 6.75rem))',
          }}
          role="status"
          aria-live="polite"
        >
          <div className="pointer-events-auto w-[min(100vw-1.5rem,20rem)] rounded-2xl border border-neutral-200/90 bg-white/95 px-4 py-3 text-left shadow-[0_12px_40px_rgba(0,0,0,0.14)] backdrop-blur-sm sm:w-[min(100vw-2.5rem,21rem)] sm:px-5 sm:py-4">
            <div className="flex items-start gap-3">
              <Check
                className="mt-0.5 h-5 w-5 shrink-0 text-[#109D4C]"
                strokeWidth={2.5}
                aria-hidden
              />
              <div className="min-w-0 flex-1 pr-1">
                <p className="text-sm font-semibold text-neutral-900">Enquiry submitted</p>
                <p className="mt-1 text-sm leading-relaxed text-neutral-600">{enquiryToast}</p>
              </div>
              <button
                type="button"
                onClick={() => setEnquiryToast(null)}
                className="-m-1 shrink-0 rounded-lg px-2 py-1 text-lg leading-none text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                aria-label="Dismiss notification"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
