import type { Metadata } from 'next'
import Footer from '@/components/layout/Footer'
import TeamPage from '@/components/team/TeamPage'
import { OrganizationLeadershipJsonLd, TeamIndexJsonLd } from '@/components/team/TeamJsonLd'
import { teamIndexCanonicalUrl } from '@/lib/team'

export const metadata: Metadata = {
  title: {
    absolute:
      'GatiMitra Team | Founder & CEO Bhim Pratap, Co-Founder & MD Bhishm Pratap, Tech Lead Raghu Bhunia',
  },
  description:
    'Meet the GatiMitra leadership team — Founder & CEO Bhim Pratap, Co-Founder & Managing Director Bhishm Pratap, and Tech Lead Raghu Bhunia. Photos, roles and story of India’s multi-service delivery platform.',
  keywords: [
    'GatiMitra team',
    'GatiMitra founder',
    'Bhim Pratap',
    'Bhishm Pratap',
    'Raghu Bhunia',
    'GatiMitra CEO',
    'GatiMitra MD',
    'GatiMitra Tech Lead',
  ],
  alternates: { canonical: teamIndexCanonicalUrl() },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  openGraph: {
    title: 'GatiMitra Leadership Team',
    description:
      'Founder & CEO Bhim Pratap, Co-Founder & MD Bhishm Pratap, Tech Lead Raghu Bhunia — the faces behind GatiMitra.',
    url: teamIndexCanonicalUrl(),
    siteName: 'GatiMitra',
    type: 'website',
    images: [{ url: 'https://gatimitra.com/team/founder.jpg', alt: 'Bhim Pratap, Founder & CEO' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GatiMitra Leadership Team',
    description: 'Meet Founder & CEO Bhim Pratap and the GatiMitra founding team.',
    images: ['https://gatimitra.com/team/founder.jpg'],
  },
}

export default function Page() {
  return (
    <main className="w-full">
      <OrganizationLeadershipJsonLd />
      <TeamIndexJsonLd />
      <TeamPage />
      <Footer />
    </main>
  )
}
