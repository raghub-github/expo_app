// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Platform,
  Image,
  Alert,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  BackHandler,
  Modal,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
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
import { PanNameMismatchSheet } from "@/src/components/onboarding/PanNameMismatchSheet";
import { HeaderSkipLink } from "@/src/components/onboarding/OnboardingFormUi";
import {
  panAadhaarNamesMatch,
  pickPanHolderName,
} from "@/src/lib/pan-aadhaar-name-match";
import { openOnboardingIssueSupportTicket } from "@/src/lib/rider-support-navigation";
import { useOnboardingEstablishedRedirect } from "@/src/hooks/useOnboardingEstablishedRedirect";
import { resolveRiderSelfieDisplayUrl, toAbsoluteImageUrl, withImageCacheBust } from "@/src/utils/mediaUrl";
import { notifyOnboardingToast } from "@/src/lib/rider-onboarding-toast";
import { useSessionStore } from "@/src/stores/sessionStore";
import {
  uploadToR2,
  deleteFromR2,
  buildRiderDocumentKey,
  buildRiderSelfieKey,
} from "@/src/services/storage/cloudflareR2";
import { useSaveDocument, useUpdateRiderStage } from "@/src/hooks/useDocuments";
import { LiveSelfieCameraModal } from "@/src/components/onboarding/LiveSelfieCameraModal";
import { setOnboardingBackOverride } from "@/src/lib/onboarding-back-override";
import { colors } from "@/src/theme";

const ACCENT = "#39d353";
const ACCENT_DARK = "#22a745";
const BG = "#f4fbf6";

function isLocalSelfieUri(uri: string) {
  return (
    uri.startsWith("file:") ||
    uri.startsWith("content:") ||
    uri.startsWith("ph:") ||
    uri.startsWith("assets-library:")
  );
}

/** Camera temp files often vanish when CameraView unmounts — copy into app cache. */
async function persistLocalSelfieCapture(uri: string): Promise<string> {
  if (Platform.OS === "web" || !isLocalSelfieUri(uri)) return uri;
  try {
    const FS = await import("expo-file-system/legacy");
    const dir = FS.cacheDirectory || FS.documentDirectory;
    if (!dir) return uri;
    const dest = `${dir}onboarding-selfie-${Date.now()}.jpg`;
    await FS.copyAsync({ from: uri, to: dest });
    const info = await FS.getInfoAsync(dest);
    if (!info.exists || (typeof info.size === "number" && info.size < 32)) {
      throw new Error("copied selfie missing");
    }
    return dest;
  } catch {
    // Last resort: keep original URI (may die after camera unmount).
    return uri;
  }
}

const SELFIE_PREVIEW_W = Math.min(Dimensions.get("window").width - 40, 360);
const SELFIE_PREVIEW_H = Math.round(SELFIE_PREVIEW_W * 1.22);

function extractR2KeyFromProxyOrUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  try {
    if (t.includes("key=")) {
      const q = t.includes("://")
        ? new URL(t).searchParams.get("key")
        : new URL(t, "https://local.invalid").searchParams.get("key");
      if (q?.trim()) return decodeURIComponent(q.trim());
    }
  } catch {
    /* ignore */
  }
  if (t.startsWith("riders/") && !t.includes("://")) return t;
  return null;
}

