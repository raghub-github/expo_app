import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { LORA_BOLD } from "@/src/theme/headerFonts";
import type { RiderIncentiveProgram, IncentiveTier } from "@/src/hooks/useRiderIncentives";

type Props = {
  program: RiderIncentiveProgram;
};

function formatRupee(amount: number) {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

const INCENTIVE_SERVICE_LABELS: Record<string, string> = {
  food: "Food",
  parcel: "Parcel",
  ride_2w: "Ride — 2W",
  ride_3w: "Ride — 3W",
  ride_4w_ac: "Ride — 4W AC",
  ride_4w_non_ac: "Ride — 4W Non-AC",
  all_ride: "All ride",
};

function formatIncentiveServiceLabel(service: string) {
  return INCENTIVE_SERVICE_LABELS[service] ?? service.replace(/_/g, " ");
}

function MilestoneProgressLine({
  tiers,
  completedOrders,
}: {
  tiers: IncentiveTier[];
  completedOrders: number;
}) {
  const { t } = useTranslation();
  const maxOrders = tiers[tiers.length - 1]?.minOrders || 1;
  const progressPct = Math.min(100, (completedOrders / maxOrders) * 100);

  return (
    <View style={progress.shell}>
      <View style={progress.labelRow}>
        <Text style={progress.sectionLabel}>{t("offers.incentive", "Incentive")}</Text>
        <Text style={progress.sectionLabel}>{t("offers.tripsCount", "Trips Count")}</Text>
      </View>

      <View style={progress.amountRow}>
        {tiers.map((tier) => (
          <View key={`amt-${tier.tierNo}`} style={progress.amountCol}>
            <Text
              style={[
                progress.amountText,
                tier.unlocked && progress.amountTextDone,
                tier.isCurrent && progress.amountTextCurrent,
              ]}
              numberOfLines={1}
            >
              {formatRupee(tier.rewardAmount)}
            </Text>
          </View>
        ))}
      </View>

      <View style={progress.trackArea}>
        <View style={progress.trackLane}>
          <View style={progress.trackRail} />
          <LinearGradient
            colors={["#FB7185", "#EF4444", "#DC2626"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[progress.trackFill, { width: `${Math.max(progressPct, 4)}%` }]}
          />
        </View>

        <View style={progress.nodesRow}>
          {tiers.map((tier, idx) => {
            const reached = completedOrders >= tier.minOrders;
            const isFirst = idx === 0;
            return (
              <View key={`node-${tier.tierNo}`} style={progress.nodeCol}>
                {isFirst ? (
                  <View style={progress.scooterBubble}>
                    <MaterialCommunityIcons name="motorbike" size={14} color="#DC2626" />
                  </View>
                ) : (
                  <View
                    style={[
                      progress.node,
                      reached && progress.nodeDone,
                      tier.isCurrent && progress.nodeCurrent,
                    ]}
                  >
                    <Ionicons
                      name={reached ? "checkmark" : "lock-closed"}
                      size={10}
                      color={reached ? "#FFFFFF" : "#94A3B8"}
                    />
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>

      <View style={progress.tripRow}>
        {tiers.map((tier) => (
          <View key={`trip-${tier.tierNo}`} style={progress.tripCol}>
            <View style={[progress.tripChip, tier.unlocked && progress.tripChipDone]}>
              <Text style={[progress.tripChipText, tier.unlocked && progress.tripChipTextDone]}>
                {tier.minOrders}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View style={progress.tripPill}>
        <MaterialCommunityIcons name="counter" size={12} color="#DC2626" />
        <Text style={progress.tripPillText}>
          {t("offers.yourTripsCount", "Your trips count: {{count}}", { count: completedOrders })}
        </Text>
      </View>
    </View>
  );
}

export function DailyIncentiveCard({ program }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <Ionicons name="gift-outline" size={16} color="#111827" />
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{program.name}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.subtitle}>{program.cycleLabel}</Text>
              <Text style={styles.metaSep}>·</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {t("offers.activeFor", "Active For")}:{" "}
                <Text style={styles.serviceText}>{formatIncentiveServiceLabel(program.service)}</Text>
              </Text>
            </View>
          </View>
        </View>
        {program.isLive ? (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{t("offers.live", "LIVE")}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.earnHeadline}>
        {t("offers.earnUpto", "Earn upto {{amount}} extra", {
          amount: formatRupee(program.maxReward),
        })}
      </Text>

      {program.tiers.length > 0 ? (
        <MilestoneProgressLine tiers={program.tiers} completedOrders={program.completedOrders} />
      ) : null}

      {(program.mandatoryLoginSlots > 0 || program.minLoginDays) && (
        <View style={styles.conditions}>
          <Text style={styles.conditionsTitle}>{t("offers.offerConditions", "OFFER CONDITIONS")}</Text>

          {program.mandatoryLoginSlots > 0 ? (
            <>
              <Text style={styles.conditionLine}>
                {t("offers.mandatoryLogin", "Mandatory Login: Complete all {{count}} slots", {
                  count: program.mandatoryLoginSlots,
                })}
              </Text>
              <View style={styles.slotsRow}>
                {program.timeWindows.map((slot) => (
                  <View key={slot.id} style={styles.slotCard}>
                    <View style={[styles.slotCheck, slot.completed && styles.slotCheckDone]}>
                      {slot.completed ? (
                        <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                      ) : null}
                    </View>
                    <Text style={styles.slotLabel}>{slot.label}</Text>
                    <Text style={styles.slotTime}>
                      {slot.startTime} - {slot.endTime}
                    </Text>
                    <Text style={styles.slotDuration}>{slot.durationLabel}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {program.description ? (
            <Text style={styles.descriptionText} numberOfLines={2}>
              {program.description}
            </Text>
          ) : null}
        </View>
      )}

      {program.lockedReason === "GMITRA_MAX_REQUIRED" ? (
        <Pressable
          style={styles.lockedBanner}
          onPress={() => router.push("/your-subscription")}
          accessibilityRole="button"
          accessibilityLabel={t("offers.gmitraMaxRequired", "Subscribe to GMitra Max to unlock this incentive")}
        >
          <Ionicons name="lock-closed" size={14} color="#7C3AED" />
          <Text style={styles.lockedText}>
            {t("offers.gmitraMaxRequired", "Subscribe to GMitra Max to unlock this incentive")}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    marginHorizontal: 16,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  titleRow: { flexDirection: "row", gap: 8, flex: 1, alignItems: "center" },
  titleBlock: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: LORA_BOLD,
    fontSize: 15,
    color: "#111827",
    includeFontPadding: false,
  },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginTop: 2, gap: 4 },
  metaSep: { fontSize: 11, color: "#D1D5DB", fontWeight: "700" },
  subtitle: { fontSize: 11, color: "#6B7280" },
  serviceText: { fontWeight: "700", color: "#374151" },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  liveDot: { width: 5, height: 5, borderRadius: 999, backgroundColor: "#EF4444" },
  liveText: { fontSize: 9, fontWeight: "800", color: "#EF4444", letterSpacing: 0.4 },
  earnHeadline: {
    fontFamily: LORA_BOLD,
    fontSize: 20,
    color: "#111827",
    marginTop: 12,
    marginBottom: 12,
    includeFontPadding: false,
  },
  conditions: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#F3F4F6" },
  conditionsTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: "#9CA3AF",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  conditionLine: { fontSize: 12, fontWeight: "700", color: "#111827", marginBottom: 8 },
  slotsRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  slotCard: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    position: "relative",
  },
  slotCheck: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  slotCheckDone: { backgroundColor: "#10B981", borderColor: "#10B981" },
  slotLabel: { fontSize: 10, fontWeight: "700", color: "#6B7280", marginBottom: 2 },
  slotTime: { fontSize: 12, fontWeight: "800", color: "#111827" },
  slotDuration: { fontSize: 10, color: "#6B7280", marginTop: 2 },
  descriptionText: { fontSize: 11, color: "#6B7280", lineHeight: 16, marginTop: 4 },
  lockedBanner: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F5F3FF",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
  },
  lockedText: { fontSize: 11, fontWeight: "600", color: "#5B21B6", flex: 1 },
});

const progress = StyleSheet.create({
  shell: {
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#FFFBFA",
    borderWidth: 1,
    borderColor: "#FEE2E2",
    overflow: "visible",
  },
  labelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  sectionLabel: { fontSize: 9, fontWeight: "800", color: "#9CA3AF", letterSpacing: 0.3, textTransform: "uppercase" },
  amountRow: { flexDirection: "row", marginBottom: 10 },
  amountCol: { flex: 1, alignItems: "center" },
  amountText: { fontSize: 11, fontWeight: "800", color: "#CBD5E1" },
  amountTextDone: { color: "#334155" },
  amountTextCurrent: { color: "#DC2626" },
  trackArea: {
    height: 38,
    marginBottom: 10,
    justifyContent: "center",
    overflow: "visible",
  },
  trackLane: {
    position: "absolute",
    left: 14,
    right: 14,
    top: 14,
    height: 6,
    justifyContent: "center",
  },
  trackRail: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
  },
  trackFill: {
    position: "absolute",
    left: 0,
    height: 6,
    borderRadius: 999,
    minWidth: 6,
  },
  nodesRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 6,
    zIndex: 2,
  },
  nodeCol: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  node: {
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#64748B",
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  nodeDone: { backgroundColor: "#10B981", borderColor: "#059669" },
  nodeCurrent: { borderColor: "#EF4444", borderWidth: 2.5 },
  scooterBubble: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#FECACA",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#EF4444",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  tripRow: { flexDirection: "row", marginBottom: 10 },
  tripCol: { flex: 1, alignItems: "center" },
  tripChip: {
    minWidth: 28,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
  },
  tripChipDone: { backgroundColor: "#DCFCE7" },
  tripChipText: { fontSize: 11, fontWeight: "800", color: "#64748B" },
  tripChipTextDone: { color: "#15803D" },
  tripPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  tripPillText: { fontSize: 11, fontWeight: "700", color: "#991B1B" },
});
