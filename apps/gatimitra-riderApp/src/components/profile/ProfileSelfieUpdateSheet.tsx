import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { SelfieAutoCapture } from "@/src/components/onboarding/SelfieAutoCapture";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { uploadRiderSelfieDocument } from "@/src/lib/upload-rider-selfie";
import { notifyOnboardingToast } from "@/src/lib/rider-onboarding-toast";
import { colors } from "@/src/theme";
import { useProfileSelfieSheetStore } from "@/src/stores/profileSelfieSheetStore";

const SELFIE_TIPS = [
  "Face the camera directly",
  "Use good lighting",
  "Remove sunglasses, goggles, or mask",
  "Tap Capture selfie when you are ready",
] as const;

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
  const [uploading, setUploading] = useState(false);

  const riderIdRaw = session?.riderId ?? session?.userId;
  const riderIdNum =
    riderIdRaw != null && /^\d+$/.test(String(riderIdRaw))
      ? parseInt(String(riderIdRaw), 10)
      : null;

  useEffect(() => {
    if (!visible) {
      setSelfieUri(null);
      setUploading(false);
    }
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
  const uploadLabel = t("profile.selfieUpdate.upload", "Upload selfie");

  function renderUploadButton() {
    return (
      <View
        collapsable={false}
        style={[styles.saveBtnShell, uploading && styles.saveBtnShellDisabled]}
      >
        <TouchableOpacity
          activeOpacity={uploading ? 1 : 0.85}
          onPress={() => {
            if (!uploading) void handleSave();
          }}
          disabled={uploading}
          accessibilityRole="button"
          accessibilityLabel={uploadLabel}
          style={styles.saveBtnHit}
        >
          {uploading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <View style={styles.saveBtnRow}>
              <Ionicons name="cloud-upload-outline" size={22} color="#FFFFFF" />
              <Text style={styles.saveBtnText}>{uploadLabel}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <View style={styles.root}>
        <LinearGradient
          colors={["#0F766E", "#0D9488", "#14B8A6"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: topInset + 12 }]}
        >
          <View style={styles.heroRow}>
            <Pressable
              onPress={handleClose}
              disabled={uploading}
              style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel={t("common.close", "Close")}
            >
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </Pressable>
            <View style={styles.heroText}>
              <Text style={styles.title}>
                {t("profile.selfieUpdate.title", "Update profile photo")}
              </Text>
              <Text style={styles.subtitle}>
                {t(
                  "profile.selfieUpdate.subtitle",
                  "Look at the camera and tap Capture selfie. Gallery photos are not allowed."
                )}
              </Text>
            </View>
            <View style={styles.heroSpacer} />
          </View>
        </LinearGradient>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 24) + 16 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.captureCard}>
            <View style={styles.stepPill}>
              <Ionicons name="scan-outline" size={16} color={colors.primary[700]} />
              <Text style={styles.stepPillText}>
                {t("profile.selfieUpdate.liveCapture", "Live capture only")}
              </Text>
            </View>

            <SelfieAutoCapture
              uri={selfieUri}
              active={visible}
              disabled={uploading}
              liveProbe={false}
              onCaptured={async (uri) => setSelfieUri(uri)}
              onRemove={() => setSelfieUri(null)}
              onRejected={(message) => notifyOnboardingToast(message)}
              hint={t(
                "profile.selfieUpdate.hint",
                "Align your face, then tap Capture selfie"
              )}
              tips={SELFIE_TIPS}
              capturedAction={renderUploadButton()}
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F4F6F8",
  },
  hero: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  closeBtnPressed: {
    opacity: 0.85,
  },
  heroText: {
    flex: 1,
    paddingTop: 2,
  },
  heroSpacer: {
    width: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(255,255,255,0.92)",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  captureCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    overflow: "visible",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  stepPill: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[200],
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 16,
  },
  stepPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary[700],
  },
  saveBtnShell: {
    alignSelf: "stretch",
    width: "100%",
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: "#0D9488",
    overflow: "hidden",
  },
  saveBtnShellDisabled: {
    backgroundColor: "#94A3B8",
  },
  saveBtnHit: {
    minHeight: 56,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  saveBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
