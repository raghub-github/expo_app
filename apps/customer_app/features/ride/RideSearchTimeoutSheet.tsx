/**
 * Tip boost sheet — shown when initial rider search window ends without assignment.
 * Two layouts: no tip yet (first prompt) vs tip already on order (priority active).
 */

import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Image,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { ImageSourcePropType } from "react-native";
import { MAPBIKE_IMAGE } from "@/lib/customer-map-assets";

const TIP_OPTIONS = [
  { amount: 10, label: "+₹10" },
  { amount: 20, label: "+₹20", popular: true },
  { amount: 30, label: "+₹30" },
  { amount: 40, label: "+₹40" },
  { amount: 50, label: "+₹50" },
] as const;

const EXTENSION_MINUTES = 3;
const TIP_BOOST_DECISION_MINUTES = 1.5;

function formatCountdownMmSs(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatRupee(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export type TipBoostLoadingAction = "add_tip" | "continue" | null;

export type RideTipBoostSheetProps = {
  visible: boolean;
  loadingAction?: TipBoostLoadingAction;
  /** Seconds left to pick a CTA before auto-cancel (1.5 min decision window). */
  decisionRemainingSec?: number;
  /** Base ride fare without tips */
  orderTotal: number;
  /** Total tip already on the order (pre-book + search boosts) */
  existingTipAmount: number;
  heroImage?: ImageSourcePropType;
  onAddTipAndContinue: (tipAmount: number) => void;
  onContinueWithoutTip: () => void;
  onCancelOrder: () => void;
};

function TimerBadge({ label }: { label: string }) {
  return (
    <View style={styles.timerBadge}>
      <Ionicons name="timer-outline" size={16} color={GatiMitraColors.deepMintStart} />
      <Text style={styles.timerBadgeText}>{label}</Text>
    </View>
  );
}

function TipChipRow({
  selectedTip,
  onSelect,
  disabled,
}: {
  selectedTip: number;
  onSelect: (amount: number) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.tipRow}>
      {TIP_OPTIONS.map((opt) => {
        const selected = selectedTip === opt.amount;
        return (
          <TouchableOpacity
            key={opt.amount}
            style={[styles.tipChip, selected && styles.tipChipSelected]}
            onPress={() => onSelect(opt.amount)}
            activeOpacity={0.85}
            disabled={disabled}
          >
            {"popular" in opt && opt.popular ? (
              <View style={styles.popularBadge}>
                <Text style={styles.popularBadgeText}>★ Most Popular</Text>
              </View>
            ) : null}
            <Text style={[styles.tipChipText, selected && styles.tipChipTextSelected]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function NoTipBoostView({
  selectedTip,
  onSelectTip,
  loadingAction,
  decisionRemainingSec,
  heroImage,
  onAddTipAndContinue,
  onContinueWithoutTip,
  onCancelOrder,
}: {
  selectedTip: number;
  onSelectTip: (amount: number) => void;
  loadingAction: TipBoostLoadingAction;
  decisionRemainingSec: number;
  heroImage: ImageSourcePropType;
  onAddTipAndContinue: (tip: number) => void;
  onContinueWithoutTip: () => void;
  onCancelOrder: () => void;
}) {
  const busy = loadingAction != null;
  return (
    <>
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        <View style={styles.heroWrap}>
          <Image source={heroImage} style={styles.heroImage} resizeMode="contain" />
          <TimerBadge label={formatCountdownMmSs(decisionRemainingSec)} />
        </View>

        <Text style={styles.title}>Need your order faster?</Text>
        <Text style={styles.message}>
          Adding a small tip can help your order get noticed by more nearby riders.
        </Text>

        <View style={styles.shieldBanner}>
          <Ionicons name="shield-checkmark" size={18} color={GatiMitraColors.deepMintStart} />
          <Text style={styles.shieldBannerText}>
            Choose an option within{" "}
            <Text style={styles.shieldBold}>{TIP_BOOST_DECISION_MINUTES} minutes</Text> or your
            order will be cancelled. After you continue, we&apos;ll search for another{" "}
            <Text style={styles.shieldBold}>{EXTENSION_MINUTES} minutes.</Text>
          </Text>
        </View>

        <View style={styles.tipLabelRow}>
          <Text style={styles.tipLabel}>Add a tip to boost your order</Text>
          <Ionicons name="information-circle-outline" size={18} color="#9CA3AF" />
        </View>

        <TipChipRow selectedTip={selectedTip} onSelect={onSelectTip} disabled={busy} />

        <View style={styles.flashBanner}>
          <Ionicons name="flash" size={18} color={GatiMitraColors.deepMintStart} />
          <Text style={styles.flashBannerText}>
            Add a tip and we&apos;ll re-notify nearby riders to help get your order accepted
            faster.
          </Text>
        </View>
      </ScrollView>

      <TouchableOpacity
        style={[styles.primaryBtn, busy && styles.btnDisabled]}
        onPress={() => onAddTipAndContinue(selectedTip)}
        activeOpacity={0.9}
        disabled={busy}
      >
        {loadingAction === "add_tip" ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryBtnText}>Add Tip & Continue Searching</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.secondaryBtn, busy && styles.btnDisabled]}
        onPress={onContinueWithoutTip}
        activeOpacity={0.9}
        disabled={busy}
      >
        {loadingAction === "continue" ? (
          <ActivityIndicator color={GatiMitraColors.deepMintStart} />
        ) : (
          <Text style={styles.secondaryBtnText}>Keep Searching Without Tip</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.cancelLink}
        onPress={onCancelOrder}
        activeOpacity={0.7}
        disabled={busy}
      >
        <Text style={styles.cancelLinkText}>Cancel Order</Text>
      </TouchableOpacity>
    </>
  );
}

function TipAlreadyAddedView({
  orderTotal,
  existingTipAmount,
  selectedTip,
  onSelectTip,
  showIncreaseTip,
  onShowIncreaseTip,
  onBackFromIncrease,
  loadingAction,
  decisionRemainingSec,
  heroImage,
  onAddTipAndContinue,
  onContinueWithoutTip,
  onCancelOrder,
}: {
  orderTotal: number;
  existingTipAmount: number;
  selectedTip: number;
  onSelectTip: (amount: number) => void;
  showIncreaseTip: boolean;
  onShowIncreaseTip: () => void;
  onBackFromIncrease: () => void;
  loadingAction: TipBoostLoadingAction;
  decisionRemainingSec: number;
  heroImage: ImageSourcePropType;
  onAddTipAndContinue: (tip: number) => void;
  onContinueWithoutTip: () => void;
  onCancelOrder: () => void;
}) {
  const busy = loadingAction != null;
  const totalOffer = orderTotal + existingTipAmount + (showIncreaseTip ? selectedTip : 0);

  if (showIncreaseTip) {
    return (
      <>
        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          <TouchableOpacity style={styles.backRow} onPress={onBackFromIncrease} disabled={busy}>
            <Ionicons name="arrow-back" size={20} color="#111827" />
            <Text style={styles.backRowText}>Back</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Increase your tip</Text>
          <Text style={styles.message}>
            Current tip {formatRupee(existingTipAmount)}. Add more to boost priority further.
          </Text>

          <View style={styles.tipLabelRow}>
            <Text style={styles.tipLabel}>Additional tip amount</Text>
          </View>

          <TipChipRow selectedTip={selectedTip} onSelect={onSelectTip} disabled={busy} />

          <View style={styles.priceBreakdown}>
            <PriceColumn label="Order Total" amount={orderTotal} icon="bag-handle-outline" />
            <View style={styles.priceDivider} />
            <PriceColumn
              label="Tip Added"
              amount={existingTipAmount + selectedTip}
              icon="gift-outline"
              highlight
            />
            <View style={styles.priceDivider} />
            <PriceColumn label="Total Offer" amount={totalOffer} icon="wallet-outline" bold />
          </View>
        </ScrollView>

        <TouchableOpacity
          style={[styles.primaryBtn, busy && styles.btnDisabled]}
          onPress={() => onAddTipAndContinue(selectedTip)}
          activeOpacity={0.9}
          disabled={busy}
        >
          {loadingAction === "add_tip" ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryBtnText}>
              Add {formatRupee(selectedTip)} & Continue Searching
            </Text>
          )}
        </TouchableOpacity>
      </>
    );
  }

  return (
    <>
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        <View style={styles.priorityHeaderRow}>
          <View style={styles.priorityHeaderText}>
            <Text style={styles.priorityTitle}>Still searching for a rider</Text>
            <Text style={styles.prioritySubtitle}>
              Your {formatRupee(existingTipAmount)} tip has already been added and we&apos;re
              prioritizing your order for nearby riders.
            </Text>
          </View>
          <View style={styles.continuingTimerBox}>
            <TimerBadge label={formatCountdownMmSs(decisionRemainingSec)} />
            <Text style={styles.continuingTimerLabel}>Time left to continue</Text>
          </View>
        </View>

        <View style={styles.searchHeroWrap}>
          <View style={styles.searchRingOuter} />
          <View style={styles.searchRingMid} />
          <Image source={heroImage} style={styles.searchHeroImage} resizeMode="contain" />
          <View style={styles.priorityActiveBadge}>
            <Ionicons name="checkmark-circle" size={16} color={GatiMitraColors.deepMintStart} />
            <View style={styles.priorityActiveTextWrap}>
              <Text style={styles.priorityActiveTitle}>Priority Search Active</Text>
              <Text style={styles.priorityActiveSub}>
                We&apos;re notifying more nearby riders.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.goodNewsBanner}>
          <Ionicons name="checkmark-circle" size={18} color={GatiMitraColors.deepMintStart} />
          <Text style={styles.goodNewsText}>
            <Text style={styles.goodNewsBold}>Good news!</Text> Your order is already being shown
            with a priority boost to nearby riders.
          </Text>
        </View>

        <View style={styles.flashBanner}>
          <Ionicons name="flash" size={18} color={GatiMitraColors.deepMintStart} />
          <Text style={styles.flashBannerText}>
            Your order is getting priority and is visible to more riders. Thank you for adding a
            tip!
          </Text>
        </View>

        <View style={styles.priceBreakdown}>
          <PriceColumn label="Order Total" amount={orderTotal} icon="bag-handle-outline" />
          <View style={styles.priceDivider} />
          <PriceColumn
            label="Tip Added"
            amount={existingTipAmount}
            icon="gift-outline"
            highlight
            checked
          />
          <View style={styles.priceDivider} />
          <PriceColumn label="Total Offer" amount={totalOffer} icon="wallet-outline" bold />
        </View>
      </ScrollView>

      <TouchableOpacity
        style={[styles.primaryBtn, busy && styles.btnDisabled]}
        onPress={onContinueWithoutTip}
        activeOpacity={0.9}
        disabled={busy}
      >
        {loadingAction === "continue" ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryBtnText}>Continue Searching</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.secondaryBtn, busy && styles.btnDisabled]}
        onPress={onShowIncreaseTip}
        activeOpacity={0.9}
        disabled={busy}
      >
        <View style={styles.increaseTipRow}>
          <Text style={styles.secondaryBtnText}>Increase Tip Further</Text>
          <View style={styles.optionalPill}>
            <Text style={styles.optionalPillText}>Optional</Text>
          </View>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.cancelOrderBtn, busy && styles.btnDisabled]}
        onPress={onCancelOrder}
        activeOpacity={0.9}
        disabled={busy}
      >
        <Text style={styles.cancelOrderBtnText}>Cancel Order</Text>
      </TouchableOpacity>
    </>
  );
}

