/**
 * One-shot JSON-LD Organization schema injected into the global <head>.
 * Improves SERP "knowledge panel" + powers brand SoftwareApplication
 * structured data. Add to app/layout.tsx once.
 */
import React from "react";

export default function OrganizationJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://gatimitra.com/#org",
        name: "GatiMitra On Demand Services Private Limited",
        url: "https://gatimitra.com",
        logo: "https://gatimitra.com/img/logoo.png",
        sameAs: [
          "https://facebook.com/gatimitra",
          "https://twitter.com/gatimitra",
          "https://instagram.com/gatimitra",
          "https://linkedin.com/company/gatimitra",
          "https://youtube.com/@gatimitra",
        ],
        contactPoint: [
          {
            "@type": "ContactPoint",
            telephone: "+91-80-1234-5678",
            contactType: "customer support",
            email: "support@gatimitra.com",
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
      // The injected JSON is static; React's dangerouslySetInnerHTML is the
      // expected pattern for JSON-LD in App Router.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
