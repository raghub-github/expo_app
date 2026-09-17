// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Alert,
  Pressable,
  BackHandler,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useSaveOnboardingStep, useRiderStatus } from "@/src/hooks/useOnboarding";
import { useOnboardingEstablishedRedirect } from "@/src/hooks/useOnboardingEstablishedRedirect";
import { useSaveDocument } from "@/src/hooks/useDocuments";
import { useOnboardingVehicleTypes } from "@/src/hooks/useOnboardingVehicleTypes";
import { useOnboardingDocumentTypes } from "@/src/hooks/useOnboardingDocumentTypes";
import { useSessionStore } from "@/src/stores/sessionStore";
import {
  uploadToR2,
  deleteFromR2,
  buildRiderDocumentKey,
  guessUploadMimeFromUri,
} from "@/src/services/storage/cloudflareR2";
import { DocumentPhotoSlot } from "@/src/components/onboarding/DocumentPhotoSlot";
import { OnboardingPickerModal } from "@/src/components/onboarding/OnboardingPickerModal";
import {
  isLocalMediaUri,
  resolveOnboardingPhotoDisplayUrl,
} from "@/src/utils/mediaUrl";
import {
  ContinueButton,
  FieldLabel,
  StepProgress,
  OnboardingStickyFooter,
  onboardingFormStyles as form,
  onboardingHeaderPaddingTop,
  onboardingStickyScrollPadding,
} from "@/src/components/onboarding/OnboardingFormUi";
import { goBackOrReplace } from "@/src/lib/onboarding-navigation";
import {
  onboardingContinueHref,
  parseOnboardingWalkParam,
} from "@/src/lib/onboarding-walk-through";
import { setOnboardingBackOverride } from "@/src/lib/onboarding-back-override";
import { notifyOnboardingToast } from "@/src/lib/rider-onboarding-toast";
import {
  onboardingStepToRoute,
  type ServerOnboardingStep,
} from "@/src/lib/onboarding-routes";
import {
  docUploadToStorePatch,
  getDocUploadState,
  resolveDocIcon,
  resolveVehicleOnboardingDocs,
  mergeVehicleOnboardingDocSteps,
  vehicleOnboardingWizardStepNumber,
  isDocStepComplete,
  areAllVehicleDocStepsSatisfied,
  type VehicleOnboardingDocStep,
} from "@/src/lib/onboarding-document-types";
import { findVehicleType } from "@/src/lib/onboarding-vehicle-types";
import { colors } from "@/src/theme";

const ACCENT_DARK = "#22a745";
const BG = "#f4fbf6";
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const COPY = {
  stepLabel: "Step 3 · Vehicle proof",
  titleRental: "Rental agreement",
  titleEv: "EV proof",
  subtitle: "Upload a clear photo or PDF (max 5 MB)",
  photoLabel: "Document file",
  boxSub: "Photo or PDF · up to 5 MB",
  speedLabel: "Maximum speed (km/h)",
  speedPlaceholder: "e.g. 60",
  speedHint: "Declare the top speed of your rental or EV vehicle",
  pickerTitle: "Add document",
  pickerMessage: "Photo or PDF (max 5 MB)",
  capture: "Capture photo",
  upload: "Upload from gallery",
  uploadPdf: "Upload PDF",
  cancel: "Cancel",
  continue: "Continue",
  continueToEv: "Continue to EV proof",
  uploading: "Uploading…",
  changeFile: "Change file",
  photoRequired: "Please add a photo or PDF of this document",
  speedRequired: "Please enter a valid maximum speed",
  fileTooLarge: "File must be 5 MB or smaller",
  pdfUnavailable: "PDF picker unavailable. Please upload a photo instead.",
  riderNotFound: "Rider ID not found. Please try again.",
  notAuthenticated: "Not authenticated. Please login again.",
  uploadError: "Failed to upload. Please try again.",
  captureFailed: "Failed to capture photo. Please try again.",
  uploadFailed: "Failed to pick file. Please try again.",
  cameraPermissionTitle: "Permission Required",
  cameraPermissionMessage: "Camera permission is required to capture document photos",
} as const;

type PickedFile = {
  uri: string;
  mimeType: string;
  ext: string;
};

function documentFileEntry(
  upload: { proxyUrl: string; key: string },
  mimeType: string
) {
  return [
    {
      side: "single" as const,
      fileUrl: upload.proxyUrl,
      r2Key: upload.key,
      mimeType,
    },
  ];
}

