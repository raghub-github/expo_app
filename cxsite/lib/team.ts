/** Leadership roster — kept in sync with rider-web /about for brand consistency. */

export type TeamMember = {
  slug: string
  name: string
  jobTitle: string
  shortTitle: string
  /** Short blurb for cards / meta */
  bio: string
  /** Full biography paragraphs for profile page */
  bioParagraphs?: string[]
  /** Bold closing mission line (optional) */
  mission?: string
  imagePath: string
  email: string
  keywords: string[]
}

const SITE = 'https://gatimitra.com'

export const GATIMITRA_TEAM: TeamMember[] = [
  {
    slug: 'bhim-pratap',
    name: 'Bhim Pratap',
    jobTitle: 'Founder & CEO',
    shortTitle: 'Founder & CEO',
    bio: 'Founder and CEO of GatiMitra — building an integrated platform for food, groceries, rides, and parcels so everyday services are accessible with a few taps.',
    bioParagraphs: [
      'Bhim Pratap is the Founder and CEO of GatiMitra, an entrepreneur driven by the belief that technology should solve real problems and make everyday life simpler. With over 5 years of professional experience, he founded GatiMitra in 2025 with a clear vision: to build a platform that brings essential everyday services together and makes them accessible with just a few taps.',
      'The idea behind GatiMitra came from observing the challenges people face when accessing everyday services and the difficulties local businesses experience in reaching more customers. Instead of building another single-service application, Bhim envisioned an integrated platform where people could order food, shop for groceries, book rides, and send parcels without switching between multiple apps.',
      'Building GatiMitra has been a journey of learning, experimentation, and determination. From shaping the original idea to developing the platform, building its service ecosystem, working on technology, and bringing local merchants and customers together, he has been closely involved in turning the vision into a working business. His focus has always been on building something practical, scalable, and genuinely useful rather than simply following market trends.',
      'One of his key goals is to empower local businesses, especially small shops and independent merchants, by giving them access to digital tools, wider customer reach, and new growth opportunities. He believes that local businesses deserve the same digital opportunities as large brands, and technology can help create a more level playing field.',
      'His long-term vision goes beyond building a successful app. He wants to develop GatiMitra into a trusted, India-wide multi-service platform that connects customers, local merchants, delivery partners, and service providers through one ecosystem. He aims to expand across cities and states, create employment opportunities, strengthen local commerce, and make reliable everyday services more accessible and affordable.',
      "As a founder, Bhim believes that building a company is not just about growth or revenue; it is about solving meaningful problems, earning people's trust, creating opportunities, and building something that lasts. His ambition is to make GatiMitra a recognised name in India's on-demand services industry — a platform built around local needs with a vision for the entire nation.",
    ],
    mission:
      'His mission is simple: Build locally, create opportunities, and grow nationally — one service, one merchant, and one customer at a time.',
    imagePath: '/team/founder.jpg',
    email: 'bhim@gatimitra.com',
    keywords: [
      'Bhim Pratap',
      'Bhim Pratap GatiMitra',
      'GatiMitra Founder',
      'GatiMitra CEO',
      'Founder CEO GatiMitra',
    ],
  },
  {
    slug: 'bhishm-pratap',
    name: 'Bhishm Pratap',
    jobTitle: 'Co-Founder & Managing Director',
    shortTitle: 'Co-Founder & MD',
    bio: 'Co-Founder and Managing Director of GatiMitra — shaping business strategy, partnerships, and long-term growth with a focus on execution and sustainable scale.',
    bioParagraphs: [
      "Bhishm Pratap is the Co-Founder and Managing Director of GatiMitra, playing an important role in shaping the company's business strategy, partnerships, and long-term growth. With a strong focus on execution and business development, he works towards turning GatiMitra's vision into a scalable and sustainable business.",
      "As a key part of the founding team, Bhishm believes that building a successful company requires more than just a good idea — it takes consistency, smart decisions, strong relationships, and the ability to adapt to changing market needs. At GatiMitra, he focuses on expanding the business ecosystem, building meaningful partnerships, strengthening day-to-day operations, and creating opportunities for local merchants and service providers.",
      'His vision is to help GatiMitra grow beyond geographical boundaries and establish a strong presence across India. He aims to build a reliable multi-service platform that connects customers with local businesses while making everyday services more convenient and accessible.',
      "Bhishm is passionate about building strong teams, developing long-term business relationships, and creating a company that delivers real value to its customers and partners. Alongside the founding team, he is committed to making GatiMitra a trusted name in India's evolving digital commerce and on-demand services industry.",
    ],
    mission:
      'His belief: Sustainable growth comes from strong partnerships, consistent execution, and creating value for everyone who is part of the journey.',
    imagePath: '/team/bhishm-pratap.jpeg',
    email: 'bhishm@gatimitra.com',
    keywords: [
      'Bhishm Pratap',
      'Bhishm Pratap GatiMitra',
      'GatiMitra Co-Founder',
      'GatiMitra MD',
      'GatiMitra Managing Director',
    ],
  },
  {
    slug: 'raghu-bhunia',
    name: 'Raghu Bhunia',
    jobTitle: 'Tech Lead / Lead Engineer',
    shortTitle: 'Tech Lead',
    bio: 'Tech Lead / Lead Engineer at GatiMitra — building reliable, scalable digital infrastructure across customer, merchant, rider, and internal platforms.',
    bioParagraphs: [
      "Raghu Bhunia leads the technology and engineering efforts at GatiMitra, playing a key role in building and improving the digital infrastructure behind the platform. He is responsible for translating business ideas into practical technology solutions and ensuring that GatiMitra's applications and systems remain reliable, efficient, and ready to scale.",
      'As the technology lead, he works across different parts of the GatiMitra ecosystem, including customer applications, merchant platforms, rider applications, and internal management systems. His focus is on developing seamless user experiences, building scalable backend systems, improving application performance, and ensuring smooth communication between different services.',
      'He believes that great technology should work quietly in the background while making things simple for the people using it. From solving complex engineering challenges to improving everyday app experiences, he focuses on creating solutions that are reliable, secure, and built for real-world demands.',
      "One of his major responsibilities is preparing GatiMitra's technology infrastructure for long-term growth and expansion across India. This includes improving system scalability, strengthening platform stability, adopting efficient engineering practices, and continuously enhancing the product as customer and business requirements evolve.",
      'His goal is to help build a strong technology foundation that can support millions of users, thousands of merchants, and a growing network of delivery and mobility partners in the future.',
    ],
    mission:
      'His philosophy: Build technology that is not just innovative, but dependable, scalable, and genuinely useful in everyday life.',
    imagePath: '/team/raghu-bhunia.png',
    email: 'raghu@gatimitra.com',
    keywords: [
      'Raghu Bhunia',
      'Raghu Bhunia GatiMitra',
      'GatiMitra Tech Lead',
      'GatiMitra Lead Engineer',
    ],
  },
]

