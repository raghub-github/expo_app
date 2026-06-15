/**
 * Zomato-style scrollable bill summary — bill rows, savings, gratitude tip, feeding India.
 * Presentation only; amounts and handlers come from checkout.
 */

import { useMemo, useState, type ReactNode } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { BillingLine, CalculateBillResponse } from "@/services/billing.service";
import { GatiMitraColors } from "@/constants/gatimitra";
import {
  CheckoutGratitudeSections,
  type CheckoutGratitudeSectionsProps,
} from "@/components/checkout/CheckoutGratitudeSections";
import {
  formatDeliveryDistanceKmLabel,
  formatDeliverySlabExplainSubtext,
} from "@/lib/deliverySlabBreakdown";

const GM = GatiMitraColors;
const BILL_DISCOUNT_COLOR = "#2563EB";
const SAVINGS_BANNER_BG = "#E0F2FE";
const SAVINGS_TEXT_COLOR = "#2563EB";
const SAVINGS_PLAN_GOLD = "#CB7F00";
const OKAY_COLOR = GM.emerald;
const SCALLOP_COUNT = 34;
const SCALLOP_BUMPS = Array.from({ length: SCALLOP_COUNT }, (_, i) => i);

function SavingsScallopWave() {
  return (
    <View style={styles.scallopRow}>
      {SCALLOP_BUMPS.map((i) => (
        <View key={i} style={styles.scallopBump} />
      ))}
    </View>
  );
}

function BillSavingsBanner({
  totalSaved,
  subscriptionWaived,
  planName,
}: {
  totalSaved: number;
  subscriptionWaived: number;
  planName: string;
}) {
  const total = Math.round(totalSaved);
  const subWaived = Math.round(subscriptionWaived);

  return (
    <View style={styles.savingsBannerOuter}>
      <SavingsScallopWave />
      <View style={styles.savingsBanner}>
        <Text style={styles.savingsText}>
          🥳 You saved ₹{total}
          {subWaived > 0 ? (
            <>
              , including ₹{subWaived} with{" "}
              <Text style={styles.savingsBrand}>{planName}</Text>
            </>
          ) : (
            " on this order"
          )}
        </Text>
      </View>
    </View>
  );
}

function fmt(n: number): string {
  return `₹${n.toFixed(2)}`;
}

