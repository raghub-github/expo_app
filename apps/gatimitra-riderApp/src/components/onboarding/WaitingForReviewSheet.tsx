/**
 * Home bottom sheet for paid riders waiting on admin verification.
 * Replaces the old full-page /(onboarding)/pending screen.
 */
import React, { useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { DismissibleBottomSheetShell } from "@/src/components/language/DismissibleBottomSheetShell";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useRiderStatus } from "@/src/hooks/useOnboarding";
import { canAccessHome } from "@/src/lib/onboarding-routes";
import { colors } from "@/src/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
};

const ACCENT_DARK = "#22a745";

export function WaitingForReviewSheet({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const riderId = useOnboardingStore((s) => s.data.riderId);
  const { refetch, isFetching } = useRiderStatus(riderId);

  const tx = useCallback(
    (key: string, fallback: string) =>
      t(`onboarding.pending.${key}`, { defaultValue: fallback }),
    [t],
  );

  const handleRefresh = useCallback(async () => {
    if (!riderId) return;
    await queryClient.invalidateQueries({ queryKey: ["rider", riderId] });
    const result = await refetch();
    if (canAccessHome(result.data?.onboardingStatus, result.data?.accountStatus)) {
      onClose();
    }
  }, [queryClient, riderId, refetch, onClose]);

  return (
    <DismissibleBottomSheetShell
      visible={visible}
      onDismiss={onClose}
      maxHeightRatio={0.78}
      fitContent
      showFloatingClose
    >
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Text style={styles.emoji}>⏳</Text>
        </View>

        <Text style={styles.badge}>{tx("statusBadge", "Waiting for Review")}</Text>

        <Text style={styles.title}>{tx("title", "Waiting for Review")}</Text>
        <Text style={styles.subtitle}>
          {tx(
            "subtitle",
            "Your documents have been submitted and payment has been received. Our team is reviewing your application.",
          )}
        </Text>

        <View style={styles.infoBox}>
          <View style={styles.infoHeader}>
            <Ionicons name="information-circle-outline" size={18} color="#b45309" />
            <Text style={styles.infoTitle}>{tx("whatsNext", "What happens next?")}</Text>
          </View>
          <Text style={styles.infoBody}>
            {tx("bulletVerify", "• Our team will verify your documents")}
            {"\n"}
            {tx("bulletNotify", "• You'll receive a notification once approved")}
            {"\n"}
            {tx("bulletStart", "• You can start accepting orders after approval")}
          </Text>
        </View>

        <Text style={styles.closeNote}>
          {tx(
            "closeNote",
            "You can close the app. We'll notify you when your account is approved.",
          )}
        </Text>

        <Pressable
          onPress={() => void handleRefresh()}
          disabled={isFetching}
          style={[styles.refreshBtn, isFetching && styles.refreshBtnDisabled]}
          accessibilityRole="button"
          accessibilityLabel={tx("refreshButton", "Refresh status")}
        >
          {isFetching ? (
            <ActivityIndicator color={ACCENT_DARK} />
          ) : (
            <>
              <Ionicons name="refresh-outline" size={18} color={ACCENT_DARK} />
              <Text style={styles.refreshBtnText}>
                {tx("refreshButton", "Refresh Status")}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </DismissibleBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 12,
    alignItems: "center",
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#fef3c7",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#fde68a",
    marginTop: 4,
  },
  emoji: {
    fontSize: 34,
  },
  badge: {
    fontSize: 12,
    fontWeight: "700",
    color: "#b45309",
    backgroundColor: "#fef3c7",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    overflow: "hidden",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text.primary.light,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.gray[600],
    textAlign: "center",
  },
  infoBox: {
    alignSelf: "stretch",
    backgroundColor: "#fffbeb",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#fde68a",
    gap: 8,
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#92400e",
  },
  infoBody: {
    fontSize: 14,
    lineHeight: 22,
    color: "#78350f",
  },
  closeNote: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.gray[500],
    textAlign: "center",
  },
  refreshBtn: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(57, 211, 83, 0.35)",
    backgroundColor: "#ffffff",
    marginBottom: 4,
  },
  refreshBtnDisabled: {
    opacity: 0.7,
  },
  refreshBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: ACCENT_DARK,
  },
});
