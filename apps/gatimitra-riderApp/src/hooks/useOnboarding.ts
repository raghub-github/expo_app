import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSessionStore } from "@/src/stores/sessionStore";
import { getRiderAppConfig } from "@/src/config/env";
import { postJson, getJson, isRiderNotFoundError, isUnauthorizedError } from "@/src/services/http";

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
    dob?: string;
    fileUrl?: string;
    verificationMethod?: string;
    dlNumber?: string;
    rcNumber?: string;
    hasOwnVehicle?: boolean;
    vehicleChoice?: string;
    vehicleCategoryCode?: string;
    /** Single selected model name (never the full "A / B / C" catalog label). */
    vehicleModelLabel?: string;
    onboardingFlow?: "dl_rc" | "rental_ev" | "payment";
    submitVehicleDocs?: boolean;
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
      
      return getJson<{
        riderId: string;
        name?: string | null;
        mobile?: string;
        referralCode?: string | null;
        preferredLanguage?: string;
        selfieUrl?: string | null;
        onboardingStatus: string;
        approvalStatus: string;
        accountStatus?: string;
        hasHomeLocation?: boolean;
        homeAddress?: {
          city: string | null;
          state: string | null;
          pincode: string | null;
          address: string | null;
          lat: number | null;
          lon: number | null;
        } | null;
        nextOnboardingStep?: string;
        completedOnboardingSteps?: string[];
        rating?: number | null;
        panNumber?: string | null;
        panVerified?: boolean;
        dob?: string | null;
        dlNumber?: string | null;
        dlFrontUrl?: string | null;
        dlBackUrl?: string | null;
        dlVerified?: boolean;
        dlVerifiedData?: Record<string, unknown> | null;
        rcNumber?: string | null;
        rcFrontUrl?: string | null;
        rcVerified?: boolean;
        rcVerifiedData?: Record<string, unknown> | null;
        onboardingProgress?: Record<string, string>;
        lastCompletedStep?: string | null;
        nextRequiredStep?: string | null;
        onboardingProgressPct?: number;
        macroStepIndex?: number;
        paymentCompleted?: boolean;
      }>(`${API_BASE()}/v1/rider/${riderId}/status`, {
        headers: { authorization: `Bearer ${session.accessToken}` },
      });
    },
    enabled: !!riderId && !!session?.accessToken,
    staleTime: 15_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: (failureCount, error) => {
      if (isRiderNotFoundError(error) || isUnauthorizedError(error)) return false;
      return failureCount < 2;
    },
  });
}

export type CheckAadhaarResponse = {
  registered: boolean;
};

/** Live check: is this Aadhaar already linked to another rider? */
export function useAadhaarRegistrationCheck(aadhaarDigits: string, riderId?: string) {
  const session = useSessionStore((s) => s.session);

  return useQuery({
    queryKey: ["onboarding", "check-aadhaar", aadhaarDigits, riderId],
    queryFn: async (): Promise<CheckAadhaarResponse> => {
      if (!session?.accessToken) {
        throw new Error("Not authenticated");
      }
      return postJson<CheckAadhaarResponse>(
        `${API_BASE()}/v1/onboarding/check-aadhaar`,
        { aadhaarNumber: aadhaarDigits, riderId },
        { headers: { authorization: `Bearer ${session.accessToken}` } }
      );
    },
    enabled: aadhaarDigits.length === 12 && Boolean(session?.accessToken),
    staleTime: 30_000,
    retry: false,
  });
}

export type CheckPanResponse = {
  registered: boolean;
};

/** Live check: is this PAN already linked to another rider? */
export function usePanRegistrationCheck(panValue: string, riderId?: string) {
  const session = useSessionStore((s) => s.session);
  const pan = panValue.replace(/[^A-Z0-9]/gi, "").toUpperCase();

  return useQuery({
    queryKey: ["onboarding", "check-pan", pan, riderId],
    queryFn: async (): Promise<CheckPanResponse> => {
      if (!session?.accessToken) {
        throw new Error("Not authenticated");
      }
      return postJson<CheckPanResponse>(
        `${API_BASE()}/v1/onboarding/check-pan`,
        { panNumber: pan, riderId },
        { headers: { authorization: `Bearer ${session.accessToken}` } }
      );
    },
    enabled: /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan) && Boolean(session?.accessToken),
    staleTime: 30_000,
    retry: false,
  });
}

export type CheckDocNumberResponse = {
  registered: boolean;
};