function PriceColumn({
  label,
  amount,
  icon,
  highlight,
  checked,
  bold,
}: {
  label: string;
  amount: number;
  icon: keyof typeof Ionicons.glyphMap;
  highlight?: boolean;
  checked?: boolean;
  bold?: boolean;
}) {
  return (
    <View style={styles.priceColumn}>
      <View style={styles.priceLabelRow}>
        <Text style={styles.priceLabel}>{label}</Text>
        <Ionicons name="information-circle-outline" size={14} color="#9CA3AF" />
      </View>
      <View style={styles.priceValueRow}>
        <Ionicons
          name={icon}
          size={16}
          color={highlight ? GatiMitraColors.deepMintStart : "#6B7280"}
        />
        <Text style={[styles.priceValue, bold && styles.priceValueBold]}>{formatRupee(amount)}</Text>
        {checked ? (
          <View style={styles.tipCheckCircle}>
            <Ionicons name="checkmark" size={10} color="#FFFFFF" />
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function RideTipBoostSheet({
  visible,
  loadingAction = null,
  decisionRemainingSec = 90,
  orderTotal,
  existingTipAmount,
  heroImage = MAPBIKE_IMAGE,
  onAddTipAndContinue,
  onContinueWithoutTip,
  onCancelOrder,
}: RideTipBoostSheetProps) {
  const insets = useSafeAreaInsets();
  const [selectedTip, setSelectedTip] = useState(20);
  const [showIncreaseTip, setShowIncreaseTip] = useState(false);

  const hasExistingTip = existingTipAmount > 0;

  useEffect(() => {
    if (!visible) {
      setShowIncreaseTip(false);
      setSelectedTip(20);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={hasExistingTip && !showIncreaseTip ? onContinueWithoutTip : onContinueWithoutTip}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={hasExistingTip && !showIncreaseTip ? onContinueWithoutTip : undefined}
          accessibilityRole="button"
        />

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          {hasExistingTip ? (
            <TipAlreadyAddedView
              orderTotal={orderTotal}
              existingTipAmount={existingTipAmount}
              selectedTip={selectedTip}
              onSelectTip={setSelectedTip}
              showIncreaseTip={showIncreaseTip}
              onShowIncreaseTip={() => setShowIncreaseTip(true)}
              onBackFromIncrease={() => setShowIncreaseTip(false)}
              loadingAction={loadingAction}
              decisionRemainingSec={decisionRemainingSec}
              heroImage={heroImage}
              onAddTipAndContinue={onAddTipAndContinue}
              onContinueWithoutTip={onContinueWithoutTip}
              onCancelOrder={onCancelOrder}
            />
          ) : (
            <NoTipBoostView
              selectedTip={selectedTip}
              onSelectTip={setSelectedTip}
              loadingAction={loadingAction}
              decisionRemainingSec={decisionRemainingSec}
              heroImage={heroImage}
              onAddTipAndContinue={onAddTipAndContinue}
              onContinueWithoutTip={onContinueWithoutTip}
              onCancelOrder={onCancelOrder}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

/** @deprecated Use RideTipBoostSheet */
export const RideSearchTimeoutSheet = RideTipBoostSheet;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: "92%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
  },
  heroWrap: {
    alignItems: "center",
    marginBottom: 8,
    minHeight: 140,
    justifyContent: "center",
  },
  heroImage: {
    width: 220,
    height: 130,
  },
  timerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  timerBadgeText: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraColors.deepMintStart,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  shieldBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
  },
  shieldBannerText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: "#374151",
  },
  shieldBold: {
    fontWeight: "700",
    color: "#111827",
  },
  tipLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  tipLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  tipRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  tipChip: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: GatiMitraColors.primaryMint,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    position: "relative",
    paddingTop: 8,
  },
  tipChipSelected: {
    backgroundColor: GatiMitraColors.primaryMint,
    borderColor: GatiMitraColors.primaryMint,
  },
  popularBadge: {
    position: "absolute",
    top: -10,
    backgroundColor: "#111827",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  popularBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  tipChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraColors.deepMintStart,
  },
  tipChipTextSelected: {
    color: "#FFFFFF",
  },
  flashBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FFFBEB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
  },
  flashBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: "#92400E",
  },
  primaryBtn: {
    backgroundColor: GatiMitraColors.primaryMint,
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: "center",
    marginBottom: 10,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  secondaryBtn: {
    borderWidth: 2,
    borderColor: GatiMitraColors.primaryMint,
    paddingVertical: 15,
    borderRadius: 28,
    alignItems: "center",
    marginBottom: 12,
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraColors.deepMintStart,
  },
  cancelLink: {
    alignItems: "center",
    paddingVertical: 8,
  },
  cancelLinkText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#9CA3AF",
  },
  cancelOrderBtn: {
    borderWidth: 2,
    borderColor: "#EF4444",
    paddingVertical: 15,
    borderRadius: 28,
    alignItems: "center",
    marginBottom: 4,
  },
  cancelOrderBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#EF4444",
  },
  btnDisabled: {
    opacity: 0.65,
  },
  priorityHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
    marginTop: 8,
  },
  priorityHeaderText: {
    flex: 1,
  },
  priorityTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 6,
  },
  prioritySubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: "#6B7280",
  },
  continuingTimerBox: {
    alignItems: "flex-end",
    gap: 4,
  },
  continuingTimerLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
    textAlign: "right",
  },
  searchHeroWrap: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 160,
    marginBottom: 16,
  },
  searchRingOuter: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    opacity: 0.5,
  },
  searchRingMid: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 1,
    borderColor: "#86EFAC",
    opacity: 0.7,
  },
  searchHeroImage: {
    width: 120,
    height: 90,
  },
  priorityActiveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxWidth: "100%",
  },
  priorityActiveTextWrap: {
    flex: 1,
  },
  priorityActiveTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  priorityActiveSub: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  goodNewsBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  goodNewsText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: "#374151",
  },
  goodNewsBold: {
    fontWeight: "700",
    color: "#111827",
  },
  priceBreakdown: {
    flexDirection: "row",
    alignItems: "stretch",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 20,
  },
  priceColumn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  priceDivider: {
    width: 1,
    backgroundColor: "#E5E7EB",
  },
  priceLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginBottom: 8,
  },
  priceLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
  },
  priceValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  priceValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  priceValueBold: {
    fontSize: 16,
  },
  tipCheckCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: GatiMitraColors.primaryMint,
    alignItems: "center",
    justifyContent: "center",
  },
  increaseTipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  optionalPill: {
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  optionalPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: GatiMitraColors.deepMintStart,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
    alignSelf: "flex-start",
  },
  backRowText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
});
