import {
  GATIMITRA_TEAM,
  GATIMITRA_STORY,
  teamMemberAbsoluteImage,
  teamMemberCanonicalUrl,
  teamIndexCanonicalUrl,
  type TeamMember,
} from '@/lib/team'

export function OrganizationLeadershipJsonLd() {
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': 'https://gatimitra.com/#org',
    name: 'GatiMitra',
    legalName: 'GatiMitra On Demand Services Private Limited',
    url: 'https://gatimitra.com',
    logo: 'https://gatimitra.com/img/logoo.png',
    foundingDate: String(GATIMITRA_STORY.foundedYear),
    foundingLocation: {
      '@type': 'Place',
      name: GATIMITRA_STORY.foundedPlace,
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Nawada',
        addressRegion: 'Bihar',
        addressCountry: 'IN',
      },
    },
    description: GATIMITRA_STORY.summary,
    founder: {
      '@type': 'Person',
      name: 'Bhim Pratap',
      jobTitle: 'Founder & CEO',
      image: teamMemberAbsoluteImage(GATIMITRA_TEAM[0]),
      url: teamMemberCanonicalUrl(GATIMITRA_TEAM[0]),
    },
    employee: GATIMITRA_TEAM.map((m) => ({
      '@type': 'Person',
      name: m.name,
      jobTitle: m.jobTitle,
      image: teamMemberAbsoluteImage(m),
      url: teamMemberCanonicalUrl(m),
      email: m.email,
      worksFor: { '@id': 'https://gatimitra.com/#org' },
    })),
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }}
    />
  )
}

export function PersonJsonLd({ member }: { member: TeamMember }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': `${teamMemberCanonicalUrl(member)}#person`,
    name: member.name,
    jobTitle: member.jobTitle,
    description: member.bio,
    image: teamMemberAbsoluteImage(member),
    url: teamMemberCanonicalUrl(member),
    email: member.email,
    worksFor: {
      '@type': 'Organization',
      name: 'GatiMitra',
      url: 'https://gatimitra.com',
      '@id': 'https://gatimitra.com/#org',
    },
    worksForOrganization: 'GatiMitra',
    nationality: { '@type': 'Country', name: 'India' },
  }

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://gatimitra.com/' },
      { '@type': 'ListItem', position: 2, name: 'Team', item: teamIndexCanonicalUrl() },
      {
        '@type': 'ListItem',
        position: 3,
        name: member.name,
        item: teamMemberCanonicalUrl(member),
      },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
    </>
  )
}

export function TeamIndexJsonLd() {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'GatiMitra Leadership Team',
    url: teamIndexCanonicalUrl(),
    description:
      'Meet the GatiMitra founding team — Founder & CEO Bhim Pratap, Co-Founder & MD Bhishm Pratap, and Tech Lead Raghu Bhunia.',
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: GATIMITRA_TEAM.map((m, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: teamMemberCanonicalUrl(m),
        name: `${m.name} — ${m.jobTitle}`,
        item: {
          '@type': 'Person',
          name: m.name,
          jobTitle: m.jobTitle,
          image: teamMemberAbsoluteImage(m),
          url: teamMemberCanonicalUrl(m),
        },
      })),
    },
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}
