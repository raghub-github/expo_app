/**
 * Partner portal legal page URLs — content is served by partnersite, not embedded in the app.
 */
import { Platform } from "react-native";
import { getConfig } from "@/config/env";

function resolvePartnerSiteBaseUrl(raw: string): string {
  let trimmed = raw.replace(/\/+$/, "");
  if (
    Platform.OS === "android" &&
    (/^https?:\/\/localhost(\b|:)/.test(trimmed) || /^https?:\/\/127\.0\.0\.1(\b|:)/.test(trimmed))
  ) {
    return trimmed.replace(/localhost|127\.0\.0\.1/, "10.0.2.2");
  }
  return trimmed;
}

export type PartnerLegalPage = "terms" | "privacy-policy" | "coc";

const PARTNER_LEGAL_PATHS: Record<PartnerLegalPage, string> = {
  terms: "/terms",
  "privacy-policy": "/privacy-policy",
  coc: "/coc",
};

export function getPartnerLegalUrl(page: PartnerLegalPage): string {
  const base = resolvePartnerSiteBaseUrl(getConfig().partnerSiteBaseUrl);
  return `${base}${PARTNER_LEGAL_PATHS[page]}`;
}

export function getPartnerLegalUrls() {
  return {
    terms: getPartnerLegalUrl("terms"),
    privacyPolicy: getPartnerLegalUrl("privacy-policy"),
    codeOfConduct: getPartnerLegalUrl("coc"),
  };
}
