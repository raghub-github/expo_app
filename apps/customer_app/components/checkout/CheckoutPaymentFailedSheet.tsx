import { View, Pressable, StyleSheet, Modal, ActivityIndicator, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { formatCheckoutSavingsRupees } from "@/lib/checkoutAppliedSavings";
import { GatiMitraColors } from "@/constants/gatimitra";
import { StoreFonts } from "@/constants/storeTypography";
import { useCheckoutPaymentFailureStore } from "@/store/checkoutPaymentFailureStore";
import { useCheckoutSheetStore } from "@/store/checkoutSheetStore";
import { useCartStore } from "@/store/cartStore";

type Props = {
  visible: boolean;
  amountInr: number | null;
  methodLabel: string;
  onRetry: () => void;
  onChooseMethod?: () => void;
  onLeave: () => void;
};

export function CheckoutPaymentFailedSheet({
  visible,
  amountInr,
  methodLabel,
  onRetry,
  onChooseMethod,
  onLeave,
}: Props) {
  const insets = useSafeAreaInsets();
  const hasAmount = amountInr != null && Number.isFinite(amountInr) && amountInr > 0.005;
  const amountText = hasAmount ? `₹${formatCheckoutSavingsRupees(amountInr)}` : null;
  const method = methodLabel.trim() || "UPI / Cards";
  const title = amountText ? `Payment of ${amountText} failed` : "Payment failed";

  return (
    <StoreBottomSheetShell
      visible={visible}
      onClose={onLeave}
      maxHeightRatio={0.78}
      flushBottom
      sheetStyle={styles.sheet}
    >
      <View style={[styles.body, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <View style={styles.illustration}>
          <View style={styles.bill}>
            <Ionicons name="receipt-outline" size={42} color="#6B7280" />
            <View style={styles.rupeeBadge}>
              <AppText style={styles.rupeeText}>₹</AppText>
            </View>
          </View>
          <View style={styles.warnBadge}>
            <Ionicons name="warning" size={18} color="#FFFFFF" />
          </View>
        </View>

        <AppText style={styles.title}>{title}</AppText>
        <AppText style={styles.subtitle}>
          If amount was deducted from {method}, refund will be processed within 5-7 days
        </AppText>

        {/* Explicit spacer — avoids text styles swallowing button margins. */}
        <View style={styles.messageButtonGap} />

        <View style={styles.actions}>
          <Pressable
            onPress={onRetry}
            style={({ pressed }) => [styles.ctaPressable, pressed && styles.ctaPressed]}
            accessibilityRole="button"
            accessibilityLabel="Try payment again"
          >
            <View style={[styles.cta, styles.ctaPrimary]}>
              <Text style={styles.ctaPrimaryText}>Try again</Text>
            </View>
          </Pressable>

          {onChooseMethod ? (
            <Pressable
              onPress={onChooseMethod}
              style={({ pressed }) => [styles.ctaPressable, styles.ctaGap, pressed && styles.ctaPressed]}
              accessibilityRole="button"
              accessibilityLabel="Choose another payment method"
            >
              <View style={[styles.cta, styles.ctaSecondary]}>
                <Text style={styles.ctaSecondaryText} numberOfLines={1}>
                  Choose another payment method
                </Text>
              </View>
            </Pressable>
          ) : null}

          <Pressable
            onPress={onLeave}
            style={({ pressed }) => [styles.leavePressable, pressed && styles.ctaPressed]}
            accessibilityRole="button"
            accessibilityLabel="Back to checkout"
            hitSlop={8}
          >
            <Text style={styles.leaveText}>Back to checkout</Text>
          </Pressable>
        </View>
      </View>
    </StoreBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: "#FFFFFF",
  },
  body: {
    width: "100%",
    paddingHorizontal: 20,
    paddingTop: 18,
    alignItems: "center",
  },
  illustration: {
    width: 88,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  bill: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  rupeeBadge: {
    position: "absolute",
    left: 8,
    bottom: 10,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: GatiMitraColors.emerald,
    alignItems: "center",
    justifyContent: "center",
  },
  rupeeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: StoreFonts.poppinsBold,
  },
  warnBadge: {
    position: "absolute",
    right: 4,
    top: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    width: "100%",
    fontSize: 20,
    lineHeight: 26,
    fontFamily: StoreFonts.loraBold,
    color: "#111827",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    width: "100%",
    fontSize: 13,
    lineHeight: 19,
    fontFamily: StoreFonts.poppinsSemiBold,
    color: "#6B7280",
    textAlign: "center",
    paddingHorizontal: 4,
  },
  messageButtonGap: {
    width: "100%",
    height: 22,
    flexShrink: 0,
  },
  actions: {
    width: "100%",
    alignSelf: "stretch",
  },
  ctaPressable: {
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
  },
  ctaGap: {
    marginTop: 10,
  },
  ctaPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.995 }],
  },
  cta: {
    width: "100%",
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaPrimary: {
    backgroundColor: GatiMitraColors.deepMintStart,
  },
  ctaPrimaryText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
    fontFamily: StoreFonts.poppinsBold,
  },
  ctaSecondary: {
    backgroundColor: "#ECFDF5",
    borderWidth: 1.5,
    borderColor: GatiMitraColors.deepMintStart,
  },
  ctaSecondaryText: {
    color: GatiMitraColors.deepMintStart,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
    fontFamily: StoreFonts.poppinsSemiBold,
  },
  leavePressable: {
    width: "100%",
    marginTop: 14,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  leaveText: {
    color: "#6B7280",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    fontFamily: StoreFonts.poppinsSemiBold,
    textDecorationLine: "none",
  },
});

export function CheckoutPaymentReturnOverlay({ visible }: { visible: boolean }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={overlayStyles.root}>
        <View style={overlayStyles.card}>
          <ActivityIndicator color={GatiMitraColors.emerald} />
          <AppText style={overlayStyles.text}>Confirming payment</AppText>
        </View>
      </View>
    </Modal>
  );
}

const overlayStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  card: {
    backgroundColor: "#1E1E1E",
    borderRadius: 16,
    paddingHorizontal: 28,
    paddingVertical: 22,
    alignItems: "center",
    minWidth: 220,
  },
  text: {
    marginTop: 12,
    fontSize: 15,
    fontFamily: StoreFonts.poppinsSemiBold,
    color: "#FFFFFF",
    textAlign: "center",
  },
});

/** Root overlay — keep outside CheckoutBottomSheetHost to avoid nested Modals on Android. */
export function CheckoutPaymentFailureHost() {
  const router = useRouter();
  const visible = useCheckoutPaymentFailureStore((s) => s.visible);
  const amountInr = useCheckoutPaymentFailureStore((s) => s.amountInr);
  const methodLabel = useCheckoutPaymentFailureStore((s) => s.methodLabel);

  const ensureCheckoutSurface = () => {
    const cartItems = useCartStore.getState().items.length;
    if (cartItems > 0) {
      useCheckoutSheetStore.getState().show();
    } else {
      router.replace("/checkout");
    }
  };

  return (
    <CheckoutPaymentFailedSheet
      visible={visible}
      amountInr={amountInr}
      methodLabel={methodLabel}
      onRetry={() => {
        ensureCheckoutSurface();
        useCheckoutPaymentFailureStore.getState().requestRetry();
      }}
      onChooseMethod={() => {
        ensureCheckoutSurface();
        useCheckoutPaymentFailureStore.getState().requestChooseMethod();
      }}
      onLeave={() => {
        useCheckoutPaymentFailureStore.getState().hide();
        ensureCheckoutSurface();
      }}
    />
  );
}
