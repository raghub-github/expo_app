import { useQuery } from "@tanstack/react-query";
import { useSessionStore } from "@/src/stores/sessionStore";
import { getRiderAppConfig } from "@/src/config/env";
import { getJson } from "@/src/services/http";
import {
  FALLBACK_ONBOARDING_DOCUMENT_TYPES,
  type OnboardingCaptureGroup,
  type OnboardingDocumentTypeDef,
} from "@/src/lib/onboarding-document-types";

const API_BASE = () => getRiderAppConfig().apiBaseUrl;

export function useOnboardingDocumentTypes(captureGroup?: OnboardingCaptureGroup) {
  const session = useSessionStore((s) => s.session);

  return useQuery({
    queryKey: ["rider", "onboarding", "document-types", captureGroup ?? "all"],
    queryFn: async (): Promise<OnboardingDocumentTypeDef[]> => {
      if (!session?.accessToken) {
        return captureGroup
          ? FALLBACK_ONBOARDING_DOCUMENT_TYPES.filter((d) => d.captureGroup === captureGroup)
          : FALLBACK_ONBOARDING_DOCUMENT_TYPES;
      }
      try {
        const qs = new URLSearchParams({ includeInactive: "true" });
        if (captureGroup) qs.set("captureGroup", captureGroup);
        const res = await getJson<{ rows: OnboardingDocumentTypeDef[] }>(
          `${API_BASE()}/v1/onboarding/document-types?${qs.toString()}`,
          { headers: { authorization: `Bearer ${session.accessToken}` } }
        );
        if (res.rows?.length) return res.rows;
      } catch (e) {
        console.warn("[useOnboardingDocumentTypes] fetch failed, using fallback", e);
      }
      return captureGroup
        ? FALLBACK_ONBOARDING_DOCUMENT_TYPES.filter((d) => d.captureGroup === captureGroup)
        : FALLBACK_ONBOARDING_DOCUMENT_TYPES;
    },
    enabled: Boolean(session?.accessToken),
    staleTime: 5 * 60_000,
    placeholderData: captureGroup
      ? FALLBACK_ONBOARDING_DOCUMENT_TYPES.filter((d) => d.captureGroup === captureGroup)
      : FALLBACK_ONBOARDING_DOCUMENT_TYPES,
  });
}