async function assertFileWithinLimit(uri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && typeof info.size === "number" && info.size > MAX_FILE_BYTES) {
      return false;
    }
  } catch {
    // If size is unknown, still allow — server enforces its own limit.
  }
  return true;
}

export default function RentalEvScreen() {
  const { t } = useTranslation();
  const tx = (key: keyof typeof COPY) =>
    t(`onboarding.rentalEv.${key}`, { defaultValue: COPY[key] });
  const insets = useSafeAreaInsets();
  const headerTopPad = onboardingHeaderPaddingTop(insets.top);
  const walkParams = useLocalSearchParams<{ walk?: string | string[]; doc?: string | string[] }>();
  const walkThrough = parseOnboardingWalkParam(walkParams.walk);
  const forcedDocParam = useMemo(() => {
    const raw = Array.isArray(walkParams.doc) ? walkParams.doc[0] : walkParams.doc;
    return String(raw || "").trim() || null;
  }, [walkParams.doc]);

  const session = useSessionStore((s) => s.session);
  const { data, setData, hydrate } = useOnboardingStore();
  const saveStep = useSaveOnboardingStep();
  const saveDocument = useSaveDocument();
  const { data: riderStatus } = useRiderStatus(data.riderId);
  useOnboardingEstablishedRedirect(riderStatus);
  const { data: vehicleTypes = [] } = useOnboardingVehicleTypes();
  const { data: documentCatalog = [] } = useOnboardingDocumentTypes();

  const selectedVehicleType = useMemo(
    () => findVehicleType(vehicleTypes, data.vehicleChoice),
    [vehicleTypes, data.vehicleChoice]
  );

  const requiredDocs = useMemo(
    () =>
      resolveVehicleOnboardingDocs(selectedVehicleType, documentCatalog, {
        captureGroup: "rental_ev",
      }),
    [selectedVehicleType, documentCatalog]
  );

  const requiresMaxSpeed = Boolean(selectedVehicleType?.documentRequirements?.requires_max_speed);

  const [wizardDocCode, setWizardDocCode] = useState<string | null>(null);
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [maxSpeedDeclaration, setMaxSpeedDeclaration] = useState<string>(
    data.maxSpeedDeclaration?.toString() || ""
  );
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [removingFile, setRemovingFile] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const submittingRef = useRef(false);
  /** After X remove — block store/server restore until a new file is picked. */
  const fileRemovedIntentionallyRef = useRef(false);

  const currentDoc = useMemo(
    () => requiredDocs.find((d) => d.code === wizardDocCode) ?? requiredDocs[0] ?? null,
    [requiredDocs, wizardDocCode]
  );

  const currentDocIndex = useMemo(() => {
    if (!currentDoc) return 0;
    const idx = requiredDocs.findIndex((d) => d.code === currentDoc.code);
    return Math.max(0, idx);
  }, [requiredDocs, currentDoc]);

  const isLastDoc = currentDocIndex >= Math.max(requiredDocs.length - 1, 0);
  const stepLabels = useMemo(() => requiredDocs.map((d) => d.label), [requiredDocs]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Sequential wizard: seed once from ?doc= or store cursor.
  // Never keep re-forcing ?doc=rental_proof after Continue advances to EV proof.
  useEffect(() => {
    if (!requiredDocs.length) return;

    const cursor = data.vehicleDocWizardCode?.trim();
    if (cursor && requiredDocs.some((d) => d.code === cursor)) {
      setWizardDocCode((prev) => (prev === cursor ? prev : cursor));
      return;
    }

    const forced =
      forcedDocParam && requiredDocs.some((d) => d.code === forcedDocParam)
        ? forcedDocParam
        : null;
    if (forced) {
      setWizardDocCode(forced);
      void setData({ vehicleDocWizardCode: forced });
      return;
    }

    const first = requiredDocs[0]!.code;
    setWizardDocCode((prev) => {
      if (prev && requiredDocs.some((d) => d.code === prev)) return prev;
      return first;
    });
    void setData({ vehicleDocWizardCode: first });
  }, [requiredDocs, forcedDocParam, data.vehicleDocWizardCode, setData]);

  // Restore rental/EV signed URLs + max speed from server after Back from bank.
  useEffect(() => {
    if (!riderStatus) return;
    const patch: Record<string, unknown> = {};
    const serverRental = String(riderStatus.rentalProofUrl || "").trim();
    const serverEv = String(riderStatus.evProofUrl || "").trim();
    if (
      serverRental &&
      (!data.rentalProofSignedUrl || isLocalMediaUri(data.rentalProofSignedUrl))
    ) {
      patch.rentalProofSignedUrl = serverRental;
      patch.rentalProofUri = undefined;
    }
    if (serverEv && (!data.evProofSignedUrl || isLocalMediaUri(data.evProofSignedUrl))) {
      patch.evProofSignedUrl = serverEv;
      patch.evProofUri = undefined;
    }
    const serverSpeed = riderStatus.maxSpeedDeclaration;
    if (
      serverSpeed != null &&
      Number.isFinite(Number(serverSpeed)) &&
      data.maxSpeedDeclaration == null
    ) {
      patch.maxSpeedDeclaration = Number(serverSpeed);
    }
    if (Object.keys(patch).length) {
      void setData(patch as Parameters<typeof setData>[0]);
    }
    if (
      serverSpeed != null &&
      Number.isFinite(Number(serverSpeed)) &&
      !maxSpeedDeclaration.trim()
    ) {
      setMaxSpeedDeclaration(String(serverSpeed));
    }
  }, [
    riderStatus?.rentalProofUrl,
    riderStatus?.evProofUrl,
    riderStatus?.maxSpeedDeclaration,
    data.rentalProofSignedUrl,
    data.evProofSignedUrl,
    data.maxSpeedDeclaration,
    maxSpeedDeclaration,
    setData,
  ]);

  useEffect(() => {
    // Switching rental ↔ EV step — allow hydrate for the newly focused doc.
    fileRemovedIntentionallyRef.current = false;
  }, [currentDoc?.code]);

  useEffect(() => {
    if (!currentDoc) return;
    if (fileRemovedIntentionallyRef.current) {
      setPicked(null);
      return;
    }
    const state = getDocUploadState(data, currentDoc.code);
    const serverRemote =
      currentDoc.code === "rental_proof"
        ? riderStatus?.rentalProofUrl
        : currentDoc.code === "ev_proof"
          ? riderStatus?.evProofUrl
          : null;
    // Prefer remote/proxy after upload — local file:// white-boxes after Back.
    const display = resolveOnboardingPhotoDisplayUrl({
      remotes: [state.signedUrl, serverRemote],
      localUri: state.localUri,
    });
    if (!display) {
      // Keep an in-progress camera/gallery pick that is not in the store yet.
      setPicked((prev) => {
        if (prev?.uri && isLocalMediaUri(prev.uri)) return prev;
        return null;
      });
      return;
    }
    const guessed = guessUploadMimeFromUri(display);
    setPicked({ uri: display, mimeType: guessed.mimeType, ext: guessed.ext });
  }, [
    currentDoc?.code,
    data.rentalProofUri,
    data.rentalProofSignedUrl,
    data.evProofUri,
    data.evProofSignedUrl,
    data.documentUploads,
    riderStatus?.rentalProofUrl,
    riderStatus?.evProofUrl,
  ]);

  const rentalGateOnceRef = useRef<string | null>(null);
  useEffect(() => {
    if (walkThrough) return;
    if (submittingRef.current || uploading || submitting) return;
    const next = riderStatus?.nextOnboardingStep;
    const flow = data.vehicleOnboardingFlow;
    let target: `/(onboarding)/${string}` | null = null;

    // Never auto-jump forward to bank/payment when docs are already done —
    // that skipped sequential Continue (1→2→3) after header Back. Cold start
    // resume uses resolveOnboardingHref and won't open this screen if complete.
    if (flow === "rental_ev") {
      if (next === "aadhaar_name" || next === "pan_selfie") {
        return;
      }
    } else if (flow === "payment" || flow === "dl_rc") {
      target = "/(onboarding)/dl-rc";
    } else if (next === "aadhaar_name" || next === "pan_selfie") {
      target = onboardingStepToRoute(next as ServerOnboardingStep);
    }

    if (!target) return;
    if (rentalGateOnceRef.current === target) return;
    rentalGateOnceRef.current = target;
    router.replace(target);
  }, [
    riderStatus?.nextOnboardingStep,
    data.vehicleOnboardingFlow,
    uploading,
    submitting,
    walkThrough,
  ]);

  useEffect(() => {
    const goPrev = () => {
      if (currentDocIndex > 0) {
        const prev = requiredDocs[currentDocIndex - 1];
        if (prev) {
          setWizardDocCode(prev.code);
          void setData({ vehicleDocWizardCode: prev.code });
        }
        return;
      }
      // Land on vehicle picker — walk=1 prevents auto-bounce back to rental-ev.
      goBackOrReplace(
        "/(onboarding)/dl-rc?walk=1&step=last_doc"
      );
    };

    setOnboardingBackOverride(() => {
      goPrev();
      return true;
    });
    return () => setOnboardingBackOverride(null);
  }, [currentDocIndex, requiredDocs, setData]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (currentDocIndex > 0) {
        const prev = requiredDocs[currentDocIndex - 1];
        if (prev) {
          setWizardDocCode(prev.code);
          void setData({ vehicleDocWizardCode: prev.code });
        }
        return true;
      }
      goBackOrReplace(
        "/(onboarding)/dl-rc?walk=1&step=last_doc"
      );
      return true;
    });
    return () => sub.remove();
  }, [currentDocIndex, requiredDocs, setData]);

  const speedValid =
    !requiresMaxSpeed ||
    !isLastDoc ||
    (maxSpeedDeclaration.trim().length > 0 && !Number.isNaN(Number(maxSpeedDeclaration)));
  const docAlreadyComplete = currentDoc
    ? isDocStepComplete(data, currentDoc)
    : false;
  const photoValid = Boolean(picked?.uri) || docAlreadyComplete;
  const canContinue = photoValid && speedValid && !uploading && !submitting && !removingFile;

  const extractR2Key = (raw: string | null | undefined): string | null => {
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
  };

  const clearCurrentFile = async () => {
    if (!currentDoc || removingFile) return;
    setRemovingFile(true);
    try {
      const state = getDocUploadState(data, currentDoc.code);
      const keyCandidates = [
        extractR2Key(picked?.uri),
        extractR2Key(state.signedUrl),
        extractR2Key(state.localUri),
        data.riderId
          ? buildRiderDocumentKey(
              parseInt(data.riderId, 10),
              currentDoc.code,
              "single",
              picked?.ext || "jpg",
            )
          : null,
        data.riderId
          ? buildRiderDocumentKey(parseInt(data.riderId, 10), currentDoc.code, "single", "pdf")
          : null,
      ].filter((k): k is string => Boolean(k && String(k).trim()));

      const uniqueKeys = [...new Set(keyCandidates.map((k) => k.trim()))].filter(
        (k) => k && k !== "attachments/proxy" && !k.endsWith("/attachments/proxy"),
      );

      fileRemovedIntentionallyRef.current = true;
      setPicked(null);
      const clearPatch = docUploadToStorePatch(data, currentDoc.code, {
        localUri: null,
        signedUrl: null,
      });
      await setData(clearPatch);

      if (session?.accessToken) {
        for (const key of uniqueKeys) {
          try {
            await deleteFromR2(key, session.accessToken);
          } catch (err) {
            console.warn("[rental-ev] R2 delete failed", key, err);
          }
        }
      }

      if (session?.accessToken && data.riderId) {
        const riderId = parseInt(data.riderId, 10);
        if (Number.isFinite(riderId) && riderId > 0) {
          try {
            await saveDocument.mutateAsync({
              riderId,
              docType: currentDoc.code,
              fileUrl: "pending",
              metadata: {
                verificationMethod: "manual_upload",
                requiresManualReview: true,
                photoRemovedAt: new Date().toISOString(),
              },
              files: [
                {
                  side: "single",
                  fileUrl: "pending",
                  mimeType: "image/jpeg",
                },
              ],
            });
          } catch (err) {
            console.warn("[rental-ev] DB clear after remove failed", err);
          }
        }
      }
    } finally {
      setRemovingFile(false);
    }
  };

  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(tx("cameraPermissionTitle"), tx("cameraPermissionMessage"));
      return false;
    }
    return true;
  };

  const applyPickedUri = async (uri: string, mimeHint?: string | null) => {
    const okSize = await assertFileWithinLimit(uri);
    if (!okSize) {
      notifyOnboardingToast(tx("fileTooLarge"));
      return;
    }
    fileRemovedIntentionallyRef.current = false;
    const guessed = guessUploadMimeFromUri(uri, mimeHint);
    if (guessed.ext === "pdf") {
      setPicked({ uri, mimeType: guessed.mimeType, ext: guessed.ext });
      return;
    }
    const { persistLocalOnboardingPhoto } = await import(
      "@/src/lib/persistLocalOnboardingPhoto"
    );
    const persisted = await persistLocalOnboardingPhoto(uri, "rental");
    setPicked({ uri: persisted, mimeType: guessed.mimeType, ext: guessed.ext });
  };

  const pickPhoto = async (source: "camera" | "library") => {
    if (source === "camera") {
      const ok = await requestCameraPermission();
      if (!ok) return;
    }
    try {
      // Avoid allowsEditing on Android — known crash source with some gallery URIs.
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ["images"],
              allowsEditing: false,
              quality: 0.85,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              allowsEditing: false,
              quality: 0.85,
            });
      if (!result.canceled && result.assets[0]) {
        await applyPickedUri(result.assets[0].uri, result.assets[0].mimeType);
      }
    } catch {
      notifyOnboardingToast(source === "camera" ? tx("captureFailed") : tx("uploadFailed"));
    }
  };

  const pickPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const asset = result.assets[0];
      if (typeof asset.size === "number" && asset.size > MAX_FILE_BYTES) {
        notifyOnboardingToast(tx("fileTooLarge"));
        return;
      }
      await applyPickedUri(asset.uri, asset.mimeType ?? "application/pdf");
    } catch {
      notifyOnboardingToast(tx("pdfUnavailable"));
    }
  };

  const showFileOptions = () => {
    setPickerOpen(true);
  };

  const uploadCurrentDoc = async (
    doc: VehicleOnboardingDocStep,
    file: PickedFile
  ): Promise<{ proxyUrl: string; key: string; mimeType: string }> => {
    if (!data.riderId || !session?.accessToken) {
      throw new Error(tx("notAuthenticated"));
    }
    const riderId = parseInt(data.riderId, 10);
    const uploadResult = await uploadToR2(
      file.uri,
      "documents",
      session.accessToken,
      buildRiderDocumentKey(riderId, doc.code, "single", file.ext),
      file.mimeType
    );
    await saveDocument.mutateAsync({
      riderId,
      docType: doc.code,
      fileUrl: uploadResult.proxyUrl,
      r2Key: uploadResult.key,
      files: documentFileEntry(uploadResult, file.mimeType),
      // Always pending admin review — never auto-verify rental/EV proofs.
      metadata: {
        verificationMethod: "manual_upload",
        requiresManualReview: true,
        manualSubmissionAt: new Date().toISOString(),
      },
    });
    return { ...uploadResult, mimeType: file.mimeType };
  };

  const handleContinue = async () => {
    if (!currentDoc) return;
    if (submittingRef.current || uploading || submitting) return;
    if (!speedValid) {
      notifyOnboardingToast(tx("speedRequired"));
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

    const alreadyDone = isDocStepComplete(data, currentDoc);
    const hasPickedFile = Boolean(picked?.uri);

    if (!hasPickedFile && !alreadyDone) {
      notifyOnboardingToast(tx("photoRequired"));
      return;
    }

    // Intermediate step with file already saved — advance without re-upload.
    if (!isLastDoc && alreadyDone) {
      const nextDoc = requiredDocs[currentDocIndex + 1];
      if (nextDoc) {
        setWizardDocCode(nextDoc.code);
        await setData({ vehicleDocWizardCode: nextDoc.code });
      }
      return;
    }

    setSubmitting(true);
    setUploading(true);
    submittingRef.current = true;
    const uploadedKeys: string[] = [];

    try {
      const upload = alreadyDone
        ? {
            proxyUrl:
              getDocUploadState(data, currentDoc.code).signedUrl ||
              picked?.uri ||
              "",
            key: "",
            mimeType: picked?.mimeType ?? "image/jpeg",
          }
        : await uploadCurrentDoc(currentDoc, picked!);
      if (!upload.proxyUrl) {
        throw new Error(tx("uploadError"));
      }
      if (upload.key) uploadedKeys.push(upload.key);

      // Always merge against latest store — avoid stale closure wiping the other doc.
      const latest = useOnboardingStore.getState().data;
      const legacyPatch = docUploadToStorePatch(latest, currentDoc.code, {
        // Drop camera/gallery temp paths — they white-box after Back.
        localUri: null,
        signedUrl: upload.proxyUrl,
      });

      if (!isLastDoc) {
        const nextDoc = requiredDocs[currentDocIndex + 1];
        await setData({
          ...legacyPatch,
          currentStep: "rental_ev",
          hasOwnVehicle: false,
          vehicleOnboardingFlow: "rental_ev",
          ...(nextDoc ? { vehicleDocWizardCode: nextDoc.code } : null),
        });
        if (nextDoc) setWizardDocCode(nextDoc.code);
        setPicked(null);
        return;
      }

      await setData({
        ...legacyPatch,
        currentStep: "rental_ev",
        hasOwnVehicle: false,
        vehicleOnboardingFlow: "rental_ev",
      });

      // Final step: both docs must be on the server; submit rental_ev package.
      const afterUpload = { ...latest, ...legacyPatch };
      const allVehicleDocs = mergeVehicleOnboardingDocSteps(
        selectedVehicleType,
        documentCatalog,
      );
      if (!areAllVehicleDocStepsSatisfied(afterUpload, allVehicleDocs)) {
        notifyOnboardingToast(
          "Please complete all required documents for this vehicle before continuing.",
        );
        return;
      }
      const rentalState = getDocUploadState(afterUpload, "rental_proof");
      const evState = getDocUploadState(afterUpload, "ev_proof");

      const vehicleCode = latest.vehicleChoice ?? data.vehicleChoice ?? "rental_ev";
      await setData({
        ...legacyPatch,
        // Re-assert both signed URLs so Back from bank always restores previews.
        rentalProofSignedUrl: rentalState.signedUrl || undefined,
        rentalProofUri: undefined,
        evProofSignedUrl: evState.signedUrl || upload.proxyUrl,
        evProofUri: undefined,
        maxSpeedDeclaration: requiresMaxSpeed ? Number(maxSpeedDeclaration) : undefined,
        currentStep: "rental_ev",
        hasOwnVehicle: false,
        vehicleChoice: vehicleCode,
        vehicleOnboardingFlow: "rental_ev",
        vehicleOnboardingSubmittedFor: vehicleCode,
      });

      await saveStep.mutateAsync({
        riderId: data.riderId,
        step: "dl_rc",
        data: {
          hasOwnVehicle: false,
          vehicleChoice: vehicleCode,
          onboardingFlow: "rental_ev",
          submitVehicleDocs: true,
        },
      });

      const stepData: Record<string, unknown> = {
        uploadedDocCode: currentDoc.code,
        uploadedDocSignedUrl: upload.proxyUrl,
      };
      if (requiresMaxSpeed) {
        stepData.maxSpeedDeclaration = Number(maxSpeedDeclaration);
      }
      if (rentalState.signedUrl) {
        stepData.rentalProofSignedUrl = rentalState.signedUrl;
      }
      if (evState.signedUrl || upload.proxyUrl) {
        stepData.evProofSignedUrl = evState.signedUrl || upload.proxyUrl;
      }

      await saveStep.mutateAsync({
        riderId: data.riderId,
        step: "rental_ev",
        data: stepData,
      });

      const href =
        onboardingContinueHref("rental-ev", { walk: walkThrough }) ??
        "/(onboarding)/bank-account";
      router.replace(href);
    } catch (e) {
      for (const key of uploadedKeys) {
        try {
          await deleteFromR2(key, session.accessToken);
        } catch (rollbackError) {
          console.error(`[Rollback] Failed to delete R2 file ${key}:`, rollbackError);
        }
      }
      notifyOnboardingToast(e instanceof Error ? e.message : tx("uploadError"));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      setUploading(false);
    }
  };

  if (data.vehicleOnboardingFlow !== "rental_ev") {
    return null;
  }

  const title =
    currentDoc?.code === "ev_proof"
      ? tx("titleEv")
      : currentDoc?.code === "rental_proof"
        ? tx("titleRental")
        : currentDoc?.label ?? tx("titleRental");

  const stepPosition = vehicleOnboardingWizardStepNumber(
    "doc",
    currentDoc?.code,
    selectedVehicleType,
    documentCatalog,
  );

  const continueLabel = uploading
    ? tx("uploading")
    : isLastDoc
      ? tx("continue")
      : tx("continueToEv");

  return (
    <View style={form.root}>
      <SafeAreaView style={form.safeArea} edges={[]}>
        <View style={form.flex}>
          <ScrollView
            contentContainerStyle={[
              form.scrollContent,
              { paddingBottom: onboardingStickyScrollPadding(insets.bottom) },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
          >
            <LinearGradient
              colors={["#dff5e4", BG]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={[form.header, { paddingTop: headerTopPad }]}
            >
              <View style={form.stepPill}>
                <Ionicons name="document-text-outline" size={14} color={ACCENT_DARK} />
                <Text style={form.stepPillText}>
                  {`Step 3 · ${currentDoc?.label ?? tx("stepLabel")} (${stepPosition.current} of ${stepPosition.total})`}
                </Text>
              </View>

              <Text style={form.title}>{title}</Text>
              <Text style={form.subtitle}>
                {currentDoc?.hint?.trim() ||
                  selectedVehicleType?.infoMessage ||
                  tx("subtitle")}
              </Text>
            </LinearGradient>

            <View style={form.formCard}>
              {stepLabels.length > 1 ? (
                <StepProgress steps={stepLabels} currentIndex={currentDocIndex} />
              ) : null}

              {currentDoc ? (
                <>
                  <View style={form.fieldGroup}>
                    <FieldLabel label={tx("photoLabel")} required />
                    <Text style={form.sectionHint}>{tx("subtitle")}</Text>
                    <DocumentPhotoSlot
                      uri={picked?.uri ?? null}
                      onPress={showFileOptions}
                      onChangePress={showFileOptions}
                      onRemove={() => void clearCurrentFile()}
                      disabled={uploading || removingFile}
                      removing={removingFile}
                      uploading={uploading}
                      boxTitle={`Add ${currentDoc.label}`}
                      boxSub={tx("boxSub")}
                      icon={resolveDocIcon(currentDoc.icon) as keyof typeof Ionicons.glyphMap}
                      fileKind={picked?.ext === "pdf" ? "pdf" : "image"}
                      viewerTitle={currentDoc.label}
                      changeLabel={tx("changeFile")}
                      removeTitle="Remove document?"
                      removeMessage="Your image will be removed and you need to upload a new one."
                    />
                  </View>

                  {requiresMaxSpeed && isLastDoc ? (
                    <View style={form.fieldGroup}>
                      <FieldLabel label={tx("speedLabel")} required />
                      <Text style={form.sectionHint}>{tx("speedHint")}</Text>
                      <View style={form.inputWrap}>
                        <Ionicons
                          name="speedometer-outline"
                          size={20}
                          color={colors.gray[400]}
                          style={form.inputIcon}
                        />
                        <TextInput
                          value={maxSpeedDeclaration}
                          onChangeText={setMaxSpeedDeclaration}
                          placeholder={tx("speedPlaceholder")}
                          placeholderTextColor={colors.gray[400]}
                          keyboardType="number-pad"
                          style={form.textInput}
                        />
                        {speedValid ? (
                          <Ionicons name="checkmark-circle" size={20} color={ACCENT_DARK} />
                        ) : null}
                      </View>
                    </View>
                  ) : null}
                </>
              ) : null}

            </View>
          </ScrollView>
          <OnboardingStickyFooter>
            <ContinueButton
              label={continueLabel}
              onPress={() => void handleContinue()}
              disabled={!canContinue}
              loading={submitting || uploading || saveStep.isPending}
            />
          </OnboardingStickyFooter>
        </View>
      </SafeAreaView>
      <OnboardingPickerModal
        visible={pickerOpen}
        title={tx("pickerTitle")}
        message={tx("pickerMessage")}
        onCancel={() => setPickerOpen(false)}
        cancelLabel={tx("cancel")}
        options={[
          {
            key: "pdf",
            label: tx("uploadPdf"),
            icon: "document-text-outline",
            onPress: () => void pickPdf(),
          },
          {
            key: "gallery",
            label: tx("upload"),
            icon: "images-outline",
            onPress: () => void pickPhoto("library"),
          },
          {
            key: "camera",
            label: tx("capture"),
            icon: "camera-outline",
            onPress: () => void pickPhoto("camera"),
          },
        ]}
      />
    </View>
  );
}