export const GATIMITRA_STORY = {
  foundedYear: 2025,
  foundedPlace: 'Nawada, Bihar',
  aboutImage: '/team/about-story.png',
  headline: 'Delivering Excellence Across All Services',
  summary:
    'GatiMitra is revolutionizing local services in India through technology, innovation, and a commitment to excellence. We provide fast, reliable services for Food Delivery, Ride Booking, and Parcel/Courier Delivery — all in one unified platform.',
  milestones: [
    {
      year: '2025',
      event: 'GatiMitra Founded',
      description:
        'Started with a vision to revolutionize local services — food delivery, ride booking, and parcel courier delivery. Operations began from Nawada, Bihar.',
    },
    {
      year: '2026',
      event: 'Platform Launch & Expansion',
      description:
        'Multi-service unified platform goes live. Food delivery, ride booking, and parcel/courier services now live. Expanding to more cities including Kolkata (coming soon).',
    },
  ],
}

export function getTeamMember(slug: string): TeamMember | undefined {
  return GATIMITRA_TEAM.find((m) => m.slug === slug)
}

export function teamMemberAbsoluteImage(member: TeamMember): string {
  return `${SITE}${member.imagePath}`
}

export function teamMemberCanonicalUrl(member: TeamMember): string {
  return `${SITE}/team/${member.slug}`
}

export function teamIndexCanonicalUrl(): string {
  return `${SITE}/team`
}
