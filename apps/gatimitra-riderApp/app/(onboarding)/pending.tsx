// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useRiderStatus } from "@/src/hooks/useOnboarding";
import {
  StepProgress,
  onboardingFormStyles as form,
} from "@/src/components/onboarding/OnboardingFormUi";
import { canAccessHome } from "@/src/lib/onboarding-routes";
import { colors } from "@/src/theme";

function isRiderApproved(status?: {
  onboardingStatus?: string;
  accountStatus?: string;
} | null): boolean {
  return canAccessHome(status?.onboardingStatus, status?.accountStatus);
}

const ACCENT = "#39d353";
const ACCENT_DARK = "#22a745";
const BG = "#f4fbf6";

const ONBOARDING_STEPS = ["KYC", "Vehicle", "Payment", "Approval"];

export default function PendingScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, hydrate } = useOnboardingStore();
  const { data: riderStatus, refetch, isFetching } = useRiderStatus(data.riderId);
  const approved = isRiderApproved(riderStatus);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const goToHome = useCallback(() => {
    router.replace("/(tabs)/orders");
  }, []);

  useEffect(() => {
    if (approved) {
      goToHome();
    }
  }, [approved, goToHome]);

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["rider", data.riderId] });
    const result = await refetch();
    if (isRiderApproved(result.data)) {
      goToHome();
    }
  }, [queryClient, data.riderId, refetch, goToHome]);

  const tx = (key: string, fallback: string) =>
    t(`onboarding.pending.${key}`, { defaultValue: fallback });

  return (
    <View style={form.root}>
      <StatusBar style="dark" backgroundColor={BG} translucent={false} />

      <SafeAreaView style={form.safeArea} edges={["top", "bottom"]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={form.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={["#dff5e4", BG]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[form.header, styles.headerExtra]}
          >
            <View style={styles.headerTopRow}>
              <View style={styles.headerSpacer} />
              <TouchableOpacity
                onPress={() => router.push("/raise-ticket")}
                accessibilityRole="button"
                accessibilityLabel={tx("helpButton", "Get help")}
                style={styles.helpBtn}
              >
                <Ionicons name="help-circle-outline" size={22} color={ACCENT_DARK} />
                <Text style={styles.helpBtnText}>{tx("helpButton", "Help")}</Text>
              </TouchableOpacity>
            </View>

            <StepProgress steps={ONBOARDING_STEPS} currentIndex={3} />

            <View style={[form.stepPill, styles.stepPillSpaced]}>
              <Ionicons name="hourglass-outline" size={14} color={ACCENT_DARK} />
              <Text style={form.stepPillText}>{tx("stepLabel", "Step 4 · Pending approval")}</Text>
            </View>

            <Text style={form.title}>{tx("title", "Pending Approval")}</Text>
            <Text style={form.subtitle}>
              {tx(
                "subtitle",
                "Your documents have been submitted and payment has been received. Our team is reviewing your application."
              )}
            </Text>
          </LinearGradient>

          <View style={[form.formCard, styles.contentCard]}>
            <View style={styles.statusHero}>
              <View style={styles.statusIconWrap}>
                <Text style={styles.statusEmoji}>⏳</Text>
              </View>
              <Text style={styles.statusBadge}>
                {approved
                  ? tx("statusApproved", "Approved")
                  : tx("statusBadge", "Under review")}
              </Text>
            </View>

            <View style={styles.infoBox}>
              <View style={styles.infoBoxHeader}>
                <Ionicons name="information-circle-outline" size={18} color="#b45309" />
                <Text style={styles.infoBoxTitle}>
                  {tx("whatsNext", "What happens next?")}
                </Text>
              </View>
              <Text style={styles.infoBoxBody}>
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
                "You can close the app. We'll notify you when your account is approved."
              )}
            </Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
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
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/raise-ticket")}
            style={styles.helpFooterBtn}
            accessibilityRole="button"
            accessibilityLabel={tx("raiseTicket", "Raise a support ticket")}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={18} color="#ffffff" />
            <Text style={styles.helpFooterBtnText}>
              {tx("raiseTicket", "Raise a Ticket")}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  headerExtra: {
    paddingBottom: 24,
  },
  headerTopRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 4,
  },
  headerSpacer: {
    flex: 1,
  },
  helpBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "rgba(57, 211, 83, 0.25)",
  },
  helpBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: ACCENT_DARK,
  },
  stepPillSpaced: {
    marginTop: 8,
  },
  contentCard: {
    gap: 16,
    marginBottom: 8,
  },
  statusHero: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  statusIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#fef3c7",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  statusEmoji: {
    fontSize: 36,
  },
  statusBadge: {
    fontSize: 13,
    fontWeight: "700",
    color: "#b45309",
    backgroundColor: "#fef3c7",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    overflow: "hidden",
  },
  infoBox: {
    backgroundColor: "#fffbeb",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#fde68a",
    gap: 8,
  },
  infoBoxHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoBoxTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#92400e",
  },
  infoBoxBody: {
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
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 4 : 12,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: "rgba(57, 211, 83, 0.15)",
    gap: 10,
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(57, 211, 83, 0.35)",
    backgroundColor: "#ffffff",
  },
  refreshBtnDisabled: {
    opacity: 0.7,
  },
  refreshBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: ACCENT_DARK,
  },
  helpFooterBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: ACCENT,
  },
  helpFooterBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#ffffff",
  },
});
