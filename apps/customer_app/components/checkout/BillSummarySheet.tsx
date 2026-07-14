/**
 * Zomato-style scrollable bill summary — bill rows, savings, gratitude tip, feeding India.
 * Presentation only; amounts and handlers come from checkout.
 */

import { useMemo, useState, type ReactNode } from "react";
import {
  View,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { CheckoutText } from "@/components/checkout/CheckoutText";
import { useAnimatedCount } from "@/hooks/useAnimatedCount";
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
        <CheckoutText style={styles.savingsText}>
          🥳 You saved ₹{total}
          {subWaived > 0 ? (
            <>
              , including ₹{subWaived} with{" "}
              <CheckoutText style={styles.savingsBrand}>{planName}</CheckoutText>
            </>
          ) : (
            " on this order"
          )}
        </CheckoutText>
      </View>
    </View>
  );
}

function fmt(n: number): string {
  return `₹${n.toFixed(2)}`;
}

/** Smoothly tweened bill-row value — same amounts, but read as continuous motion instead
 * of an instant snap when the underlying quantity/offer/tax recalculates. */
function AnimatedBillValue({
  value,
  prefix = "",
  style,
}: {
  value: number;
  prefix?: string;
  style?: object;
}) {
  const animated = useAnimatedCount(value);
  return (
    <CheckoutText style={[styles.lineValue, style]}>
      {prefix}
      {fmt(animated)}
    </CheckoutText>
  );
}

