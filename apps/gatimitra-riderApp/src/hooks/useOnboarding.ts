import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSessionStore } from "@/src/stores/sessionStore";
import { getRiderAppConfig } from "@/src/config/env";
import { postJson } from "@/src/services/http";

const API_BASE = () => getRiderAppConfig().apiBaseUrl;

export interface CheckMobileResponse {
  exists: boolean;
  riderId?: string;
  onboardingStatus?: "not_started" | "in_progress" | "pending_approval" | "approved" | "rejected";
}

export interface CreateRiderRequest {
  phoneE164: string;
  deviceId: string;
}

export interface CreateRiderResponse {
  riderId: string;
  onboardingStatus: "not_started";
}

export interface SaveOnboardingStepRequest {
  riderId: string;
  step: "aadhaar_name" | "dl_rc" | "rental_ev" | "pan_selfie" | "location";
  data: {
    aadhaarNumber?: string;
    fullName?: string;
    dlNumber?: string;
    rcNumber?: string;
    hasOwnVehicle?: boolean;
    rentalProofSignedUrl?: string;
    evProofSignedUrl?: string;
    maxSpeedDeclaration?: number;
    panNumber?: string;
    selfieSignedUrl?: string;
    lat?: number;
    lon?: number;
    city?: string;
    state?: string;
    pincode?: string;
    address?: string;
  };
}

export interface SubmitOnboardingRequest {
  riderId: string;
  data: {
    aadhaarNumber: string;
    fullName: string;
    dlNumber?: string;
    rcNumber?: string;
    hasOwnVehicle: boolean;
    rentalProofSignedUrl?: string;
    evProofSignedUrl?: string;
    maxSpeedDeclaration?: number;
    panNumber: string;
    selfieSignedUrl: string;
    lat?: number;
    lon?: number;
    city?: string;
    state?: string;
    pincode?: string;
    address?: string;
  };
}

export interface SubmitOnboardingResponse {
  riderId: string;
  onboardingStatus: "pending_approval";
}

/**
 * Check if mobile number exists and get rider status
 */
export function useCheckMobile() {
  const session = useSessionStore((s) => s.session);
  
  return useMutation({
    mutationFn: async (phoneE164: string): Promise<CheckMobileResponse> => {
      if (!session?.accessToken) {
        throw new Error("Not authenticated");
      }
      
      return postJson<CheckMobileResponse>(
        `${API_BASE()}/v1/auth/check-mobile`,
        { phoneE164 },
        { headers: { authorization: `Bearer ${session.accessToken}` } }
      );
    },
  });
}

/**
 * Create new rider after OTP verification
 */
export function useCreateRider() {
  const session = useSessionStore((s) => s.session);
  
  return useMutation({
    mutationFn: async (data: CreateRiderRequest): Promise<CreateRiderResponse> => {
      if (!session?.accessToken) {
        throw new Error("Not authenticated");
      }
      
      return postJson<CreateRiderResponse>(
        `${API_BASE()}/v1/auth/create-rider`,
        data,
        { headers: { authorization: `Bearer ${session.accessToken}` } }
      );
    },
  });
}

/**
 * Save onboarding step progress
 */
export function useSaveOnboardingStep() {
  const session = useSessionStore((s) => s.session);
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: SaveOnboardingStepRequest): Promise<void> => {
      if (!session?.accessToken) {
        throw new Error("Not authenticated");
      }
      
      await postJson(
        `${API_BASE()}/v1/onboarding/save-step`,
        data,
        { headers: { authorization: `Bearer ${session.accessToken}` } }
      );
      
      // Invalidate rider query to refetch status
      queryClient.invalidateQueries({ queryKey: ["rider", data.riderId] });
    },
  });
}

/**
 * Submit complete onboarding
 */
export function useSubmitOnboarding() {
  const session = useSessionStore((s) => s.session);
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: SubmitOnboardingRequest): Promise<SubmitOnboardingResponse> => {
      if (!session?.accessToken) {
        throw new Error("Not authenticated");
      }
      
      const result = await postJson<SubmitOnboardingResponse>(
        `${API_BASE()}/v1/onboarding/submit`,
        data,
        { headers: { authorization: `Bearer ${session.accessToken}` } }
      );
      
      // Invalidate rider query
      queryClient.invalidateQueries({ queryKey: ["rider", data.riderId] });
      
      return result;
    },
  });
}

/**
 * Get rider onboarding status
 */
export function useRiderStatus(riderId: string | undefined) {
  const session = useSessionStore((s) => s.session);
  
  return useQuery({
    queryKey: ["rider", riderId],
    queryFn: async () => {
      if (!riderId || !session?.accessToken) {
        return null;
      }
      
      return postJson<{
        riderId: string;
        onboardingStatus: string;
        approvalStatus: string;
      }>(
        `${API_BASE()}/v1/rider/${riderId}/status`,
        {},
        { headers: { authorization: `Bearer ${session.accessToken}` } }
      );
    },
    enabled: !!riderId && !!session?.accessToken,
  });
}

