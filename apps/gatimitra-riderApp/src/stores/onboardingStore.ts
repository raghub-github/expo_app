import { create } from "zustand";
import { removeItem } from "@/src/utils/storage";
import {
  LEGACY_ONBOARDING_KEY,
  LEGACY_MIGRATION_DONE_KEY,
  LEGACY_QUARANTINE_KEY,
  ownerFromOnboardingData,
  persistOnboardingBlobForOwner,
  resolveOnboardingBlobForOwner,
  storageKeyForOwner,
} from "@/src/lib/onboardingLegacyMigration";

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
  /**
   * True after the rider taps Continue on the vehicle-select step (enters DL/RC docs).
   * Prevents remount from dropping them back to vehicle/category and losing selection.
   */
  vehicleDocsStarted?: boolean;

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
  /** Step 4 bank account saved / verified during onboarding (before fee payment).
   * Also set when the rider skips bank and will add it later from Earnings. */
  bankAccountOnboardingDone?: boolean;
  /** True when Step 4 was skipped (no bank linked yet). */
  bankAccountOnboardingSkipped?: boolean;

  // Location data
  lat?: number;
  lon?: number;
  city?: string;
  state?: string;
  region?: string;
  district?: string;
  pincode?: string;
  address?: string;
  stateId?: string;
  regionId?: string;
  districtId?: string;
  /** gps_auto | manual_select | manual_other */
  locationSource?: "gps_auto" | "manual_select" | "manual_other";
  locationOtherState?: string;
  locationOtherDistrict?: string;

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
  /** Session riderId or userId this in-memory blob belongs to — never share across riders. */
  boundOwnerId: string | null;
  data: OnboardingData;
  setData: (data: Partial<OnboardingData>) => Promise<void>;
  setStep: (step: OnboardingStep) => Promise<void>;
  clear: () => Promise<void>;
  /** Cold start: load nothing until bindOwner knows who is signed in. */
  hydrate: () => Promise<void>;
  /**
   * Bind store to authenticated owner. Switches disk partition on rider change so
   * Rider B never inherits Rider A's RC/DL/Aadhaar drafts.
   */
  bindOwner: (ownerId: string | null) => Promise<void>;
};

/** Monotonic bind generation — stale async migrations must not write after logout/switch. */
let bindGeneration = 0;
let expectedOwnerForGeneration: string | null = null;

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  hydrated: false,
  boundOwnerId: null,
  data: {},

  setData: async (partial) => {
    // Session bindOwner is the only way to attach an owner. Never rebind from a
    // stale setData({ riderId }) after logout / rider switch (cross-rider leak).
    const bound = get().boundOwnerId;
    if (!bound) {
      return;
    }
    const incomingOwner = partial.riderId ? String(partial.riderId).trim() : "";
    if (incomingOwner && incomingOwner !== bound) {
      return;
    }

    const genAtStart = bindGeneration;
    const current = get().data;
    const keys = Object.keys(partial) as (keyof OnboardingData)[];
    const changed = keys.some((k) => current[k] !== partial[k]);
    if (!changed) return;
    const updated = { ...current, ...partial, riderId: bound };
    if (bindGeneration !== genAtStart || get().boundOwnerId !== bound) return;
    set({ data: updated });
    await persistOnboardingBlobForOwner(bound, updated);
    // Late persist after switch must not matter for the new rider's memory;
    // disk write was under `bound` only (previous rider's scoped key).
  },

  setStep: async (step) => {
    const bound = get().boundOwnerId;
    if (!bound) return;
    const current = get().data;
    if (current.currentStep === step) return;
    const genAtStart = bindGeneration;
    const updated = { ...current, currentStep: step, riderId: bound };
    if (bindGeneration !== genAtStart || get().boundOwnerId !== bound) return;
    set({ data: updated });
    await persistOnboardingBlobForOwner(bound, updated);
  },

  clear: async () => {
    const owner = get().boundOwnerId || ownerFromOnboardingData(get().data);
    bindGeneration += 1;
    expectedOwnerForGeneration = null;
    set({ data: {}, boundOwnerId: null, hydrated: true });
    if (owner) {
      await removeItem(storageKeyForOwner(owner));
    }
    await removeItem(LEGACY_ONBOARDING_KEY);
  },

  hydrate: async () => {
    // Owner-specific load happens in bindOwner after session is known.
    // Never hydrate legacy/global key here — that would race before auth.
    if (get().hydrated && get().boundOwnerId != null) return;
    set({ hydrated: true });
  },

  bindOwner: async (ownerId) => {
    const normalized = ownerId?.trim() || null;
    if (normalized === get().boundOwnerId && get().hydrated) {
      return;
    }

    const gen = ++bindGeneration;
    expectedOwnerForGeneration = normalized;

    if (!normalized) {
      // Logout / signed-out: wipe memory only. Disk stays under each rider key for resume.
      set({ data: {}, boundOwnerId: null, hydrated: true });
      return;
    }

    // Clear previous rider from memory immediately so UI cannot flash foreign drafts.
    set({ data: { riderId: normalized }, boundOwnerId: normalized, hydrated: false });

    const { data: blob, migration } = await resolveOnboardingBlobForOwner(normalized, {
      generation: () => (bindGeneration === gen ? expectedOwnerForGeneration : null),
    });

    if (bindGeneration !== gen || expectedOwnerForGeneration !== normalized) {
      // Stale — a newer bindOwner/logout won.
      if (__DEV__) {
        console.log("[ONBOARDING_MIGRATION]", {
          result: "STALE_OWNER_ABORTED",
          migration,
        });
      }
      return;
    }

    if (!blob) {
      set({
        data: { riderId: normalized },
        boundOwnerId: normalized,
        hydrated: true,
      });
      return;
    }

    const stamped = ownerFromOnboardingData(blob);
    if (stamped && stamped !== normalized) {
      // Defense in depth — never hydrate foreign stamp.
      set({
        data: { riderId: normalized },
        boundOwnerId: normalized,
        hydrated: true,
      });
      return;
    }

    set({
      data: { ...(blob as OnboardingData), riderId: normalized },
      boundOwnerId: normalized,
      hydrated: true,
    });
  },
}));

/** Test/helper export — quarantine key must never be used as hydration source. */
export const ONBOARDING_STORAGE_KEYS = {
  LEGACY_ONBOARDING_KEY,
  LEGACY_QUARANTINE_KEY,
  LEGACY_MIGRATION_DONE_KEY,
  storageKeyForOwner,
} as const;
