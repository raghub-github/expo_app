import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSessionStore } from "@/src/stores/sessionStore";
import { getRiderAppConfig } from "@/src/config/env";
import { postJson } from "@/src/services/http";
import { RIDER_ONBOARDING_SUMMARY_QUERY_KEY } from "@/src/hooks/useRiderOnboardingSummary";

const API_BASE = () => getRiderAppConfig().apiBaseUrl;

export interface SaveDocumentRequest {
  riderId: number;
  docType: string;
  fileUrl: string; // Proxy URL stored in DB
  r2Key?: string;
  extractedName?: string;
  extractedDob?: string;
  metadata?: Record<string, any>;
  /** Force selfie auto-verify after upload (onboarding Continue). */
  autoVerify?: boolean;
  files?: {
    side: "front" | "back" | "single";
    fileUrl: string;
    r2Key?: string;
    mimeType?: string;
  }[];
}

export interface SaveDocumentResponse {
  documentId: number;
  success: boolean;
}

export interface UpdateRiderStageRequest {
  riderId: number;
  stage: "MOBILE_VERIFIED" | "KYC" | "PAYMENT" | "APPROVAL" | "ACTIVE";
}

/**
 * Save document to rider_documents table
 */
export function useSaveDocument() {
  const session = useSessionStore((s) => s.session);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: SaveDocumentRequest): Promise<SaveDocumentResponse> => {
      if (!session?.accessToken) {
        throw new Error("Not authenticated");
      }

      return postJson<SaveDocumentResponse>(
        `${API_BASE()}/v1/rider/onboarding/save-document`,
        data,
        { headers: { authorization: `Bearer ${session.accessToken}` } }
      );
    },
    onSuccess: (_result, variables) => {
      // Keep KYC list, eligibility, and onboarding summary in sync after any save
      // (onboarding continue + DOCUMENT_UPDATE sheet).
      void queryClient.invalidateQueries({ queryKey: ["rider", String(variables.riderId)] });
      void queryClient.invalidateQueries({ queryKey: ["rider", "me", "documents"] });
      void queryClient.invalidateQueries({ queryKey: RIDER_ONBOARDING_SUMMARY_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["rider", "eligibility"] });
    },
  });
}

/**
 * Update rider onboarding stage
 */
export function useUpdateRiderStage() {
  const session = useSessionStore((s) => s.session);

  return useMutation({
    mutationFn: async (data: UpdateRiderStageRequest): Promise<void> => {
      if (!session?.accessToken) {
        throw new Error("Not authenticated");
      }

      await postJson(
        `${API_BASE()}/v1/rider/onboarding/update-stage`,
        data,
        { headers: { authorization: `Bearer ${session.accessToken}` } }
      );
    },
  });
}
