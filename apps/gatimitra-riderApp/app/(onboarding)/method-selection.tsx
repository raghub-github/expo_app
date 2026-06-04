import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useRiderStatus } from "@/src/hooks/useOnboarding";
import { resolveOnboardingHref } from "@/src/lib/onboarding-routes";
import { Logo } from "@/src/components/Logo";
import { colors } from "@/src/theme";

const ACCENT = "#39d353";
const ACCENT_DARK = "#22a745";
const BG = "#f4fbf6";

type OnboardingMethod = "manual" | "karza" | "digilocker";

const MANUAL_DOCS = ["Aadhaar", "PAN", "Driving License", "RC"];

const COMING_SOON_METHODS: {
  method: OnboardingMethod;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  time: string;
}[] = [
  {
    method: "karza",
    icon: "flash",
    title: "Fast track with Karza",
    subtitle: "API-verified Aadhaar & PAN · selfie match",
    time: "5–8 min",
  },
  {
    method: "digilocker",
    icon: "lock-closed",
    title: "Verify with DigiLocker",
    subtitle: "Aadhaar via DigiLocker · rest via Karza",
    time: "5–10 min",
  },
];

function DocChip({ label }: { label: string }) {
  return (
    <View style={styles.docChip}>
      <Ionicons name="checkmark-circle" size={13} color={ACCENT_DARK} />
      <Text style={styles.docChipText}>{label}</Text>
    </View>
  );
}

