import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Pressable,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useSaveOnboardingStep, useRiderStatus } from "@/src/hooks/useOnboarding";
import { onboardingStepToRoute } from "@/src/lib/onboarding-routes";
import { goBackOrReplace } from "@/src/lib/onboarding-navigation";
import { useSessionStore } from "@/src/stores/sessionStore";
import { uploadToR2, deleteFromR2, buildRiderDocumentKey } from "@/src/services/storage/cloudflareR2";
import { useSaveDocument } from "@/src/hooks/useDocuments";
import {
  ContinueButton,
  ErrorBanner,
  onboardingFormStyles as form,
} from "@/src/components/onboarding/OnboardingFormUi";
import { useOnboardingVehicleTypes } from "@/src/hooks/useOnboardingVehicleTypes";
import { useOnboardingVehicleCategories } from "@/src/hooks/useOnboardingVehicleCategories";
import { useOnboardingDocumentTypes } from "@/src/hooks/useOnboardingDocumentTypes";
import {
  buildCategoryHint,
  categoryHasActiveVehicles,
  findVehicleCategory,
  findVehicleType,
  FALLBACK_ONBOARDING_VEHICLE_CATEGORIES,
  FALLBACK_ONBOARDING_VEHICLE_TYPES,
  vehiclesForCategory,
  type OnboardingVehicleType,
} from "@/src/lib/onboarding-vehicle-types";
import {
  docRequiresBackPhoto,
  docUploadToStorePatch,
  findDocumentType,
  findFirstIncompleteDocStep,
  getDocUploadState,
  metadataKeyForDocText,
  resolveVehicleRequiredDocs,
  type OnboardingDocumentTypeDef,
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
    "No rental or EV proof is required. You can continue to payment.",
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
  nextRc: "Continue to RC",
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
} as const;

