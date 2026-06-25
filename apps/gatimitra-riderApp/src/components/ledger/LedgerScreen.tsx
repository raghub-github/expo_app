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
import { useFocusEffect } from "@react-navigation/native";
import { useLedger } from "@/src/hooks/useLedger";
import { useLedgerGraph } from "@/src/hooks/useLedgerGraph";
import { useEarningsSummary } from "@/src/hooks/useEarnings";
import type { RiderLedgerPeriod, RiderLedgerSegment } from "@/src/services/api/riderApi";
import { LedgerFilterPills } from "@/src/components/ledger/LedgerFilterPills";
import { LedgerEmptyState } from "@/src/components/ledger/LedgerEmptyState";
import { LedgerMonthlySummaryCard } from "@/src/components/ledger/LedgerMonthlySummaryCard";
import { LedgerGroupedTransactionList } from "@/src/components/ledger/LedgerGroupedTransactionList";
import { LedgerPeriodDropdown } from "@/src/components/ledger/LedgerPeriodDropdown";
import { LedgerGraphView } from "@/src/components/ledger/LedgerGraphView";
import { groupLedgerEntriesByDay } from "@/src/components/ledger/ledgerDisplay";
import {
  OrderHistoryDateRangeSheet,
} from "@/src/components/profile/OrderHistoryDateRangeSheet";
import {
  formatLedgerGraphHeaderRange,
  resolveLedgerGraphRange,
} from "@/src/components/ledger/ledgerGraphRange";
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
  const [viewMode, setViewMode] = useState<"list" | "graph">("list");
  const [graphFromDate, setGraphFromDate] = useState<Date | null>(null);
  const [graphToDate, setGraphToDate] = useState<Date | null>(null);
  const [rangeSheetVisible, setRangeSheetVisible] = useState(false);
  const [liveWeekKey, setLiveWeekKey] = useState(() => new Date().toDateString());

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

  const { data: earnings, refetch: refetchEarnings } = useEarningsSummary();
  const walletBalance = earnings?.totalBalance ?? 0;

  useFocusEffect(
    useCallback(() => {
      void refetchEarnings();
      setLiveWeekKey(new Date().toDateString());
    }, [refetchEarnings]),
  );

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

  const graphRange = useMemo(
    () => resolveLedgerGraphRange(graphFromDate, graphToDate),
    [graphFromDate, graphToDate, liveWeekKey],
  );

  const {
    data: graphData,
    isPending: graphPending,
    isRefetching: graphRefetching,
    refetch: refetchGraph,
  } = useLedgerGraph({
    segment: selectedSegment,
    from: graphRange.from.toISOString(),
    to: graphRange.to.toISOString(),
    enabled: viewMode === "graph",
  });

  const showEmpty = !isPending && !isError && entries.length === 0;
  const showInitialLoading = isPending && entries.length === 0;
  const graphHeaderRangeLabel = useMemo(
    () => formatLedgerGraphHeaderRange(graphRange.from, graphRange.to),
    [graphRange.from, graphRange.to],
  );

  const toggleWithPeriodControl = (
    <View style={styles.firstHeaderControls}>
      <View style={styles.viewToggle}>
        <Pressable
          style={[styles.toggleBtn, viewMode === "list" && styles.toggleBtnActive]}
          onPress={() => setViewMode("list")}
        >
          <Text style={[styles.toggleText, viewMode === "list" && styles.toggleTextActive]}>
            {t("ledger.viewList", "List")}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.toggleBtn, viewMode === "graph" && styles.toggleBtnActive]}
          onPress={() => setViewMode("graph")}
        >
          <Text style={[styles.toggleText, viewMode === "graph" && styles.toggleTextActive]}>
            {t("ledger.viewGraph", "Graph")}
          </Text>
        </Pressable>
      </View>
      <LedgerPeriodDropdown value={period} onChange={setPeriod} />
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={[]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={(isRefetching && !isPending) || (viewMode === "graph" && graphRefetching)}
            onRefresh={() => {
              void refetch();
              if (viewMode === "graph") void refetchGraph();
            }}
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

        <LedgerMonthlySummaryCard
          summary={summary}
          walletBalance={walletBalance}
          onViewMonthlySummary={cyclePeriod}
        />

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
              <Text style={styles.headerLabel}>{t("ledger.today", "Today")}</Text>
              {toggleWithPeriodControl}
            </View>
            <LedgerEmptyState />
          </>
        ) : (
          <View style={styles.list}>
            {viewMode === "list" ? (
              <>
                <LedgerGroupedTransactionList
                  groups={groupedEntries}
                  firstHeaderControl={toggleWithPeriodControl}
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
              </>
            ) : (
              <>
                <View style={styles.periodHeaderRow}>
                  <Pressable
                    onPress={() => setRangeSheetVisible(true)}
                    style={({ pressed }) => [styles.rangeEditableBtn, pressed && styles.rangeEditablePressed]}
                  >
                    <Text style={styles.headerLabelEditable}>{graphHeaderRangeLabel}</Text>
                  </Pressable>
                  {toggleWithPeriodControl}
                </View>
                <LedgerGraphView data={graphData} loading={graphPending} />
              </>
            )}
          </View>
        )}
      </ScrollView>
      <OrderHistoryDateRangeSheet
        visible={rangeSheetVisible}
        onClose={() => setRangeSheetVisible(false)}
        initialFrom={graphFromDate ?? graphRange.from}
        initialTo={graphToDate ?? graphRange.to}
        onApply={(from, to) => {
          setGraphFromDate(from);
          setGraphToDate(to);
        }}
      />
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
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 2,
    zIndex: 30,
  },
  headerLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
    flex: 1,
    marginRight: 10,
  },
  headerLabelEditable: {
    fontSize: 14,
    fontWeight: "800",
    color: LEDGER_TEAL,
    textDecorationLine: "underline",
  },
  rangeEditableBtn: {
    flex: 1,
    marginRight: 10,
  },
  rangeEditablePressed: {
    opacity: 0.75,
  },
  viewToggle: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E5E7EB",
    borderRadius: 999,
    padding: 2,
    marginRight: 10,
  },
  firstHeaderControls: {
    flexDirection: "row",
    alignItems: "center",
  },
  toggleBtn: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  toggleBtnActive: {
    backgroundColor: "#FFFFFF",
  },
  toggleText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
  },
  toggleTextActive: {
    color: "#111827",
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