/** Live check: is this DL number already linked to another rider? */
export function useDlRegistrationCheck(dlValue: string, riderId?: string, minLength = 4) {
  const session = useSessionStore((s) => s.session);
  const dl = dlValue.replace(/[^A-Z0-9]/gi, "").toUpperCase();

  return useQuery({
    queryKey: ["onboarding", "check-dl", dl, riderId],
    queryFn: async (): Promise<CheckDocNumberResponse> => {
      if (!session?.accessToken) {
        throw new Error("Not authenticated");
      }
      return postJson<CheckDocNumberResponse>(
        `${API_BASE()}/v1/onboarding/check-dl`,
        { dlNumber: dl, riderId },
        { headers: { authorization: `Bearer ${session.accessToken}` } }
      );
    },
    enabled: dl.length >= minLength && Boolean(session?.accessToken),
    staleTime: 30_000,
    retry: false,
  });
}

/** Live check: is this RC number already linked to another rider? */
export function useRcRegistrationCheck(rcValue: string, riderId?: string, minLength = 4) {
  const session = useSessionStore((s) => s.session);
  const rc = rcValue.replace(/[^A-Z0-9]/gi, "").toUpperCase();

  return useQuery({
    queryKey: ["onboarding", "check-rc", rc, riderId],
    queryFn: async (): Promise<CheckDocNumberResponse> => {
      if (!session?.accessToken) {
        throw new Error("Not authenticated");
      }
      return postJson<CheckDocNumberResponse>(
        `${API_BASE()}/v1/onboarding/check-rc`,
        { rcNumber: rc, riderId },
        { headers: { authorization: `Bearer ${session.accessToken}` } }
      );
    },
    enabled: rc.length >= minLength && Boolean(session?.accessToken),
    staleTime: 30_000,
    retry: false,
  });
}


// ── Electronic verification (Cashfree via backend policy engine) ────────────

export type VerificationModesResponse = {
  success: boolean;
  /** document_kind → 'manual' | 'auto' | 'hybrid' | 'disabled' */
  modes: Record<string, string>;
};

/**
 * Per-document verification modes from the super-admin Policy Center.
 * Drives the hybrid onboarding flow:
 *   manual  → classic photo-upload step
 *   auto    → number-only; failure blocks (retry later, no upload shown)
 *   hybrid  → number-only; failure reveals the photo-upload fallback
 */
export function useVerificationModes() {
  const session = useSessionStore((s) => s.session);
  return useQuery({
    queryKey: ["onboarding", "verification-modes"],
    queryFn: async (): Promise<VerificationModesResponse> => {
      return getJson<VerificationModesResponse>(
        `${API_BASE()}/v1/onboarding/verification-modes`,
        { headers: { authorization: `Bearer ${session?.accessToken ?? ""}` } }
      );
    },
    enabled: Boolean(session?.accessToken),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export type VerifyDocumentRequest = {
  riderId: string;
  docKind: "pan" | "driving_licence" | "vehicle_rc" | "aadhaar" | "bank_account";
  aadhaarNumber?: string;
  pan?: string;
  name?: string;
  dlNumber?: string;
  dob?: string;
  vehicleNumber?: string;
  bankAccount?: string;
  ifsc?: string;
  /** HTTPS DigiLocker return URL (Cashfree requires https). */
  redirectUrl?: string;
};

export type VerifyDocumentResponse = {
  success: boolean;
  outcome?: "verified" | "failed" | "manual" | "digilocker" | "pending" | "mismatch";
  mode?: string;
  verifiedData?: Record<string, unknown>;
  url?: string;
  /** HTTPS return URL registered with Cashfree — use as openAuthSessionAsync redirect. */
  redirectUrl?: string;
  verificationId?: string;
  status?: string;
  error?: string;
  reason?: string;
  providerStatus?: string | null;
  providerMessage?: string | null;
  providerReference?: string | null;
  mismatchReasons?: string[];
  mismatchMessages?: string[];
};

/** Interactive electronic verification for PAN / DL / RC / Aadhaar during onboarding. */
export function useVerifyDocument() {
  const session = useSessionStore((s) => s.session);
  return useMutation({
    mutationFn: async (body: VerifyDocumentRequest): Promise<VerifyDocumentResponse> => {
      if (!session?.accessToken) throw new Error("Not authenticated");
      return postJson<VerifyDocumentResponse>(
        `${API_BASE()}/v1/onboarding/verify-document`,
        body,
        { headers: { authorization: `Bearer ${session.accessToken}` } }
      );
    },
  });
}

export function usePollAadhaarDigilocker() {
  const session = useSessionStore((s) => s.session);
  return useMutation({
    mutationFn: async (body: { riderId: string }): Promise<VerifyDocumentResponse> => {
      if (!session?.accessToken) throw new Error("Not authenticated");
      return postJson<VerifyDocumentResponse>(
        `${API_BASE()}/v1/onboarding/poll-aadhaar-digilocker`,
        body,
        { headers: { authorization: `Bearer ${session.accessToken}` } }
      );
    },
  });
}
