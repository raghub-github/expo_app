// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useState, useEffect, useMemo, useCallback } from "react";
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
  useAadhaarRegistrationCheck,
  useVerificationModes,
  useVerifyDocument,
  usePollAadhaarDigilocker,
  useRiderStatus,
} from "@/src/hooks/useOnboarding";
import { useOnboardingEstablishedRedirect } from "@/src/hooks/useOnboardingEstablishedRedirect";
import {
  onboardingStepToRoute,
  resolveFirstIncompleteOnboardingStep,
  shouldForwardFromOnboardingScreen,
  type ServerOnboardingStep,
} from "@/src/lib/onboarding-routes";
import { goBackFromOnboardingEntry } from "@/src/lib/onboarding-navigation";
import { notifyOnboardingToast } from "@/src/lib/rider-onboarding-toast";
import { useSessionStore } from "@/src/stores/sessionStore";
import { uploadToR2, deleteFromR2, buildRiderDocumentKey } from "@/src/services/storage/cloudflareR2";
import { useSaveDocument, useUpdateRiderStage } from "@/src/hooks/useDocuments";
import { ElectronicVerifyCard, type EvState } from "@/src/components/onboarding/ElectronicVerifyCard";
import {
  DigilockerInAppBrowser,
  type DigilockerInAppResult,
} from "@/src/components/onboarding/DigilockerInAppBrowser";
import { colors } from "@/src/theme";
import { riderDigilockerHttpsReturn } from "@/src/lib/digilocker";

let DateTimePicker: React.ComponentType<any> | null = null;
try {
  DateTimePicker = require("@react-native-community/datetimepicker").default;
} catch {
  // Expo Go or env without native datetimepicker
}

const ACCENT = "#39d353";
const ACCENT_DARK = "#22a745";
const BG = "#f4fbf6";
const MIN_RIDER_AGE = 18;

const AADHAAR_COPY = {
  stepLabel: "Step 1 · Aadhaar",
  title: "Aadhaar Verification",
  subtitle: "Verify with DigiLocker, or enter details exactly as on your Aadhaar",
  aadhaarLabel: "Aadhaar Number",
  masked: "Masked",
  nameLabel: "Full Name (as per Aadhaar)",
  namePlaceholder: "Enter your full name",
  dobLabel: "Date of Birth (as per Aadhaar)",
  dobPlaceholder: "Select date of birth",
  dobHint: "You must be at least 18 years old to join as a delivery partner",
  underAgeTitle: "Not eligible — minimum age is 18",
  underAgeMessage:
    "Delivery partners must be 18 years or older. Please check your date of birth or contact support if this is incorrect.",
  ageEligible: "Age verified · {{age}} years old",
  photoLabel: "Aadhaar Photos",
  frontLabel: "Front",
  backLabel: "Back",
  frontHint: "Front side",
  backHint: "Back side",
  continue: "Continue",
  invalidAadhaar: "Please enter a valid 12-digit Aadhaar number",
  alreadyRegistered: "Aadhar Already Registered , Please try with Diff one .",
  invalidName: "Please enter your full name (minimum 3 characters)",
  dobRequired: "Please select your date of birth",
  photoRequired: "Please add both front and back photos of your Aadhaar",
  verifyDigilocker: "Verify with DigiLocker",
  retryDigilocker: "Retry DigiLocker verification",
  verifyRequired: "Please verify your Aadhaar with DigiLocker to continue.",
  digilockerOpenFailed: "Could not open DigiLocker. Please try again.",
  digilockerWaiting: "Complete DigiLocker consent in the app, then continue…",
  digilockerDenied: "DigiLocker consent was denied or expired. Please try again.",
  digilockerCancelled: "DigiLocker was closed before verification finished. You can retry or upload photos.",
  aadhaarRequiredForVerify: "Enter your 12-digit Aadhaar number first",
  photosRequiredForVerify: "Add front and back Aadhaar photos before continuing",
  nameDobRequiredForVerify: "Enter name and date of birth as on Aadhaar",
  riderNotFound: "Rider ID not found. Please try again.",
  notAuthenticated: "Not authenticated. Please login again.",
  uploadError: "Failed to upload. Please try again.",
  captureFailed: "Failed to capture photo. Please try again.",
  uploadFailed: "Failed to pick photo. Please try again.",
  cameraPermissionTitle: "Permission Required",
  cameraPermissionMessage: "Camera permission is required to capture your Aadhaar photo",
  galleryPermissionTitle: "Gallery access needed",
  galleryPermissionMessage: "Allow photo access to upload your Aadhaar image from gallery",
} as const;

type AadhaarSide = "front" | "back";

function formatAadhaar(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 12);
  if (digits.length <= 4) return digits;
  if (digits.length <= 8) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
}

