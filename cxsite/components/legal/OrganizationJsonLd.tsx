/**
 * One-shot JSON-LD Organization schema injected into the global <head>.
 * Improves SERP "knowledge panel" + powers brand SoftwareApplication
 * structured data. Add to app/layout.tsx once.
 */
import React from "react";
import { SUPPORT_EMAIL, SUPPORT_PHONE_TEL } from "@/lib/contact";

export default function OrganizationJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://gatimitra.com/#org",
        name: "GatiMitra On Demand Services Private Limited",
        alternateName: "GatiMitra",
        url: "https://gatimitra.com",
        logo: "https://gatimitra.com/img/logoo.png",
        foundingDate: "2025",
        founder: {
          "@type": "Person",
          name: "Bhim Pratap",
          jobTitle: "Founder & CEO",
          url: "https://gatimitra.com/team/bhim-pratap",
          image: "https://gatimitra.com/team/founder.jpg",
        },
        employee: [
          {
            "@type": "Person",
            name: "Bhim Pratap",
            jobTitle: "Founder & CEO",
            url: "https://gatimitra.com/team/bhim-pratap",
            image: "https://gatimitra.com/team/founder.jpg",
          },
          {
            "@type": "Person",
            name: "Bhishm Pratap",
            jobTitle: "Co-Founder & Managing Director",
            url: "https://gatimitra.com/team/bhishm-pratap",
            image: "https://gatimitra.com/team/bhishm-pratap.jpeg",
          },
          {
            "@type": "Person",
            name: "Raghu Bhunia",
            jobTitle: "Tech Lead / Lead Engineer",
            url: "https://gatimitra.com/team/raghu-bhunia",
            image: "https://gatimitra.com/team/raghu-bhunia.png",
          },
        ],
        sameAs: [
          "https://www.facebook.com/pratapsons10",
          "https://www.linkedin.com/in/pratapandsons/",
          "https://www.instagram.com/gatimitra_on_demand/",
          "https://youtube.com/@gatimitrano1",
        ],
        contactPoint: [
          {
            "@type": "ContactPoint",
            telephone: SUPPORT_PHONE_TEL,
            contactType: "customer support",
            email: SUPPORT_EMAIL,
            areaServed: "IN",
            availableLanguage: ["en", "hi"],
          },
          {
            "@type": "ContactPoint",
            email: "grievance@gatimitra.com",
            contactType: "grievance officer",
            areaServed: "IN",
          },
          {
            "@type": "ContactPoint",
            email: "dpo@gatimitra.com",
            contactType: "data protection officer",
            areaServed: "IN",
          },
        ],
      },
      {
        "@type": "WebSite",
        "@id": "https://gatimitra.com/#site",
        url: "https://gatimitra.com",
        name: "GatiMitra",
        description:
          "India's multi-service on-demand platform — food delivery, ride booking and parcel courier in one app.",
        publisher: { "@id": "https://gatimitra.com/#org" },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: "https://gatimitra.com/help-center?q={search_term_string}",
          },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "MobileApplication",
        name: "GatiMitra Customer App",
        operatingSystem: "Android, iOS",
        applicationCategory: "TravelApplication",
        offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