/** Same tween, styled as a strike-through (list-price) amount. */
function AnimatedAsStrike({ value }: { value: number }) {
  const animated = useAnimatedCount(value);
  return <CheckoutText style={styles.strikeValue}>{fmt(animated)}</CheckoutText>;
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
          <CheckoutText style={styles.infoTitle}>{title}</CheckoutText>
          <CheckoutText style={styles.infoBody}>{body}</CheckoutText>
          <Pressable onPress={onClose} style={styles.infoOkBtn} hitSlop={8}>
            <CheckoutText style={styles.infoOkText}>OKAY</CheckoutText>
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
    <CheckoutText style={[dashedUnderline ? styles.dashedLabelText : styles.plainLabelText, labelAccent && styles.discountLabel]}>
      {label}
    </CheckoutText>
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
        {subtext ? <CheckoutText style={styles.lineSubtext}>{subtext}</CheckoutText> : null}
      </View>
      {valueNode ?? <CheckoutText style={[styles.lineValue, valueStyle]}>{value}</CheckoutText>}
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
  const animatedOriginal = useAnimatedCount(originalInr);
  const waived = originalInr > 0.005 && currentInr <= 0.005;
  if (waived) {
    return (
      <View style={styles.deliveryValueCluster}>
        <CheckoutText style={styles.strikeValue}>{fmt(animatedOriginal)}</CheckoutText>
        <CheckoutText style={styles.waivedValue}>{fmt(0)}</CheckoutText>
      </View>
    );
  }
  return <AnimatedBillValue value={currentInr} />;
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
              <CheckoutText style={styles.breakdownTitle}>Base fee for {kmLabel}</CheckoutText>
              {deliverySubtext ? <CheckoutText style={styles.breakdownSub}>{deliverySubtext}</CheckoutText> : null}
            </View>
            <CheckoutText style={styles.breakdownAmount}>{fmt(baseFeeInr)}</CheckoutText>
          </View>

          {smallOrderInr > 0.005 ? (
            <>
              <View style={styles.breakdownDivider} />
              <View style={styles.breakdownLine}>
                <CheckoutText style={styles.breakdownTitle}>Small order fee</CheckoutText>
                <View style={styles.deliveryValueCluster}>
                  <CheckoutText style={styles.strikeValue}>{fmt(smallOrderInr)}</CheckoutText>
                  <CheckoutText style={styles.waivedValue}>{fmt(0)}</CheckoutText>
                </View>
              </View>
            </>
          ) : null}

          {subscriptionWaivedInr > 0.005 ? (
            <>
              <View style={styles.breakdownDivider} />
              <View style={styles.breakdownLine}>
                <CheckoutText style={[styles.breakdownTitle, styles.brandText]}>
                  Free delivery with {planName}
                </CheckoutText>
                <CheckoutText style={[styles.breakdownAmount, styles.brandText]}>
                  − {fmt(subscriptionWaivedInr)}
                </CheckoutText>
              </View>
            </>
          ) : null}

          <View style={styles.breakdownDivider} />
          <View style={styles.breakdownLine}>
            <CheckoutText style={styles.breakdownNetLabel}>Delivery partner fee</CheckoutText>
            <CheckoutText style={styles.breakdownNetAmount}>{fmt(currentDeliveryInr)}</CheckoutText>
          </View>

          <Pressable onPress={onClose} style={styles.infoOkBtn} hitSlop={8}>
            <CheckoutText style={styles.infoOkText}>OKAY</CheckoutText>
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
  /** When set with showItemTotalStrike, Item total nets to this (merchant Boost only). */
  itemTotalNetOverride?: number | null;
  /** GatiCash wallet applied on checkout (INR). */
  gatiCashApplyAmount?: number;
  /** Missed-offer GatiCash credit selected for after order (INR, informational only). */
  missedOfferWalletPendingAmount?: number;
  /** Unlocked missed-offer discount on this order (INR). */
  missedOfferUnlockDiscount?: number;
  missedOfferUnlockLabel?: string;
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
  itemTotalNetOverride = null,
  gatiCashApplyAmount = 0,
  missedOfferWalletPendingAmount = 0,
  missedOfferUnlockDiscount = 0,
  missedOfferUnlockLabel = "Offer unlocked",
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

  /**
   * BOGO is an item-level pricing rule — the free-unit benefit is already reflected in the
   * struck-through Item Total. It must NOT also appear as a separate "Buy One Get One"
   * discount row, so it is folded out of the rows and out of the Grand Total below. Scoped
   * strictly to BOGO (identified by the offer type/mode the billing engine stamps on every
   * discount row via offerDiscountMeta) — boost/precision/coupon/platform are untouched.
   */
  const isBogoDiscountRow = (d: { meta?: Record<string, unknown> | null }): boolean => {
    const meta = d.meta ?? {};
    const t = String(meta.offerType ?? "").toUpperCase().replace(/[-\s]+/g, "_");
    if (t === "BOGO" || t === "BUY_X_GET_Y" || t === "BUY_N_GET_M") return true;
    return String(meta.conditionsMode ?? "").toLowerCase() === "bogo";
  };

  const bogoDiscountTotal = useMemo(
    () =>
      visibleDiscounts.reduce(
        (s, d) => (isBogoDiscountRow(d) ? s + (Number(d.amount) || 0) : s),
        0
      ),
    [visibleDiscounts]
  );

  const grandTotalBeforeDiscounts = useMemo(() => {
    if (!serverBill) return 0;
    return (
      serverBill.finalAmount -
      serverBill.tipAmount -
      serverBill.donationAmount +
      serverBill.discountTotal -
      // BOGO is folded into the Item Total (item-level price), never a row below Grand Total.
      bogoDiscountTotal
    );
  }, [serverBill, bogoDiscountTotal]);

  const discountRows = useMemo(() => {
    if (!serverBill) return [];
    // Show every discount that sits between Grand Total and To pay (item deals + cart/precision + coupons).
    // Item total strike is informational; GT is pre-discount so these rows must close the gap.
    // BOGO excluded — it's reflected in the Item Total, not shown as a separate row.
    return visibleDiscounts
      .filter((d) => d.amount > 0.005 && !isBogoDiscountRow(d))
      .map((d) => ({
        ...d,
        label: String(d.label ?? "").trim() || "Offer discount",
      }));
  }, [serverBill, visibleDiscounts]);

  /** Residual if listed rows don't cover discountTotal (hidden/unnamed lines). */
  const discountRowsGap = useMemo(() => {
    if (!serverBill) return 0;
    const listed = discountRows.reduce((s, d) => s + (d.amount ?? 0), 0);
    const gap =
      // Exclude the folded BOGO amount so it never re-surfaces as an "Other offers" row.
      serverBill.discountTotal -
      bogoDiscountTotal -
      listed -
      (missedOfferUnlockDiscount > 0.005 ? missedOfferUnlockDiscount : 0);
    return gap > 0.05 ? Math.round(gap * 100) / 100 : 0;
  }, [serverBill, discountRows, bogoDiscountTotal, missedOfferUnlockDiscount]);

  const showSavingsBanner = serverBill != null && serverBill.discountTotal > 0.005;

  const deliveryOriginalInr =
    deliveryFeeStrikeAmount ??
    serverBill?.deliveryFeeQuotedInr ??
    serverBill?.components.delivery.taxable_value ??
    0;
  const deliveryCurrentInr = serverBill?.components.delivery.taxable_value ?? 0;
  const smallOrderInr = serverBill?.components.small_order.taxable_value ?? 0;
  const walletDeduction =
    gatiCashApplyAmount > 0.005 ? Math.round(gatiCashApplyAmount * 100) / 100 : 0;
  const pendingWalletCredit =
    missedOfferWalletPendingAmount > 0.005
      ? Math.round(missedOfferWalletPendingAmount * 100) / 100
      : 0;
  const missedOfferDiscount =
    missedOfferUnlockDiscount > 0.005
      ? Math.round(missedOfferUnlockDiscount * 100) / 100
      : 0;
  const toPayAfterWallet =
    serverBill != null
      ? Math.max(
          0,
          Math.round(
            (serverBill.finalAmount -
              walletDeduction -
              missedOfferDiscount +
              pendingWalletCredit) *
              100
          ) / 100
        )
      : 0;
  const hasCheckoutAdjustments =
    walletDeduction > 0.005 || missedOfferDiscount > 0.005 || pendingWalletCredit > 0.005;

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
              <CheckoutText style={styles.sheetTitle}>Bill Summary</CheckoutText>

              {serverBill ? (
                <>
                  <BillLineRow
                    label="Item total"
                    valueNode={
                      showItemTotalStrike ? (
                        <View style={styles.deliveryValueCluster}>
                          <AnimatedAsStrike value={serverBill.itemTotal} />
                          <AnimatedBillValue
                            value={itemTotalNetOverride ?? serverBill.itemsNetAfterDiscounts}
                          />
                        </View>
                      ) : (
                        <AnimatedBillValue value={serverBill.itemTotal} />
                      )
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
                      valueNode={<AnimatedBillValue value={gstAndOtherBreakdown.total} />}
                      dashedUnderline
                      onLabelPress={onGstInfoPress}
                    />
                  ) : null}

                  <View style={styles.sectionDivider} />
                  <BillLineRow
                    label="Grand Total"
                    valueNode={
                      <AnimatedBillValue value={grandTotalBeforeDiscounts} style={styles.grandTotalValue} />
                    }
                  />

                  {discountRows.map((d, idx) => (
                    <BillLineRow
                      key={`disc-${d.ruleId ?? idx}-${d.label}`}
                      label={d.label}
                      valueNode={<AnimatedBillValue value={d.amount} prefix="- " style={styles.discountValue} />}
                      labelAccent
                      rowStyle={styles.discountRow}
                    />
                  ))}

                  {discountRowsGap > 0.005 ? (
                    <BillLineRow
                      label="Other offers"
                      valueNode={
                        <AnimatedBillValue value={discountRowsGap} prefix="- " style={styles.discountValue} />
                      }
                      labelAccent
                      rowStyle={styles.discountRow}
                    />
                  ) : null}

                  {walletDeduction > 0.005 ? (
                    <BillLineRow
                      label="Using GatiCash"
                      valueNode={
                        <AnimatedBillValue
                          value={walletDeduction}
                          prefix="- "
                          style={styles.walletDiscountValue}
                        />
                      }
                      labelAccent
                      rowStyle={styles.discountRow}
                    />
                  ) : null}

                  {missedOfferDiscount > 0.005 ? (
                    <BillLineRow
                      label={missedOfferUnlockLabel}
                      valueNode={
                        <AnimatedBillValue value={missedOfferDiscount} prefix="- " style={styles.discountValue} />
                      }
                      labelAccent
                      rowStyle={styles.discountRow}
                    />
                  ) : null}

                  {pendingWalletCredit > 0.005 ? (
                    <BillLineRow
                      label="Add to GatiCash wallet"
                      valueNode={
                        <AnimatedBillValue
                          value={pendingWalletCredit}
                          prefix="+ "
                          style={styles.pendingWalletValue}
                        />
                      }
                      rowStyle={styles.pendingWalletRow}
                    />
                  ) : null}

                  <View style={styles.toPayRow}>
                    <CheckoutText style={styles.toPayLabel}>To pay</CheckoutText>
                    <AnimatedBillValue
                      value={hasCheckoutAdjustments ? toPayAfterWallet : serverBill.finalAmount}
                      style={styles.toPayValue}
                    />
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
                <CheckoutText style={styles.emptyText}>
                  {billingError
                    ? "Could not load bill from server. Check your connection and try again."
                    : "Calculating bill on server…"}
                </CheckoutText>
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
  walletDiscountValue: { color: GM.splashMint, fontWeight: "700" },
  pendingWalletRow: { paddingVertical: 6 },
  pendingWalletValue: { color: "#0F766E", fontWeight: "700" },
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
