import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { extractApiErrorMessage } from "@/src/services/http";
import { colors } from "@/src/theme";
import { ProfileSubscriptionCard } from "@/src/components/profile/ProfileSubscriptionCard";
import { useRiderSubscriptionPlans } from "@/src/hooks/useRiderSubscription";
import { buildCurrentWeekDates, useRiderIncentives, todayIst } from "@/src/hooks/useRiderIncentives";
import { IncentiveDateStrip } from "@/src/components/offers/IncentiveDateStrip";
import { IncentiveFilterChips } from "@/src/components/offers/IncentiveFilterChips";
import { DailyIncentiveCard } from "@/src/components/offers/DailyIncentiveCard";

export default function OffersScreen() {
  const { t } = useTranslation();
  const tabBarHeight = useBottomTabBarHeight();
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

  const { data: incentives, isLoading: incentivesLoading, refetch, isRefetching, isError, error } = useRiderIncentives(
    selectedDate,
    activeFilter,
  );

  const filters = incentives?.filters?.length
    ? incentives.filters
    : [{ key: "all", label: "All", count: 0 }];

  return (
    <SafeAreaView style={styles.root} edges={[]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarHeight + 12 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.primary[500]} />
        }
      >
        <View style={styles.padTop}>
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

        <IncentiveFilterChips filters={filters} activeFilter={activeFilter} onChange={setActiveFilter} />

        <Text style={styles.sectionTitle}>{t("offers.activeOffers", "Active Offers")}</Text>

        {incentivesLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.primary[500]} />
          </View>
        ) : isError ? (
          <View style={styles.comingSoon}>
            <Ionicons name="cloud-offline-outline" size={28} color={colors.gray[400]} />
            <Text style={styles.comingSoonText}>{t("offers.loadFailed", "Could not load offers")}</Text>
            <Text style={styles.comingSoonSub}>
              {extractApiErrorMessage(error, t("offers.checkLater", "Check back later for new offers"))}
            </Text>
          </View>
        ) : incentives?.programs.length ? (
          incentives.programs.map((program) => <DailyIncentiveCard key={program.id} program={program} />)
        ) : (
          <View style={styles.comingSoon}>
            <Ionicons name="gift-outline" size={28} color={colors.gray[400]} />
            <Text style={styles.comingSoonText}>{t("offers.noOffers", "No active offers")}</Text>
            <Text style={styles.comingSoonSub}>{t("offers.checkLater", "Check back later for new offers")}</Text>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F9FAFB" },
  padTop: { paddingHorizontal: 20, paddingTop: 12, marginBottom: 8 },
  loadingBox: { paddingVertical: 24, alignItems: "center" },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: "#111827", marginBottom: 12, paddingHorizontal: 20 },
  comingSoon: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 6,
    marginHorizontal: 16,
  },
  comingSoonText: { fontSize: 15, fontWeight: "700", color: "#374151", textAlign: "center" },
  comingSoonSub: { fontSize: 13, color: "#6B7280", textAlign: "center" },
});
