/**
 * GMitra Plus membership bottom sheet — GatiMitra-branded renew / active promo.
 * Layout mirrors a centered membership card (eyebrow → crown → title → CTA).
 */

import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { AppText } from "@/components/AppText";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
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
  /** True when user had Plus before and it lapsed (vs never joined). */
  expired?: boolean;
  planName: string;
  benefits: string[];
  freeDeliveryNote?: string | null;
  expiryCountdown?: string | null;
  description?: string | null;
  /** e.g. "for 3 months at ₹99" under the primary CTA. */
  ctaSubtitle?: string | null;
  /** Headline price line when joining/renewing, e.g. "₹99". */
  highlightPrice?: string | null;
  onBrowseRestaurants?: () => void;
  onRenew?: () => void;
};

export function GmitraPlusMembershipSheet({
  visible,
  onClose,
  active,
  expired = false,
  planName,
  benefits,
  freeDeliveryNote,
  expiryCountdown,
  description,
  ctaSubtitle,
  highlightPrice,
  onBrowseRestaurants,
  onRenew,
}: GmitraPlusMembershipSheetProps) {
  const insets = useSafeAreaInsets();
  const displayName = planName?.trim() || "GMitra Plus";
  const benefitLines =
    benefits.length > 0
      ? benefits
      : [
          "Unlimited free deliveries on eligible orders",
          "Exclusive member-only offers",
          "Priority support when you need it",
        ];

  const eyebrow = active
    ? "GMITRA PLUS"
    : expired
      ? "MEMBERSHIP EXPIRED"
      : "GMITRA PLUS";

  const title = active
    ? `${displayName} is active`
    : expired
      ? highlightPrice
        ? `Renew ${displayName} at just ${highlightPrice}`
        : `Renew ${displayName}`
      : highlightPrice
        ? `Get ${displayName} at just ${highlightPrice}`
        : `Join ${displayName}`;

  const body =
    description?.trim() ||
    (active
      ? expiryCountdown
        ? `${expiryCountdown}. Perks apply automatically on every eligible order.`
        : "Your membership perks apply automatically on every eligible order — no coupon needed."
      : expired
        ? "Renew now to enjoy unlimited free deliveries and other GatiMitra member benefits."
        : `Unlock free deliveries and member-only offers with ${displayName} on GatiMitra.`);

  const primaryLabel = active ? "Got it" : expired ? "Renew now" : "Join now";
  const primarySub =
    active
      ? null
      : ctaSubtitle?.trim() ||
        (highlightPrice ? `Save on every eligible order` : null);

  const handlePrimary = () => {
    if (active) {
      onClose();
      return;
    }
    onClose();
    if (expired && onRenew) {
      onRenew();
      return;
    }
    onBrowseRestaurants?.();
  };

  return (
    <StoreBottomSheetShell visible={visible} onClose={onClose} maxHeightRatio={0.78} flushBottom>
      <View style={styles.body}>
        <AppText style={styles.eyebrow}>{eyebrow}</AppText>

        <View style={[styles.crownWrap, active && styles.crownWrapActive]}>
          <MaterialCommunityIcons
            name="crown"
            size={36}
            color={active || expired ? GOLD_DARK : MINT_DARK}
          />
        </View>

        <AppText style={styles.title}>{title}</AppText>
        <AppText style={styles.subtitle}>{body}</AppText>

        {!active ? (
          <View style={styles.perkPreview}>
            {benefitLines.slice(0, 3).map((benefit) => (
              <View key={benefit} style={styles.perkRow}>
                <Ionicons name={benefitIcon(benefit)} size={16} color={MINT_DARK} />
                <AppText style={styles.perkText} numberOfLines={2}>
                  {benefit}
                </AppText>
              </View>
            ))}
          </View>
        ) : (
          <ScrollView
            style={styles.activeScroll}
            contentContainerStyle={styles.activeScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <AppText style={styles.sectionLabel}>Your benefits</AppText>
            {benefitLines.map((benefit) => (
              <View key={benefit} style={styles.benefitRow}>
                <View style={styles.benefitIconWrap}>
                  <Ionicons name={benefitIcon(benefit)} size={18} color={GOLD_DARK} />
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
          </ScrollView>
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity style={styles.primaryBtn} onPress={handlePrimary} activeOpacity={0.9}>
          <AppText style={styles.primaryBtnText}>{primaryLabel}</AppText>
          {primarySub ? <AppText style={styles.primaryBtnSub}>{primarySub}</AppText> : null}
        </TouchableOpacity>
        {!active ? (
          <TouchableOpacity onPress={onClose} activeOpacity={0.8} style={styles.skipBtn}>
            <AppText style={styles.skipText}>Not now</AppText>
          </TouchableOpacity>
        ) : null}
      </View>
    </StoreBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 8,
    alignItems: "center",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "800",
    color: GOLD_DARK,
    letterSpacing: 2.4,
    textTransform: "uppercase",
    marginBottom: 18,
  },
  crownWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: GOLD_SOFT,
    borderWidth: 2,
    borderColor: "#FDE68A",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  crownWrapActive: {
    backgroundColor: GOLD_SOFT,
    borderColor: GOLD,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: TEXT,
    textAlign: "center",
    letterSpacing: -0.4,
    lineHeight: 30,
    marginBottom: 10,
    paddingHorizontal: 8,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "500",
    color: MUTED,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 18,
    paddingHorizontal: 4,
  },
  perkPreview: {
    width: "100%",
    gap: 10,
    marginBottom: 4,
  },
  perkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F0FDF4",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  perkText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: TEXT,
    lineHeight: 18,
  },
  activeScroll: {
    width: "100%",
    maxHeight: 220,
  },
  activeScrollContent: {
    paddingBottom: 4,
  },
  sectionLabel: {
    alignSelf: "flex-start",
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
    marginBottom: 12,
  },
  benefitIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: GOLD_SOFT,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  benefitText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: TEXT,
    lineHeight: 22,
    paddingTop: 6,
  },
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
  deliveryNoteText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: MINT_DARK,
    lineHeight: 19,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    backgroundColor: "#fff",
  },
  primaryBtn: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: MINT,
    borderRadius: 999,
    paddingVertical: 16,
    paddingHorizontal: 24,
    minHeight: 56,
  },
  primaryBtnText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#fff",
  },
  primaryBtnSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.92)",
  },
  skipBtn: {
    alignItems: "center",
    paddingVertical: 14,
  },
  skipText: {
    fontSize: 14,
    fontWeight: "600",
    color: MUTED,
  },
});
