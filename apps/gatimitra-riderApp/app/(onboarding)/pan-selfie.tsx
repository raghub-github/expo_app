// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
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
  usePanRegistrationCheck,
  useVerificationModes,
  useVerifyDocument,
} from "@/src/hooks/useOnboarding";
import { ElectronicVerifyCard, type EvState } from "@/src/components/onboarding/ElectronicVerifyCard";
import { useOnboardingEstablishedRedirect } from "@/src/hooks/useOnboardingEstablishedRedirect";
import { goBackOrReplace } from "@/src/lib/onboarding-navigation";
import { notifyOnboardingToast } from "@/src/lib/rider-onboarding-toast";
import { useSessionStore } from "@/src/stores/sessionStore";
import {
  uploadToR2,
  deleteFromR2,
  buildRiderDocumentKey,
  buildRiderSelfieKey,
} from "@/src/services/storage/cloudflareR2";
import { useSaveDocument, useUpdateRiderStage } from "@/src/hooks/useDocuments";
import { SelfieAutoCapture } from "@/src/components/onboarding/SelfieAutoCapture";
import { colors } from "@/src/theme";

const ACCENT = "#39d353";
const ACCENT_DARK = "#22a745";
const BG = "#f4fbf6";

const PAN_COPY = {
  stepLabelPan: "Step 2 · PAN (1 of 2)",
  stepLabelSelfie: "Step 2 · Selfie (2 of 2)",
  titlePan: "PAN Card Details",
  titleSelfie: "Live Selfie",
  subtitlePan: "PAN is optional — enter details below or skip to selfie",
  panOptional: "Optional",
  subtitleSelfie: "Capture a live selfie to verify your identity",
  panLabel: "PAN Number",
  panPlaceholder: "ABCDE1234F",
  masked: "Masked",
  panPhotoLabel: "PAN Card Photo",
  panPhotoHint: "Upload a clear photo of your physical PAN card",
  panBoxTitle: "Add PAN card photo",
  panBoxSub: "Tap here to capture or upload",
  selfieLabel: "Live Selfie",
  selfieHint: "Blink your eyes when prompted — selfie captures automatically",
  selfieTips: [
    "Face the camera directly",
    "Use good lighting",
    "Remove sunglasses or mask",
    "Blink once when the prompt appears",
  ],
  capture: "Capture",
  upload: "Upload from gallery",
  panPhotoPickerTitle: "Add PAN Photo",
  panPhotoPickerMessage: "Choose how you want to add your PAN card",
  captureSelfie: "Capture Selfie",
  retakeSelfie: "Retake Selfie",
  continue: "Continue",
  submitPan: "Submit Pan",
  skipPan: "Skip",
  skipPanHint: "Continue directly to live selfie",
  uploading: "Uploading…",
  cancel: "Cancel",
  invalidPan: "Enter a valid PAN (e.g. ABCDE1234F)",
  alreadyRegistered: "PAN Already Registered , Please try with Diff one .",
  panPhotoRequired: "Please add a photo of your PAN card",
  selfieRequired: "Please capture a live selfie",
  riderNotFound: "Rider ID not found. Please try again.",
  notAuthenticated: "Not authenticated. Please login again.",
  uploadError: "Failed to upload. Please try again.",
  panSaveError: "Failed to save PAN. Please try again.",
  selfieSaveError: "Failed to save selfie. Please try again.",
  captureFailed: "Failed to capture photo. Please try again.",
  uploadFailed: "Failed to pick photo. Please try again.",
  cameraPermissionTitle: "Permission Required",
  cameraPermissionMessage: "Camera permission is required to capture photos",
  galleryPermissionTitle: "Gallery access needed",
  galleryPermissionMessage: "Allow photo access to upload from gallery",
} as const;

function formatPan(value: string): string {
  return value.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 10);
}

function isValidPan(value: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value);
}

function documentFileEntry(upload: { proxyUrl: string; key: string }) {
  return [
    {
      side: "single" as const,
      fileUrl: upload.proxyUrl,
      r2Key: upload.key,
      mimeType: "image/jpeg",
    },
  ];
}

