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

/** One Metro warn per session — avoid 4× identical 30s timeout spam on cold boot. */
let warnedDocumentTypesFailure = false;

export function useOnboardingDocumentTypes(captureGroup?: OnboardingCaptureGroup) {
  const session = useSessionStore((s) => s.session);
  const hydrated = useSessionStore((s) => s.hydrated);

  return useQuery({
    queryKey: ["rider", "onboarding", "document-types", captureGroup ?? "all"],
    queryFn: async (): Promise<OnboardingDocumentTypeDef[]> => {
      if (!session?.accessToken) {
        return captureGroup
          ? FALLBACK_ONBOARDING_DOCUMENT_TYPES.filter((d) => d.captureGroup === captureGroup)
          : FALLBACK_ONBOARDING_DOCUMENT_TYPES;
      }
      try {
        const qs = new URLSearchParams({ includeInactive: "false" });
        if (captureGroup) qs.set("captureGroup", captureGroup);
        const res = await getJson<{ rows: OnboardingDocumentTypeDef[] }>(
          `${API_BASE()}/v1/onboarding/document-types?${qs.toString()}`,
          {
            // Boot path — fail fast to local fallback instead of hanging 30s when API is down.
            timeout: 12_000,
            headers: { authorization: `Bearer ${session.accessToken}` },
          }
        );
        if (res.rows?.length) return res.rows;
      } catch (e) {
        if (__DEV__ && !warnedDocumentTypesFailure) {
          warnedDocumentTypesFailure = true;
          console.warn(
            "[useOnboardingDocumentTypes] fetch failed, using fallback",
            e instanceof Error ? e.message : e
          );
        }
      }
      return captureGroup
        ? FALLBACK_ONBOARDING_DOCUMENT_TYPES.filter((d) => d.captureGroup === captureGroup)
        : FALLBACK_ONBOARDING_DOCUMENT_TYPES;
    },
    // Wait for session hydrate so this does not fight boot traffic / dead backend.
    enabled: hydrated && Boolean(session?.accessToken),
    staleTime: 5 * 60_000,
    retry: 0,
    placeholderData: captureGroup
      ? FALLBACK_ONBOARDING_DOCUMENT_TYPES.filter((d) => d.captureGroup === captureGroup)
      : FALLBACK_ONBOARDING_DOCUMENT_TYPES,
  });
}
