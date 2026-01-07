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
  onboardingMethod?: "manual" | "karza" | "digilocker";
  
  // Step 1: Aadhaar + Name + DOB + Photo
  aadhaarNumber?: string;
  fullName?: string;
  dob?: string; // ISO date string
  aadhaarPhotoUri?: string; // local URI before upload
  aadhaarPhotoSignedUrl?: string; // after R2 upload
  
  // Step 2: PAN + PAN Photo + Selfie
  panNumber?: string;
  panPhotoUri?: string; // local URI before upload
  panPhotoSignedUrl?: string; // after R2 upload
  selfieUri?: string; // local URI before upload
  selfieSignedUrl?: string; // after R2 upload
  
  // Step 3: DL + RC
  dlNumber?: string;
  dlPhotoUri?: string; // local URI before upload
  dlPhotoSignedUrl?: string; // after R2 upload
  rcNumber?: string;
  rcPhotoUri?: string; // local URI before upload
  rcPhotoSignedUrl?: string; // after R2 upload
  hasOwnVehicle?: boolean; // false = rental/EV
  
  // Step 3b: Rental/EV alternative
  rentalProofUri?: string; // local URI before upload
  rentalProofSignedUrl?: string; // after R2 upload
  evProofUri?: string;
  evProofSignedUrl?: string;
  maxSpeedDeclaration?: number;
  
  // Metadata
  currentStep?: OnboardingStep;
  riderId?: string; // set after backend creates rider
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

