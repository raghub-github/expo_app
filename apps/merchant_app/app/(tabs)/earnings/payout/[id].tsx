import { useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  GatiMitraMerchant,
  H_PADDING,
  TAB_BAR_SCROLL_CONTENT_PADDING_LOOSE,
} from "@/constants/theme";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useAuth } from "@/context/AuthContext";
import { fetchLedger, fetchPayoutSettlement, type LedgerEntry, type PayoutSettlementSummary } from "@/services/walletApi";
import { listBankAccounts, type BankAccount } from "@/services/bankAccountApi";
import { parsePgTimestamp } from "@/lib/parsePgTimestamp";
import {
  PAYOUT_CUSTOMER_COMPENSATION_LABEL,
  PAYOUT_STORE_OFFER_DISCOUNT_LINES,
  PAYOUT_STORE_OFFERS_SECTION_LABEL,
  buildOrderPayoutBreakdown,
  entriesInPayoutPeriod,
  filterPayoutOrderBreakdowns,
  formatCurrency,
  formatPeriodRange,
  formatShortDate,
  payoutOrderTypeFilterLabel,
  selectPayoutOrderLedgerEntries,
  orderSettlementBadge,
  MERCHANT_GROSS_REVENUE_LABEL,
  type OrderPayoutBreakdown,
  type PayoutOrderTypeFilter,
  type PayoutStatus,
} from "@/lib/merchantPayoutUtils";
import { PayoutOrderTypeFilterSheet } from "@/components/earnings/PayoutOrderTypeFilterSheet";
import { FormattedOrderId } from "@/components/order/FormattedOrderId";
import { prefetchCompensationPolicy } from "@/lib/compensationPolicyCache";

type DetailTab = "summary" | "orders";

const EMPTY_SETTLEMENT: PayoutSettlementSummary = {
  netOrderValue: 0,
  itemSubtotal: 0,
  packagingCharges: 0,
  restaurantDiscounts: 0,
  couponOfferDiscount: 0,
  percentageFlatOfferDiscount: 0,
  comboOfferDiscount: 0,
  freeDeliveryOfferDiscount: 0,
  orderDeductions: 0,
  mechanismFee: 0,
  customerCompensation: 0,
  estimatedPayout: 0,
  orderCount: 0,
  deliveredOrderCount: 0,
  rejectedOrderCount: 0,
};

function parseParamDate(value: string | undefined): Date | null {
  if (!value?.trim()) return null;
  return parsePgTimestamp(value);
}

function formatSettlementValue(amount: number, opts?: { negative?: boolean; count?: boolean }) {
  if (opts?.count) return String(amount);
  if (opts?.negative && amount > 0) return `− ${formatCurrency(amount)}`;
  return formatCurrency(amount);
}

function SettlementRow({
  label,
  amount,
  negative,
  bold,
  green,
  expanded,
  onToggle,
  showChevron = false,
  count,
}: {
  label: string;
  amount: number;
  negative?: boolean;
  bold?: boolean;
  green?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  showChevron?: boolean;
  count?: boolean;
}) {
  const display = formatSettlementValue(amount, { negative, count });
  const canToggle = showChevron && onToggle;
  const RowWrap = canToggle ? Pressable : View;

  return (
    <RowWrap
      onPress={canToggle ? onToggle : undefined}
      style={[s.settleRow, bold && s.settleRowBold]}
    >
      <View style={s.settleRowLeft}>
        {showChevron ? (
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={14}
            color={GatiMitraMerchant.textTertiary}
          />
        ) : (
          <Ionicons name="chevron-down" size={14} color={GatiMitraMerchant.textTertiary} />
        )}
        <Text style={[s.settleLabel, bold && s.settleLabelBold]}>{label}</Text>
      </View>
      <Text style={[
        s.settleAmt,
        negative && amount > 0 && s.settleAmtNeg,
        green && s.settleAmtGreen,
        bold && s.settleAmtBold,
      ]}>
        {display}
      </Text>
    </RowWrap>
  );
}

