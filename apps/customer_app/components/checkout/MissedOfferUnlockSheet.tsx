/**
 * Bottom sheet — unlock a missed offer via GatiCash wallet or add more items.
 */

import { View, Modal, Pressable, StyleSheet, Platform } from "react-native";
import { CheckoutText } from "@/components/checkout/CheckoutText";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { MissedOfferWalletCompensation } from "@/lib/checkout-missed-offer-wallet";

const BRAND = GatiMitraColors.splashMint;
const BRAND_DARK = "#0F766E";

type Props = {
  visible: boolean;
  offer: MissedOfferWalletCompensation | null;
  bottomInset: number;
  /** User selected wallet credit for this checkout (not credited until order placed). */
  pending?: boolean;
  onClose: () => void;
  onAddToWallet: () => void;
  onRemoveFromWallet: () => void;
  onAddMoreItems: () => void;
};

function formatInr(value: number): string {
  return value % 1 === 0 ? String(Math.round(value)) : value.toFixed(2);
}

export function MissedOfferUnlockSheet({
  visible,
  offer,
  bottomInset,
  pending = false,
  onClose,
  onAddToWallet,
  onRemoveFromWallet,
  onAddMoreItems,
}: Props) {
  if (!offer) return null;

  const isFreeDelivery =
    offer.offerKind.toUpperCase() === "FREE_DELIVERY" ||
    /free delivery/i.test(offer.offerTitle);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={styles.root}>
        <Pressable style={styles.dim} onPress={onClose} accessibilityRole="button" />

        <View style={styles.anchor}>
          <Pressable
            style={styles.floatingClose}
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </Pressable>

          <Animated.View
            entering={FadeInDown.duration(260)}
            style={[styles.sheetOuter, { paddingBottom: Math.max(bottomInset, 16) + 8 }]}
          >
            <LinearGradient
              colors={["#E0F2FE", "#F0FDFA", "#FFFFFF"]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.sheetGradient}
            >
              <View style={styles.handle} />

              {offer.addItemsHint && !pending ? (
                <CheckoutText style={styles.hintTop}>{offer.addItemsHint}</CheckoutText>
              ) : null}

              <View style={styles.heroRow}>
                <View style={styles.heroIconWrap}>
                  {isFreeDelivery ? (
                    <MaterialCommunityIcons name="motorbike" size={26} color={BRAND_DARK} />
                  ) : (
                    <CheckoutText style={styles.heroPct}>%</CheckoutText>
                  )}
                </View>
                <View style={styles.heroTextCol}>
                  <CheckoutText style={styles.heroTitle}>{offer.offerTitle}</CheckoutText>
                  <CheckoutText style={styles.savingsLine}>
                    Add ₹{formatInr(offer.amountInr)} · save ₹{formatInr(offer.offerSavingsInr)} on this order
                  </CheckoutText>
                </View>
              </View>

              <CheckoutText style={styles.prompt}>
                {pending
                  ? "Offer unlocked on this order"
                  : "Choose how you want to unlock this offer"}
              </CheckoutText>
            </LinearGradient>

            <View style={styles.optionsBlock}>
              <Pressable
                style={[styles.optionHit, styles.optionPrimary, pending && styles.optionSelected]}
                onPress={pending ? onRemoveFromWallet : onAddToWallet}
              >
                <View style={styles.optionRow}>
                <View style={styles.optionIconWrap}>
                  <MaterialCommunityIcons name="wallet-plus-outline" size={22} color={BRAND_DARK} />
                </View>
                <View style={styles.optionTextCol}>
                  <CheckoutText style={styles.optionTitle}>Add money to GatiCash wallet</CheckoutText>
                  <CheckoutText style={styles.optionSub}>
                    {pending
                      ? `−₹${formatInr(offer.offerSavingsInr)} on this bill · ₹${formatInr(offer.amountInr)} to wallet after order`
                      : `Add ₹${formatInr(offer.amountInr)} to GatiCash · save ₹${formatInr(offer.offerSavingsInr)} on this order`}
                  </CheckoutText>
                </View>
                {pending ? (
                  <CheckoutText style={styles.removeLink}>Remove</CheckoutText>
                ) : (
                  <Ionicons name="chevron-forward" size={20} color={BRAND} />
                )}
                </View>
              </Pressable>

              <Pressable style={styles.optionHit} onPress={onAddMoreItems}>
                <View style={styles.optionRow}>
                <View style={[styles.optionIconWrap, styles.optionIconWrapMuted]}>
                  <MaterialCommunityIcons name="cart-plus" size={22} color="#334155" />
                </View>
                <View style={styles.optionTextCol}>
                  <CheckoutText style={styles.optionTitle}>Add more items</CheckoutText>
                  <CheckoutText style={styles.optionSub}>
                    Go back to the menu and add items to unlock {offer.offerTitle}
                  </CheckoutText>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
                </View>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15, 23, 42, 0.52)" },
  anchor: {
    width: "100%",
    alignItems: "center",
  },
  floatingClose: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    ...(Platform.OS === "android"
      ? { elevation: 8 }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.22,
          shadowRadius: 8,
        }),
  },
  sheetOuter: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  sheetGradient: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 14,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    marginBottom: 14,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  heroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#BAE6FD",
    alignItems: "center",
    justifyContent: "center",
  },
  heroPct: { fontSize: 24, fontWeight: "900", color: "#2563EB" },
  heroTextCol: { flex: 1, minWidth: 0, gap: 8 },
  heroTitle: { fontSize: 18, fontWeight: "800", color: "#0F172A", letterSpacing: -0.2 },
  savingsLine: {
    fontSize: 13,
    fontWeight: "600",
    color: BRAND_DARK,
    lineHeight: 18,
  },
  hintTop: {
    fontSize: 13,
    fontWeight: "600",
    color: "#DC2626",
    marginBottom: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  prompt: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
    marginTop: 14,
    textAlign: "center",
  },
  optionsBlock: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
    gap: 10,
  },
  optionHit: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  optionPrimary: {
    borderColor: "#99F6E4",
    backgroundColor: "#F0FDFA",
  },
  optionSelected: {
    borderColor: BRAND,
    borderWidth: 1.5,
  },
  optionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  optionIconWrapMuted: {
    backgroundColor: "#F1F5F9",
  },
  removeLink: {
    fontSize: 13,
    fontWeight: "700",
    color: "#DC2626",
    flexShrink: 0,
  },
  optionTextCol: { flex: 1, minWidth: 0 },
  optionTitle: { fontSize: 15, fontWeight: "700", color: "#0F172A", lineHeight: 20 },
  optionSub: { fontSize: 12, color: "#64748B", marginTop: 3, lineHeight: 16 },
});
