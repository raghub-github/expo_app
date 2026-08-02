/**
 * Payment / order confirmation failed.
 *
 * CTAs:
 * - Place Order Now → keep cart, return to checkout to complete the order.
 * - Don't place my order → abandon: clear cart and leave to home.
 * Auto-refund reassurance when money may have been debited.
 */

import { useCallback, useRef } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { AppText } from "@/components/AppText";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { useCartStore } from "@/store/cartStore";
import { HOME_TAB_FALLBACK } from "@/lib/safeRouterBack";

const PAD = 20;
const GREEN = GatiMitraColors.emerald;

export default function PaymentFailureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const clearCart = useCartStore((s) => s.clearCart);
  const cartItemCount = useCartStore((s) => s.items.length);
  const merchantId = useCartStore((s) => s.merchantId);
  const busyRef = useRef(false);

  const placeOrderNow = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    // Cart is preserved on payment failure so checkout can resume with the same items.
    if (cartItemCount > 0) {
      router.replace("/checkout");
      return;
    }
    if (merchantId) {
      router.replace(`/home/merchant/${merchantId}` as never);
      return;
    }
    router.replace(HOME_TAB_FALLBACK);
  }, [cartItemCount, merchantId, router]);

  const dontPlaceOrder = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    // Explicit abandon — clear the cart so they are not nudged back into checkout.
    clearCart();
    router.replace(HOME_TAB_FALLBACK);
  }, [clearCart, router]);

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top + 24,
          paddingBottom: Math.max(insets.bottom, 14),
        },
      ]}
    >
      <View style={styles.content}>
        <View style={styles.statusIcon}>
          <Ionicons name="alert" size={18} color="#FFFFFF" />
        </View>

        <AppText style={styles.eyebrow}>Your payment failed</AppText>
        <AppText style={styles.title}>Don't worry, we won't let you go hungry! 🍔</AppText>

        <View style={styles.reassureCard}>
          <View style={styles.timeline}>
            <View style={styles.timelineDot} />
            <View style={styles.timelineLine} />
            <View style={[styles.timelineDot, styles.timelineDotHollow]} />
          </View>
          <View style={styles.reassureBody}>
            <AppText style={styles.reassureHeading}>Place your order now</AppText>
            <AppText style={styles.reassureText}>
              Pay with UPI, card, or wallet — your cart and address are saved.
            </AppText>
            <AppText style={styles.refundText}>
              Money debited? It will be{" "}
              <AppText style={styles.reassureBold}>auto-refunded within 5–7 business days.</AppText>
              {" "}No action needed from your side.
            </AppText>
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.primary} onPress={placeOrderNow} activeOpacity={0.9}>
          <AppText style={styles.primaryText}>Place Order Now</AppText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancel} onPress={dontPlaceOrder} activeOpacity={0.75}>
          <AppText style={styles.cancelText}>Don't place my order</AppText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: PAD,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 72,
  },
  statusIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#D99420",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  eyebrow: {
    fontSize: 12,
    color: "#8B8B8B",
    textAlign: "center",
    marginBottom: 6,
  },
  title: {
    maxWidth: 300,
    fontSize: 21,
    lineHeight: 28,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
    textAlign: "center",
    marginBottom: 34,
  },
  reassureCard: {
    width: "100%",
    maxWidth: 330,
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 15,
    borderWidth: 1,
    borderColor: "#E7E7E7",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  timeline: {
    width: 28,
    alignItems: "center",
    marginRight: 10,
  },
  timelineDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: GREEN,
    marginTop: 3,
  },
  timelineDotHollow: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#C4C4C4",
    marginTop: 0,
    marginBottom: 2,
  },
  timelineLine: {
    width: 1.5,
    flex: 1,
    minHeight: 36,
    backgroundColor: "#D0D0D0",
    marginVertical: 4,
  },
  reassureBody: { flex: 1 },
  reassureHeading: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
    marginBottom: 7,
  },
  reassureText: {
    fontSize: 12,
    color: GatiMitraColors.textSecondary,
    lineHeight: 17,
    marginBottom: 12,
  },
  refundText: {
    fontSize: 12,
    color: "#167A59",
    lineHeight: 17,
  },
  reassureBold: { fontWeight: "800", color: "#167A59" },
  actions: {
    width: "100%",
  },
  primary: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: GREEN,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 2,
  },
  primaryText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  cancel: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraColors.textPrimary,
    textAlign: "center",
  },
});
