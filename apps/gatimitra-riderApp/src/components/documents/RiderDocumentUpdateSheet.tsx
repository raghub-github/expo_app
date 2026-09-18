/**
 * DOCUMENT_UPDATE mode — post-onboarding upload/replace for ONE document.
 * Never advances to RC/Bank/etc. Never shows Skip. Closes on success.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Keyboard,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { DismissibleBottomSheetShell } from "@/src/components/language/DismissibleBottomSheetShell";
import { DocumentPhotoSlot } from "@/src/components/onboarding/DocumentPhotoSlot";
import {
  ElectronicVerifyCard,
  type EvState,
} from "@/src/components/onboarding/ElectronicVerifyCard";
import { useOnboardingDocumentTypes } from "@/src/hooks/useOnboardingDocumentTypes";
import { useSaveDocument } from "@/src/hooks/useDocuments";
import {
  useVerificationModes,
  useVerifyDocument,
} from "@/src/hooks/useOnboarding";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import {
  FALLBACK_ONBOARDING_DOCUMENT_TYPES,
  docRequiresBackPhoto,
  findDocumentType,
  metadataKeyForDocText,
} from "@/src/lib/onboarding-document-types";
import {
  isValidCashfreeDlNumber,
  isValidCashfreeRcNumber,
  normalizeCashfreeDocNumber,
} from "@/src/lib/cashfree-doc-formats";
import { pickRcOwnerName, softPersonNamesMatch } from "@/src/lib/pan-aadhaar-name-match";
import { uploadToR2, deleteFromR2, buildRiderDocumentKey } from "@/src/services/storage/cloudflareR2";
import { notifyOnboardingToast, friendlyOnboardingError } from "@/src/lib/rider-onboarding-toast";
import { RIDER_ONBOARDING_SUMMARY_QUERY_KEY } from "@/src/hooks/useRiderOnboardingSummary";
import { RIDER_VEHICLES_QUERY_KEY } from "@/src/hooks/useRiderVehicles";
import { RiderFonts } from "@/src/theme/fonts";
import { normalizeRiderId } from "@/src/utils/normalizeRiderId";
import type { DocumentUpdateCode } from "@/src/stores/documentUpdateSheetStore";

const PRIMARY = "#15803D";
const PRIMARY_BORDER = "#14532D";

export type DocumentUpdateMode = "DOCUMENT_UPDATE";

type Props = {
  visible: boolean;
  documentCode: DocumentUpdateCode | null;
  onClose: () => void;
  onSuccess?: (documentCode: DocumentUpdateCode) => void;
  /** Always DOCUMENT_UPDATE for this sheet — explicit for clarity / tests. */
  mode?: DocumentUpdateMode;
  addAnotherVehicle?: boolean;
};

function documentFileEntries(
  front: { proxyUrl: string; key: string },
  back?: { proxyUrl: string; key: string },
): Array<{ side: "front" | "back"; fileUrl: string; r2Key: string; mimeType: string }> {
  const entries: Array<{
    side: "front" | "back";
    fileUrl: string;
    r2Key: string;
    mimeType: string;
  }> = [
    {
      side: "front",
      fileUrl: front.proxyUrl,
      r2Key: front.key,
      mimeType: "image/jpeg",
    },
  ];
  if (back) {
    entries.push({
      side: "back",
      fileUrl: back.proxyUrl,
      r2Key: back.key,
      mimeType: "image/jpeg",
    });
  }
  return entries;
}

