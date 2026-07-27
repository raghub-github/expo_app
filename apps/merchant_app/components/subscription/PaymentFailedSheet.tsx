/**
 * Payment failed bottom sheet — Zomato/Swiggy-style layout, GatiMitra brand colors (no red CTAs).
 */
import { AppText as Text } from "@/components/AppText";
import { Pressable, StyleSheet, View, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Modal } from "react-native";
import { GatiMitraMerchant } from "@/constants/theme";

const LORA = "Lora_400Regular";
const LORA_BOLD = "Lora_700Bold";
const POPPINS_BOLD = "Poppins_700Bold";

export type PaymentFailedSheetProps = {
  visible: boolean;
  /** Amount in rupees (display). */
  amountRupees: number;
  /**
   * Human label for where money may have been deducted from —
   * e.g. "PhonePe UPI", "your store wallet", "Razorpay".
   */
  paymentSourceLabel: string;
  onClose: () => void;
  onRetry: () => void;
  onTryAnotherMethod: () => void;
};

function formatInr(rupees: number): string {
  const n = Number(rupees ?? 0);
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** Brand amber badge — not red (per product request). */
function ReceiptFailedIcon() {
  return (
    <View style={styles.iconStage}>
      <View style={styles.receiptCard}>
        <View style={styles.receiptLine} />
        <View style={[styles.receiptLine, { width: "70%" }]} />
        <View style={[styles.receiptLine, { width: "55%" }]} />
        <View style={styles.receiptDash} />
      </View>
      <View style={styles.warnBadge}>
        <Ionicons name="alert" size={14} color="#FFFFFF" />
      </View>
    </View>
  );
}

export function PaymentFailedSheet({
  visible,
  amountRupees,
  paymentSourceLabel,
  onClose,
  onRetry,
  onTryAnotherMethod,
}: PaymentFailedSheetProps) {
  const insets = useSafeAreaInsets();
  const source = (paymentSourceLabel || "your payment method").trim();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.dismissArea} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheetWrap}>
          <Pressable
            onPress={onClose}
            style={styles.closeFab}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </Pressable>

          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <ReceiptFailedIcon />

            <Text style={styles.title}>Payment of {formatInr(amountRupees)} failed</Text>
            <Text style={styles.body}>
              If amount was deducted from {source}, refund will be processed within 2 hours
            </Text>

            <Pressable
              onPress={onRetry}
              style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Retry payment"
            >
              <Text style={styles.retryText}>Retry payment</Text>
            </Pressable>

            <Pressable
              onPress={onTryAnotherMethod}
              style={({ pressed }) => [styles.altBtn, pressed && styles.pressed]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Try another payment method"
            >
              <Text style={styles.altText}>Try another payment method</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Map wallet / Razorpay error → customer-facing source label. */
export function resolvePaymentSourceLabel(args: {
  method: "wallet" | "razorpay";
  error?: unknown;
}): string {
  if (args.method === "wallet") return "your store wallet";

  const err = args.error as {
    description?: string;
    message?: string;
    source?: string;
    metadata?: { payment_method?: string; method?: string };
    error?: {
      description?: string;
      source?: string;
      metadata?: { payment_method?: string; method?: string };
    };
  } | null;

  const raw = [
    err?.description,
    err?.message,
    err?.error?.description,
    err?.metadata?.payment_method,
    err?.metadata?.method,
    err?.error?.metadata?.payment_method,
    err?.source,
    err?.error?.source,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (raw.includes("phonepe")) return "PhonePe UPI";
  if (raw.includes("google pay") || raw.includes("gpay") || raw.includes("tez")) return "Google Pay UPI";
  if (raw.includes("paytm")) return "Paytm UPI";
  if (raw.includes("bhim")) return "BHIM UPI";
  if (raw.includes("upi")) return "UPI";
  if (raw.includes("card") || raw.includes("visa") || raw.includes("mastercard") || raw.includes("rupay")) {
    return "your card";
  }
  if (raw.includes("netbanking") || raw.includes("net banking") || raw.includes("bank")) {
    return "net banking";
  }
  if (raw.includes("wallet")) return "your wallet";
  return "Razorpay";
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "flex-end",
  },
  dismissArea: { flex: 1 },
  sheetWrap: { width: "100%" },
  closeFab: {
    alignSelf: "center",
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: GatiMitraMerchant.navy,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 28,
    alignItems: "center",
  },
  iconStage: {
    width: 88,
    height: 88,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  receiptCard: {
    width: 64,
    height: 72,
    borderRadius: 10,
    backgroundColor: "#ECFDF5",
    borderWidth: 2,
    borderColor: GatiMitraMerchant.primary,
    paddingHorizontal: 12,
    paddingTop: 14,
    gap: 6,
  },
  receiptLine: {
    height: 4,
    width: "100%",
    borderRadius: 2,
    backgroundColor: "#A7F3D0",
  },
  receiptDash: {
    marginTop: 8,
    height: 2,
    width: "40%",
    borderRadius: 1,
    backgroundColor: GatiMitraMerchant.primaryLight,
    alignSelf: "center",
  },
  warnBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: GatiMitraMerchant.navy,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  title: {
    fontSize: 20,
    fontFamily: LORA_BOLD,
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
    marginBottom: 10,
  },
  body: {
    fontSize: 14,
    fontFamily: LORA,
    lineHeight: 21,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  retryBtn: {
    alignSelf: "stretch",
    backgroundColor: GatiMitraMerchant.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 14,
  },
  retryText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: POPPINS_BOLD,
  },
  altBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  altText: {
    color: GatiMitraMerchant.primaryDark,
    fontSize: 15,
    fontFamily: LORA_BOLD,
    textAlign: "center",
  },
  pressed: { opacity: 0.88 },
});