function ContinueButton({
  label,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const inactive = Boolean(disabled || loading);

  return (
    <TouchableOpacity
      activeOpacity={inactive ? 1 : 0.85}
      onPress={() => {
        if (!inactive) onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      style={[styles.continueBtn, inactive && styles.continueBtnDisabled]}
    >
      {loading ? (
        <ActivityIndicator color={ACCENT_DARK} />
      ) : (
        <>
          <Text style={[styles.continueBtnText, inactive && styles.continueBtnTextDisabled]}>
            {label}
          </Text>
          <Ionicons
            name="arrow-forward"
            size={18}
            color={inactive ? "#7cb889" : "#ffffff"}
          />
        </>
      )}
    </TouchableOpacity>
  );
}

function HeaderSkipLink({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const inactive = Boolean(disabled);
  return (
    <TouchableOpacity
      activeOpacity={inactive ? 1 : 0.7}
      onPress={() => {
        if (!inactive) onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive }}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={[styles.headerSkipBtn, inactive && styles.headerSkipBtnDisabled]}
    >
      <Text style={styles.headerSkipText}>{label}</Text>
    </TouchableOpacity>
  );
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Text style={styles.fieldLabel}>
      {label}
      {required ? <Text style={styles.requiredMark}> *</Text> : null}
    </Text>
  );
}

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return (
    <View style={styles.checkItem}>
      <View style={[styles.checkCircle, done && styles.checkCircleDone]}>
        {done ? (
          <Ionicons name="checkmark" size={12} color="#ffffff" />
        ) : (
          <View style={styles.checkDot} />
        )}
      </View>
      <Text style={[styles.checkLabel, done && styles.checkLabelDone]}>{label}</Text>
    </View>
  );
}

function StepProgress({ current }: { current: "pan" | "selfie" }) {
  return (
    <View style={styles.stepProgress}>
      <View style={styles.stepProgressItem}>
        <View style={[styles.stepDot, styles.stepDotActive]}>
          {current === "selfie" ? (
            <Ionicons name="checkmark" size={12} color="#ffffff" />
          ) : (
            <Text style={styles.stepDotNum}>1</Text>
          )}
        </View>
        <Text style={[styles.stepProgressLabel, current === "pan" && styles.stepProgressLabelActive]}>
          PAN
        </Text>
      </View>

      <View style={[styles.stepLine, current === "selfie" && styles.stepLineActive]} />

      <View style={styles.stepProgressItem}>
        <View style={[styles.stepDot, current === "selfie" && styles.stepDotActive]}>
          <Text style={[styles.stepDotNum, current === "selfie" && styles.stepDotNumActive]}>2</Text>
        </View>
        <Text style={[styles.stepProgressLabel, current === "selfie" && styles.stepProgressLabelActive]}>
          Selfie
        </Text>
      </View>
    </View>
  );
}

function PanPhotoSlot({
  uri,
  onPress,
  onRemove,
  disabled,
  boxTitle,
  boxSub,
}: {
  uri: string | null;
  onPress: () => void;
  onRemove: () => void;
  disabled?: boolean;
  boxTitle: string;
  boxSub: string;
}) {
  return (
    <View style={styles.panSlot}>
      <Pressable
        onPress={onPress}
        disabled={disabled || Boolean(uri)}
        accessibilityRole="button"
        accessibilityLabel={boxTitle}
        style={({ pressed }) => [
          styles.panDropBox,
          uri ? styles.panDropBoxFilled : null,
          !uri && pressed && !disabled && styles.slotBoxPressed,
          disabled && styles.slotActionBtnDisabled,
        ]}
      >
        {uri ? (
          <Image source={{ uri }} style={styles.panPreview} resizeMode="cover" />
        ) : (
          <View style={styles.panEmptyContent}>
            <View style={styles.panEmptyIconCircle}>
              <Ionicons name="camera-outline" size={26} color={ACCENT_DARK} />
            </View>
            <Text style={styles.panTapTitle}>{boxTitle}</Text>
            <Text style={styles.panTapSub}>{boxSub}</Text>
          </View>
        )}

        {uri ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              onRemove();
            }}
            style={styles.slotRemoveBtn}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={22} color="#ffffff" />
          </Pressable>
        ) : null}
      </Pressable>
    </View>
  );
}

