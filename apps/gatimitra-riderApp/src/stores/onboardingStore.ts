import { create } from "zustand";
import { getItem, setItem, removeItem } from "@/src/utils/storage";

const ONBOARDING_KEY = "gm_onboarding_v1";

export type OnboardingStep = 
  | "aadhaar_name"
  | "dl_rc"
  | "rental_ev"
  | "pan_selfie"
  | "review";

export type OnboardingData = {
  // Onboarding method
  onboardingMethod?: "manual" | "policy";
  
  // Step 1: Aadhaar + Name + DOB + Photo
  aadhaarNumber?: string;
  fullName?: string;
  dob?: string; // ISO date string
  aadhaarPhotoUri?: string; // legacy — treated as front
  aadhaarPhotoSignedUrl?: string; // legacy — front signed URL
  aadhaarFrontPhotoUri?: string;
  aadhaarBackPhotoUri?: string;
  aadhaarFrontPhotoSignedUrl?: string;
  aadhaarBackPhotoSignedUrl?: string;
  
  // Step 2: PAN + PAN Photo + Selfie
  panNumber?: string;
  panSkipped?: boolean;
  /**
   * Durable "PAN is done" flag — set once the PAN is verified (electronically via Cashfree, or
   * by uploading a photo). Persisted so re-renders / navigating to the selfie step and back
   * cannot lose the ephemeral electronic-verify state and bounce the rider back to PAN.
   */
  panVerified?: boolean;
  panPhotoUri?: string; // local URI before upload
  panPhotoSignedUrl?: string; // after R2 upload
  selfieUri?: string; // local URI before upload
  selfieSignedUrl?: string; // after R2 upload
  
  // Step 3: DL + RC
  dlNumber?: string;
  dlPhotoUri?: string; // front — local URI before upload
  dlPhotoSignedUrl?: string; // front — after R2 upload
  dlBackPhotoUri?: string;
  dlBackPhotoSignedUrl?: string;
  rcNumber?: string;
  rcPhotoUri?: string; // local URI before upload
  rcPhotoSignedUrl?: string; // after R2 upload
  hasOwnVehicle?: boolean; // false = rental/EV/cycle
  vehicleChoice?: string;
  /** Specific model name when catalog row lists multiple models (label with " / "). */
  vehicleModelLabel?: string;
  vehicleCategoryCode?: string;
  vehicleOnboardingFlow?: "dl_rc" | "rental_ev" | "payment";
  
  // Step 3b: Rental/EV alternative
  rentalProofUri?: string; // local URI before upload
  rentalProofSignedUrl?: string; // after R2 upload
  evProofUri?: string;
  evProofSignedUrl?: string;
  maxSpeedDeclaration?: number;
  documentUploads?: Record<
    string,
    {
      localUri?: string;
      signedUrl?: string;
      backLocalUri?: string;
      backSignedUrl?: string;
      textValue?: string;
    }
  >;
  /** Optional onboarding docs the rider chose to skip. */
  skippedOnboardingDocs?: string[];
  /** Vehicle code for which the rider tapped Continue on the final doc step (allows payment). */
  vehicleOnboardingSubmittedFor?: string;
  /** Step 4 bank account saved / verified during onboarding (before fee payment). */
  bankAccountOnboardingDone?: boolean;

  // Location data
  lat?: number;
  lon?: number;
  city?: string;
  state?: string;
  pincode?: string;
  address?: string;
  
  // Metadata
  currentStep?: OnboardingStep;
  riderId?: string; // set after backend creates rider

  /**
   * Post-OTP referral prompt (before Aadhaar). Set once the rider chooses
   * with/without referral so cold start does not re-show the screen.
   */
  referralPromptHandled?: boolean;
  /** Manual referral code applied / deferred during onboarding (uppercased). */
  referralCode?: string;
  /** True when the rider explicitly continued without a referral code. */
  skippedReferral?: boolean;

  /** Last known server access fields — avoid Aadhaar flash on cold start for approved riders. */
  cachedOnboardingStatus?: string;
  cachedAccountStatus?: string;
  cachedApprovalStatus?: string;
};

type OnboardingState = {
  hydrated: boolean;
  data: OnboardingData;
  setData: (data: Partial<OnboardingData>) => Promise<void>;
  setStep: (step: OnboardingStep) => Promise<void>;
  clear: () => Promise<void>;
  hydrate: () => Promise<void>;
};

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  hydrated: false,
  data: {},

  setData: async (partial) => {
    const current = get().data;
    const updated = { ...current, ...partial };
    set({ data: updated });
    await setItem(ONBOARDING_KEY, JSON.stringify(updated));
  },

  setStep: async (step) => {
    const current = get().data;
    const updated = { ...current, currentStep: step };
    set({ data: updated });
    await setItem(ONBOARDING_KEY, JSON.stringify(updated));
  },

  clear: async () => {
    set({ data: {} });
    await removeItem(ONBOARDING_KEY);
  },

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await getItem(ONBOARDING_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as OnboardingData;
        set({ data: parsed, hydrated: true });
      } else {
        set({ hydrated: true });
      }
    } catch (error) {
      console.warn("[OnboardingStore] Hydration error:", error);
      set({ hydrated: true });
    }
  },
}));

