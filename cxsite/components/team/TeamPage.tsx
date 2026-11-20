import Image from 'next/image'
import Link from 'next/link'
import { GATIMITRA_TEAM, GATIMITRA_STORY } from '@/lib/team'

export default function TeamPage() {
  return (
    <div className="gm-team-page">
      <div className="w-full bg-[#109D4C]">
        <p className="w-full px-4 py-2 text-[12px] font-medium text-white sm:px-6 lg:px-8 md:text-[13px]">
          Leadership behind GatiMitra — founders and tech.
        </p>
      </div>

      <header className="gm-team-hero">
        <div className="gm-team-hero__watermark-field" aria-hidden>
          {Array.from({ length: 18 }, (_, i) => (
            <span key={i} className="gm-team-hero__watermark">
              GatiMitra
            </span>
          ))}
        </div>
        <div className="gm-team-hero__inner">
          <p className="gm-team-hero__eyebrow">Leadership</p>
          <h1 className="gm-team-hero__title">People behind the platform</h1>
          <p className="gm-team-hero__lede">
            Meet the founders and tech leadership shaping India&apos;s multi-service network —
            food, rides, and parcels. Founded in {GATIMITRA_STORY.foundedYear} from{' '}
            {GATIMITRA_STORY.foundedPlace}.
          </p>
        </div>
      </header>

      <section className="gm-team-roster" aria-label="GatiMitra leadership">
        {GATIMITRA_TEAM.map((member, index) => {
          const flip = index % 2 === 1
          return (
            <Link
              key={member.slug}
              href={`/team/${member.slug}`}
              className={['gm-team-band', flip ? 'gm-team-band--flip' : ''].filter(Boolean).join(' ')}
            >
              <span className="gm-team-band__index">{String(index + 1).padStart(2, '0')}</span>

              <div className="gm-team-band__media">
                <div className="gm-team-band__frame">
                  <Image
                    src={member.imagePath}
                    alt={`${member.name}, ${member.jobTitle} at GatiMitra`}
                    fill
                    className="object-contain object-center"
                    sizes="280px"
                    priority={index < 2}
                  />
                </div>
                <span className="gm-team-band__rail" aria-hidden />
              </div>

              <div className="gm-team-band__copy">
                <p className="gm-team-band__role">{member.shortTitle}</p>
                <h2 className="gm-team-band__name">{member.name}</h2>
                <p className="gm-team-band__title">{member.jobTitle}</p>
                <p className="gm-team-band__bio">{member.bio}</p>
                <span className="gm-team-band__cta">
                  View profile
                  <span className="gm-team-band__cta-arrow" aria-hidden>
                    →
                  </span>
                </span>
              </div>
            </Link>
          )
        })}
      </section>

      <section className="gm-team-story">
        <p className="gm-team-story__label">Company</p>
        <h2 className="gm-team-story__title">Our story</h2>
        <p className="gm-team-story__org">GatiMitra On Demand Services Private Limited</p>
        <p className="gm-team-story__text">{GATIMITRA_STORY.summary}</p>
        <Link href="/about" className="gm-team-story__btn">
          Read full story
        </Link>
      </section>
    </div>
  )
}
