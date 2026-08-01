/**
 * Gratitude Corner — tip + Feeding India (checkout page + bill summary sheet).
 */

import { View, Pressable, StyleSheet, Image, TextInput } from "react-native";
import { CheckoutText } from "@/components/checkout/CheckoutText";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { GatiMitraColors } from "@/constants/gatimitra";
import {
  formatDonationScopeLabel,
  type DonationScope,
} from "@/components/checkout/DonateWithBottomSheet";
import { useAppAssetSource } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";

const GM = GatiMitraColors;

const TIP_CHIP_AMOUNTS = [15, 20, 30] as const;
const DONATION_PRESETS = [5, 10, 15] as const;

export type CheckoutGratitudeSectionsProps = {
  tipValue: number;
  onTipSelect: (amount: number) => void;
  tipCustomMode: boolean;
  onTipCustomMode: () => void;
  tipCustomInput: string;
  onTipCustomInputChange: (v: string) => void;
  donationEnabled: boolean;
  donationPreset: 5 | 10 | 15 | 20 | "custom" | null;
  donationAmount: string;
  onDonationPresetPress: (amt: 5 | 10 | 15 | "custom") => void;
  onDonationClear: () => void;
  onDonationAmountChange: (v: string) => void;
  onFeedingInfoPress: () => void;
  onDonateEveryOrderPress: () => void;
  donationScope?: DonationScope;
  /** Checkout: feeding first. Bill sheet: tip first. */
  sectionOrder?: "tip-first" | "feeding-first";
};

function GratitudeDivider() {
  return (
    <View style={styles.gratitudeDivider}>
      <View style={styles.gratitudeLine} />
      <CheckoutText style={styles.gratitudeLabel}>GRATITUDE CORNER</CheckoutText>
      <View style={styles.gratitudeLine} />
    </View>
  );
}

