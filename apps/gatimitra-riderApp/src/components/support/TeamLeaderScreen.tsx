// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Linking,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { SupportScreenHeader } from "@/src/components/support/SupportScreenHeader";
import { useRiderProfile } from "@/src/hooks/useRiderProfile";
import { useSessionStore } from "@/src/stores/sessionStore";
import {
  TEAM_LEADER_SUPPORT_PHONE,
  TEAM_LEADER_SUPPORT_PHONE_DISPLAY,
  TEAM_LEADER_WHATSAPP_PHONE,
  buildTeamLeaderWhatsAppMessage,
  isWithinSupportHours,
  resolveRiderIdentityForSupport,
} from "@/src/lib/team-leader-support";
import { colors } from "@/src/theme";

const TEAL = colors.primary[600];
const TEAL_DARK = "#0F766E";
const SCREEN_BG = "#F4F6F8";
const CARD_RADIUS = 22;
const CARD_BORDER = "#CBD5E1";

const CARD_SHELL = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  android: { elevation: 4 },
  default: {},
});

type IonName = ComponentProps<typeof Ionicons>["name"];

type ActionCardProps = {
  icon: IonName;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  meta?: string;
  onPress: () => void;
};

/** Standalone action card — avoids stretched rows inside a shared parent (previous layout bug). */
function ActionCard({
  icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  meta,
  onPress,
}: ActionCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionCardOuter, pressed && styles.actionCardPressed]}
      accessibilityRole="button"
    >
      <View style={[styles.actionCardInner, CARD_SHELL]}>
        <View style={[styles.actionIconWrap, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={22} color={iconColor} />
        </View>
        <View style={styles.actionCopy}>
          <Text style={styles.actionTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.actionSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
          {meta ? (
            <Text style={styles.actionMeta} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
        <View style={styles.actionChevron}>
          <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
        </View>
      </View>
    </Pressable>
  );
}

export function TeamLeaderScreen() {
  const { t } = useTranslation();
  const session = useSessionStore((s) => s.session);
  const { data: profile } = useRiderProfile();

  const { name: riderName, riderId: riderIdLabel } = useMemo(
    () => resolveRiderIdentityForSupport(profile, session?.riderId),
    [profile, session?.riderId],
  );

  const supportAvailable = isWithinSupportHours();

  const dial = () => {
    Linking.openURL(`tel:${TEAM_LEADER_SUPPORT_PHONE}`).catch(() => {
      Alert.alert(t("profile.teamLeader.callFailed", "Could not open phone dialer"));
    });
  };

  const whatsapp = () => {
    const msg = encodeURIComponent(
      buildTeamLeaderWhatsAppMessage({ riderName, riderId: riderIdLabel }),
    );
    Linking.openURL(`https://wa.me/${TEAM_LEADER_WHATSAPP_PHONE}?text=${msg}`).catch(() => {
      Alert.alert(t("profile.teamLeader.waFailed", "Could not open WhatsApp"));
    });
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <SupportScreenHeader
        variant="premium"
        title={t("profile.teamLeader.title", "Team Leader")}
        subtitle={t(
          "profile.teamLeader.subtitle",
          "Get help from your GatiMitra support team",
        )}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.heroCard, CARD_SHELL]}>
          <View
            style={[
              styles.availabilityPill,
              supportAvailable ? styles.availabilityOn : styles.availabilityOff,
            ]}
          >
            <View
              style={[
                styles.availabilityDot,
                supportAvailable ? styles.dotOn : styles.dotOff,
              ]}
            />
            <Text
              style={[
                styles.availabilityText,
                supportAvailable ? styles.availabilityTextOn : styles.availabilityTextOff,
              ]}
            >
              {supportAvailable
                ? t("profile.teamLeader.available", "Support available")
                : t("profile.teamLeader.offHours", "Outside support hours")}
            </Text>
          </View>

          <View style={styles.heroAvatarWrap}>
            <Ionicons name="headset" size={34} color={TEAL} />
          </View>

          <Text style={styles.heroTitle}>
            {t("profile.teamLeader.coordinator", "GatiMitra Rider Support")}
          </Text>

          <Text style={styles.heroBody}>
            {t(
              "profile.teamLeader.heroBody",
              "Need help with payouts, orders, onboarding, penalties, or zone changes? We're here to help.",
            )}
          </Text>
        </View>

        <Text style={styles.sectionLabel}>
          {t("profile.teamLeader.contactOptions", "Contact options")}
        </Text>

        <View style={styles.actionList}>
          <ActionCard
            icon="call"
            iconBg="#DBEAFE"
            iconColor="#1D4ED8"
            title={t("profile.teamLeader.callTitle", "Call support")}
            subtitle={TEAM_LEADER_SUPPORT_PHONE_DISPLAY}
            meta={t("profile.teamLeader.callMeta", "Toll-free · 8 AM – 10 PM")}
            onPress={dial}
          />
          <ActionCard
            icon="logo-whatsapp"
            iconBg="#DCFCE7"
            iconColor="#15803D"
            title={t("profile.teamLeader.whatsappTitle", "WhatsApp support")}
            subtitle={t(
              "profile.teamLeader.whatsappSub",
              "Get quick assistance from our support team",
            )}
            onPress={whatsapp}
          />
          <ActionCard
            icon="ticket-outline"
            iconBg="#EDE9FE"
            iconColor="#7C3AED"
            title={t("profile.teamLeader.raiseTicketTitle", "Raise a ticket")}
            subtitle={t(
              "profile.teamLeader.raiseTicketSub",
              "Track and manage your support requests in the app",
            )}
            onPress={() => router.push("/raise-ticket")}
          />
        </View>

        <View style={[styles.hoursCard, CARD_SHELL]}>
          <View style={styles.hoursIconWrap}>
            <Ionicons name="time-outline" size={22} color={TEAL_DARK} />
          </View>
          <View style={styles.hoursCopy}>
            <Text style={styles.hoursLabel}>
              {t("profile.teamLeader.hoursTitle", "Support hours")}
            </Text>
            <Text style={styles.hoursValue}>
              {t("profile.teamLeader.hoursDaily", "Available daily")}
            </Text>
            <Text style={styles.hoursRange}>
              {t("profile.teamLeader.hoursRange", "8:00 AM – 10:00 PM")}
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SCREEN_BG,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
  },
  heroCard: {
    alignSelf: "stretch",
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: CARD_RADIUS,
    borderWidth: 1.5,
    borderColor: CARD_BORDER,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 22,
    alignItems: "center",
    marginBottom: 20,
  },
  availabilityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 16,
  },
  availabilityOn: {
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  availabilityOff: {
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  availabilityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotOn: { backgroundColor: "#22C55E" },
  dotOff: { backgroundColor: "#F59E0B" },
  availabilityText: {
    fontSize: 12,
    fontWeight: "700",
  },
  availabilityTextOn: { color: "#047857" },
  availabilityTextOff: { color: "#B45309" },
  heroAvatarWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#F0FDFA",
    borderWidth: 2,
    borderColor: "#99F6E4",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  heroBody: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: "400",
    color: "#64748B",
    textAlign: "center",
    lineHeight: 21,
    alignSelf: "stretch",
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 10,
    marginLeft: 2,
  },
  actionList: {
    alignSelf: "stretch",
    width: "100%",
    gap: 12,
    marginBottom: 16,
  },
  actionCardOuter: {
    alignSelf: "stretch",
    width: "100%",
  },
  actionCardPressed: {
    opacity: 0.92,
  },
  actionCardInner: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: CARD_RADIUS,
    borderWidth: 1.5,
    borderColor: CARD_BORDER,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  actionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  actionCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    lineHeight: 22,
  },
  actionSubtitle: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "500",
    color: "#475569",
    lineHeight: 18,
  },
  actionMeta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
    color: TEAL_DARK,
  },
  actionChevron: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  hoursCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    alignSelf: "stretch",
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: CARD_BORDER,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  hoursIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#F0FDFA",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  hoursCopy: {
    flex: 1,
    minWidth: 0,
  },
  hoursLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  hoursValue: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  hoursRange: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: "700",
    color: TEAL_DARK,
  },
});