export function RiderDocumentUpdateSheet({
  visible,
  documentCode,
  onClose,
  onSuccess,
  mode = "DOCUMENT_UPDATE",
  addAnotherVehicle = false,
}: Props) {
  void mode; // DOCUMENT_UPDATE only — Skip / next-step never apply here.
  const queryClient = useQueryClient();
  const session = useSessionStore((s) => s.session);
  const onboardingRiderId = useOnboardingStore((s) => s.data.riderId);
  const aadhaarName = useOnboardingStore((s) => String(s.data.fullName || "").trim());
  const setOnboardingData = useOnboardingStore((s) => s.setData);
  const saveDocument = useSaveDocument();
  const verifyDocument = useVerifyDocument();
  const { data: evModesData } = useVerificationModes();
  const { data: catalog = FALLBACK_ONBOARDING_DOCUMENT_TYPES } = useOnboardingDocumentTypes("dl_rc");

  const riderIdStr =
    normalizeRiderId(onboardingRiderId) ??
    normalizeRiderId(session?.riderId) ??
    normalizeRiderId(session?.userId);
  const riderIdNum = riderIdStr ? parseInt(riderIdStr, 10) : NaN;

  const docDef = useMemo(() => {
    if (!documentCode) return undefined;
    return (
      findDocumentType(catalog, documentCode) ??
      FALLBACK_ONBOARDING_DOCUMENT_TYPES.find((d) => d.code === documentCode)
    );
  }, [catalog, documentCode]);

  const needsBack = docDef ? docRequiresBackPhoto(docDef) : documentCode === "dl";
  const parts: Array<"front" | "back"> = needsBack ? ["front", "back"] : ["front"];

  const evKind =
    documentCode === "dl"
      ? ("driving_licence" as const)
      : documentCode === "rc"
        ? ("vehicle_rc" as const)
        : null;
  const evMode = evKind
    ? ((evModesData?.modes?.[evKind] ?? "manual") as "manual" | "auto" | "hybrid" | "disabled")
    : "manual";
  const electronic = evKind != null && (evMode === "auto" || evMode === "hybrid");

  const [docNumber, setDocNumber] = useState("");
  const [dob, setDob] = useState("");
  const [frontUri, setFrontUri] = useState<string | null>(null);
  const [backUri, setBackUri] = useState<string | null>(null);
  const [ev, setEv] = useState<EvState>({ phase: "idle" });
  const [allowManualOnFail, setAllowManualOnFail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successFlash, setSuccessFlash] = useState(false);
  const verifiedDetailsRef = useRef<Record<string, unknown> | null>(null);
  const inFlightRef = useRef(false);

  const resetForm = useCallback(() => {
    setDocNumber("");
    setDob("");
    setFrontUri(null);
    setBackUri(null);
    setEv({ phase: "idle" });
    setAllowManualOnFail(false);
    setBusy(false);
    setError(null);
    setSuccessFlash(false);
    verifiedDetailsRef.current = null;
    inFlightRef.current = false;
  }, []);

  useEffect(() => {
    if (!visible) {
      resetForm();
      return;
    }
    resetForm();
  }, [visible, documentCode, resetForm]);

  const electronicallyVerified = ev.phase === "verified" && !ev.requirePhoto;
  const requirePhotoAfterVerify = ev.phase === "verified" && Boolean(ev.requirePhoto);
  /**
   * Photos after soft-verify requirePhoto, manual path, or Cashfree-down fallback.
   * Invalid RC numbers keep allowManualOnFail=false so upload stays hidden.
   */
  const showPhotos =
    !electronic ||
    requirePhotoAfterVerify ||
    ev.phase === "manual" ||
    (ev.phase === "failed" && allowManualOnFail);

  const numberValid =
    documentCode === "dl"
      ? isValidCashfreeDlNumber(docNumber)
      : documentCode === "rc"
        ? isValidCashfreeRcNumber(docNumber)
        : Boolean(docNumber.trim());

  const photosReady =
    electronicallyVerified ||
    (Boolean(frontUri) && (!needsBack || Boolean(backUri)));

  /** Electronic path: must verify (or mismatch photo / fail fallback) before Save. */
  const electronicGateOk =
    !electronic ||
    electronicallyVerified ||
    requirePhotoAfterVerify ||
    ev.phase === "manual" ||
    (ev.phase === "failed" && allowManualOnFail);

  const canSubmit =
    Boolean(docDef) && numberValid && photosReady && electronicGateOk && !busy;

  /**
   * Hide Save until auto-verify succeeds, or manual/mismatch path has photos ready.
   */
  const showSaveButton =
    !electronic
      ? numberValid && photosReady
      : electronicallyVerified ||
        ((requirePhotoAfterVerify ||
          ev.phase === "manual" ||
          (ev.phase === "failed" && allowManualOnFail)) &&
          photosReady &&
          numberValid);

  const pickPhoto = async (source: "camera" | "library"): Promise<string | null> => {
    try {
      if (source === "camera") {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Camera permission", "Please allow camera access to capture your document.");
          return null;
        }
      }
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
        return persistLocalOnboardingPhoto(raw, documentCode === "rc" ? "rc" : "doc");
      }
    } catch {
      setError(source === "camera" ? "Could not capture photo." : "Could not pick photo.");
    }
    return null;
  };

  const showPhotoOptions = (side: "front" | "back") => {
    Alert.alert("Add photo", "Choose how to add your document photo", [
      {
        text: "Camera",
        onPress: () => {
          void pickPhoto("camera").then((uri) => {
            if (!uri) return;
            if (side === "front") setFrontUri(uri);
            else setBackUri(uri);
            setError(null);
          });
        },
      },
      {
        text: "Gallery",
        onPress: () => {
          void pickPhoto("library").then((uri) => {
            if (!uri) return;
            if (side === "front") setFrontUri(uri);
            else setBackUri(uri);
            setError(null);
          });
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const runElectronicVerify = async () => {
    if (!riderIdStr || !evKind || !numberValid) return;
    if (evKind === "driving_licence" && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      setEv({
        phase: "failed",
        error: "Date of birth is required (as printed on your driving licence).",
      });
      return;
    }
    setEv({ phase: "verifying" });
    setError(null);
    try {
      const normalized = normalizeCashfreeDocNumber(docNumber);
      const res = await verifyDocument.mutateAsync(
        evKind === "driving_licence"
          ? {
              riderId: riderIdStr,
              docKind: "driving_licence",
              dlNumber: normalized,
              dob,
            }
          : {
              riderId: riderIdStr,
              docKind: "vehicle_rc",
              vehicleNumber: normalized,
              ...(addAnotherVehicle ? { addAnotherVehicle: true } : {}),
            },
      );
      if (res.outcome === "verified") {
        const details = res.verifiedData ?? {};
        verifiedDetailsRef.current = Object.keys(details).length > 0 ? details : null;
        setFrontUri(null);
        setBackUri(null);
        const requirePhotoFromApi = Boolean(
          (details as { requirePhoto?: boolean }).requirePhoto ||
            (res as { requirePhoto?: boolean }).requirePhoto,
        );
        let requirePhoto = requirePhotoFromApi;
        let photoHint = requirePhotoFromApi
          ? "Upload a clear document photo to finish."
          : undefined;
        if (documentCode === "rc") {
          const ownerName = pickRcOwnerName(details);
          const ownerMatched =
            Boolean(ownerName) &&
            Boolean(aadhaarName) &&
            softPersonNamesMatch(ownerName, aadhaarName);
          requirePhoto = requirePhotoFromApi || !ownerMatched;
          photoHint = requirePhoto
            ? "Verified successfully, but the authorized name doesn’t match. Please upload a clear image of your RC."
            : undefined;
        } else if (documentCode === "dl" && requirePhotoFromApi) {
          photoHint =
            (typeof (res as { photoHint?: string }).photoHint === "string" &&
              (res as { photoHint?: string }).photoHint) ||
            "Verified successfully, but the authorized name doesn’t match. Please upload a clear image of your driving licence.";
        }
        setEv({
          phase: "verified",
          details,
          requirePhoto,
          photoHint,
        });
        return;
      }
      if (res.outcome === "mismatch") {
        const details = res.verifiedData ?? {};
        verifiedDetailsRef.current = Object.keys(details).length > 0 ? details : null;
        setEv({
          phase: "verified",
          details,
          requirePhoto: true,
          photoHint:
            documentCode === "rc"
              ? "Verified successfully, but the authorized name doesn’t match. Please upload a clear image of your RC."
              : "Verified successfully, but the authorized name doesn’t match. Please upload a clear image of your driving licence.",
        });
        return;
      }
      if (res.outcome === "manual") {
        setEv({ phase: "manual" });
        return;
      }
      const verifyFailFallback =
        documentCode === "dl"
          ? "Invalid DL number. Please check and try again."
          : documentCode === "rc"
            ? "Invalid RC number. Please enter a valid RC number and try again."
            : "Verification failed. Try again or upload a photo.";
      const allowManual =
        (res as { allowManualUpload?: boolean }).allowManualUpload !== false ||
        documentCode === "dl";
      setAllowManualOnFail(allowManual);
      setEv({
        phase: "failed",
        error: friendlyOnboardingError(
          res.error || res.reason || "Verification failed",
          verifyFailFallback,
        ),
      });
    } catch (e) {
      const verifyCatchFallback =
        documentCode === "dl"
          ? "Invalid DL number. Please check and try again."
          : documentCode === "rc"
            ? "Invalid RC number. Please enter a valid RC number and try again."
            : "Couldn't verify right now. Try again or upload a photo.";
      setAllowManualOnFail(true);
      setEv({
        phase: "failed",
        error: friendlyOnboardingError(e, verifyCatchFallback),
      });
    }
  };

  const invalidateDocQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: RIDER_ONBOARDING_SUMMARY_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ["rider", "me", "documents"] }),
      queryClient.invalidateQueries({ queryKey: ["rider", "eligibility"] }),
      queryClient.invalidateQueries({ queryKey: RIDER_VEHICLES_QUERY_KEY }),
      // Avoid invalidating the entire ["rider"] tree — that remounts duty/orders mid-sheet close
      // and was a common crash path after adding a second RC.
      Number.isFinite(riderIdNum)
        ? queryClient.invalidateQueries({ queryKey: ["rider", String(riderIdNum), "status"] })
        : Promise.resolve(),
    ]);
  };

  const handleSubmit = async () => {
    if (!canSubmit || !docDef || !documentCode || inFlightRef.current) return;
    if (!session?.accessToken || !Number.isFinite(riderIdNum) || !riderIdStr) {
      setError("Not authenticated. Please login again.");
      return;
    }
    if (!electronicallyVerified && !frontUri) {
      setError(needsBack ? "Please add the front photo." : "Please add a document photo.");
      return;
    }
    if (!electronicallyVerified && needsBack && !backUri) {
      setError("Please add the back photo of your driving licence.");
      return;
    }

    Keyboard.dismiss();
    inFlightRef.current = true;
    setBusy(true);
    setError(null);
    const uploadedKeys: string[] = [];

    try {
      const textValue = normalizeCashfreeDocNumber(docNumber);
      const metadata: Record<string, unknown> = {
        [metadataKeyForDocText(documentCode)]: textValue,
        updateContext: "DOCUMENT_UPDATE",
        ...(addAnotherVehicle && documentCode === "rc" ? { addAnotherVehicle: true } : {}),
      };
      if (verifiedDetailsRef.current) {
        metadata.verifiedDetails = verifiedDetailsRef.current;
        if (documentCode === "dl") metadata.verificationMethod = "cashfree_dl";
        if (documentCode === "rc") {
          metadata.cashfreeVerifiedData = verifiedDetailsRef.current;
          if (requirePhotoAfterVerify || ev.phase === "mismatch") {
            metadata.rcOwnerAadhaarMismatch = true;
          } else {
            metadata.verificationMethod = "cashfree_rc";
          }
        }
      }

      let frontUpload: { proxyUrl: string; key: string } | undefined;
      let backUpload: { proxyUrl: string; key: string } | undefined;

      if (frontUri && !electronicallyVerified) {
        frontUpload = await uploadToR2(
          frontUri,
          "documents",
          session.accessToken,
          buildRiderDocumentKey(riderIdNum, documentCode, needsBack ? "front" : "single"),
        );
        uploadedKeys.push(frontUpload.key);

        if (needsBack && backUri) {
          backUpload = await uploadToR2(
            backUri,
            "documents",
            session.accessToken,
            buildRiderDocumentKey(riderIdNum, documentCode, "back"),
          );
          uploadedKeys.push(backUpload.key);
        }

        await saveDocument.mutateAsync({
          riderId: riderIdNum,
          docType: documentCode,
          fileUrl: frontUpload.proxyUrl,
          r2Key: frontUpload.key,
          metadata,
          files: documentFileEntries(frontUpload, backUpload),
        });
      } else if (electronicallyVerified) {
        await saveDocument.mutateAsync({
          riderId: riderIdNum,
          docType: documentCode,
          fileUrl:
            documentCode === "dl" ? "cashfree_dl_verified" : "cashfree_rc_verified",
          metadata,
        });
      } else {
        throw new Error("Nothing to upload.");
      }

      await setOnboardingData(
        documentCode === "dl"
          ? {
              dlNumber: textValue,
              dlPhotoSignedUrl: frontUpload?.proxyUrl,
              dlBackPhotoSignedUrl: backUpload?.proxyUrl,
            }
          : addAnotherVehicle
            ? {}
            : {
                rcNumber: textValue,
                rcPhotoSignedUrl: frontUpload?.proxyUrl,
              },
      );

      await invalidateDocQueries();

      setSuccessFlash(true);
      notifyOnboardingToast(
        documentCode === "dl"
          ? "Driving Licence uploaded successfully"
          : addAnotherVehicle
            ? "Second vehicle submitted for verification"
            : "Registration Certificate uploaded successfully",
      );
      onSuccess?.(documentCode);

      // Brief success state, then close — stay on the same underlying screen.
      setTimeout(() => {
        onClose();
      }, 550);
    } catch (e) {
      for (const key of uploadedKeys) {
        try {
          await deleteFromR2(key, session.accessToken);
        } catch {
          // best-effort rollback
        }
      }
      const msg = friendlyOnboardingError(e, "Upload failed. Please try again.");
      setError(msg);
      notifyOnboardingToast(msg);
    } finally {
      setBusy(false);
      inFlightRef.current = false;
    }
  };

  const title =
    addAnotherVehicle && documentCode === "rc"
      ? "Add another vehicle"
      : docDef?.label ?? (documentCode === "dl" ? "Driving Licence" : "Document");
  const subtitle = addAnotherVehicle && documentCode === "rc"
    ? "Enter a different RC. The second vehicle must be a different type (2W / 3W / 4W)."
    : electronic
    ? "Verify instantly first. If that fails, upload clear photos for review."
    : docDef?.hint ??
      (needsBack
        ? "Enter your number and upload clear front and back photos"
        : "Enter your number and upload a clear photo");

  return (
    <DismissibleBottomSheetShell
      visible={visible && documentCode != null}
      onDismiss={() => {
        if (busy) return;
        onClose();
      }}
      maxHeightRatio={0.88}
      fitContent
      compactBottomInset
      sheetBottomPadding={20}
      keyboardAware
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.iconWrap}>
          <Ionicons name="document-text-outline" size={26} color={PRIMARY} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        {/* DOCUMENT_UPDATE: never render Skip */}

        <Text style={styles.label}>
          {docDef?.textFieldLabel ?? "Document number"}
        </Text>
        <TextInput
          style={styles.input}
          value={docNumber}
          onChangeText={(t) => {
            setDocNumber(t.toUpperCase());
            setError(null);
            setFrontUri(null);
            setBackUri(null);
            verifiedDetailsRef.current = null;
            if (ev.phase !== "idle") setEv({ phase: "idle" });
          }}
          placeholder={docDef?.textFieldPlaceholder ?? "Enter number"}
          placeholderTextColor="#94A3B8"
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!busy}
        />

        {electronic ? (
          <View style={styles.evWrap}>
            <ElectronicVerifyCard
              mode={evMode === "auto" ? "auto" : "hybrid"}
              state={ev}
              disabled={busy || !numberValid || electronicallyVerified}
              onVerify={() => {
                setAllowManualOnFail(false);
                void runElectronicVerify();
              }}
              onUploadManually={() => {
                setEv({ phase: "manual" });
                setError(null);
              }}
              allowManualUpload={
                documentCode === "dl" ||
                allowManualOnFail ||
                ev.phase === "manual" ||
                requirePhotoAfterVerify
              }
              verifyLabel="Verify instantly"
              retryLabel="Verify again"
              documentLabel={title}
              requiresDob={documentCode === "dl"}
              dob={dob}
              onDobChange={setDob}
              verifiedTitle={
                documentCode === "dl"
                  ? "Driving License is Valid"
                  : documentCode === "rc"
                    ? "Vehicle RC is Valid"
                    : undefined
              }
              verifiedHint="Verified successfully. Tap Save below to finish."
            />
          </View>
        ) : null}

        {showPhotos ? (
          <View style={styles.photos}>
            {ev.phase === "manual" || (ev.phase === "failed" && allowManualOnFail) ? (
              <Text style={styles.manualHint}>
                Add all required photos, then tap Continue.
              </Text>
            ) : null}
            {requirePhotoAfterVerify ? (
              <Text style={styles.manualHint}>
                {documentCode === "rc"
                  ? "Upload RC Image"
                  : documentCode === "dl"
                    ? "Upload DL Image"
                    : "Upload document image"}
              </Text>
            ) : null}
            {parts.includes("front") ? (
              <DocumentPhotoSlot
                uri={frontUri}
                onPress={() => showPhotoOptions("front")}
                onRemove={() => setFrontUri(null)}
                disabled={busy || electronicallyVerified}
                uploading={busy && !electronicallyVerified}
                boxTitle={
                  documentCode === "rc"
                    ? "Upload RC Image"
                    : documentCode === "dl"
                      ? needsBack
                        ? "Upload Front"
                        : "Upload DL Image"
                      : needsBack
                        ? "Upload Front"
                        : "Upload photo"
                }
                boxSub="Camera or gallery"
                viewerTitle={`${title} front`}
              />
            ) : null}
            {parts.includes("back") ? (
              <DocumentPhotoSlot
                uri={backUri}
                onPress={() => showPhotoOptions("back")}
                onRemove={() => setBackUri(null)}
                disabled={busy || electronicallyVerified}
                uploading={busy && !electronicallyVerified}
                boxTitle="Upload Back"
                boxSub="Camera or gallery"
                viewerTitle={`${title} back`}
              />
            ) : null}
            {frontUri && needsBack && !backUri ? (
              <Text style={styles.partialHint}>Front added · Back still required</Text>
            ) : null}
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color="#DC2626" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {successFlash ? (
          <View style={styles.successBox}>
            <Ionicons name="checkmark-circle" size={18} color={PRIMARY} />
            <Text style={styles.successText}>{title} uploaded successfully</Text>
          </View>
        ) : null}

        {showSaveButton ? (
          <TouchableOpacity
            style={[styles.submitBtn, (!canSubmit || busy) && styles.submitBtnDisabled]}
            disabled={!canSubmit || busy}
            onPress={() => void handleSubmit()}
            accessibilityRole="button"
            accessibilityLabel={
              electronicallyVerified ? `Save ${title}` : "Continue"
            }
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons
                  name={electronicallyVerified ? "cloud-upload-outline" : "arrow-forward"}
                  size={18}
                  color="#FFFFFF"
                />
                <Text style={styles.submitText}>
                  {electronicallyVerified ? `Save ${title}` : "Continue"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.cancelBtn}
          disabled={busy}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Text style={styles.cancelText}>Close</Text>
        </TouchableOpacity>
      </ScrollView>
    </DismissibleBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  scroll: { width: "100%", maxHeight: "100%" },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 12,
  },
  title: {
    fontFamily: RiderFonts.poppinsExtraBold,
    fontSize: 22,
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 13,
    lineHeight: 19,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 16,
  },
  label: {
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 13,
    color: "#334155",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 15,
    color: "#0F172A",
    backgroundColor: "#FFFFFF",
    marginBottom: 12,
  },
  evWrap: { marginBottom: 12 },
  photos: { gap: 10, marginBottom: 8 },
  manualHint: {
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 12,
    color: "#64748B",
    marginBottom: 2,
  },
  partialHint: {
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 12,
    color: "#B45309",
    marginTop: 2,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  errorText: {
    flex: 1,
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 13,
    color: "#991B1B",
  },
  successBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  successText: {
    flex: 1,
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 13,
    color: PRIMARY,
  },
  submitBtn: {
    marginTop: 8,
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: PRIMARY,
    borderWidth: 1.5,
    borderColor: PRIMARY_BORDER,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitText: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 15,
    color: "#FFFFFF",
  },
  cancelBtn: {
    marginTop: 10,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  cancelText: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 15,
    color: "#111827",
  },
});
