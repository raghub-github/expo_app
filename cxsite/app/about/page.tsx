import type { Metadata } from 'next'
import Footer from '@/components/layout/Footer'
import AboutPage from '@/components/about/AboutPage'
import { OrganizationLeadershipJsonLd } from '@/components/team/TeamJsonLd'
import { GATIMITRA_STORY } from '@/lib/team'

export const metadata: Metadata = {
  title: {
    absolute:
      'About GatiMitra | Founder & CEO Bhim Pratap — Story, Team & Mission',
  },
  description: `${GATIMITRA_STORY.summary} Founded ${GATIMITRA_STORY.foundedYear} in ${GATIMITRA_STORY.foundedPlace}. Meet Founder & CEO Bhim Pratap, Co-Founder & MD Bhishm Pratap, and Tech Lead Raghu Bhunia.`,
  keywords: [
    'About GatiMitra',
    'GatiMitra story',
    'GatiMitra founder',
    'Bhim Pratap',
    'Bhishm Pratap',
    'Raghu Bhunia',
    'GatiMitra team',
    'food delivery India',
  ],
  alternates: { canonical: 'https://gatimitra.com/about' },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  openGraph: {
    title: 'About GatiMitra | Our Story & Leadership',
    description: GATIMITRA_STORY.summary,
    url: 'https://gatimitra.com/about',
    siteName: 'GatiMitra',
    type: 'website',
    images: [{ url: 'https://gatimitra.com/team/about-story.png', alt: 'About GatiMitra' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About GatiMitra',
    description: GATIMITRA_STORY.summary,
    images: ['https://gatimitra.com/team/about-story.png'],
  },
}

export default function About() {
  return (
    <main className="w-full">
      <OrganizationLeadershipJsonLd />
      <AboutPage />
      <Footer />
    </main>
  )
}
