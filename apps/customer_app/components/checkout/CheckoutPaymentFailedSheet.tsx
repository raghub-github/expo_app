import { View, Pressable, StyleSheet, Modal, ActivityIndicator } from "react-native";
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
  const amountText =
    amountInr != null && amountInr > 0 ? `₹${formatCheckoutSavingsRupees(amountInr)}` : "your payment";
  const method = methodLabel.trim() || "UPI";

  return (
    <StoreBottomSheetShell
      visible={visible}
      onClose={onLeave}
      maxHeightRatio={0.62}
      flushBottom
      sheetStyle={styles.sheet}
    >
      <View style={styles.body}>
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

        <AppText style={styles.title}>Payment of {amountText} failed</AppText>
        <AppText style={styles.subtitle}>
          If amount was deducted from {method} UPI, refund will be processed within 2 hours
        </AppText>

        <Pressable onPress={onRetry} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          <AppText style={styles.primaryText}>Try again</AppText>
        </Pressable>
        {onChooseMethod ? (
          <Pressable onPress={onChooseMethod} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
            <AppText style={styles.secondaryText}>Choose another payment method</AppText>
          </Pressable>
        ) : null}
        <Pressable onPress={onLeave} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
          <AppText style={styles.secondaryText}>Leave — back to checkout</AppText>
        </Pressable>
      </View>
    </StoreBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: "#FFFFFF",
  },
  body: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 10,
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
    fontSize: 20,
    lineHeight: 26,
    fontFamily: StoreFonts.loraBold,
    color: "#111827",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: StoreFonts.poppinsSemiBold,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 22,
    paddingHorizontal: 8,
  },
  primary: {
    width: "100%",
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: GatiMitraColors.emerald,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: StoreFonts.poppinsBold,
  },
  secondary: {
    width: "100%",
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  secondaryText: {
    color: GatiMitraColors.emerald,
    fontSize: 15,
    fontFamily: StoreFonts.poppinsSemiBold,
  },
  pressed: { opacity: 0.82 },
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
