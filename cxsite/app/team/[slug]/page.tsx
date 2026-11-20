import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Footer from '@/components/layout/Footer'
import TeamMemberPage from '@/components/team/TeamMemberPage'
import { PersonJsonLd } from '@/components/team/TeamJsonLd'
import {
  GATIMITRA_TEAM,
  getTeamMember,
  teamMemberAbsoluteImage,
  teamMemberCanonicalUrl,
} from '@/lib/team'

type PageProps = {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return GATIMITRA_TEAM.map((m) => ({ slug: m.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const member = getTeamMember(slug)
  if (!member) {
    return { title: 'Team Member Not Found | GatiMitra', robots: { index: false, follow: false } }
  }

  const title = `${member.name} — ${member.jobTitle} at GatiMitra`
  const description = `${member.name} is ${member.jobTitle} at GatiMitra. ${member.bio}`
  const canonical = teamMemberCanonicalUrl(member)
  const image = teamMemberAbsoluteImage(member)

  return {
    title: { absolute: title },
    description,
    keywords: member.keywords,
    alternates: { canonical },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: 'GatiMitra',
      type: 'profile',
      images: [{ url: image, alt: `${member.name}, ${member.jobTitle}` }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  }
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params
  const member = getTeamMember(slug)
  if (!member) notFound()

  return (
    <main className="w-full">
      <PersonJsonLd member={member} />
      <TeamMemberPage member={member} />
      <Footer />
    </main>
  )
}