export function CheckoutGratitudeSections({
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
  sectionOrder = "feeding-first",
}: CheckoutGratitudeSectionsProps) {
  const rxTipImg = useAppAssetSource(CX.checkout.rxTip);
  const fedImg = useAppAssetSource(CX.checkout.fed);
  const donationValue =
    donationEnabled && donationPreset != null && donationPreset !== "custom"
      ? donationPreset
      : donationEnabled && donationPreset === "custom"
        ? (() => {
            const n = parseFloat(String(donationAmount).replace(/[^\d.]/g, ""));
            return Number.isFinite(n) ? Math.max(0, n) : 0;
          })()
        : 0;

  const scopeLabel = formatDonationScopeLabel(donationScope);
  const showTipConfirm = tipValue > 0;

  const tipSection = (
    <View style={[styles.tipCard, sectionOrder === "feeding-first" && styles.gratitudeSectionAfter]}>
      <LinearGradient
        colors={["#F0F9FF", "#FFFFFF"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <View style={styles.tipCardInner}>
        <View style={styles.tipTextCol}>
          <CheckoutText style={styles.tipTitle}>Tip your delivery partner</CheckoutText>
          <CheckoutText style={styles.tipSub}>
            They&apos;ll get notified instantly. The full tip is sent after delivery
          </CheckoutText>
          <View style={styles.tipChipRow}>
            {TIP_CHIP_AMOUNTS.map((amt) => {
              const active = !tipCustomMode && tipValue === amt;
              return (
                <Pressable
                  key={amt}
                  onPress={() => onTipSelect(active ? 0 : amt)}
                  style={[styles.tipChip, active && styles.tipChipActive]}
                >
                  <CheckoutText style={[styles.tipChipText, active && styles.tipChipTextActive]}>₹{amt}</CheckoutText>
                </Pressable>
              );
            })}
            <Pressable
              onPress={onTipCustomMode}
              style={[styles.tipChip, tipCustomMode && styles.tipChipActive]}
            >
              <CheckoutText style={[styles.tipChipText, tipCustomMode && styles.tipChipTextActive]}>Other</CheckoutText>
            </Pressable>
          </View>
          {tipCustomMode ? (
            <View style={styles.tipCustomRow}>
              <CheckoutText style={styles.tipCustomRupee}>₹</CheckoutText>
              <TextInput
                style={styles.tipCustomInput}
                keyboardType="numeric"
                placeholder="Enter amount"
                placeholderTextColor="#9CA3AF"
                value={tipCustomInput}
                onChangeText={onTipCustomInputChange}
              />
            </View>
          ) : null}
        </View>
        {rxTipImg ? (
          <Image source={rxTipImg} style={styles.tipRiderImg} resizeMode="contain" accessibilityLabel="Delivery partner" />
        ) : null}
      </View>
      {showTipConfirm ? (
        <View style={styles.gratitudeConfirmRow}>
          <Ionicons name="checkmark-circle" size={18} color={GM.emerald} />
          <CheckoutText style={styles.gratitudeConfirmText}>Amount added to your order</CheckoutText>
          <Pressable onPress={() => onTipSelect(0)} hitSlop={10}>
            <CheckoutText style={styles.gratitudeClearText}>Clear</CheckoutText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  const feedingSection = (
    <View style={[styles.feedingCard, sectionOrder === "tip-first" && styles.gratitudeSectionAfter]}>
      <Pressable onPress={onFeedingInfoPress} hitSlop={10} style={styles.feedingInfoTopRight}>
        <Ionicons name="information-circle-outline" size={18} color="#1E3A8A" />
      </Pressable>
      <LinearGradient
        colors={["#DBEAFE", "#E0F2FE", "#EFF6FF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.feedingHero}
      >
        <View style={styles.feedingHeroText}>
          <CheckoutText style={styles.feedingHeadline} numberOfLines={2}>
            <CheckoutText style={styles.feedingJoin}>Join us at </CheckoutText>
            <CheckoutText style={styles.feedingBrand}>feeding</CheckoutText>
            <CheckoutText style={styles.feedingHeart}> ❤️</CheckoutText>
            <CheckoutText style={styles.feedingBrand}> india</CheckoutText>
          </CheckoutText>
          <CheckoutText style={styles.feedingTagline}>
            Together, we can fuel young minds to grow, learn, and thrive
          </CheckoutText>
        </View>
        {fedImg ? (
          <Image source={fedImg} style={styles.feedingArt} resizeMode="contain" accessibilityLabel="Feeding India" />
        ) : null}
      </LinearGradient>

      <Pressable style={styles.feedingDonateRowWrap} onPress={onDonateEveryOrderPress}>
        <View style={styles.feedingDonateRow}>
          <CheckoutText style={styles.feedingDonateLine}>
            Donate with <CheckoutText style={styles.feedingDonateScope}>{scopeLabel}</CheckoutText>
          </CheckoutText>
          <Ionicons name="chevron-forward" size={13} color="#111827" style={styles.feedingDonateChevron} />
        </View>
      </Pressable>

      <View style={styles.feedingPresetRow}>
        {DONATION_PRESETS.map((amt) => {
          const active = donationEnabled && donationPreset === amt;
          return (
            <View key={amt} style={styles.feedingPresetWrap}>
              {amt === 15 ? (
                <View style={styles.mealBadge}>
                  <CheckoutText style={styles.mealBadgeText}>1 MEAL</CheckoutText>
                </View>
              ) : null}
              <Pressable
                onPress={() => onDonationPresetPress(amt)}
                style={[styles.feedingPresetBtn, active && styles.feedingPresetBtnActive]}
              >
                <CheckoutText style={[styles.feedingPresetText, active && styles.feedingPresetTextActive]}>₹{amt}</CheckoutText>
              </Pressable>
            </View>
          );
        })}
        <Pressable
          onPress={() => onDonationPresetPress("custom")}
          style={[
            styles.feedingPresetBtn,
            donationEnabled && donationPreset === "custom" && styles.feedingPresetBtnActive,
          ]}
        >
          <CheckoutText
            style={[
              styles.feedingPresetText,
              donationEnabled && donationPreset === "custom" && styles.feedingPresetTextActive,
            ]}
          >
            Custom
          </CheckoutText>
        </Pressable>
      </View>

      {donationEnabled && donationPreset === "custom" ? (
        <View style={styles.feedingCustomRow}>
          <CheckoutText style={styles.tipCustomRupee}>₹</CheckoutText>
          <TextInput
            style={styles.tipCustomInput}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor="#9CA3AF"
            value={donationAmount}
            onChangeText={onDonationAmountChange}
          />
        </View>
      ) : null}

      {donationEnabled && donationValue > 0 ? (
        <View style={styles.gratitudeConfirmRow}>
          <Ionicons name="checkmark-circle" size={18} color={GM.emerald} />
          <CheckoutText style={styles.gratitudeConfirmText}>Amount added to your order</CheckoutText>
          <Pressable onPress={onDonationClear} hitSlop={10}>
            <CheckoutText style={styles.gratitudeClearText}>Clear</CheckoutText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  return (
    <View>
      <GratitudeDivider />
      {sectionOrder === "tip-first" ? (
        <>
          {tipSection}
          {feedingSection}
        </>
      ) : (
        <>
          {feedingSection}
          {tipSection}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  gratitudeDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 22,
    marginBottom: 14,
  },
  gratitudeLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: "#D1D5DB" },
  gratitudeLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9CA3AF",
    letterSpacing: 1.4,
  },
  tipCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  tipCardInner: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 8,
  },
  tipTextCol: { flex: 1, minWidth: 0 },
  tipTitle: { fontSize: 15, fontWeight: "800", color: "#111827", marginBottom: 4 },
  tipSub: { fontSize: 11, color: "#6B7280", lineHeight: 15, marginBottom: 10 },
  tipChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tipChip: {
    minWidth: 52,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },
  tipChipActive: { borderColor: GM.emerald, backgroundColor: GM.mintSoft },
  tipChipText: { fontSize: 13, fontWeight: "700", color: "#374151" },
  tipChipTextActive: { color: GM.emerald },
  tipCustomRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    borderWidth: 1,
    borderColor: GM.emerald,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#fff",
  },
  tipCustomRupee: { fontSize: 15, fontWeight: "700", color: GM.emerald, marginRight: 4 },
  tipCustomInput: { flex: 1, fontSize: 15, fontWeight: "600", color: "#111827", paddingVertical: 2 },
  tipRiderImg: { width: 80, height: 88 },
  feedingCard: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
    position: "relative",
  },
  gratitudeSectionAfter: { marginTop: 14 },
  feedingInfoTopRight: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 4,
    padding: 2,
  },
  feedingHero: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingRight: 36,
    minHeight: 84,
  },
  feedingHeroText: { flex: 1, minWidth: 0, paddingRight: 4 },
  feedingHeadline: { lineHeight: 19 },
  feedingJoin: { fontSize: 13, fontWeight: "600", color: "#1E293B" },
  feedingBrand: { fontSize: 14, fontWeight: "800", color: "#0F172A" },
  feedingHeart: { fontSize: 14 },
  feedingTagline: { fontSize: 11, color: "#475569", marginTop: 4, lineHeight: 14 },
  feedingArt: { width: 84, height: 72 },
  feedingDonateRowWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  feedingDonateRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  feedingDonateLine: { fontSize: 13, fontWeight: "500", color: "#334155" },
  feedingDonateScope: {
    fontWeight: "800",
    color: "#0F172A",
    textDecorationLine: "underline",
    textDecorationStyle: "dashed",
    textDecorationColor: "#9CA3AF",
  },
  feedingDonateChevron: { marginLeft: 2, marginTop: 1 },
  feedingPresetRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  feedingPresetWrap: { position: "relative" },
  mealBadge: {
    position: "absolute",
    top: -10,
    alignSelf: "center",
    zIndex: 2,
    backgroundColor: "#F472B6",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  mealBadgeText: { fontSize: 8, fontWeight: "800", color: "#fff", letterSpacing: 0.3 },
  feedingPresetBtn: {
    minWidth: 56,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  feedingPresetBtnActive: { borderColor: GM.emerald, backgroundColor: GM.mintSoft },
  feedingPresetText: { fontSize: 13, fontWeight: "700", color: "#374151" },
  feedingPresetTextActive: { color: GM.emerald },
  feedingCustomRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: GM.emerald,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  gratitudeConfirmRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 12,
    paddingTop: 2,
  },
  gratitudeConfirmText: { flex: 1, fontSize: 12, fontWeight: "600", color: GM.emerald },
  gratitudeClearText: { fontSize: 12, fontWeight: "700", color: "#64748B" },
});

/** Zomato-style initial viewport — bill + savings + gratitude peek; scroll for rest. */
export const BILL_SUMMARY_SHEET_HEIGHT_RATIO = 0.72;