function SettlementSubRow({
  label,
  amount,
  negative,
  last,
  count,
}: {
  label: string;
  amount: number;
  negative?: boolean;
  last?: boolean;
  count?: boolean;
}) {
  const display = formatSettlementValue(amount, { negative, count });
  return (
    <View style={[s.settleSubRow, last && s.settleSubRowLast]}>
      <View style={s.settleSubLeft}>
        <View style={s.settleSubGuide} />
        <Text style={s.settleSubLabel}>{label}</Text>
      </View>
      <Text style={[s.settleSubAmt, negative && amount > 0 && s.settleAmtNeg]}>{display}</Text>
    </View>
  );
}

type SettlementBreakdownItem = {
  label: string;
  amount: number;
  negative?: boolean;
  count?: boolean;
};

function ExpandableSettlementSection({
  label,
  amount,
  items,
  negative,
  bold,
  green,
  count,
  defaultExpanded = false,
}: {
  label: string;
  amount: number;
  items: SettlementBreakdownItem[];
  negative?: boolean;
  bold?: boolean;
  green?: boolean;
  count?: boolean;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <View>
      <SettlementRow
        label={label}
        amount={amount}
        negative={negative}
        bold={bold}
        green={green}
        count={count}
        expanded={expanded}
        showChevron
        onToggle={() => setExpanded((v) => !v)}
      />
      {expanded ? (
        <View style={s.settleSubBlock}>
          {items.map((item, index) => (
            <SettlementSubRow
              key={item.label}
              label={item.label}
              amount={item.amount}
              negative={item.negative}
              count={item.count}
              last={index === items.length - 1}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function OrderPayoutCard({
  item,
  payoutStatus,
  storeName,
  storePublicId,
  storeLocation,
  onDetails,
}: {
  item: OrderPayoutBreakdown;
  payoutStatus: PayoutStatus;
  storeName: string;
  storePublicId: string;
  storeLocation: string;
  onDetails: () => void;
}) {
  const paymentLine = item.paymentLabel.toLowerCase().includes("paid")
    ? item.paymentLabel
    : `Paid ${item.paymentLabel}`;

  const isRejected = item.fulfillmentStatus === "rejected";
  const settlementBadge = orderSettlementBadge(payoutStatus);
  const showCancelLine =
    isRejected && (item.cancellationBrandPrefix || item.cancellationMessage);

  return (
    <View style={s.orderCard}>
      <View style={s.orderCardTop}>
        <View style={s.badgeRow}>
          <View style={[s.badgeDelivered, isRejected && s.badgeRejected]}>
            <Text style={[s.badgeDeliveredText, isRejected && s.badgeRejectedText]}>
              {isRejected ? "REJECTED" : "DELIVERED"}
            </Text>
          </View>
          <View style={[
            s.badgeSettled,
            settlementBadge.variant === "to_be_paid" && s.badgeToBePaid,
            settlementBadge.variant === "processing" && s.badgeProcessing,
            settlementBadge.variant === "failed" && s.badgeRejected,
          ]}>
            <Text style={[
              s.badgeSettledText,
              settlementBadge.variant === "to_be_paid" && s.badgeToBePaidText,
              settlementBadge.variant === "processing" && s.badgeProcessingText,
              settlementBadge.variant === "failed" && s.badgeRejectedText,
            ]}>
              {settlementBadge.label}
            </Text>
          </View>
        </View>
        <Pressable onPress={onDetails} hitSlop={8}>
          <Text style={s.detailsLink}>Details ›</Text>
        </Pressable>
      </View>

      <Pressable onPress={onDetails} style={s.orderIdPressable}>
        <Text style={s.orderIdLabel}>ID: </Text>
        <FormattedOrderId
          formattedOrderId={item.formattedOrderId}
          fallbackCoreId={item.ordersCoreId ?? 0}
          fallbackFoodId={item.foodOrderId ?? undefined}
          size="md"
        />
      </Pressable>

      <View style={s.orderMetaRow}>
        <Ionicons name="calendar-outline" size={14} color={GatiMitraMerchant.textTertiary} />
        <Text style={s.orderMetaText}>
          {item.deliveredLabel} · {paymentLine}
        </Text>
      </View>

      <View style={s.orderMetaRow}>
        <Ionicons name="storefront-outline" size={14} color={GatiMitraMerchant.textTertiary} />
        <Text style={s.orderMetaText} numberOfLines={2}>
          {storeName}
          {storePublicId ? ` · ID: ${storePublicId}` : ""}
          {storeLocation ? ` · ${storeLocation}` : ""}
        </Text>
      </View>

      {showCancelLine ? (
        <View style={s.cancelNotice}>
          <Text style={s.cancelNoticeText}>
            {item.cancellationBrandPrefix ? (
              <Text style={s.cancelBrandAccent}>{item.cancellationBrandPrefix} </Text>
            ) : null}
            {item.cancellationMessage}
          </Text>
        </View>
      ) : null}

      <View style={s.breakdownBox}>
        <View style={s.breakdownRow}>
          <Text style={s.breakdownLabel}>{MERCHANT_GROSS_REVENUE_LABEL}</Text>
          <Text style={s.breakdownValue}>{formatCurrency(item.grossRevenue)}</Text>
        </View>
        <View style={s.breakdownRow}>
          <Text style={s.breakdownLabel}>Net receivable</Text>
          <Text style={s.breakdownValue}>{formatCurrency(item.netReceivable)}</Text>
        </View>
        <View style={[s.breakdownRow, s.breakdownRowLast]}>
          <Text style={s.breakdownLabel}>Unsettled amount</Text>
          <Text style={s.breakdownValue}>{formatCurrency(item.unsettledAmount)}</Text>
        </View>
      </View>
    </View>
  );
}

export default function PayoutDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    netPayout: string;
    orderCount: string;
    periodStart: string;
    periodEnd: string;
    payoutDate: string;
    status: string;
    isCurrentCycle?: string;
    pgTransactionId: string;
  }>();

  const { selectedStore } = useSelectedStore();
  const { token } = useAuth();
  const storeId = selectedStore?.id ?? null;

  const [detailTab, setDetailTab] = useState<DetailTab>("summary");
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [settlement, setSettlement] = useState<PayoutSettlementSummary>(EMPTY_SETTLEMENT);
  const [bank, setBank] = useState<BankAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [orderTypeFilter, setOrderTypeFilter] = useState<PayoutOrderTypeFilter>("all");
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);

  const periodStartIso = String(params.periodStart ?? "").trim();
  const periodEndIso = String(params.periodEnd ?? "").trim();
  const periodStart = useMemo(() => parseParamDate(periodStartIso), [periodStartIso]);
  const periodEnd = useMemo(() => parseParamDate(periodEndIso), [periodEndIso]);
  const payoutDate = parseParamDate(params.payoutDate);
  const netPayout = Number(params.netPayout ?? 0);
  const status = (params.status ?? "PAID") as PayoutStatus;
  const isCurrentCycle = params.isCurrentCycle === "1" || params.id === "current-cycle";

  useEffect(() => {
    if (!storeId || !token) {
      setLoading(false);
      setLoadError(null);
      return;
    }
    if (!periodStart || !periodEnd) {
      setLoading(false);
      setLoadError("Payout period dates are missing. Go back and open this payout again.");
      return;
    }

    let cancelled = false;
    prefetchCompensationPolicy(storeId, token);
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [l, settlementData] = await Promise.all([
          fetchLedger(storeId, token, {
            limit: 200,
            from: periodStart.toISOString(),
            to: periodEnd.toISOString(),
          }),
          fetchPayoutSettlement(storeId, token, periodStart, periodEnd),
        ]);
        if (!cancelled) {
          setLedger(l.entries);
          setSettlement(settlementData);
        }
        listBankAccounts(storeId, token)
          .then((banks) => {
            if (cancelled) return;
            const primary =
              banks.find((b) => b.is_primary && !b.is_disabled) ??
              banks.find((b) => !b.is_disabled);
            setBank(primary ?? null);
          })
          .catch(() => {
            if (!cancelled) setBank(null);
          });
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Failed to load payout details");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [storeId, token, periodStartIso, periodEndIso]);

  const periodEntries = useMemo(
    () => entriesInPayoutPeriod(ledger, periodStart, periodEnd, payoutDate),
    [ledger, periodStart, periodEnd, payoutDate],
  );

  const displayHeroPayout = isCurrentCycle
    ? Math.max(0, settlement.estimatedPayout)
    : Math.max(0, netPayout);

  const orderEntries = useMemo(
    () => selectPayoutOrderLedgerEntries(periodEntries),
    [periodEntries],
  );

  const orderBreakdowns = useMemo(
    () => orderEntries.map((e) => buildOrderPayoutBreakdown(e, status)),
    [orderEntries, status],
  );

  const filteredOrderBreakdowns = useMemo(
    () => filterPayoutOrderBreakdowns(orderBreakdowns, orderTypeFilter),
    [orderBreakdowns, orderTypeFilter],
  );

  const storeName = selectedStore?.store_name ?? "Store";
  const storePublicId = selectedStore?.store_id ?? "";
  const storeLocation = selectedStore?.full_address?.split(",").slice(-2).join(",").trim() ?? "";

  const pgTnxId = useMemo(() => {
    const fromParams = params.pgTransactionId?.trim();
    if (fromParams) return fromParams;
    const ledgerId = params.id?.startsWith("w-") ? Number(params.id.slice(2)) : NaN;
    const withdrawal = Number.isFinite(ledgerId)
      ? ledger.find((e) => e.id === ledgerId && e.category === "WITHDRAWAL")
      : ledger.find((e) => e.category === "WITHDRAWAL" && e.pg_transaction_id);
    return withdrawal?.pg_transaction_id?.trim() || "—";
  }, [ledger, params.id, params.pgTransactionId]);
  const accountMasked = bank?.account_number_masked ?? bank?.account_number?.slice(-6) ?? "—";
  const accountHolder = bank?.account_holder_name?.trim() || "—";
  const bankName = bank?.bank_name?.trim() || "";

  return (
    <View style={s.container}>
      <View style={[s.stickyTabBar, { paddingHorizontal: H_PADDING, paddingTop: 8 }]}>
        <View style={s.tabRow}>
          {(["summary", "orders"] as const).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setDetailTab(tab)}
              style={[s.tabBtn, detailTab === tab && s.tabBtnActive]}
            >
              <Text style={[s.tabBtnText, detailTab === tab && s.tabBtnTextActive]}>
                {tab === "summary" ? "Summary" : "Orders"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: H_PADDING,
          paddingTop: 8,
          paddingBottom: TAB_BAR_SCROLL_CONTENT_PADDING_LOOSE + insets.bottom,
        }}
      >
        {/* Hero card */}
        <View style={s.heroCard}>
          <View style={s.heroTop}>
            <View style={s.heroCol}>
              <Text style={s.heroLabel}>{isCurrentCycle ? "Est. payout" : "Net payout"}</Text>
              <Text style={s.heroAmount}>{formatCurrency(displayHeroPayout)}</Text>
            </View>
            <View style={[s.heroCol, s.heroColRight]}>
              <Text style={s.heroLabel}>Payout for</Text>
              <Text style={s.heroPeriod}>{formatPeriodRange(periodStart, periodEnd)}</Text>
            </View>
          </View>
          {!isCurrentCycle ? (
            <>
              <View style={s.heroDivider} />
              <Text style={s.heroPayoutDate}>
                Payout date: {payoutDate ? formatShortDate(payoutDate) : "—"}
                {status === "PROCESSING" ? " · Processing" : ""}
              </Text>
            </>
          ) : null}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={GatiMitraMerchant.primary} style={{ marginTop: 32 }} />
        ) : loadError ? (
          <View style={s.errorBlock}>
            <Text style={s.errorText}>{loadError}</Text>
          </View>
        ) : detailTab === "summary" ? (
          <>
            <View style={s.sectionHead}>
              <Text style={s.sectionTitle}>Settlement summary</Text>
              <View style={s.iconRow}>
                <View style={s.iconBtn}>
                  <Ionicons name="download-outline" size={18} color={GatiMitraMerchant.textPrimary} />
                </View>
                <View style={s.iconBtn}>
                  <Ionicons name="mail-outline" size={18} color={GatiMitraMerchant.textPrimary} />
                </View>
              </View>
            </View>

            <View style={s.totalOrdersCard}>
              <ExpandableSettlementSection
                label="Total orders"
                amount={settlement.orderCount || Number(params.orderCount ?? 0)}
                count
                items={[
                  { label: "Delivered orders", amount: settlement.deliveredOrderCount, count: true },
                  { label: "Rejected orders", amount: settlement.rejectedOrderCount, count: true },
                ]}
              />
            </View>

            <View style={s.settleCard}>
              <ExpandableSettlementSection
                label="Net order value (A)"
                amount={settlement.netOrderValue}
                items={[
                  { label: "Item subtotal", amount: settlement.itemSubtotal },
                  { label: "Packaging charges", amount: settlement.packagingCharges },
                ]}
              />
              <ExpandableSettlementSection
                label={PAYOUT_STORE_OFFERS_SECTION_LABEL}
                amount={settlement.restaurantDiscounts}
                negative
                items={PAYOUT_STORE_OFFER_DISCOUNT_LINES.map((line) => ({
                  label: line.label,
                  amount: settlement[line.key],
                  negative: true,
                }))}
              />
              <ExpandableSettlementSection
                label="Order level deductions (C)"
                amount={settlement.orderDeductions}
                negative
                items={[
                  { label: "Payment mechanism fee", amount: settlement.mechanismFee, negative: true },
                  { label: PAYOUT_CUSTOMER_COMPENSATION_LABEL, amount: settlement.customerCompensation, negative: true },
                ]}
              />
              <View style={s.settleDivider} />
              <SettlementRow
                label="Est. payout (A − B − C)"
                amount={Math.max(0, settlement.estimatedPayout)}
                bold
                green
              />
            </View>

            <Text style={[s.sectionTitle, { marginTop: 20 }]}>Transaction details</Text>
            <View style={s.txCard}>
              <View style={s.txRow}>
                <Text style={s.txLabel}>PG TNX ID</Text>
                <Text style={s.txValue} numberOfLines={1}>{pgTnxId}</Text>
              </View>
              <View style={s.txDivider} />
              <View style={s.txRow}>
                <Text style={s.txLabel}>Account no.</Text>
                <View style={s.txValueCol}>
                  <Text style={s.txValue}>{accountMasked}</Text>
                  <Text style={s.txSub}>{accountHolder}</Text>
                  {bankName ? <Text style={s.txSubMuted}>{bankName}</Text> : null}
                </View>
              </View>
            </View>
          </>
        ) : detailTab === "orders" ? (
          <>
            <Pressable style={s.filterBar} onPress={() => setFilterSheetVisible(true)}>
              <Ionicons name="filter-outline" size={16} color={GatiMitraMerchant.textSecondary} />
              <Text style={s.filterText}>{payoutOrderTypeFilterLabel(orderTypeFilter)}</Text>
            </Pressable>

            {filteredOrderBreakdowns.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={s.emptyText}>
                  {orderBreakdowns.length === 0
                    ? "No orders in this payout period."
                    : `No ${orderTypeFilter === "all" ? "" : `${orderTypeFilter} `}orders in this payout period.`}
                </Text>
              </View>
            ) : (
              filteredOrderBreakdowns.map((item) => (
                <OrderPayoutCard
                  key={item.entry.id}
                  item={item}
                  payoutStatus={status}
                  storeName={storeName}
                  storePublicId={storePublicId}
                  storeLocation={storeLocation}
                  onDetails={() => {
                    if (item.foodOrderId != null) {
                      router.push({ pathname: "/order/[id]", params: { id: String(item.foodOrderId) } });
                    }
                  }}
                />
              ))
            )}
          </>
        ) : null}
      </ScrollView>

      <PayoutOrderTypeFilterSheet
        visible={filterSheetVisible}
        value={orderTypeFilter}
        onClose={() => setFilterSheetVisible(false)}
        onApply={setOrderTypeFilter}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAFAFA" },
  stickyTabBar: {
    backgroundColor: "#FAFAFA",
    zIndex: 20,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: "#EFEFEF",
    borderRadius: 10,
    padding: 4,
    marginBottom: 14,
  },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  tabBtnActive: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  tabBtnText: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  tabBtnTextActive: { color: GatiMitraMerchant.textPrimary, fontWeight: "700" },
  heroCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EEEEEE",
    padding: 16,
    marginBottom: 16,
  },
  heroTop: { flexDirection: "row", justifyContent: "space-between" },
  heroCol: { flex: 1 },
  heroColRight: { alignItems: "flex-end" },
  heroLabel: { fontSize: 12, color: GatiMitraMerchant.textTertiary, marginBottom: 4 },
  heroAmount: { fontSize: 28, fontWeight: "800", color: GatiMitraMerchant.textPrimary, letterSpacing: -0.5 },
  heroPeriod: { fontSize: 15, fontWeight: "700", color: GatiMitraMerchant.textPrimary, textAlign: "right" },
  heroDivider: {
    borderStyle: "dashed",
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    marginVertical: 14,
  },
  heroPayoutDate: { fontSize: 13, color: GatiMitraMerchant.textSecondary, fontWeight: "500" },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: GatiMitraMerchant.textPrimary },
  iconRow: { flexDirection: "row", gap: 8 },
  iconBtn: {
    width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: "#E8E8E8",
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
  },
  totalOrdersCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EEEEEE",
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 10,
  },
  totalOrdersBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#EEEEEE",
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10,
  },
  totalOrdersText: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  totalOrdersCount: { fontSize: 15, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  settleCard: {
    backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#EEEEEE",
    paddingHorizontal: 14, paddingVertical: 4,
  },
  settleRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#F5F5F5",
  },
  settleRowBold: { borderBottomWidth: 0, paddingTop: 14 },
  settleRowLeft: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, marginRight: 8 },
  settleLabel: { fontSize: 13, color: GatiMitraMerchant.textSecondary, flex: 1 },
  settleLabelBold: { fontSize: 13, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  settleAmt: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  settleAmtNeg: { color: "#DC2626" },
  settleAmtGreen: { color: "#16A34A", fontSize: 16 },
  settleAmtBold: { fontWeight: "800" },
  settleDivider: { height: 1, backgroundColor: "#EEEEEE", marginVertical: 4 },
  settleSubBlock: {
    marginLeft: 8,
    paddingLeft: 12,
    borderLeftWidth: 1,
    borderLeftColor: "#E5E7EB",
    marginBottom: 4,
  },
  settleSubRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F5F5F5",
    borderStyle: "dashed",
  },
  settleSubRowLast: { borderBottomWidth: 0 },
  settleSubLeft: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, marginRight: 8 },
  settleSubGuide: { width: 0 },
  settleSubLabel: { fontSize: 13, color: GatiMitraMerchant.textSecondary, flexShrink: 1 },
  settleSubAmt: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  txCard: {
    backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#EEEEEE",
    padding: 16, marginTop: 10,
  },
  txRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  txLabel: { fontSize: 13, color: GatiMitraMerchant.textTertiary, fontWeight: "500" },
  txValue: { fontSize: 14, fontWeight: "700", color: GatiMitraMerchant.textPrimary, textAlign: "right", flexShrink: 1 },
  txValueCol: { alignItems: "flex-end", flexShrink: 1 },
  txSub: { fontSize: 12, color: GatiMitraMerchant.textSecondary, marginTop: 2 },
  txSubMuted: { fontSize: 11, color: GatiMitraMerchant.textTertiary, marginTop: 2 },
  txDivider: {
    borderStyle: "dashed",
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    marginVertical: 14,
  },
  listCard: {
    backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#EEEEEE",
    paddingHorizontal: 14, paddingVertical: 4,
  },
  listRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#F5F5F5",
  },
  listTitle: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  listSub: { fontSize: 12, color: GatiMitraMerchant.textSecondary, marginTop: 2 },
  listAmtGreen: { fontSize: 14, fontWeight: "700", color: "#16A34A" },
  listAmtRed: { fontSize: 14, fontWeight: "700", color: "#DC2626" },
  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EEEEEE",
    marginTop: 4,
  },
  emptyText: { fontSize: 13, color: GatiMitraMerchant.textTertiary, textAlign: "center", padding: 24 },
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#EEEEEE",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  filterText: { flex: 1, fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  orderCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EEEEEE",
    padding: 14,
    marginBottom: 12,
  },
  orderCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  badgeRow: { flexDirection: "row", gap: 6, flex: 1, flexWrap: "wrap" },
  badgeDelivered: {
    backgroundColor: "#F0F0F0",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  badgeDeliveredText: { fontSize: 10, fontWeight: "700", color: GatiMitraMerchant.textSecondary, letterSpacing: 0.3 },
  badgeRejected: { backgroundColor: "#FEE2E2" },
  badgeRejectedText: { color: "#DC2626" },
  badgeSettled: {
    backgroundColor: "#E8F5E9",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  badgeUnsettled: { backgroundColor: "#FFF3E0" },
  badgeSettledText: { fontSize: 10, fontWeight: "700", color: "#2E7D32", letterSpacing: 0.3 },
  badgeToBePaid: { backgroundColor: "#FFF3E0" },
  badgeToBePaidText: { color: "#E65100" },
  badgeProcessing: { backgroundColor: "#FFF8E1" },
  badgeProcessingText: { color: "#F57F17" },
  badgeUnsettledText: { color: "#E65100" },
  detailsLink: { fontSize: 13, fontWeight: "600", color: "#2563EB" },
  orderIdPressable: { flexDirection: "row", alignItems: "baseline", marginBottom: 10 },
  orderIdLabel: { fontSize: 16, fontWeight: "800", color: GatiMitraMerchant.textPrimary },
  orderIdText: { fontSize: 16, fontWeight: "800", color: GatiMitraMerchant.textPrimary, marginBottom: 10 },
  orderMetaRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: 8 },
  orderMetaText: { flex: 1, fontSize: 12, color: GatiMitraMerchant.textSecondary, lineHeight: 17 },
  cancelNotice: {
    marginBottom: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  cancelNoticeText: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 18,
  },
  cancelBrandAccent: {
    color: "#DC2626",
    fontWeight: "700",
  },
  breakdownBox: {
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
    paddingTop: 10,
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  breakdownRowLast: { paddingBottom: 0 },
  breakdownLabel: { fontSize: 13, color: GatiMitraMerchant.textSecondary },
  breakdownValue: { fontSize: 13, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  errorBlock: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: {
    fontSize: 14,
    color: "#B91C1C",
    textAlign: "center",
    lineHeight: 20,
  },
});
