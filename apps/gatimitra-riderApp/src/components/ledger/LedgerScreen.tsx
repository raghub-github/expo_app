import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "expo-router";
import { useLedger } from "@/src/hooks/useLedger";
import type { RiderLedgerPeriod, RiderLedgerSegment } from "@/src/services/api/riderApi";
import { LedgerFilterPills } from "@/src/components/ledger/LedgerFilterPills";
import { LedgerPeriodSelector } from "@/src/components/ledger/LedgerPeriodSelector";
import { LedgerEmptyState } from "@/src/components/ledger/LedgerEmptyState";
import { LedgerTransactionCard } from "@/src/components/ledger/LedgerTransactionCard";
import { LEDGER_PAGE_BG, LEDGER_TEAL } from "@/src/components/ledger/ledgerUiTokens";

const PERIOD_CYCLE: RiderLedgerPeriod[] = ["this_month", "last_month", "all"];

export function LedgerScreen() {
  const { t } = useTranslation();
  const [selectedSegment, setSelectedSegment] = useState<RiderLedgerSegment>("all");
  const [period, setPeriod] = useState<RiderLedgerPeriod>("this_month");

  const {
    data,
    isLoading,
    isError,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useLedger({ segment: selectedSegment, period, limit: 50 });

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const entries = useMemo(
    () => data?.pages.flatMap((page) => page.entries) ?? [],
    [data],
  );

  const totalCount = data?.pages[0]?.total ?? 0;

  const segments = useMemo(
    () => [
      { id: "all" as const, label: t("ledger.all", "All") },
      { id: "food" as const, label: t("ledger.food", "Food") },
      { id: "parcel" as const, label: t("ledger.parcel", "Parcel") },
      { id: "ride" as const, label: t("ledger.ride", "Ride") },
      { id: "incentives" as const, label: t("ledger.incentives", "Incentives") },
      { id: "adjustments" as const, label: t("ledger.adjustments", "Adjustments") },
      { id: "penalties" as const, label: t("ledger.penalties", "Penalties") },
    ],
    [t],
  );

  const cyclePeriod = () => {
    const idx = PERIOD_CYCLE.indexOf(period);
    setPeriod(PERIOD_CYCLE[(idx + 1) % PERIOD_CYCLE.length]);
  };

  const periodButtonLabel =
    period === "this_month"
      ? t("ledger.thisMonth", "This month")
      : period === "last_month"
        ? t("ledger.lastMonth", "Last month")
        : t("ledger.allTime", "All time");

  const showEmpty = !isLoading && !isError && entries.length === 0;

  return (
    <SafeAreaView style={styles.root} edges={["bottom"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        refreshControl={
          <RefreshControl
            refreshing={isRefetching && !isLoading}
            onRefresh={() => void refetch()}
            tintColor={LEDGER_TEAL}
          />
        }
      >
        <View style={styles.filtersBlock}>
          <LedgerFilterPills
            segments={segments}
            selected={selectedSegment}
            onSelect={setSelectedSegment}
          />
        </View>

        <LedgerPeriodSelector label={periodButtonLabel} onPress={cyclePeriod} />

        {isLoading ? (
          <View style={styles.centerBlock}>
            <ActivityIndicator size="large" color={LEDGER_TEAL} />
            <Text style={styles.helperText}>{t("ledger.loading", "Loading transactions…")}</Text>
          </View>
        ) : isError ? (
          <View style={styles.centerBlock}>
            <Text style={styles.errorTitle}>{t("ledger.error", "Could not load ledger")}</Text>
            <Text style={styles.helperText}>
              {t("ledger.errorMessage", "Pull to refresh and try again.")}
            </Text>
          </View>
        ) : showEmpty ? (
          <LedgerEmptyState />
        ) : (
          <View style={styles.list}>
            <Text style={styles.listMeta}>
              {t("ledger.showingCount", "{{count}} transactions", { count: totalCount })}
            </Text>
            {entries.map((entry) => (
              <LedgerTransactionCard key={`${entry.id}-${entry.createdAt}`} entry={entry} />
            ))}
            {hasNextPage ? (
              <Pressable
                onPress={() => void fetchNextPage()}
                style={({ pressed }) => [styles.loadMoreBtn, pressed && styles.loadMorePressed]}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? (
                  <ActivityIndicator color={LEDGER_TEAL} />
                ) : (
                  <Text style={styles.loadMoreText}>{t("ledger.loadMore", "Load more")}</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: LEDGER_PAGE_BG,
  },
  scroll: {
    flex: 1,
    backgroundColor: LEDGER_PAGE_BG,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 32,
    flexGrow: 1,
  },
  filtersBlock: {
    marginBottom: 14,
  },
  centerBlock: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 12,
    backgroundColor: LEDGER_PAGE_BG,
  },
  helperText: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  list: {
    marginTop: 4,
  },
  listMeta: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  loadMoreBtn: {
    marginTop: 4,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
  },
  loadMorePressed: {
    opacity: 0.9,
  },
  loadMoreText: {
    fontSize: 15,
    fontWeight: "700",
    color: LEDGER_TEAL,
  },
});