const PAN_COPY = {
  stepLabelPan: "Step 2 · PAN (1 of 2)",
  stepLabelSelfie: "Step 2 · Selfie (2 of 2)",
  titlePan: "PAN Card Details",
  titleSelfie: "Live Selfie",
  subtitlePan: "Enter and verify your PAN — it must match your Aadhaar name",
  panOptional: "Required",
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
  adminSkipNote: "PAN verification skipped by admin approval",
  uploading: "Uploading…",
  cancel: "Cancel",
  invalidPan: "Enter a valid PAN (e.g. ABCDE1234F)",
  alreadyRegistered: "PAN Already Registered , Please try with Diff one .",
  panPhotoRequired: "Please add a photo of your PAN card",
  nameMismatch: "PAN name must match your Aadhaar name before you can continue.",
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
  icon = "arrow-forward",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
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
        <ActivityIndicator color="#ffffff" />
      ) : (
        <>
          <Text style={[styles.continueBtnText, inactive && styles.continueBtnTextDisabled]}>
            {label}
          </Text>
          <Ionicons name={icon} size={18} color="#ffffff" />
        </>
      )}
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
        <Text
          style={[styles.stepProgressLabel, current === "pan" && styles.stepProgressLabelActive]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          PAN
        </Text>
      </View>

      <View style={[styles.stepLine, current === "selfie" && styles.stepLineActive]} />

      <View style={styles.stepProgressItem}>
        <View style={[styles.stepDot, current === "selfie" && styles.stepDotActive]}>
          <Text style={[styles.stepDotNum, current === "selfie" && styles.stepDotNumActive]}>2</Text>
        </View>
        <Text
          style={[styles.stepProgressLabel, current === "selfie" && styles.stepProgressLabelActive]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
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
  const params = useLocalSearchParams<{ step?: string | string[] }>();
  const stepParam = Array.isArray(params.step) ? params.step[0] : params.step;
  const openOnSelfieStep = stepParam === "selfie";
  const saveStep = useSaveOnboardingStep();
  const saveDocument = useSaveDocument();
  const updateStage = useUpdateRiderStage();
  const { data: riderStatus } = useRiderStatus(data.riderId, {
    // Admin may enable/disable PAN skip while the rider is on this screen.
    refetchInterval: 5_000,
  });
  useOnboardingEstablishedRedirect(riderStatus);

  const [panNumber, setPanNumber] = useState(data.panNumber || "");
  const [panPhotoUri, setPanPhotoUri] = useState<string | null>(data.panPhotoUri || null);
  const [selfieUri, setSelfieUri] = useState<string | null>(
    data.selfieUri || data.selfieSignedUrl || null
  );
  /** When true, do not re-hydrate selfie from server/store after user hits X / re-capture. */
  const selfieClearedByUserRef = useRef(false);
  /** Fresh local capture must upload on Continue (even if a prior signed URL exists). */
  const selfieNeedsUploadRef = useRef(false);
  /** Fresh camera capture should show immediately even if an older server selfie exists. */
  const [preferLocalSelfie, setPreferLocalSelfie] = useState(
    Boolean(data.selfieUri && isLocalSelfieUri(data.selfieUri))
  );
  const [wizardStep, setWizardStep] = useState<"pan" | "selfie">(
    openOnSelfieStep ? "selfie" : "pan"
  );
  const [panSkipped, setPanSkipped] = useState(false);
  /** Selfie step: gate screen first; camera UI only after "Capture selfie". */
  const [selfieCaptureOpen, setSelfieCaptureOpen] = useState(false);
  const [selfieViewerOpen, setSelfieViewerOpen] = useState(false);
  /** Bumps Image remount so a fresh capture never shows a stale bitmap. */
  const [selfiePreviewEpoch, setSelfiePreviewEpoch] = useState(0);
  const [mismatchOpen, setMismatchOpen] = useState(false);
  const [mismatchPanName, setMismatchPanName] = useState("");
  const [mismatchAadhaarName, setMismatchAadhaarName] = useState("");
  const adminPanSkip = Boolean(riderStatus?.panSkipOverride);
  const [panPhotoSignedUrl, setPanPhotoSignedUrl] = useState<string | null>(
    data.panPhotoSignedUrl || null
  );
  const [selfieSignedUrl, setSelfieSignedUrl] = useState<string | null>(
    data.selfieSignedUrl || null
  );
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // ── Electronic verification (Policy Center mode for rider PAN) ───────────
  // Declared before derived flags that read panEv.phase (avoids TDZ crash).
  const [panEv, setPanEv] = useState<EvState>({ phase: "idle" });
  /** After auto-verify fails (invalid / name mismatch), lock verify+photo until PAN number changes. */
  const [verifyBlockedForPan, setVerifyBlockedForPan] = useState<string | null>(null);

  const panValid = isValidPan(panNumber);
  const panCheckQuery = usePanRegistrationCheck(panNumber, data.riderId);
  const panAlreadyRegistered = panCheckQuery.data?.registered === true;
  const checkingPan =
    panValid && (panCheckQuery.isFetching || panCheckQuery.isLoading);
  const panNumberAvailable =
    panValid &&
    !checkingPan &&
    panCheckQuery.isSuccess &&
    panCheckQuery.data?.registered === false;
  /** Server-side Cashfree/manual PAN verify — never treat admin skip as verified. */
  const serverPanVerified = riderStatus?.panVerified === true;
  const panElectronicallyDone = panEv.phase === "verified" || serverPanVerified;
  const selfiePreviewUri = preferLocalSelfie
    ? selfieUri && isLocalSelfieUri(selfieUri)
      ? selfieUri
      : selfieUri
        ? toAbsoluteImageUrl(selfieUri) ?? selfieUri
        : null
    : withImageCacheBust(
        resolveRiderSelfieDisplayUrl({
          serverSelfieUrl: riderStatus?.selfieUrl,
          onboardingSignedUrl: selfieSignedUrl,
          onboardingLocalUri: selfieUri,
          allowLocalFile: true,
        }),
        selfiePreviewEpoch || selfieSignedUrl || riderStatus?.selfieUrl
      );
  const selfieValid = Boolean(selfiePreviewUri);
  const panPhotoValid = Boolean(panPhotoUri || panPhotoSignedUrl);

  //   manual → classic photo flow; auto → number-only, failure blocks;
  //   hybrid → number-only, failure reveals the photo upload as fallback.
  const { data: modesData } = useVerificationModes();
  const verifyDocument = useVerifyDocument();
  const panMode = (modesData?.modes?.["pan"] ?? "manual") as "manual" | "auto" | "hybrid" | "disabled";
  const panElectronic = panMode === "auto" || panMode === "hybrid";
  // Only clear electronic-verify state when the rider edits the PAN (not on server hydrate).
  const handlePanNumberChange = (text: string) => {
    const next = formatPan(text);
    setPanNumber(next);
    setPanEv({ phase: "idle" });
    if (
      verifyBlockedForPan &&
      next.toUpperCase() !== verifyBlockedForPan.toUpperCase()
    ) {
      setVerifyBlockedForPan(null);
    }
    // Editing the number invalidates any prior verification.
    if (data.panVerified) void setData({ panVerified: false });
  };

  const lockPanActionsAfterFail = (pan: string) => {
    // Block instant re-verify of the same failed number, but keep manual photo upload available.
    setVerifyBlockedForPan(pan.toUpperCase());
  };

  const panActionsLocked =
    Boolean(verifyBlockedForPan) &&
    panNumber.toUpperCase() === verifyBlockedForPan!.toUpperCase();

  const runPanElectronicVerify = async () => {
    if (!data.riderId) return;
    if (panActionsLocked) return;
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
        const panName = pickPanHolderName(res.verifiedData ?? {});
        const aadhaarName = String(data.fullName || "").trim();
        if (
          !adminPanSkip &&
          panName &&
          aadhaarName &&
          !panAadhaarNamesMatch(panName, aadhaarName)
        ) {
          setPanEv({
            phase: "mismatch",
            error: "Authorized name should match the name on your Aadhaar.",
            reasons: ["name_mismatch"],
          });
          setMismatchPanName(panName);
          setMismatchAadhaarName(aadhaarName);
          setMismatchOpen(true);
          lockPanActionsAfterFail(panNumber);
          void setData({ panVerified: false, panNumber: panNumber.toUpperCase(), panSkipped: false });
          return;
        }
        setVerifyBlockedForPan(null);
        // Persist a DURABLE verified flag + number so a re-render / re-mount cannot lose the
        // ephemeral panEv state and bounce the rider back to the PAN step (the reported loop),
        // and so the PAN number is carried into saveStep → the control dashboard.
        void setData({ panVerified: true, panNumber: panNumber.toUpperCase(), panSkipped: false });
      } else if (res.outcome === "mismatch") {
        const panName = pickPanHolderName(res.verifiedData ?? {});
        const aadhaarName = String(data.fullName || "").trim();
        if (panName || aadhaarName) {
          setMismatchPanName(panName || "—");
          setMismatchAadhaarName(aadhaarName || "—");
          setMismatchOpen(true);
        }
        setPanEv({
          phase: "mismatch",
          error:
            (res.mismatchMessages && res.mismatchMessages.length
              ? res.mismatchMessages.join(". ")
              : null) ||
            res.error ||
            res.reason ||
            "Authorized name should match the name on your Aadhaar.",
          reasons: res.mismatchReasons,
        });
        lockPanActionsAfterFail(panNumber);
      } else if (res.outcome === "manual") {
        setPanEv({ phase: "manual" });
        setVerifyBlockedForPan(null);
      } else {
        const failReason =
          res.error ||
          res.reason ||
          (typeof res.status === "string" ? `Verification status: ${res.status}` : null) ||
          "PAN could not be verified. Please check the number and try again.";
        setPanEv({ phase: "failed", error: failReason });
        lockPanActionsAfterFail(panNumber);
      }
    } catch (e) {
      const msg =
        e instanceof Error && e.message
          ? e.message
          : "Verification failed due to a network or server error. Please try again.";
      setPanEv({ phase: "failed", error: msg });
      lockPanActionsAfterFail(panNumber);
    }
  };

  /** Photo needed? Manual mode, hybrid fallback, or after auto-verify failure. */
  const panPhotoRequiredNow =
    !panElectronic ||
    panEv.phase === "manual" ||
    panEv.phase === "failed" ||
    panEv.phase === "mismatch";
  const showPanPhotoBox = panPhotoRequiredNow || Boolean(panPhotoUri);

  const canContinuePan =
    adminPanSkip ||
    (panValid &&
      !panAlreadyRegistered &&
      !checkingPan &&
      !uploading &&
      !panActionsLocked &&
      panEv.phase !== "mismatch" &&
      (panElectronicallyDone
        ? true
        : panElectronic
          ? panEv.phase === "verified" ||
            (panEv.phase === "manual" && panPhotoValid)
          : panPhotoValid));
  const canContinueSelfie =
    selfieValid && !submitting && !uploading;

  const maskedPan = useMemo(() => {
    if (panNumber.length === 0) return "";
    if (panNumber.length <= 5) return panNumber;
    return `XXXXX${panNumber.slice(5)}`;
  }, [panNumber]);

  // Mismatch cannot open selfie — stay on PAN until verified Continue / admin skip.
  useEffect(() => {
    if (wizardStep !== "selfie") return;
    if (adminPanSkip || panSkipped) return;
    if (panEv.phase === "mismatch" || panActionsLocked) {
      setWizardStep("pan");
      setSelfieCaptureOpen(false);
    }
  }, [wizardStep, adminPanSkip, panSkipped, panEv.phase, panActionsLocked]);

  // Vehicle/category Back → pan-selfie?step=selfie
  useEffect(() => {
    if (!openOnSelfieStep) return;
    if (panEv.phase === "mismatch" || panActionsLocked) return;
    setWizardStep("selfie");
  }, [openOnSelfieStep, panEv.phase, panActionsLocked]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // If admin turns PAN skip off while the rider already skipped, force back to PAN.
  useEffect(() => {
    if (adminPanSkip) return;
    if (!panSkipped) return;
    setPanSkipped(false);
    setWizardStep("pan");
    setSelfieCaptureOpen(false);
    void setData({ panSkipped: false });
  }, [adminPanSkip, panSkipped, setData]);

  // Admin skip: clear local mismatch lock so selfie is never blocked by prior fail.
  useEffect(() => {
    if (!adminPanSkip) return;
    if (panEv.phase === "mismatch" || panActionsLocked) {
      setPanEv({ phase: "idle" });
      setVerifyBlockedForPan(null);
      setMismatchOpen(false);
    }
  }, [adminPanSkip, panEv.phase, panActionsLocked]);

  useEffect(() => {
    // Hydrate PAN / selfie data only. Do NOT auto-jump wizardStep to "selfie"
    // when a selfie already exists — after Back → Continue the rider must walk
    // PAN → Selfie one Continue at a time (handlePanStepContinue advances).
    // Exception: deep-link `?step=selfie` from vehicle/category back.
    const serverPan = String(riderStatus?.panNumber || "")
      .replace(/[^A-Z0-9]/gi, "")
      .toUpperCase();
    const serverPanOk = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(serverPan);

    if (serverPanOk && !isValidPan(panNumber)) {
      setPanNumber(serverPan);
      void setData({ panNumber: serverPan, panSkipped: false });
    }
    if (
      serverPanVerified &&
      serverPanOk &&
      isValidPan(panNumber) &&
      panNumber.replace(/[^A-Z0-9]/gi, "").toUpperCase() === serverPan
    ) {
      if (panEv.phase !== "verified" && panEv.phase !== "verifying") {
        const serverDetails =
          riderStatus?.panVerifiedData &&
          typeof riderStatus.panVerifiedData === "object"
            ? { ...riderStatus.panVerifiedData }
            : {};
        const details: Record<string, unknown> = {
          pan: serverPan,
          pan_status: "VALID",
          ...serverDetails,
        };
        const name = String(
          details.registered_name ||
            details.name ||
            riderStatus?.name ||
            data.fullName ||
            ""
        ).trim();
        if (name) details.registered_name = name;
        setPanEv({ phase: "verified", details });
      }
      setPanSkipped(false);
    }

    if (selfieClearedByUserRef.current) {
      return;
    }
    if (preferLocalSelfie && selfieUri) {
      return;
    }
    // Load server/store selfie for preview without changing wizard step.
    if (riderStatus?.selfieUrl) {
      setPreferLocalSelfie(false);
      if (selfieSignedUrl !== riderStatus.selfieUrl) {
        setSelfieSignedUrl(riderStatus.selfieUrl);
        void setData({ selfieSignedUrl: riderStatus.selfieUrl });
      }
      if (!selfieUri || isLocalSelfieUri(selfieUri)) {
        setSelfieUri(riderStatus.selfieUrl);
      }
    } else if (data.selfieSignedUrl) {
      setPreferLocalSelfie(false);
      if (!selfieSignedUrl) setSelfieSignedUrl(data.selfieSignedUrl);
      if (!selfieUri || isLocalSelfieUri(selfieUri)) setSelfieUri(data.selfieSignedUrl);
    } else if (data.selfieUri) {
      if (!selfieUri) setSelfieUri(data.selfieUri);
    }
  }, [
    riderStatus?.selfieUrl,
    riderStatus?.panNumber,
    riderStatus?.panVerified,
    riderStatus?.panVerifiedData,
    riderStatus?.name,
    data.selfieSignedUrl,
    data.selfieUri,
    data.panNumber,
    data.fullName,
    selfieSignedUrl,
    selfieUri,
    preferLocalSelfie,
    panNumber,
    panEv.phase,
    serverPanVerified,
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
        quality: 0.5,
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
        quality: 0.5,
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
    selfieNeedsUploadRef.current = true;
    // Persist while caller still holds the camera file open when possible.
    const durableUri = await persistLocalSelfieCapture(capturedUri);
    setPreferLocalSelfie(true);
    setSelfieUri(durableUri);
    setSelfieSignedUrl(null);
    setSelfiePreviewEpoch((n) => n + 1);
    setSelfieViewerOpen(false);
    await setData({
      selfieUri: durableUri,
      selfieSignedUrl: undefined,
    });
  };

  const clearSelfieDraft = () => {
    selfieClearedByUserRef.current = true;
    selfieNeedsUploadRef.current = true;
    // Stay in local mode so server selfie URL is not shown again until a new capture.
    setPreferLocalSelfie(true);
    setSelfieUri(null);
    setSelfieSignedUrl(null);
    setSelfieViewerOpen(false);
    setSelfiePreviewEpoch((n) => n + 1);
    void setData({ selfieUri: undefined, selfieSignedUrl: undefined });
  };

  const handleRetakeSelfie = () => {
    clearSelfieDraft();
    setSelfieCaptureOpen(true);
  };

  const showPanPhotoOptions = () => {
    if (panActionsLocked) {
      notifyOnboardingToast("Enter a different PAN number before uploading a photo.");
      return;
    }
    Alert.alert(tx("panPhotoPickerTitle"), tx("panPhotoPickerMessage"), [
      { text: tx("capture"), onPress: () => void handleCapturePanPhoto() },
      { text: tx("upload"), onPress: () => void handlePickPanPhoto() },
      { text: tx("cancel"), style: "cancel" },
    ]);
  };

  const handleSkipPan = async () => {
    // PAN skip is admin-only (backend pan_skip_override). No in-app Skip control.
    if (!adminPanSkip) return;
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

  const assertPanNameMatchesAadhaar = (): boolean => {
    if (adminPanSkip) return true;
    const aadhaarName = String(data.fullName || "").trim();
    const panName = pickPanHolderName(
      panEv.phase === "verified"
        ? panEv.details
        : (riderStatus?.panVerifiedData as Record<string, unknown> | null) ?? undefined,
    );
    // If Cashfree returned a holder name, it must match Aadhaar.
    if (panName && aadhaarName && !panAadhaarNamesMatch(panName, aadhaarName)) {
      setMismatchPanName(panName);
      setMismatchAadhaarName(aadhaarName);
      setMismatchOpen(true);
      return false;
    }
    return true;
  };

  const handlePanStepContinue = async () => {
    if (adminPanSkip && !panValid) {
      await handleSkipPan();
      return;
    }
    if (panEv.phase === "mismatch" || panActionsLocked) {
      notifyOnboardingToast(
        "PAN name must match Aadhaar. Enter a different PAN number and verify again before selfie."
      );
      return;
    }
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
      !serverPanVerified
    ) {
      notifyOnboardingToast(tx("panPhotoRequired"));
      return;
    }
    if (
      panElectronic &&
      panMode === "auto" &&
      panEv.phase !== "verified" &&
      !serverPanVerified
    ) {
      notifyOnboardingToast("Please verify your PAN electronically to continue.");
      return;
    }
    if (!assertPanNameMatchesAadhaar()) {
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
          extractedName:
            panEv.phase === "verified"
              ? pickPanHolderName(panEv.details) || undefined
              : undefined,
          metadata: {
            panNumber: panNumber.toUpperCase(),
            ...(panElectronicallyDone || panEv.phase === "verified"
              ? {
                  verificationMethod: "cashfree_pan",
                  panVerified: true,
                  verifiedDetails:
                    panEv.phase === "verified" ? panEv.details : {},
                }
              : {}),
          },
          files: documentFileEntry(panUploadResult),
        });

        uploadedProxyUrl = panUploadResult.proxyUrl;
        setPanPhotoSignedUrl(panUploadResult.proxyUrl);
      } else if (
        panElectronicallyDone ||
        panEv.phase === "verified" ||
        data.panVerified === true
      ) {
        // Persist electronic PAN only on Continue — verify-document defers DB projection.
        const verifiedDetails =
          panEv.phase === "verified" ? panEv.details : {};
        await saveDocument.mutateAsync({
          riderId,
          docType: "pan",
          fileUrl: "cashfree_pan_verified",
          extractedName: pickPanHolderName(verifiedDetails) || undefined,
          metadata: {
            panNumber: panNumber.toUpperCase(),
            verificationMethod: "cashfree_pan",
            panVerified: true,
            verifiedDetails,
          },
        });
      } else {
        // Manual number-only fallback: still persist PAN number on Submit.
        await saveDocument.mutateAsync({
          riderId,
          docType: "pan",
          fileUrl: "pan_number_submitted",
          metadata: {
            panNumber: panNumber.toUpperCase(),
            verificationMethod: "manual_number",
          },
        });
      }

      setPanSkipped(false);
      await setData({
        panNumber: panNumber.toUpperCase(),
        panPhotoUri: panPhotoUri ?? undefined,
        panPhotoSignedUrl: uploadedProxyUrl ?? undefined,
        panSkipped: false,
        panVerified: true, // durable: PAN step complete (photo uploaded or electronically verified)
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
      if (selfieCaptureOpen) {
        setSelfieCaptureOpen(false);
        return;
      }
      setWizardStep("pan");
      return;
    }
    // Always land on Aadhaar so the rider can review/edit — do not rely on
    // stack history (onboarding uses replace for most hops).
    router.replace("/(onboarding)/aadhaar");
  }, [wizardStep, selfieCaptureOpen]);

  useEffect(() => {
    setOnboardingBackOverride(() => {
      if (wizardStep === "selfie") {
        if (selfieCaptureOpen) {
          setSelfieCaptureOpen(false);
          return true;
        }
        setWizardStep("pan");
        return true;
      }
      return false;
    });
    return () => setOnboardingBackOverride(null);
  }, [wizardStep, selfieCaptureOpen]);

  useEffect(() => {
    if (wizardStep !== "selfie") {
      setSelfieCaptureOpen(false);
    }
  }, [wizardStep]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [handleBack]);

  const handleContinue = async () => {
    if (!selfiePreviewUri) {
      notifyOnboardingToast(tx("selfieRequired"));
      return;
    }
    // Admin PAN skip must never block selfie Continue.
    const panReady =
      adminPanSkip ||
      panSkipped ||
      data.panVerified === true ||
      panEv.phase === "verified" ||
      riderStatus?.panVerified === true ||
      (panValid && (Boolean(panPhotoUri) || Boolean(panPhotoSignedUrl)));
    if (!panReady) {
      setWizardStep("pan");
      setSelfieCaptureOpen(false);
      notifyOnboardingToast(tx("panPhotoRequired"));
      return;
    }
    // Mismatch: force back to PAN — selfie is not allowed until PAN Continue succeeds.
    if (
      !adminPanSkip &&
      !panSkipped &&
      (panEv.phase === "mismatch" || panActionsLocked)
    ) {
      setWizardStep("pan");
      setSelfieCaptureOpen(false);
      notifyOnboardingToast(
        "PAN name must match Aadhaar. Fix PAN, then continue to selfie."
      );
      return;
    }
    if (!adminPanSkip && !panSkipped && !assertPanNameMatchesAadhaar()) {
      setWizardStep("pan");
      setSelfieCaptureOpen(false);
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
    const previousSelfieKey =
      extractR2KeyFromProxyOrUrl(selfieSignedUrl) ||
      extractR2KeyFromProxyOrUrl(riderStatus?.selfieUrl) ||
      extractR2KeyFromProxyOrUrl(data.selfieSignedUrl);

    try {
      const riderId = parseInt(data.riderId, 10);
      let remoteSelfieUrl = selfieSignedUrl;

      // Upload selfie only when Continue is pressed (never on capture / retake alone).
      const localCaptureUri =
        selfieUri && isLocalSelfieUri(selfieUri) ? selfieUri : null;
      const mustUpload =
        selfieNeedsUploadRef.current ||
        Boolean(localCaptureUri) ||
        !remoteSelfieUrl;

      if (mustUpload) {
        const uploadSource = localCaptureUri;
        if (!uploadSource) {
          notifyOnboardingToast(tx("selfieRequired"));
          setSubmitting(false);
          return;
        }
        const selfieUploadResult = await uploadToR2(
          uploadSource,
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
          autoVerify: true,
        });

        remoteSelfieUrl = selfieUploadResult.proxyUrl;
        setSelfieSignedUrl(remoteSelfieUrl);
        setPreferLocalSelfie(false);
        selfieNeedsUploadRef.current = false;

        // Remove previous R2 object when key changed (versioned selfie keys).
        if (previousSelfieKey && previousSelfieKey !== selfieUploadResult.key) {
          try {
            await deleteFromR2(previousSelfieKey, session.accessToken);
          } catch (deleteError) {
            console.error(
              `[Selfie] Failed to delete old R2 selfie ${previousSelfieKey}:`,
              deleteError
            );
          }
        }
      }

      if (!remoteSelfieUrl) {
        notifyOnboardingToast(tx("selfieRequired"));
        setSubmitting(false);
        return;
      }

      const hasPanNumber =
        panValid ||
        data.panVerified === true || // durable flag → the number always reaches the dashboard
        panEv.phase === "verified" ||
        riderStatus?.panVerified === true;

      await saveStep.mutateAsync({
        riderId: data.riderId,
        step: "pan_selfie",
        data: {
          ...(hasPanNumber && panNumber
            ? { panNumber: panNumber.toUpperCase() }
            : {}),
          selfieSignedUrl: remoteSelfieUrl,
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
        selfieUri: undefined,
        selfieSignedUrl: remoteSelfieUrl,
        // Fresh Step 3: never carry stale category/vehicle into DL/RC auto-skip.
        vehicleCategoryCode: undefined,
        vehicleChoice: undefined,
        vehicleModelLabel: undefined,
        vehicleOnboardingFlow: undefined,
        vehicleOnboardingSubmittedFor: undefined,
        vehicleDocsStarted: undefined,
      });

      await setStep("dl_rc");
      router.replace("/(onboarding)/dl-rc");
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
        <View style={styles.flex}>
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
                <View style={styles.headerSkipSpacer} />
                {wizardStep === "pan" && adminPanSkip ? (
                  <HeaderSkipLink
                    label="Skip"
                    onPress={() => void handleSkipPan()}
                    disabled={uploading || submitting}
                  />
                ) : (
                  <View style={styles.headerSkipSpacer} />
                )}
              </View>

              {adminPanSkip ? (
                <Text style={styles.adminSkipNote}>{tx("adminSkipNote")}</Text>
              ) : null}

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
                  ? adminPanSkip
                    ? "Admin skip enabled — continue without PAN, or verify if you have one"
                    : serverPanVerified
                      ? "PAN already verified — continue to selfie"
                      : tx("subtitlePan")
                  : tx("subtitleSelfie")}
              </Text>
            </LinearGradient>

            {wizardStep === "selfie" ? (
              selfieValid ? (
                <View style={styles.selfieGateWrap}>
                  <Pressable
                    onPress={() => setSelfieViewerOpen(true)}
                    style={styles.selfiePreviewCard}
                    accessibilityRole="imagebutton"
                    accessibilityLabel="View selfie full screen"
                  >
                    <Image
                      key={`selfie-preview-${selfiePreviewEpoch}`}
                      source={{ uri: selfiePreviewUri! }}
                      style={styles.selfiePreviewRect}
                      resizeMode="cover"
                      onError={() => {
                        if (preferLocalSelfie) {
                          notifyOnboardingToast(
                            "Selfie preview failed — please retake your selfie."
                          );
                          clearSelfieDraft();
                        }
                      }}
                    />
                    <View style={styles.selfiePreviewHint}>
                      <Ionicons name="expand-outline" size={14} color="#fff" />
                      <Text style={styles.selfiePreviewHintText}>Tap to view</Text>
                    </View>
                  </Pressable>
                  <ContinueButton
                    label={tx("retakeSelfie")}
                    onPress={handleRetakeSelfie}
                    disabled={uploading || submitting}
                    icon="refresh"
                  />
                  <ContinueButton
                    label={uploading ? tx("uploading") : tx("continue")}
                    onPress={handleContinue}
                    disabled={!canContinueSelfie}
                    loading={submitting || uploading || saveStep.isPending}
                    icon="arrow-forward"
                  />
                </View>
              ) : (
                <View style={styles.selfieGateWrap}>
                  <Pressable
                    onPress={() => setSelfieCaptureOpen(true)}
                    style={({ pressed }) => [
                      styles.selfieGateBtn,
                      pressed && styles.selfieGateBtnPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Capture selfie"
                  >
                    <Ionicons name="camera-outline" size={22} color="#fff" />
                    <Text style={styles.selfieGateBtnText}>Capture selfie</Text>
                  </Pressable>
                </View>
              )
            ) : (
            <View style={styles.formCard}>
              <StepProgress current={wizardStep} />

              <View style={styles.divider} />

              <>
                  <View style={styles.checklist}>
                    <ChecklistItem
                      done={panElectronicallyDone || panValid}
                      label={
                        panElectronicallyDone
                          ? "PAN verified"
                          : adminPanSkip
                            ? "PAN optional (admin skip)"
                            : "PAN number entered"
                      }
                    />
                    <ChecklistItem
                      done={
                        panElectronicallyDone ||
                        adminPanSkip ||
                        panPhotoValid
                      }
                      label={
                        panElectronicallyDone
                          ? "PAN card photo not required"
                          : adminPanSkip
                            ? "Photo optional (admin skip)"
                            : "PAN card photo added"
                      }
                    />
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.fieldGroup}>
                    <FieldLabel label={tx("panLabel")} required />
                    <View
                      style={[
                        styles.inputWrap,
                        panNumber.length > 0 && !panValid && styles.inputErrorBorder,
                        panAlreadyRegistered ? styles.inputErrorBorder : null,
                        panNumberAvailable ? styles.inputSuccessBorder : null,
                      ]}
                    >
                      <Ionicons
                        name="card-outline"
                        size={20}
                        color={
                          panAlreadyRegistered
                            ? colors.error[500]
                            : panNumberAvailable
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
                      {panNumberAvailable ? (
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
                        disabled={
                          panEv.phase === "verified" ||
                          !panValid ||
                          panAlreadyRegistered ||
                          checkingPan ||
                          panActionsLocked
                        }
                        onVerify={() => void runPanElectronicVerify()}
                        onUploadManually={() => {
                          setPanEv({ phase: "manual" });
                          setVerifyBlockedForPan(null);
                        }}
                        allowManualUpload
                        verifyLabel="Verify PAN instantly"
                        retryLabel="Verify again"
                        documentLabel="PAN card"
                        verifiedTitle="PAN is Valid"
                      />
                    ) : null}
                    {panActionsLocked ? (
                      <Text style={styles.inlineWarningText}>
                        Enter a different PAN number to try Verify instantly again.
                      </Text>
                    ) : null}
                  </View>

                  {showPanPhotoBox && panEv.phase !== "verified" ? (
                  <View style={styles.fieldGroup}>
                    <FieldLabel label={tx("panPhotoLabel")} required={panPhotoRequiredNow && !adminPanSkip} />
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
            </View>
            )}
          </ScrollView>
        </View>
      </SafeAreaView>
      <LiveSelfieCameraModal
        visible={wizardStep === "selfie" && selfieCaptureOpen && !selfieValid}
        disabled={uploading || submitting}
        onClose={() => setSelfieCaptureOpen(false)}
        onCaptured={handleCaptureSelfie}
        onRejected={(message) => notifyOnboardingToast(message)}
      />
      <Modal
        visible={selfieViewerOpen && Boolean(selfiePreviewUri)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelfieViewerOpen(false)}
      >
        <View style={styles.selfieViewerRoot}>
          <Pressable
            style={styles.selfieViewerBackdrop}
            onPress={() => setSelfieViewerOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close selfie viewer"
          />
          <View style={styles.selfieViewerCard}>
            <View style={styles.selfieViewerHeader}>
              <Text style={styles.selfieViewerTitle}>{tx("selfieLabel")}</Text>
              <Pressable
                onPress={() => setSelfieViewerOpen(false)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={24} color="#0f172a" />
              </Pressable>
            </View>
            {selfiePreviewUri ? (
              <Image
                key={`selfie-viewer-${selfiePreviewEpoch}`}
                source={{ uri: selfiePreviewUri }}
                style={styles.selfieViewerImage}
                resizeMode="contain"
              />
            ) : null}
          </View>
        </View>
      </Modal>
      <PanNameMismatchSheet
        visible={mismatchOpen}
        panName={mismatchPanName}
        aadhaarName={mismatchAadhaarName}
        onClose={() => setMismatchOpen(false)}
        onContactSupport={() => {
          setMismatchOpen(false);
          openOnboardingIssueSupportTicket();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignSelf: "stretch",
    backgroundColor: BG,
  },
  safeArea: {
    flex: 1,
    alignSelf: "stretch",
    backgroundColor: BG,
  },
  flex: {
    flex: 1,
    alignSelf: "stretch",
    minWidth: 0,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
    backgroundColor: BG,
  },
  header: {
    alignSelf: "stretch",
    paddingHorizontal: 20,
    paddingTop: 80,
    paddingBottom: 32,
    alignItems: "center",
    minHeight: 210,
  },
  headerTopRow: {
    width: "100%",
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginBottom: 8,
    minHeight: 36,
  },
  adminSkipNote: {
    alignSelf: "stretch",
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
    color: "#047857",
    backgroundColor: "#ECFDF5",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
    overflow: "hidden",
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
    flexShrink: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.gray[900],
    textAlign: "center",
    marginBottom: 6,
    letterSpacing: -0.3,
    alignSelf: "stretch",
    paddingHorizontal: 4,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.gray[600],
    textAlign: "center",
    alignSelf: "stretch",
    maxWidth: "100%",
    paddingHorizontal: 4,
  },
  formCard: {
    alignSelf: "stretch",
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
    alignSelf: "stretch",
    paddingVertical: 4,
  },
  stepProgressItem: {
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 0,
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
    textAlign: "center",
    maxWidth: "100%",
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
  selfieGateWrap: {
    alignSelf: "stretch",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 16,
  },
  selfiePreviewCard: {
    alignSelf: "center",
    width: SELFIE_PREVIEW_W,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: ACCENT,
    backgroundColor: "#e2e8f0",
    marginBottom: 4,
  },
  selfiePreviewRect: {
    width: "100%",
    height: SELFIE_PREVIEW_H,
    backgroundColor: "#e2e8f0",
  },
  selfiePreviewHint: {
    position: "absolute",
    right: 10,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  selfiePreviewHintText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "600",
  },
  selfieViewerRoot: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  selfieViewerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.72)",
  },
  selfieViewerCard: {
    borderRadius: 18,
    backgroundColor: "#ffffff",
    overflow: "hidden",
    maxHeight: "88%",
  },
  selfieViewerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  selfieViewerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
  selfieViewerImage: {
    width: "100%",
    height: Math.min(Dimensions.get("window").height * 0.7, 520),
    backgroundColor: "#0f172a",
  },
  selfieGateBtn: {
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
  selfieGateBtnPressed: {
    opacity: 0.9,
  },
  selfieGateBtnText: {
    fontSize: 16,
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
    backgroundColor: "#16a34a",
    borderWidth: 0,
    opacity: 0.45,
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  continueBtnTextDisabled: {
    color: "#ffffff",
  },
  panActionGroup: {
    width: "100%",
    alignSelf: "stretch",
    gap: 12,
    marginTop: 4,
  },
});
