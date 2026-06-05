import { useQuery } from "@tanstack/react-query";
import { useSessionStore } from "@/src/stores/sessionStore";
import { getRiderAppConfig } from "@/src/config/env";
import { getJson } from "@/src/services/http";

const API_BASE = () => getRiderAppConfig().apiBaseUrl;

export type RiderKycDocStatus = "verified" | "pending" | "rejected" | "not_uploaded";

export type RiderKycDocumentItem = {
  docKey: string;
  label: string;
  icon: string;
  required: boolean;
  status: RiderKycDocStatus;
  uploaded: boolean;
  docNumber: string | null;
  rejectedReason: string | null;
  sides: Array<{
    side: string;
    label: string;
    status: RiderKycDocStatus;
    rejectedReason: string | null;
  }>;
};

export type RiderDocumentsResponse = {
  documents: RiderKycDocumentItem[];
  verifiedCount: number;
  uploadedCount: number;
  totalCount: number;
  kycCompleted: boolean;
};

export function useRiderDocuments() {
  const session = useSessionStore((s) => s.session);

  return useQuery({
    queryKey: ["rider", "me", "documents"],
    queryFn: async (): Promise<RiderDocumentsResponse> => {
      if (!session?.accessToken) {
        throw new Error("Not authenticated");
      }
      return getJson<RiderDocumentsResponse>(`${API_BASE()}/v1/rider/me/documents`, {
        headers: { authorization: `Bearer ${session.accessToken}` },
      });
    },
    enabled: !!session?.accessToken,
    staleTime: 30_000,
    refetchOnMount: "always",
  });
}