function BillInfoModal({
  visible,
  title,
  body,
  onClose,
}: {
  visible: boolean;
  title: string;
  body: string;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.infoBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>{title}</Text>
          <Text style={styles.infoBody}>{body}</Text>
          <Pressable onPress={onClose} style={styles.infoOkBtn} hitSlop={8}>
            <Text style={styles.infoOkText}>OKAY</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function BillLineRow({
  label,
  value,
  subtext,
  onLabelPress,
  valueNode,
  valueStyle,
  rowStyle,
  labelAccent,
  dashedUnderline = false,
}: {
  label: string;
  value?: string;
  subtext?: string;
  onLabelPress?: () => void;
  valueNode?: ReactNode;
  valueStyle?: object;
  rowStyle?: StyleProp<ViewStyle>;
  labelAccent?: boolean;
  dashedUnderline?: boolean;
}) {
  const labelText = (
    <Text style={[dashedUnderline ? styles.dashedLabelText : styles.plainLabelText, labelAccent && styles.discountLabel]}>
      {label}
    </Text>
  );

  const labelBlock = dashedUnderline ? (
    <View style={styles.dashedLabelWrap}>{labelText}</View>
  ) : (
    labelText
  );

  return (
    <View style={[styles.lineRow, rowStyle]}>
      <View style={styles.lineLeft}>
        {onLabelPress ? (
          <Pressable onPress={onLabelPress} hitSlop={8} accessibilityRole="button">
            {labelBlock}
          </Pressable>
        ) : (
          labelBlock
        )}
        {subtext ? <Text style={styles.lineSubtext}>{subtext}</Text> : null}
      </View>
      {valueNode ?? <Text style={[styles.lineValue, valueStyle]}>{value}</Text>}
    </View>
  );
}

function DeliveryFeeValue({
  originalInr,
  currentInr,
}: {
  originalInr: number;
  currentInr: number;
}) {
  const waived = originalInr > 0.005 && currentInr <= 0.005;
  if (waived) {
    return (
      <View style={styles.deliveryValueCluster}>
        <Text style={styles.strikeValue}>{fmt(originalInr)}</Text>
        <Text style={styles.waivedValue}>{fmt(0)}</Text>
      </View>
    );
  }
  return <Text style={styles.lineValue}>{fmt(currentInr)}</Text>;
}

function DeliveryFeeBreakdownModal({
  visible,
  onClose,
  planName,
  distanceKm,
  baseFeeInr,
  currentDeliveryInr,
  smallOrderInr,
  subscriptionWaivedInr,
  deliverySubtext,
}: {
  visible: boolean;
  onClose: () => void;
  planName: string;
  distanceKm: number | null;
  baseFeeInr: number;
  currentDeliveryInr: number;
  smallOrderInr: number;
  subscriptionWaivedInr: number;
  deliverySubtext?: string | null;
}) {
  const kmLabel = formatDeliveryDistanceKmLabel(distanceKm);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.infoBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.breakdownCard}>
          <View style={styles.breakdownLine}>
            <View style={styles.breakdownLineLeft}>
              <Text style={styles.breakdownTitle}>Base fee for {kmLabel}</Text>
              {deliverySubtext ? <Text style={styles.breakdownSub}>{deliverySubtext}</Text> : null}
            </View>
            <Text style={styles.breakdownAmount}>{fmt(baseFeeInr)}</Text>
          </View>

          {smallOrderInr > 0.005 ? (
            <>
              <View style={styles.breakdownDivider} />
              <View style={styles.breakdownLine}>
                <Text style={styles.breakdownTitle}>Small order fee</Text>
                <View style={styles.deliveryValueCluster}>
                  <Text style={styles.strikeValue}>{fmt(smallOrderInr)}</Text>
                  <Text style={styles.waivedValue}>{fmt(0)}</Text>
                </View>
              </View>
            </>
          ) : null}

          {subscriptionWaivedInr > 0.005 ? (
            <>
              <View style={styles.breakdownDivider} />
              <View style={styles.breakdownLine}>
                <Text style={[styles.breakdownTitle, styles.brandText]}>
                  Free delivery with {planName}
                </Text>
                <Text style={[styles.breakdownAmount, styles.brandText]}>
                  − {fmt(subscriptionWaivedInr)}
                </Text>
              </View>
            </>
          ) : null}

          <View style={styles.breakdownDivider} />
          <View style={styles.breakdownLine}>
            <Text style={styles.breakdownNetLabel}>Delivery partner fee</Text>
            <Text style={styles.breakdownNetAmount}>{fmt(currentDeliveryInr)}</Text>
          </View>

          <Pressable onPress={onClose} style={styles.infoOkBtn} hitSlop={8}>
            <Text style={styles.infoOkText}>OKAY</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export type BillSummaryGratitudeProps = CheckoutGratitudeSectionsProps;

export type BillSummarySheetProps = {
  visible: boolean;
  onClose: () => void;
  bottomInset: number;
  maxHeight: number;
  serverBill: CalculateBillResponse | null;
  billingError: boolean;
  billingLoading: boolean;
  deliveryType: "delivery" | "self_pickup";
  showDeliveryFeeRow: boolean;
  deliveryFeeStrikeAmount: number | null;
  distanceKm: number | null;
  subscriptionPlanName: string;
  billSubscriptionCharges: BillingLine[];
  gstAndOtherBreakdown: { total: number; lines: { key: string; label: string; amount: number; sub?: string }[] } | null;
  onGstInfoPress: () => void;
  visibleDiscounts: BillingLine[];
  showItemTotalStrike: boolean;
} & CheckoutGratitudeSectionsProps;

export function BillSummarySheet({
  visible,
  onClose,
  bottomInset,
  maxHeight,
  serverBill,
  billingError,
  billingLoading,
  deliveryType,
  showDeliveryFeeRow,
  deliveryFeeStrikeAmount,
  distanceKm,
  subscriptionPlanName,
  billSubscriptionCharges,
  gstAndOtherBreakdown,
  onGstInfoPress,
  visibleDiscounts,
  showItemTotalStrike,
  tipValue,
  onTipSelect,
  tipCustomMode,
  onTipCustomMode,
  tipCustomInput,
  onTipCustomInputChange,
  donationEnabled,
  donationPreset,
  donationAmount,
  onDonationPresetPress,
  onDonationClear,
  onDonationAmountChange,
  onFeedingInfoPress,
  onDonateEveryOrderPress,
  donationScope = "every_order",
}: BillSummarySheetProps) {
  const [deliveryBreakdownOpen, setDeliveryBreakdownOpen] = useState(false);
  const [infoModal, setInfoModal] = useState<null | "packaging" | "platform">(null);

  const subscriptionWaivedInr = useMemo(() => {
    if (!serverBill) return 0;
    const fromApi = serverBill.deliveryFeeWaivedInr ?? 0;
    if (fromApi > 0.005) return fromApi;
    const disc = (serverBill.discounts ?? []).find(
      (d) => !d.hidden && d.meta?.source === "customer_subscription_free_delivery"
    );
    return disc?.amount ?? 0;
  }, [serverBill]);

  const deliverySubtext = useMemo(() => {
    if (!serverBill) return null;
    if (serverBill.deliveryFeeExplainSubtext?.trim()) {
      return serverBill.deliveryFeeExplainSubtext.trim();
    }
    return formatDeliverySlabExplainSubtext({
      pricingEngine: serverBill.deliveryPricingEngine,
      slabQuote: serverBill.deliverySlabQuote ?? null,
    });
  }, [serverBill]);

  const grandTotalBeforeDiscounts = useMemo(() => {
    if (!serverBill) return 0;
    return (
      serverBill.finalAmount -
      serverBill.tipAmount -
      serverBill.donationAmount +
      serverBill.discountTotal
    );
  }, [serverBill]);

  const discountRows = useMemo(() => {
    if (!serverBill) return [];
    return visibleDiscounts.filter((d) => d.amount > 0.005);
  }, [serverBill, visibleDiscounts]);

  const showSavingsBanner = serverBill != null && serverBill.discountTotal > 0.005;

  const deliveryOriginalInr =
    deliveryFeeStrikeAmount ??
    serverBill?.deliveryFeeQuotedInr ??
    serverBill?.components.delivery.taxable_value ??
    0;
  const deliveryCurrentInr = serverBill?.components.delivery.taxable_value ?? 0;
  const smallOrderInr = serverBill?.components.small_order.taxable_value ?? 0;

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        onRequestClose={onClose}
      >
        <View style={styles.root}>
          <Pressable style={styles.dim} onPress={onClose} />
          <View style={[styles.card, { maxHeight, paddingBottom: Math.max(bottomInset, 12) + 8 }]}>
            <View style={styles.closeWrap}>
              <Pressable style={styles.closeRing} onPress={onClose} hitSlop={14} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollContent}
              bounces
            >
              <Text style={styles.sheetTitle}>Bill Summary</Text>

              {serverBill ? (
                <>
                  <BillLineRow
                    label="Item total"
                    value={fmt(showItemTotalStrike ? serverBill.itemsNetAfterDiscounts : serverBill.itemTotal)}
                    valueNode={
                      showItemTotalStrike ? (
                        <View style={styles.deliveryValueCluster}>
                          <Text style={styles.strikeValue}>{fmt(serverBill.itemTotal)}</Text>
                          <Text style={styles.lineValue}>{fmt(serverBill.itemsNetAfterDiscounts)}</Text>
                        </View>
                      ) : undefined
                    }
                  />

                  {serverBill.addonTotal > 0.005 ? (
                    <BillLineRow label="Add-ons" value={fmt(serverBill.addonTotal)} />
                  ) : null}

                  {serverBill.components.packaging.taxable_value > 0.005 ? (
                    <BillLineRow
                      label="Restaurant packaging charges"
                      value={fmt(serverBill.components.packaging.taxable_value)}
                      subtext="This is decided & charged by the restaurant"
                      dashedUnderline
                      onLabelPress={() => setInfoModal("packaging")}
                    />
                  ) : null}

                  {showDeliveryFeeRow ? (
                    <BillLineRow
                      label="Delivery partner fee"
                      dashedUnderline
                      onLabelPress={() => setDeliveryBreakdownOpen(true)}
                      valueNode={
                        <DeliveryFeeValue
                          originalInr={deliveryOriginalInr}
                          currentInr={deliveryCurrentInr}
                        />
                      }
                    />
                  ) : null}

                  {serverBill.components.platform.taxable_value > 0.005 ? (
                    <BillLineRow
                      label="Platform fee"
                      value={fmt(serverBill.components.platform.taxable_value)}
                      dashedUnderline
                      onLabelPress={() => setInfoModal("platform")}
                    />
                  ) : null}

                  {serverBill.components.surge.taxable_value > 0.005 ? (
                    <BillLineRow label="Surge fee" value={fmt(serverBill.components.surge.taxable_value)} />
                  ) : null}

                  {serverBill.components.small_order.taxable_value > 0.005 && deliveryType === "delivery" ? (
                    <BillLineRow
                      label="Small order fee"
                      value={fmt(serverBill.components.small_order.taxable_value)}
                    />
                  ) : null}

                  {serverBill.components.convenience.taxable_value > 0.005 ? (
                    <BillLineRow label="Convenience fee" value={fmt(serverBill.components.convenience.taxable_value)} />
                  ) : null}

                  {billSubscriptionCharges.map((c, idx) => (
                    <BillLineRow key={`sub-${c.ruleId ?? c.meta?.planId ?? idx}`} label={c.label} value={fmt(c.amount)} />
                  ))}

                  {gstAndOtherBreakdown != null && gstAndOtherBreakdown.total > 0.005 ? (
                    <BillLineRow
                      label="GST (govt. taxes)"
                      value={fmt(gstAndOtherBreakdown.total)}
                      dashedUnderline
                      onLabelPress={onGstInfoPress}
                    />
                  ) : null}

                  <View style={styles.sectionDivider} />
                  <BillLineRow label="Grand Total" value={fmt(grandTotalBeforeDiscounts)} valueStyle={styles.grandTotalValue} />

                  {discountRows.map((d, idx) => (
                    <BillLineRow
                      key={`disc-${d.ruleId ?? idx}-${d.label}`}
                      label={d.label}
                      value={`- ${fmt(d.amount)}`}
                      valueStyle={styles.discountValue}
                      labelAccent
                      rowStyle={styles.discountRow}
                    />
                  ))}

                  <View style={styles.toPayRow}>
                    <Text style={styles.toPayLabel}>To pay</Text>
                    <Text style={styles.toPayValue}>{fmt(serverBill.finalAmount)}</Text>
                  </View>

                  {showSavingsBanner ? (
                    <BillSavingsBanner
                      totalSaved={serverBill.discountTotal}
                      subscriptionWaived={subscriptionWaivedInr}
                      planName={subscriptionPlanName}
                    />
                  ) : null}

                  <CheckoutGratitudeSections
                    tipValue={tipValue}
                    onTipSelect={onTipSelect}
                    tipCustomMode={tipCustomMode}
                    onTipCustomMode={onTipCustomMode}
                    tipCustomInput={tipCustomInput}
                    onTipCustomInputChange={onTipCustomInputChange}
                    donationEnabled={donationEnabled}
                    donationPreset={donationPreset}
                    donationAmount={donationAmount}
                    onDonationPresetPress={onDonationPresetPress}
                    onDonationClear={onDonationClear}
                    onDonationAmountChange={onDonationAmountChange}
                    onFeedingInfoPress={onFeedingInfoPress}
                    onDonateEveryOrderPress={onDonateEveryOrderPress}
                    donationScope={donationScope}
                    sectionOrder="tip-first"
                  />
                </>
              ) : (
                <Text style={styles.emptyText}>
                  {billingError
                    ? "Could not load bill from server. Check your connection and try again."
                    : "Calculating bill on server…"}
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <BillInfoModal
        visible={infoModal === "packaging"}
        title="Restaurant packaging charges"
        body="GatiMitra has no role to play in packaging charges. These are set by the restaurants."
        onClose={() => setInfoModal(null)}
      />
      <BillInfoModal
        visible={infoModal === "platform"}
        title="Platform Fee"
        body="This small fee helps us pay the bills so that we can keep GatiMitra running."
        onClose={() => setInfoModal(null)}
      />

      <DeliveryFeeBreakdownModal
        visible={deliveryBreakdownOpen}
        onClose={() => setDeliveryBreakdownOpen(false)}
        planName={subscriptionPlanName}
        distanceKm={distanceKm}
        baseFeeInr={deliveryOriginalInr}
        currentDeliveryInr={deliveryCurrentInr}
        smallOrderInr={smallOrderInr}
        subscriptionWaivedInr={subscriptionWaivedInr}
        deliverySubtext={deliverySubtext}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15, 23, 42, 0.5)" },
  card: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 0,
    width: "100%",
  },
  closeWrap: { alignItems: "center", marginTop: -22, marginBottom: 10, zIndex: 4 },
  closeRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
  },
  scrollContent: { paddingBottom: 28 },
  sheetTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  lineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 8,
    gap: 12,
  },
  lineLeft: { flex: 1, minWidth: 0 },
  dashedLabelWrap: {
    alignSelf: "flex-start",
    borderBottomWidth: 1,
    borderStyle: "dashed",
    borderColor: "#94A3B8",
    paddingBottom: 1,
  },
  dashedLabelText: { fontSize: 14, fontWeight: "600", color: "#111827" },
  plainLabelText: { fontSize: 14, fontWeight: "600", color: "#111827" },
  lineSubtext: { fontSize: 11, color: GM.textSecondary, marginTop: 4, lineHeight: 15, maxWidth: 260 },
  lineValue: { fontSize: 14, fontWeight: "600", color: "#111827", flexShrink: 0 },
  deliveryValueCluster: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
  strikeValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#94A3B8",
    textDecorationLine: "line-through",
  },
  waivedValue: { fontSize: 14, fontWeight: "700", color: GM.emerald },
  sectionDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "#E5E7EB", marginVertical: 8 },
  grandTotalValue: { fontSize: 15, fontWeight: "800" },
  discountRow: { paddingVertical: 6 },
  discountLabel: { color: BILL_DISCOUNT_COLOR, fontWeight: "600" },
  discountValue: { color: BILL_DISCOUNT_COLOR, fontWeight: "700" },
  toPayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  toPayLabel: { fontSize: 17, fontWeight: "800", color: "#111827" },
  toPayValue: { fontSize: 20, fontWeight: "800", color: "#111827" },
  savingsBannerOuter: { marginTop: 16, marginHorizontal: -18 },
  scallopRow: {
    flexDirection: "row",
    height: 9,
    overflow: "hidden",
    marginBottom: -5,
  },
  scallopBump: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: SAVINGS_BANNER_BG,
    marginTop: -5.5,
  },
  savingsBanner: {
    backgroundColor: SAVINGS_BANNER_BG,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  savingsText: {
    fontSize: 13,
    fontWeight: "600",
    color: SAVINGS_TEXT_COLOR,
    lineHeight: 19,
    textAlign: "center",
  },
  savingsBrand: { fontWeight: "800", color: SAVINGS_PLAN_GOLD },
  brandText: { color: GM.emerald, fontWeight: "700" },
  emptyText: {
    fontSize: 14,
    color: GM.textSecondary,
    lineHeight: 21,
    paddingVertical: 24,
    textAlign: "center",
  },
  infoBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  infoCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 12,
  },
  infoTitle: { fontSize: 17, fontWeight: "800", color: "#111827", marginBottom: 12 },
  infoBody: { fontSize: 14, color: "#4B5563", lineHeight: 21, marginBottom: 8 },
  infoOkBtn: { alignItems: "center", paddingVertical: 14 },
  infoOkText: { fontSize: 15, fontWeight: "800", color: OKAY_COLOR, letterSpacing: 0.5 },
  breakdownCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  breakdownLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 4,
  },
  breakdownLineLeft: { flex: 1, minWidth: 0 },
  breakdownTitle: { fontSize: 15, fontWeight: "700", color: "#111827" },
  breakdownSub: { fontSize: 12, color: GM.textSecondary, marginTop: 4, lineHeight: 16 },
  breakdownAmount: { fontSize: 15, fontWeight: "700", color: "#111827", flexShrink: 0 },
  breakdownDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "#E5E7EB", marginVertical: 12 },
  breakdownNetLabel: { fontSize: 15, fontWeight: "800", color: "#111827" },
  breakdownNetAmount: { fontSize: 16, fontWeight: "800", color: "#111827" },
});
