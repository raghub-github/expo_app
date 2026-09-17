// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Platform,
  Alert,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  BackHandler,
  Keyboard,
  InteractionManager,
  AppState,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import {
  useSaveOnboardingStep,
  useRiderStatus,
  useDlRegistrationCheck,
  useRcRegistrationCheck,
  useVerificationModes,
  useVerifyDocument,
} from "@/src/hooks/useOnboarding";
import { ElectronicVerifyCard, type EvState } from "@/src/components/onboarding/ElectronicVerifyCard";
import {
  pickRcOwnerName,
  softPersonNamesMatch,
} from "@/src/lib/pan-aadhaar-name-match";
import {
  isElectronicVerifyForceManualError,
  extractElectronicVerifyBlockReason,
} from "@/src/lib/electronic-verify-rate-limit";
import { useOnboardingEstablishedRedirect } from "@/src/hooks/useOnboardingEstablishedRedirect";
import {
  onboardingStepToRoute,
  ONBOARDING_DL_RC_LAST_DOC_STEP,
  type ServerOnboardingStep,
} from "@/src/lib/onboarding-routes";
import { goBackOrReplace } from "@/src/lib/onboarding-navigation";
import {
  onboardingContinueHref,
  rentalEvOnboardingHref,
  withOnboardingWalkParam,
} from "@/src/lib/onboarding-walk-through";
import { setOnboardingBackOverride } from "@/src/lib/onboarding-back-override";
import { notifyOnboardingToast, friendlyOnboardingError } from "@/src/lib/rider-onboarding-toast";
import { extractApiErrorMessage } from "@/src/services/http";
import { useSessionStore } from "@/src/stores/sessionStore";
import { uploadToR2, deleteFromR2, buildRiderDocumentKey } from "@/src/services/storage/cloudflareR2";
import { useSaveDocument } from "@/src/hooks/useDocuments";
import { useRiderOnboardingSummary } from "@/src/hooks/useRiderOnboardingSummary";
import {
  ContinueButton,
  ErrorBanner,
  HeaderSkipLink,
  OnboardingStickyFooter,
  onboardingFormStyles as form,
  onboardingHeaderPaddingTop,
  onboardingStickyScrollPadding,
} from "@/src/components/onboarding/OnboardingFormUi";
import { useOnboardingVehicleTypes } from "@/src/hooks/useOnboardingVehicleTypes";
import { useOnboardingVehicleCategories } from "@/src/hooks/useOnboardingVehicleCategories";
import { useOnboardingDocumentTypes } from "@/src/hooks/useOnboardingDocumentTypes";
import {
  buildCategoryHint,
  categoryHasActiveVehicles,
  expandVehicleDisplayNames,
  findVehicleCategory,
  findVehicleType,
  formatVehicleGroupPreviewTitle,
  formatVehicleRowTitle,
  isElectricOnboardingVehicle,
  normalizeSelectedVehicleModelLabel,
  vehiclesForCategory,
  type OnboardingVehicleType,
} from "@/src/lib/onboarding-vehicle-types";
import {
  isValidCashfreeDlNumber,
  isValidCashfreeRcNumber,
  normalizeCashfreeDocNumber,
} from "@/src/lib/cashfree-doc-formats";
import { VehicleModelPickerSheet } from "@/src/components/onboarding/VehicleModelPickerSheet";
import { RcVehicleTypeMismatchBottomSheet } from "@/src/components/onboarding/RcVehicleTypeMismatchBottomSheet";
import {
  evaluateRcOnboardingVehicleMatchClient,
  suggestOnboardingVehicleFromRcClient,
} from "@/src/lib/rc-onboarding-vehicle-match";
import { useQueryClient } from "@tanstack/react-query";
import {
  docRequiresBackPhoto,
  docUploadToStorePatch,
  findDocumentType,
  resolveVehicleWizardDocStep,
  filterSkippedDocsForVehicle,
  mergeVehicleOnboardingDocSteps,
  vehicleOnboardingWizardStepNumber,
  firstRentalEvDocCode,
  getDocUploadState,
  isDocSkipped,
  isDocStepComplete,
  isDocStepSatisfied,
  isElectronicVerifiedDocUrl,
  metadataKeyForDocText,
  formatVehicleDocsInfoMessage,
  formatVehicleRequiredDocsHint,
  resolveVehicleOnboardingDocs,
  type VehicleOnboardingDocStep,
} from "@/src/lib/onboarding-document-types";
import { shouldClearVehicleTypeOnCategoryContinue } from "@/src/lib/rider-onboarding-vehicle-persist";
import { VehicleDocumentCaptureStep } from "@/src/components/onboarding/VehicleDocumentCaptureStep";
import { colors } from "@/src/theme";
import { resolveOnboardingPhotoDisplayUrl } from "@/src/utils/mediaUrl";

const ACCENT = "#39d353";
const ACCENT_DARK = "#22a745";

type WizardStep = "category" | "vehicle" | string;

const COPY = {
  stepLabelCategory: "Step 3 · Category",
  stepLabelVehicle: "Step 3 · Vehicle",
  stepLabelChoice: "Step 3 · Vehicle",
  titleCategory: "Select vehicle category",
  subtitleCategory: "Choose how many wheels your operating vehicle has",
  titleVehicle: "Select your vehicle",
  subtitleVehicle: "Pick the vehicle you will operate on GatiMitra",
  stepLabelDl: "Step 3 · DL (1 of 2)",
  stepLabelRc: "Step 3 · RC (2 of 2)",
  titleChoice: "Select your vehicle",
  titleDl: "Driving License",
  titleRc: "Registration Certificate",
  subtitleChoice: "Pick the vehicle you will operate on GatiMitra",
  subtitleDl: "Enter your DL number and upload a clear photo",
  subtitleRc: "Enter your RC number and upload the registration certificate",
  ownVehicle: "Own vehicle",
  ownVehicleHint: "DL & RC required",
  rentalEv: "Rental / EV",
  rentalEvHint: "Proof in next step",
  cycle: "Cycle",
  cycleHint: "Details in next step",
  rentalInfo:
    "You will upload your rental agreement or EV ownership proof on the next screen.",
  cycleInfo:
    "No rental or EV proof is required. You can continue to bank verification.",
  dlLabel: "Driving License Number",
  dlPlaceholder: "Enter DL number",
  dlPhotoLabel: "DL Photo",
  dlPhotoHint: "Upload a clear photo of your driving license",
  dlBoxTitle: "Add DL photo",
  dlBoxSub: "Tap here to capture or upload",
  dlTips: ["Full card visible", "No glare or blur", "All text readable"],
  rcLabel: "RC Number",
  rcPlaceholder: "Enter registration number",
  rcPhotoLabel: "RC Photo",
  rcPhotoHint: "Upload your vehicle registration certificate",
  rcBoxTitle: "Add RC photo",
  rcBoxSub: "Tap here to capture or upload",
  rcTips: ["Registration details visible", "Vehicle number matches", "No cropped edges"],
  pickerTitle: "Add document photo",
  pickerMessage: "Choose how you want to add this document",
  capture: "Capture",
  upload: "Upload from gallery",
  cancel: "Cancel",
  continue: "Continue",
  uploading: "Uploading…",
  changePhoto: "Change photo",
  dlRequired: "Please enter your Driving License number",
  rcRequired: "Please enter your RC number",
  dlPhotoRequired: "Please add front and back photos of your driving license",
  dlFrontPhotoRequired: "Please add the front photo of your driving license",
  dlBackPhotoRequired: "Please add the back photo of your driving license",
  frontLabel: "Front",
  backLabel: "Back",
  rcPhotoRequired: "Please add a photo of your RC",
  rcRejectedTitle: "RC Verification Failed",
  rcRejectedBody:
    "Your RC verification could not be completed. Please upload a clear original RC card photo again.",
  rcUploadAgain: "Upload RC again",
  dlSaveError: "Failed to save DL. Please try again.",
  rcSaveError: "Failed to save RC. Please try again.",
  riderNotFound: "Rider ID not found. Please try again.",
  notAuthenticated: "Not authenticated. Please login again.",
  uploadError: "Failed to upload. Please try again.",
  captureFailed: "Failed to capture photo. Please try again.",
  uploadFailed: "Failed to pick photo. Please try again.",
  cameraPermissionTitle: "Permission Required",
  cameraPermissionMessage: "Camera permission is required to capture document photos",
  galleryPermissionTitle: "Gallery access needed",
  galleryPermissionMessage: "Allow photo access to upload from gallery",
  catalogLoading: "Loading vehicle categories…",
  catalogEmpty: "No vehicle categories are available right now. Please try again later.",
  catalogError: "Could not load vehicle categories. Check your connection and try again.",
    dlAlreadyRegistered: "Already registered with another rider",
    rcAlreadyRegistered: "Already registered with another rider",
  skipOptionalDoc: "Skip",
} as const;

function resolveVehicleIcon(icon?: string | null): keyof typeof Ionicons.glyphMap {
  if (icon && icon in Ionicons.glyphMap) {
    return icon as keyof typeof Ionicons.glyphMap;
  }
  return "car-outline";
}

function continueToNextDocLabel(
  docs: Array<{ label: string }>,
  currentIndex: number,
  finalLabel: string
): string {
  if (currentIndex < 0 || currentIndex >= docs.length - 1) return finalLabel;
  const nextDoc = docs[currentIndex + 1];
  return nextDoc ? `Continue to ${nextDoc.label}` : finalLabel;
}

function documentFileEntries(
  front: { proxyUrl: string; key: string },
  back?: { proxyUrl: string; key: string }
) {
  const entries = [
    {
      side: "front" as const,
      fileUrl: front.proxyUrl,
      r2Key: front.key,
      mimeType: "image/jpeg",
    },
  ];
  if (back) {
    entries.push({
      side: "back" as const,
      fileUrl: back.proxyUrl,
      r2Key: back.key,
      mimeType: "image/jpeg",
    });
  }
  return entries;
}

