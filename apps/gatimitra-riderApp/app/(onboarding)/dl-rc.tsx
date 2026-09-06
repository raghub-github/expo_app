// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  BackHandler,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
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
import { useOnboardingEstablishedRedirect } from "@/src/hooks/useOnboardingEstablishedRedirect";
import { onboardingStepToRoute, shouldForwardFromOnboardingScreen, type ServerOnboardingStep } from "@/src/lib/onboarding-routes";
import { goBackOrReplace } from "@/src/lib/onboarding-navigation";
import { notifyOnboardingToast } from "@/src/lib/rider-onboarding-toast";
import { extractApiErrorMessage } from "@/src/services/http";
import { useSessionStore } from "@/src/stores/sessionStore";
import { uploadToR2, deleteFromR2, buildRiderDocumentKey } from "@/src/services/storage/cloudflareR2";
import { useSaveDocument } from "@/src/hooks/useDocuments";
import {
  ContinueButton,
  ErrorBanner,
  SkipDocumentButton,
  onboardingFormStyles as form,
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
import { useQueryClient } from "@tanstack/react-query";
import {
  docRequiresBackPhoto,
  docUploadToStorePatch,
  findDocumentType,
  resolveVehicleWizardDocStep,
  filterSkippedDocsForVehicle,
  getDocUploadState,
  isDocSkipped,
  isDocStepComplete,
  isDocStepSatisfied,
  metadataKeyForDocText,
  resolveVehicleOnboardingDocs,
  type VehicleOnboardingDocStep,
} from "@/src/lib/onboarding-document-types";
import { VehicleDocumentCaptureStep } from "@/src/components/onboarding/VehicleDocumentCaptureStep";
import { colors } from "@/src/theme";

const ACCENT = "#39d353";
const ACCENT_DARK = "#22a745";
const BG = "#f4fbf6";

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
  dlAlreadyRegistered: "Driving License Already Registered , Please try with Diff one .",
  rcAlreadyRegistered: "RC Already Registered , Please try with Diff one .",
  skipOptionalDoc: "Skip this document",
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
  if (data.vehicleOnboardingSubmittedFor) return true;
  for (const doc of docs) {
    if (isDocSkipped(data, doc.code)) return true;
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
  return resolveVehicleWizardDocStep(data, docs) ?? docs[0]!.code;
}

export default function DlRcScreen() {
  const { t } = useTranslation();
  const tx = (key: keyof typeof COPY) =>
    t(`onboarding.dlRc.${key}`, { defaultValue: COPY[key] });

  const session = useSessionStore((s) => s.session);
  const { data, setData, setStep, hydrate } = useOnboardingStore();
  const queryClient = useQueryClient();
  const saveStep = useSaveOnboardingStep();
  const saveDocument = useSaveDocument();
  const { data: riderStatus } = useRiderStatus(data.riderId);
  useOnboardingEstablishedRedirect(riderStatus);
  const { data: vehicleTypes = [], isLoading: vehicleTypesLoading, isError: vehicleTypesError } =
    useOnboardingVehicleTypes();
  const {
    data: vehicleCategories = [],
    isLoading: vehicleCategoriesLoading,
    isError: vehicleCategoriesError,
  } = useOnboardingVehicleCategories();
  const { data: documentCatalog = [] } = useOnboardingDocumentTypes();

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

  useEffect(() => {
    const next = riderStatus?.nextOnboardingStep as ServerOnboardingStep | undefined;
    // Don't auto-skip payment from mid-wizard; only leave when server is clearly past vehicle docs
    // to a non-vehicle destination we aren't editing (rare). Prefer Continue tap for payment.
    if (!next) return;
    if (next === "aadhaar_name" || next === "pan_selfie") {
      // Gone backwards relative to vehicle step — send to the incomplete earlier step.
      router.replace(onboardingStepToRoute(next));
      return;
    }
    if (shouldForwardFromOnboardingScreen("dl_rc", next) && next === "rental_ev") {
      router.replace(onboardingStepToRoute(next));
    }
  }, [riderStatus?.nextOnboardingStep]);

  const [categoryChoice, setCategoryChoice] = useState<string>("");
  const [vehicleChoice, setVehicleChoice] = useState<string>("");
  const [vehicleModelLabel, setVehicleModelLabel] = useState<string>("");
  /** Bottom sheet only for multi-model vehicle rows (not category step). */
  const [modelPickerType, setModelPickerType] = useState<OnboardingVehicleType | null>(null);
  const [wizardStep, setWizardStep] = useState<WizardStep>("category");
  const [docDraftText, setDocDraftText] = useState("");
  const [docDraftUri, setDocDraftUri] = useState<string | null>(null);
  /** True while rider is changing DL/RC — blocks store/server from overwriting the input. */
  const [isEditingDocNumber, setIsEditingDocNumber] = useState(false);
  const isEditingDocNumberRef = useRef(false);
  const setDocNumberEditing = (editing: boolean) => {
    isEditingDocNumberRef.current = editing;
    setIsEditingDocNumber(editing);
  };
  const [docDraftBackUri, setDocDraftBackUri] = useState<string | null>(null);
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
    () => resolveVehicleOnboardingDocs(selectedVehicleType, documentCatalog),
    [selectedVehicleType, documentCatalog]
  );

  const currentDocStep = useMemo(
    () => vehicleOnboardingDocs.find((d) => d.code === wizardStep),
    [vehicleOnboardingDocs, wizardStep]
  );

  const isOptionalDocStep = Boolean(currentDocStep?.optional);

  const currentDocDef = useMemo(() => {
    if (wizardStep === "category" || wizardStep === "vehicle") return undefined;
    return findDocumentType(documentCatalog, wizardStep);
  }, [wizardStep, documentCatalog]);

  const currentDocIndex = useMemo(
    () => vehicleOnboardingDocs.findIndex((d) => d.code === wizardStep),
    [vehicleOnboardingDocs, wizardStep]
  );

  const docStepLabels = useMemo(
    () => vehicleOnboardingDocs.map((d) => d.label),
    [vehicleOnboardingDocs]
  );

  useEffect(() => {
    if (!sortedVehicleTypes.length || !sortedCategories.length) return;
    if (data.vehicleCategoryCode) setCategoryChoice(data.vehicleCategoryCode);
    if (data.vehicleChoice) setVehicleChoice(data.vehicleChoice);
    if (data.vehicleModelLabel) setVehicleModelLabel(data.vehicleModelLabel);
    if (vehicleWizardBootstrappedRef.current) return;

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
    const docs = resolveVehicleOnboardingDocs(vehicle, documentCatalog);
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
    data.documentUploads,
    data.skippedOnboardingDocs,
  ]);

  useEffect(() => {
    if (wizardStep === "category" || wizardStep === "vehicle" || !currentDocDef) return;
    // Never clobber the field while the rider is actively editing the number.
    if (isEditingDocNumberRef.current && (wizardStep === "dl" || wizardStep === "rc")) {
      return;
    }
    const state = getDocUploadState(data, wizardStep);
    setDocDraftText(state.textValue);
    // Prefer server/signed URL over stale local camera cache after fallback upload.
    setDocDraftUri(state.signedUrl ?? state.localUri);
    setDocDraftBackUri(state.backSignedUrl ?? state.backLocalUri ?? null);
  }, [wizardStep, currentDocDef, data.dlNumber, data.rcNumber, data.dlPhotoSignedUrl, data.rcPhotoSignedUrl, data.dlBackPhotoSignedUrl, data.documentUploads]);

  // Rehydrate DL/RC from server — always prefer last Cashfree/manual verified number
  // so an unverified edit that was never submitted does not stick after reopen.
  const dlHydratedRef = useRef(false);
  const rcHydratedRef = useRef(false);
  useEffect(() => {
    if (!riderStatus) return;

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
  // "verified"), NO image is required. The front/back photo requirement applies
  // ONLY on the manual path. This is what fixes "auto-verified DL still asks for
  // the back photo": the image requirement now follows the verification result
  // instead of a static per-document flag.
  const docVerifiedElectronically = docEv.phase === "verified";
  const needsBackPhoto =
    (currentDocDef ? docRequiresBackPhoto(currentDocDef) : false) && !docVerifiedElectronically;
  const docFrontPhotoValid = docVerifiedElectronically || Boolean(docDraftUri);
  const docBackPhotoValid = !needsBackPhoto || Boolean(docDraftBackUri);
  const docPhotoValid = docFrontPhotoValid && docBackPhotoValid;

  // Last successfully verified numbers + details this session (also seeded from server).
  // Editing shows Verify again; typing the same verified number back restores details
  // without another Verify click (even without closing the app).
  const lastVerifiedDlRef = useRef<string>("");
  const lastVerifiedRcRef = useRef<string>("");
  const lastVerifiedDlDetailsRef = useRef<Record<string, unknown> | null>(null);
  const lastVerifiedRcDetailsRef = useRef<Record<string, unknown> | null>(null);
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
    if (serverRc && riderStatus?.rcVerified) {
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
  ]);

  // Reset EV only when switching docs — not when hydrating the same number from server.
  useEffect(() => {
    setDocNumberEditing(false);
    setDocEv({ phase: "idle" });
  }, [wizardStep]);

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
      if (
        draftNorm &&
        verifiedNorm &&
        draftNorm === verifiedNorm &&
        dlDetails &&
        Object.keys(dlDetails).length > 0
      ) {
        if (docEv.phase !== "verified") {
          setDocEv({ phase: "verified", details: dlDetails });
        }
        return;
      }
      if (docEv.phase === "verified" && draftNorm !== verifiedNorm) {
        setDocEv({ phase: "idle" });
        return;
      }
      if (docEv.phase !== "idle") return;
      const hasManual =
        Boolean(docDraftUri) &&
        (Boolean(docDraftBackUri) || !needsBackPhoto) &&
        isValidCashfreeDlNumber(docDraftText) &&
        (!verifiedNorm || draftNorm === verifiedNorm);
      if (hasManual || (Boolean(riderStatus?.dlFrontUrl) && draftNorm === verifiedNorm)) {
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
    if (
      draftNorm &&
      verifiedNorm &&
      draftNorm === verifiedNorm &&
      rcDetails &&
      Object.keys(rcDetails).length > 0
    ) {
      if (docEv.phase !== "verified") {
        setDocEv({ phase: "verified", details: rcDetails });
      }
      return;
    }
    if (docEv.phase === "verified" && draftNorm !== verifiedNorm) {
      setDocEv({ phase: "idle" });
      return;
    }
    if (docEv.phase !== "idle") return;
    const hasManualRc =
      Boolean(docDraftUri) &&
      isValidCashfreeRcNumber(docDraftText) &&
      (!verifiedNorm || draftNorm === verifiedNorm);
    if (hasManualRc || (Boolean(riderStatus?.rcFrontUrl) && draftNorm === verifiedNorm)) {
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
  ]);

  const runDocElectronicVerify = async () => {
    if (!data.riderId || !docEvKind) return;
    if (docEvKind === "driving_licence" && !isValidCashfreeDlNumber(docDraftText)) return;
    if (docEvKind === "vehicle_rc" && !isValidCashfreeRcNumber(docDraftText)) return;
    setDocEv({ phase: "verifying" });
    try {
      const normalized = normalizeCashfreeDocNumber(docDraftText);
      // Cashfree Try DL: License Number + DOB (YYYY-MM-DD) — same as Secure ID modal.
      const dob =
        docEvKind === "driving_licence"
          ? (dlVerifyDob.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null)
          : null;
      if (docEvKind === "driving_licence" && !dob) {
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
      if (res.outcome === "verified") {
        // Persist only after successful verify — unverified edits must not stick on reopen.
        setDocNumberEditing(false);
        const details = res.verifiedData ?? {};
        if (docEvKind === "driving_licence") {
          lastVerifiedDlRef.current = normalized;
          lastVerifiedDlDetailsRef.current =
            Object.keys(details).length > 0 ? details : lastVerifiedDlDetailsRef.current;
          await setData(docUploadToStorePatch(data, "dl", { textValue: normalized }));
        } else {
          lastVerifiedRcRef.current = normalized;
          lastVerifiedRcDetailsRef.current =
            Object.keys(details).length > 0 ? details : lastVerifiedRcDetailsRef.current;
          await setData(docUploadToStorePatch(data, "rc", { textValue: normalized }));
        }
        if (data.riderId) {
          void queryClient.invalidateQueries({ queryKey: ["rider", data.riderId] });
        }
        setDocEv({ phase: "verified", details });
      } else if (res.outcome === "mismatch") {
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
      } else if (res.outcome === "manual") {
        setDocEv({ phase: "manual" });
      } else {
        const exact =
          (typeof res.error === "string" && res.error.trim()) ||
          (typeof res.providerMessage === "string" && res.providerMessage.trim()) ||
          (typeof res.providerStatus === "string" && res.providerStatus.trim()
            ? `Cashfree status: ${res.providerStatus}`
            : "") ||
          (typeof res.reason === "string" && res.reason.trim()) ||
          "Document could not be verified.";
        setDocEv({
          phase: "failed",
          error: exact,
          providerReference: res.providerReference ?? null,
          verificationId: res.verificationId ?? null,
        });
      }
    } catch (e) {
      let message = extractApiErrorMessage(e, "Verification failed.");
      if (/dob_required/i.test(message)) {
        message =
          "Date of birth is required. Enter DOB as on your driving licence (DD/MM/YYYY).";
      } else if (/invalid_dl/i.test(message)) {
        message = "Invalid DL format. Use a valid Indian DL number.";
      } else if (/invalid_vehicle_number/i.test(message)) {
        message = "Invalid RC format. Use a valid vehicle registration number.";
      }
      setDocEv({ phase: "failed", error: message });
    }
  };

  /** Photos needed? Show after fail / manual / Aadhaar mismatch (even in auto mode). */
  const docPhotoRequiredNow =
    !docElectronic ||
    docEv.phase === "failed" ||
    docEv.phase === "manual" ||
    docEv.phase === "mismatch";
  const showDocPhotoBox = docPhotoRequiredNow || Boolean(docDraftUri);

  const canContinueDoc =
    docTextValid &&
    !docAlreadyRegistered &&
    !checkingDocDuplicate &&
    !uploading &&
    !submitting &&
    (docElectronic
      ? docEv.phase === "verified" ||
        ((docEv.phase === "failed" ||
          docEv.phase === "manual" ||
          docEv.phase === "mismatch") &&
          docPhotoValid)
      : docPhotoValid);
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
      return {
        icon: "grid-outline" as const,
        stepLabel: tx("stepLabelCategory"),
        title: tx("titleCategory"),
        subtitle: tx("subtitleCategory"),
      };
    }
    if (wizardStep === "vehicle") {
      return {
        icon: (selectedCategory?.icon ?? "car-outline") as keyof typeof Ionicons.glyphMap,
        stepLabel: tx("stepLabelVehicle"),
        title: tx("titleVehicle"),
        subtitle: selectedCategory?.label
          ? `${selectedCategory.label} — ${tx("subtitleVehicle")}`
          : tx("subtitleVehicle"),
      };
    }
    const doc = findDocumentType(documentCatalog, wizardStep);
    const stepNum = currentDocIndex >= 0 ? currentDocIndex + 1 : 1;
    const total = vehicleOnboardingDocs.length || 1;
    return {
      icon: (doc?.icon ?? "document-text-outline") as keyof typeof Ionicons.glyphMap,
      stepLabel: `Step 3 · ${doc?.label ?? "Document"} (${stepNum} of ${total})`,
      title: doc?.label ?? "Upload document",
      subtitle:
        currentDocIndex === 0 && selectedVehicleType?.infoMessage && !isOptionalDocStep
          ? selectedVehicleType.infoMessage
          : doc?.hint ?? "Upload a clear photo of your document",
    };
  }, [wizardStep, tx, documentCatalog, currentDocIndex, vehicleOnboardingDocs.length, selectedVehicleType, isOptionalDocStep]);

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
        return result.assets[0].uri;
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
            if (side === "front") setDocDraftUri(uri);
            else setDocDraftBackUri(uri);
          });
        },
      },
      { text: tx("cancel"), style: "cancel" },
    ]);
  };

  const handleBack = useCallback(() => {
    if (wizardStep !== "category" && wizardStep !== "vehicle") {
      const idx = vehicleOnboardingDocs.findIndex((d) => d.code === wizardStep);
      if (idx > 0) {
        setWizardStep(vehicleOnboardingDocs[idx - 1]!.code);
        return;
      }
      setWizardStep("vehicle");
      return;
    }
    if (wizardStep === "vehicle") {
      setWizardStep("category");
      return;
    }
    goBackOrReplace("/(onboarding)/pan-selfie");
  }, [wizardStep, vehicleOnboardingDocs]);

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
    await setData({ vehicleCategoryCode: categoryChoice });
    setVehicleChoice("");
    setVehicleModelLabel("");
    setWizardStep("vehicle");
  };

  const selectSingleVehicle = (type: OnboardingVehicleType) => {
    setVehicleChoice(type.code);
    setVehicleModelLabel("");
    void setData({ vehicleChoice: type.code, vehicleModelLabel: undefined });
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
    setVehicleChoice(code);
    setVehicleModelLabel(singleModel);
    setModelPickerType(null);
    void setData({
      vehicleChoice: code,
      vehicleModelLabel: singleModel,
      vehicleCategoryCode: categoryChoice || data.vehicleCategoryCode,
    });
    if (data.riderId) {
      void saveStep
        .mutateAsync({
          riderId: data.riderId,
          step: "dl_rc",
          data: {
            vehicleCategoryCode: categoryChoice || data.vehicleCategoryCode,
            vehicleChoice: code,
            vehicleModelLabel: singleModel,
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

    const docs = resolveVehicleOnboardingDocs(selected, documentCatalog);
    if (!docs.length) {
      notifyOnboardingToast("No documents configured for this vehicle type.");
      return;
    }

    const onboardingFlow = selected.onboardingFlow;
    const skippedOnboardingDocs = filterSkippedDocsForVehicle(docs, data.skippedOnboardingDocs);
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
      skippedOnboardingDocs,
    });
    if (data.riderId) {
      void saveStep.mutateAsync({
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
    }
    const nextDocStep = resolveVehicleWizardDocStep(mergedData, docs);
    if (nextDocStep) setWizardStep(nextDocStep);
  };

  const finalizeVehicleOnboarding = async (
    mergedData: import("@/src/stores/onboardingStore").OnboardingData
  ) => {
    if (!data.riderId) {
      notifyOnboardingToast(tx("riderNotFound"));
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
    };
    for (const stepDoc of vehicleOnboardingDocs) {
      if (stepDoc.optional && isDocSkipped(mergedData, stepDoc.code)) continue;
      const saved = getDocUploadState(mergedData, stepDoc.code);
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

    await saveStep.mutateAsync({
      riderId: data.riderId,
      step: "dl_rc",
      data: stepPayload,
    });

    if (onboardingFlow === "rental_ev") {
      const rentalState = getDocUploadState(mergedData, "rental_proof");
      const evState = getDocUploadState(mergedData, "ev_proof");
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
      skippedOnboardingDocs: mergedData.skippedOnboardingDocs,
      vehicleOnboardingSubmittedFor: selectedVehicleType?.code ?? vehicleChoice,
      currentStep: onboardingFlow === "rental_ev" ? "rental_ev" : "dl_rc",
    });
    if (data.riderId) {
      await queryClient.refetchQueries({ queryKey: ["rider", data.riderId] });
    }
    router.replace("/(onboarding)/bank-account");
  };

  const handleDocStepSkip = async () => {
    if (!isOptionalDocStep || wizardStep === "category" || wizardStep === "vehicle") return;
    const skipped = Array.from(new Set([...(data.skippedOnboardingDocs ?? []), wizardStep]));
    const mergedData = { ...data, skippedOnboardingDocs: skipped };
    await setData({ skippedOnboardingDocs: skipped });
    const isLastDoc = currentDocIndex >= vehicleOnboardingDocs.length - 1;
    if (!isLastDoc) {
      setWizardStep(vehicleOnboardingDocs[currentDocIndex + 1]!.code);
      return;
    }
    setSubmitting(true);
    try {
      await finalizeVehicleOnboarding(mergedData);
    } catch (e) {
      notifyOnboardingToast(e instanceof Error ? e.message : tx("dlSaveError"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDocStepContinue = async () => {
    const doc = currentDocDef;
    if (!doc) return;

    const isLastDoc = currentDocIndex >= vehicleOnboardingDocs.length - 1;
    const docAlreadyComplete = isDocStepComplete(data, doc);

    if (docAlreadyComplete) {
      if (!isLastDoc) {
        setWizardStep(vehicleOnboardingDocs[currentDocIndex + 1]!.code);
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
        notifyOnboardingToast(e instanceof Error ? e.message : tx("rcSaveError"));
      } finally {
        setSubmitting(false);
      }
      return;
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
    const docVerifiedElectronically = docElectronic && docEv.phase === "verified";
    if (docElectronic && docEvMode === "auto" && docEv.phase !== "verified") {
      notifyOnboardingToast("Please verify this document electronically to continue.");
      return;
    }
    if (!docDraftUri && !docVerifiedElectronically) {
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

    setUploading(true);
    const uploadedKeys: string[] = [];

    try {
      const riderId = parseInt(data.riderId, 10);
      const textValue = doc.requiresTextField ? docDraftText.trim().toUpperCase() : "";
      const metadata: Record<string, string> = {};
      if (doc.requiresTextField) {
        metadata[metadataKeyForDocText(doc.code)] = textValue;
      }

      let frontUpload: { proxyUrl: string; key: string } | undefined;
      let backUpload: { proxyUrl: string; key: string } | undefined;

      if (docDraftUri) {
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
      }
      // Electronically verified without a photo: nothing to upload — the
      // verification service already recorded + projected the verified doc.

      const mergedAfterUpload = {
        ...data,
        ...docUploadToStorePatch(data, doc.code, {
          localUri: docDraftUri,
          signedUrl: frontUpload?.proxyUrl ?? null,
          backLocalUri: docDraftBackUri,
          backSignedUrl: backUpload?.proxyUrl ?? null,
          textValue,
        }),
        hasOwnVehicle: Boolean(selectedVehicleType?.documentRequirements?.has_own_vehicle),
      };

      await setData(mergedAfterUpload);

      if (!isLastDoc) {
        setDocDraftText("");
        setDocDraftUri(null);
        setDocDraftBackUri(null);
        setWizardStep(vehicleOnboardingDocs[currentDocIndex + 1]!.code);
        return;
      }

      setSubmitting(true);
      await finalizeVehicleOnboarding(mergedAfterUpload);
    } catch (e) {
      for (const key of uploadedKeys) {
        try {
          await deleteFromR2(key, session.accessToken);
        } catch (rollbackError) {
          console.error(`[Rollback] Failed to delete R2 ${key}:`, rollbackError);
        }
      }
      notifyOnboardingToast(e instanceof Error ? e.message : tx("dlSaveError"));
    } finally {
      setUploading(false);
      setSubmitting(false);
    }
  };

  return (
    <View style={form.root}>
      <SafeAreaView style={form.safeArea} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={form.flex}
        >
          <ScrollView
            contentContainerStyle={form.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <LinearGradient
              colors={["#dff5e4", BG]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={form.header}
            >
              <Pressable
                onPress={handleBack}
                style={form.backBtn}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <Ionicons name="arrow-back" size={20} color={colors.gray[700]} />
              </Pressable>

              <View style={form.stepPill}>
                <Ionicons name={headerMeta.icon} size={14} color={ACCENT_DARK} />
                <Text style={form.stepPillText}>{headerMeta.stepLabel}</Text>
              </View>

              <Text style={form.title}>{headerMeta.title}</Text>
              <Text style={form.subtitle}>{headerMeta.subtitle}</Text>
            </LinearGradient>

            <View style={form.formCard}>
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
                            setCategoryChoice(category.code);
                            setVehicleChoice("");
                            setVehicleModelLabel("");
                          }}
                        />
                      ))}
                    </View>
                  )}

                  <ContinueButton
                    label={tx("continue")}
                    onPress={() => void handleCategoryContinue()}
                    disabled={!canContinueCategory || catalogLoading || catalogError}
                    loading={submitting}
                  />
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
                        const hint = isGroup
                          ? isSelected
                            ? type.hint?.trim() || "Tap to change model"
                            : "Tap to choose one model"
                          : type.hint ?? "";
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

                  {selectedVehicleType?.infoMessage ? (
                    <View style={styles.rentalInfoCard}>
                      <Ionicons name="information-circle-outline" size={22} color="#b45309" />
                      <Text style={styles.rentalInfoText}>{selectedVehicleType.infoMessage}</Text>
                    </View>
                  ) : null}

                  <ContinueButton
                    label={tx("continue")}
                    onPress={() => void handleVehicleContinue()}
                    disabled={!canContinueVehicle || catalogLoading}
                    loading={submitting}
                  />
                </>
              ) : null}

              {wizardStep !== "category" && wizardStep !== "vehicle" && currentDocDef ? (
                <>
                  <VehicleDocumentCaptureStep
                    doc={currentDocDef}
                    stepLabels={docStepLabels}
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
                        setDocNumberEditing(true);
                        setDocDraftText(next);
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
                            setDocNumberEditing(true);
                            setDocDraftText("");
                            setDocEv({ phase: "idle" });
                          }
                        : undefined
                    }
                    onPhotoPress={() => showPhotoOptions("front")}
                    onBackPhotoPress={() => showPhotoOptions("back")}
                    onRemovePhoto={() => setDocDraftUri(null)}
                    onRemoveBackPhoto={() => setDocDraftBackUri(null)}
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
                    skipped={isDocSkipped(data, wizardStep)}
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
                    hidePhotos={
                      docElectronic
                        ? docEv.phase === "verified" ||
                          (docEv.phase === "idle" && !docDraftUri) ||
                          (docEv.phase === "verifying" && !docDraftUri)
                        : false
                    }
                    hideChecklist={wizardStep === "dl" || wizardStep === "rc"}
                    afterTextSlot={
                      docElectronic ? (
                        <ElectronicVerifyCard
                          mode={docEvMode === "auto" ? "auto" : "hybrid"}
                          state={docEv}
                          disabled={!docFormatValid || docAlreadyRegistered || checkingDocDuplicate}
                          onVerify={() => void runDocElectronicVerify()}
                          verifyLabel={
                            wizardStep === "rc"
                              ? "Verify Instantly"
                              : wizardStep === "dl"
                                ? "Verify Instantly"
                                : "Verify"
                          }
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
                              : undefined
                          }
                        />
                      ) : null
                    }
                  />

                  <ContinueButton
                    label={
                      uploading
                        ? tx("uploading")
                        : continueToNextDocLabel(
                            vehicleOnboardingDocs,
                            currentDocIndex,
                            tx("continue")
                          )
                    }
                    onPress={() => void handleDocStepContinue()}
                    disabled={!canContinueDoc}
                    loading={submitting || uploading || saveStep.isPending}
                  />

                  {isOptionalDocStep ? (
                    <SkipDocumentButton
                      label={tx("skipOptionalDoc")}
                      onPress={() => void handleDocStepSkip()}
                      disabled={uploading || submitting || saveStep.isPending}
                    />
                  ) : null}
                </>
              ) : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

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
});
