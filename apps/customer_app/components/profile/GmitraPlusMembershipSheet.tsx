/**
 * GMitra Plus membership — profile & promo bottom sheet (active benefits or join pitch).
 */

import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { AppText } from "@/components/AppText";

import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { GatiMitraColors } from "@/constants/gatimitra";

const GOLD = "#F59E0B";
const GOLD_DARK = "#D97706";
const GOLD_SOFT = "#FFFBEB";
const TEXT = "#111827";
const MUTED = "#6B7280";
const MINT = GatiMitraColors.primaryMint;
const MINT_DARK = "#15803D";

function benefitIcon(text: string): keyof typeof Ionicons.glyphMap {
  const t = text.toLowerCase();
  if (t.includes("delivery")) return "bicycle-outline";
  if (t.includes("offer") || t.includes("discount")) return "pricetag-outline";
  if (t.includes("priority") || t.includes("peak")) return "flash-outline";
  if (t.includes("festival")) return "gift-outline";
  if (t.includes("matching") || t.includes("faster")) return "rocket-outline";
  if (t.includes("early") || t.includes("access") || t.includes("feature")) return "star-outline";
  return "checkmark-circle-outline";
}

export type GmitraPlusMembershipSheetProps = {
  visible: boolean;
  onClose: () => void;
  active: boolean;
  planName: string;
  benefits: string[];
  freeDeliveryNote?: string | null;
  expiryCountdown?: string | null;
  description?: string | null;
  onBrowseRestaurants?: () => void;
};

export function GmitraPlusMembershipSheet({
  visible,
  onClose,
  active,
  planName,
  benefits,
  freeDeliveryNote,
  expiryCountdown,
  description,
  onBrowseRestaurants,
}: GmitraPlusMembershipSheetProps) {
  const insets = useSafeAreaInsets();
  const benefitLines =
    benefits.length > 0
      ? benefits
      : active
        ? ["Member perks apply automatically on eligible orders."]
        : [
            "Save on delivery fees",
            "Exclusive member-only offers",
            "Priority support on orders",
          ];

  return (
    <StoreBottomSheetShell visible={visible} onClose={onClose} maxHeightRatio={0.82} flushBottom>
      <LinearGradient
        colors={active ? ["#FEF3C7", "#FFFBEB", "#FFFFFF"] : ["#ECFDF5", "#F0FDF4", "#FFFFFF"]}
        locations={[0, 0.35, 1]}
        style={styles.heroGradient}
      >
        <View style={styles.handle} />
        <View style={styles.heroRow}>
          <View style={[styles.crownRing, active && styles.crownRingActive]}>
            <MaterialCommunityIcons name="crown" size={28} color={active ? GOLD_DARK : MINT_DARK} />
          </View>
          <View style={styles.heroCopy}>
            <View style={styles.titleRow}>
              <AppText style={styles.planTitle}>{planName}</AppText>
              {active ? (
                <View style={styles.activePill}>
                  <View style={styles.activeDot} />
                  <AppText style={styles.activePillText}>Active</AppText>
                </View>
              ) : null}
            </View>
            <AppText style={styles.heroSubtitle}>
              {active
                ? expiryCountdown
                  ? `${expiryCountdown}. Perks apply on every eligible order.`
                  : "Your membership perks are live on every eligible order."
                : `Unlock delivery savings and member-only offers with ${planName}.`}
            </AppText>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!active && description ? <AppText style={styles.lead}>{description}</AppText> : null}

        <AppText style={styles.sectionLabel}>{active ? "Your benefits" : "What you get"}</AppText>

        {benefitLines.map((benefit) => (
          <View key={benefit} style={styles.benefitRow}>
            <View style={[styles.benefitIconWrap, active && styles.benefitIconWrapActive]}>
              <Ionicons name={benefitIcon(benefit)} size={18} color={active ? GOLD_DARK : MINT_DARK} />
            </View>
            <AppText style={styles.benefitText}>{benefit}</AppText>
          </View>
        ))}

        {freeDeliveryNote ? (
          <View style={styles.deliveryNoteCard}>
            <Ionicons name="navigate-circle-outline" size={20} color={MINT_DARK} />
            <AppText style={styles.deliveryNoteText}>{freeDeliveryNote}</AppText>
          </View>
        ) : null}

        {active ? (
          <View style={styles.autoApplyBanner}>
            <Ionicons name="sparkles" size={16} color={GOLD_DARK} />
            <AppText style={styles.autoApplyText}>
              Benefits apply automatically — no coupon code needed at checkout.
            </AppText>
          </View>
        ) : (
          <AppText style={styles.joinHint}>
            Add {planName} at checkout on your next food order to start saving instantly.
          </AppText>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        {active ? (
          <TouchableOpacity style={styles.primaryBtn} onPress={onClose} activeOpacity={0.9}>
            <AppText style={styles.primaryBtnText}>Got it</AppText>
          </TouchableOpacity>
        ) : (
          <View style={styles.footerRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={onClose} activeOpacity={0.85}>
              <AppText style={styles.secondaryBtnText}>Not now</AppText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, styles.primaryBtnFlex]}
              onPress={() => {
                onClose();
                onBrowseRestaurants?.();
              }}
              activeOpacity={0.9}
            >
              <AppText style={styles.primaryBtnText}>Browse restaurants</AppText>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </StoreBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  heroGradient: {
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.12)",
    marginBottom: 16,
  },
  heroRow: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  crownRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#BBF7D0",
  },
  crownRingActive: {
    backgroundColor: GOLD_SOFT,
    borderColor: "#FDE68A",
  },
  heroCopy: { flex: 1, paddingTop: 2 },
  titleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  planTitle: { fontSize: 20, fontWeight: "800", color: TEXT, letterSpacing: -0.3 },
  activePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#ECFDF5",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: MINT_DARK },
  activePillText: { fontSize: 11, fontWeight: "800", color: MINT_DARK },
  heroSubtitle: { fontSize: 13, color: MUTED, lineHeight: 19, marginTop: 6 },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 },
  lead: { fontSize: 14, color: MUTED, lineHeight: 21, marginBottom: 14 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },
  benefitIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  benefitIconWrapActive: {
    backgroundColor: GOLD_SOFT,
  },
  benefitText: { flex: 1, fontSize: 15, fontWeight: "600", color: TEXT, lineHeight: 22, paddingTop: 6 },
  deliveryNoteCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#F0FDF4",
    borderRadius: 14,
    padding: 14,
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  deliveryNoteText: { flex: 1, fontSize: 13, fontWeight: "600", color: MINT_DARK, lineHeight: 19 },
  autoApplyBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: GOLD_SOFT,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  autoApplyText: { flex: 1, fontSize: 12, fontWeight: "600", color: "#92400E", lineHeight: 17 },
  joinHint: { fontSize: 13, color: MUTED, lineHeight: 20, marginTop: 6 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#fff",
  },
  footerRow: { flexDirection: "row", gap: 10 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: MINT_DARK,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  primaryBtnFlex: { flex: 1 },
  primaryBtnText: { fontSize: 15, fontWeight: "800", color: "#fff" },
  secondaryBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  secondaryBtnText: { fontSize: 15, fontWeight: "700", color: TEXT },
});