function ManualMethodCard({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.primaryCard, pressed && styles.primaryCardPressed]}
      android_ripple={{ color: "rgba(57, 211, 83, 0.12)" }}
      accessibilityRole="button"
      accessibilityLabel={t("onboarding.methodSelection.manualTitle")}
    >
      <LinearGradient
        colors={["#ffffff", "#f0fdf4"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.primaryCardGradient}
      >
        <View style={styles.primaryCardTop}>
          <View style={styles.iconCircle}>
            <Ionicons name="document-text" size={26} color={ACCENT_DARK} />
          </View>
          <View style={styles.primaryCardHeading}>
            <View style={styles.titleRow}>
              <Text style={styles.primaryTitle}>
                {t("onboarding.methodSelection.manualTitle")}
              </Text>
              <View style={styles.recommendedBadge}>
                <Text style={styles.recommendedBadgeText}>
                  {t("onboarding.methodSelection.recommended")}
                </Text>
              </View>
            </View>
            <Text style={styles.primarySubtitle}>
              {t("onboarding.methodSelection.manualDescription")}
            </Text>
          </View>
        </View>

        <View style={styles.docChipRow}>
          {MANUAL_DOCS.map((doc) => (
            <DocChip key={doc} label={doc} />
          ))}
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={16} color={colors.gray[500]} />
            <Text style={styles.metaText}>
              {t("onboarding.methodSelection.manualTime")}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="shield-checkmark-outline" size={16} color={colors.gray[500]} />
            <Text style={styles.metaText}>
              {t("onboarding.methodSelection.manualSecure")}
            </Text>
          </View>
        </View>

        <View style={styles.ctaRow}>
          <Text style={styles.ctaText}>{t("onboarding.methodSelection.startCta")}</Text>
          <View style={styles.ctaIconWrap}>
            <Ionicons name="arrow-forward" size={18} color="#ffffff" />
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function ComingSoonRow({
  icon,
  title,
  subtitle,
  time,
  badgeLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  time: string;
  badgeLabel: string;
}) {
  return (
    <View style={styles.soonRow}>
      <View style={styles.soonIconWrap}>
        <Ionicons name={icon} size={20} color={colors.gray[400]} />
      </View>
      <View style={styles.soonCopy}>
        <View style={styles.soonTitleRow}>
          <Text style={styles.soonTitle}>{title}</Text>
          <View style={styles.soonBadge}>
            <Text style={styles.soonBadgeText}>{badgeLabel}</Text>
          </View>
        </View>
        <Text style={styles.soonSubtitle} numberOfLines={2}>
          {subtitle}
        </Text>
        <Text style={styles.soonTime}>{time}</Text>
      </View>
      <View style={styles.soonLock}>
        <Ionicons name="lock-closed-outline" size={16} color={colors.gray[400]} />
      </View>
    </View>
  );
}

export default function MethodSelectionScreen() {
  const { t } = useTranslation();
  const { data, setData } = useOnboardingStore();
  const { data: riderStatus } = useRiderStatus(data.riderId);

  const handleMethodSelect = async (method: OnboardingMethod) => {
    if (method !== "manual") return;
    await setData({ onboardingMethod: method });
    const href = resolveOnboardingHref(
      riderStatus?.onboardingStatus ?? "in_progress",
      data.currentStep,
      (riderStatus?.nextOnboardingStep as any) ?? null
    );
    router.push(href);
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" backgroundColor={BG} translucent={false} />

      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <LinearGradient
          colors={["#dff5e4", BG]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.headerGradient}
        >
          <Logo size="small" iconOnly style={styles.logo} />
          <View style={styles.stepPill}>
            <Ionicons name="shield-outline" size={14} color={ACCENT_DARK} />
            <Text style={styles.stepPillText}>
              {t("onboarding.methodSelection.stepLabel")}
            </Text>
          </View>
          <Text style={styles.title}>{t("onboarding.methodSelection.title")}</Text>
          <Text style={styles.subtitle}>{t("onboarding.methodSelection.subtitle")}</Text>
        </LinearGradient>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <ManualMethodCard onPress={() => handleMethodSelect("manual")} />

          <Text style={styles.sectionLabel}>
            {t("onboarding.methodSelection.comingSoonSection")}
          </Text>

          <View style={styles.soonCard}>
            {COMING_SOON_METHODS.map((item, index) => (
              <React.Fragment key={item.method}>
                {index > 0 ? <View style={styles.soonDivider} /> : null}
                <ComingSoonRow
                  icon={item.icon}
                  title={item.title}
                  subtitle={item.subtitle}
                  time={item.time}
                  badgeLabel={t("onboarding.methodSelection.comingSoon")}
                />
              </React.Fragment>
            ))}
          </View>

          <View style={styles.tipBanner}>
            <View style={styles.tipIconWrap}>
              <Ionicons name="bulb-outline" size={20} color={ACCENT_DARK} />
            </View>
            <Text style={styles.tipText}>{t("onboarding.methodSelection.tip")}</Text>
          </View>
        </ScrollView>
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
  headerGradient: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 20,
    alignItems: "center",
  },
  logo: {
    marginBottom: 12,
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
    marginBottom: 14,
  },
  stepPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: ACCENT_DARK,
    letterSpacing: 0.2,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.gray[900],
    textAlign: "center",
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.gray[600],
    textAlign: "center",
    maxWidth: 320,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 28,
    gap: 16,
  },
  primaryCard: {
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: ACCENT,
    ...Platform.select({
      ios: {
        shadowColor: ACCENT_DARK,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  primaryCardPressed: {
    opacity: 0.96,
    transform: [{ scale: 0.992 }],
  },
  primaryCardGradient: {
    padding: 20,
    gap: 16,
  },
  primaryCardTop: {
    flexDirection: "row",
    gap: 14,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#e8fced",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(57, 211, 83, 0.35)",
  },
  primaryCardHeading: {
    flex: 1,
    gap: 6,
  },
  titleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  primaryTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.gray[900],
    letterSpacing: -0.2,
  },
  recommendedBadge: {
    backgroundColor: ACCENT,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  recommendedBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  primarySubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.gray[600],
  },
  docChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  docChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(57, 211, 83, 0.28)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  docChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.gray[700],
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metaText: {
    fontSize: 12,
    color: colors.gray[500],
    fontWeight: "500",
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  ctaIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.gray[500],
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 4,
    marginLeft: 4,
  },
  soonCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.gray[200],
    overflow: "hidden",
  },
  soonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    opacity: 0.72,
  },
  soonIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.gray[100],
    alignItems: "center",
    justifyContent: "center",
  },
  soonCopy: {
    flex: 1,
    gap: 3,
  },
  soonTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  soonTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.gray[600],
    flexShrink: 1,
  },
  soonBadge: {
    backgroundColor: colors.gray[200],
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  soonBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.gray[500],
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  soonSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.gray[400],
  },
  soonTime: {
    fontSize: 11,
    color: colors.gray[400],
    fontWeight: "500",
    marginTop: 2,
  },
  soonLock: {
    paddingLeft: 4,
  },
  soonDivider: {
    height: 1,
    backgroundColor: colors.gray[100],
    marginHorizontal: 16,
  },
  tipBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(57, 211, 83, 0.22)",
  },
  tipIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#e8fced",
    alignItems: "center",
    justifyContent: "center",
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: colors.gray[600],
  },
});