function VehicleOptionCard({
  selected,
  inactive,
  title,
  hint,
  selectedModelName,
  icon,
  onPress,
}: {
  selected: boolean;
  inactive?: boolean;
  title: string;
  hint: string;
  /** Shown under the row when a multi-model sheet pick was confirmed. */
  selectedModelName?: string | null;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.vehicleCardOuter,
        selected && styles.vehicleCardSelected,
        inactive && styles.vehicleCardInactive,
        pressed && !inactive && styles.vehicleCardPressed,
      ]}
    >
      <View style={styles.vehicleCardRow}>
        <View style={styles.vehicleLeftCol}>
          <View
            style={[
              styles.vehicleIconWrap,
              selected && styles.vehicleIconWrapSelected,
              inactive && styles.vehicleIconWrapInactive,
            ]}
          >
            <Ionicons
              name={icon}
              size={22}
              color={inactive ? colors.gray[400] : selected ? ACCENT_DARK : colors.gray[500]}
            />
          </View>
        </View>

        <View style={styles.vehicleCenterCol}>
          <Text
            style={[
              styles.vehicleTitle,
              selected && styles.vehicleTitleSelected,
              inactive && styles.vehicleTitleInactive,
            ]}
          >
            {title}
          </Text>
          <Text style={[styles.vehicleHint, inactive && styles.vehicleHintInactive]}>
            {inactive ? "Inactive — not available right now" : hint}
          </Text>
          {selectedModelName ? (
            <Text style={styles.vehicleSelectedModel} numberOfLines={2}>
              Selected: {selectedModelName}
            </Text>
          ) : null}
        </View>

        <View style={styles.vehicleRightCol}>
          <View
            style={[
              styles.vehicleRadio,
              selected && styles.vehicleRadioSelected,
              inactive && styles.vehicleRadioInactive,
            ]}
          >
            {selected && !inactive ? <View style={styles.vehicleRadioDot} /> : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function hasStartedVehicleDocFlow(
  data: {
    vehicleOnboardingSubmittedFor?: string;
    vehicleDocsStarted?: boolean;
    skippedOnboardingDocs?: string[];
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
  },
  docs: VehicleOnboardingDocStep[]
): boolean {
  if (data.vehicleDocsStarted) return true;
  if (data.vehicleOnboardingSubmittedFor) return true;
  for (const doc of docs) {
    if (doc.optional && isDocSkipped(data, doc.code)) return true;
    const state = getDocUploadState(data, doc.code);
    if (
      state.textValue?.trim() ||
      state.localUri ||
      state.signedUrl ||
      state.backLocalUri ||
      state.backSignedUrl
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Step 3 wizard resume:
 * 1) category — until Continue
 * 2) vehicle — until Continue
 * 3) docs — only after vehicle Continue (or returning mid-doc upload)
 */
function resolveInitialWizardStep(
  data: {
    vehicleCategoryCode?: string;
    vehicleChoice?: string;
    hasOwnVehicle?: boolean;
    skippedOnboardingDocs?: string[];
    vehicleOnboardingSubmittedFor?: string;
    vehicleDocsStarted?: boolean;
    vehicleDocWizardCode?: string;
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
  },
  vehicleType: OnboardingVehicleType | undefined,
  docs: VehicleOnboardingDocStep[]
): WizardStep {
  if (!data.vehicleCategoryCode) return "category";
  if (!data.vehicleChoice) return "vehicle";
  if (vehicleType?.onboardingFlow === "payment") return "vehicle";
  if (!docs.length) return "vehicle";
  // Radio-select alone must NOT jump into DL/RC — only after Continue (docs started).
  if (!hasStartedVehicleDocFlow(data, docs)) return "vehicle";
  const cursor = data.vehicleDocWizardCode?.trim();
  if (cursor && docs.some((d) => d.code === cursor)) return cursor;
  return docs[0]!.code;
}

export default function DlRcScreen() {
  const { t } = useTranslation();
  const tx = (key: keyof typeof COPY) =>
    t(`onboarding.dlRc.${key}`, { defaultValue: COPY[key] });
  const insets = useSafeAreaInsets();
  const headerTopPad = onboardingHeaderPaddingTop(insets.top);

  const session = useSessionStore((s) => s.session);
  const { data, setData, setStep, hydrate } = useOnboardingStore();
  const queryClient = useQueryClient();
  const saveStep = useSaveOnboardingStep();
  const saveDocument = useSaveDocument();
  const { data: riderStatus } = useRiderStatus(data.riderId, {
    refetchInterval: 8_000,
  });
  const searchParams = useLocalSearchParams<{
    reupload?: string | string[];
    focus?: string | string[];
    step?: string | string[];
    walk?: string | string[];
  }>();
  const reuploadParam = searchParams.reupload;
  const focusParamRaw = searchParams.focus;
  const stepParamRaw = searchParams.step;
  const walkParamRaw = searchParams.walk;
  const isReupload =
    (Array.isArray(reuploadParam) ? reuploadParam[0] : reuploadParam) === "1";
  const walkThrough =
    (() => {
      const w = Array.isArray(walkParamRaw) ? walkParamRaw[0] : walkParamRaw;
      return w === "1" || w === "true" || w === "yes";
    })();
  const stepParamValue = (() => {
    const raw = Array.isArray(stepParamRaw) ? stepParamRaw[0] : stepParamRaw;
    return String(raw ?? "").toLowerCase();
  })();
  const forcedWizardStep =
    stepParamValue === "category" || stepParamValue === "vehicle"
      ? (stepParamValue as "category" | "vehicle")
      : null;
  const forcedDocStep =
    stepParamValue &&
    stepParamValue !== "category" &&
    stepParamValue !== "vehicle"
      ? stepParamValue
      : null;
  const reuploadFocus = (() => {
    const raw = Array.isArray(focusParamRaw) ? focusParamRaw[0] : focusParamRaw;
    const v = String(raw ?? "").toLowerCase();
    if (v === "dl" || v === "driving_licence" || v === "driving_license") return "dl" as const;
    if (v === "rc" || v === "vehicle_rc") return "rc" as const;
    return null;
  })();
  // Approved riders are normally bounced off this screen — keep them here to re-upload DL/RC.
  useOnboardingEstablishedRedirect(isReupload ? null : riderStatus);

  const leaveReuploadFlow = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)/orders");
  }, []);
  const { data: vehicleTypes = [], isLoading: vehicleTypesLoading, isError: vehicleTypesError } =
    useOnboardingVehicleTypes();
  const {
    data: vehicleCategories = [],
    isLoading: vehicleCategoriesLoading,
    isError: vehicleCategoriesError,
  } = useOnboardingVehicleCategories();
  const { data: documentCatalog = [], isFetched: documentCatalogFetched } = useOnboardingDocumentTypes();

  const catalogLoading = vehicleTypesLoading || vehicleCategoriesLoading;
  const catalogError = vehicleTypesError || vehicleCategoriesError;

  const sortedVehicleTypes = useMemo(
    () =>
      [...vehicleTypes]
        .filter((t) => t.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    [vehicleTypes]
  );

  const sortedCategories = useMemo(
    () =>
      [...vehicleCategories]
        .filter(
          (c) => c.isActive && categoryHasActiveVehicles(sortedVehicleTypes, c.code)
        )
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    [vehicleCategories, sortedVehicleTypes]
  );

  const forwardOnceRef = useRef<string | null>(null);
  useEffect(() => {
    if (isReupload || walkThrough) return;
    const next = riderStatus?.nextOnboardingStep as ServerOnboardingStep | undefined;
    if (!next) return;
    // Only send riders *back* to unfinished KYC steps. Never auto-jump forward to
    // bank/payment — that raced bank-account's "vehicle not ready → dl-rc" bounce
    // and caused Maximum update depth in the onboarding stack.
    if (next === "aadhaar_name" || next === "pan_selfie") {
      // After selfie Continue we set local step to dl_rc before status refetches.
      // Don't bounce back to PAN on a stale nextOnboardingStep=pan_selfie.
      const localStep = useOnboardingStore.getState().data.currentStep;
      if (
        localStep === "dl_rc" ||
        localStep === "rental_ev" ||
        localStep === "review"
      ) {
        return;
      }
      // Prefer Live Selfie sub-step — rider already finished PAN to reach vehicle docs.
      const href =
        next === "pan_selfie"
          ? "/(onboarding)/pan-selfie?step=selfie&walk=1"
          : onboardingStepToRoute(next);
      if (forwardOnceRef.current === href) return;
      forwardOnceRef.current = href;
      router.replace(href);
    }
  }, [isReupload, walkThrough, riderStatus?.nextOnboardingStep]);

  const [categoryChoice, setCategoryChoice] = useState<string>("");
  const [vehicleChoice, setVehicleChoice] = useState<string>("");
  const [vehicleModelLabel, setVehicleModelLabel] = useState<string>("");
  /** Bottom sheet only for multi-model vehicle rows (not category step). */
  const [modelPickerType, setModelPickerType] = useState<OnboardingVehicleType | null>(null);
  const [rcVehicleMismatch, setRcVehicleMismatch] = useState<{
    rcLabel: string;
    selectedLabel: string;
    suggestedVehicleChoice: string | null;
    suggestedVehicleCategoryCode: string | null;
    suggestedLabel: string | null;
    suggestedOnboardingFlow: string | null;
  } | null>(null);
  const [rcMismatchSheetBusy, setRcMismatchSheetBusy] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>("category");
  const [docDraftText, setDocDraftText] = useState("");
  const [docDraftUri, setDocDraftUri] = useState<string | null>(null);
  const [docDraftBackUri, setDocDraftBackUri] = useState<string | null>(null);
  /** True while rider has a freshly picked local photo — don't let store hydrate wipe the preview. */
  const localDocPhotoLockRef = useRef(false);
  /** True while rider is changing DL/RC — blocks store/server from overwriting the input. */
  const [isEditingDocNumber, setIsEditingDocNumber] = useState(false);
  const isEditingDocNumberRef = useRef(false);
  const setDocNumberEditing = (editing: boolean) => {
    isEditingDocNumberRef.current = editing;
    setIsEditingDocNumber(editing);
  };
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const vehicleWizardBootstrappedRef = useRef(false);

  const selectedCategory = useMemo(
    () => findVehicleCategory(sortedCategories, categoryChoice),
    [sortedCategories, categoryChoice]
  );

  const vehiclesInCategory = useMemo(
    () => vehiclesForCategory(sortedVehicleTypes, categoryChoice),
    [sortedVehicleTypes, categoryChoice]
  );

  const selectedVehicleType = useMemo(
    () => findVehicleType(sortedVehicleTypes, vehicleChoice),
    [sortedVehicleTypes, vehicleChoice]
  );

  const vehicleOnboardingDocs = useMemo(
    () =>
      resolveVehicleOnboardingDocs(selectedVehicleType, documentCatalog, {
        captureGroup: "dl_rc",
      }),
    [selectedVehicleType, documentCatalog]
  );

  const currentDocStep = useMemo(
    () => vehicleOnboardingDocs.find((d) => d.code === wizardStep),
    [vehicleOnboardingDocs, wizardStep]
  );

  const { summary: onboardingSummary } = useRiderOnboardingSummary();

  /** Phase C: DL may skip when catalog/geo allows. RC skip only for EV (petrol RC is mandatory). */
  const isElectricVehicle = useMemo(
    () => isElectricOnboardingVehicle(selectedVehicleType),
    [selectedVehicleType],
  );

  const geoAllowsDocSkip = useMemo(() => {
    const step = String(wizardStep || "").toLowerCase();
    let code: string | null = null;
    if (step === "dl" || step === "driving_licence" || step === "driving_license") {
      code = "DRIVING_LICENSE";
    } else if (step === "rc" || step === "registration_certificate" || step === "vehicle_rc") {
      code = "REGISTRATION_CERTIFICATE";
    }
    if (!code) return false;
    return (
      onboardingSummary?.documents?.find((d) => d.code === code)?.canSkipDuringOnboarding === true
    );
  }, [wizardStep, onboardingSummary?.documents]);

  /** Wizard codes geo policy allows to soft-skip (keep in skippedOnboardingDocs). */
  const geoSkippableWizardCodes = useMemo(() => {
    const out: string[] = [];
    for (const d of onboardingSummary?.documents ?? []) {
      if (!d.canSkipDuringOnboarding) continue;
      const c = String(d.code || "").toUpperCase();
      if (c === "DRIVING_LICENSE" || c === "DL") out.push("dl");
      if (c === "REGISTRATION_CERTIFICATE" || c === "RC") out.push("rc");
    }
    return out;
  }, [onboardingSummary?.documents]);

  const isRcWizardStep = useMemo(() => {
    const step = String(wizardStep || "").toLowerCase();
    return step === "rc" || step === "registration_certificate" || step === "vehicle_rc";
  }, [wizardStep]);

  const isOptionalDocStep = useMemo(() => {
    const catalogOptional = Boolean(currentDocStep?.optional);
    if (isRcWizardStep && !catalogOptional) {
      // Required RC on the vehicle row must be filled (petrol and EV).
      // Optional RC (e.g. EV Bike rc?) can still skip via catalogOptional below.
      return false;
    }
    return catalogOptional || geoAllowsDocSkip;
  }, [currentDocStep?.optional, isRcWizardStep, geoAllowsDocSkip]);

  const currentDocDef = useMemo(() => {
    if (wizardStep === "category" || wizardStep === "vehicle") return undefined;
    return findDocumentType(documentCatalog, wizardStep);
  }, [wizardStep, documentCatalog]);

  const currentDocIndex = useMemo(
    () => vehicleOnboardingDocs.findIndex((d) => d.code === wizardStep),
    [vehicleOnboardingDocs, wizardStep]
  );

  useEffect(() => {
    if (!sortedVehicleTypes.length || !sortedCategories.length) return;
    if (data.vehicleCategoryCode) {
      setCategoryChoice((prev) =>
        prev === data.vehicleCategoryCode ? prev : data.vehicleCategoryCode!
      );
    }
    if (data.vehicleChoice) {
      setVehicleChoice((prev) => (prev === data.vehicleChoice ? prev : data.vehicleChoice!));
    }
    if (data.vehicleModelLabel) {
      setVehicleModelLabel((prev) =>
        prev === data.vehicleModelLabel ? prev : data.vehicleModelLabel!
      );
    }
    if (vehicleWizardBootstrappedRef.current) return;

    if (isReupload) {
      if (data.vehicleChoice && !documentCatalogFetched && session?.accessToken) return;
      vehicleWizardBootstrappedRef.current = true;
      const vehicle = findVehicleType(sortedVehicleTypes, data.vehicleChoice);
      const docs = resolveVehicleOnboardingDocs(vehicle, documentCatalog, {
        captureGroup: "dl_rc",
      });
      if (docs.length > 0 && data.vehicleChoice) {
        const focused =
          reuploadFocus != null
            ? docs.find((d) => d.code === reuploadFocus)
            : undefined;
        const rc = docs.find((d) => d.code === "rc");
        setWizardStep(focused?.code ?? rc?.code ?? docs[0]!.code);
      } else if (data.vehicleCategoryCode) {
        setWizardStep("vehicle");
      } else {
        setWizardStep("category");
      }
      return;
    }

    // Fresh Step 3 entry (post-selfie): stay on category until user Continues.
    if (!data.vehicleCategoryCode) {
      vehicleWizardBootstrappedRef.current = true;
      setWizardStep("category");
      setCategoryChoice("");
      setVehicleChoice("");
      setVehicleModelLabel("");
      return;
    }

    vehicleWizardBootstrappedRef.current = true;
    const vehicle = findVehicleType(sortedVehicleTypes, data.vehicleChoice);
    const docs = resolveVehicleOnboardingDocs(vehicle, documentCatalog, {
      captureGroup: "dl_rc",
    });
    if (forcedWizardStep === "vehicle" || forcedWizardStep === "category") {
      setWizardStep(forcedWizardStep);
      return;
    }
    if (
      forcedDocStep === ONBOARDING_DL_RC_LAST_DOC_STEP &&
      docs.length > 0
    ) {
      setWizardStep(docs[docs.length - 1]!.code);
      return;
    }
    if (forcedDocStep && docs.some((d) => d.code === forcedDocStep)) {
      setWizardStep(forcedDocStep);
      return;
    }
    // Header Back walk-through: show category → vehicle → docs in order (no resume jump).
    if (walkThrough && !isReupload && !forcedWizardStep && !forcedDocStep) {
      setWizardStep("category");
      return;
    }
    const next = resolveInitialWizardStep(data, vehicle, docs);
    setWizardStep(next);
  }, [
    sortedVehicleTypes,
    sortedCategories,
    documentCatalog,
    data.vehicleCategoryCode,
    data.vehicleChoice,
    data.vehicleModelLabel,
    data.vehicleOnboardingSubmittedFor,
    data.vehicleDocsStarted,
    data.documentUploads,
    data.skippedOnboardingDocs,
    isReupload,
    reuploadFocus,
    documentCatalogFetched,
    session?.accessToken,
    forcedWizardStep,
    forcedDocStep,
    walkThrough,
  ]);

  // Re-apply ?step= when returning from rental-ev / bank (bootstrap ref may already be set).
  useEffect(() => {
    if (!data.vehicleChoice?.trim() || !documentCatalog.length) return;
    const vehicle = findVehicleType(sortedVehicleTypes, data.vehicleChoice);
    const docs = resolveVehicleOnboardingDocs(vehicle, documentCatalog, {
      captureGroup: "dl_rc",
    });
    if (forcedWizardStep === "category" || forcedWizardStep === "vehicle") {
      setWizardStep(forcedWizardStep);
      return;
    }
    if (forcedDocStep === ONBOARDING_DL_RC_LAST_DOC_STEP && docs.length > 0) {
      setWizardStep(docs[docs.length - 1]!.code);
      return;
    }
    if (forcedDocStep && docs.some((d) => d.code === forcedDocStep)) {
      setWizardStep(forcedDocStep);
    }
  }, [
    forcedWizardStep,
    forcedDocStep,
    data.vehicleChoice,
    documentCatalog,
    sortedVehicleTypes,
  ]);

  // Drop skips that are not optional / geo-skippable on the currently selected vehicle.
  useEffect(() => {
    if (!vehicleChoice?.trim() || !documentCatalog.length) return;
    const vehicle = findVehicleType(sortedVehicleTypes, vehicleChoice);
    const allDocs = mergeVehicleOnboardingDocSteps(vehicle, documentCatalog);
    const filtered = filterSkippedDocsForVehicle(allDocs, data.skippedOnboardingDocs, {
      alsoKeep: geoSkippableWizardCodes,
    });
    const curKey = (data.skippedOnboardingDocs ?? []).join("\0");
    const nextKey = (filtered ?? []).join("\0");
    if (curKey === nextKey) return;
    void setData({ skippedOnboardingDocs: filtered });
  }, [
    vehicleChoice,
    documentCatalog,
    sortedVehicleTypes,
    data.skippedOnboardingDocs,
    geoSkippableWizardCodes,
    setData,
  ]);

  useEffect(() => {
    if (wizardStep === "category" || wizardStep === "vehicle") {
      localDocPhotoLockRef.current = false;
    }
  }, [wizardStep]);

  useEffect(() => {
    if (wizardStep === "category" || wizardStep === "vehicle" || !currentDocDef) return;
    // Never clobber the field while the rider is actively editing the number.
    if (isEditingDocNumberRef.current && (wizardStep === "dl" || wizardStep === "rc")) {
      return;
    }
    const state = getDocUploadState(data, wizardStep);
    setDocDraftText(state.textValue);
    // Prefer server/signed URL after upload — but never wipe a just-picked local photo
    // (that caused blank RC preview with X still showing).
    if (!localDocPhotoLockRef.current) {
      setDocDraftUri(
        resolveOnboardingPhotoDisplayUrl({
          remotes: [state.signedUrl],
          localUri: state.localUri,
        })
      );
      setDocDraftBackUri(
        resolveOnboardingPhotoDisplayUrl({
          remotes: [state.backSignedUrl],
          localUri: state.backLocalUri,
        })
      );
    }
  }, [wizardStep, currentDocDef, data.dlNumber, data.rcNumber, data.dlPhotoSignedUrl, data.rcPhotoSignedUrl, data.dlBackPhotoSignedUrl, data.documentUploads]);

  // Rehydrate DL/RC from server — always prefer last Cashfree/manual verified number
  // so an unverified edit that was never submitted does not stick after reopen.
  // Reset once per rider so a previous account's hydrate flags cannot skip this rider.
  const dlHydratedRef = useRef(false);
  const rcHydratedRef = useRef(false);
  const hydratedForRiderRef = useRef<string | null>(null);
  useEffect(() => {
    const owner = String(data.riderId || "").trim();
    if (hydratedForRiderRef.current !== owner) {
      hydratedForRiderRef.current = owner || null;
      dlHydratedRef.current = false;
      rcHydratedRef.current = false;
    }
  }, [data.riderId]);

  useEffect(() => {
    if (!riderStatus) return;
    const bound = useOnboardingStore.getState().boundOwnerId;
    const owner = String(data.riderId || "").trim();
    // Never apply status hydrate if session owner no longer matches this screen's rider.
    if (!bound || !owner || bound !== owner) return;

    const dobRaw = String(riderStatus.dob || data.dob || "").trim();
    const dobMatch = dobRaw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dobMatch?.[1] && !String(data.dob || "").startsWith(dobMatch[1])) {
      void setData({ dob: dobMatch[1] });
    }

    const localDl = getDocUploadState(data, "dl");
    const serverDl = String(riderStatus.dlNumber || "")
      .replace(/[^A-Z0-9]/gi, "")
      .toUpperCase();
    const serverDlFront = riderStatus.dlFrontUrl || null;
    const serverDlBack = riderStatus.dlBackUrl || null;
    const localDlNorm = String(localDl.textValue || "")
      .replace(/[^A-Z0-9]/gi, "")
      .toUpperCase();

    if (
      !isEditingDocNumberRef.current &&
      !dlHydratedRef.current &&
      (serverDl || serverDlFront) &&
      (localDlNorm !== serverDl || Boolean(serverDlFront))
    ) {
      dlHydratedRef.current = true;
      void setData(
        docUploadToStorePatch(data, "dl", {
          textValue: serverDl || undefined,
          signedUrl: serverDlFront ?? localDl.signedUrl,
          backSignedUrl: serverDlBack ?? localDl.backSignedUrl,
          localUri: serverDlFront ? null : localDl.localUri,
          backLocalUri: serverDlBack ? null : localDl.backLocalUri,
        }),
      );
    } else if (serverDl || serverDlFront) {
      dlHydratedRef.current = true;
    }

    const localRc = getDocUploadState(data, "rc");
    const serverRc = String(riderStatus.rcNumber || "")
      .replace(/[^A-Z0-9]/gi, "")
      .toUpperCase();
    const serverRcFront = riderStatus.rcFrontUrl || null;
    const localRcNorm = String(localRc.textValue || "")
      .replace(/[^A-Z0-9]/gi, "")
      .toUpperCase();

    // Always overwrite local draft with last verified server RC when they differ —
    // but never while the rider is mid-edit in the field.
    if (
      !isEditingDocNumberRef.current &&
      !rcHydratedRef.current &&
      (serverRc || serverRcFront)
    ) {
      rcHydratedRef.current = true;
      if (localRcNorm !== serverRc || (serverRcFront && !localRc.signedUrl)) {
        void setData(
          docUploadToStorePatch(data, "rc", {
            textValue: serverRc || undefined,
            signedUrl: serverRcFront ?? localRc.signedUrl,
            localUri: serverRcFront ? null : localRc.localUri,
          }),
        );
      }
    } else if (serverRc || serverRcFront) {
      rcHydratedRef.current = true;
    }
  }, [
    riderStatus?.dob,
    riderStatus?.dlNumber,
    riderStatus?.dlFrontUrl,
    riderStatus?.dlBackUrl,
    riderStatus?.rcNumber,
    riderStatus?.rcFrontUrl,
    data.dob,
    data.dlNumber,
    data.dlPhotoSignedUrl,
    data.dlPhotoUri,
    data.rcNumber,
    data.rcPhotoSignedUrl,
    data.rcPhotoUri,
    data.riderId,
    setData,
  ]);

  const docTextMinLength = Math.max(currentDocDef?.minTextLength ?? 1, 1);
  /** Length floor from catalog — used for duplicate checks only. */
  const docTextLengthOk =
    !currentDocDef?.requiresTextField || docDraftText.trim().length >= docTextMinLength;
  /** Cashfree-aligned format: verify button stays off until DL/RC pattern matches. */
  const docFormatValid =
    wizardStep === "dl"
      ? isValidCashfreeDlNumber(docDraftText)
      : wizardStep === "rc"
        ? isValidCashfreeRcNumber(docDraftText)
        : docTextLengthOk;
  const docTextValid =
    !currentDocDef?.requiresTextField
      ? true
      : wizardStep === "dl" || wizardStep === "rc"
        ? docFormatValid
        : docTextLengthOk;
  const dlCheckQuery = useDlRegistrationCheck(
    wizardStep === "dl" ? docDraftText : "",
    data.riderId,
    wizardStep === "dl" ? 15 : docTextMinLength
  );
  const rcCheckQuery = useRcRegistrationCheck(
    wizardStep === "rc" ? docDraftText : "",
    data.riderId,
    wizardStep === "rc" ? 7 : docTextMinLength
  );
  const docDuplicateCheckQuery = wizardStep === "dl" ? dlCheckQuery : wizardStep === "rc" ? rcCheckQuery : null;
  const docAlreadyRegistered = docDuplicateCheckQuery?.data?.registered === true;
  const checkingDocDuplicate =
    Boolean(currentDocDef?.requiresTextField) &&
    docTextValid &&
    Boolean(docDuplicateCheckQuery?.isFetching || docDuplicateCheckQuery?.isLoading);
  // ── Electronic verification (Policy Center modes for rider DL / RC) ──────
  const { data: evModesData } = useVerificationModes();
  const verifyDocument = useVerifyDocument();
  const docEvKind =
    wizardStep === "dl" ? ("driving_licence" as const)
    : wizardStep === "rc" ? ("vehicle_rc" as const)
    : null;
  const docEvMode = docEvKind
    ? ((evModesData?.modes?.[docEvKind] ?? "manual") as "manual" | "auto" | "hybrid" | "disabled")
    : "manual";
  const docElectronic = docEvKind != null && (docEvMode === "auto" || docEvMode === "hybrid");
  const [docEv, setDocEv] = useState<EvState>({ phase: "idle" });
  /** When Cashfree is down / provider error — allow RC manual upload fallback. */
  const [docAllowManualOnFail, setDocAllowManualOnFail] = useState(false);
  /** Lock Verify again until DL/RC number changes after invalid/mismatch. */
  const [verifyBlockedForDoc, setVerifyBlockedForDoc] = useState<string | null>(null);

  // Last successfully verified numbers + details this session (also seeded from server).
  // Editing shows Verify again; typing the same verified number back restores details
  // without another Verify click (even without closing the app).
  const lastVerifiedDlRef = useRef<string>("");
  const lastVerifiedRcRef = useRef<string>("");
  const lastVerifiedDlDetailsRef = useRef<Record<string, unknown> | null>(null);
  const lastVerifiedRcDetailsRef = useRef<Record<string, unknown> | null>(null);
  /** Same number already has a manual photo on file — Verify Instantly stays off (PAN-style). */
  const uploadedDlNumberRef = useRef<string | null>(null);
  const uploadedRcNumberRef = useRef<string | null>(null);
  const docVerifyAttemptRef = useRef(0);
  const docVerifyInFlightRef = useRef(false);
  const docContinueInFlightRef = useRef(false);

  const isRemoteDocPhotoUri = (uri: string | null | undefined) => {
    const u = String(uri || "").trim();
    if (!u) return false;
    if (u.startsWith("file://") || u.startsWith("content://") || u.startsWith("ph://")) {
      return false;
    }
    return (
      u.startsWith("http://") ||
      u.startsWith("https://") ||
      u.includes("/attachments/proxy")
    );
  };

  // check-dl / check-rc are duplicate-number only.

  const [dlVerifyDob, setDlVerifyDob] = useState(() => {
    const raw = String(data.dob || "").trim();
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    return m?.[1] ?? "";
  });
  useEffect(() => {
    const raw = String(data.dob || "").trim();
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m?.[1]) setDlVerifyDob(m[1]);
  }, [data.dob]);

  // Backend-authoritative: when the document has been electronically verified
  // (Cashfree auto/hybrid — the "Driving License is Valid" state, docEv.phase
  // "verified"), NO image is required — unless RC owner name ≠ Aadhaar (requirePhoto).
  // The front/back photo requirement applies ONLY on the manual / RC soft-mismatch path.
  const draftNormLive = normalizeCashfreeDocNumber(docDraftText);
  const serverDlNormLive = String(riderStatus?.dlNumber || "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();
  const serverRcNormLive = String(riderStatus?.rcNumber || "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();
  const aadhaarNameLive = String(data.fullName || "").trim();
  const rcOwnerMatchesLive =
    docEv.phase === "verified"
      ? (() => {
          const owner = pickRcOwnerName(docEv.details);
          return (
            Boolean(owner) &&
            Boolean(aadhaarNameLive) &&
            softPersonNamesMatch(owner, aadhaarNameLive)
          );
        })()
      : true;
  const rcServerNameMismatch =
    wizardStep === "rc" && riderStatus?.rcVerificationState === "NAME_MISMATCH";
  // Authoritative photo gate: sticky requirePhoto, server NAME_MISMATCH, or live mismatch.
  // Never treat RC as electronically complete while any of these are true.
  const rcRequiresPhotoLive =
    wizardStep === "rc" &&
    riderStatus?.rcVerificationState !== "MANUAL_VERIFIED" &&
    riderStatus?.rcVerificationState !== "MANUAL_REVIEW_PENDING" &&
    (rcServerNameMismatch ||
      Boolean(docEv.requirePhoto) ||
      (docEv.phase === "verified" && !rcOwnerMatchesLive));
  const rcVerifiedNeedsPhoto = rcRequiresPhotoLive;
  const dlVerifiedNeedsPhoto =
    wizardStep === "dl" &&
    docEv.phase === "verified" &&
    Boolean(docEv.requirePhoto);
  const docVerifiedNeedsPhoto = rcVerifiedNeedsPhoto || dlVerifiedNeedsPhoto;
  const rcUnderManualReview =
    wizardStep === "rc" && riderStatus?.rcVerificationState === "MANUAL_REVIEW_PENDING";
  const rcManualRejected =
    wizardStep === "rc" && riderStatus?.rcVerificationState === "MANUAL_REJECTED";
  const docVerifiedElectronically =
    !rcUnderManualReview &&
    !rcManualRejected &&
    !rcRequiresPhotoLive &&
    ((docEv.phase === "verified" && !docEv.requirePhoto) ||
    (wizardStep === "dl" &&
      !dlVerifiedNeedsPhoto &&
      riderStatus?.dlVerified === true &&
      Boolean(draftNormLive) &&
      draftNormLive === (lastVerifiedDlRef.current || serverDlNormLive)) ||
    (wizardStep === "rc" &&
      rcOwnerMatchesLive &&
      riderStatus?.rcVerified === true &&
      Boolean(draftNormLive) &&
      draftNormLive === (lastVerifiedRcRef.current || serverRcNormLive)));
  const needsBackPhoto =
    ((currentDocDef ? docRequiresBackPhoto(currentDocDef) : false) ||
      // Instant Verify failed / manual path for DL → always collect front + back.
      (wizardStep === "dl" &&
        !docVerifiedElectronically &&
        (docEv.phase === "failed" ||
          docEv.phase === "manual" ||
          docEv.phase === "mismatch" ||
          docAllowManualOnFail ||
          Boolean(docDraftUri) ||
          Boolean(docDraftBackUri)))) &&
    !docVerifiedElectronically;
  const docFrontPhotoValid = docVerifiedElectronically || Boolean(docDraftUri);
  const docBackPhotoValid = !needsBackPhoto || Boolean(docDraftBackUri);
  const docPhotoValid = docFrontPhotoValid && docBackPhotoValid;

  // Remember server RC/DL + photo so Clear → re-type same number keeps Verify Instantly off.
  useEffect(() => {
    if (
      serverRcNormLive &&
      isRemoteDocPhotoUri(riderStatus?.rcFrontUrl) &&
      (riderStatus?.rcVerificationState === "MANUAL_REVIEW_PENDING" ||
        riderStatus?.rcVerificationState === "MANUAL_VERIFIED" ||
        riderStatus?.rcVerificationState === "NAME_MISMATCH")
    ) {
      uploadedRcNumberRef.current = serverRcNormLive;
    }
    if (serverDlNormLive && isRemoteDocPhotoUri(riderStatus?.dlFrontUrl)) {
      uploadedDlNumberRef.current = serverDlNormLive;
    }
  }, [
    serverRcNormLive,
    serverDlNormLive,
    riderStatus?.rcFrontUrl,
    riderStatus?.dlFrontUrl,
    riderStatus?.rcVerificationState,
  ]);

  /** Same RC/DL already has a manual photo on file — never re-offer Verify Instantly for it. */
  const sameDocAlreadyManuallyUploaded =
    Boolean(draftNormLive) &&
    ((wizardStep === "rc" &&
      ((uploadedRcNumberRef.current != null &&
        draftNormLive === uploadedRcNumberRef.current) ||
        (draftNormLive === serverRcNormLive &&
          isRemoteDocPhotoUri(riderStatus?.rcFrontUrl) &&
          (rcUnderManualReview ||
            riderStatus?.rcVerificationState === "MANUAL_VERIFIED" ||
            riderStatus?.rcVerificationState === "NAME_MISMATCH")))) ||
      (wizardStep === "dl" &&
        ((uploadedDlNumberRef.current != null &&
          draftNormLive === uploadedDlNumberRef.current) ||
          (draftNormLive === serverDlNormLive &&
            isRemoteDocPhotoUri(riderStatus?.dlFrontUrl)))));

  /** Manual photo already chosen / under review — hide Verify Instantly (unless countdown). */
  const docManualSubmitted =
    sameDocAlreadyManuallyUploaded ||
    (rcUnderManualReview &&
      Boolean(draftNormLive) &&
      draftNormLive === (lastVerifiedRcRef.current || serverRcNormLive)) ||
    (Boolean(docDraftUri) && !docVerifiedElectronically) ||
    docEv.phase === "manual";

  // Returning via Back with a photo already chosen → stay on manual path (hide Verify).
  // Never drop Cashfree detail rows when forcing manual.
  useEffect(() => {
    if (!docManualSubmitted) return;
    if (docEv.phase === "verified" || docEv.phase === "verifying") return;
    const cachedDetails =
      wizardStep === "rc"
        ? lastVerifiedRcDetailsRef.current
        : wizardStep === "dl"
          ? lastVerifiedDlDetailsRef.current
          : null;
    const details =
      (docEv.phase === "manual" || docEv.phase === "mismatch") && docEv.details
        ? docEv.details
        : cachedDetails && Object.keys(cachedDetails).length > 0
          ? cachedDetails
          : undefined;
    // Prefer verified + details when Cashfree already returned RC payload (name-mismatch photo path).
    if (
      wizardStep === "rc" &&
      details &&
      Object.keys(details).length > 0 &&
      (Boolean(docEv.requirePhoto) ||
        riderStatus?.rcVerificationState === "NAME_MISMATCH" ||
        Boolean(docDraftUri))
    ) {
      if (docEv.phase !== "verified" || !docEv.details) {
        setDocEv({
          phase: "verified",
          details,
          requirePhoto: true,
          photoHint:
            "Verified successfully, but the authorized name doesn’t match. Please upload a clear image of your RC.",
        });
      }
      return;
    }
    if (docEv.phase === "manual") {
      if (!docEv.details && details) {
        setDocEv({ phase: "manual", details, reason: docEv.reason });
      }
      return;
    }
    setDocEv({ phase: "manual", details: details || undefined });
  }, [
    docManualSubmitted,
    docEv.phase,
    docEv.details,
    docEv.requirePhoto,
    docEv.reason,
    wizardStep,
    docDraftUri,
    riderStatus?.rcVerificationState,
  ]);

  // Re-type the same manually uploaded RC/DL → restore server photo preview (PAN-style).
  useEffect(() => {
    if (wizardStep !== "rc" && wizardStep !== "dl") return;
    if (localDocPhotoLockRef.current) return;
    if (docDraftUri) return;
    const matchesUploaded =
      wizardStep === "rc"
        ? Boolean(uploadedRcNumberRef.current) &&
          draftNormLive === uploadedRcNumberRef.current
        : Boolean(uploadedDlNumberRef.current) &&
          draftNormLive === uploadedDlNumberRef.current;
    if (!matchesUploaded) return;
    const remote =
      wizardStep === "rc"
        ? resolveOnboardingPhotoDisplayUrl({
            remotes: [data.rcPhotoSignedUrl, riderStatus?.rcFrontUrl],
          })
        : resolveOnboardingPhotoDisplayUrl({
            remotes: [data.dlPhotoSignedUrl, riderStatus?.dlFrontUrl],
          });
    if (remote) setDocDraftUri(remote);
  }, [
    wizardStep,
    draftNormLive,
    docDraftUri,
    data.rcPhotoSignedUrl,
    data.dlPhotoSignedUrl,
    riderStatus?.rcFrontUrl,
    riderStatus?.dlFrontUrl,
  ]);

  // Keep card requirePhoto in sync with live owner↔Aadhaar check (drives yellow banner + upload).
  useEffect(() => {
    if (wizardStep !== "rc") return;
    if (docEv.phase !== "verified") return;
    if (!rcRequiresPhotoLive) return;
    if (docEv.requirePhoto) return;
    setDocEv({
      phase: "verified",
      details: docEv.details,
      requirePhoto: true,
      photoHint:
        "Verified successfully, but the authorized name doesn’t match. Please upload a clear image of your RC.",
    });
  }, [wizardStep, docEv, rcRequiresPhotoLive]);

  useEffect(() => {
    const serverDl = String(riderStatus?.dlNumber || "")
      .replace(/[^A-Z0-9]/gi, "")
      .toUpperCase();
    if (serverDl && riderStatus?.dlVerified) {
      lastVerifiedDlRef.current = serverDl;
      if (
        riderStatus.dlVerifiedData &&
        typeof riderStatus.dlVerifiedData === "object" &&
        Object.keys(riderStatus.dlVerifiedData).length > 0
      ) {
        lastVerifiedDlDetailsRef.current = riderStatus.dlVerifiedData;
      }
    }
    const serverRc = String(riderStatus?.rcNumber || "")
      .replace(/[^A-Z0-9]/gi, "")
      .toUpperCase();
    if (
      serverRc &&
      (riderStatus?.rcVerified ||
        riderStatus?.rcVerificationState === "MANUAL_REVIEW_PENDING" ||
        riderStatus?.rcVerificationState === "MANUAL_VERIFIED" ||
        riderStatus?.rcVerificationState === "NAME_MISMATCH")
    ) {
      lastVerifiedRcRef.current = serverRc;
      if (
        riderStatus.rcVerifiedData &&
        typeof riderStatus.rcVerifiedData === "object" &&
        Object.keys(riderStatus.rcVerifiedData).length > 0
      ) {
        lastVerifiedRcDetailsRef.current = riderStatus.rcVerifiedData;
      }
    }
  }, [
    riderStatus?.dlNumber,
    riderStatus?.dlVerified,
    riderStatus?.dlVerifiedData,
    riderStatus?.rcNumber,
    riderStatus?.rcVerified,
    riderStatus?.rcVerifiedData,
    riderStatus?.rcVerificationState,
  ]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active" && data.riderId) {
        void queryClient.invalidateQueries({ queryKey: ["rider", data.riderId] });
      }
    });
    return () => sub.remove();
  }, [data.riderId, queryClient]);

  // Reset EV only when switching docs — not when hydrating the same number from server.
  useEffect(() => {
    setDocNumberEditing(false);
    setDocEv({ phase: "idle" });
    docVerifyAttemptRef.current += 1;
    docVerifyInFlightRef.current = false;
    docContinueInFlightRef.current = false;
  }, [wizardStep]);

  // When rider changes Category/Type then opens RC: compare current selection vs
  // last verified RC class. Never silently keep an incompatible RC valid.
  useEffect(() => {
    if (wizardStep !== "rc") return;
    if (rcVehicleMismatch) return;
    const details =
      lastVerifiedRcDetailsRef.current ||
      (riderStatus?.rcVerifiedData && typeof riderStatus.rcVerifiedData === "object"
        ? (riderStatus.rcVerifiedData as Record<string, unknown>)
        : null);
    if (!details || Object.keys(details).length === 0) return;
    const hasVerifiedRc = Boolean(
      lastVerifiedRcRef.current ||
        riderStatus?.rcNumber ||
        riderStatus?.rcVerified ||
        riderStatus?.rcVerificationState === "MANUAL_REVIEW_PENDING" ||
        riderStatus?.rcVerificationState === "MANUAL_VERIFIED" ||
        riderStatus?.rcVerificationState === "NAME_MISMATCH" ||
        riderStatus?.rcVerificationState === "AUTO_VERIFIED",
    );
    if (!hasVerifiedRc) return;
    const choice = String(vehicleChoice || data.vehicleChoice || "").trim();
    const category = String(categoryChoice || data.vehicleCategoryCode || "").trim();
    if (!choice && !category) return;
    const match = evaluateRcOnboardingVehicleMatchClient({
      vehicleChoice: choice,
      vehicleCategoryCode: category,
      onboardingFlow: selectedVehicleType?.onboardingFlow ?? data.vehicleOnboardingFlow,
      vehicleTypeLabel: selectedVehicleType?.label ?? choice,
      verifiedData: details,
    });
    if (!match.rcSignalKnown || match.match) return;
    const suggested = suggestOnboardingVehicleFromRcClient(details, sortedVehicleTypes);
    setRcVehicleMismatch({
      rcLabel: match.rcLabel,
      selectedLabel: match.selectedLabel,
      suggestedVehicleChoice: suggested?.vehicleChoice ?? null,
      suggestedVehicleCategoryCode: suggested?.vehicleCategoryCode ?? null,
      suggestedLabel: suggested?.label ?? null,
      suggestedOnboardingFlow: suggested?.onboardingFlow ?? null,
    });
  }, [
    wizardStep,
    rcVehicleMismatch,
    vehicleChoice,
    categoryChoice,
    data.vehicleChoice,
    data.vehicleCategoryCode,
    data.vehicleOnboardingFlow,
    selectedVehicleType?.label,
    selectedVehicleType?.onboardingFlow,
    sortedVehicleTypes,
    riderStatus?.rcVerifiedData,
    riderStatus?.rcNumber,
    riderStatus?.rcVerified,
    riderStatus?.rcVerificationState,
  ]);

  // Restore verified UI when input matches last verified number.
  // While editing a *different* number, stay idle so Verify Instantly shows.
  // Never clear the editing flag here — that was locking the TextInput again.
  useEffect(() => {
    if (wizardStep !== "dl" && wizardStep !== "rc") return;
    if (docEv.phase !== "idle" && docEv.phase !== "verified") return;

    const draftNorm = normalizeCashfreeDocNumber(docDraftText);

    if (wizardStep === "dl") {
      const verifiedNorm =
        lastVerifiedDlRef.current ||
        String(riderStatus?.dlNumber || "")
          .replace(/[^A-Z0-9]/gi, "")
          .toUpperCase();
      const dlDetails =
        lastVerifiedDlDetailsRef.current ||
        (riderStatus?.dlVerifiedData && typeof riderStatus.dlVerifiedData === "object"
          ? riderStatus.dlVerifiedData
          : null);
      const serverSaysVerified =
        riderStatus?.dlVerified === true &&
        Boolean(verifiedNorm) &&
        Boolean(draftNorm) &&
        draftNorm === verifiedNorm;
      if (
        draftNorm &&
        verifiedNorm &&
        draftNorm === verifiedNorm &&
        (serverSaysVerified ||
          (dlDetails && Object.keys(dlDetails).length > 0) ||
          Boolean(lastVerifiedDlRef.current))
      ) {
        if (docEv.phase !== "verified") {
          setDocEv({
            phase: "verified",
            details:
              dlDetails && Object.keys(dlDetails).length > 0
                ? dlDetails
                : { dl_number: verifiedNorm, status: "VALID" },
          });
        }
        return;
      }
      if (docEv.phase === "verified" && draftNorm !== verifiedNorm) {
        setDocEv({ phase: "idle" });
        return;
      }
      if (docEv.phase !== "idle") return;
      // Do not force "manual" merely because a server front URL exists after Cashfree
      // verify — that incorrectly re-opens the photo path and blocks Continue.
      const hasManual =
        Boolean(docDraftUri) &&
        (Boolean(docDraftBackUri) || !needsBackPhoto) &&
        isValidCashfreeDlNumber(docDraftText) &&
        (!verifiedNorm || draftNorm === verifiedNorm) &&
        riderStatus?.dlVerified !== true;
      if (hasManual) {
        setDocEv({ phase: "manual" });
      }
      return;
    }

    const verifiedNorm =
      lastVerifiedRcRef.current ||
      String(riderStatus?.rcNumber || "")
        .replace(/[^A-Z0-9]/gi, "")
        .toUpperCase();
    const rcDetails =
      lastVerifiedRcDetailsRef.current ||
      (riderStatus?.rcVerifiedData && typeof riderStatus.rcVerifiedData === "object"
        ? riderStatus.rcVerifiedData
        : null);
    const rcState = riderStatus?.rcVerificationState;
    if (rcState === "MANUAL_REVIEW_PENDING") {
      // Same number under review → hide Verify Instantly (PAN-style).
      // Different number typed → idle so Verify Instantly is available again.
      if (draftNorm && verifiedNorm && draftNorm === verifiedNorm) {
        const details =
          rcDetails && Object.keys(rcDetails).length > 0
            ? rcDetails
            : lastVerifiedRcDetailsRef.current &&
                Object.keys(lastVerifiedRcDetailsRef.current).length > 0
              ? lastVerifiedRcDetailsRef.current
              : undefined;
        if (details) {
          // Keep Cashfree rows visible while photo is under review.
          if (
            docEv.phase !== "verified" &&
            !(docEv.phase === "manual" && docEv.details)
          ) {
            setDocEv({ phase: "manual", details });
          }
        } else if (docEv.phase !== "manual") {
          setDocEv({ phase: "manual" });
        }
      } else if (draftNorm && verifiedNorm && draftNorm !== verifiedNorm) {
        if (docEv.phase === "manual" || docEv.phase === "verified") {
          setDocEv({ phase: "idle" });
        }
      }
      return;
    }
    if (rcState === "MANUAL_REJECTED") {
      const details =
        rcDetails && Object.keys(rcDetails).length > 0
          ? rcDetails
          : lastVerifiedRcDetailsRef.current || undefined;
      if (docEv.phase !== "manual") {
        setDocEv({ phase: "manual", details: details || undefined });
      }
      return;
    }
    if (rcState === "NAME_MISMATCH") {
      // User typing a different RC — stay idle so Verify Instantly is available.
      if (draftNorm && verifiedNorm && draftNorm !== verifiedNorm) {
        if (docEv.phase === "verified") {
          setDocEv({ phase: "idle" });
        }
        return;
      }
      const details =
        rcDetails && Object.keys(rcDetails).length > 0
          ? rcDetails
          : lastVerifiedRcDetailsRef.current &&
              Object.keys(lastVerifiedRcDetailsRef.current).length > 0
            ? lastVerifiedRcDetailsRef.current
            : { reg_no: verifiedNorm || draftNorm, status: "VALID" };
      if (docEv.phase !== "verified" || !docEv.requirePhoto) {
        setDocEv({
          phase: "verified",
          details,
          requirePhoto: true,
          photoHint:
            "Verified successfully, but the authorized name doesn’t match. Please upload a clear image of your RC.",
        });
      }
      return;
    }
    const serverSaysVerified =
      riderStatus?.rcVerified === true &&
      Boolean(verifiedNorm) &&
      Boolean(draftNorm) &&
      draftNorm === verifiedNorm;
    if (
      draftNorm &&
      verifiedNorm &&
      draftNorm === verifiedNorm &&
      (serverSaysVerified ||
        (rcDetails && Object.keys(rcDetails).length > 0) ||
        Boolean(lastVerifiedRcRef.current))
    ) {
      const details =
        rcDetails && Object.keys(rcDetails).length > 0
          ? rcDetails
          : { reg_no: verifiedNorm, status: "VALID" };
      const ownerName = pickRcOwnerName(details);
      const aadhaarName = String(data.fullName || "").trim();
      const ownerMatched =
        Boolean(ownerName) &&
        Boolean(aadhaarName) &&
        softPersonNamesMatch(ownerName, aadhaarName);
      // Sticky photo gate: never clear requirePhoto / NAME_MISMATCH just because
      // client soft-match vs store fullName disagrees with Cashfree↔Aadhaar DB.
      // Only MANUAL_VERIFIED may skip the RC image.
      const requirePhoto =
        rcState === "MANUAL_VERIFIED"
          ? false
          : rcState === "NAME_MISMATCH" ||
            Boolean(docEv.requirePhoto) ||
            !ownerMatched;
      if (
        docEv.phase !== "verified" ||
        Boolean(docEv.requirePhoto) !== requirePhoto
      ) {
        setDocEv(
          requirePhoto
            ? {
                phase: "verified",
                details,
                requirePhoto: true,
                photoHint:
                  "Verified successfully, but the authorized name doesn’t match. Please upload a clear image of your RC.",
              }
            : { phase: "verified", details },
        );
      }
      return;
    }
    if (docEv.phase === "verified" && draftNorm !== verifiedNorm) {
      setDocEv({ phase: "idle" });
      return;
    }
    if (docEv.phase !== "idle") return;
    // RC electronic: never enter manual from a leftover draft — only after
    // Cashfree success + name mismatch (requirePhoto) or admin rejection.
    if (wizardStep === "rc") return;
    const hasManualRc =
      Boolean(docDraftUri) &&
      isValidCashfreeRcNumber(docDraftText) &&
      (!verifiedNorm || draftNorm === verifiedNorm) &&
      riderStatus?.rcVerified !== true;
    if (hasManualRc) {
      setDocEv({ phase: "manual" });
    }
  }, [
    wizardStep,
    docEv.phase,
    docDraftText,
    docDraftUri,
    docDraftBackUri,
    needsBackPhoto,
    riderStatus?.dlVerified,
    riderStatus?.dlVerifiedData,
    riderStatus?.dlNumber,
    riderStatus?.dlFrontUrl,
    riderStatus?.rcVerified,
    riderStatus?.rcVerifiedData,
    riderStatus?.rcNumber,
    riderStatus?.rcFrontUrl,
    riderStatus?.rcVerificationState,
    data.fullName,
  ]);

  const runDocElectronicVerify = async () => {
    if (!data.riderId || !docEvKind) return;
    if (docVerifyInFlightRef.current || docEv.phase === "verifying") return;
    const draftNorm = normalizeCashfreeDocNumber(docDraftText);
    if (
      verifyBlockedForDoc &&
      draftNorm.toUpperCase() === verifyBlockedForDoc.toUpperCase()
    ) {
      return;
    }
    if (docEvKind === "driving_licence" && !isValidCashfreeDlNumber(docDraftText)) return;
    if (docEvKind === "vehicle_rc" && !isValidCashfreeRcNumber(docDraftText)) return;
    const attemptId = ++docVerifyAttemptRef.current;
    docVerifyInFlightRef.current = true;
    setDocEv({ phase: "verifying" });
    try {
      const normalized = normalizeCashfreeDocNumber(docDraftText);
      // Cashfree Try DL: License Number + DOB (YYYY-MM-DD) — same as Secure ID modal.
      const dob =
        docEvKind === "driving_licence"
          ? (dlVerifyDob.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null)
          : null;
      if (docEvKind === "driving_licence" && !dob) {
        if (attemptId !== docVerifyAttemptRef.current) return;
        setDocEv({
          phase: "failed",
          error:
            "Date of birth is required (as printed on your driving licence). Enter DOB and try again.",
        });
        return;
      }
      const res = await verifyDocument.mutateAsync(
        docEvKind === "driving_licence"
          ? {
              riderId: data.riderId,
              docKind: "driving_licence",
              dlNumber: normalized,
              dob: dob!,
            }
          : { riderId: data.riderId, docKind: "vehicle_rc", vehicleNumber: normalized },
      );
      if (attemptId !== docVerifyAttemptRef.current) return;
      if (
        res.outcome !== "verified" &&
        ((res as { forceManual?: boolean }).forceManual === true ||
          (res as { rateLimited?: boolean }).rateLimited === true)
      ) {
        // Cap / provider block — show why photo is needed (no timed lock).
        setDocAllowManualOnFail(true);
        const reason =
          (typeof res.message === "string" && res.message.trim()) ||
          (typeof res.error === "string" &&
          res.error !== "verify_rate_limited" &&
          res.error.trim()) ||
          "Automatic verification could not complete. Upload a clear photo for admin review, or try Verify Instantly again.";
        setDocEv({ phase: "manual", reason });
        if (__DEV__) {
          console.log("[DOC_VERIFY] forceManual without timer", {
            docKind: docEvKind,
            error: res.error,
            message: res.message,
          });
        }
      }
      if (res.outcome === "verified") {
        // Persist only after successful verify — unverified edits must not stick on reopen.
        setDocNumberEditing(false);
        setVerifyBlockedForDoc(null);
        const details = res.verifiedData ?? {};
        // Drop any leftover photo drafts — electronic success must not trigger R2 upload on Continue
        // unless soft-mismatch requires a photo (re-pick after verify).
        localDocPhotoLockRef.current = false;
        setDocDraftUri(null);
        setDocDraftBackUri(null);
        if (docEvKind === "driving_licence") {
          lastVerifiedDlRef.current = normalized;
          lastVerifiedDlDetailsRef.current =
            Object.keys(details).length > 0 ? details : lastVerifiedDlDetailsRef.current;
          await setData(
            docUploadToStorePatch(data, "dl", {
              textValue: normalized,
              localUri: null,
              backLocalUri: null,
            }),
          );
          const requirePhotoFromApi = Boolean(
            (res as { requirePhoto?: boolean }).requirePhoto ||
              (details as { requirePhoto?: boolean }).requirePhoto,
          );
          if (requirePhotoFromApi) {
            setDocEv({
              phase: "verified",
              details,
              requirePhoto: true,
              photoHint:
                (typeof (res as { photoHint?: string }).photoHint === "string" &&
                  (res as { photoHint?: string }).photoHint) ||
                "Verified successfully, but the authorized name doesn’t match. Please upload a clear image of your driving licence.",
            });
          } else {
            setDocEv({ phase: "verified", details });
          }
        } else {
          lastVerifiedRcRef.current = normalized;
          lastVerifiedRcDetailsRef.current =
            Object.keys(details).length > 0 ? details : lastVerifiedRcDetailsRef.current;
          await setData(
            docUploadToStorePatch(data, "rc", {
              textValue: normalized,
              localUri: null,
              // Clear any leftover stub / prior URL so Continue cannot treat RC as complete.
              signedUrl: null,
            }),
          );
          // Always keep full Cashfree RC details on screen.
          // Name match → Continue without photo; mismatch → photo mandatory before Continue.
          const ownerName = pickRcOwnerName(details);
          const aadhaarName = String(data.fullName || "").trim();
          const ownerMatched =
            Boolean(ownerName) &&
            Boolean(aadhaarName) &&
            softPersonNamesMatch(ownerName, aadhaarName);
          const requirePhotoFromApi = Boolean(
            (res as { requirePhoto?: boolean }).requirePhoto ||
              (details as { requirePhoto?: boolean }).requirePhoto,
          );
          const requirePhoto = requirePhotoFromApi || !ownerMatched;
          const vehicleMismatchPayload = (
            res as {
              vehicleTypeMismatch?: boolean;
              vehicleMismatch?: {
                rcLabel?: string;
                selectedLabel?: string;
                suggestedVehicleChoice?: string | null;
                suggestedVehicleCategoryCode?: string | null;
                suggestedLabel?: string | null;
                suggestedOnboardingFlow?: string | null;
              };
            }
          ).vehicleMismatch;
          const vehicleTypeMismatch = Boolean(
            (res as { vehicleTypeMismatch?: boolean }).vehicleTypeMismatch &&
              vehicleMismatchPayload,
          );
          if (vehicleTypeMismatch && vehicleMismatchPayload) {
            const detailsForSuggest =
              (Object.keys(details).length > 0 ? details : null) ||
              lastVerifiedRcDetailsRef.current;
            const localSuggest =
              !vehicleMismatchPayload.suggestedVehicleChoice && detailsForSuggest
                ? suggestOnboardingVehicleFromRcClient(
                    detailsForSuggest,
                    sortedVehicleTypes,
                  )
                : null;
            setRcVehicleMismatch({
              rcLabel: String(vehicleMismatchPayload.rcLabel || "Vehicle on RC"),
              selectedLabel: String(
                vehicleMismatchPayload.selectedLabel ||
                  selectedVehicleType?.label ||
                  "Selected vehicle",
              ),
              suggestedVehicleChoice:
                vehicleMismatchPayload.suggestedVehicleChoice ??
                localSuggest?.vehicleChoice ??
                null,
              suggestedVehicleCategoryCode:
                vehicleMismatchPayload.suggestedVehicleCategoryCode ??
                localSuggest?.vehicleCategoryCode ??
                null,
              suggestedLabel:
                vehicleMismatchPayload.suggestedLabel ?? localSuggest?.label ?? null,
              suggestedOnboardingFlow:
                vehicleMismatchPayload.suggestedOnboardingFlow ??
                localSuggest?.onboardingFlow ??
                null,
            });
            if ((res as { blockReverifySameRc?: boolean }).blockReverifySameRc) {
              setVerifyBlockedForDoc(normalized);
              notifyOnboardingToast(
                (typeof (res as { message?: string }).message === "string" &&
                  (res as { message?: string }).message) ||
                  "This RC is not registered for the selected vehicle type. Submit a new RC or continue with the last submitted RC & vehicle type.",
              );
            }
          } else {
            setRcVehicleMismatch(null);
          }
          if (!requirePhoto) {
            setDocEv({ phase: "verified", details });
          } else {
            setDocEv({
              phase: "verified",
              details,
              requirePhoto: true,
              photoHint:
                (typeof (res as { photoHint?: string }).photoHint === "string" &&
                  (res as { photoHint?: string }).photoHint) ||
                "Verified successfully, but the authorized name doesn’t match. Please upload a clear image of your RC.",
            });
          }
        }
        if (data.riderId) {
          void queryClient.invalidateQueries({ queryKey: ["rider", data.riderId] });
        }
        if (__DEV__) {
          console.log("[DL_VERIFY]", {
            attemptId,
            provider: "CASHFREE",
            status: "SUCCESS",
            docKind: docEvKind,
          });
        }
      } else if (res.outcome === "mismatch") {
        const details = res.verifiedData ?? {};
        // Soft mismatch: show details + require photo (DL/RC) instead of a dead-end.
        if (wizardStep === "dl" || wizardStep === "rc") {
          if (wizardStep === "dl") {
            lastVerifiedDlDetailsRef.current =
              Object.keys(details).length > 0 ? details : lastVerifiedDlDetailsRef.current;
          } else {
            lastVerifiedRcDetailsRef.current =
              Object.keys(details).length > 0 ? details : lastVerifiedRcDetailsRef.current;
          }
          setDocEv({
            phase: "verified",
            details,
            requirePhoto: true,
            photoHint:
              wizardStep === "rc"
                ? "Verified successfully, but the authorized name doesn’t match. Please upload a clear image of your RC."
                : "Verified successfully, but the authorized name doesn’t match. Please upload a clear image of your driving licence.",
          });
        } else {
          setDocEv({
            phase: "mismatch",
            error:
              (res.mismatchMessages && res.mismatchMessages.length
                ? res.mismatchMessages.join(". ")
                : null) ||
              res.error ||
              "Details do not match Aadhaar",
            reasons: res.mismatchReasons,
          });
        }
      } else if (res.outcome === "manual") {
        const reason =
          (typeof res.message === "string" && res.message.trim()) ||
          (typeof res.providerMessage === "string" && res.providerMessage.trim()) ||
          (typeof res.error === "string" && res.error.trim()) ||
          "Automatic verification is not available for this document. Upload a clear photo for admin review.";
        setDocAllowManualOnFail(true);
        setDocEv({ phase: "manual", reason });
      } else {
        const exact =
          (typeof res.error === "string" && res.error.trim()) ||
          (typeof res.providerMessage === "string" && res.providerMessage.trim()) ||
          (typeof res.providerStatus === "string" && res.providerStatus.trim()
            ? `Cashfree status: ${res.providerStatus}`
            : "") ||
          (typeof res.reason === "string" && res.reason.trim()) ||
          "Couldn't verify this document automatically. You can try again or upload a photo for manual review.";
        const failFallback =
          wizardStep === "dl"
            ? "Invalid DL number. Please check and try again."
            : wizardStep === "rc"
              ? "Invalid RC number. Please enter a valid RC number and try again."
              : "Couldn't verify this document automatically. You can try again or upload a photo for manual review.";
        const allowManualUpload =
          (res as { allowManualUpload?: boolean }).allowManualUpload === true ||
          wizardStep === "dl";
        setDocAllowManualOnFail(allowManualUpload);
        setDocEv({
          phase: "failed",
          error: friendlyOnboardingError(exact, failFallback),
          providerReference: res.providerReference ?? null,
          verificationId: res.verificationId ?? null,
        });
        setVerifyBlockedForDoc(normalized);
      }
    } catch (e) {
      if (attemptId !== docVerifyAttemptRef.current) return;
      // 429/503 forceManual — show why photo is required (no timed lock).
      if (isElectronicVerifyForceManualError(e)) {
        const reason = extractElectronicVerifyBlockReason(
          e,
          wizardStep === "rc"
            ? "Automatic RC verification is temporarily unavailable. Upload a clear RC photo for review, or try Verify Instantly again."
            : "Automatic verification is temporarily unavailable. Upload a clear photo for review, or try Verify Instantly again.",
        );
        if (__DEV__) {
          console.log("[DOC_VERIFY] forceManual/temp block", {
            docKind: docEvKind,
            reason,
          });
        }
        setDocAllowManualOnFail(true);
        setDocEv({ phase: "manual", reason });
        return;
      }
      setDocAllowManualOnFail(true);
      const catchFallback =
        wizardStep === "dl"
          ? "Invalid DL number. Please check and try again."
          : wizardStep === "rc"
            ? "Invalid RC number. Please enter a valid RC number and try again."
            : "Couldn't verify right now. Check your connection and try again.";
      const friendly = friendlyOnboardingError(e, catchFallback);
      if (__DEV__) {
        console.log("[DOC_VERIFY] catch failure", {
          docKind: docEvKind,
          friendly,
          err: e instanceof Error ? e.message : String(e),
        });
      }
      setDocEv({
        phase: "failed",
        error: friendly,
      });
      setVerifyBlockedForDoc(normalizeCashfreeDocNumber(docDraftText));
    } finally {
      if (attemptId === docVerifyAttemptRef.current) {
        docVerifyInFlightRef.current = false;
      }
    }
  };

  /** Authoritative gate: Cashfree/session verified OR server verified for this number. */
  const docIsElectronicallyVerified = docVerifiedElectronically;

  const currentDocSkipped =
    wizardStep === "category" || wizardStep === "vehicle"
      ? false
      : isDocSkipped(data, wizardStep, riderStatus?.skippedOnboardingDocs);

  const canContinueDoc =
    // Optional doc already skipped — Continue stays active when riding back.
    (currentDocSkipped && !uploading && !submitting) ||
    // Pending manual RC review: allow Continue so rider can finish bank + payment.
    (rcUnderManualReview &&
      docTextValid &&
      !uploading &&
      !submitting) ||
    (!rcUnderManualReview &&
      !currentDocSkipped &&
      // Name-mismatch RC: Continue stays off until an RC image is selected.
      !(rcRequiresPhotoLive && !docDraftUri) &&
      !(
        wizardStep === "rc" &&
        (Boolean(docEv.requirePhoto) ||
          riderStatus?.rcVerificationState === "NAME_MISMATCH") &&
        !docDraftUri
      ) &&
      docTextValid &&
      !docAlreadyRegistered &&
      !checkingDocDuplicate &&
      !uploading &&
      !submitting &&
      !(wizardStep === "rc" && rcVehicleMismatch) &&
      (docIsElectronicallyVerified ||
        (docElectronic
          ? (docEv.phase === "manual" ||
              docEv.phase === "mismatch" ||
              docVerifiedNeedsPhoto ||
              rcRequiresPhotoLive ||
              rcManualRejected ||
              (docEv.phase === "failed" && docAllowManualOnFail)) &&
            docPhotoValid
          : docPhotoValid)));
  const canContinueCategory =
    Boolean(selectedCategory?.isActive) &&
    categoryHasActiveVehicles(sortedVehicleTypes, categoryChoice) &&
    !uploading &&
    !submitting;
  const canContinueVehicle =
    Boolean(selectedVehicleType?.isActive) &&
    !uploading &&
    !submitting &&
    (!selectedVehicleType ||
      expandVehicleDisplayNames(selectedVehicleType).length <= 1 ||
      Boolean(vehicleModelLabel.trim()));

  const headerMeta = useMemo(() => {
    if (wizardStep === "category") {
      const { current, total } = vehicleOnboardingWizardStepNumber(
        "category",
        null,
        selectedVehicleType,
        documentCatalog,
      );
      return {
        icon: "grid-outline" as const,
        stepLabel: `${tx("stepLabelCategory")} (${current} of ${total})`,
        title: tx("titleCategory"),
        subtitle: tx("subtitleCategory"),
      };
    }
    if (wizardStep === "vehicle") {
      const { current, total } = vehicleOnboardingWizardStepNumber(
        "vehicle",
        null,
        selectedVehicleType,
        documentCatalog,
      );
      return {
        icon: (selectedCategory?.icon ?? "car-outline") as keyof typeof Ionicons.glyphMap,
        stepLabel: `${tx("stepLabelVehicle")} (${current} of ${total})`,
        title: tx("titleVehicle"),
        subtitle: selectedCategory?.label
          ? `${selectedCategory.label} — ${tx("subtitleVehicle")}`
          : tx("subtitleVehicle"),
      };
    }
    const doc = findDocumentType(documentCatalog, wizardStep);
    const { current, total } = vehicleOnboardingWizardStepNumber(
      "doc",
      wizardStep,
      selectedVehicleType,
      documentCatalog,
    );
    return {
      icon: (doc?.icon ?? "document-text-outline") as keyof typeof Ionicons.glyphMap,
      stepLabel: `Step 3 · ${doc?.label ?? "Document"} (${current} of ${total})`,
      title: doc?.label ?? "Upload document",
      subtitle:
        currentDocIndex === 0 && selectedVehicleType?.infoMessage && !isOptionalDocStep
          ? selectedVehicleType.infoMessage
          : doc?.hint ?? "Upload a clear photo of your document",
    };
  }, [wizardStep, tx, documentCatalog, selectedVehicleType, selectedCategory?.label, isOptionalDocStep]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(tx("cameraPermissionTitle"), tx("cameraPermissionMessage"));
      return false;
    }
    return true;
  };

  const requestGalleryPermission = async () => {
    // Android/iOS system Photo Picker (expo-image-picker) needs no media-library
    // permission — the user selects a single item in the OS picker. Always proceed.
    return true;
  };

  const pickPhoto = async (source: "camera" | "library"): Promise<string | null> => {
    if (source === "camera") {
      const ok = await requestCameraPermission();
      if (!ok) return null;
    } else {
      const ok = await requestGalleryPermission();
      if (!ok) return null;
    }

    try {
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ["images"],
              allowsEditing: true,
              aspect: [3, 2],
              quality: 0.5,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              allowsEditing: true,
              aspect: [3, 2],
              quality: 0.5,
            });

      if (!result.canceled && result.assets[0]) {
        const raw = result.assets[0].uri;
        const { persistLocalOnboardingPhoto } = await import(
          "@/src/lib/persistLocalOnboardingPhoto"
        );
        return persistLocalOnboardingPhoto(raw, wizardStep === "rc" ? "rc" : "doc");
      }
    } catch {
      notifyOnboardingToast(source === "camera" ? tx("captureFailed") : tx("uploadFailed"));
    }
    return null;
  };

  const showPhotoOptions = (side: "front" | "back") => {
    Alert.alert(tx("pickerTitle"), tx("pickerMessage"), [
      {
        text: tx("capture"),
        onPress: () => {
          void pickPhoto("camera").then((uri) => {
            if (!uri) return;
            localDocPhotoLockRef.current = true;
            if (side === "front") setDocDraftUri(uri);
            else setDocDraftBackUri(uri);
          });
        },
      },
      {
        text: tx("upload"),
        onPress: () => {
          void pickPhoto("library").then((uri) => {
            if (!uri) return;
            localDocPhotoLockRef.current = true;
            if (side === "front") setDocDraftUri(uri);
            else setDocDraftBackUri(uri);
          });
        },
      },
      { text: tx("cancel"), style: "cancel" },
    ]);
  };

  /**
   * Fabric (New Arch) crashes with "Unable to find viewState for tag" when we
   * synchronously remount the heavy DL/RC subtree on Continue. Clear drafts now,
   * then swap the wizard step after the press/layout pass finishes.
   */
  const advanceToDocStep = useCallback((nextCode: string) => {
    Keyboard.dismiss();
    setDocNumberEditing(false);
    localDocPhotoLockRef.current = false;
    setDocDraftText("");
    setDocDraftUri(null);
    setDocDraftBackUri(null);
    setDocEv({ phase: "idle" });
    void setData({ vehicleDocWizardCode: nextCode });
    // Two frames after interactions — Fabric needs the Continue press mount
    // batch to finish before we remount the DL/RC form subtree.
    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setWizardStep(nextCode as WizardStep);
        });
      });
    });
  }, [setData]);

  const handleBack = useCallback(() => {
    if (wizardStep !== "category" && wizardStep !== "vehicle") {
      const idx = vehicleOnboardingDocs.findIndex((d) => d.code === wizardStep);
      if (idx > 0) {
        advanceToDocStep(vehicleOnboardingDocs[idx - 1]!.code);
        return;
      }
      if (isReupload) {
        leaveReuploadFlow();
        return;
      }
      setWizardStep("vehicle");
      return;
    }
    if (wizardStep === "vehicle") {
      if (isReupload) {
        leaveReuploadFlow();
        return;
      }
      setWizardStep("category");
      return;
    }
    if (isReupload) {
      leaveReuploadFlow();
      return;
    }
    // Land on Live Selfie (not PAN) — pan-selfie is a sub-wizard.
    // walk=1 prevents completed-step auto-bounce so header Back works (3→2→1).
    goBackOrReplace("/(onboarding)/pan-selfie?step=selfie&walk=1");
  }, [wizardStep, vehicleOnboardingDocs, isReupload, leaveReuploadFlow, advanceToDocStep]);

  useEffect(() => {
    setOnboardingBackOverride(() => {
      if (wizardStep !== "category" && wizardStep !== "vehicle") {
        const idx = vehicleOnboardingDocs.findIndex((d) => d.code === wizardStep);
        if (idx > 0) {
          advanceToDocStep(vehicleOnboardingDocs[idx - 1]!.code);
          return true;
        }
        if (isReupload) {
          leaveReuploadFlow();
          return true;
        }
        setWizardStep("vehicle");
        return true;
      }
      if (wizardStep === "vehicle") {
        if (isReupload) {
          leaveReuploadFlow();
          return true;
        }
        setWizardStep("category");
        return true;
      }
      if (isReupload) {
        leaveReuploadFlow();
        return true;
      }
      goBackOrReplace("/(onboarding)/pan-selfie?step=selfie&walk=1");
      return true;
    });
    return () => setOnboardingBackOverride(null);
  }, [wizardStep, vehicleOnboardingDocs, isReupload, leaveReuploadFlow, advanceToDocStep]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [handleBack]);

  const handleCategoryContinue = async () => {
    if (!selectedCategory?.isActive) return;
    if (!categoryHasActiveVehicles(sortedVehicleTypes, categoryChoice)) return;
    const clearType = shouldClearVehicleTypeOnCategoryContinue({
      prevCategory: data.vehicleCategoryCode,
      nextCategory: categoryChoice,
      prevVehicleChoice: data.vehicleChoice ?? vehicleChoice,
      prevVehicleCategory: data.vehicleCategoryCode,
    });
    const keptChoice = clearType
      ? undefined
      : String(data.vehicleChoice || vehicleChoice || "").trim() || undefined;
    const keptModel = clearType
      ? undefined
      : normalizeSelectedVehicleModelLabel(
          data.vehicleModelLabel || vehicleModelLabel || "",
        ) || undefined;

    // Persist category immediately. Only drop type when category actually changed
    // (or type is stale under another category) — never on plain back/forward.
    await setData({
      vehicleCategoryCode: categoryChoice,
      ...(clearType
        ? {
            vehicleChoice: undefined,
            vehicleModelLabel: undefined,
            vehicleDocsStarted: undefined,
            vehicleOnboardingSubmittedFor: undefined,
            vehicleOnboardingFlow: undefined,
            skippedOnboardingDocs: undefined,
            vehicleDocWizardCode: undefined,
          }
        : {
            vehicleChoice: keptChoice,
            vehicleModelLabel: keptModel,
          }),
    });
    if (clearType) {
      setVehicleChoice("");
      setVehicleModelLabel("");
      setRcVehicleMismatch(null);
    } else if (keptChoice) {
      setVehicleChoice(keptChoice);
      setVehicleModelLabel(keptModel || "");
    }
    setWizardStep("vehicle");
    if (data.riderId) {
      void saveStep
        .mutateAsync({
          riderId: data.riderId,
          step: "dl_rc",
          data: {
            vehicleCategoryCode: categoryChoice,
            ...(clearType
              ? { clearVehicleChoice: true, skippedOnboardingDocs: [] }
              : keptChoice
                ? {
                    vehicleChoice: keptChoice,
                    ...(keptModel ? { vehicleModelLabel: keptModel } : null),
                  }
                : null),
          },
        })
        .catch(() => undefined);
    }
  };

  const selectSingleVehicle = (type: OnboardingVehicleType) => {
    const vehicleChanged = type.code !== data.vehicleChoice;
    const nextCategory = type.categoryCode || categoryChoice || data.vehicleCategoryCode;
    if (vehicleChanged) {
      setRcVehicleMismatch(null);
      setVerifyBlockedForDoc(null);
      // Invalidate prior RC↔type match UI; keep RC number/payload for reuse recheck.
      setDocEv((prev) => (prev.phase === "verified" ? { phase: "idle" } : prev));
    }
    setVehicleChoice(type.code);
    setVehicleModelLabel("");
    if (nextCategory) setCategoryChoice(nextCategory);
    const docsForType = mergeVehicleOnboardingDocSteps(type, documentCatalog);
    const nextSkips = vehicleChanged
      ? filterSkippedDocsForVehicle(docsForType, data.skippedOnboardingDocs, {
          alsoKeep: geoSkippableWizardCodes,
        })
      : data.skippedOnboardingDocs;
    void setData({
      vehicleChoice: type.code,
      vehicleModelLabel: undefined,
      vehicleCategoryCode: nextCategory,
      ...(vehicleChanged
        ? {
            skippedOnboardingDocs: nextSkips,
            vehicleDocsStarted: undefined,
            vehicleOnboardingSubmittedFor: undefined,
            vehicleDocWizardCode: undefined,
          }
        : null),
    });
    // Persist Category + Type immediately (authoritative store + backend).
    if (data.riderId) {
      void saveStep
        .mutateAsync({
          riderId: data.riderId,
          step: "dl_rc",
          data: {
            vehicleCategoryCode: nextCategory,
            vehicleChoice: type.code,
            onboardingFlow: type.onboardingFlow,
            ...(vehicleChanged
              ? { skippedOnboardingDocs: nextSkips ?? [] }
              : null),
          },
        })
        .catch(() => undefined);
    }
  };

  const openOrSelectVehicle = (type: OnboardingVehicleType) => {
    const models = expandVehicleDisplayNames(type);
    if (models.length > 1) {
      setModelPickerType(type);
      return;
    }
    selectSingleVehicle(type);
  };

  const confirmModelFromSheet = (modelLabel: string) => {
    if (!modelPickerType) return;
    // Always a single display name from the sheet (never "A / B / C" or comma list).
    const singleModel = normalizeSelectedVehicleModelLabel(modelLabel);
    if (!singleModel) return;
    const code = modelPickerType.code;
    const vehicleChanged = code !== data.vehicleChoice;
    const nextCategory =
      modelPickerType.categoryCode || categoryChoice || data.vehicleCategoryCode;
    setVehicleChoice(code);
    setVehicleModelLabel(singleModel);
    if (nextCategory) setCategoryChoice(nextCategory);
    setModelPickerType(null);
    const docsForType = mergeVehicleOnboardingDocSteps(modelPickerType, documentCatalog);
    const nextSkips = vehicleChanged
      ? filterSkippedDocsForVehicle(docsForType, data.skippedOnboardingDocs, {
          alsoKeep: geoSkippableWizardCodes,
        })
      : data.skippedOnboardingDocs;
    void setData({
      vehicleChoice: code,
      vehicleModelLabel: singleModel,
      vehicleCategoryCode: nextCategory,
      ...(vehicleChanged
        ? {
            skippedOnboardingDocs: nextSkips,
            vehicleDocsStarted: undefined,
            vehicleOnboardingSubmittedFor: undefined,
            vehicleDocWizardCode: undefined,
          }
        : null),
    });
    if (data.riderId) {
      void saveStep
        .mutateAsync({
          riderId: data.riderId,
          step: "dl_rc",
          data: {
            vehicleCategoryCode: nextCategory,
            vehicleChoice: code,
            vehicleModelLabel: singleModel,
            onboardingFlow: modelPickerType.onboardingFlow,
            ...(vehicleChanged
              ? { skippedOnboardingDocs: nextSkips ?? [] }
              : null),
          },
        })
        .catch(() => undefined);
    }
  };

  const handleVehicleContinue = async () => {
    const selected = findVehicleType(sortedVehicleTypes, vehicleChoice);
    if (!selected?.isActive) return;

    if (selected.onboardingFlow === "payment") {
      if (!data.riderId) {
        notifyOnboardingToast(tx("riderNotFound"));
        return;
      }
      if (!session?.accessToken) {
        notifyOnboardingToast(tx("notAuthenticated"));
        return;
      }

      setSubmitting(true);
      try {
        await saveStep.mutateAsync({
          riderId: data.riderId,
          step: "dl_rc",
          data: {
            hasOwnVehicle: Boolean(selected.documentRequirements?.has_own_vehicle),
            vehicleCategoryCode: categoryChoice,
            vehicleChoice: selected.code,
            vehicleModelLabel: normalizeSelectedVehicleModelLabel(vehicleModelLabel),
            onboardingFlow: "payment",
            vehicleType: selected.mapsToVehicleType ?? selected.code,
          },
        });
        await setData({
          hasOwnVehicle: Boolean(selected.documentRequirements?.has_own_vehicle),
          vehicleCategoryCode: categoryChoice,
          vehicleChoice: selected.code,
          vehicleModelLabel: normalizeSelectedVehicleModelLabel(vehicleModelLabel),
          vehicleOnboardingFlow: "payment",
          vehicleOnboardingSubmittedFor: selected.code,
          currentStep: "dl_rc",
        });
        router.push("/(onboarding)/bank-account");
      } catch (e) {
        notifyOnboardingToast(e instanceof Error ? e.message : tx("uploadError"));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const onboardingFlow = selected.onboardingFlow;
    const dlRcDocs = resolveVehicleOnboardingDocs(selected, documentCatalog, {
      captureGroup: "dl_rc",
    });
    const rentalEvDocs = resolveVehicleOnboardingDocs(selected, documentCatalog, {
      captureGroup: "rental_ev",
    });
    // Ask only for docs this vehicle requires (same list shown on the select-vehicle card).
    if (!dlRcDocs.length && !rentalEvDocs.length && onboardingFlow !== "payment") {
      notifyOnboardingToast("No documents configured for this vehicle type.");
      return;
    }

    const skippedOnboardingDocs = filterSkippedDocsForVehicle(
      [...dlRcDocs, ...rentalEvDocs],
      data.skippedOnboardingDocs,
      { alsoKeep: geoSkippableWizardCodes },
    );
    const mergedData = {
      ...data,
      hasOwnVehicle: Boolean(selected.documentRequirements?.has_own_vehicle),
      vehicleCategoryCode: categoryChoice,
      vehicleChoice: selected.code,
      vehicleOnboardingFlow: onboardingFlow,
      vehicleOnboardingSubmittedFor: undefined,
      skippedOnboardingDocs,
    };

    await setData({
      hasOwnVehicle: mergedData.hasOwnVehicle,
      vehicleCategoryCode: categoryChoice,
      vehicleChoice: selected.code,
      vehicleModelLabel: normalizeSelectedVehicleModelLabel(vehicleModelLabel),
      vehicleOnboardingFlow: onboardingFlow,
      vehicleOnboardingSubmittedFor: undefined,
      vehicleDocsStarted: true,
      skippedOnboardingDocs,
      // Mark vehicle step so status gates don't bounce to stale pan_selfie.
      currentStep:
        rentalEvDocs.length > 0 && dlRcDocs.length === 0
          ? "rental_ev"
          : "dl_rc",
    });
    if (data.riderId) {
      try {
        await saveStep.mutateAsync({
          riderId: data.riderId,
          step: "dl_rc",
          data: {
            hasOwnVehicle: Boolean(selected.documentRequirements?.has_own_vehicle),
            vehicleCategoryCode: categoryChoice,
            vehicleChoice: selected.code,
            vehicleModelLabel: normalizeSelectedVehicleModelLabel(vehicleModelLabel),
            onboardingFlow,
          },
        });
      } catch {
        // Local selection still kept; rider can retry on next doc save.
      }
    }

    // If this vehicle also needs DL/RC (required or optional), collect those first.
    // Only jump straight to rental-ev when there are no dl_rc docs configured.
    if (rentalEvDocs.length > 0 && dlRcDocs.length === 0) {
      if (isReupload) {
        leaveReuploadFlow();
        return;
      }
      const rentalDoc = firstRentalEvDocCode(selected, documentCatalog);
      void setData({ vehicleDocWizardCode: rentalDoc });
      router.replace(
        rentalEvOnboardingHref({ docCode: rentalDoc, walk: walkThrough }),
      );
      return;
    }

    const firstDoc = dlRcDocs[0]!.code;
    void setData({ vehicleDocWizardCode: firstDoc });
    if (isReupload) {
      const rc = dlRcDocs.find((d) => d.code === "rc");
      setWizardStep(rc?.code ?? firstDoc);
      return;
    }
    setWizardStep(firstDoc);
  };

  const allVehicleDocSteps = useMemo(
    () => mergeVehicleOnboardingDocSteps(selectedVehicleType, documentCatalog),
    [selectedVehicleType, documentCatalog],
  );

  const openRentalEvSequential = useCallback(
    (docCode?: string) => {
      const rentalDoc =
        docCode ?? firstRentalEvDocCode(selectedVehicleType, documentCatalog);
      void setData({ vehicleDocWizardCode: rentalDoc, currentStep: "rental_ev" });
      router.replace(
        rentalEvOnboardingHref({ docCode: rentalDoc, walk: walkThrough }),
      );
    },
    [selectedVehicleType, documentCatalog, setData, walkThrough],
  );

  const finalizeVehicleOnboarding = async (
    mergedData: import("@/src/stores/onboardingStore").OnboardingData
  ) => {
    if (!data.riderId) {
      notifyOnboardingToast(tx("riderNotFound"));
      return;
    }
    // Recover Cashfree-verified DL/RC that only stored the number (no photo sides).
    // Otherwise finalize falsely demands a DL back photo after RC name-mismatch upload.
    let satisfiedData = mergedData;
    {
      const dlState = getDocUploadState(satisfiedData, "dl");
      const rcState = getDocUploadState(satisfiedData, "rc");
      const patch: Partial<import("@/src/stores/onboardingStore").OnboardingData> = {};
      if (
        dlState.textValue.trim() &&
        !dlState.signedUrl &&
        !dlState.localUri &&
        (riderStatus?.dlVerified === true ||
          isElectronicVerifiedDocUrl(riderStatus?.dlFrontUrl) ||
          Boolean(riderStatus?.dlVerifiedData))
      ) {
        Object.assign(
          patch,
          docUploadToStorePatch(satisfiedData, "dl", {
            textValue: dlState.textValue,
            signedUrl: "cashfree_dl_verified",
          }),
        );
      }
      if (
        rcState.textValue.trim() &&
        !rcState.signedUrl &&
        !rcState.localUri &&
        (riderStatus?.rcVerified === true ||
          isElectronicVerifiedDocUrl(riderStatus?.rcFrontUrl) ||
          Boolean(riderStatus?.rcVerifiedData))
      ) {
        Object.assign(
          patch,
          docUploadToStorePatch({ ...satisfiedData, ...patch }, "rc", {
            textValue: rcState.textValue,
            signedUrl: "cashfree_rc_verified",
          }),
        );
      }
      if (Object.keys(patch).length) {
        satisfiedData = { ...satisfiedData, ...patch };
        void setData(patch);
      }
    }
    const docsOk = allVehicleDocSteps.every((d) =>
      isDocStepSatisfied(
        satisfiedData,
        d,
        Boolean(d.optional) || geoSkippableWizardCodes.includes(d.code),
      ),
    );
    if (!docsOk) {
      const missing = allVehicleDocSteps
        .filter(
          (d) =>
            !isDocStepSatisfied(
              satisfiedData,
              d,
              Boolean(d.optional) || geoSkippableWizardCodes.includes(d.code),
            ),
        )
        .map((d) => d.label || d.code)
        .filter(Boolean);
      notifyOnboardingToast(
        missing.length
          ? `Please complete: ${missing.join(", ")}`
          : "Please complete all required documents for this vehicle before continuing.",
      );
      return;
    }
    const onboardingFlow = selectedVehicleType?.onboardingFlow ?? "dl_rc";
    const stepPayload: Record<string, unknown> = {
      hasOwnVehicle: Boolean(selectedVehicleType?.documentRequirements?.has_own_vehicle),
      vehicleChoice: selectedVehicleType?.code ?? vehicleChoice,
      vehicleCategoryCode: categoryChoice,
      vehicleModelLabel: normalizeSelectedVehicleModelLabel(vehicleModelLabel),
      onboardingFlow,
      submitVehicleDocs: true,
      skippedOnboardingDocs: satisfiedData.skippedOnboardingDocs ?? [],
    };
    for (const stepDoc of vehicleOnboardingDocs) {
      if (stepDoc.optional && isDocSkipped(satisfiedData, stepDoc.code)) continue;
      const saved = getDocUploadState(satisfiedData, stepDoc.code);
      if (stepDoc.requiresTextField && saved.textValue.trim()) {
        stepPayload[metadataKeyForDocText(stepDoc.code)] = saved.textValue.trim().toUpperCase();
      }
      if (saved.signedUrl && stepDoc.code === "rental_proof") {
        stepPayload.rentalProofSignedUrl = saved.signedUrl;
      }
      if (saved.signedUrl && stepDoc.code === "ev_proof") {
        stepPayload.evProofSignedUrl = saved.signedUrl;
      }
    }

    try {
      await saveStep.mutateAsync({
        riderId: data.riderId,
        step: "dl_rc",
        data: stepPayload,
      });
    } catch (e) {
      notifyOnboardingToast(
        friendlyOnboardingError(
          e,
          "Please complete all required documents for this vehicle before continuing.",
        ),
      );
      throw e;
    }

    if (onboardingFlow === "rental_ev") {
      const rentalState = getDocUploadState(satisfiedData, "rental_proof");
      const evState = getDocUploadState(satisfiedData, "ev_proof");
      const rentalEvPayload: Record<string, unknown> = {};
      if (rentalState.signedUrl) {
        rentalEvPayload.rentalProofSignedUrl = rentalState.signedUrl;
        rentalEvPayload.uploadedDocCode = "rental_proof";
        rentalEvPayload.uploadedDocSignedUrl = rentalState.signedUrl;
      } else if (evState.signedUrl) {
        rentalEvPayload.evProofSignedUrl = evState.signedUrl;
        rentalEvPayload.uploadedDocCode = "ev_proof";
        rentalEvPayload.uploadedDocSignedUrl = evState.signedUrl;
      }
      if (rentalEvPayload.uploadedDocSignedUrl) {
        await saveStep.mutateAsync({
          riderId: data.riderId,
          step: "rental_ev",
          data: rentalEvPayload,
        });
      }
    }

    await setData({
      hasOwnVehicle: Boolean(selectedVehicleType?.documentRequirements?.has_own_vehicle),
      vehicleCategoryCode: categoryChoice,
      vehicleChoice: selectedVehicleType?.code ?? vehicleChoice,
      vehicleOnboardingFlow: onboardingFlow,
      skippedOnboardingDocs: satisfiedData.skippedOnboardingDocs,
      vehicleOnboardingSubmittedFor: selectedVehicleType?.code ?? vehicleChoice,
      currentStep: onboardingFlow === "rental_ev" ? "rental_ev" : "dl_rc",
    });
    if (data.riderId) {
      await queryClient.refetchQueries({ queryKey: ["rider", data.riderId] });
    }
    if (isReupload) {
      leaveReuploadFlow();
      return;
    }

    if (walkThrough) {
      const href = onboardingContinueHref("dl-rc", {
        vehicleOnboardingFlow: onboardingFlow,
        walk: true,
      });
      if (href) {
        router.replace(href);
        return;
      }
    }

    // EV that skipped RC must upload EV proof before bank.
    const skippedRc = (satisfiedData.skippedOnboardingDocs ?? []).some((c) =>
      /^(rc|registration_certificate|vehicle_rc)$/i.test(String(c)),
    );
    const evProof = getDocUploadState(satisfiedData, "ev_proof");
    const rentalProof = getDocUploadState(satisfiedData, "rental_proof");
    const needsEvProofGate =
      isElectricOnboardingVehicle(selectedVehicleType) &&
      skippedRc &&
      !evProof.signedUrl &&
      !rentalProof.signedUrl;
    if (needsEvProofGate || (onboardingFlow === "rental_ev" && !evProof.signedUrl && !rentalProof.signedUrl)) {
      const rentalDoc = firstRentalEvDocCode(selectedVehicleType, documentCatalog);
      void setData({ vehicleDocWizardCode: rentalDoc });
      router.replace(
        rentalEvOnboardingHref({ docCode: rentalDoc, walk: walkThrough }),
      );
      return;
    }

    router.replace("/(onboarding)/bank-account");
  };

  const handleRcMismatchProceedSwitch = async () => {
    if (!data.riderId) return;
    let code = rcVehicleMismatch?.suggestedVehicleChoice ?? null;
    let categoryCode = rcVehicleMismatch?.suggestedVehicleCategoryCode ?? null;
    let flow =
      (rcVehicleMismatch?.suggestedOnboardingFlow as
        | "dl_rc"
        | "rental_ev"
        | "payment"
        | null) ?? null;
    if (!code) {
      const details =
        lastVerifiedRcDetailsRef.current ||
        (riderStatus?.rcVerifiedData && typeof riderStatus.rcVerifiedData === "object"
          ? (riderStatus.rcVerifiedData as Record<string, unknown>)
          : null);
      const suggested = details
        ? suggestOnboardingVehicleFromRcClient(details, sortedVehicleTypes)
        : null;
      code = suggested?.vehicleChoice ?? null;
      categoryCode = suggested?.vehicleCategoryCode ?? null;
      flow = suggested?.onboardingFlow ?? null;
    }
    if (!code) {
      notifyOnboardingToast(
        "Could not restore the previous vehicle type. Please submit a new RC instead.",
      );
      return;
    }
    setRcMismatchSheetBusy(true);
    try {
      const suggestedType = findVehicleType(sortedVehicleTypes, code);
      const nextCategory =
        categoryCode ?? suggestedType?.categoryCode ?? categoryChoice;
      const nextFlow =
        flow ?? suggestedType?.onboardingFlow ?? "dl_rc";
      const docsForType = mergeVehicleOnboardingDocSteps(suggestedType, documentCatalog);
      const nextSkips = filterSkippedDocsForVehicle(
        docsForType,
        data.skippedOnboardingDocs,
        { alsoKeep: geoSkippableWizardCodes },
      );
      await saveStep.mutateAsync({
        riderId: data.riderId,
        step: "dl_rc",
        data: {
          vehicleChoice: code,
          vehicleCategoryCode: nextCategory,
          onboardingFlow: nextFlow,
          rcVehicleMismatchResolution: "switch",
          skippedOnboardingDocs: nextSkips ?? [],
        },
      });
      await setData({
        vehicleChoice: code,
        vehicleCategoryCode: nextCategory,
        vehicleOnboardingFlow: nextFlow,
        vehicleModelLabel: undefined,
        vehicleDocsStarted: undefined,
        vehicleOnboardingSubmittedFor: undefined,
        vehicleDocWizardCode: undefined,
        skippedOnboardingDocs: nextSkips,
      });
      setCategoryChoice(nextCategory || "");
      setVehicleChoice(code);
      setVehicleModelLabel("");
      setRcVehicleMismatch(null);
      setVerifyBlockedForDoc(null);
      await queryClient.invalidateQueries({ queryKey: ["rider", data.riderId] });
      notifyOnboardingToast("Restored the vehicle type verified by your RC.");
    } catch (e) {
      notifyOnboardingToast(friendlyOnboardingError(e, "Could not update vehicle type."));
    } finally {
      setRcMismatchSheetBusy(false);
    }
  };

  const handleRcMismatchResubmit = async () => {
    if (!data.riderId) return;
    setRcMismatchSheetBusy(true);
    try {
      await saveStep.mutateAsync({
        riderId: data.riderId,
        step: "dl_rc",
        data: {
          rcVehicleMismatchResolution: "resubmit",
          vehicleChoice: data.vehicleChoice || vehicleChoice,
          vehicleCategoryCode: data.vehicleCategoryCode || categoryChoice,
        },
      });
      lastVerifiedRcRef.current = "";
      lastVerifiedRcDetailsRef.current = null;
      setDocEv({ phase: "idle" });
      setDocDraftUri(null);
      setDocDraftText("");
      setVerifyBlockedForDoc(null);
      setRcVehicleMismatch(null);
      await setData(
        docUploadToStorePatch(data, "rc", {
          textValue: "",
          localUri: null,
          signedUrl: null,
        }),
      );
      notifyOnboardingToast("Enter and verify a new RC for your selected vehicle.");
    } catch (e) {
      notifyOnboardingToast(friendlyOnboardingError(e, "Could not reset RC verification."));
    } finally {
      setRcMismatchSheetBusy(false);
    }
  };

  const continueAfterLastDlRcDoc = async (
    mergedData: import("@/src/stores/onboardingStore").OnboardingData
  ) => {
    const onboardingFlow =
      selectedVehicleType?.onboardingFlow ?? mergedData.vehicleOnboardingFlow ?? "dl_rc";
    const rentalSteps = resolveVehicleOnboardingDocs(
      selectedVehicleType,
      documentCatalog,
      { captureGroup: "rental_ev" },
    );
    const rentalPending = rentalSteps.some(
      (d) =>
        !isDocStepSatisfied(
          mergedData,
          d,
          Boolean(d.optional) || geoSkippableWizardCodes.includes(d.code),
        ),
    );
    if (onboardingFlow === "rental_ev" && rentalPending) {
      openRentalEvSequential();
      return;
    }
    await finalizeVehicleOnboarding(mergedData);
  };

  const handleDocStepSkip = async () => {
    if (!isOptionalDocStep || wizardStep === "category" || wizardStep === "vehicle") return;
    if (!currentDocStep?.optional && !geoAllowsDocSkip) {
      notifyOnboardingToast("This document is required for your selected vehicle.");
      return;
    }
    if (isRcWizardStep && !isElectricVehicle) {
      notifyOnboardingToast(
        "RC is required for petrol vehicles. Only EV riders can skip RC and upload EV proof instead.",
      );
      return;
    }
    const skipped = Array.from(new Set([...(data.skippedOnboardingDocs ?? []), wizardStep]));
    const mergedData = { ...data, skippedOnboardingDocs: skipped };
    await setData({ skippedOnboardingDocs: skipped });
    if (data.riderId) {
      try {
        await saveStep.mutateAsync({
          riderId: data.riderId,
          step: "dl_rc",
          data: {
            skippedOnboardingDocs: skipped,
            vehicleChoice: data.vehicleChoice,
            vehicleCategoryCode: data.vehicleCategoryCode,
            vehicleModelLabel: data.vehicleModelLabel,
            hasOwnVehicle: data.hasOwnVehicle,
            onboardingFlow: data.vehicleOnboardingFlow,
          },
        });
      } catch {
        // Local skip kept; finalize / next save will retry persistence.
      }
    }
    const isLastDoc = currentDocIndex >= vehicleOnboardingDocs.length - 1;
    if (!isLastDoc) {
      advanceToDocStep(vehicleOnboardingDocs[currentDocIndex + 1]!.code);
      return;
    }
    if (isReupload) {
      leaveReuploadFlow();
      return;
    }
    setSubmitting(true);
    try {
      await continueAfterLastDlRcDoc(mergedData);
    } catch (e) {
      notifyOnboardingToast(e instanceof Error ? e.message : tx("dlSaveError"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDocStepContinue = async () => {
    const doc = currentDocDef;
    if (!doc) return;
    if (docContinueInFlightRef.current) return;

    const isLastDoc = currentDocIndex >= vehicleOnboardingDocs.length - 1;

    // Already skipped optional doc — Continue just advances (Back must not re-block).
    if (currentDocSkipped) {
      if (isReupload) {
        leaveReuploadFlow();
        return;
      }
      if (!isLastDoc) {
        advanceToDocStep(vehicleOnboardingDocs[currentDocIndex + 1]!.code);
        return;
      }
      setSubmitting(true);
      try {
        await continueAfterLastDlRcDoc(data);
      } catch (e) {
        notifyOnboardingToast(e instanceof Error ? e.message : tx("dlSaveError"));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Already under agent review — continue onboarding (bank → payment); never bounce back.
    if (rcUnderManualReview) {
      if (isReupload) {
        leaveReuploadFlow();
        return;
      }
      if (!isLastDoc) {
        advanceToDocStep(vehicleOnboardingDocs[currentDocIndex + 1]!.code);
        return;
      }
      if (!data.riderId) {
        notifyOnboardingToast(tx("riderNotFound"));
        return;
      }
      setSubmitting(true);
      try {
        await continueAfterLastDlRcDoc(data);
      } catch (e) {
        notifyOnboardingToast(friendlyOnboardingError(e, tx("rcSaveError")));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Hard stop: RC owner ≠ Aadhaar → never advance to bank / next step without a photo.
    const rcPhotoRequiredNow =
      (wizardStep === "rc" || doc.code === "rc") &&
      (rcRequiresPhotoLive ||
        Boolean(docEv.requirePhoto) ||
        riderStatus?.rcVerificationState === "NAME_MISMATCH");
    if (rcPhotoRequiredNow && !docDraftUri) {
      if (docEv.phase === "verified" && !docEv.requirePhoto) {
        setDocEv({
          phase: "verified",
          details: docEv.details,
          requirePhoto: true,
          photoHint:
            "Verified successfully, but the authorized name doesn’t match. Please upload a clear image of your RC.",
        });
      } else if (docEv.phase !== "verified") {
        setDocEv({
          phase: "verified",
          details: lastVerifiedRcDetailsRef.current || {},
          requirePhoto: true,
          photoHint:
            "Verified successfully, but the authorized name doesn’t match. Please upload a clear image of your RC.",
        });
      }
      notifyOnboardingToast(
        "RC owner name does not match Aadhaar. Upload a clear original RC card photo for manual verification.",
      );
      return;
    }

    const electronicallyVerified =
      docIsElectronicallyVerified && !rcRequiresPhotoLive && !rcPhotoRequiredNow;
    const docAlreadyComplete = isDocStepComplete(data, doc, {
      electronicallyVerified,
    });

    if ((docAlreadyComplete || electronicallyVerified) && !rcPhotoRequiredNow) {
      const textValue = doc.requiresTextField
        ? normalizeCashfreeDocNumber(docDraftText) || docDraftText.trim().toUpperCase()
        : "";
      // Cashfree success path: never upload leftover drafts; navigate immediately.
      // Manually verified RC already has a photo — do not overwrite with a stub URL.
      if (
        electronicallyVerified &&
        textValue &&
        riderStatus?.rcVerificationState !== "MANUAL_VERIFIED"
      ) {
        docContinueInFlightRef.current = true;
        try {
          if (!data.riderId) {
            notifyOnboardingToast(tx("riderNotFound"));
            return;
          }
          const riderId = parseInt(data.riderId, 10);
          const verifiedDetails =
            docEv.phase === "verified"
              ? docEv.details
              : wizardStep === "dl"
                ? lastVerifiedDlDetailsRef.current
                : lastVerifiedRcDetailsRef.current;
          // Persist electronic verify on Continue (verify-document defers DB projection).
          if (wizardStep === "dl" || doc.code === "dl") {
            await saveDocument.mutateAsync({
              riderId,
              docType: "dl",
              fileUrl: "cashfree_dl_verified",
              metadata: {
                dlNumber: textValue,
                verificationMethod: "cashfree_dl",
                verifiedDetails: verifiedDetails ?? {},
              },
            });
            await saveStep.mutateAsync({
              riderId: data.riderId,
              step: "dl_rc",
              data: {
                dlNumber: textValue,
                vehicleChoice: data.vehicleChoice,
                vehicleCategoryCode: data.vehicleCategoryCode,
                vehicleModelLabel: data.vehicleModelLabel,
                hasOwnVehicle: data.hasOwnVehicle,
                onboardingFlow: data.vehicleOnboardingFlow,
              },
            });
          } else if (wizardStep === "rc" || doc.code === "rc") {
            await saveDocument.mutateAsync({
              riderId,
              docType: "rc",
              fileUrl: "cashfree_rc_verified",
              metadata: {
                rcNumber: textValue,
                verificationMethod: "cashfree_rc",
                verifiedDetails: verifiedDetails ?? {},
                cashfreeVerifiedData: verifiedDetails ?? {},
              },
            });
            await saveStep.mutateAsync({
              riderId: data.riderId,
              step: "dl_rc",
              data: {
                rcNumber: textValue,
                vehicleChoice: data.vehicleChoice,
                vehicleCategoryCode: data.vehicleCategoryCode,
                vehicleModelLabel: data.vehicleModelLabel,
                hasOwnVehicle: data.hasOwnVehicle,
                onboardingFlow: data.vehicleOnboardingFlow,
              },
            });
          }
          await setData(
            docUploadToStorePatch(data, doc.code, {
              textValue,
              // Mark electronic complete so later finalize (RC photo path) doesn't
              // demand a DL back photo that Cashfree never required.
              signedUrl:
                wizardStep === "dl" || doc.code === "dl"
                  ? "cashfree_dl_verified"
                  : "cashfree_rc_verified",
              localUri: null,
              backLocalUri: null,
              backSignedUrl: null,
            }),
          );
          if (data.riderId) {
            void queryClient.invalidateQueries({ queryKey: ["rider", data.riderId] });
          }
          if (isReupload) {
            leaveReuploadFlow();
            return;
          }
          if (!isLastDoc) {
            advanceToDocStep(vehicleOnboardingDocs[currentDocIndex + 1]!.code);
            return;
          }
          setSubmitting(true);
          await finalizeVehicleOnboarding({
            ...data,
            ...docUploadToStorePatch(data, doc.code, { textValue }),
          });
        } catch (e) {
          const msg = friendlyOnboardingError(e, tx("dlSaveError"));
          const hay = `${msg}\n${e instanceof Error ? e.message : String(e ?? "")}`;
          if (
            (wizardStep === "rc" || doc.code === "rc") &&
            /RC_PHOTO_REQUIRED|owner name does not match|upload a clear original RC/i.test(hay)
          ) {
            const details =
              docEv.phase === "verified"
                ? docEv.details
                : lastVerifiedRcDetailsRef.current || {};
            setDocEv({
              phase: "verified",
              details,
              requirePhoto: true,
              photoHint:
                "Verified successfully, but the authorized name doesn’t match. Please upload a clear image of your RC.",
            });
          }
          notifyOnboardingToast(msg);
        } finally {
          setSubmitting(false);
          docContinueInFlightRef.current = false;
        }
        return;
      }

      if (docAlreadyComplete || riderStatus?.rcVerificationState === "MANUAL_VERIFIED") {
        if (isReupload) {
          leaveReuploadFlow();
          return;
        }
        if (!isLastDoc) {
          advanceToDocStep(vehicleOnboardingDocs[currentDocIndex + 1]!.code);
          return;
        }
        if (!data.riderId) {
          notifyOnboardingToast(tx("riderNotFound"));
          return;
        }
        setSubmitting(true);
        try {
          await finalizeVehicleOnboarding(data);
        } catch (e) {
          notifyOnboardingToast(friendlyOnboardingError(e, tx("rcSaveError")));
        } finally {
          setSubmitting(false);
        }
        return;
      }
    }

    if (!docTextValid) {
      notifyOnboardingToast(`Please enter ${doc.textFieldLabel ?? "document number"}`);
      return;
    }
    if (docAlreadyRegistered) {
      notifyOnboardingToast(
        wizardStep === "dl"
          ? tx("dlAlreadyRegistered")
          : wizardStep === "rc"
            ? tx("rcAlreadyRegistered")
            : "This document number is already registered."
      );
      return;
    }
    if (
      docElectronic &&
      docEvMode === "auto" &&
      !electronicallyVerified &&
      docEv.phase !== "mismatch" &&
      docEv.phase !== "failed" &&
      docEv.phase !== "manual" &&
      !(docEv.phase === "verified" && Boolean(docEv.requirePhoto))
    ) {
      notifyOnboardingToast("Please verify this document electronically to continue.");
      return;
    }
    if (!docDraftUri && !electronicallyVerified) {
      notifyOnboardingToast(needsBackPhoto ? tx("dlFrontPhotoRequired") : tx("dlPhotoRequired"));
      return;
    }
    if (docDraftUri && needsBackPhoto && !docDraftBackUri) {
      notifyOnboardingToast(tx("dlBackPhotoRequired"));
      return;
    }
    if (!data.riderId) {
      notifyOnboardingToast(tx("riderNotFound"));
      return;
    }
    if (!session?.accessToken) {
      notifyOnboardingToast(tx("notAuthenticated"));
      return;
    }

    docContinueInFlightRef.current = true;
    setUploading(true);
    const uploadedKeys: string[] = [];

    try {
      const riderId = parseInt(data.riderId, 10);
      const textValue = doc.requiresTextField ? docDraftText.trim().toUpperCase() : "";
      const metadata: Record<string, unknown> = {};
      if (doc.requiresTextField) {
        metadata[metadataKeyForDocText(doc.code)] = textValue;
      }
      if (doc.code === "rc" && lastVerifiedRcDetailsRef.current) {
        metadata.verifiedDetails = lastVerifiedRcDetailsRef.current;
        metadata.cashfreeVerifiedData = lastVerifiedRcDetailsRef.current;
        if (
          docEv.phase === "mismatch" ||
          (docEv.phase === "verified" && docEv.requirePhoto)
        ) {
          metadata.rcOwnerAadhaarMismatch = true;
          metadata.requiresManualReview = true;
          metadata.verificationMethod = "manual_upload";
        } else {
          metadata.verificationMethod = "cashfree_rc";
        }
      }
      if (doc.code === "dl" && lastVerifiedDlDetailsRef.current) {
        metadata.verifiedDetails = lastVerifiedDlDetailsRef.current;
        if (
          docEv.phase === "mismatch" ||
          (docEv.phase === "verified" && docEv.requirePhoto) ||
          docEv.phase === "manual" ||
          docEv.phase === "failed"
        ) {
          metadata.requiresManualReview = true;
          metadata.aadhaarCrossCheckOk = !(
            docEv.phase === "verified" && docEv.requirePhoto
          );
          metadata.verificationMethod = "manual_upload";
        } else {
          metadata.verificationMethod = "cashfree_dl";
        }
      }
      // Pure photo upload (no Cashfree) — always pending for admin review.
      if (docDraftUri && !electronicallyVerified && !metadata.verificationMethod) {
        metadata.verificationMethod = "manual_upload";
        metadata.requiresManualReview = true;
      }

      let frontUpload: { proxyUrl: string; key: string } | undefined;
      let backUpload: { proxyUrl: string; key: string } | undefined;

      // Manual / hybrid fallback only — never upload when Cashfree already verified.
      if (docDraftUri && !electronicallyVerified) {
        frontUpload = await uploadToR2(
          docDraftUri,
          "documents",
          session.accessToken,
          buildRiderDocumentKey(riderId, doc.code, needsBackPhoto ? "front" : "single")
        );
        uploadedKeys.push(frontUpload.key);

        if (needsBackPhoto && docDraftBackUri) {
          backUpload = await uploadToR2(
            docDraftBackUri,
            "documents",
            session.accessToken,
            buildRiderDocumentKey(riderId, doc.code, "back")
          );
          uploadedKeys.push(backUpload.key);
        }

        await saveDocument.mutateAsync({
          riderId,
          docType: doc.code,
          fileUrl: frontUpload.proxyUrl,
          r2Key: frontUpload.key,
          metadata,
          files: documentFileEntries(frontUpload, backUpload),
        });

        // Keep dl_rc progress + RC number in sync when Cashfree details + image are saved.
        if (doc.code === "rc" || doc.code === "dl") {
          await saveStep.mutateAsync({
            riderId: data.riderId,
            step: "dl_rc",
            data: {
              ...(doc.code === "dl" ? { dlNumber: textValue } : { rcNumber: textValue }),
              vehicleChoice: data.vehicleChoice,
              vehicleCategoryCode: data.vehicleCategoryCode,
              vehicleModelLabel: data.vehicleModelLabel,
              hasOwnVehicle: data.hasOwnVehicle,
              onboardingFlow: data.vehicleOnboardingFlow,
            },
          });
        }
      }

      const mergedAfterUpload = {
        ...data,
        ...docUploadToStorePatch(data, doc.code, {
          // Prefer proxy only — local file:// white-boxes after Back.
          localUri: frontUpload?.proxyUrl
            ? null
            : electronicallyVerified
              ? null
              : docDraftUri,
          signedUrl: frontUpload?.proxyUrl ?? null,
          backLocalUri: backUpload?.proxyUrl
            ? null
            : electronicallyVerified
              ? null
              : docDraftBackUri,
          backSignedUrl: backUpload?.proxyUrl ?? null,
          textValue,
        }),
        hasOwnVehicle: Boolean(selectedVehicleType?.documentRequirements?.has_own_vehicle),
      };

      await setData(mergedAfterUpload);

      if (!electronicallyVerified && frontUpload?.proxyUrl) {
        const uploadedNorm = normalizeCashfreeDocNumber(textValue);
        const keepDetails =
          (docEv.phase === "verified" ? docEv.details : null) ||
          (doc.code === "rc"
            ? lastVerifiedRcDetailsRef.current
            : lastVerifiedDlDetailsRef.current) ||
          {};
        if (doc.code === "rc" && uploadedNorm) {
          uploadedRcNumberRef.current = uploadedNorm;
          if (
            Object.keys(keepDetails).length > 0 ||
            Boolean(metadata.rcOwnerAadhaarMismatch) ||
            rcRequiresPhotoLive ||
            (docEv.phase === "verified" && Boolean(docEv.requirePhoto))
          ) {
            setDocEv({
              phase: "verified",
              details: keepDetails,
              requirePhoto: true,
              photoHint:
                (docEv.phase === "verified" && docEv.photoHint) ||
                "Verified successfully, but the authorized name doesn’t match. Please upload a clear image of your RC.",
            });
          } else {
            setDocEv({
              phase: "manual",
              details: Object.keys(keepDetails).length ? keepDetails : undefined,
            });
          }
        } else if (doc.code === "dl" && uploadedNorm) {
          uploadedDlNumberRef.current = uploadedNorm;
          setDocEv({
            phase: "manual",
            details: Object.keys(keepDetails).length ? keepDetails : undefined,
            reason:
              "Automatic verification failed. Upload clear front and back photos of your driving licence.",
          });
        }
      }

      const rcAwaitingManualReview =
        doc.code === "rc" &&
        (Boolean(metadata.rcOwnerAadhaarMismatch) ||
          rcRequiresPhotoLive ||
          (docEv.phase === "verified" && Boolean(docEv.requirePhoto)));
      if (rcAwaitingManualReview) {
        if (data.riderId) {
          await queryClient.invalidateQueries({ queryKey: ["rider", data.riderId] });
          await queryClient.refetchQueries({ queryKey: ["rider", data.riderId] });
        }
        // Photo submitted for manual review — continue onboarding (do not stay stuck on RC).
        notifyOnboardingToast(
          "RC submitted for manual review. Continue to finish onboarding and payment.",
        );
        if (isReupload) {
          leaveReuploadFlow();
          return;
        }
        if (!isLastDoc) {
          advanceToDocStep(vehicleOnboardingDocs[currentDocIndex + 1]!.code);
          return;
        }
        setSubmitting(true);
        await continueAfterLastDlRcDoc(mergedAfterUpload);
        return;
      }

      if (isReupload) {
        leaveReuploadFlow();
        return;
      }

      if (!isLastDoc) {
        advanceToDocStep(vehicleOnboardingDocs[currentDocIndex + 1]!.code);
        return;
      }

      setSubmitting(true);
      await continueAfterLastDlRcDoc(mergedAfterUpload);
    } catch (e) {
      for (const key of uploadedKeys) {
        try {
          await deleteFromR2(key, session.accessToken);
        } catch (rollbackError) {
          console.error(`[Rollback] Failed to delete R2 ${key}:`, rollbackError);
        }
      }
      notifyOnboardingToast(friendlyOnboardingError(e, tx("dlSaveError")));
    } finally {
      setUploading(false);
      setSubmitting(false);
      docContinueInFlightRef.current = false;
    }
  };

  // Avoid KeyboardAvoidingView entirely — on Android New Architecture it can
  // infinite-loop via _setBottom inside nested SafeAreaView/ScrollView.
  // Header stays OUTSIDE ScrollView so DL→RC remounts don't reparent the header
  // in the same Fabric mount batch (viewState crash).
  return (
    <View style={form.root}>
      <SafeAreaView style={form.safeArea} edges={[]}>
        <View style={form.flex}>
            <View
              style={[form.header, styles.headerSolid, { paddingTop: headerTopPad }]}
              collapsable={false}
            >
            <View style={styles.stepPillRow}>
              <View style={form.stepPill}>
                <Ionicons name={headerMeta.icon} size={14} color={ACCENT_DARK} />
                <Text style={form.stepPillText}>{headerMeta.stepLabel}</Text>
              </View>
              {wizardStep !== "category" &&
              wizardStep !== "vehicle" &&
              (isOptionalDocStep || currentDocSkipped) &&
              !docVerifiedElectronically &&
              !isReupload ? (
                <View style={styles.stepPillSkipSlot}>
                  <HeaderSkipLink
                    label={currentDocSkipped ? "Skipped" : tx("skipOptionalDoc")}
                    onPress={() => void handleDocStepSkip()}
                    disabled={currentDocSkipped || uploading || submitting || saveStep.isPending}
                    skipped={currentDocSkipped}
                  />
                </View>
              ) : null}
            </View>

            <Text style={form.title}>{headerMeta.title}</Text>
            <Text style={form.subtitle}>{headerMeta.subtitle}</Text>
          </View>

          <ScrollView
            style={[form.flex, styles.scrollBelowHeader]}
            contentContainerStyle={[
              form.scrollContent,
              { paddingBottom: onboardingStickyScrollPadding(insets.bottom) },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            removeClippedSubviews={false}
          >
            <View style={form.formCard} collapsable={false}>
              {wizardStep === "category" ? (
                <>
                  {catalogLoading ? (
                    <View style={styles.catalogState}>
                      <ActivityIndicator color={ACCENT_DARK} />
                      <Text style={styles.catalogStateText}>{tx("catalogLoading")}</Text>
                    </View>
                  ) : catalogError ? (
                    <ErrorBanner message={tx("catalogError")} />
                  ) : sortedCategories.length === 0 ? (
                    <ErrorBanner message={tx("catalogEmpty")} />
                  ) : (
                    <View style={styles.vehicleList}>
                      {sortedCategories.map((category) => (
                        <VehicleOptionCard
                          key={category.code}
                          selected={categoryChoice === category.code}
                          title={category.label}
                          hint={buildCategoryHint(category, sortedVehicleTypes)}
                          icon={resolveVehicleIcon(category.icon)}
                          onPress={() => {
                            const changing = categoryChoice !== category.code;
                            setCategoryChoice(category.code);
                            // Only clear type when picking a different category.
                            if (changing) {
                              setVehicleChoice("");
                              setVehicleModelLabel("");
                              setRcVehicleMismatch(null);
                            }
                          }}
                        />
                      ))}
                    </View>
                  )}
                </>
              ) : null}

              {wizardStep === "vehicle" ? (
                <>
                  {catalogLoading ? (
                    <View style={styles.catalogState}>
                      <ActivityIndicator color={ACCENT_DARK} />
                      <Text style={styles.catalogStateText}>{tx("catalogLoading")}</Text>
                    </View>
                  ) : vehiclesInCategory.length === 0 ? (
                    <ErrorBanner message={tx("catalogEmpty")} />
                  ) : (
                    <View style={styles.vehicleList}>
                      {vehiclesInCategory.map((type) => {
                        const models = expandVehicleDisplayNames(type);
                        const isGroup = models.length > 1;
                        const isSelected =
                          vehicleChoice === type.code &&
                          (!isGroup || Boolean(vehicleModelLabel));
                        const title = isGroup
                          ? formatVehicleGroupPreviewTitle(models)
                          : formatVehicleRowTitle(type);
                        const docsHint = formatVehicleRequiredDocsHint(type, documentCatalog);
                        const hint = isGroup
                          ? isSelected
                            ? docsHint || "Tap to change model"
                            : "Tap to choose one model"
                          : docsHint;
                        return (
                          <VehicleOptionCard
                            key={type.code}
                            selected={isSelected}
                            title={title}
                            hint={hint}
                            selectedModelName={
                              isGroup && isSelected ? vehicleModelLabel : null
                            }
                            icon={resolveVehicleIcon(type.icon)}
                            onPress={() => openOrSelectVehicle(type)}
                          />
                        );
                      })}
                    </View>
                  )}

                  {(() => {
                    const req = selectedVehicleType?.documentRequirements;
                    const hasConfiguredDocs =
                      (req?.required_docs?.length ?? 0) > 0 ||
                      (req?.optional_docs?.length ?? 0) > 0;
                    const docsInfo =
                      formatVehicleDocsInfoMessage(selectedVehicleType, documentCatalog) ||
                      (!hasConfiguredDocs
                        ? selectedVehicleType?.infoMessage?.trim()
                        : null) ||
                      null;
                    if (!docsInfo) return null;
                    return (
                      <View style={styles.rentalInfoCard}>
                        <Ionicons name="information-circle-outline" size={22} color="#b45309" />
                        <Text style={styles.rentalInfoText}>{docsInfo}</Text>
                      </View>
                    );
                  })()}
                </>
              ) : null}

              {wizardStep !== "category" && wizardStep !== "vehicle" && currentDocDef ? (
                <View key={wizardStep} collapsable={false}>
                  <VehicleDocumentCaptureStep
                    doc={currentDocDef}
                    stepLabels={[]}
                    currentStepIndex={Math.max(currentDocIndex, 0)}
                    textValue={docDraftText}
                    photoUri={docDraftUri}
                    backPhotoUri={docDraftBackUri}
                    uploading={uploading}
                    onTextChange={(value) => {
                      if (wizardStep === "dl" || wizardStep === "rc") {
                        const next = normalizeCashfreeDocNumber(value).slice(
                          0,
                          wizardStep === "dl" ? 16 : 11,
                        );
                        const prev = normalizeCashfreeDocNumber(docDraftText);
                        setDocNumberEditing(true);
                        setDocDraftText(next);
                        // Number edit → hide local preview (PAN-style). Keep uploaded
                        // number in ref so re-typing the same value keeps Verify off.
                        if (next !== prev) {
                          if (docDraftUri || docDraftBackUri) {
                            if (prev) {
                              if (wizardStep === "rc") uploadedRcNumberRef.current = prev;
                              else uploadedDlNumberRef.current = prev;
                            }
                            localDocPhotoLockRef.current = false;
                            setDocDraftUri(null);
                            setDocDraftBackUri(null);
                          }
                        }
                        if (
                          verifyBlockedForDoc &&
                          next.toUpperCase() !== verifyBlockedForDoc.toUpperCase()
                        ) {
                          setVerifyBlockedForDoc(null);
                        }
                        const verifiedNorm =
                          wizardStep === "dl"
                            ? lastVerifiedDlRef.current
                            : lastVerifiedRcRef.current;
                        if (!next || next !== verifiedNorm) {
                          setDocEv({ phase: "idle" });
                        }
                        return;
                      }
                      setDocDraftText(value);
                    }}
                    onTextFocus={
                      wizardStep === "dl" || wizardStep === "rc"
                        ? () => setDocNumberEditing(true)
                        : undefined
                    }
                    onClearText={
                      wizardStep === "dl" || wizardStep === "rc"
                        ? () => {
                            const cleared = normalizeCashfreeDocNumber(docDraftText);
                            if (cleared && (docDraftUri || docDraftBackUri)) {
                              if (wizardStep === "rc") uploadedRcNumberRef.current = cleared;
                              else uploadedDlNumberRef.current = cleared;
                            }
                            setDocNumberEditing(true);
                            setDocDraftText("");
                            localDocPhotoLockRef.current = false;
                            setDocDraftUri(null);
                            setDocDraftBackUri(null);
                            setVerifyBlockedForDoc(null);
                            setDocEv({ phase: "idle" });
                          }
                        : undefined
                    }
                    onPhotoPress={() => showPhotoOptions("front")}
                    onBackPhotoPress={() => showPhotoOptions("back")}
                    onRemovePhoto={() => {
                      localDocPhotoLockRef.current = false;
                      setDocDraftUri(null);
                    }}
                    onRemoveBackPhoto={() => {
                      localDocPhotoLockRef.current = false;
                      setDocDraftBackUri(null);
                    }}
                    changePhotoLabel={tx("changePhoto")}
                    frontPhotoLabel={tx("frontLabel")}
                    backPhotoLabel={tx("backLabel")}
                    checkingDuplicate={checkingDocDuplicate}
                    alreadyRegistered={docAlreadyRegistered}
                    duplicateWarning={
                      wizardStep === "dl"
                        ? tx("dlAlreadyRegistered")
                        : wizardStep === "rc"
                          ? tx("rcAlreadyRegistered")
                          : undefined
                    }
                    optional={isOptionalDocStep}
                    skipped={currentDocSkipped}
                    textFormatValid={
                      wizardStep === "dl" || wizardStep === "rc" ? docFormatValid : undefined
                    }
                    textPlaceholder={
                      wizardStep === "dl"
                        ? tx("dlPlaceholder")
                        : wizardStep === "rc"
                          ? "Enter RC number"
                          : null
                    }
                    formatErrorMessage={
                      wizardStep === "dl"
                        ? "Invalid DL format"
                        : wizardStep === "rc"
                          ? "Invalid RC format"
                          : null
                    }
                    forceDualPhotos={
                      wizardStep === "dl" &&
                      !docVerifiedElectronically &&
                      (docEv.phase === "failed" ||
                        docEv.phase === "manual" ||
                        docEv.phase === "mismatch" ||
                        docAllowManualOnFail ||
                        Boolean(docDraftUri) ||
                        Boolean(docDraftBackUri) ||
                        needsBackPhoto)
                    }
                    hidePhotos={
                      currentDocSkipped ||
                      (docElectronic
                        ? docIsElectronicallyVerified ||
                          !(
                            docEv.phase === "manual" ||
                            docEv.phase === "mismatch" ||
                            docVerifiedNeedsPhoto ||
                            rcRequiresPhotoLive ||
                            rcUnderManualReview ||
                            sameDocAlreadyManuallyUploaded ||
                            rcManualRejected ||
                            (docEv.phase === "failed" && docAllowManualOnFail) ||
                            Boolean(docDraftUri) ||
                            Boolean(docDraftBackUri)
                          )
                        : false)
                    }
                    hideChecklist={wizardStep === "dl" || wizardStep === "rc"}
                    photoFieldLabel={
                      wizardStep === "dl" && needsBackPhoto
                        ? "Upload DL front & back"
                        : docVerifiedNeedsPhoto ||
                            rcRequiresPhotoLive ||
                            rcManualRejected ||
                            rcUnderManualReview ||
                            sameDocAlreadyManuallyUploaded
                          ? wizardStep === "rc"
                            ? "Upload RC Image"
                            : wizardStep === "dl"
                              ? "Upload DL Image"
                              : undefined
                          : undefined
                    }
                    photoBoxTitle={
                      wizardStep === "dl" && needsBackPhoto
                        ? "Add DL photo"
                        : docVerifiedNeedsPhoto ||
                            rcRequiresPhotoLive ||
                            rcManualRejected ||
                            rcUnderManualReview ||
                            sameDocAlreadyManuallyUploaded
                          ? wizardStep === "rc"
                            ? "Upload RC Image"
                            : wizardStep === "dl"
                              ? "Upload DL Image"
                              : undefined
                          : undefined
                    }
                    afterTextSlot={
                      currentDocSkipped ? null : (
                      <View style={{ gap: 10 }}>
                        {docElectronic ? (
                        <ElectronicVerifyCard
                          mode={docEvMode === "auto" ? "auto" : "hybrid"}
                          state={docEv}
                          disabled={
                            docIsElectronicallyVerified ||
                            sameDocAlreadyManuallyUploaded ||
                            !docFormatValid ||
                            docAlreadyRegistered ||
                            checkingDocDuplicate ||
                            docEv.phase === "verifying" ||
                            (Boolean(verifyBlockedForDoc) &&
                              normalizeCashfreeDocNumber(docDraftText).toUpperCase() ===
                                verifyBlockedForDoc!.toUpperCase())
                          }
                          onVerify={() => {
                            setDocAllowManualOnFail(false);
                            void runDocElectronicVerify();
                          }}
                          onUploadManually={() =>
                            setDocEv({
                              phase: "manual",
                              reason:
                                wizardStep === "dl"
                                  ? "Upload clear front and back photos of your driving licence for review."
                                  : undefined,
                              details:
                                (wizardStep === "dl"
                                  ? lastVerifiedDlDetailsRef.current
                                  : lastVerifiedRcDetailsRef.current) || undefined,
                            })
                          }
                          allowManualUpload={
                            wizardStep === "dl" ||
                            rcManualRejected ||
                            docAllowManualOnFail ||
                            docEv.phase === "manual"
                          }
                          photoUploadVisible={
                            Boolean(docDraftUri) ||
                            docEv.phase === "manual" ||
                            docEv.phase === "mismatch" ||
                            docVerifiedNeedsPhoto ||
                            rcRequiresPhotoLive ||
                            rcUnderManualReview ||
                            sameDocAlreadyManuallyUploaded ||
                            rcManualRejected ||
                            (docEv.phase === "failed" && docAllowManualOnFail)
                          }
                          manualSubmitted={docManualSubmitted}
                          hasUploadedPhoto={Boolean(docDraftUri)}
                          verifyLabel={
                            wizardStep === "rc"
                              ? "Verify Instantly"
                              : wizardStep === "dl"
                                ? "Verify Instantly"
                                : "Verify"
                          }
                          retryLabel="Verify again"
                          documentLabel={
                            wizardStep === "dl"
                              ? "driving licence"
                              : "registration certificate"
                          }
                          requiresDob={wizardStep === "dl"}
                          dob={dlVerifyDob}
                          onDobChange={setDlVerifyDob}
                          verifiedTitle={
                            wizardStep === "dl"
                              ? "Driving License is Valid"
                              : wizardStep === "rc"
                                ? "Vehicle RC is Valid"
                                : undefined
                          }
                          verifiedHint={
                            wizardStep === "rc"
                              ? "Your RC has been verified successfully. Please verify that the vehicle details shown below are correct before continuing."
                              : wizardStep === "dl"
                                ? "Your driving licence has been verified successfully."
                                : undefined
                          }
                        />
                        ) : null}
                      </View>
                      )
                    }
                  />

                  {rcManualRejected ? (
                    <View style={[styles.rcReviewCard, styles.rcReviewCardReject]}>
                      <Ionicons name="alert-circle-outline" size={22} color="#b91c1c" />
                      <Text style={styles.rcReviewTitle}>{tx("rcRejectedTitle")}</Text>
                      <Text style={styles.rcReviewBody}>
                        {riderStatus?.rcRejectedReason || tx("rcRejectedBody")}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </ScrollView>

          <OnboardingStickyFooter>
            {wizardStep === "category" ? (
              <ContinueButton
                label={tx("continue")}
                onPress={() => void handleCategoryContinue()}
                disabled={!canContinueCategory || catalogLoading || catalogError}
                loading={submitting}
              />
            ) : null}
            {wizardStep === "vehicle" ? (
              <ContinueButton
                label={tx("continue")}
                onPress={() => void handleVehicleContinue()}
                disabled={!canContinueVehicle || catalogLoading}
                loading={submitting}
              />
            ) : null}
            {wizardStep !== "category" && wizardStep !== "vehicle" && currentDocDef ? (
              <ContinueButton
                label={
                  uploading
                    ? tx("uploading")
                    : rcManualRejected
                      ? tx("rcUploadAgain")
                      : isReupload
                        ? "Save & close"
                        : continueToNextDocLabel(
                            vehicleOnboardingDocs,
                            currentDocIndex,
                            tx("continue"),
                          )
                }
                onPress={() => void handleDocStepContinue()}
                disabled={!canContinueDoc}
                loading={submitting || uploading || saveStep.isPending}
              />
            ) : null}
          </OnboardingStickyFooter>
        </View>
      </SafeAreaView>

      <RcVehicleTypeMismatchBottomSheet
        visible={Boolean(rcVehicleMismatch && wizardStep === "rc")}
        selectedLabel={rcVehicleMismatch?.selectedLabel ?? ""}
        rcLabel={rcVehicleMismatch?.rcLabel ?? ""}
        suggestedLabel={rcVehicleMismatch?.suggestedLabel}
        loading={rcMismatchSheetBusy}
        onSubmitNewRc={() => void handleRcMismatchResubmit()}
        onContinueWithLastRcVehicle={() => void handleRcMismatchProceedSwitch()}
      />
      <VehicleModelPickerSheet
        visible={modelPickerType != null}
        options={modelPickerType ? expandVehicleDisplayNames(modelPickerType) : []}
        selected={
          modelPickerType && vehicleChoice === modelPickerType.code
            ? vehicleModelLabel || null
            : null
        }
        onClose={() => setModelPickerType(null)}
        onSelect={confirmModelFromSheet}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerSolid: {
    backgroundColor: "#dff5e4",
  },
  stepPillRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    minHeight: 32,
  },
  stepPillSkipSlot: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  scrollBelowHeader: {
    backgroundColor: "#f4fbf6",
  },
  vehicleList: {
    gap: 10,
  },
  catalogState: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 28,
  },
  catalogStateText: {
    fontSize: 13,
    color: colors.gray[600],
    textAlign: "center",
  },
  vehicleCardOuter: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.gray[200],
    backgroundColor: colors.gray[50],
    overflow: "hidden",
  },
  vehicleCardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    width: "100%",
    minHeight: 68,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  vehicleCardSelected: {
    borderColor: ACCENT,
    backgroundColor: "#f0fdf4",
  },
  vehicleCardInactive: {
    opacity: 0.72,
    backgroundColor: colors.gray[100],
    borderColor: colors.gray[200],
  },
  vehicleCardPressed: {
    opacity: 0.92,
  },
  vehicleLeftCol: {
    width: 44,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 2,
  },
  vehicleCenterCol: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  vehicleRightCol: {
    width: 22,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 4,
  },
  vehicleIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  vehicleIconWrapSelected: {
    borderColor: "rgba(57, 211, 83, 0.35)",
    backgroundColor: "#e8fced",
  },
  vehicleIconWrapInactive: {
    backgroundColor: colors.gray[100],
    borderColor: colors.gray[200],
  },
  vehicleTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.gray[800],
    textAlign: "left",
    width: "100%",
    lineHeight: 20,
    ...Platform.select({
      android: { includeFontPadding: false },
    }),
  },
  vehicleTitleSelected: {
    color: ACCENT_DARK,
  },
  vehicleTitleInactive: {
    color: colors.gray[500],
  },
  vehicleHint: {
    fontSize: 12,
    color: colors.gray[500],
    lineHeight: 16,
    textAlign: "left",
    width: "100%",
    marginTop: 2,
    ...Platform.select({
      android: { includeFontPadding: false },
    }),
  },
  vehicleHintInactive: {
    color: colors.gray[400],
    fontStyle: "italic",
  },
  vehicleSelectedModel: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "700",
    color: ACCENT_DARK,
    lineHeight: 18,
    textAlign: "left",
    width: "100%",
    ...Platform.select({
      android: { includeFontPadding: false },
    }),
  },
  vehicleRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.gray[300],
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  vehicleRadioSelected: {
    borderColor: ACCENT,
  },
  vehicleRadioInactive: {
    borderColor: colors.gray[300],
    backgroundColor: colors.gray[100],
  },
  vehicleRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: ACCENT,
  },
  checklist: {
    gap: 10,
  },
  rentalInfoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  rentalInfoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: "#92400e",
    fontWeight: "500",
  },
  rcReviewCard: {
    gap: 8,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  rcReviewCardReject: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  rcReviewTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  rcReviewBody: {
    fontSize: 13,
    lineHeight: 19,
    color: "#4b5563",
    fontWeight: "500",
  },
});