function resolveVehicleIcon(icon?: string | null): keyof typeof Ionicons.glyphMap {
  if (icon && icon in Ionicons.glyphMap) {
    return icon as keyof typeof Ionicons.glyphMap;
  }
  return "car-outline";
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
  icon,
  onPress,
}: {
  selected: boolean;
  inactive?: boolean;
  title: string;
  hint: string;
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
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text style={[styles.vehicleHint, inactive && styles.vehicleHintInactive]} numberOfLines={2}>
            {inactive ? "Inactive — not available right now" : hint}
          </Text>
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

function resolveInitialWizardStep(
  data: {
    vehicleCategoryCode?: string;
    vehicleChoice?: string;
    hasOwnVehicle?: boolean;
  },
  vehicleType: OnboardingVehicleType | undefined,
  docs: OnboardingDocumentTypeDef[]
): WizardStep {
  if (!data.vehicleCategoryCode) return "category";
  if (!data.vehicleChoice) return "vehicle";
  if (vehicleType?.onboardingFlow !== "dl_rc") return "vehicle";
  if (!docs.length) return "vehicle";
  return findFirstIncompleteDocStep(data, docs) ?? docs[0]!.code;
}

export default function DlRcScreen() {
  const { t } = useTranslation();
  const tx = (key: keyof typeof COPY) =>
    t(`onboarding.dlRc.${key}`, { defaultValue: COPY[key] });

  const session = useSessionStore((s) => s.session);
  const { data, setData, setStep, hydrate } = useOnboardingStore();
  const saveStep = useSaveOnboardingStep();
  const saveDocument = useSaveDocument();
  const { data: riderStatus } = useRiderStatus(data.riderId);
  const { data: vehicleTypes = FALLBACK_ONBOARDING_VEHICLE_TYPES } = useOnboardingVehicleTypes();
  const { data: vehicleCategories = FALLBACK_ONBOARDING_VEHICLE_CATEGORIES } =
    useOnboardingVehicleCategories();
  const { data: documentCatalog = [] } = useOnboardingDocumentTypes("dl_rc");

  const sortedCategories = useMemo(
    () => [...vehicleCategories].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    [vehicleCategories]
  );

  const sortedVehicleTypes = useMemo(
    () => [...vehicleTypes].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    [vehicleTypes]
  );

  useEffect(() => {
    const next = riderStatus?.nextOnboardingStep;
    if (!next || next === "dl_rc" || next === "pan_selfie" || next === "aadhaar_name") return;
    if (
      data.vehicleOnboardingFlow === "payment" ||
      data.vehicleOnboardingFlow === "dl_rc"
    ) {
      router.replace("/(onboarding)/payment");
      return;
    }
    if (data.vehicleOnboardingFlow === "rental_ev" && next === "rental_ev") {
      router.replace("/(onboarding)/rental-ev");
      return;
    }
    router.replace(onboardingStepToRoute(next as "rental_ev"));
  }, [riderStatus?.nextOnboardingStep, data.vehicleChoice, data.vehicleOnboardingFlow]);

  const [categoryChoice, setCategoryChoice] = useState<string>(
    () => data.vehicleCategoryCode ?? ""
  );
  const [vehicleChoice, setVehicleChoice] = useState<string>(() => data.vehicleChoice ?? "");

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

  const dlRcRequiredDocs = useMemo(
    () => resolveVehicleRequiredDocs(selectedVehicleType, documentCatalog, "dl_rc"),
    [selectedVehicleType, documentCatalog]
  );

  const [wizardStep, setWizardStep] = useState<WizardStep>("category");
  const [docDraftText, setDocDraftText] = useState("");
  const [docDraftUri, setDocDraftUri] = useState<string | null>(null);
  const [docDraftBackUri, setDocDraftBackUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentDocDef = useMemo(() => {
    if (wizardStep === "category" || wizardStep === "vehicle") return undefined;
    return findDocumentType(documentCatalog, wizardStep);
  }, [wizardStep, documentCatalog]);

  const currentDocIndex = useMemo(
    () => dlRcRequiredDocs.findIndex((d) => d.code === wizardStep),
    [dlRcRequiredDocs, wizardStep]
  );

  const docStepLabels = useMemo(
    () => dlRcRequiredDocs.map((d) => d.label),
    [dlRcRequiredDocs]
  );

  useEffect(() => {
    if (!sortedVehicleTypes.length || !sortedCategories.length) return;
    if (!data.vehicleCategoryCode && !data.vehicleChoice) return;
    const vehicle = findVehicleType(sortedVehicleTypes, data.vehicleChoice);
    const docs = resolveVehicleRequiredDocs(vehicle, documentCatalog, "dl_rc");
    const next = resolveInitialWizardStep(data, vehicle, docs);
    if (next !== "category") setWizardStep(next);
    if (data.vehicleCategoryCode) setCategoryChoice(data.vehicleCategoryCode);
    if (data.vehicleChoice) setVehicleChoice(data.vehicleChoice);
  }, [
    sortedVehicleTypes,
    sortedCategories,
    documentCatalog,
    data.vehicleCategoryCode,
    data.vehicleChoice,
  ]);

  useEffect(() => {
    if (wizardStep === "category" || wizardStep === "vehicle" || !currentDocDef) return;
    const state = getDocUploadState(data, wizardStep);
    setDocDraftText(state.textValue);
    setDocDraftUri(state.localUri ?? state.signedUrl);
    setDocDraftBackUri(state.backLocalUri ?? state.backSignedUrl ?? null);
  }, [wizardStep, currentDocDef, data]);

  const needsBackPhoto = currentDocDef ? docRequiresBackPhoto(currentDocDef) : false;
  const docTextValid =
    !currentDocDef?.requiresTextField ||
    docDraftText.trim().length >= Math.max(currentDocDef?.minTextLength ?? 1, 1);
  const docFrontPhotoValid = Boolean(docDraftUri);
  const docBackPhotoValid = !needsBackPhoto || Boolean(docDraftBackUri);
  const docPhotoValid = docFrontPhotoValid && docBackPhotoValid;
  const canContinueDoc = docTextValid && docPhotoValid && !uploading && !submitting;
  const canContinueCategory =
    Boolean(selectedCategory?.isActive) &&
    categoryHasActiveVehicles(sortedVehicleTypes, categoryChoice) &&
    !uploading &&
    !submitting;
  const canContinueVehicle =
    Boolean(selectedVehicleType?.isActive) && !uploading && !submitting;

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
    const total = dlRcRequiredDocs.length || 1;
    return {
      icon: (doc?.icon ?? "document-text-outline") as keyof typeof Ionicons.glyphMap,
      stepLabel: `Step 3 · ${doc?.label ?? "Document"} (${stepNum} of ${total})`,
      title: doc?.label ?? "Upload document",
      subtitle: doc?.hint ?? "Upload a clear photo of your document",
    };
  }, [wizardStep, tx, documentCatalog, currentDocIndex, dlRcRequiredDocs.length]);

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
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(tx("galleryPermissionTitle"), tx("galleryPermissionMessage"));
      return false;
    }
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
              quality: 0.9,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              allowsEditing: true,
              aspect: [3, 2],
              quality: 0.9,
            });

      if (!result.canceled && result.assets[0]) {
        return result.assets[0].uri;
      }
    } catch {
      setError(source === "camera" ? tx("captureFailed") : tx("uploadFailed"));
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
            setError(null);
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
            setError(null);
            if (side === "front") setDocDraftUri(uri);
            else setDocDraftBackUri(uri);
          });
        },
      },
      { text: tx("cancel"), style: "cancel" },
    ]);
  };

  const handleBack = () => {
    setError(null);
    if (wizardStep !== "category" && wizardStep !== "vehicle") {
      const idx = dlRcRequiredDocs.findIndex((d) => d.code === wizardStep);
      if (idx > 0) {
        setWizardStep(dlRcRequiredDocs[idx - 1]!.code);
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
  };

  const handleCategoryContinue = async () => {
    if (!selectedCategory?.isActive) return;
    if (!categoryHasActiveVehicles(sortedVehicleTypes, categoryChoice)) return;
    setError(null);
    await setData({ vehicleCategoryCode: categoryChoice });
    setVehicleChoice("");
    setWizardStep("vehicle");
  };

  const handleVehicleContinue = async () => {
    const selected = findVehicleType(sortedVehicleTypes, vehicleChoice);
    if (!selected?.isActive) return;

    if (selected.onboardingFlow === "payment") {
      if (!data.riderId) {
        setError(tx("riderNotFound"));
        return;
      }
      if (!session?.accessToken) {
        setError(tx("notAuthenticated"));
        return;
      }

      setError(null);
      setSubmitting(true);
      try {
        await saveStep.mutateAsync({
          riderId: data.riderId,
          step: "dl_rc",
          data: {
            hasOwnVehicle: Boolean(selected.documentRequirements?.has_own_vehicle),
            vehicleCategoryCode: categoryChoice,
            vehicleChoice: selected.code,
            onboardingFlow: "payment",
            vehicleType: selected.mapsToVehicleType ?? selected.code,
          },
        });
        await setData({
          hasOwnVehicle: Boolean(selected.documentRequirements?.has_own_vehicle),
          vehicleCategoryCode: categoryChoice,
          vehicleChoice: selected.code,
          vehicleOnboardingFlow: "payment",
          currentStep: "dl_rc",
        });
        router.push("/(onboarding)/payment");
      } catch (e) {
        setError(e instanceof Error ? e.message : tx("uploadError"));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (selected.onboardingFlow === "rental_ev") {
      if (!data.riderId) {
        setError(tx("riderNotFound"));
        return;
      }
      setError(null);
      setSubmitting(true);
      try {
        await saveStep.mutateAsync({
          riderId: data.riderId,
          step: "dl_rc",
          data: {
            hasOwnVehicle: false,
            vehicleCategoryCode: categoryChoice,
            vehicleChoice: selected.code,
            onboardingFlow: "rental_ev",
          },
        });
        await setData({
          hasOwnVehicle: false,
          vehicleCategoryCode: categoryChoice,
          vehicleChoice: selected.code,
          vehicleOnboardingFlow: "rental_ev",
          currentStep: "rental_ev",
        });
        await setStep("rental_ev");
        router.push("/(onboarding)/rental-ev");
      } catch (e) {
        setError(e instanceof Error ? e.message : tx("uploadError"));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const docs = resolveVehicleRequiredDocs(selected, documentCatalog, "dl_rc");
    if (!docs.length) {
      setError("No documents configured for this vehicle type.");
      return;
    }

    setError(null);
    await setData({
      hasOwnVehicle: Boolean(selected.documentRequirements?.has_own_vehicle),
      vehicleCategoryCode: categoryChoice,
      vehicleChoice: selected.code,
      vehicleOnboardingFlow: "dl_rc",
    });
    if (data.riderId) {
      void saveStep.mutateAsync({
        riderId: data.riderId,
        step: "dl_rc",
        data: {
          hasOwnVehicle: Boolean(selected.documentRequirements?.has_own_vehicle),
          vehicleCategoryCode: categoryChoice,
          vehicleChoice: selected.code,
          onboardingFlow: "dl_rc",
        },
      });
    }
    setWizardStep(docs[0]!.code);
  };

  const handleDocStepContinue = async () => {
    const doc = currentDocDef;
    if (!doc) return;

    if (!docTextValid) {
      setError(`Please enter ${doc.textFieldLabel ?? "document number"}`);
      return;
    }
    if (!docDraftUri) {
      setError(needsBackPhoto ? tx("dlFrontPhotoRequired") : tx("dlPhotoRequired"));
      return;
    }
    if (needsBackPhoto && !docDraftBackUri) {
      setError(tx("dlBackPhotoRequired"));
      return;
    }
    if (!data.riderId) {
      setError(tx("riderNotFound"));
      return;
    }
    if (!session?.accessToken) {
      setError(tx("notAuthenticated"));
      return;
    }

    setError(null);
    setUploading(true);
    const uploadedKeys: string[] = [];
    const isLastDoc = currentDocIndex >= dlRcRequiredDocs.length - 1;

    try {
      const riderId = parseInt(data.riderId, 10);
      const frontUpload = await uploadToR2(
        docDraftUri,
        "documents",
        session.accessToken,
        buildRiderDocumentKey(riderId, doc.code, needsBackPhoto ? "front" : "single")
      );
      uploadedKeys.push(frontUpload.key);

      let backUpload: { proxyUrl: string; key: string } | undefined;
      if (needsBackPhoto && docDraftBackUri) {
        backUpload = await uploadToR2(
          docDraftBackUri,
          "documents",
          session.accessToken,
          buildRiderDocumentKey(riderId, doc.code, "back")
        );
        uploadedKeys.push(backUpload.key);
      }

      const textValue = doc.requiresTextField ? docDraftText.trim().toUpperCase() : "";
      const metadata: Record<string, string> = {};
      if (doc.requiresTextField) {
        metadata[metadataKeyForDocText(doc.code)] = textValue;
      }

      await saveDocument.mutateAsync({
        riderId,
        docType: doc.code,
        fileUrl: frontUpload.proxyUrl,
        r2Key: frontUpload.key,
        metadata,
        files: documentFileEntries(frontUpload, backUpload),
      });

      await setData({
        ...docUploadToStorePatch(data, doc.code, {
          localUri: docDraftUri,
          signedUrl: frontUpload.proxyUrl,
          backLocalUri: docDraftBackUri,
          backSignedUrl: backUpload?.proxyUrl ?? null,
          textValue,
        }),
        hasOwnVehicle: Boolean(selectedVehicleType?.documentRequirements?.has_own_vehicle),
      });

      if (!isLastDoc) {
        setWizardStep(dlRcRequiredDocs[currentDocIndex + 1]!.code);
        return;
      }

      setSubmitting(true);
      const stepPayload: Record<string, unknown> = {
        hasOwnVehicle: Boolean(selectedVehicleType?.documentRequirements?.has_own_vehicle),
        vehicleChoice: selectedVehicleType?.code ?? vehicleChoice,
        vehicleCategoryCode: categoryChoice,
        onboardingFlow: "dl_rc",
      };
      for (const requiredDoc of dlRcRequiredDocs) {
        const saved = getDocUploadState(
          {
            ...data,
            ...docUploadToStorePatch(data, doc.code, {
              localUri: docDraftUri,
              signedUrl: frontUpload.proxyUrl,
              backLocalUri: docDraftBackUri,
              backSignedUrl: backUpload?.proxyUrl ?? null,
              textValue,
            }),
          },
          requiredDoc.code
        );
        if (requiredDoc.requiresTextField) {
          stepPayload[metadataKeyForDocText(requiredDoc.code)] = saved.textValue.trim().toUpperCase();
        }
      }

      await saveStep.mutateAsync({
        riderId: data.riderId,
        step: "dl_rc",
        data: stepPayload,
      });

      await setData({
        hasOwnVehicle: Boolean(selectedVehicleType?.documentRequirements?.has_own_vehicle),
        vehicleCategoryCode: categoryChoice,
        vehicleChoice: selectedVehicleType?.code ?? vehicleChoice,
        vehicleOnboardingFlow: "dl_rc",
        currentStep: "dl_rc",
      });
      router.push("/(onboarding)/payment");
    } catch (e) {
      for (const key of uploadedKeys) {
        try {
          await deleteFromR2(key, session.accessToken);
        } catch (rollbackError) {
          console.error(`[Rollback] Failed to delete R2 ${key}:`, rollbackError);
        }
      }
      setError(e instanceof Error ? e.message : tx("dlSaveError"));
    } finally {
      setUploading(false);
      setSubmitting(false);
    }
  };

  return (
    <View style={form.root}>
      <StatusBar style="dark" backgroundColor={BG} translucent={false} />

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
                  <View style={styles.vehicleList}>
                    {sortedCategories.map((category) => {
                      const inactive =
                        !category.isActive ||
                        !categoryHasActiveVehicles(sortedVehicleTypes, category.code);
                      return (
                        <VehicleOptionCard
                          key={category.code}
                          selected={categoryChoice === category.code}
                          inactive={inactive}
                          title={category.label}
                          hint={buildCategoryHint(category, sortedVehicleTypes)}
                          icon={resolveVehicleIcon(category.icon)}
                          onPress={() => {
                            if (inactive) return;
                            setCategoryChoice(category.code);
                            setVehicleChoice("");
                            setError(null);
                          }}
                        />
                      );
                    })}
                  </View>

                  {error ? <ErrorBanner message={error} /> : null}

                  <ContinueButton
                    label={tx("continue")}
                    onPress={() => void handleCategoryContinue()}
                    disabled={!canContinueCategory}
                    loading={submitting}
                  />
                </>
              ) : null}

              {wizardStep === "vehicle" ? (
                <>
                  <View style={styles.vehicleList}>
                    {vehiclesInCategory.map((type) => (
                      <VehicleOptionCard
                        key={type.code}
                        selected={vehicleChoice === type.code}
                        inactive={!type.isActive}
                        title={type.label}
                        hint={type.hint ?? ""}
                        icon={resolveVehicleIcon(type.icon)}
                        onPress={() => {
                          if (!type.isActive) return;
                          setVehicleChoice(type.code);
                          setError(null);
                        }}
                      />
                    ))}
                  </View>

                  {selectedVehicleType?.infoMessage ? (
                    <View style={styles.rentalInfoCard}>
                      <Ionicons name="information-circle-outline" size={22} color="#b45309" />
                      <Text style={styles.rentalInfoText}>{selectedVehicleType.infoMessage}</Text>
                    </View>
                  ) : null}

                  {error ? <ErrorBanner message={error} /> : null}

                  <ContinueButton
                    label={tx("continue")}
                    onPress={() => void handleVehicleContinue()}
                    disabled={!canContinueVehicle}
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
                    onTextChange={setDocDraftText}
                    onPhotoPress={() => showPhotoOptions("front")}
                    onBackPhotoPress={() => showPhotoOptions("back")}
                    onRemovePhoto={() => setDocDraftUri(null)}
                    onRemoveBackPhoto={() => setDocDraftBackUri(null)}
                    changePhotoLabel={tx("changePhoto")}
                    frontPhotoLabel={tx("frontLabel")}
                    backPhotoLabel={tx("backLabel")}
                  />

                  {error ? <ErrorBanner message={error} /> : null}

                  <ContinueButton
                    label={
                      uploading
                        ? tx("uploading")
                        : currentDocIndex >= dlRcRequiredDocs.length - 1
                          ? tx("continue")
                          : tx("nextRc")
                    }
                    onPress={() => void handleDocStepContinue()}
                    disabled={!canContinueDoc}
                    loading={submitting || uploading || saveStep.isPending}
                  />
                </>
              ) : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  vehicleList: {
    gap: 10,
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
    alignItems: "center",
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
    justifyContent: "center",
  },
  vehicleCenterCol: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  vehicleRightCol: {
    width: 22,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
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
    textAlign: "center",
    width: "100%",
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
    textAlign: "center",
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
