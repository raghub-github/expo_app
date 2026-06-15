import React, { useMemo, useState } from "react";
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
import { useLedger } from "@/src/hooks/useLedger";
import type { RiderLedgerPeriod, RiderLedgerSegment } from "@/src/services/api/riderApi";
import { LedgerFilterPills } from "@/src/components/ledger/LedgerFilterPills";
import { LedgerEmptyState } from "@/src/components/ledger/LedgerEmptyState";
import { LedgerMonthlySummaryCard } from "@/src/components/ledger/LedgerMonthlySummaryCard";
import { LedgerGroupedTransactionList } from "@/src/components/ledger/LedgerGroupedTransactionList";
import { LedgerPeriodDropdown } from "@/src/components/ledger/LedgerPeriodDropdown";
import { groupLedgerEntriesByDay } from "@/src/components/ledger/ledgerDisplay";
import { LEDGER_PAGE_BG, LEDGER_TEAL } from "@/src/components/ledger/ledgerUiTokens";

const PERIOD_CYCLE: RiderLedgerPeriod[] = ["this_month", "last_month", "all"];

const DEFAULT_SUMMARY = {
  totalEarnings: 0,
  totalWithdrawals: 0,
  pendingSettlement: 0,
  monthLabel: "This Month Summary",
};

export function LedgerScreen() {
  const { t } = useTranslation();
  const [selectedSegment, setSelectedSegment] = useState<RiderLedgerSegment>("all");
  const [period, setPeriod] = useState<RiderLedgerPeriod>("this_month");

  const {
    data,
    isPending,
    isError,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useLedger({ segment: selectedSegment, period, limit: 50 });

  const entries = useMemo(
    () => data?.pages.flatMap((page) => page.entries) ?? [],
    [data],
  );

  const summary = data?.pages[0]?.summary ?? DEFAULT_SUMMARY;

  const groupedEntries = useMemo(
    () => groupLedgerEntriesByDay(entries, t),
    [entries, t],
  );

  const segments = useMemo(
    () => [
      { id: "all" as const, label: t("ledger.all", "All") },
      { id: "food" as const, label: t("ledger.food", "Food") },
      { id: "parcel" as const, label: t("ledger.parcel", "Parcel") },
      { id: "ride" as const, label: t("ledger.ride", "Ride") },
      { id: "incentives" as const, label: t("ledger.incentives", "Incentives") },
      { id: "subscriptions" as const, label: t("ledger.subscriptions", "Subscription") },
      { id: "withdrawals" as const, label: t("ledger.withdrawals", "Withdrawals") },
    ],
    [t],
  );

  const cyclePeriod = () => {
    const idx = PERIOD_CYCLE.indexOf(period);
    setPeriod(PERIOD_CYCLE[(idx + 1) % PERIOD_CYCLE.length]);
  };

  const showEmpty = !isPending && !isError && entries.length === 0;
  const showInitialLoading = isPending && entries.length === 0;

  return (
    <SafeAreaView style={styles.root} edges={[]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching && !isPending}
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

        <LedgerMonthlySummaryCard summary={summary} onViewMonthlySummary={cyclePeriod} />

        {showInitialLoading ? (
          <View style={styles.centerBlock}>
            <ActivityIndicator size="large" color={LEDGER_TEAL} />
            <Text style={styles.helperText}>{t("ledger.loading", "Loading transactions…")}</Text>
          </View>
        ) : isError && entries.length === 0 ? (
          <View style={styles.centerBlock}>
            <Text style={styles.errorTitle}>{t("ledger.error", "Could not load ledger")}</Text>
            <Text style={styles.helperText}>
              {t("ledger.errorMessage", "Pull to refresh and try again.")}
            </Text>
          </View>
        ) : showEmpty ? (
          <>
            <View style={styles.periodHeaderRow}>
              <View style={styles.periodHeaderSpacer} />
              <LedgerPeriodDropdown value={period} onChange={setPeriod} />
            </View>
            <LedgerEmptyState />
          </>
        ) : (
          <View style={styles.list}>
            <LedgerGroupedTransactionList
              groups={groupedEntries}
              period={period}
              onPeriodChange={setPeriod}
            />
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
    paddingBottom: 16,
    flexGrow: 1,
  },
  filtersBlock: {
    marginBottom: 14,
  },
  centerBlock: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  helperText: {
    marginTop: 12,
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
    marginTop: 2,
  },
  periodHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginBottom: 8,
    paddingHorizontal: 2,
    zIndex: 30,
  },
  periodHeaderSpacer: {
    flex: 1,
  },
  loadMoreBtn: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  loadMorePressed: {
    opacity: 0.92,
  },
  loadMoreText: {
    fontSize: 15,
    fontWeight: "700",
    color: LEDGER_TEAL,
  },
});
