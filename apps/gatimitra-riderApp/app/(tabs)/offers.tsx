import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";
import { extractApiErrorMessage } from "@/src/services/http";
import { colors } from "@/src/theme";
import { LORA_BOLD, LORA_REGULAR } from "@/src/theme/headerFonts";
import { ProfileSubscriptionCard } from "@/src/components/profile/ProfileSubscriptionCard";
import { useRiderSubscriptionPlans } from "@/src/hooks/useRiderSubscription";
import { buildCurrentWeekDates, useRiderIncentives, todayIst } from "@/src/hooks/useRiderIncentives";
import { IncentiveDateStrip } from "@/src/components/offers/IncentiveDateStrip";
import { IncentiveFilterChips } from "@/src/components/offers/IncentiveFilterChips";
import { DailyIncentiveCard } from "@/src/components/offers/DailyIncentiveCard";
import { useMeasuredTabBarHeight } from "@/src/hooks/useRiderBottomDock";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { flexShrinkText } from "@/src/theme/responsiveText";

export default function OffersScreen() {
  const { t } = useTranslation();
  const tabBarHeight = useMeasuredTabBarHeight();
  const { rs } = useResponsiveLayout();
  const padX = rs(16);
  const { isLoading: plansLoading } = useRiderSubscriptionPlans();
  const [weekAnchor, setWeekAnchor] = useState(todayIst());
  const [selectedDate, setSelectedDate] = useState(todayIst());
  const [activeFilter, setActiveFilter] = useState("all");

  useFocusEffect(
    useCallback(() => {
      const today = todayIst();
      setWeekAnchor(today);
      setSelectedDate((prev) => {
        const week = buildCurrentWeekDates(today);
        return week.includes(prev) ? prev : today;
      });
    }, []),
  );

  const {
    data: incentives,
    isLoading: incentivesLoading,
    refetch,
    isRefetching,
    isError,
    error,
  } = useRiderIncentives(selectedDate, activeFilter);

  const filters = incentives?.filters?.length
    ? incentives.filters
    : [{ key: "all", label: "All", count: 0 }];

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.primary[50], "#F8FAFC", "#FFFFFF"]}
        locations={[0, 0.35, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarHeight + rs(16) }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={colors.primary[500]}
            colors={[colors.primary[500]]}
          />
        }
      >
        <View style={[styles.hero, { paddingHorizontal: padX }]}>
          {plansLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.primary[500]} />
            </View>
          ) : (
            <ProfileSubscriptionCard />
          )}
        </View>

        <IncentiveDateStrip
          weekAnchor={weekAnchor}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          dateBadges={incentives?.dateBadges}
        />

        <IncentiveFilterChips
          filters={filters}
          activeFilter={activeFilter}
          onChange={setActiveFilter}
        />

        {incentivesLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.primary[500]} />
          </View>
        ) : isError ? (
          <View style={[styles.emptyCard, { marginHorizontal: padX }]}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="cloud-offline-outline" size={28} color={colors.primary[600]} />
            </View>
            <Text style={[styles.emptyTitle, flexShrinkText]} numberOfLines={2}>
              {t("offers.loadFailed", "Could not load offers")}
            </Text>
            <Text style={[styles.emptySub, flexShrinkText]} numberOfLines={3}>
              {extractApiErrorMessage(
                error,
                t("offers.checkLater", "Check back later for new offers"),
              )}
            </Text>
          </View>
        ) : incentives?.programs.length ? (
          incentives.programs.map((program) => (
            <DailyIncentiveCard key={program.id} program={program} />
          ))
        ) : (
          <View style={[styles.emptyCard, { marginHorizontal: padX }]}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="gift-outline" size={28} color={colors.primary[600]} />
            </View>
            <Text style={[styles.emptyTitle, flexShrinkText]} numberOfLines={2}>
              {t("offers.noOffers", "No active offers")}
            </Text>
            <Text style={[styles.emptySub, flexShrinkText]} numberOfLines={2}>
              {t("offers.checkLater", "Check back later for new offers")}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primary[50] },
  hero: {
    paddingTop: 6,
    paddingBottom: 6,
  },
  loadingBox: { paddingVertical: 20, alignItems: "center" },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingVertical: 32,
    paddingHorizontal: 22,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.primary[100],
    gap: 8,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.primary[50],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: LORA_BOLD,
    fontWeight: "700",
    color: "#0F172A",
    textAlign: "center",
  },
  emptySub: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: LORA_REGULAR,
    color: "#64748B",
    textAlign: "center",
  },
});
