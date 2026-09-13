/**
 * Profile selfie update — same full-screen oval capture UI as onboarding
 * (`LiveSelfieCameraModal`), then preview + upload.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  Image,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { LiveSelfieCameraModal } from "@/src/components/onboarding/LiveSelfieCameraModal";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { uploadRiderSelfieDocument } from "@/src/lib/upload-rider-selfie";
import { notifyOnboardingToast } from "@/src/lib/rider-onboarding-toast";
import { useProfileSelfieSheetStore } from "@/src/stores/profileSelfieSheetStore";
import { colors } from "@/src/theme";

const ACCENT_DARK = "#22a745";
const BG = "#F4F6F8";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSaved?: (selfieUrl: string) => void;
};

export function ProfileSelfieUpdateSheet({ visible, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const session = useSessionStore((s) => s.session);
  const setOnboardingData = useOnboardingStore((s) => s.setData);
  const queryClient = useQueryClient();
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  /** Sync flag — LiveSelfieCameraModal calls onClose right after onCaptured. */
  const capturedRef = useRef(false);

  const riderIdRaw = session?.riderId ?? session?.userId;
  const riderIdNum =
    riderIdRaw != null && /^\d+$/.test(String(riderIdRaw))
      ? parseInt(String(riderIdRaw), 10)
      : null;

  useEffect(() => {
    if (!visible) {
      setSelfieUri(null);
      setUploading(false);
      setCameraOpen(false);
      capturedRef.current = false;
      return;
    }
    // Same as onboarding: open full-screen live capture immediately.
    capturedRef.current = false;
    setSelfieUri(null);
    setCameraOpen(true);
  }, [visible]);

  useEffect(() => {
    if (visible) useProfileSelfieSheetStore.getState().open();
    else useProfileSelfieSheetStore.getState().close();
    return () => useProfileSelfieSheetStore.getState().close();
  }, [visible]);

  const handleClose = useCallback(() => {
    if (uploading) return;
    onClose();
  }, [uploading, onClose]);

  const handleCameraClose = useCallback(() => {
    setCameraOpen(false);
    // Back without capture → dismiss sheet. After capture, preview Modal stays.
    if (!capturedRef.current) {
      onClose();
    }
  }, [onClose]);

  const handleCaptured = useCallback(async (uri: string) => {
    capturedRef.current = true;
    setSelfieUri(uri);
    setCameraOpen(false);
  }, []);

  const handleRetake = useCallback(() => {
    if (uploading) return;
    capturedRef.current = false;
    setSelfieUri(null);
    setCameraOpen(true);
  }, [uploading]);

  const handleSave = useCallback(async () => {
    if (!selfieUri || uploading) return;
    if (!session?.accessToken) {
      notifyOnboardingToast(
        t("profile.selfieUpdate.notAuthenticated", "Not authenticated. Please login again.")
      );
      return;
    }
    if (!riderIdNum) {
      notifyOnboardingToast(
        t("profile.selfieUpdate.riderNotFound", "Rider ID not found. Please try again.")
      );
      return;
    }

    setUploading(true);
    try {
      const remoteUrl = await uploadRiderSelfieDocument({
        riderId: riderIdNum,
        localUri: selfieUri,
        accessToken: session.accessToken,
      });

      await setOnboardingData({
        selfieUri: remoteUrl,
        selfieSignedUrl: remoteUrl,
      });

      await queryClient.invalidateQueries({ queryKey: ["rider"] });

      notifyOnboardingToast(
        t("profile.selfieUpdate.success", "Profile photo updated successfully.")
      );
      onSaved?.(remoteUrl);
      onClose();
    } catch (error) {
      notifyOnboardingToast(
        error instanceof Error
          ? error.message
          : t("profile.selfieUpdate.uploadError", "Failed to update selfie. Please try again.")
      );
    } finally {
      setUploading(false);
    }
  }, [
    selfieUri,
    uploading,
    session?.accessToken,
    riderIdNum,
    setOnboardingData,
    queryClient,
    t,
    onSaved,
    onClose,
  ]);

  if (!visible) return null;

  const topInset = Math.max(insets.top, Platform.OS === "android" ? 28 : 0);
  const showPreview = Boolean(selfieUri) && !cameraOpen;

  return (
    <>
      {/* Preview + upload after capture (same post-capture pattern as onboarding) */}
      <Modal
        visible={showPreview}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={handleClose}
      >
        <View style={styles.root}>
          <LinearGradient
            colors={["#dff5e4", BG]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[styles.header, { paddingTop: topInset + 12 }]}
          >
            <View style={styles.headerRow}>
              <Pressable
                onPress={handleClose}
                disabled={uploading}
                style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel={t("common.close", "Close")}
              >
                <Ionicons name="close" size={22} color="#0f172a" />
              </Pressable>
              <View style={styles.headerText}>
                <View style={styles.stepPill}>
                  <Ionicons name="person-outline" size={14} color={ACCENT_DARK} />
                  <Text style={styles.stepPillText}>
                    {t("profile.selfieUpdate.liveCapture", "Live capture only")}
                  </Text>
                </View>
                <Text style={styles.title}>
                  {t("profile.selfieUpdate.title", "Update profile photo")}
                </Text>
                <Text style={styles.subtitle}>
                  {t(
                    "profile.selfieUpdate.previewHint",
                    "Review your selfie, then upload or retake."
                  )}
                </Text>
              </View>
              <View style={styles.headerSpacer} />
            </View>
          </LinearGradient>

          <View style={styles.previewBody}>
            {selfieUri ? (
              <Pressable
                onPress={() => undefined}
                style={styles.previewCard}
                accessibilityRole="image"
                accessibilityLabel="Captured selfie"
              >
                <Image
                  key={selfieUri}
                  source={{ uri: selfieUri }}
                  style={styles.previewImage}
                  resizeMode="cover"
                />
              </Pressable>
            ) : null}

            <Pressable
              onPress={handleRetake}
              disabled={uploading}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.btnPressed,
                uploading && styles.btnDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t("profile.selfieUpdate.retake", "Retake selfie")}
            >
              <Ionicons name="refresh" size={20} color={ACCENT_DARK} />
              <Text style={styles.secondaryBtnText}>
                {t("profile.selfieUpdate.retake", "Retake selfie")}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => void handleSave()}
              disabled={uploading || !selfieUri}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.btnPressed,
                (uploading || !selfieUri) && styles.btnDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t("profile.selfieUpdate.upload", "Upload selfie")}
            >
              {uploading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.primaryBtnText}>
                    {t("profile.selfieUpdate.upload", "Upload selfie")}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Same full-screen oval camera as onboarding pan-selfie */}
      <LiveSelfieCameraModal
        visible={visible && cameraOpen}
        disabled={uploading}
        onClose={handleCameraClose}
        onCaptured={handleCaptured}
        onRejected={(message) => notifyOnboardingToast(message)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  closeBtnPressed: {
    opacity: 0.85,
  },
  headerText: {
    flex: 1,
    alignItems: "center",
    paddingTop: 2,
  },
  headerSpacer: {
    width: 40,
  },
  stepPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#b7ebc6",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 12,
  },
  stepPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: ACCENT_DARK,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: colors.gray[500],
    textAlign: "center",
  },
  previewBody: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 14,
    alignItems: "center",
  },
  previewCard: {
    width: "100%",
    maxWidth: 320,
    aspectRatio: 3 / 4,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: colors.gray[100],
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  primaryBtn: {
    width: "100%",
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: ACCENT_DARK,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  secondaryBtn: {
    width: "100%",
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: ACCENT_DARK,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: ACCENT_DARK,
  },
  btnPressed: {
    opacity: 0.88,
  },
  btnDisabled: {
    opacity: 0.55,
  },
});
