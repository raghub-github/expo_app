import Image from 'next/image'
import Link from 'next/link'
import { GATIMITRA_TEAM, type TeamMember } from '@/lib/team'

export default function TeamMemberPage({ member }: { member: TeamMember }) {
  const others = GATIMITRA_TEAM.filter((m) => m.slug !== member.slug)
  const paragraphs =
    member.bioParagraphs && member.bioParagraphs.length > 0
      ? member.bioParagraphs
      : [member.bio]

  return (
    <div className="min-h-screen w-full bg-[#f7f7f5]">
      <div className="w-full bg-[#109D4C]">
        <p className="w-full px-4 py-2 text-[12px] font-medium text-white sm:px-6 lg:px-8 md:text-[13px]">
          GatiMitra leadership profile
        </p>
      </div>

      <nav
        className="flex w-full flex-wrap gap-2 px-4 pt-5 text-sm text-[#777] sm:px-6 lg:px-8"
        aria-label="Breadcrumb"
      >
        <Link href="/" className="hover:text-[#109D4C]">
          Home
        </Link>
        <span>/</span>
        <Link href="/team" className="hover:text-[#109D4C]">
          Team
        </Link>
        <span>/</span>
        <span className="text-[#333]">{member.name}</span>
      </nav>

      {/* Left: small image | Right: paragraphs — plain bg, no card */}
      <section className="w-full px-4 py-6 sm:px-6 md:py-8 lg:px-8">
        <div className="grid w-full gap-6 md:grid-cols-[200px_1fr] md:gap-8 lg:grid-cols-[220px_1fr] lg:gap-10">
          <div className="mx-auto w-full max-w-[220px] shrink-0 md:mx-0">
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-lg bg-[#e8f3ec]">
              <Image
                src={member.imagePath}
                alt={`${member.name}, ${member.jobTitle} of GatiMitra`}
                fill
                className="object-cover object-top"
                sizes="220px"
                priority
              />
            </div>
          </div>

          <div className="flex min-w-0 flex-col justify-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#109D4C]">
              GatiMitra Leadership
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#1a1a1a] sm:text-4xl">
              {member.name}
            </h1>
            <p className="mt-2 text-lg font-semibold text-[#109D4C]">{member.jobTitle}</p>

            <div className="mt-5 space-y-4 text-[15px] leading-7 text-[#444]">
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>

            {member.mission ? (
              <p className="mt-5 text-[15px] font-semibold leading-7 text-[#1a1a1a]">
                {member.mission}
              </p>
            ) : null}

            <dl className="mt-7 grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-lg border border-black/[0.06] bg-[#f7f7f5] p-4">
                <dt className="font-semibold text-[#777]">Organization</dt>
                <dd className="mt-1 font-medium text-[#1a1a1a]">
                  GatiMitra On Demand Services Private Limited
                </dd>
              </div>
              <div className="rounded-lg border border-black/[0.06] bg-[#f7f7f5] p-4">
                <dt className="font-semibold text-[#777]">Role</dt>
                <dd className="mt-1 font-medium text-[#1a1a1a]">{member.jobTitle}</dd>
              </div>
            </dl>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/team"
                className="rounded-md border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-[#222] hover:border-[#109D4C]/40"
              >
                All leadership
              </Link>
              <Link
                href="/about"
                className="rounded-md bg-[#109D4C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d7a3c]"
              >
                About GatiMitra
              </Link>
            </div>
          </div>
        </div>
      </section>

      {others.length > 0 ? (
        <section className="w-full border-t border-black/[0.06] bg-white px-4 py-10 sm:px-6 lg:px-8 md:py-12">
          <h2 className="text-xl font-semibold text-[#1a1a1a]">Other leaders</h2>
          <div className="mt-5 grid w-full gap-4 md:grid-cols-2">
            {others.map((m) => (
              <Link
                key={m.slug}
                href={`/team/${m.slug}`}
                className="grid grid-cols-[88px_1fr] items-center gap-4 overflow-hidden rounded-xl border border-black/[0.06] bg-[#f7f7f5] p-3 hover:border-[#109D4C]/30 sm:grid-cols-[112px_1fr]"
              >
                <div className="relative h-20 w-full overflow-hidden rounded-lg bg-[#e8f3ec] sm:h-24">
                  <Image
                    src={m.imagePath}
                    alt={m.name}
                    fill
                    className="object-cover object-top"
                    sizes="112px"
                  />
                </div>
                <div className="min-w-0 pr-2">
                  <p className="font-semibold text-[#1a1a1a]">{m.name}</p>
                  <p className="text-sm text-[#109D4C]">{m.shortTitle}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-[#666]">{m.bio}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