function parseDobString(dob: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const parsed = new Date(`${dob}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function calculateAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age;
}

function isUnderMinimumAge(dob: string): boolean {
  const parsed = parseDobString(dob);
  if (!parsed) return false;
  return calculateAge(parsed) < MIN_RIDER_AGE;
}

function getMaxDobDate(): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setFullYear(d.getFullYear() - MIN_RIDER_AGE);
  return d;
}

function formatDobDisplay(dob: string): string {
  const parsed = parseDobString(dob);
  if (!parsed) return dob;
  return parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Text style={styles.fieldLabel}>
      {label}
      {required ? <Text style={styles.requiredMark}> *</Text> : null}
    </Text>
  );
}

function AadhaarPhotoSlot({
  sideLabel,
  uri,
  onCapture,
  onUpload,
  onRemove,
  onBoxPress,
  disabled,
}: {
  sideLabel: string;
  uri: string | null;
  onCapture: () => void;
  onUpload: () => void;
  onRemove: () => void;
  onBoxPress: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.photoSlot}>
      <Text style={styles.photoSlotLabel} numberOfLines={1}>
        {sideLabel}
      </Text>

      <View style={[styles.slotDropBox, uri ? styles.slotDropBoxFilled : null]}>
        <Pressable
          onPress={onBoxPress}
          disabled={disabled}
          style={({ pressed }) => [
            styles.slotDropBoxInner,
            !uri && styles.slotDropBoxInnerEmpty,
            pressed && !disabled && styles.slotBoxPressed,
            disabled && styles.slotActionBtnDisabled,
          ]}
        >
          {uri ? (
            <Image source={{ uri }} style={styles.slotPreview} resizeMode="cover" />
          ) : (
            <>
              <View style={styles.slotEmptyIcon}>
                <Ionicons name="id-card-outline" size={20} color={colors.gray[400]} />
              </View>
              <Text style={styles.slotTapHint} numberOfLines={1}>
                Tap to upload
              </Text>
            </>
          )}
        </Pressable>

        {uri ? (
          <Pressable onPress={onRemove} style={styles.slotRemoveBtn} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color="#ffffff" />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.slotActions}>
        <Pressable
          onPress={onCapture}
          disabled={disabled}
          style={({ pressed }) => [
            styles.slotActionBtn,
            pressed && styles.slotActionBtnPressed,
            disabled && styles.slotActionBtnDisabled,
          ]}
        >
          <View style={styles.slotActionInner}>
            <Ionicons name="camera-outline" size={14} color={ACCENT_DARK} />
            <Text style={styles.slotActionText} numberOfLines={1}>
              Capture
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={onUpload}
          disabled={disabled}
          style={({ pressed }) => [
            styles.slotActionBtn,
            pressed && styles.slotActionBtnPressed,
            disabled && styles.slotActionBtnDisabled,
          ]}
        >
          <View style={styles.slotActionInner}>
            <Ionicons name="images-outline" size={14} color={ACCENT_DARK} />
            <Text style={styles.slotActionText} numberOfLines={1}>
              Upload
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

export default function AadhaarScreen() {
  const { t } = useTranslation();
  const tx = (key: keyof typeof AADHAAR_COPY, options?: Record<string, unknown>) =>
    t(`onboarding.aadhaar.${key}`, { defaultValue: AADHAAR_COPY[key], ...options });

  const session = useSessionStore((s) => s.session);
  const { data, setData, setStep, hydrate } = useOnboardingStore();
  const saveStep = useSaveOnboardingStep();
  const saveDocument = useSaveDocument();
  const updateStage = useUpdateRiderStage();
  const { data: riderStatus } = useRiderStatus(data.riderId);
  useOnboardingEstablishedRedirect(riderStatus);

  useEffect(() => {
    const next = riderStatus?.nextOnboardingStep as ServerOnboardingStep | undefined;
    const completed = riderStatus?.completedOnboardingSteps ?? [];

    if (shouldForwardFromOnboardingScreen("aadhaar_name", next)) {
      router.replace(onboardingStepToRoute(next));
      return;
    }

    // DigiLocker may mark Aadhaar done while nextStep briefly lags — resume from completed.
    if (completed.includes("aadhaar_name")) {
      const resume = resolveFirstIncompleteOnboardingStep(completed, data.vehicleOnboardingFlow, {
        vehicleChoice: data.vehicleChoice,
        vehicleOnboardingSubmittedFor: data.vehicleOnboardingSubmittedFor,
        bankAccountOnboardingDone: data.bankAccountOnboardingDone,
      });
      if (resume !== "aadhaar_name") {
        router.replace(onboardingStepToRoute(resume));
      }
    }
  }, [
    riderStatus?.nextOnboardingStep,
    riderStatus?.completedOnboardingSteps,
    data.vehicleOnboardingFlow,
    data.vehicleChoice,
    data.vehicleOnboardingSubmittedFor,
    data.bankAccountOnboardingDone,
  ]);

  const [aadhaarNumber, setAadhaarNumber] = useState(data.aadhaarNumber || "");
  const [fullName, setFullName] = useState(data.fullName || "");
  const [dob, setDob] = useState(data.dob || "");
  const [dobDate, setDobDate] = useState<Date | null>(
    data.dob ? parseDobString(data.dob) : null
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [aadhaarFrontUri, setAadhaarFrontUri] = useState<string | null>(
    data.aadhaarFrontPhotoUri || data.aadhaarPhotoUri || null
  );
  const [aadhaarBackUri, setAadhaarBackUri] = useState<string | null>(
    data.aadhaarBackPhotoUri || null
  );
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const aadhaarDigits = aadhaarNumber.replace(/\D/g, "");
  const aadhaarValid = aadhaarDigits.length === 12;
  const aadhaarCheckQuery = useAadhaarRegistrationCheck(aadhaarDigits, data.riderId);
  const aadhaarAlreadyRegistered = aadhaarCheckQuery.data?.registered === true;
  const checkingAadhaar =
    aadhaarValid &&
    (aadhaarCheckQuery.isFetching || aadhaarCheckQuery.isLoading);
  const aadhaarVerified =
    aadhaarValid &&
    !checkingAadhaar &&
    aadhaarCheckQuery.isSuccess &&
    aadhaarCheckQuery.data?.registered === false;

  const underAge = useMemo(() => isUnderMinimumAge(dob), [dob]);
  const maskedAadhaar = (() => {
    const d = aadhaarNumber.replace(/\D/g, "").slice(0, 12);
    if (!d) return "";
    if (d.length === 12) return `XXXX-XXXX-${d.slice(-4)}`;
    if (d.length > 4) return `${"X".repeat(d.length - 4)}${d.slice(-4)}`;
    return "X".repeat(d.length);
  })();
  const nameValid = fullName.trim().length >= 3;
  const dobValid = Boolean(dob) && !underAge;
  const photosValid = Boolean(aadhaarFrontUri && aadhaarBackUri);

  // Policy Center: Cashfree DigiLocker (auto/hybrid) vs classic photo upload (manual).
  const { data: modesData } = useVerificationModes();
  const verifyDocument = useVerifyDocument();
  const pollDigilocker = usePollAadhaarDigilocker();
  const aadhaarMode = (modesData?.modes?.aadhaar_digilocker ??
    modesData?.modes?.aadhaar ??
    "manual") as "manual" | "auto" | "hybrid" | "disabled";
  const aadhaarElectronic = aadhaarMode === "auto" || aadhaarMode === "hybrid";
  const [aadhaarEv, setAadhaarEv] = useState<EvState>({ phase: "idle" });
  const [digilockerSessionUrl, setDigilockerSessionUrl] = useState<string | null>(null);
  const [verifiedFrontKey, setVerifiedFrontKey] = useState<string | null>(null);
  const [verifiedFrontProxy, setVerifiedFrontProxy] = useState<string | null>(null);
  const [verifiedBackKey, setVerifiedBackKey] = useState<string | null>(null);
  const [verifiedBackProxy, setVerifiedBackProxy] = useState<string | null>(null);
  const autoAdvanceAfterVerifyRef = React.useRef(false);

  // Restore DigiLocker success if Aadhaar is already complete on the server (app reopen / remount).
  useEffect(() => {
    const completed = riderStatus?.completedOnboardingSteps ?? [];
    if (!completed.includes("aadhaar_name")) return;
    if (aadhaarEv.phase === "verified" || aadhaarEv.phase === "verifying") return;
    setAadhaarEv({ phase: "verified", details: {} });
  }, [riderStatus?.completedOnboardingSteps, aadhaarEv.phase]);

  const applyVerifiedDetails = useCallback((details: Record<string, unknown>) => {
    const name = String(
      details.name ?? details.holder_name ?? details.registered_name ?? details.full_name ?? ""
    ).trim();
    if (name.length >= 3) setFullName(name);

    const dobRaw = String(details.dob ?? details.date_of_birth ?? "").trim();
    let isoDob: string | null = null;
    const ymd = dobRaw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymd) {
      isoDob = `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
    } else {
      const dmy = dobRaw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
      if (dmy) {
        isoDob = `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
      }
    }
    if (isoDob && parseDobString(isoDob)) {
      setDob(isoDob);
      setDobDate(parseDobString(isoDob));
    }

    const uidDigits = String(
      details.uid ?? details.aadhaar_number ?? details.masked_aadhaar ?? ""
    ).replace(/\D/g, "");
    if (uidDigits.length === 12) setAadhaarNumber(formatAadhaar(uidDigits));
  }, []);

  const digilockerGenRef = React.useRef(0);

  const pollDigilockerUntilDone = useCallback(
    async (
      maxAttempts: number,
      gen?: number
    ): Promise<"verified" | "failed" | "timeout"> => {
      if (!data.riderId) return "failed";
      const sessionGen = gen ?? digilockerGenRef.current;
      for (let i = 0; i < maxAttempts; i++) {
        if (sessionGen !== digilockerGenRef.current) return "timeout";
        try {
          const poll = await pollDigilocker.mutateAsync({ riderId: data.riderId });
          if (sessionGen !== digilockerGenRef.current) return "timeout";
          if (poll.outcome === "verified") {
            const details = poll.verifiedData ?? {};
            applyVerifiedDetails(details);
            setAadhaarEv({ phase: "verified", details });
            return "verified";
          }
          if (poll.outcome === "failed") {
            setAadhaarEv({
              phase: "failed",
              error: poll.error || tx("digilockerDenied"),
            });
            return "failed";
          }
        } catch {
          /* keep polling */
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      return "timeout";
    },
    [applyVerifiedDetails, data.riderId, pollDigilocker, tx]
  );

  const runAadhaarElectronicVerify = useCallback(async () => {
    if (!data.riderId) {
      notifyOnboardingToast(tx("riderNotFound"));
      return;
    }
    if (!session?.accessToken) {
      notifyOnboardingToast(tx("notAuthenticated"));
      return;
    }
    // Optional pre-check when rider already typed a full Aadhaar number.
    if (aadhaarValid && aadhaarAlreadyRegistered) {
      notifyOnboardingToast(tx("alreadyRegistered"));
      return;
    }

    setAadhaarEv({ phase: "verifying" });
    try {
      const redirectUrl = riderDigilockerHttpsReturn();
      const res = await verifyDocument.mutateAsync({
        riderId: data.riderId,
        docKind: "aadhaar",
        aadhaarNumber: aadhaarValid ? aadhaarDigits : undefined,
        redirectUrl,
      });

      if (res.outcome === "manual") {
        setAadhaarEv({ phase: "manual" });
        return;
      }

      if (res.outcome === "verified" && res.verifiedData) {
        applyVerifiedDetails(res.verifiedData);
        setAadhaarEv({ phase: "verified", details: res.verifiedData });
        return;
      }

      if (res.outcome !== "digilocker" || !res.url) {
        setAadhaarEv({
          phase: "failed",
          error: res.error || tx("digilockerOpenFailed"),
        });
        return;
      }

      // Open Cashfree DigiLocker inside the Rider app (Modal WebView) — no Chrome handoff.
      // Poll in parallel so success can land even if the return page is slow.
      const gen = ++digilockerGenRef.current;
      setDigilockerSessionUrl(res.url);
      void pollDigilockerUntilDone(45, gen).then((outcome) => {
        if (outcome === "verified" && gen === digilockerGenRef.current) {
          setDigilockerSessionUrl(null);
        }
      });
    } catch (e) {
      setAadhaarEv({
        phase: "failed",
        error: e instanceof Error ? e.message : tx("digilockerOpenFailed"),
      });
    }
  }, [
    aadhaarAlreadyRegistered,
    aadhaarDigits,
    aadhaarValid,
    applyVerifiedDetails,
    data.riderId,
    pollDigilockerUntilDone,
    session?.accessToken,
    tx,
    verifyDocument,
  ]);

  const handleDigilockerInAppComplete = useCallback(
    async (result: DigilockerInAppResult) => {
      setDigilockerSessionUrl(null);
      const gen = digilockerGenRef.current;

      if (result === "cancelled") {
        // User may have finished OTP before closing — poll a few times, else soft-fail with retry.
        const outcome = await pollDigilockerUntilDone(8, gen);
        if (outcome === "verified") return;
        if (outcome === "timeout" && gen === digilockerGenRef.current) {
          setAadhaarEv({
            phase: "failed",
            error: tx("digilockerCancelled"),
          });
        }
        return;
      }

      if (result === "error") {
        if (gen === digilockerGenRef.current) {
          setAadhaarEv({
            phase: "failed",
            error: tx("digilockerOpenFailed"),
          });
        }
        return;
      }

      // Returned from DigiLocker / HTTPS callback — stay on Aadhaar screen and finish via poll.
      setAadhaarEv({ phase: "verifying" });
      const outcome = await pollDigilockerUntilDone(30, gen);
      if (outcome === "timeout" && gen === digilockerGenRef.current) {
        setAadhaarEv({
          phase: "failed",
          error: tx("digilockerDenied"),
        });
      }
    },
    [pollDigilockerUntilDone, tx]
  );

  /** DigiLocker fills name/DOB; photos only for manual / hybrid fallback. */
  const showPhotoBox =
    aadhaarMode === "manual" ||
    (aadhaarMode === "hybrid" &&
      (aadhaarEv.phase === "failed" || aadhaarEv.phase === "manual"));
  const showNameDobFields =
    aadhaarMode === "manual" ||
    (aadhaarMode === "hybrid" &&
      (aadhaarEv.phase === "failed" || aadhaarEv.phase === "manual"));

  const canContinue = (() => {
    if (submitting || uploading || underAge) {
      return false;
    }
    // DigiLocker auto: Continue only after successful DigiLocker verify.
    if (aadhaarMode === "auto") {
      if (aadhaarEv.phase !== "verified") return false;
      if (aadhaarValid && aadhaarAlreadyRegistered) return false;
      return true;
    }
    // Hybrid: DigiLocker verified, OR classic form after fail/manual.
    if (aadhaarMode === "hybrid") {
      if (aadhaarEv.phase === "verified") {
        return !(aadhaarValid && aadhaarAlreadyRegistered);
      }
      if (aadhaarEv.phase === "failed" || aadhaarEv.phase === "manual") {
        return (
          aadhaarValid &&
          !aadhaarAlreadyRegistered &&
          !checkingAadhaar &&
          nameValid &&
          dobValid &&
          photosValid
        );
      }
      return false;
    }
    // Manual: full classic form (Aadhaar + name + DOB + photos).
    return (
      aadhaarValid &&
      !aadhaarAlreadyRegistered &&
      !checkingAadhaar &&
      nameValid &&
      dobValid &&
      photosValid
    );
  })();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const handleBack = useCallback(() => {
    // Logged-in riders stay in onboarding — never bounce to login / re-OTP.
    goBackFromOnboardingEntry({ previousOnboardingHref: "/(onboarding)/referral" });
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [handleBack]);

  const handleAadhaarChange = (text: string) => {
    setAadhaarNumber(formatAadhaar(text));
    setAadhaarEv({ phase: "idle" });
    setVerifiedFrontKey(null);
    setVerifiedFrontProxy(null);
    setVerifiedBackKey(null);
    setVerifiedBackProxy(null);
  };

  const handleDobChange = (selectedDate: Date) => {
    setDobDate(selectedDate);
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
    const day = String(selectedDate.getDate()).padStart(2, "0");
    setDob(`${year}-${month}-${day}`);
  };

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

  const pickImage = async (source: "camera" | "library", side: AadhaarSide) => {
    if (source === "camera") {
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) return;
    } else {
      const hasPermission = await requestGalleryPermission();
      if (!hasPermission) return;
    }

    try {
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [3, 2],
              quality: 0.5,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [3, 2],
              quality: 0.5,
            });

      if (!result.canceled && result.assets[0]) {
        if (side === "front") {
          setAadhaarFrontUri(result.assets[0].uri);
        } else {
          setAadhaarBackUri(result.assets[0].uri);
        }
      }
    } catch {
      notifyOnboardingToast(source === "camera" ? tx("captureFailed") : tx("uploadFailed"));
    }
  };

  const handleContinue = async () => {
    if (aadhaarElectronic && aadhaarMode === "auto" && aadhaarEv.phase !== "verified") {
      notifyOnboardingToast(tx("verifyRequired"));
      return;
    }

    const electronicOk = aadhaarElectronic && aadhaarEv.phase === "verified";
    const hybridFallback =
      aadhaarElectronic &&
      aadhaarMode === "hybrid" &&
      (aadhaarEv.phase === "failed" || aadhaarEv.phase === "manual");

    if (!electronicOk) {
      if (!aadhaarValid) {
        notifyOnboardingToast(tx("invalidAadhaar"));
        return;
      }
      if (aadhaarAlreadyRegistered) {
        notifyOnboardingToast(tx("alreadyRegistered"));
        return;
      }
      if (!nameValid) {
        notifyOnboardingToast(tx("invalidName"));
        return;
      }
      if (!dob) {
        notifyOnboardingToast(tx("dobRequired"));
        return;
      }
      if (underAge) {
        notifyOnboardingToast(tx("underAgeMessage"));
        return;
      }
      if ((!aadhaarElectronic || hybridFallback) && !photosValid) {
        notifyOnboardingToast(tx("photoRequired"));
        return;
      }
    } else if (underAge) {
      notifyOnboardingToast(tx("underAgeMessage"));
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
    setUploading(true);

    const uploadedKeys: string[] = [];

    try {
      let frontProxyUrl: string | undefined;

      if (!electronicOk && aadhaarFrontUri && aadhaarBackUri) {
        const frontUpload = await uploadToR2(
          aadhaarFrontUri,
          "documents",
          session.accessToken,
          buildRiderDocumentKey(data.riderId, "aadhaar", "front")
        );
        uploadedKeys.push(frontUpload.key);

        const backUpload = await uploadToR2(
          aadhaarBackUri,
          "documents",
          session.accessToken,
          buildRiderDocumentKey(data.riderId, "aadhaar", "back")
        );
        uploadedKeys.push(backUpload.key);
        frontProxyUrl = frontUpload.proxyUrl;

        await saveDocument.mutateAsync({
          riderId: parseInt(data.riderId, 10),
          docType: "aadhaar",
          fileUrl: frontUpload.proxyUrl,
          r2Key: frontUpload.key,
          extractedName: fullName.trim(),
          extractedDob: dob,
          metadata: {
            aadhaarNumber: aadhaarNumber.replace(/\D/g, ""),
            verificationMethod: hybridFallback ? "hybrid_manual_fallback" : "manual",
          },
          files: [
            {
              side: "front",
              fileUrl: frontUpload.proxyUrl,
              r2Key: frontUpload.key,
              mimeType: "image/jpeg",
            },
            {
              side: "back",
              fileUrl: backUpload.proxyUrl,
              r2Key: backUpload.key,
              mimeType: "image/jpeg",
            },
          ],
        });
      } else if (electronicOk) {
        // Persist DigiLocker-verified Aadhaar (no photo upload required).
        const digilockerDetails =
          aadhaarEv.phase === "verified" ? aadhaarEv.details : {};
        const frontKey = verifiedFrontKey || undefined;
        const frontProxy = verifiedFrontProxy || undefined;
        const backKey = verifiedBackKey || undefined;
        const backProxy = verifiedBackProxy || undefined;
        await saveDocument.mutateAsync({
          riderId: parseInt(data.riderId, 10),
          docType: "aadhaar",
          fileUrl: frontProxy || "digilocker_verified",
          r2Key: frontKey,
          extractedName: fullName.trim() || undefined,
          extractedDob: dob || undefined,
          metadata: {
            aadhaarNumber: aadhaarNumber.replace(/\D/g, "") || undefined,
            verificationMethod: "cashfree_digilocker",
            digilockerVerified: true,
            verifiedDetails: digilockerDetails,
          },
          files:
            frontProxy && backProxy
              ? [
                  {
                    side: "front",
                    fileUrl: frontProxy,
                    r2Key: frontKey,
                    mimeType: "image/jpeg",
                  },
                  {
                    side: "back",
                    fileUrl: backProxy,
                    r2Key: backKey,
                    mimeType: "image/jpeg",
                  },
                ]
              : undefined,
        });
        frontProxyUrl = frontProxy || "digilocker_verified";
      }

      const digits = aadhaarNumber.replace(/\D/g, "");
      const resolvedName =
        fullName.trim() ||
        (aadhaarEv.phase === "verified"
          ? String(
              aadhaarEv.details.name ??
                aadhaarEv.details.holder_name ??
                aadhaarEv.details.registered_name ??
                ""
            ).trim()
          : "");
      await saveStep.mutateAsync({
        riderId: data.riderId,
        step: "aadhaar_name",
        data: {
          aadhaarNumber: digits.length === 12 ? digits : undefined,
          fullName: resolvedName || undefined,
          dob: dob || undefined,
          fileUrl: frontProxyUrl || (electronicOk ? "digilocker_verified" : undefined),
          verificationMethod: electronicOk
            ? "cashfree_digilocker"
            : hybridFallback
              ? "hybrid_manual"
              : "manual",
        },
      });

      await updateStage.mutateAsync({
        riderId: parseInt(data.riderId, 10),
        stage: "KYC",
      });

      await setData({
        aadhaarNumber: digits.length === 12 ? digits : data.aadhaarNumber,
        fullName: resolvedName || fullName.trim(),
        dob,
        aadhaarFrontPhotoUri: aadhaarFrontUri || undefined,
        aadhaarBackPhotoUri: aadhaarBackUri || undefined,
        aadhaarFrontPhotoSignedUrl: frontProxyUrl,
        aadhaarBackPhotoSignedUrl: undefined,
        aadhaarPhotoUri: aadhaarFrontUri || undefined,
        aadhaarPhotoSignedUrl: frontProxyUrl,
        currentStep: "aadhaar_name",
      });

      await setStep("pan_selfie");
      router.replace("/(onboarding)/pan-selfie");
    } catch (e) {
      for (const key of uploadedKeys) {
        try {
          await deleteFromR2(key, session.accessToken);
        } catch (rollbackError) {
          console.error(`[Rollback] Failed to delete R2 file ${key}:`, rollbackError);
        }
      }
      const message = e instanceof Error ? e.message : tx("uploadError");
      notifyOnboardingToast(message);
      console.error("[Aadhaar] Continue failed:", e);
      autoAdvanceAfterVerifyRef.current = false;
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  // After DigiLocker succeeds, persist + jump to next incomplete step (no extra Continue tap).
  useEffect(() => {
    if (aadhaarEv.phase !== "verified") return;
    if (autoAdvanceAfterVerifyRef.current || submitting || uploading) return;
    const completed = riderStatus?.completedOnboardingSteps ?? [];
    // Server already advanced — forward effect handles navigation.
    if (completed.includes("aadhaar_name")) return;
    autoAdvanceAfterVerifyRef.current = true;
    void handleContinue();
    // handleContinue closes over latest form/verify state; re-run only when phase flips to verified.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot after DigiLocker
  }, [aadhaarEv.phase]);

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
              <Pressable
                onPress={handleBack}
                style={styles.backBtn}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t("common.back", { defaultValue: "Back" })}
              >
                <Ionicons name="chevron-back" size={22} color={colors.gray[800]} />
              </Pressable>

              <View style={styles.stepPill}>
                <Ionicons name="card-outline" size={14} color={ACCENT_DARK} />
                <Text style={styles.stepPillText}>{tx("stepLabel")}</Text>
              </View>

              <Text style={styles.title}>{tx("title")}</Text>
              <Text style={styles.subtitle}>{tx("subtitle")}</Text>
            </LinearGradient>

            <View style={styles.formCard}>
              <View style={styles.fieldGroup}>
                <FieldLabel label={tx("aadhaarLabel")} required />
                <View
                  style={[
                    styles.inputWrap,
                    aadhaarAlreadyRegistered ? styles.inputErrorBorder : null,
                    aadhaarVerified ? styles.inputSuccessBorder : null,
                  ]}
                >
                  <Ionicons
                    name="finger-print-outline"
                    size={20}
                    color={
                      aadhaarAlreadyRegistered
                        ? colors.error[500]
                        : aadhaarVerified
                          ? ACCENT_DARK
                          : colors.gray[400]
                    }
                    style={styles.inputIcon}
                  />
                  <TextInput
                    value={aadhaarNumber}
                    onChangeText={handleAadhaarChange}
                    placeholder="XXXX-XXXX-1234"
                    placeholderTextColor={colors.gray[400]}
                    keyboardType="number-pad"
                    maxLength={14}
                    style={[styles.inputWithIcon, styles.aadhaarNumberInput]}
                  />
                  {aadhaarVerified ? (
                    <Ionicons name="checkmark-circle" size={22} color={ACCENT_DARK} />
                  ) : null}
                </View>
                {checkingAadhaar ? (
                  <View style={styles.aadhaarCheckRow}>
                    <ActivityIndicator size="small" color={ACCENT_DARK} />
                    <Text style={styles.hintText}>Checking Aadhaar…</Text>
                  </View>
                ) : aadhaarAlreadyRegistered ? (
                  <Text style={styles.inlineWarningText}>{tx("alreadyRegistered")}</Text>
                ) : aadhaarNumber.length > 0 && aadhaarEv.phase !== "verified" ? (
                  <Text style={styles.hintText}>
                    {tx("masked")}: {maskedAadhaar}
                  </Text>
                ) : null}
              </View>

              {showNameDobFields ? (
                <>
                  <View style={styles.fieldGroup}>
                    <FieldLabel label={tx("nameLabel")} required />
                    <View style={styles.inputWrap}>
                      <Ionicons
                        name="person-outline"
                        size={20}
                        color={colors.gray[400]}
                        style={styles.inputIcon}
                      />
                      <TextInput
                        value={fullName}
                        onChangeText={setFullName}
                        placeholder={tx("namePlaceholder")}
                        placeholderTextColor={colors.gray[400]}
                        autoCapitalize="words"
                        style={styles.inputWithIcon}
                      />
                    </View>
                  </View>

                  <View style={styles.fieldGroup}>
                    <FieldLabel label={tx("dobLabel")} required />
                    <Pressable
                      onPress={() => setShowDatePicker(true)}
                      style={[
                        styles.inputWrap,
                        styles.dobPressable,
                        underAge && styles.inputErrorBorder,
                      ]}
                    >
                      <Ionicons
                        name="calendar-outline"
                        size={20}
                        color={underAge ? colors.error[500] : colors.gray[400]}
                        style={styles.inputIcon}
                      />
                      <Text style={[styles.dobText, !dob && styles.dobPlaceholder]}>
                        {dob ? formatDobDisplay(dob) : tx("dobPlaceholder")}
                      </Text>
                      <Ionicons name="chevron-down" size={18} color={colors.gray[400]} />
                    </Pressable>

                    {showDatePicker && DateTimePicker ? (
                      <DateTimePicker
                        value={dobDate || getMaxDobDate()}
                        mode="date"
                        display={Platform.OS === "ios" ? "spinner" : "default"}
                        onChange={(event, selectedDate) => {
                          if (Platform.OS === "android") {
                            setShowDatePicker(false);
                          }
                          if (selectedDate) {
                            handleDobChange(selectedDate);
                          }
                          if (Platform.OS === "android" && event.type === "dismissed") {
                            setShowDatePicker(false);
                          }
                        }}
                        maximumDate={new Date()}
                        minimumDate={
                          new Date(new Date().setFullYear(new Date().getFullYear() - 100))
                        }
                      />
                    ) : null}

                    {showDatePicker && !DateTimePicker ? (
                      <TextInput
                        placeholder="YYYY-MM-DD"
                        value={dob}
                        onChangeText={setDob}
                        style={[styles.fallbackDobInput, underAge && styles.inputErrorBorder]}
                      />
                    ) : null}

                    {Platform.OS === "ios" && showDatePicker && DateTimePicker ? (
                      <TouchableOpacity
                        onPress={() => setShowDatePicker(false)}
                        style={styles.dateDoneBtn}
                      >
                        <Text style={styles.dateDoneBtnText}>
                          {t("common.done", { defaultValue: "Done" })}
                        </Text>
                      </TouchableOpacity>
                    ) : null}

                    {underAge ? (
                      <View style={styles.underAgeBanner}>
                        <View style={styles.underAgeIconWrap}>
                          <Ionicons name="alert-circle" size={20} color={colors.error[600]} />
                        </View>
                        <View style={styles.underAgeCopy}>
                          <Text style={styles.underAgeTitle}>{tx("underAgeTitle")}</Text>
                          <Text style={styles.underAgeMessage}>{tx("underAgeMessage")}</Text>
                        </View>
                      </View>
                    ) : dob ? (
                      <View style={styles.ageOkRow}>
                        <Ionicons name="checkmark-circle" size={15} color={ACCENT_DARK} />
                        <Text style={styles.ageOkText}>
                          {tx("ageEligible", { age: calculateAge(parseDobString(dob)!) })}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.hintText}>{tx("dobHint")}</Text>
                    )}
                  </View>
                </>
              ) : null}

              {aadhaarElectronic ? (
                <View style={styles.fieldGroup}>
                  <ElectronicVerifyCard
                    mode={aadhaarMode === "auto" ? "auto" : "hybrid"}
                    state={aadhaarEv}
                    disabled={
                      !data.riderId ||
                      (aadhaarValid && aadhaarAlreadyRegistered) ||
                      checkingAadhaar ||
                      uploading ||
                      submitting ||
                      Boolean(digilockerSessionUrl)
                    }
                    onVerify={() => void runAadhaarElectronicVerify()}
                    verifyLabel={tx("verifyDigilocker")}
                    retryLabel={tx("retryDigilocker")}
                  />
                </View>
              ) : null}

              {showPhotoBox ? (
              <View style={styles.fieldGroup}>
                <FieldLabel label={tx("photoLabel")} required />
                <View style={styles.photoRow}>
                  <AadhaarPhotoSlot
                    sideLabel={tx("frontLabel")}
                    uri={aadhaarFrontUri}
                    onCapture={() => pickImage("camera", "front")}
                    onUpload={() => pickImage("library", "front")}
                    onBoxPress={() => pickImage("library", "front")}
                    onRemove={() => setAadhaarFrontUri(null)}
                    disabled={uploading}
                  />
                  <AadhaarPhotoSlot
                    sideLabel={tx("backLabel")}
                    uri={aadhaarBackUri}
                    onCapture={() => pickImage("camera", "back")}
                    onUpload={() => pickImage("library", "back")}
                    onBoxPress={() => pickImage("library", "back")}
                    onRemove={() => setAadhaarBackUri(null)}
                    disabled={uploading}
                  />
                </View>
              </View>
              ) : null}

              <ContinueButton
                label={tx("continue")}
                onPress={handleContinue}
                disabled={!canContinue}
                loading={submitting}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <DigilockerInAppBrowser
        visible={Boolean(digilockerSessionUrl)}
        url={digilockerSessionUrl}
        subtitle={tx("digilockerWaiting")}
        onComplete={(result) => {
          void handleDigilockerInAppComplete(result);
        }}
      />
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
    paddingBottom: 28,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 20,
    alignItems: "center",
  },
  backBtn: {
    alignSelf: "flex-start",
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
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
  inputWithIcon: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Lora_700Bold",
    fontWeight: "700",
    color: colors.gray[900],
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
    letterSpacing: 0.5,
  },
  aadhaarNumberInput: {
    fontFamily: "Lora_700Bold",
    fontWeight: "700",
    fontSize: 17,
    letterSpacing: 1,
  },
  inputErrorBorder: {
    borderColor: colors.error[400],
    backgroundColor: colors.error[50],
  },
  inputSuccessBorder: {
    borderColor: ACCENT_DARK,
    backgroundColor: "#f0fdf4",
  },
  hintText: {
    fontSize: 12,
    color: colors.gray[500],
    marginLeft: 2,
  },
  aadhaarCheckRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 2,
  },
  inlineWarningText: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.error[600],
    fontWeight: "600",
    marginLeft: 2,
  },
  dobPressable: {
    justifyContent: "space-between",
  },
  dobText: {
    flex: 1,
    fontSize: 16,
    color: colors.gray[900],
    fontFamily: "Lora_700Bold",
    fontWeight: "700",
  },
  dobPlaceholder: {
    color: colors.gray[400],
    fontWeight: "400",
  },
  fallbackDobInput: {
    backgroundColor: colors.gray[50],
    borderWidth: 1.5,
    borderColor: colors.gray[200],
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: "Lora_700Bold",
    fontWeight: "700",
    color: colors.gray[900],
    marginTop: 8,
  },
  dateDoneBtn: {
    alignSelf: "flex-end",
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: ACCENT,
    borderRadius: 10,
  },
  dateDoneBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  underAgeBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 4,
    padding: 12,
    backgroundColor: colors.error[50],
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.error[200],
  },
  underAgeIconWrap: {
    marginTop: 1,
  },
  underAgeCopy: {
    flex: 1,
    gap: 4,
  },
  underAgeTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.error[700],
  },
  underAgeMessage: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.error[600],
  },
  ageOkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  ageOkText: {
    fontSize: 12,
    color: ACCENT_DARK,
    fontWeight: "600",
  },
  photoRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  photoSlot: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
  },
  photoSlotLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.gray[700],
    marginBottom: 6,
  },
  slotDropBox: {
    width: "100%",
    height: 84,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.gray[300],
    borderStyle: "dashed",
    backgroundColor: colors.gray[50],
    overflow: "hidden",
    position: "relative",
  },
  slotDropBoxFilled: {
    borderStyle: "solid",
    borderColor: ACCENT,
    backgroundColor: "#ffffff",
  },
  slotDropBoxInner: {
    width: "100%",
    height: 84,
  },
  slotDropBoxInnerEmpty: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  slotEmptyIcon: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  slotPreview: {
    width: "100%",
    height: 84,
    backgroundColor: colors.gray[100],
  },
  slotRemoveBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 12,
    zIndex: 2,
  },
  slotBoxPressed: {
    opacity: 0.92,
    backgroundColor: "#eefbf1",
  },
  slotTapHint: {
    fontSize: 10,
    lineHeight: 14,
    color: ACCENT_DARK,
    fontWeight: "700",
    textAlign: "center",
    ...(Platform.OS === "android" ? { includeFontPadding: false } : null),
  },
  slotActions: {
    flexDirection: "row",
    gap: 5,
    width: "100%",
    marginTop: 6,
  },
  slotActionBtn: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 8,
    backgroundColor: "#e8fced",
    borderWidth: 1,
    borderColor: "rgba(57, 211, 83, 0.35)",
  },
  slotActionInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  slotActionBtnPressed: {
    opacity: 0.85,
  },
  slotActionBtnDisabled: {
    opacity: 0.5,
  },
  slotActionText: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: "700",
    color: ACCENT_DARK,
    ...(Platform.OS === "android" ? { includeFontPadding: false } : null),
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 4,
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
});