export default function PanSelfieScreen() {
  const { t } = useTranslation();
  const tx = (key: keyof typeof PAN_COPY) =>
    t(`onboarding.panSelfie.${key}`, { defaultValue: PAN_COPY[key] });

  const session = useSessionStore((s) => s.session);
  const { data, setData, setStep, hydrate } = useOnboardingStore();
  const saveStep = useSaveOnboardingStep();
  const saveDocument = useSaveDocument();
  const updateStage = useUpdateRiderStage();
  const { data: riderStatus } = useRiderStatus(data.riderId);
  useOnboardingEstablishedRedirect(riderStatus);

  const [panNumber, setPanNumber] = useState(data.panNumber || "");
  const [panPhotoUri, setPanPhotoUri] = useState<string | null>(data.panPhotoUri || null);
  const [selfieUri, setSelfieUri] = useState<string | null>(data.selfieUri || null);
  /** When true, do not re-hydrate selfie from server/store after user hits X / re-capture. */
  const selfieClearedByUserRef = useRef(false);
  const [wizardStep, setWizardStep] = useState<"pan" | "selfie">(() => {
    if (data.selfieUri || data.selfieSignedUrl) return "selfie";
    if (data.panSkipped && !data.selfieUri) return "selfie";
    const panReady = isValidPan(data.panNumber || "") && Boolean(data.panPhotoUri);
    if (panReady && !data.selfieUri) return "selfie";
    return "pan";
  });
  const [panSkipped, setPanSkipped] = useState(Boolean(data.panSkipped));
  const [panPhotoSignedUrl, setPanPhotoSignedUrl] = useState<string | null>(
    data.panPhotoSignedUrl || null
  );
  const [selfieSignedUrl, setSelfieSignedUrl] = useState<string | null>(
    data.selfieSignedUrl || null
  );
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const panValid = isValidPan(panNumber);
  const panCheckQuery = usePanRegistrationCheck(panNumber, data.riderId);
  const panAlreadyRegistered = panCheckQuery.data?.registered === true;
  const checkingPan =
    panValid && (panCheckQuery.isFetching || panCheckQuery.isLoading);
  const panVerified =
    panValid &&
    !checkingPan &&
    panCheckQuery.isSuccess &&
    panCheckQuery.data?.registered === false;
  const panPhotoValid = Boolean(panPhotoUri);
  const selfieValid = Boolean(selfieUri);

  // ── Electronic verification (Policy Center mode for rider PAN) ───────────
  //   manual → classic photo flow; auto → number-only, failure blocks;
  //   hybrid → number-only, failure reveals the photo upload as fallback.
  const { data: modesData } = useVerificationModes();
  const verifyDocument = useVerifyDocument();
  const panMode = (modesData?.modes?.["pan"] ?? "manual") as "manual" | "auto" | "hybrid" | "disabled";
  const panElectronic = panMode === "auto" || panMode === "hybrid";
  const [panEv, setPanEv] = useState<EvState>({ phase: "idle" });
  // Only clear electronic-verify state when the rider edits the PAN (not on server hydrate).
  const handlePanNumberChange = (text: string) => {
    setPanNumber(formatPan(text));
    setPanEv({ phase: "idle" });
  };

  const runPanElectronicVerify = async () => {
    if (!data.riderId) return;
    setPanEv({ phase: "verifying" });
    try {
      const res = await verifyDocument.mutateAsync({
        riderId: data.riderId,
        docKind: "pan",
        pan: panNumber.toUpperCase(),
        name: data.fullName || undefined,
      });
      if (res.outcome === "verified") {
        setPanEv({ phase: "verified", details: res.verifiedData ?? {} });
      } else if (res.outcome === "mismatch") {
        setPanEv({
          phase: "mismatch",
          error:
            (res.mismatchMessages && res.mismatchMessages.length
              ? res.mismatchMessages.join(". ")
              : null) ||
            res.error ||
            res.reason ||
            "Name or DOB does not match Aadhaar",
          reasons: res.mismatchReasons,
        });
      } else if (res.outcome === "manual") {
        setPanEv({ phase: "manual" });
      } else {
        const failReason =
          res.error ||
          res.reason ||
          (typeof res.status === "string" ? `Verification status: ${res.status}` : null) ||
          "PAN could not be verified. Please check the number and try again.";
        setPanEv({ phase: "failed", error: failReason });
      }
    } catch (e) {
      const msg =
        e instanceof Error && e.message
          ? e.message
          : "Verification failed due to a network or server error. Please try again.";
      setPanEv({ phase: "failed", error: msg });
    }
  };

  /** Photo needed? Electronic modes hide it until hybrid fallback or Aadhaar mismatch. */
  const panPhotoRequiredNow =
    !panElectronic ||
    panEv.phase === "failed" ||
    panEv.phase === "manual" ||
    panEv.phase === "mismatch";
  const showPanPhotoBox =
    panPhotoRequiredNow || Boolean(panPhotoUri);

  const canContinuePan =
    panValid &&
    !panAlreadyRegistered &&
    !checkingPan &&
    !uploading &&
    (panEv.phase === "verified" || riderStatus?.panVerified === true
      ? true
      : panElectronic
        ? panEv.phase === "verified" ||
          ((panEv.phase === "failed" ||
            panEv.phase === "manual" ||
            panEv.phase === "mismatch") &&
            panPhotoValid)
        : panPhotoValid);
  const canContinueSelfie =
    selfieValid && !submitting && !uploading;

  const maskedPan = useMemo(() => {
    if (panNumber.length === 0) return "";
    if (panNumber.length <= 5) return panNumber;
    return `XXXXX${panNumber.slice(5)}`;
  }, [panNumber]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    // Do not auto-forward away from this screen when pan_selfie is already
    // complete — riders must be able to go Back from Step 3 and re-capture.
    const serverPan = String(riderStatus?.panNumber || "")
      .replace(/[^A-Z0-9]/gi, "")
      .toUpperCase();
    const serverPanOk = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(serverPan);
    const serverPanVerified = riderStatus?.panVerified === true;

    if (serverPanOk && !isValidPan(panNumber)) {
      setPanNumber(serverPan);
      void setData({ panNumber: serverPan, panSkipped: false });
    }
    if (serverPanVerified) {
      if (panEv.phase !== "verified" && panEv.phase !== "verifying") {
        setPanEv({ phase: "verified", details: {} });
      }
      setPanSkipped(false);
      if (!riderStatus?.selfieUrl && !data.selfieSignedUrl && !data.selfieUri) {
        setWizardStep("selfie");
      }
    }

    // Prefer local draft selfie; only hydrate remote if we have no local capture yet.
    // Skip when user explicitly cleared (X / re-capture) so preview actually empties.
    if (selfieClearedByUserRef.current) {
      setWizardStep("selfie");
      return;
    }
    if (data.selfieUri || data.selfieSignedUrl) {
      setWizardStep("selfie");
    } else if (riderStatus?.selfieUrl) {
      setWizardStep("selfie");
      if (!selfieSignedUrl) {
        setSelfieSignedUrl(riderStatus.selfieUrl);
        void setData({ selfieSignedUrl: riderStatus.selfieUrl });
      }
      if (!selfieUri) {
        setSelfieUri(riderStatus.selfieUrl);
        void setData({ selfieUri: riderStatus.selfieUrl });
      }
    }
  }, [
    riderStatus?.selfieUrl,
    riderStatus?.panNumber,
    riderStatus?.panVerified,
    data.selfieSignedUrl,
    data.selfieUri,
    selfieSignedUrl,
    selfieUri,
    panNumber,
    panEv.phase,
    setData,
  ]);

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

  const handleCapturePanPhoto = async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 2],
        quality: 0.9,
      });
      if (!result.canceled && result.assets[0]) {
        setPanPhotoUri(result.assets[0].uri);
      }
    } catch {
      notifyOnboardingToast(tx("captureFailed"));
    }
  };

  const handlePickPanPhoto = async () => {
    const hasPermission = await requestGalleryPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 2],
        quality: 0.9,
      });
      if (!result.canceled && result.assets[0]) {
        setPanPhotoUri(result.assets[0].uri);
      }
    } catch {
      notifyOnboardingToast(tx("uploadFailed"));
    }
  };

  /** Local preview only — R2 + DB write happens on Continue. */
  const handleCaptureSelfie = async (capturedUri: string) => {
    selfieClearedByUserRef.current = false;
    setSelfieUri(capturedUri);
    setSelfieSignedUrl(null);
    await setData({
      selfieUri: capturedUri,
      selfieSignedUrl: undefined,
    });
  };

  const clearSelfieDraft = () => {
    selfieClearedByUserRef.current = true;
    setSelfieUri(null);
    setSelfieSignedUrl(null);
    void setData({ selfieUri: undefined, selfieSignedUrl: undefined });
  };

  const isLocalSelfieUri = (uri: string) =>
    uri.startsWith("file:") ||
    uri.startsWith("content:") ||
    uri.startsWith("ph:") ||
    uri.startsWith("assets-library:");

  const showPanPhotoOptions = () => {
    Alert.alert(tx("panPhotoPickerTitle"), tx("panPhotoPickerMessage"), [
      { text: tx("capture"), onPress: () => void handleCapturePanPhoto() },
      { text: tx("upload"), onPress: () => void handlePickPanPhoto() },
      { text: tx("cancel"), style: "cancel" },
    ]);
  };

  const handleSkipPan = async () => {
    setPanNumber("");
    setPanPhotoUri(null);
    setPanPhotoSignedUrl(null);
    setPanSkipped(true);
    await setData({
      panNumber: undefined,
      panPhotoUri: undefined,
      panPhotoSignedUrl: undefined,
      panSkipped: true,
    });
    setWizardStep("selfie");
  };

  const handlePanStepContinue = async () => {
    if (!panValid) {
      notifyOnboardingToast(tx("invalidPan"));
      return;
    }

    if (panAlreadyRegistered) {
      notifyOnboardingToast(tx("alreadyRegistered"));
      return;
    }

    // Electronic modes: the photo is only mandatory on the hybrid fallback.
    if (
      !panPhotoUri &&
      panPhotoRequiredNow &&
      !(panElectronic && panEv.phase === "verified") &&
      riderStatus?.panVerified !== true
    ) {
      notifyOnboardingToast(tx("panPhotoRequired"));
      return;
    }
    if (
      panElectronic &&
      panMode === "auto" &&
      panEv.phase !== "verified" &&
      riderStatus?.panVerified !== true
    ) {
      notifyOnboardingToast("Please verify your PAN electronically to continue.");
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
      let uploadedProxyUrl: string | null = null;

      if (panPhotoUri) {
        const panUploadResult = await uploadToR2(
          panPhotoUri,
          "documents",
          session.accessToken,
          buildRiderDocumentKey(riderId, "pan", "single")
        );
        uploadedKeys.push(panUploadResult.key);

        await saveDocument.mutateAsync({
          riderId,
          docType: "pan",
          fileUrl: panUploadResult.proxyUrl,
          r2Key: panUploadResult.key,
          metadata: { panNumber: panNumber.toUpperCase() },
          files: documentFileEntry(panUploadResult),
        });

        uploadedProxyUrl = panUploadResult.proxyUrl;
        setPanPhotoSignedUrl(panUploadResult.proxyUrl);
      }

      setPanSkipped(false);
      await setData({
        panNumber: panNumber.toUpperCase(),
        panPhotoUri: panPhotoUri ?? undefined,
        panPhotoSignedUrl: uploadedProxyUrl ?? undefined,
        panSkipped: false,
      });

      setWizardStep("selfie");
    } catch (e) {
      for (const key of uploadedKeys) {
        try {
          await deleteFromR2(key, session.accessToken);
        } catch (rollbackError) {
          console.error(`[Rollback] Failed to delete R2 PAN ${key}:`, rollbackError);
        }
      }
      notifyOnboardingToast(e instanceof Error ? e.message : tx("panSaveError"));
    } finally {
      setUploading(false);
    }
  };

  const handleBack = useCallback(() => {
    if (wizardStep === "selfie") {
      setWizardStep("pan");
      return;
    }
    goBackOrReplace("/(onboarding)/aadhaar");
  }, [wizardStep]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [handleBack]);

  const handleContinue = async () => {
    if (!selfieUri) {
      notifyOnboardingToast(tx("selfieRequired"));
      return;
    }
    const panReady =
      panSkipped ||
      panEv.phase === "verified" ||
      riderStatus?.panVerified === true ||
      (panValid && (Boolean(panPhotoUri) || Boolean(panPhotoSignedUrl)));
    if (!panReady) {
      setWizardStep("pan");
      notifyOnboardingToast(tx("panPhotoRequired"));
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

    setSubmitting(true);
    const uploadedKeys: string[] = [];

    try {
      const riderId = parseInt(data.riderId, 10);
      let remoteSelfieUrl = selfieSignedUrl;

      // Upload selfie only when Continue is pressed (never on capture).
      if (!remoteSelfieUrl || isLocalSelfieUri(selfieUri)) {
        const selfieUploadResult = await uploadToR2(
          selfieUri,
          "documents",
          session.accessToken,
          buildRiderSelfieKey(riderId)
        );
        uploadedKeys.push(selfieUploadResult.key);

        await saveDocument.mutateAsync({
          riderId,
          docType: "selfie",
          fileUrl: selfieUploadResult.proxyUrl,
          r2Key: selfieUploadResult.key,
          files: documentFileEntry(selfieUploadResult),
        });

        remoteSelfieUrl = selfieUploadResult.proxyUrl;
        setSelfieSignedUrl(remoteSelfieUrl);
      }

      const hasPanNumber =
        panValid ||
        panEv.phase === "verified" ||
        riderStatus?.panVerified === true;

      await saveStep.mutateAsync({
        riderId: data.riderId,
        step: "pan_selfie",
        data: {
          ...(hasPanNumber && panNumber
            ? { panNumber: panNumber.toUpperCase() }
            : {}),
          selfieSignedUrl: remoteSelfieUrl!,
        },
      });

      await updateStage.mutateAsync({
        riderId,
        stage: "KYC",
      });

      await setData({
        ...(panSkipped
          ? { panSkipped: true }
          : {
              panNumber: panNumber ? panNumber.toUpperCase() : data.panNumber,
              panPhotoUri: panPhotoUri ?? undefined,
              panPhotoSignedUrl: panPhotoSignedUrl ?? undefined,
              panSkipped: false,
            }),
        selfieUri,
        selfieSignedUrl: remoteSelfieUrl!,
        // Fresh Step 3: never carry stale category/vehicle into DL/RC auto-skip.
        vehicleCategoryCode: undefined,
        vehicleChoice: undefined,
        vehicleModelLabel: undefined,
        vehicleOnboardingFlow: undefined,
        vehicleOnboardingSubmittedFor: undefined,
      });

      await setStep("dl_rc");
      router.push("/(onboarding)/dl-rc");
    } catch (e) {
      for (const key of uploadedKeys) {
        try {
          await deleteFromR2(key, session.accessToken);
        } catch (rollbackError) {
          console.error(`[Rollback] Failed to delete R2 selfie ${key}:`, rollbackError);
        }
      }
      notifyOnboardingToast(e instanceof Error ? e.message : tx("uploadError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <LinearGradient
              colors={["#dff5e4", BG]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.header}
            >
              <View style={styles.headerTopRow}>
                <Pressable
                  onPress={handleBack}
                  style={styles.backBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Go back"
                >
                  <Ionicons name="arrow-back" size={20} color={colors.gray[700]} />
                </Pressable>

                {wizardStep === "pan" ? (
                  <HeaderSkipLink
                    label={tx("skipPan")}
                    onPress={() => void handleSkipPan()}
                    disabled={uploading}
                  />
                ) : (
                  <View style={styles.headerSkipSpacer} />
                )}
              </View>

              <View style={styles.stepPill}>
                <Ionicons
                  name={wizardStep === "pan" ? "wallet-outline" : "person-outline"}
                  size={14}
                  color={ACCENT_DARK}
                />
                <Text style={styles.stepPillText}>
                  {wizardStep === "pan" ? tx("stepLabelPan") : tx("stepLabelSelfie")}
                </Text>
              </View>

              <Text style={styles.title}>
                {wizardStep === "pan" ? tx("titlePan") : tx("titleSelfie")}
              </Text>
              <Text style={styles.subtitle}>
                {wizardStep === "pan"
                  ? riderStatus?.panVerified
                    ? "PAN already verified — continue to selfie"
                    : tx("subtitlePan")
                  : tx("subtitleSelfie")}
              </Text>
            </LinearGradient>

            <View style={styles.formCard}>
              <StepProgress current={wizardStep} />

              <View style={styles.divider} />

              {wizardStep === "pan" ? (
                <>
                  <View style={styles.checklist}>
                    <ChecklistItem
                      done={panEv.phase === "verified" || panValid}
                      label={
                        panEv.phase === "verified" || riderStatus?.panVerified
                          ? "PAN verified"
                          : "PAN number entered (optional)"
                      }
                    />
                    <ChecklistItem
                      done={
                        panEv.phase === "verified" ||
                        riderStatus?.panVerified === true ||
                        panPhotoValid
                      }
                      label={
                        panEv.phase === "verified" || riderStatus?.panVerified
                          ? "PAN card photo not required"
                          : "PAN card photo added (optional)"
                      }
                    />
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.fieldGroup}>
                    <FieldLabel label={`${tx("panLabel")} (${tx("panOptional")})`} />
                    <View
                      style={[
                        styles.inputWrap,
                        panNumber.length > 0 && !panValid && styles.inputErrorBorder,
                        panAlreadyRegistered ? styles.inputErrorBorder : null,
                        panVerified ? styles.inputSuccessBorder : null,
                      ]}
                    >
                      <Ionicons
                        name="card-outline"
                        size={20}
                        color={
                          panAlreadyRegistered
                            ? colors.error[500]
                            : panVerified
                              ? ACCENT_DARK
                              : panNumber.length > 0 && !panValid
                                ? colors.error[500]
                                : colors.gray[400]
                        }
                        style={styles.inputIcon}
                      />
                      <TextInput
                        value={panNumber}
                        onChangeText={handlePanNumberChange}
                        placeholder={tx("panPlaceholder")}
                        placeholderTextColor={colors.gray[400]}
                        autoCapitalize="characters"
                        maxLength={10}
                        style={styles.panInput}
                      />
                      {panVerified ? (
                        <Ionicons name="checkmark-circle" size={22} color={ACCENT_DARK} />
                      ) : null}
                    </View>
                    {checkingPan ? (
                      <View style={styles.panCheckRow}>
                        <ActivityIndicator size="small" color={ACCENT_DARK} />
                        <Text style={styles.hintText}>Checking PAN…</Text>
                      </View>
                    ) : panAlreadyRegistered ? (
                      <Text style={styles.inlineWarningText}>{tx("alreadyRegistered")}</Text>
                    ) : panNumber.length > 0 ? (
                      <Text style={styles.hintText}>
                        {tx("masked")}: {maskedPan}
                      </Text>
                    ) : null}

                    {/* Number-first electronic verification (auto / hybrid) */}
                    {panElectronic ? (
                      <ElectronicVerifyCard
                        mode={panMode === "auto" ? "auto" : "hybrid"}
                        state={panEv}
                        disabled={!panValid || panAlreadyRegistered || checkingPan}
                        onVerify={() => void runPanElectronicVerify()}
                        verifyLabel="Verify PAN instantly"
                        documentLabel="PAN card"
                      />
                    ) : null}
                  </View>

                  {showPanPhotoBox && panEv.phase !== "verified" ? (
                  <View style={styles.fieldGroup}>
                    <FieldLabel label={`${tx("panPhotoLabel")} (${tx("panOptional")})`} />
                    <Text style={styles.sectionHint}>{tx("panPhotoHint")}</Text>
                    <PanPhotoSlot
                      uri={panPhotoUri}
                      onPress={showPanPhotoOptions}
                      onRemove={() => setPanPhotoUri(null)}
                      disabled={uploading}
                      boxTitle={tx("panBoxTitle")}
                      boxSub={tx("panBoxSub")}
                    />
                    {panPhotoUri ? (
                      <Pressable onPress={showPanPhotoOptions} style={styles.changePhotoLink}>
                        <Ionicons name="refresh-outline" size={14} color={ACCENT_DARK} />
                        <Text style={styles.changePhotoText}>Change photo</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  ) : null}

                  <View style={styles.panActionGroup}>
                    <ContinueButton
                      label={uploading ? tx("uploading") : tx("submitPan")}
                      onPress={() => void handlePanStepContinue()}
                      disabled={!canContinuePan}
                      loading={uploading}
                    />
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.checklist}>
                    <ChecklistItem
                      done={
                        panSkipped ||
                        panEv.phase === "verified" ||
                        riderStatus?.panVerified === true ||
                        (panValid && panPhotoValid)
                      }
                      label={
                        panSkipped
                          ? "PAN skipped (optional)"
                          : panEv.phase === "verified" || riderStatus?.panVerified
                            ? "PAN verified"
                            : "PAN details completed"
                      }
                    />
                    <ChecklistItem done={selfieValid} label="Live selfie captured" />
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.fieldGroup}>
                    <FieldLabel label={tx("selfieLabel")} required />
                    <SelfieAutoCapture
                      uri={selfieUri}
                      active={wizardStep === "selfie"}
                      disabled={uploading || submitting}
                      onCaptured={handleCaptureSelfie}
                      onRejected={(message) => notifyOnboardingToast(message)}
                      onRemove={clearSelfieDraft}
                      hint={tx("selfieHint")}
                      tips={PAN_COPY.selfieTips}
                    />
                  </View>

                  <ContinueButton
                    label={uploading ? tx("uploading") : tx("continue")}
                    onPress={handleContinue}
                    disabled={!canContinueSelfie}
                    loading={submitting || uploading || saveStep.isPending}
                  />
                </>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 20,
    alignItems: "center",
  },
  headerTopRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  headerSkipBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 48,
    alignItems: "flex-end",
  },
  headerSkipBtnDisabled: {
    opacity: 0.4,
  },
  headerSkipText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#dc2626",
  },
  headerSkipSpacer: {
    width: 48,
    height: 40,
  },
  stepPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.85)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(57, 211, 83, 0.25)",
    marginBottom: 12,
  },
  stepPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: ACCENT_DARK,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.gray[900],
    textAlign: "center",
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.gray[600],
    textAlign: "center",
    maxWidth: 320,
  },
  formCard: {
    marginHorizontal: 16,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 20,
    gap: 20,
    borderWidth: 1,
    borderColor: "rgba(57, 211, 83, 0.15)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  stepProgress: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  stepProgressItem: {
    alignItems: "center",
    gap: 6,
    width: 56,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.gray[300],
    backgroundColor: colors.gray[50],
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  stepDotNum: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.gray[500],
  },
  stepDotNumActive: {
    color: "#ffffff",
  },
  stepProgressLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.gray[400],
  },
  stepProgressLabelActive: {
    color: ACCENT_DARK,
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.gray[200],
    marginHorizontal: 8,
    marginBottom: 18,
    maxWidth: 80,
  },
  stepLineActive: {
    backgroundColor: ACCENT,
  },
  checklist: {
    gap: 10,
  },
  checkItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.gray[300],
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.gray[50],
  },
  checkCircleDone: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  checkDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.gray[300],
  },
  checkLabel: {
    fontSize: 13,
    color: colors.gray[500],
    fontWeight: "500",
  },
  checkLabelDone: {
    color: colors.gray[800],
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: colors.gray[100],
    marginVertical: -4,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.gray[700],
    letterSpacing: 0.2,
  },
  requiredMark: {
    color: colors.error[500],
  },
  sectionHint: {
    fontSize: 12,
    color: colors.gray[500],
    lineHeight: 17,
    marginTop: -2,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.gray[50],
    borderWidth: 1.5,
    borderColor: colors.gray[200],
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  inputIcon: {
    marginRight: 10,
  },
  panInput: {
    flex: 1,
    fontSize: 17,
    fontFamily: "Lora_700Bold",
    fontWeight: "700",
    color: colors.gray[900],
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
    letterSpacing: 2,
  },
  inputErrorBorder: {
    borderColor: colors.error[400],
    backgroundColor: colors.error[50],
  },
  inputSuccessBorder: {
    borderColor: ACCENT_DARK,
    backgroundColor: "#f0fdf4",
  },
  panCheckRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 2,
    marginTop: 4,
  },
  inlineWarningText: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.error[600],
    fontWeight: "600",
    marginLeft: 2,
    marginTop: 4,
  },
  hintText: {
    fontSize: 12,
    color: colors.gray[500],
    marginLeft: 2,
  },
  panSlot: {
    gap: 8,
  },
  panDropBox: {
    width: "100%",
    minHeight: 152,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.gray[300],
    borderStyle: "dashed",
    backgroundColor: colors.gray[50],
    overflow: "hidden",
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  panDropBoxFilled: {
    borderStyle: "solid",
    borderColor: ACCENT,
    backgroundColor: "#ffffff",
  },
  panEmptyContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 20,
    width: "100%",
  },
  panEmptyIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#e8fced",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(57, 211, 83, 0.25)",
  },
  panPreview: {
    width: "100%",
    height: 152,
    backgroundColor: colors.gray[100],
  },
  panTapTitle: {
    fontSize: 15,
    color: colors.gray[800],
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 4,
  },
  panTapSub: {
    fontSize: 13,
    color: colors.gray[500],
    textAlign: "center",
    lineHeight: 18,
  },
  changePhotoLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 4,
  },
  changePhotoText: {
    fontSize: 13,
    fontWeight: "600",
    color: ACCENT_DARK,
  },
  slotRemoveBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 14,
    zIndex: 2,
  },
  slotBoxPressed: {
    opacity: 0.92,
    backgroundColor: "#eefbf1",
    borderColor: ACCENT,
  },
  slotActionBtnDisabled: {
    opacity: 0.5,
  },
  selfieSection: {
    alignItems: "center",
    gap: 14,
  },
  selfieRingWrap: {
    position: "relative",
  },
  selfieRing: {
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 2.5,
    borderColor: colors.gray[300],
    borderStyle: "dashed",
    overflow: "hidden",
    backgroundColor: colors.gray[50],
    alignItems: "center",
    justifyContent: "center",
  },
  selfieRingFilled: {
    borderStyle: "solid",
    borderColor: ACCENT,
    backgroundColor: "#ffffff",
  },
  selfiePreview: {
    width: "100%",
    height: "100%",
  },
  selfiePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  selfieRemoveBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 14,
    zIndex: 2,
  },
  selfieCaptureBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: ACCENT_DARK,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    ...Platform.select({
      ios: {
        shadowColor: ACCENT_DARK,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  selfieCaptureBtnPressed: {
    opacity: 0.9,
  },
  selfieCaptureBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },
  tipsCard: {
    width: "100%",
    backgroundColor: "#f0fdf4",
    borderRadius: 12,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(57, 211, 83, 0.2)",
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tipText: {
    flex: 1,
    fontSize: 12,
    color: colors.gray[600],
    lineHeight: 17,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    backgroundColor: colors.error[50],
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.error[200],
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: colors.error[600],
    lineHeight: 18,
  },
  continueBtn: {
    width: "100%",
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 16,
    minHeight: 52,
  },
  continueBtnDisabled: {
    backgroundColor: "#edf8f0",
    borderWidth: 1.5,
    borderColor: "rgba(57, 211, 83, 0.25)",
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  continueBtnTextDisabled: {
    color: "#7cb889",
  },
  panActionGroup: {
    width: "100%",
    alignSelf: "stretch",
    gap: 12,
    marginTop: 4,
  },
});
